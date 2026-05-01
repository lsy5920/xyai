import type { Metadata } from "next";
import "./globals.css";

// 页面元信息，用途：设置浏览器标题和页面说明；入参含义：无；返回值含义：框架读取的元信息。
export const metadata: Metadata = {
  title: "小亦模型工作台",
  description: "连接中转站进行模型问答、识图、图片生成和图片编辑",
};

// 根布局，用途：给所有页面提供统一外壳；入参含义：页面内容；返回值含义：完整页面结构。
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
