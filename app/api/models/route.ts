import { modelRequestSchema } from "@/lib/server-schemas";
import {
  buildProxyUrl,
  createApiError,
  jsonError,
  normalizeApiKey,
  normalizeBaseUrl,
  readUpstreamError,
  trimDetail,
} from "@/lib/proxy-utils";
import type { ModelItem } from "@/lib/types";

// 运行环境配置，用途：让接口在服务端运行；入参含义：无；返回值含义：框架读取的运行环境。
export const runtime = "nodejs";

// 动态配置，用途：每次都实时读取中转站模型；入参含义：无；返回值含义：框架读取的缓存策略。
export const dynamic = "force-dynamic";

// 最大运行时间，用途：给中转站请求留出等待时间；入参含义：无；返回值含义：部署平台读取的秒数。
export const maxDuration = 60;

// 读取请求体，用途：安全解析前端传来的 JSON；入参含义：请求对象；返回值含义：成功时返回请求体，失败时返回空对象。
async function readRequestBody(request: Request): Promise<unknown> {
  try {
    // 正常读取 JSON 请求体。
    return await request.json();
  } catch {
    // JSON 解析失败时返回空对象，让后续校验给出中文错误。
    return {};
  }
}

// 转换模型列表，用途：把不同中转站模型格式统一起来；入参含义：上游返回对象；返回值含义：模型数组。
function extractModels(source: unknown): ModelItem[] {
  // 确认上游返回对象格式，避免读取时报错。
  if (!source || typeof source !== "object") {
    return [];
  }

  // 大多数兼容接口会把模型放在 data 数组。
  const data = (source as Record<string, unknown>).data;
  if (!Array.isArray(data)) {
    return [];
  }

  // 逐条提取模型编号。
  return data
    .map((item): ModelItem | null => {
      // 非对象或没有 id 的条目跳过。
      if (!item || typeof item !== "object") {
        return null;
      }

      // 读取模型编号和归属。
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      const ownedBy = typeof record.owned_by === "string" ? record.owned_by : undefined;

      // 没有编号就不展示。
      if (!id) {
        return null;
      }

      // 模型对象先只放必填字段，避免可选字段被当成必填字段。
      const model: ModelItem = { id };
      // 有归属信息时再补充。
      if (ownedBy) {
        model.ownedBy = ownedBy;
      }

      return model;
    })
    .filter((item): item is ModelItem => item !== null);
}

// 处理模型列表请求，用途：从中转站读取所有可见模型；入参含义：前端请求；返回值含义：模型列表或中文错误。
export async function POST(request: Request): Promise<Response> {
  // 读取并校验请求体。
  const parsedBody = modelRequestSchema.safeParse(await readRequestBody(request));
  if (!parsedBody.success) {
    return jsonError(
      createApiError({
        message: "读取模型的请求格式不正确",
        suggestion: "请刷新页面后重新填写中转站地址和密钥。",
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

  // 模型列表接口路径。
  const path = "/models";

  try {
    // 向中转站读取模型列表。
    const upstreamResponse = await fetch(buildProxyUrl(baseUrlResult.data, path), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKeyResult.data}`,
      },
    });

    // 上游失败时返回中文错误。
    if (!upstreamResponse.ok) {
      const detail = await readUpstreamError(upstreamResponse);
      return jsonError(
        createApiError({
          message: "模型列表读取失败",
          suggestion: "请检查中转站地址、密钥权限，或确认中转站是否支持模型列表接口。",
          path,
          detail,
          retryable: upstreamResponse.status >= 500,
        }),
        upstreamResponse.status,
      );
    }

    // 解析上游 JSON。
    const data = (await upstreamResponse.json()) as unknown;
    const models = extractModels(data);

    // 没有模型时也返回成功，但给出空数组，让前端允许手动输入模型名。
    return Response.json({
      ok: true,
      models,
    });
  } catch (error) {
    // 网络异常通常是地址不可达或证书失败。
    const message = error instanceof Error ? error.message : "未知网络错误";
    return jsonError(
      createApiError({
        message: "无法连接中转站模型接口",
        suggestion: "请检查中转站地址是否可以访问，或稍后重试。",
        path,
        detail: trimDetail(message),
        retryable: true,
      }),
      502,
    );
  }
}
