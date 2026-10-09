# 灵境 AI Creative Studio

基于 Vue 2.7 和 Vite 构建的 AI Creative Studio 前端原型。当前包含图片生成工作台、模型和比例选择、图生图上传区、模拟生成结果，以及视频、画布、作品、收藏等导航入口。

复制 `.env.example` 为 `.env`，填写 `OPENAI_API_KEY`，然后运行 `npm install` 和 `npm run dev:all`。浏览器访问 `http://localhost:5174`。

Node.js 后端位于 `server/index.js`，使用 OpenAI `gpt-image-2` 对接文生图和图生图。API Key 只保存在服务端，不会暴露给浏览器。

无法访问 OpenAI 时，可在 `.env` 中设置 `MOCK_OPENAI=true`，本地模拟接口会返回测试图片，用于验证全部页面事件。接入真实服务时改为 `false` 并重启服务。

## Grok Imagine Video

项目的视频生成队列支持 xAI Grok Imagine Video 1.5 文生视频和图生视频。服务端需要设置 `XAI_API_KEY`（可选 `XAI_BASE_URL`，默认 `https://api.x.ai/v1`）；不要将密钥放进任何 `VITE_` 变量。

已有 Supabase 项目请在 SQL Editor 执行 `supabase/xai-grok-video.sql`，随后在 Render 服务环境变量添加 `XAI_API_KEY` 并部署。部署后，后台“模型管理”会显示 Grok 图片和视频模型；密钥缺失时它们会自动显示为不可用。Grok 图片支持文生图及单张参考图编辑；视频默认参数为 5 秒、480p，生成完成后会按现有流程归档作品。
