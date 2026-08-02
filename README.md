# SuperAgent

本地 Coding Agent 工作台。使用 `@openai/agents` 编排 Agent，模型通过 OpenAI-compatible Chat Completions 接入，数据保存在 SQLite。

## 启动

建议使用：

- Node.js 22 LTS
- pnpm 9+

在项目根目录执行：

```powershell
pnpm install
cp .env.example .env
```

编辑 `.env`，至少填写：

```dotenv
SUPERAGENT_BASE_URL=https://api.deepseek.com/v1
SUPERAGENT_API_KEY=your-api-key
SUPERAGENT_MODEL=deepseek-chat
```

模型服务需要支持 Chat Completions，最好支持 tool calling。

启动后，在左侧点击“添加项目”，输入本地项目目录。之后创建会话并发送消息，Agent 只会操作当前项目目录。

打开第一个终端启动后端：

```powershell
pnpm run dev:server
```

打开第二个终端启动前端：

```powershell
pnpm run dev:web
```

浏览器访问：<http://localhost:3800>

- 前端端口：`3800`
- 后端端口：`3801`
- SQLite：`server/prisma/data.db`

## 常用命令

```powershell
pnpm run test:server
pnpm run build
```

默认执行 `run_command` 需要在界面中审批。如需自动批准 Shell 命令，在 `.env` 中设置：

```dotenv
SUPERAGENT_AUTO_APPROVE_SHELL=true
```

上下文自动压缩默认开启，按模型上下文 token 预算触发。默认上下文窗口为 64000 token，预留 16000 token 输出空间和 1024 token 安全余量，达到 90% 后压缩，并保留最近约 20000 token。兼容模型没有统一 tokenizer，因此这里使用保守估算；请按实际模型调整：

```dotenv
SUPERAGENT_CONTEXT_AUTO_COMPACT=true
SUPERAGENT_CONTEXT_WINDOW_TOKENS=64000
SUPERAGENT_CONTEXT_OUTPUT_RESERVE_TOKENS=16000
SUPERAGENT_CONTEXT_SAFETY_MARGIN_TOKENS=1024
SUPERAGENT_CONTEXT_COMPACT_TRIGGER_RATIO=0.9
SUPERAGENT_CONTEXT_COMPACT_KEEP_TOKENS=20000
```

详细架构方案见 [docs](docs/)。
