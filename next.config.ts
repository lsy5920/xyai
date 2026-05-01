import type { NextConfig } from "next";

// 框架配置，用途：关闭多余响应头并启用严格检查；入参：无；返回值：框架会读取这个对象。
const nextConfig: NextConfig = {
  // 严格模式会帮助提前发现页面里的潜在问题。
  reactStrictMode: true,
  // 关闭框架默认响应头，减少线上暴露的信息。
  poweredByHeader: false,
  // 固定项目根目录，避免上级目录存在锁文件时被误判为工作区根目录。
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
