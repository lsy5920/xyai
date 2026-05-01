import { generateImage } from "@/lib/image-adapter";
import { createApiError, jsonError, normalizeApiKey, normalizeBaseUrl } from "@/lib/proxy-utils";
import { imageGenerateRequestSchema } from "@/lib/server-schemas";

// 运行环境配置，用途：让图片接口在服务端运行；入参含义：无；返回值含义：框架读取的运行环境。
export const runtime = "nodejs";

// 动态配置，用途：每次图片生成都实时调用中转站；入参含义：无；返回值含义：框架读取的缓存策略。
export const dynamic = "force-dynamic";

// 最大运行时间，用途：给图片生成留出时间；入参含义：无；返回值含义：部署平台读取的秒数。
export const maxDuration = 60;

// 读取请求体，用途：安全解析图片生成请求；入参含义：请求对象；返回值含义：请求体或空对象。
async function readRequestBody(request: Request): Promise<unknown> {
  try {
    // 正常读取 JSON 请求体。
    return await request.json();
  } catch {
    // 解析失败时返回空对象，让校验层返回中文错误。
    return {};
  }
}

// 处理图片生成请求，用途：把提示词转发给中转站图片接口；入参含义：前端请求；返回值含义：图片结果或中文错误。
export async function POST(request: Request): Promise<Response> {
  // 校验请求体。
  const parsedBody = imageGenerateRequestSchema.safeParse(await readRequestBody(request));
  if (!parsedBody.success) {
    return jsonError(
      createApiError({
        message: "图片生成请求格式不正确",
        suggestion: "请确认已经填写图片提示词和图片模型。",
      }),
      400,
    );
  }

  // 清洗中转站地址。
  const baseUrlResult = normalizeBaseUrl(parsedBody.data.baseUrl);
  if (!baseUrlResult.ok) {
    return jsonError(baseUrlResult.error, 400);
  }

  // 清洗中转站密钥。
  const apiKeyResult = normalizeApiKey(parsedBody.data.apiKey);
  if (!apiKeyResult.ok) {
    return jsonError(apiKeyResult.error, 400);
  }

  // 调用图片生成适配器。
  return generateImage(parsedBody.data, baseUrlResult.data, apiKeyResult.data);
}
