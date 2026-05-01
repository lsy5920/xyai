import { Buffer } from "node:buffer";
import type { ApiErrorPayload, ServiceResult } from "@/lib/types";

// 默认建议，用途：当没有更具体建议时展示；入参含义：无；返回值含义：中文建议文本。
const DEFAULT_SUGGESTION = "请检查中转站地址、密钥、模型名称和当前中转站支持的接口。";

// 创建错误，用途：统一生成后端中文错误；入参含义：错误字段；返回值含义：可直接返回给前端的错误对象。
export function createApiError(params: {
  message: string;
  suggestion?: string;
  path?: string;
  detail?: string;
  retryable?: boolean;
}): ApiErrorPayload {
  // 返回标准错误结构，避免每个接口自己拼不同格式。
  return {
    message: params.message,
    suggestion: params.suggestion ?? DEFAULT_SUGGESTION,
    path: params.path,
    detail: params.detail,
    retryable: params.retryable ?? false,
  };
}

// 返回错误响应，用途：把中文错误转换成接口响应；入参含义：错误对象和状态码；返回值含义：网页可读取的响应。
export function jsonError(error: ApiErrorPayload, status = 400): Response {
  // 使用固定响应格式，前端能稳定读取 message 和 suggestion。
  return Response.json(
    {
      ok: false,
      error,
    },
    { status },
  );
}

// 规范化中转站地址，用途：把用户输入整理成可请求的根地址；入参含义：用户输入的地址；返回值含义：成功时返回去掉 /v1 的地址。
export function normalizeBaseUrl(rawBaseUrl: unknown): ServiceResult<string> {
  // 先判断类型，避免空值或对象传进来导致程序报错。
  if (typeof rawBaseUrl !== "string") {
    return {
      ok: false,
      error: createApiError({
        message: "中转站地址格式不正确",
        suggestion: "请填写完整的中转站地址，例如：https://你的中转站域名",
      }),
    };
  }

  // 清理首尾空格和多余斜杠，兼容用户复制来的地址。
  const trimmedUrl = rawBaseUrl.trim().replace(/\/+$/, "");

  // 空地址无法请求，直接返回可读错误。
  if (!trimmedUrl) {
    return {
      ok: false,
      error: createApiError({
        message: "请先填写中转站地址",
        suggestion: "在顶部配置区填写中转站地址后再加载模型或发送消息。",
      }),
    };
  }

  // 地址必须包含协议，否则浏览器和服务端都无法可靠请求。
  if (!/^https?:\/\//i.test(trimmedUrl)) {
    return {
      ok: false,
      error: createApiError({
        message: "中转站地址需要带上 http 或 https",
        suggestion: "请把地址改成类似 https://example.com 的形式。",
      }),
    };
  }

  try {
    // 用标准地址解析器验证格式，避免把非法地址传给 fetch。
    const parsedUrl = new URL(trimmedUrl);
    // 如果用户填了 /v1，就去掉它，后续接口会统一补上 /v1。
    const cleanPath = parsedUrl.pathname.replace(/\/v1\/?$/i, "").replace(/\/+$/, "");
    parsedUrl.pathname = cleanPath || "";
    parsedUrl.search = "";
    parsedUrl.hash = "";
    return {
      ok: true,
      data: parsedUrl.toString().replace(/\/+$/, ""),
    };
  } catch {
    // 解析失败通常是地址里有非法字符。
    return {
      ok: false,
      error: createApiError({
        message: "中转站地址无法识别",
        suggestion: "请重新复制中转站提供的接口地址，并确认没有多余空格。",
      }),
    };
  }
}

// 校验密钥，用途：确保调用中转站前已经填写密钥；入参含义：用户输入的密钥；返回值含义：成功时返回清理后的密钥。
export function normalizeApiKey(rawApiKey: unknown): ServiceResult<string> {
  // 密钥必须是字符串，避免异常数据进入请求头。
  if (typeof rawApiKey !== "string") {
    return {
      ok: false,
      error: createApiError({
        message: "密钥格式不正确",
        suggestion: "请粘贴中转站提供的密钥字符串。",
      }),
    };
  }

  // 清理首尾空格，避免复制时带来的换行导致鉴权失败。
  const trimmedKey = rawApiKey.trim();

  // 空密钥不能调用接口，提前提示用户。
  if (!trimmedKey) {
    return {
      ok: false,
      error: createApiError({
        message: "请先填写中转站密钥",
        suggestion: "在顶部配置区填写 key 后再加载模型或发送消息。",
      }),
    };
  }

  return {
    ok: true,
    data: trimmedKey,
  };
}

// 拼接接口地址，用途：把中转站根地址和接口路径合成完整地址；入参含义：根地址和接口路径；返回值含义：完整请求地址。
export function buildProxyUrl(baseUrl: string, path: string): string {
  // 统一补上 /v1，避免页面和每个接口重复处理。
  return `${baseUrl}/v1${path.startsWith("/") ? path : `/${path}`}`;
}

// 生成鉴权请求头，用途：给中转站请求添加必要头信息；入参含义：密钥；返回值含义：可直接传给 fetch 的请求头。
export function buildJsonHeaders(apiKey: string): HeadersInit {
  // 不记录密钥，只把它放到本次请求头中。
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// 截断错误细节，用途：避免把很长的上游报错完整塞给前端；入参含义：任意错误文本；返回值含义：较短的可读文本。
export function trimDetail(detail: string): string {
  // 只保留前面一段，既能排查问题，又不会让页面被长报错撑开。
  return detail.replace(/\s+/g, " ").trim().slice(0, 500);
}

// 读取上游错误，用途：从中转站响应里提取可读报错；入参含义：中转站响应；返回值含义：简短错误文本。
export async function readUpstreamError(response: Response): Promise<string> {
  try {
    // 优先按文本读取，兼容不同中转站返回的错误格式。
    const text = await response.text();
    // 空响应也要给出状态码，方便用户排查。
    return trimDetail(text || `状态码：${response.status}`);
  } catch {
    // 读取失败通常是网络连接中断，这里返回状态码兜底。
    return `状态码：${response.status}`;
  }
}

// 数据地址转文件，用途：把浏览器传来的图片还原成接口可上传的文件；入参含义：图片数据地址和文件名；返回值含义：成功时返回文件对象。
export function dataUrlToFile(dataUrl: string, fileName: string): ServiceResult<File> {
  // 使用正则拆出图片类型和图片内容。
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);

  // 格式不匹配说明前端传来的不是标准图片数据。
  if (!match) {
    return {
      ok: false,
      error: createApiError({
        message: "图片数据格式不正确",
        suggestion: "请重新上传图片后再试。",
      }),
    };
  }

  try {
    // 把 base64 内容转成二进制数据，供表单上传使用。
    const mimeType = match[1] ?? "image/png";
    const buffer = Buffer.from(match[2] ?? "", "base64");
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    return {
      ok: true,
      data: new File([blob], fileName, { type: mimeType }),
    };
  } catch {
    // 转换失败通常是图片数据被截断或损坏。
    return {
      ok: false,
      error: createApiError({
        message: "图片数据无法读取",
        suggestion: "请换一张图片，或重新上传原图后再试。",
      }),
    };
  }
}

// 安全读取字符串，用途：从未知对象里读取字符串字段；入参含义：对象、字段名、默认值；返回值含义：字符串结果。
export function readStringField(source: unknown, key: string, fallback = ""): string {
  // 先确认来源是对象，避免读取属性时报错。
  if (!source || typeof source !== "object") {
    return fallback;
  }

  // 读取字段后再判断类型，确保只返回字符串。
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : fallback;
}
