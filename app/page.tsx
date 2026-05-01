"use client";

import { nanoid } from "nanoid";
import {
  Bot,
  Eraser,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Menu,
  MessageSquarePlus,
  Paintbrush,
  PanelLeftClose,
  Save,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { loadLocalJson, removeLocalJson, saveLocalJson } from "@/lib/client-storage";
import type { ApiErrorPayload, ChatImage, ChatMessage, Conversation, ModelItem, ProviderConfig } from "@/lib/types";

// 配置存储键，用途：只在当前浏览器保存中转站地址和密钥；入参含义：无；返回值含义：本机存储键名。
const CONFIG_STORAGE_KEY = "xyai.provider.v1";

// 会话存储键，用途：只在当前浏览器保存历史会话；入参含义：无；返回值含义：本机存储键名。
const CONVERSATION_STORAGE_KEY = "xyai.conversations.v1";

// 默认配置，用途：页面首次打开时填充空配置；入参含义：无；返回值含义：中转站配置。
const DEFAULT_CONFIG: ProviderConfig = {
  baseUrl: "",
  apiKey: "",
};

// 默认聊天模型，用途：模型列表为空时仍允许手动使用常见模型名；入参含义：无；返回值含义：模型名称。
const DEFAULT_CHAT_MODEL = "gpt-4.1-mini";

// 默认图片模型，用途：图片功能首次打开时使用；入参含义：无；返回值含义：模型名称。
const DEFAULT_IMAGE_MODEL = "gpt-image-1";

// 图片尺寸选项，用途：让用户选择常见输出比例；入参含义：无；返回值含义：尺寸字符串数组。
const IMAGE_SIZE_OPTIONS = ["1024x1024", "1024x1536", "1536x1024", "auto"];

// 图片质量选项，用途：让用户选择生成质量；入参含义：无；返回值含义：质量字符串数组。
const IMAGE_QUALITY_OPTIONS = ["auto", "low", "medium", "high"];

// 图片结果，用途：保存图片接口返回的可展示图片；入参含义：无；返回值含义：图片展示数据。
type ImageResult = {
  // 图片编号用于列表渲染。
  id: string;
  // 图片地址可能是远程地址或数据地址。
  url: string;
  // 修订提示词用于展示模型改写后的描述。
  revisedPrompt?: string;
};

// 接口成功或失败结果，用途：前端统一解析后端 JSON；入参含义：泛型代表成功数据；返回值含义：成功数据或错误信息。
type ApiResult<T> =
  | ({
      // 成功标记用于判断是否读取数据。
      ok: true;
    } & T)
  | {
      // 失败标记用于读取错误对象。
      ok: false;
      // 错误对象用于页面展示中文提示。
      error: ApiErrorPayload;
    };

// 新建会话，用途：生成一条空白历史记录；入参含义：可选标题；返回值含义：会话对象。
function createConversation(title = "新的对话"): Conversation {
  // 当前时间用于创建和更新时间。
  const now = new Date().toISOString();

  return {
    id: nanoid(),
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

// 新建消息，用途：生成用户或模型消息；入参含义：角色、内容、图片；返回值含义：消息对象。
function createMessage(role: ChatMessage["role"], content: string, images?: ChatImage[]): ChatMessage {
  return {
    id: nanoid(),
    role,
    content,
    images,
    createdAt: new Date().toISOString(),
  };
}

// 生成会话标题，用途：用用户第一句话给会话命名；入参含义：用户输入和图片数量；返回值含义：短标题。
function createConversationTitle(content: string, imageCount: number): string {
  // 优先使用文字，没有文字时按图片问答命名。
  const source = content.trim() || (imageCount > 0 ? "图片问答" : "新的对话");
  // 标题限制长度，避免侧边栏被撑开。
  return source.length > 18 ? `${source.slice(0, 18)}...` : source;
}

// 文件转数据地址，用途：把上传图片转成可展示也可发送的格式；入参含义：浏览器文件；返回值含义：图片数据地址。
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // 文件读取器负责把图片读成 base64 数据。
    const reader = new FileReader();
    // 读取成功时返回字符串。
    reader.onload = () => resolve(String(reader.result ?? ""));
    // 读取失败时返回异常。
    reader.onerror = () => reject(new Error("图片读取失败"));
    // 开始读取文件。
    reader.readAsDataURL(file);
  });
}

