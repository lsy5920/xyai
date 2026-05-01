import { z } from "zod";

// 图片校验规则，用途：校验前端传来的图片附件；入参含义：未知请求体；返回值含义：合法图片数据。
export const chatImageSchema = z.object({
  // 图片编号用于前端追踪，后端只做格式保留。
  id: z.string().min(1),
  // 图片名称用于错误排查和图片编辑上传。
  name: z.string().min(1),
  // 图片数据必须是浏览器可显示的数据地址。
  dataUrl: z.string().min(1),
  // 图片类型用于还原上传文件。
  mimeType: z.string().min(1),
});

// 消息校验规则，用途：校验聊天历史；入参含义：未知请求体；返回值含义：合法消息数据。
export const chatMessageSchema = z.object({
  // 角色只允许用户和模型两种，避免无效角色传给接口。
  role: z.enum(["user", "assistant"]),
  // 正文允许为空，因为用户可能只上传图片提问。
  content: z.string().max(50000),
  // 图片只允许出现在用户消息里，实际转换时会自动忽略模型图片。
  images: z.array(chatImageSchema).optional(),
});

// 聊天请求校验规则，用途：校验问答接口请求；入参含义：未知请求体；返回值含义：可安全调用中转站的数据。
export const chatRequestSchema = z.object({
  // 中转站地址由服务端继续清洗。
  baseUrl: z.string(),
  // 密钥由服务端继续清洗。
  apiKey: z.string(),
  // 模型名称必须存在，调用中转站时会原样传递。
  model: z.string().min(1),
  // 系统提示词可以为空。
  systemPrompt: z.string().max(20000).optional().default(""),
  // 至少要有一条消息，避免空请求浪费接口调用。
  messages: z.array(chatMessageSchema).min(1),
  // 温度控制回复随机度，限制范围避免传入异常值。
  temperature: z.number().min(0).max(2).default(0.7),
  // 最大输出长度限制在常见安全范围内。
  maxOutputTokens: z.number().int().min(1).max(32000).default(2048),
});

// 模型请求校验规则，用途：校验读取模型列表的请求；入参含义：未知请求体；返回值含义：中转站配置。
export const modelRequestSchema = z.object({
  // 中转站地址由工具函数清洗。
  baseUrl: z.string(),
  // 中转站密钥由工具函数清洗。
  apiKey: z.string(),
});

// 图片生成请求校验规则，用途：校验图片生成参数；入参含义：未知请求体；返回值含义：可转发给中转站的数据。
export const imageGenerateRequestSchema = z.object({
  // 中转站地址由服务端继续清洗。
  baseUrl: z.string(),
  // 中转站密钥由服务端继续清洗。
  apiKey: z.string(),
  // 图片模型名称，例如 gpt-image-1。
  model: z.string().min(1),
  // 图片提示词不能为空。
  prompt: z.string().min(1).max(8000),
  // 图片尺寸直接传给中转站，兼容不同供应商。
  size: z.string().min(1).default("1024x1024"),
  // 图片质量直接传给中转站，默认自动。
  quality: z.string().min(1).default("auto"),
});

// 图片编辑请求校验规则，用途：校验图片编辑参数；入参含义：未知请求体；返回值含义：可转发表单的数据。
export const imageEditRequestSchema = imageGenerateRequestSchema.extend({
  // 待编辑图片必须是数据地址。
  image: chatImageSchema,
});

// 聊天请求类型，用途：给服务端适配器提供静态类型；入参含义：无；返回值含义：聊天请求数据结构。
export type ChatRequestBody = z.infer<typeof chatRequestSchema>;

// 图片生成请求类型，用途：给图片接口提供静态类型；入参含义：无；返回值含义：图片生成请求数据结构。
export type ImageGenerateRequestBody = z.infer<typeof imageGenerateRequestSchema>;

// 图片编辑请求类型，用途：给图片接口提供静态类型；入参含义：无；返回值含义：图片编辑请求数据结构。
export type ImageEditRequestBody = z.infer<typeof imageEditRequestSchema>;
