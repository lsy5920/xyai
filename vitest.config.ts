import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// 测试配置，用途：指定测试运行环境；入参：无；返回值：测试工具读取的配置对象。
export default defineConfig({
  resolve: {
    // 路径别名，用途：让测试文件和项目代码使用同一套导入写法。
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // 使用普通运行环境，方便测试服务端工具函数。
    environment: "node",
    // 开启全局断言方法，测试文件会更简洁。
    globals: true,
  },
});
