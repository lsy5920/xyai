import type { ImageEditRequestBody, ImageGenerateRequestBody } from "@/lib/server-schemas";
import {
  buildJsonHeaders,
  buildProxyUrl,
  createApiError,
  dataUrlToFile,
  jsonError,
  readUpstreamError,
  trimDetail,
} from "@/lib/proxy-utils";

// 图片结果，用途：统一不同中转站返回的图片格式；入参含义：无；返回值含义：前端可展示的图片。
export type ImageResult = {
  // 图片编号，用途：前端列表渲染。
  id: string;
  // 图片地址，用途：可能是远程地址或数据地址。
  url: string;
  // 修订提示词，用途：部分接口会返回模型改写后的提示词。
  revisedPrompt?: string;
};

// 读取图片结果，用途：把上游图片响应统一成前端格式；入参含义：上游返回对象；返回值含义：图片结果数组。
export function extractImageResults(source: unknown): ImageResult[] {
  // 先确认上游返回的是对象，避免读取属性时报错。
  if (!source || typeof source !== "object") {
    return [];
  }

  // 图片接口通常把结果放在 data 数组里。
  const data = (source as Record<string, unknown>).data;
  if (!Array.isArray(data)) {
    return [];
  }

  // 逐条转换图片，兼容 url 和 b64_json 两种格式。
  return data
    .map((item, index): ImageResult | null => {
      // 非对象条目直接忽略。
      if (!item || typeof item !== "object") {
        return null;
      }

      // 读取远程图片地址。
      const record = item as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url : "";
      // 读取 base64 图片内容。
      const b64Json = typeof record.b64_json === "string" ? record.b64_json : "";
      // 读取模型修订后的提示词。
      const revisedPrompt = typeof record.revised_prompt === "string" ? record.revised_prompt : undefined;

      // 优先使用远程地址，没有远程地址时转换成数据地址。
      const finalUrl = url || (b64Json ? `data:image/png;base64,${b64Json}` : "");

      // 没有图片内容就忽略。
      if (!finalUrl) {
        return null;
      }

      // 图片对象先只放必填字段，避免可选字段被当成必填字段。
      const image: ImageResult = {
        id: `image-${index}-${Date.now()}`,
        url: finalUrl,
      };
      // 有修订提示词时再补充。
      if (revisedPrompt) {
        image.revisedPrompt = revisedPrompt;
      }

      return image;
    })
    .filter((item): item is ImageResult => item !== null);
}

// 调用图片生成，用途：把图片生成请求转发给中转站；入参含义：请求数据、根地址、密钥；返回值含义：图片结果或中文错误响应。
export async function generateImage(payload: ImageGenerateRequestBody, baseUrl: string, apiKey: string): Promise<Response> {
  // 图片生成接口路径。
  const path = "/images/generations";

  try {
    // 向中转站发送图片生成请求。
    const upstreamResponse = await fetch(buildProxyUrl(baseUrl, path), {
      method: "POST",
      headers: buildJsonHeaders(apiKey),
      body: JSON.stringify({
        model: payload.model,
        prompt: payload.prompt,
        size: payload.size,
        quality: payload.quality,
        n: 1,
      }),
    });

    // 上游失败时返回中文提示。
    if (!upstreamResponse.ok) {
      const detail = await readUpstreamError(upstreamResponse);
      return jsonError(
        createApiError({
          message: "图片生成失败",
          suggestion: "请确认中转站是否支持图片生成接口和当前图片模型。",
          path,
          detail,
          retryable: upstreamResponse.status >= 500,
        }),
        upstreamResponse.status,
      );
    }

    // 解析上游图片响应。
    const data = (await upstreamResponse.json()) as unknown;
    const images = extractImageResults(data);

    // 没有解析到图片时给出明确提示。
    if (!images.length) {
      return jsonError(
        createApiError({
          message: "中转站没有返回可显示的图片",
          suggestion: "请换一个图片模型，或查看中转站是否修改了图片接口返回格式。",
          path,
        }),
        502,
      );
    }

    return Response.json({
      ok: true,
      images,
    });
  } catch (error) {
    // 网络异常通常是中转站不可达或请求超时。
    const message = error instanceof Error ? error.message : "未知网络错误";
    return jsonError(
      createApiError({
        message: "无法连接图片生成接口",
        suggestion: "请检查中转站地址和网络状态后再试。",
        path,
        detail: trimDetail(message),
        retryable: true,
      }),
      502,
    );
  }
}

// 调用图片编辑，用途：把图片和提示词转发给中转站编辑接口；入参含义：请求数据、根地址、密钥；返回值含义：图片结果或中文错误响应。
export async function editImage(payload: ImageEditRequestBody, baseUrl: string, apiKey: string): Promise<Response> {
  // 图片编辑接口路径。
  const path = "/images/edits";
  // 把前端数据地址还原成可上传文件。
  const fileResult = dataUrlToFile(payload.image.dataUrl, payload.image.name || "image.png");

  // 图片转换失败时直接返回错误。
  if (!fileResult.ok) {
    return jsonError(fileResult.error, 400);
  }

  try {
    // 表单用于上传图片文件和文字参数。
    const formData = new FormData();
    formData.append("model", payload.model);
    formData.append("prompt", payload.prompt);
    formData.append("size", payload.size);
    formData.append("quality", payload.quality);
    formData.append("image", fileResult.data);

    // 表单请求不能手动设置内容类型，运行时会自动生成边界。
    const upstreamResponse = await fetch(buildProxyUrl(baseUrl, path), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    // 上游失败时返回中文提示。
    if (!upstreamResponse.ok) {
      const detail = await readUpstreamError(upstreamResponse);
      return jsonError(
        createApiError({
          message: "图片编辑失败",
          suggestion: "请确认中转站是否支持图片编辑接口、当前图片模型和上传图片格式。",
          path,
          detail,
          retryable: upstreamResponse.status >= 500,
        }),
        upstreamResponse.status,
      );
    }

    // 解析上游图片响应。
    const data = (await upstreamResponse.json()) as unknown;
    const images = extractImageResults(data);

    // 没有图片时返回清楚的错误。
    if (!images.length) {
      return jsonError(
        createApiError({
          message: "中转站没有返回编辑后的图片",
          suggestion: "请换一个图片模型，或查看中转站是否支持返回图片地址或 base64 图片。",
          path,
        }),
        502,
      );
    }

    return Response.json({
      ok: true,
      images,
    });
  } catch (error) {
    // 网络异常通常是上传过程失败或中转站不可达。
    const message = error instanceof Error ? error.message : "未知网络错误";
    return jsonError(
      createApiError({
        message: "无法连接图片编辑接口",
        suggestion: "请检查中转站地址、网络状态和图片大小后再试。",
        path,
        detail: trimDetail(message),
        retryable: true,
      }),
      502,
    );
  }
}
