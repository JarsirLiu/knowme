# SuperAgent 项目笔记

## 架构
- 后端：`src/` — Node.js coding agent（基于 `@openai/agents`）
- 前端：`web/` — Next.js 16 App Router + AI SDK v6 chat UI
- 根目录 `.env` 配置模型端点和 workspace

## Web 前端关键注意事项
1. **Turbopack + `'use client'` bug**: page.tsx 不能直接标记 `'use client'`，需要拆为服务端组件（page.tsx）+ 客户端组件（HomeClient.tsx）
2. **API route**: `/api/chat` 使用 `run()` from `@openai/agents`（非 `agent.run()`），通过 `createUIMessageStream` + `createUIMessageStreamResponse` 返回 SSE
3. **工具审批**: MVP 阶段 API route 临时设置 `process.env.SUPERAGENT_AUTO_APPROVE_SHELL='true'`
4. **依赖**: `openai` 包虽为传递依赖，但 agent.ts 直接 import，建议加入 dependencies
