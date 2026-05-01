// 浏览器存储可用判断，用途：避免服务端渲染时访问浏览器对象；入参含义：无；返回值含义：是否可以使用本机存储。
function canUseStorage(): boolean {
  // 只有浏览器环境才有 window 和 localStorage。
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

// 读取本机数据，用途：从浏览器本机读取 JSON 数据；入参含义：存储键和默认值；返回值含义：解析后的数据。
export function loadLocalJson<T>(key: string, fallback: T): T {
  // 存储不可用时直接返回默认值。
  if (!canUseStorage()) {
    return fallback;
  }

  try {
    // 读取原始字符串。
    const rawValue = window.localStorage.getItem(key);
    // 没有保存过时返回默认值。
    if (!rawValue) {
      return fallback;
    }

    // 解析 JSON 并返回。
    return JSON.parse(rawValue) as T;
  } catch {
    // 解析失败通常是旧数据损坏，返回默认值保证页面能打开。
    return fallback;
  }
}

// 保存本机数据，用途：把配置和会话写到当前浏览器；入参含义：存储键和数据；返回值含义：无。
export function saveLocalJson<T>(key: string, value: T): void {
  // 存储不可用时不做任何事。
  if (!canUseStorage()) {
    return;
  }

  try {
    // 序列化后保存到浏览器本机。
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储满或隐私模式可能失败，忽略失败以保证主流程可继续使用。
  }
}

// 删除本机数据，用途：清理指定浏览器存储；入参含义：存储键；返回值含义：无。
export function removeLocalJson(key: string): void {
  // 存储不可用时不做任何事。
  if (!canUseStorage()) {
    return;
  }

  try {
    // 删除指定键。
    window.localStorage.removeItem(key);
  } catch {
    // 删除失败不影响页面运行。
  }
}