// 提取节点文本，用途：复制代码块时拿到纯文本；入参含义：页面节点；返回值含义：拼接后的文本。
function extractNodeText(node: ReactNode): string {
  // 字符串和数字可以直接转文本。
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  // 数组节点需要逐个拼接。
  if (Array.isArray(node)) {
    return node.map(extractNodeText).join("");
  }

  // 其他复杂节点无法稳定读取，返回空字符串兜底。
  return "";
}

// 错误转文本，用途：把接口错误对象整理成页面可读文案；入参含义：接口结果和兜底文案；返回值含义：中文错误文本。
function formatApiError(data: unknown, fallback: string): string {
  // 确认错误结构存在。
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const error = record.error;
    if (error && typeof error === "object") {
      // 提取错误字段。
      const errorRecord = error as Record<string, unknown>;
      const message = typeof errorRecord.message === "string" ? errorRecord.message : fallback;
      const suggestion = typeof errorRecord.suggestion === "string" ? errorRecord.suggestion : "";
      const detail = typeof errorRecord.detail === "string" ? errorRecord.detail : "";
      return [message, suggestion, detail].filter(Boolean).join("：");
    }
  }

  return fallback;
}

// 读取接口 JSON，用途：安全读取后端响应；入参含义：响应对象；返回值含义：解析后的对象或空对象。
async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    // 正常解析 JSON。
    return await response.json();
  } catch {
    // 非 JSON 响应返回空对象。
    return {};
  }
}

// 代码块组件，用途：给回复里的代码提供复制按钮；入参含义：代码块内容；返回值含义：可复制代码块界面。
function CodeBlock({ children }: { children: ReactNode }) {
  // 复制状态用于短暂显示按钮反馈。
  const [copied, setCopied] = useState(false);
  // 提取代码纯文本。
  const text = extractNodeText(children);

  // 复制代码，用途：把代码写入剪贴板；入参含义：无；返回值含义：无。
  async function copyCode() {
    try {
      // 调用浏览器剪贴板。
      await navigator.clipboard.writeText(text);
      setCopied(true);
      // 短暂提示后恢复按钮文字。
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // 剪贴板失败时不打断阅读。
      setCopied(false);
    }
  }

  return (
    <div className="codeBlock">
      <button type="button" className="copyButton" onClick={copyCode}>
        {copied ? "已复制" : "复制"}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

// 消息正文组件，用途：渲染模型回复里的 Markdown；入参含义：消息内容；返回值含义：格式化后的正文。
function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      }}
    >
      {content || "正在生成..."}
    </ReactMarkdown>
  );
}

