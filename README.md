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

详细架构方案见 [docs](docs/)。
