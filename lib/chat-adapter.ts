import type { ChatRequestBody } from "@/lib/server-schemas";
import {
  buildJsonHeaders,
  buildProxyUrl,
  createApiError,
  jsonError,
  readUpstreamError,
  trimDetail,
} from "@/lib/proxy-utils";

// 流式事件模式，用途：区分响应接口和聊天接口的返回格式；入参含义：无；返回值含义：解析流时使用的模式。
type StreamMode = "responses" | "chat";

// 构建响应接口内容块，用途：把本地消息转成响应接口能理解的格式；入参含义：一条消息；返回值含义：接口内容数组。
function buildResponsesContent(message: ChatRequestBody["messages"][number]): unknown[] {
  // 内容数组会同时放文字和图片。
  const content: unknown[] = [];

  // 用户消息使用输入文本，模型消息使用输出文本。
  const textType = message.role === "assistant" ? "output_text" : "input_text";

  // 有文字时才放入文本块，避免空字符串影响部分中转站。
  if (message.content.trim()) {
    content.push({
      type: textType,
      text: message.content,
    });
  }

  // 只有用户消息才带图片，模型历史图片不会传给接口。
  if (message.role === "user") {
    for (const image of message.images ?? []) {
      // 响应接口用 input_image 表示图片输入。
      content.push({
        type: "input_image",
        image_url: image.dataUrl,
      });
    }
  }

  return content;
}

// 构建响应接口请求体，用途：优先调用新式多模态接口；入参含义：聊天请求；返回值含义：可序列化请求体。
function buildResponsesBody(payload: ChatRequestBody): Record<string, unknown> {
  // 把历史消息逐条转换成响应接口格式。
  const input = payload.messages.map((message) => ({
    role: message.role,
    content: buildResponsesContent(message),
  }));

  // 返回请求体，开启流式输出让前端能边生成边展示。
  return {
    model: payload.model,
    instructions: payload.systemPrompt || undefined,
    input,
    temperature: payload.temperature,
    max_output_tokens: payload.maxOutputTokens,
    stream: true,
  };
}

// 构建聊天接口内容，用途：把本地消息转成传统聊天接口格式；入参含义：一条消息；返回值含义：字符串或多模态数组。
function buildChatContent(message: ChatRequestBody["messages"][number]): unknown {
  // 模型消息只需要文本内容。
  if (message.role === "assistant") {
    return message.content;
  }

  // 没有图片时直接返回文本，兼容最老的中转站。
  if (!message.images?.length) {
    return message.content;
  }

  // 有图片时改成多模态内容数组。
  const content: unknown[] = [];

  // 有文字时添加文字块。
  if (message.content.trim()) {
    content.push({
      type: "text",
      text: message.content,
    });
  }

  // 添加图片地址块。
  for (const image of message.images) {
    content.push({
      type: "image_url",
      image_url: {
        url: image.dataUrl,
      },
    });
  }

  return content;
}

// 构建聊天接口请求体，用途：响应接口失败时降级到传统接口；入参含义：聊天请求；返回值含义：可序列化请求体。
function buildChatBody(payload: ChatRequestBody): Record<string, unknown> {
  // 消息数组会先放系统提示词，再放用户和模型历史。
  const messages: unknown[] = [];

  // 只有用户填写系统提示词时才添加系统消息。
  if (payload.systemPrompt.trim()) {
    messages.push({
      role: "system",
      content: payload.systemPrompt,
    });
  }

  // 转换全部会话消息。
  for (const message of payload.messages) {
    messages.push({
      role: message.role,
      content: buildChatContent(message),
    });
  }

  // 返回请求体，开启流式输出。
  return {
    model: payload.model,
    messages,
    temperature: payload.temperature,
    max_tokens: payload.maxOutputTokens,
    stream: true,
  };
}

// 从响应接口事件里取增量文本，用途：把复杂事件变成纯文本；入参含义：事件数据；返回值含义：本次新增文本。
function extractResponsesDelta(data: Record<string, unknown>): string {
  // 正常文本增量在 delta 字段里。
  if (data.type === "response.output_text.delta" && typeof data.delta === "string") {
    return data.delta;
  }

  // 拒绝回答也可能以增量形式返回。
  if (data.type === "response.refusal.delta" && typeof data.delta === "string") {
    return data.delta;
  }

  // 上游主动返回错误时，把错误内容转成可读文本。
  if (data.type === "error") {
    const error = data.error;
    if (error && typeof error === "object") {
      const message = (error as Record<string, unknown>).message;
      return typeof message === "string" ? `\n【接口错误】${message}` : "\n【接口错误】中转站返回错误。";
    }
  }

  return "";
}

// 从聊天接口事件里取增量文本，用途：把传统聊天流转成纯文本；入参含义：事件数据；返回值含义：本次新增文本。
function extractChatDelta(data: Record<string, unknown>): string {
  // 传统聊天接口的增量一般在 choices[0].delta.content。
  const choices = data.choices;
  if (!Array.isArray(choices) || !choices.length) {
    return "";
  }

  // 只读取第一条回复，网页当前只展示一个模型回答。
  const firstChoice = choices[0] as Record<string, unknown>;
  const delta = firstChoice.delta;
  if (!delta || typeof delta !== "object") {
    return "";
  }

  // 取出文本内容。
  const content = (delta as Record<string, unknown>).content;
  return typeof content === "string" ? content : "";
}

