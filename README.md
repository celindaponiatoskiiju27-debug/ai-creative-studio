# 灵境 AI Creative Studio

基于 Vue 2.7 和 Vite 构建的 AI Creative Studio 前端原型。当前包含图片生成工作台、模型和比例选择、图生图上传区、模拟生成结果，以及视频、画布、作品、收藏等导航入口。

复制 `.env.example` 为 `.env`，填写 `OPENAI_API_KEY`，然后运行 `npm install` 和 `npm run dev:all`。浏览器访问 `http://localhost:5174`。

Node.js 后端位于 `server/index.js`，使用 OpenAI `gpt-image-2` 对接文生图和图生图。API Key 只保存在服务端，不会暴露给浏览器。

无法访问 OpenAI 时，可在 `.env` 中设置 `MOCK_OPENAI=true`，本地模拟接口会返回测试图片，用于验证全部页面事件。接入真实服务时改为 `false` 并重启服务。
