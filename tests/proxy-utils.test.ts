import { describe, expect, it } from "vitest";
import { dataUrlToFile, normalizeApiKey, normalizeBaseUrl } from "@/lib/proxy-utils";

// 地址工具测试，用途：确认用户输入的中转站地址会被正确清洗；入参含义：无；返回值含义：测试结果。
describe("中转站地址处理", () => {
  // 测试去掉末尾 /v1，避免接口被拼成重复路径。
  it("会去掉地址末尾的 /v1", () => {
    const result = normalizeBaseUrl("https://example.com/v1/");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe("https://example.com");
    }
  });

  // 测试缺少协议时返回中文错误。
  it("会拒绝没有协议的地址", () => {
    const result = normalizeBaseUrl("example.com");
    expect(result.ok).toBe(false);
  });
});

// 密钥工具测试，用途：确认密钥会被清理并校验；入参含义：无；返回值含义：测试结果。
describe("中转站密钥处理", () => {
  // 测试清理复制时带入的空格。
  it("会清理密钥首尾空格", () => {
    const result = normalizeApiKey("  sk-test  ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe("sk-test");
    }
  });

  // 测试空密钥会失败。
  it("会拒绝空密钥", () => {
    const result = normalizeApiKey("   ");
    expect(result.ok).toBe(false);
  });
});

// 图片转换测试，用途：确认浏览器图片数据能转成上传文件；入参含义：无；返回值含义：测试结果。
describe("图片数据转换", () => {
  // 测试标准数据地址能被转换成文件。
  it("会把数据地址转成文件", () => {
    const result = dataUrlToFile("data:image/png;base64,aGVsbG8=", "test.png");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe("test.png");
      expect(result.data.type).toBe("image/png");
    }
  });
});
