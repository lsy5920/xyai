// 中转站配置，用途：保存用户填写的调用地址和密钥；入参含义：无；返回值含义：作为前后端共享的数据结构。
export type ProviderConfig = {
  // 中转站地址，用途：告诉代理接口请求发往哪里。
  baseUrl: string;
  // 中转站密钥，用途：调用中转站接口时放到请求头里。
  apiKey: string;
};

// 模型条目，用途：统一保存中转站返回的模型信息；入参含义：无；返回值含义：用于模型选择器展示。
export type ModelItem = {
  // 模型编号，用途：调用接口时传给中转站。
  id: string;
  // 模型归属，用途：辅助用户识别模型来源。
  ownedBy?: string;
};

// 聊天图片，用途：保存用户上传给模型识别的图片；入参含义：无；返回值含义：作为消息附件传递。
export type ChatImage = {
  // 图片编号，用途：前端列表渲染和删除图片。
  id: string;
  // 图片名称，用途：让用户知道上传的是哪个文件。
  name: string;
  // 图片数据，用途：以浏览器可直接显示的格式传给后端。
  dataUrl: string;
  // 图片类型，用途：后端转发图片编辑接口时还原文件类型。
  mimeType: string;
};

// 聊天消息，用途：保存一条用户或模型消息；入参含义：无；返回值含义：组成完整会话历史。
export type ChatMessage = {
  // 消息编号，用途：列表渲染和更新指定消息。
  id: string;
  // 消息角色，用途：区分用户输入和模型回复。
  role: "user" | "assistant";
  // 消息正文，用途：保存可阅读的文字内容。
  content: string;
  // 图片附件，用途：用户消息可以带图让模型识别。
  images?: ChatImage[];
  // 创建时间，用途：排序和排查历史记录。
  createdAt: string;
};

// 会话记录，用途：保存一次完整对话；入参含义：无；返回值含义：用于历史会话列表。
export type Conversation = {
  // 会话编号，用途：定位当前打开的会话。
  id: string;
  // 会话标题，用途：在侧边栏里展示。
  title: string;
  // 消息列表，用途：保存这个会话里的全部问答。
  messages: ChatMessage[];
  // 创建时间，用途：记录会话第一次创建的时间。
  createdAt: string;
  // 更新时间，用途：让最近编辑的会话排在前面。
  updatedAt: string;
};

// 接口错误，用途：统一后端返回的错误说明；入参含义：无；返回值含义：前端展示中文错误。
export type ApiErrorPayload = {
  // 错误标题，用途：用一句话说明出了什么问题。
  message: string;
  // 处理建议，用途：告诉用户下一步该怎么修。
  suggestion: string;
  // 失败接口，用途：定位是哪一步请求失败。
  path?: string;
  // 原始细节，用途：保留中转站返回的简短报错。
  detail?: string;
  // 是否建议重试，用途：区分临时网络问题和配置问题。
  retryable: boolean;
};

// 通用接口结果，用途：让服务端工具函数返回成功或失败；入参含义：泛型代表成功数据；返回值含义：成功时带数据，失败时带错误。
export type ServiceResult<T> =
  | {
      // 成功标记，用途：调用方根据它判断是否继续。
      ok: true;
      // 成功数据，用途：保存工具函数处理后的结果。
      data: T;
    }
  | {
      // 失败标记，用途：调用方根据它返回中文错误。
      ok: false;
      // 错误信息，用途：统一展示给前端。
      error: ApiErrorPayload;
    };
