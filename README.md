# 小亦模型工作台

## 项目介绍
小亦模型工作台是一个可部署到 Vercel 的网页应用，用来连接第三方中转站，进行模型问答、识图、图片生成和图片编辑。

## 环境要求
- 系统：Windows 10 或 Windows 11。
- 运行环境：Node.js 25.8.0。
- 包管理器：npm 11.11.0。
- 自动部署：GitHub Actions 加 Vercel。
- 主要依赖：Next.js 16.2.4、React 19.2.5、TypeScript 6.0.3、lucide-react 1.14.0、zod 4.4.1。
- 自动部署工具：GitHub Actions 中固定使用 Vercel CLI 53.0.1。

## 安装部署教程
1. 打开 PowerShell，进入项目目录：

```powershell
cd C:\Users\lanshiy\Documents\小亦伟大工程\xyai
```

2. 安装依赖：

```powershell
npm install
```

3. 本地启动：

```powershell
npm run dev
```

4. 打开浏览器访问：

```text
http://localhost:3000
```

5. 新建 GitHub 仓库，把项目推送到仓库：

```powershell
git init
git add .
git commit -m "初次发布小亦模型工作台"
git branch -M main
git remote add origin 你的仓库地址
git push -u origin main
```

6. 打开 Vercel，选择导入刚刚的 GitHub 仓库，创建一个 Vercel 项目。

7. 在 Vercel 账号设置里创建部署令牌，保存为 GitHub 仓库密钥 `VERCEL_TOKEN`。

8. 在 Vercel 项目设置中找到组织编号和项目编号，分别保存为 GitHub 仓库密钥：

```text
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

9. 打开 GitHub 仓库，进入 `Settings`、`Secrets and variables`、`Actions`，新增上面三个密钥。

10. 以后只要推送到 `main` 分支，GitHub Actions 会自动检查、测试、构建并发布到 Vercel 生产环境。

11. 如果提交到其他分支或发起合并请求，GitHub Actions 会自动发布 Vercel 预览环境，方便先看效果再合并。

## 自动部署说明
- 自动部署工作流文件在 `.github/workflows/vercel-deploy.yml`。
- Vercel 构建配置文件在 `vercel.json`。
- 每次自动部署都会执行 `npm ci`、`npm run lint`、`npm run typecheck`、`npm run test`。
- 生产环境只在 `main` 分支触发，其他分支触发预览环境。
- 不要把真实中转站 key 写入 GitHub 密钥。本项目的中转站地址和 key 只保存在使用者自己的浏览器本机。

## 使用教程
### 连接中转站
1. 在顶部填写中转站地址，例如 `https://你的中转站域名`。
2. 在密钥输入框粘贴中转站 key。
3. 点击“加载模型”。
4. 如果模型列表为空，可以手动填写模型名称。

### 文字问答
1. 在“聊天模型”里选择或输入模型名称。
2. 在底部输入问题。
3. 点击“发送”。
4. 模型回复会以流式方式显示。

### 图片识别
1. 点击“上传图片”。
2. 选择一张或多张图片。
3. 输入图片相关问题。
4. 点击“发送”。

### 图片生成
1. 在“图片模型”里填写图片模型，例如 `gpt-image-1`。
2. 选择尺寸和质量。
3. 输入生成提示词。
4. 点击“生成图片”。

### 图片编辑
1. 点击“选择编辑图片”。
2. 上传要修改的图片。
3. 输入编辑要求。
4. 点击“编辑图片”。

## 项目目录结构
```text
xyai
├─ .github
│  └─ workflows
│     └─ vercel-deploy.yml：GitHub Actions 自动部署流程
├─ app
│  ├─ api
│  │  ├─ chat
│  │  │  └─ route.ts：问答代理接口，优先响应接口，失败后降级聊天接口
│  │  ├─ images
│  │  │  ├─ edit
│  │  │  │  └─ route.ts：图片编辑代理接口
│  │  │  └─ generate
│  │  │     └─ route.ts：图片生成代理接口
│  │  └─ models
│  │     └─ route.ts：模型列表代理接口
│  ├─ globals.css：全站样式和移动端适配
│  ├─ layout.tsx：页面根布局
│  └─ page.tsx：主页面、聊天、识图和图片工具
├─ lib
│  ├─ chat-adapter.ts：问答接口适配和流式解析
│  ├─ client-storage.ts：浏览器本机存储工具
│  ├─ image-adapter.ts：图片接口适配
│  ├─ proxy-utils.ts：中转站地址、密钥和错误处理工具
│  ├─ server-schemas.ts：服务端请求校验规则
│  └─ types.ts：前后端共享类型
├─ tests
│  ├─ image-adapter.test.ts：图片结果解析测试
│  └─ proxy-utils.test.ts：地址、密钥和图片转换测试
├─ .gitignore：忽略依赖、构建产物和密钥文件
├─ package.json：项目依赖和运行命令
├─ tsconfig.json：TypeScript 配置
├─ vercel.json：Vercel 构建配置
└─ README.md：项目说明文档
```

## 常见问题排查
### 点击“加载模型”失败
请检查中转站地址是否带有 `http` 或 `https`，并确认 key 没有复制错。

### 模型列表为空
部分中转站不开放模型列表接口，可以直接手动输入模型名称。

### 问答失败
请换一个模型再试。网站会先调用响应接口，失败后自动降级到聊天接口；如果两个接口都失败，通常是中转站不支持该模型或密钥无权限。

### 图片生成失败
请确认中转站支持图片生成接口，并确认图片模型名称正确。

### 图片编辑失败
请确认中转站支持图片编辑接口，并尽量上传常见格式图片，例如 png、jpg。

### GitHub Actions 自动部署失败
请先检查 GitHub 仓库是否配置了 `VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID` 三个密钥。再打开失败的工作流日志，看是依赖安装、代码检查、测试、构建还是 Vercel 发布失败。

### Vercel 构建失败
请先在本地运行 `npm run build`，根据报错修复后再推送到 GitHub。还要确认仓库里没有提交 `.env`、本地密钥或 `node_modules`。

## 更新日志
2026-05-01 13:03 【初次发布】完成小亦模型工作台核心功能开发，支持中转站配置、模型列表、文字问答、识图、图片生成、图片编辑、本机历史会话、移动端适配和 Vercel 部署文档
2026-05-01 13:59 【新增】新增 GitHub Actions 自动部署流程和 Vercel 构建配置，推送 main 分支自动发布生产环境，其他分支自动发布预览环境，同步补充 README 自动部署教程和排查说明
