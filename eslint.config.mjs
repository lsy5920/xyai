import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// 检查配置，用途：复用框架推荐规则并排除生成目录；入参：无；返回值：代码检查工具读取的规则数组。
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "coverage/**"],
  },
  {
    rules: {
      // 本项目需要展示用户上传的数据图片和中转站返回的临时图片，使用原生图片标签更稳。
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
