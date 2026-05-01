import { sendChatWithFallback } from "@/lib/chat-adapter";
import { createApiError, jsonError, normalizeApiKey, normalizeBaseUrl } from "@/lib/proxy-utils";
import { chatRequestSchema } from "@/lib/server-schemas";

// 运行环境配置，用途：让流式接口在服务端运行；入参含义：无；返回值含义：框架读取的运行环境。
export const runtime = "nodejs";

// 动态配置，用途：每次都实时请求中转站；入参含义：无；返回值含义：框架读取的缓存策略。
export const dynamic = "force-dynamic";

// 最大运行时间，用途：给模型生成留出时间；入参含义：无；返回值含义：部署平台读取的秒数。
export const maxDuration = 60;

// 读取请求体，用途：安全解析聊天请求；入参含义：请求对象；返回值含义：请求体或空对象。
async function readRequestBody(request: Request): Promise<unknown> {
  try {
    // 正常读取 JSON。
    return await request.json();
  } catch {
    // 解析失败时交给校验逻辑生成中文错误。
    return {};
  }
}

// 处理聊天请求，用途：接收前端问答并转发给中转站；入参含义：前端请求；返回值含义：流式文本或中文错误。
export async function POST(request: Request): Promise<Response> {
  // 校验请求体，防止异常数据进入上游接口。
  const parsedBody = chatRequestSchema.safeParse(await readRequestBody(request));
  if (!parsedBody.success) {
    return jsonError(
      createApiError({
        message: "问答请求格式不正确",
        suggestion: "请确认已经选择模型，并至少输入文字或上传图片。",
      }),
      400,
    );
  }

  // 清洗中转站地址。
  const baseUrlResult = normalizeBaseUrl(parsedBody.data.baseUrl);
  if (!baseUrlResult.ok) {
    return jsonError(baseUrlResult.error, 400);
  }

  // 清洗密钥。
  const apiKeyResult = normalizeApiKey(parsedBody.data.apiKey);
  if (!apiKeyResult.ok) {
    return jsonError(apiKeyResult.error, 400);
  }

  // 发送问答请求，内部会自动从响应接口降级到传统聊天接口。
  return sendChatWithFallback(parsedBody.data, baseUrlResult.data, apiKeyResult.data);
}