// 解析单行流数据，用途：把中转站的一条事件变成文本；入参含义：事件文本和解析模式；返回值含义：本次新增文本。
function parseSseLine(line: string, mode: StreamMode): string {
  // 只处理 data 行，其他事件行直接忽略。
  if (!line.startsWith("data:")) {
    return "";
  }

  // 去掉 data 前缀，得到原始事件内容。
  const rawData = line.slice(5).trim();

  // 完成标记不需要展示。
  if (!rawData || rawData === "[DONE]") {
    return "";
  }

  try {
    // 中转站通常返回一行一个 JSON 事件。
    const data = JSON.parse(rawData) as Record<string, unknown>;
    return mode === "responses" ? extractResponsesDelta(data) : extractChatDelta(data);
  } catch {
    // 少数中转站可能直接返回纯文本，这里保守透传。
    return rawData;
  }
}

// 转换流响应，用途：把上游事件流转成前端最容易读取的纯文本流；入参含义：上游响应和模式；返回值含义：前端可读取的流式响应。
function createTextStreamResponse(response: Response, mode: StreamMode): Response {
  // 编码器把文本重新写成字节流。
  const encoder = new TextEncoder();
  // 解码器把中转站字节流还原成文本。
  const decoder = new TextDecoder();

  // 创建新的可读流，前端读取到的只有模型增量文本。
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 没有响应体时直接结束，避免读空对象报错。
      if (!response.body) {
        controller.close();
        return;
      }

      // 读取器逐块读取中转站返回内容。
      const reader = response.body.getReader();
      // 缓冲区保存尚未凑成完整行的内容。
      let buffer = "";

      try {
        while (true) {
          // 持续读取直到上游结束。
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          // 把新片段加入缓冲区。
          buffer += decoder.decode(value, { stream: true });
          // 按行拆分事件。
          const lines = buffer.split(/\r?\n/);
          // 最后一段可能是不完整行，留到下一次继续拼。
          buffer = lines.pop() ?? "";

          // 逐行解析并写给前端。
          for (const line of lines) {
            const delta = parseSseLine(line, mode);
            if (delta) {
              controller.enqueue(encoder.encode(delta));
            }
          }
        }

        // 处理最后残留的一行。
        const lastDelta = parseSseLine(buffer, mode);
        if (lastDelta) {
          controller.enqueue(encoder.encode(lastDelta));
        }

        // 正常结束流。
        controller.close();
      } catch (error) {
        // 流中断时返回可读错误，避免前端一直等待。
        const message = error instanceof Error ? error.message : "未知流式错误";
        controller.enqueue(encoder.encode(`\n【连接中断】${trimDetail(message)}`));
        controller.close();
      } finally {
        // 释放读取器锁，避免资源占用。
        reader.releaseLock();
      }
    },
  });

  // 返回纯文本流，前端可以直接拼接展示。
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

// 发送聊天请求，用途：优先响应接口，失败后自动降级到传统聊天接口；入参含义：请求数据、根地址、密钥；返回值含义：流式响应或中文错误。
export async function sendChatWithFallback(payload: ChatRequestBody, baseUrl: string, apiKey: string): Promise<Response> {
  // 响应接口地址，用于多模态能力优先尝试。
  const responsesPath = "/responses";
  // 传统聊天接口地址，用于兼容老中转站。
  const chatPath = "/chat/completions";

  try {
    // 先尝试响应接口。
    const responsesResponse = await fetch(buildProxyUrl(baseUrl, responsesPath), {
      method: "POST",
      headers: buildJsonHeaders(apiKey),
      body: JSON.stringify(buildResponsesBody(payload)),
    });

    // 成功时直接把响应接口的流转成纯文本流。
    if (responsesResponse.ok) {
      return createTextStreamResponse(responsesResponse, "responses");
    }

    // 记录第一次失败原因，聊天接口也失败时一起返回给用户。
    const responsesError = await readUpstreamError(responsesResponse);

    // 再尝试传统聊天接口。
    const chatResponse = await fetch(buildProxyUrl(baseUrl, chatPath), {
      method: "POST",
      headers: buildJsonHeaders(apiKey),
      body: JSON.stringify(buildChatBody(payload)),
    });

    // 成功时返回聊天接口流。
    if (chatResponse.ok) {
      return createTextStreamResponse(chatResponse, "chat");
    }

    // 两种接口都失败时返回统一中文错误。
    const chatError = await readUpstreamError(chatResponse);
    return jsonError(
      createApiError({
        message: "问答接口调用失败",
        suggestion: "请确认中转站是否支持当前模型、响应接口或聊天接口，也可以换一个模型再试。",
        path: `${responsesPath}，${chatPath}`,
        detail: `响应接口：${responsesError}；聊天接口：${chatError}`,
        retryable: chatResponse.status >= 500,
      }),
      chatResponse.status,
    );
  } catch (error) {
    // 网络错误通常是地址不可达、证书异常或中转站跨区域网络不稳定。
    const message = error instanceof Error ? error.message : "未知网络错误";
    return jsonError(
      createApiError({
        message: "无法连接到中转站",
        suggestion: "请检查中转站地址是否能在当前网络访问，或稍后重试。",
        detail: trimDetail(message),
        retryable: true,
      }),
      502,
    );
  }
}