// 首页组件，用途：提供中转站配置、模型问答和图片工具；入参含义：无；返回值含义：完整应用页面。
export default function HomePage() {
  // 中转站配置，保存到当前浏览器。
  const [config, setConfig] = useState<ProviderConfig>(DEFAULT_CONFIG);
  // 模型列表，从中转站动态读取。
  const [models, setModels] = useState<ModelItem[]>([]);
  // 聊天模型名称，可以从列表选择也可以手动输入。
  const [chatModel, setChatModel] = useState(DEFAULT_CHAT_MODEL);
  // 图片模型名称，可以从列表选择也可以手动输入。
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL);
  // 系统提示词，发送聊天时传给模型。
  const [systemPrompt, setSystemPrompt] = useState("");
  // 温度参数，控制回复随机度。
  const [temperature, setTemperature] = useState(0.7);
  // 最大输出长度，避免一次回复过长。
  const [maxOutputTokens, setMaxOutputTokens] = useState(2048);
  // 历史会话列表，保存到当前浏览器。
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // 当前打开的会话编号。
  const [activeConversationId, setActiveConversationId] = useState("");
  // 聊天输入框内容。
  const [messageInput, setMessageInput] = useState("");
  // 当前待发送图片附件。
  const [attachments, setAttachments] = useState<ChatImage[]>([]);
  // 图片生成提示词。
  const [imagePrompt, setImagePrompt] = useState("");
  // 图片编辑提示词。
  const [editPrompt, setEditPrompt] = useState("");
  // 图片尺寸。
  const [imageSize, setImageSize] = useState("1024x1024");
  // 图片质量。
  const [imageQuality, setImageQuality] = useState("auto");
  // 图片生成结果。
  const [generatedImages, setGeneratedImages] = useState<ImageResult[]>([]);
  // 图片编辑结果。
  const [editedImages, setEditedImages] = useState<ImageResult[]>([]);
  // 待编辑图片。
  const [editImageSource, setEditImageSource] = useState<ChatImage | null>(null);
  // 全局错误提示。
  const [notice, setNotice] = useState("");
  // 模型加载状态。
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  // 聊天发送状态。
  const [isSending, setIsSending] = useState(false);
  // 图片生成状态。
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  // 图片编辑状态。
  const [isEditingImage, setIsEditingImage] = useState(false);
  // 移动端侧边栏状态。
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 首次挂载状态，避免初始化前写入空数据。
  const [isMounted, setIsMounted] = useState(false);
  // 消息底部引用，用于新消息出现时滚动到底部。
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  // 上传识图图片输入框引用，用于图标按钮触发文件选择。
  const chatImageInputRef = useRef<HTMLInputElement | null>(null);
  // 图片编辑输入框引用，用于图标按钮触发文件选择。
  const editImageInputRef = useRef<HTMLInputElement | null>(null);

  // 当前会话，用途：根据编号找到正在编辑的会话。
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );

  // 模型名称列表，用途：给输入框提供候选项。
  const modelOptions = useMemo(() => models.map((model) => model.id), [models]);

  // 初始化本机存储，用途：页面首次打开时读取配置和历史；入参含义：无；返回值含义：无。
  useEffect(() => {
    // 取消标记用于组件卸载时阻止后续更新。
    let cancelled = false;
    // 延迟到浏览器任务里读取，避免同步副作用触发重复渲染。
    const timer = window.setTimeout(() => {
      // 组件已经卸载时不再更新状态。
      if (cancelled) {
        return;
      }

      // 读取本机配置。
      const savedConfig = loadLocalJson<ProviderConfig>(CONFIG_STORAGE_KEY, DEFAULT_CONFIG);
      // 读取本机会话。
      const savedConversations = loadLocalJson<Conversation[]>(CONVERSATION_STORAGE_KEY, []);
      // 没有会话时创建一条默认会话。
      const initialConversations = savedConversations.length ? savedConversations : [createConversation()];

      setConfig(savedConfig);
      setConversations(initialConversations);
      setActiveConversationId(initialConversations[0]?.id ?? "");
      setIsMounted(true);
    }, 0);

    return () => {
      // 清理定时器，避免组件卸载后继续更新。
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // 保存配置，用途：配置变化时写入当前浏览器；入参含义：无；返回值含义：无。
  useEffect(() => {
    // 初始化完成后再写入，避免覆盖旧数据。
    if (isMounted) {
      saveLocalJson(CONFIG_STORAGE_KEY, config);
    }
  }, [config, isMounted]);

  // 保存会话，用途：会话变化时写入当前浏览器；入参含义：无；返回值含义：无。
  useEffect(() => {
    // 初始化完成后再写入，避免覆盖旧数据。
    if (isMounted) {
      saveLocalJson(CONVERSATION_STORAGE_KEY, conversations);
    }
  }, [conversations, isMounted]);

  // 自动滚动，用途：新消息出现时跳到底部；入参含义：无；返回值含义：无。
  useEffect(() => {
    // 平滑滚动到最新消息。
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeConversation?.messages.length, isSending]);

  // 更新当前会话，用途：集中处理会话消息和标题变化；入参含义：会话更新函数；返回值含义：无。
  function updateActiveConversation(updater: (conversation: Conversation) => Conversation): void {
    // 没有当前会话时不更新。
    if (!activeConversationId) {
      return;
    }

    setConversations((current) =>
      current.map((conversation) => (conversation.id === activeConversationId ? updater(conversation) : conversation)),
    );
  }

  // 新建对话，用途：创建空白会话并切换过去；入参含义：无；返回值含义：无。
  function handleNewConversation(): void {
    // 创建会话并放到列表顶部。
    const conversation = createConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveConversationId(conversation.id);
    setAttachments([]);
    setMessageInput("");
    setSidebarOpen(false);
  }

  // 删除对话，用途：移除当前会话；入参含义：会话编号；返回值含义：无。
  function handleDeleteConversation(conversationId: string): void {
    setConversations((current) => {
      // 删除指定会话。
      const next = current.filter((conversation) => conversation.id !== conversationId);
      // 至少保留一条会话，避免页面没有可操作对象。
      const finalList = next.length ? next : [createConversation()];
      // 如果删除的是当前会话，就切换到第一条。
      if (conversationId === activeConversationId) {
        setActiveConversationId(finalList[0]?.id ?? "");
      }
      return finalList;
    });
  }

  // 清理配置，用途：删除本机保存的地址和密钥；入参含义：无；返回值含义：无。
  function handleClearConfig(): void {
    // 清理浏览器存储和页面状态。
    removeLocalJson(CONFIG_STORAGE_KEY);
    setConfig(DEFAULT_CONFIG);
    setModels([]);
    setNotice("已清理本机保存的中转站配置。");
  }

  // 加载模型，用途：从中转站读取可用模型列表；入参含义：无；返回值含义：无。
  async function handleLoadModels(): Promise<void> {
    setNotice("");
    setIsLoadingModels(true);

    try {
      // 调用本地代理读取模型，密钥不会写入日志或文件。
      const response = await fetch("/api/models", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });
      const data = (await readJsonResponse(response)) as ApiResult<{ models: ModelItem[] }>;

      // 失败时展示中文错误。
      if (!response.ok || !data.ok) {
        setNotice(formatApiError(data, "模型列表读取失败。"));
        return;
      }

      // 保存模型列表。
      setModels(data.models);

      // 如果当前聊天模型为空，则自动使用第一条模型。
      if (!chatModel.trim() && data.models[0]?.id) {
        setChatModel(data.models[0].id);
      }

      // 没有返回模型时给出可操作提示。
      setNotice(data.models.length ? `已加载 ${data.models.length} 个模型。` : "中转站没有返回模型，可手动输入模型名称。");
    } catch {
      // 网络或代理异常时展示兜底错误。
      setNotice("模型列表读取失败：请检查本地服务和中转站地址。");
    } finally {
      setIsLoadingModels(false);
    }
  }

  // 处理聊天图片上传，用途：把图片加入待发送附件；入参含义：文件输入事件；返回值含义：无。
  async function handleChatImageChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    // 读取用户选择的文件。
    const files = Array.from(event.target.files ?? []);
    // 清空输入框，允许再次选择同一张图片。
    event.target.value = "";

    // 没有文件时不处理。
    if (!files.length) {
      return;
    }

    try {
      // 最多保留四张图片，避免请求体过大。
      const selectedFiles = files.slice(0, Math.max(0, 4 - attachments.length));
      const nextImages = await Promise.all(
        selectedFiles.map(async (file) => ({
          id: nanoid(),
          name: file.name,
          dataUrl: await readFileAsDataUrl(file),
          mimeType: file.type || "image/png",
        })),
      );

      setAttachments((current) => [...current, ...nextImages]);
      setNotice(files.length > selectedFiles.length ? "最多一次发送四张图片，已自动忽略多余图片。" : "");
    } catch {
      // 读取失败通常是文件损坏或浏览器权限问题。
      setNotice("图片读取失败，请重新选择图片。");
    }
  }

  // 处理编辑图片上传，用途：设置待编辑图片；入参含义：文件输入事件；返回值含义：无。
  async function handleEditImageChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    // 只取第一张图片用于编辑。
    const file = event.target.files?.[0];
    // 清空输入框，允许再次选择同一张图片。
    event.target.value = "";

    // 没有文件时不处理。
    if (!file) {
      return;
    }

    try {
      // 读取图片并保存为编辑源。
      setEditImageSource({
        id: nanoid(),
        name: file.name,
        dataUrl: await readFileAsDataUrl(file),
        mimeType: file.type || "image/png",
      });
    } catch {
      // 读取失败时提示用户重新上传。
      setNotice("编辑图片读取失败，请重新选择图片。");
    }
  }

  // 删除待发送图片，用途：从附件列表移除图片；入参含义：图片编号；返回值含义：无。
  function removeAttachment(imageId: string): void {
    setAttachments((current) => current.filter((image) => image.id !== imageId));
  }

  // 发送消息，用途：把当前会话和输入发给模型；入参含义：无；返回值含义：无。
  async function handleSendMessage(): Promise<void> {
    // 输入和图片都为空时不发送。
    if (!messageInput.trim() && !attachments.length) {
      setNotice("请先输入问题或上传图片。");
      return;
    }

    // 模型为空时不发送。
    if (!chatModel.trim()) {
      setNotice("请先填写聊天模型名称。");
      return;
    }

    // 没有当前会话时不发送。
    if (!activeConversation) {
      setNotice("请先新建一个对话。");
      return;
    }

    // 创建用户消息和空的模型回复消息。
    const userMessage = createMessage("user", messageInput.trim(), attachments);
    const assistantMessage = createMessage("assistant", "");
    const requestMessages = [...activeConversation.messages, userMessage];
    const assistantId = assistantMessage.id;

    // 清空输入区并进入发送状态。
    setMessageInput("");
    setAttachments([]);
    setNotice("");
    setIsSending(true);

    // 先把消息写入页面，形成即时反馈。
    updateActiveConversation((conversation) => ({
      ...conversation,
      title: conversation.messages.length ? conversation.title : createConversationTitle(userMessage.content, userMessage.images?.length ?? 0),
      messages: [...conversation.messages, userMessage, assistantMessage],
      updatedAt: new Date().toISOString(),
    }));

    try {
      // 调用本地问答代理。
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...config,
          model: chatModel.trim(),
          systemPrompt,
          messages: requestMessages,
          temperature,
          maxOutputTokens,
        }),
      });

      // 非文本流代表后端返回了错误对象。
      const contentType = response.headers.get("Content-Type") ?? "";
      if (!response.ok || contentType.includes("application/json")) {
        const data = await readJsonResponse(response);
        const message = formatApiError(data, "问答接口调用失败。");
        setNotice(message);
        updateActiveConversation((conversation) => ({
          ...conversation,
          messages: conversation.messages.map((item) => (item.id === assistantId ? { ...item, content: `【请求失败】${message}` } : item)),
          updatedAt: new Date().toISOString(),
        }));
        return;
      }

      // 没有响应体时提示失败。
      if (!response.body) {
        setNotice("问答接口没有返回内容。");
        return;
      }

      // 读取流式文本。
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        // 持续读取模型返回。
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        // 追加本次增量文本。
        fullText += decoder.decode(value, { stream: true });
        updateActiveConversation((conversation) => ({
          ...conversation,
          messages: conversation.messages.map((item) => (item.id === assistantId ? { ...item, content: fullText } : item)),
          updatedAt: new Date().toISOString(),
        }));
      }
    } catch {
      // 请求异常通常是本地服务中断或浏览器网络失败。
      const message = "问答请求失败，请检查网络或稍后重试。";
      setNotice(message);
      updateActiveConversation((conversation) => ({
        ...conversation,
        messages: conversation.messages.map((item) => (item.id === assistantId ? { ...item, content: `【请求失败】${message}` } : item)),
        updatedAt: new Date().toISOString(),
      }));
    } finally {
      setIsSending(false);
    }
  }

  // 生成图片，用途：调用图片生成接口；入参含义：无；返回值含义：无。
  async function handleGenerateImage(): Promise<void> {
    // 图片提示词不能为空。
    if (!imagePrompt.trim()) {
      setNotice("请先填写图片提示词。");
      return;
    }

    // 图片模型不能为空。
    if (!imageModel.trim()) {
      setNotice("请先填写图片模型名称。");
      return;
    }

    setNotice("");
    setIsGeneratingImage(true);

    try {
      // 调用本地图片生成代理。
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...config,
          model: imageModel.trim(),
          prompt: imagePrompt.trim(),
          size: imageSize,
          quality: imageQuality,
        }),
      });
      const data = (await readJsonResponse(response)) as ApiResult<{ images: ImageResult[] }>;

      // 失败时展示中文错误。
      if (!response.ok || !data.ok) {
        setNotice(formatApiError(data, "图片生成失败。"));
        return;
      }

      // 显示生成结果。
      setGeneratedImages(data.images);
      setNotice("图片生成完成。");
    } catch {
      // 网络异常时提示用户检查服务。
      setNotice("图片生成请求失败，请检查网络或稍后重试。");
    } finally {
      setIsGeneratingImage(false);
    }
  }

  // 编辑图片，用途：调用图片编辑接口；入参含义：无；返回值含义：无。
  async function handleEditImage(): Promise<void> {
    // 必须先上传待编辑图片。
    if (!editImageSource) {
      setNotice("请先上传一张需要编辑的图片。");
      return;
    }

    // 编辑提示词不能为空。
    if (!editPrompt.trim()) {
      setNotice("请先填写图片编辑要求。");
      return;
    }

    setNotice("");
    setIsEditingImage(true);

    try {
      // 调用本地图片编辑代理。
      const response = await fetch("/api/images/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...config,
          model: imageModel.trim(),
          prompt: editPrompt.trim(),
          size: imageSize,
          quality: imageQuality,
          image: editImageSource,
        }),
      });
      const data = (await readJsonResponse(response)) as ApiResult<{ images: ImageResult[] }>;

      // 失败时展示中文错误。
      if (!response.ok || !data.ok) {
        setNotice(formatApiError(data, "图片编辑失败。"));
        return;
      }

      // 显示编辑结果。
      setEditedImages(data.images);
      setNotice("图片编辑完成。");
    } catch {
      // 请求异常时提示用户检查网络。
      setNotice("图片编辑请求失败，请检查网络或稍后重试。");
    } finally {
      setIsEditingImage(false);
    }
  }

  return (
    <main className="appShell">
      <aside className={sidebarOpen ? "sidebar sidebarOpen" : "sidebar"}>
        <div className="sidebarHeader">
          <button type="button" className="primaryButton" onClick={handleNewConversation}>
            <MessageSquarePlus size={18} />
            新对话
          </button>
          <button type="button" className="iconButton mobileOnly" onClick={() => setSidebarOpen(false)} aria-label="收起侧边栏">
            <PanelLeftClose size={18} />
          </button>
        </div>

        <div className="conversationList">
          {conversations.map((conversation) => (
            <div key={conversation.id} className={conversation.id === activeConversationId ? "conversationItem active" : "conversationItem"}>
              <button
                type="button"
                className="conversationButton"
                onClick={() => {
                  setActiveConversationId(conversation.id);
                  setSidebarOpen(false);
                }}
              >
                <span>{conversation.title}</span>
                <small>{new Date(conversation.updatedAt).toLocaleString("zh-CN", { hour12: false })}</small>
              </button>
              <button type="button" className="iconButton dangerButton" onClick={() => handleDeleteConversation(conversation.id)} aria-label="删除对话">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="mainArea">
        <header className="topBar">
          <button type="button" className="iconButton mobileOnly" onClick={() => setSidebarOpen(true)} aria-label="打开侧边栏">
            <Menu size={20} />
          </button>
          <div>
            <h1>小亦模型工作台</h1>
            <p>中转站问答、识图、生成图</p>
          </div>
        </header>

        <section className="configBar">
          <label className="field wideField">
            <span>中转站地址</span>
            <input
              value={config.baseUrl}
              onChange={(event) => setConfig((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder="https://你的中转站域名"
            />
          </label>
          <label className="field">
            <span>密钥</span>
            <input
              value={config.apiKey}
              onChange={(event) => setConfig((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder="粘贴中转站 key"
              type="password"
            />
          </label>
          <button type="button" className="secondaryButton" onClick={handleLoadModels} disabled={isLoadingModels}>
            {isLoadingModels ? <Loader2 className="spin" size={18} /> : <KeyRound size={18} />}
            加载模型
          </button>
          <button type="button" className="ghostButton" onClick={handleClearConfig}>
            <Eraser size={18} />
            清理
          </button>
        </section>

        {notice ? <div className="notice">{notice}</div> : null}

        <div className="workspace">
          <section className="chatPanel">
            <div className="panelHeader">
              <div>
                <h2>对话</h2>
                <p>{activeConversation?.title ?? "新的对话"}</p>
              </div>
              <label className="field compactField">
                <span>聊天模型</span>
                <input list="model-options" value={chatModel} onChange={(event) => setChatModel(event.target.value)} />
              </label>
            </div>

            <div className="messageList">
              {activeConversation?.messages.length ? (
                activeConversation.messages.map((message) => (
                  <article key={message.id} className={message.role === "user" ? "message userMessage" : "message assistantMessage"}>
                    <div className="messageAvatar">{message.role === "user" ? "我" : <Bot size={18} />}</div>
                    <div className="messageBody">
                      {message.images?.length ? (
                        <div className="thumbGrid">
                          {message.images.map((image) => (
                            <img key={image.id} src={image.dataUrl} alt={image.name} />
                          ))}
                        </div>
                      ) : null}
                      {message.role === "assistant" ? <MarkdownMessage content={message.content} /> : <p>{message.content || "请识别这些图片。"}</p>}
                    </div>
                  </article>
                ))
              ) : (
                <div className="emptyState">
                  <Sparkles size={30} />
                  <p>选择模型后开始提问</p>
                </div>
              )}
              <div ref={messageEndRef} />
            </div>

            <div className="composer">
              {attachments.length ? (
                <div className="attachmentRow">
                  {attachments.map((image) => (
                    <div key={image.id} className="attachmentItem">
                      <img src={image.dataUrl} alt={image.name} />
                      <button type="button" onClick={() => removeAttachment(image.id)} aria-label="移除图片">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <textarea
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                placeholder="输入问题，也可以上传图片让模型识别"
                rows={4}
              />

              <div className="composerActions">
                <input ref={chatImageInputRef} className="hiddenInput" type="file" accept="image/*" multiple onChange={handleChatImageChange} />
                <button type="button" className="iconTextButton" onClick={() => chatImageInputRef.current?.click()}>
                  <Upload size={18} />
                  上传图片
                </button>
                <button type="button" className="primaryButton" onClick={handleSendMessage} disabled={isSending}>
                  {isSending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
                  发送
                </button>
              </div>
            </div>
          </section>

          <aside className="toolPanel">
            <section className="settingsPanel">
              <h2>参数</h2>
              <label className="field">
                <span>系统提示词</span>
                <textarea value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} rows={4} placeholder="给模型设定回答风格" />
              </label>
              <div className="twoColumn">
                <label className="field">
                  <span>温度</span>
                  <input value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} type="number" min="0" max="2" step="0.1" />
                </label>
                <label className="field">
                  <span>输出长度</span>
                  <input
                    value={maxOutputTokens}
                    onChange={(event) => setMaxOutputTokens(Number(event.target.value))}
                    type="number"
                    min="1"
                    max="32000"
                    step="1"
                  />
                </label>
              </div>
            </section>

            <section className="imagePanel">
              <h2>图片</h2>
              <label className="field">
                <span>图片模型</span>
                <input list="model-options" value={imageModel} onChange={(event) => setImageModel(event.target.value)} />
              </label>
              <div className="twoColumn">
                <label className="field">
                  <span>尺寸</span>
                  <select value={imageSize} onChange={(event) => setImageSize(event.target.value)}>
                    {IMAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>质量</span>
                  <select value={imageQuality} onChange={(event) => setImageQuality(event.target.value)}>
                    {IMAGE_QUALITY_OPTIONS.map((quality) => (
                      <option key={quality} value={quality}>
                        {quality}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="imageToolBlock">
                <label className="field">
                  <span>生成提示词</span>
                  <textarea value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} rows={4} placeholder="描述要生成的画面" />
                </label>
                <button type="button" className="secondaryButton fullButton" onClick={handleGenerateImage} disabled={isGeneratingImage}>
                  {isGeneratingImage ? <Loader2 className="spin" size={18} /> : <Paintbrush size={18} />}
                  生成图片
                </button>
                {generatedImages.length ? (
                  <div className="resultGrid">
                    {generatedImages.map((image) => (
                      <figure key={image.id}>
                        <img src={image.url} alt="生成结果" />
                        {image.revisedPrompt ? <figcaption>{image.revisedPrompt}</figcaption> : null}
                      </figure>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="imageToolBlock">
                <input ref={editImageInputRef} className="hiddenInput" type="file" accept="image/*" onChange={handleEditImageChange} />
                <button type="button" className="iconTextButton fullButton" onClick={() => editImageInputRef.current?.click()}>
                  <ImageIcon size={18} />
                  选择编辑图片
                </button>
                {editImageSource ? <img className="editPreview" src={editImageSource.dataUrl} alt={editImageSource.name} /> : null}
                <label className="field">
                  <span>编辑要求</span>
                  <textarea value={editPrompt} onChange={(event) => setEditPrompt(event.target.value)} rows={3} placeholder="描述要修改的内容" />
                </label>
                <button type="button" className="secondaryButton fullButton" onClick={handleEditImage} disabled={isEditingImage}>
                  {isEditingImage ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                  编辑图片
                </button>
                {editedImages.length ? (
                  <div className="resultGrid">
                    {editedImages.map((image) => (
                      <figure key={image.id}>
                        <img src={image.url} alt="编辑结果" />
                        {image.revisedPrompt ? <figcaption>{image.revisedPrompt}</figcaption> : null}
                      </figure>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          </aside>
        </div>

        <datalist id="model-options">
          {modelOptions.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
      </section>
    </main>
  );
}
