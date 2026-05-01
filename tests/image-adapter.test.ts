import { describe, expect, it } from "vitest";
import { extractImageResults } from "@/lib/image-adapter";

// 图片结果测试，用途：确认不同上游格式会被统一成页面可显示的数据；入参含义：无；返回值含义：测试结果。
describe("图片结果解析", () => {
  // 测试远程地址格式。
  it("会读取图片地址", () => {
    const images = extractImageResults({
      data: [
        {
          url: "https://example.com/image.png",
          revised_prompt: "修订后的提示词",
        },
      ],
    });

    expect(images).toHaveLength(1);
    expect(images[0]?.url).toBe("https://example.com/image.png");
    expect(images[0]?.revisedPrompt).toBe("修订后的提示词");
  });

  // 测试 base64 格式。
  it("会读取 base64 图片", () => {
    const images = extractImageResults({
      data: [
        {
          b64_json: "aGVsbG8=",
        },
      ],
    });

    expect(images).toHaveLength(1);
    expect(images[0]?.url).toBe("data:image/png;base64,aGVsbG8=");
  });
});
