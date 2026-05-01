import { editImage } from "@/lib/image-adapter";
import { createApiError, jsonError, normalizeApiKey, normalizeBaseUrl } from "@/lib/proxy-utils";
import { imageEditRequestSchema } from "@/lib/server-schemas";

// 运行环境配置，用途：让图片编辑接口在服务端运行；入参含义：无；返回值含义：框架读取的运行环境。
export const runtime = "nodejs";

// 动态配置，用途：每次图片编辑都实时调用中转站；入参含义：无；返回值含义：框架读取的缓存策略。
export const dynamic = "force-dynamic";

// 最大运行时间，用途：给图片编辑留出时间；入参含义：无；返回值含义：部署平台读取的秒数。
export const maxDuration = 60;

// 读取请求体，用途：安全解析图片编辑请求；入参含义：请求对象；返回值含义：请求体或空对象。
async function readRequestBody(request: Request): Promise<unknown> {
  try {
    // 正常读取 JSON。
    return await request.json();
  } catch {
    // 解析失败时交给校验层处理。
    return {};
  }
}

// 处理图片编辑请求，用途：把图片和提示词转发给中转站；入参含义：前端请求；返回值含义：编辑后的图片或中文错误。
export async function POST(request: Request): Promise<Response> {
  // 校验请求体。
  const parsedBody = imageEditRequestSchema.safeParse(await readRequestBody(request));
  if (!parsedBody.success) {
    return jsonError(
      createApiError({
        message: "图片编辑请求格式不正确",
        suggestion: "请确认已经上传图片、填写提示词并选择图片模型。",
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

  // 调用图片编辑适配器。
  return editImage(parsedBody.data, baseUrlResult.data, apiKeyResult.data);
}
