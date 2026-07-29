# SuperAgent — 本地 Coding Agent

基于 [`@openai/agents`](https://github.com/openai/openai-agents-js)（openai-agents-js SDK）构建的本地 coding agent，提供 **CLI** 和 **Web UI** 两种交互方式。

- ✅ 支持任何 **OpenAI 兼容模型**，只依赖 `POST /v1/chat/completions` 协议（Ollama / vLLM / LM Studio / DeepSeek / 通义 / 硅基流动等均可）
- ✅ Windows 原生运行，**无需 Docker 沙箱**（通过路径越界防护 + 命令人工审批保安全）
- ✅ 流式输出、工具调用可视化
- ✅ shell 命令执行前**人工审批**（基于 SDK 的 interruptions / human-in-the-loop 机制）
- ✅ 多轮对话记忆

## 内置工具

| 工具 | 说明 | 审批 |
|---|---|---|
| `list_dir` | 列目录 | 无需 |
| `read_file` | 读文件（带行号、分页） | 无需 |
| `write_file` | 写文件 | 无需 |
| `edit_file` | 精确字符串替换编辑 | 无需 |
| `glob` | 按模式找文件 | 无需 |
| `grep` | 正则搜索代码 | 无需 |
| `run_command` | 执行 shell 命令 | **需人工批准**（可配置关闭） |

所有文件工具被限制在工作目录内，无法越界访问。

## 快速开始

```bash
npm install
```

### 配置模型（通过 .env）

所有模型配置都放在项目根目录的 **`.env`** 文件里，**源码中绝不硬编码任何模型地址或密钥**。

1. 复制模板：`cp .env.example .env`
2. 填入你的模型服务地址、Key、模型名（`.env.example` 里附了 Ollama / DeepSeek / 通义等常见服务的参考值）

```bash
# .env
SUPERAGENT_BASE_URL=https://api.deepseek.com/v1
SUPERAGENT_API_KEY=sk-your-real-key
SUPERAGENT_MODEL=deepseek-chat
# 可选：SUPERAGENT_WORKSPACE / SUPERAGENT_PORT / SUPERAGENT_AUTO_APPROVE / SUPERAGENT_MAX_TURNS
```

> 必填项 `SUPERAGENT_BASE_URL` / `SUPERAGENT_API_KEY` / `SUPERAGENT_MODEL` 缺失时，启动会**直接报错并提示去哪里配置**，而不会静默套用错误默认值。

**其他覆盖方式（优先级从高到低：命令行 > 环境变量 > .env 文件）**：
- 环境变量：直接 `export SUPERAGENT_BASE_URL=...` 会在运行时覆盖 `.env`
- 命令行：`node src/cli.js --base-url ... --api-key ... --model ...`

### CLI 模式

```bash
npm run cli
```

```
你 > 帮我看看 src 目录结构，然后修复 utils.js 里的 bug
  ⚙ 调用工具 list_dir {"path":"src"}
  ↳ cli.js  config.js ...
  ⚠ 待审批：run_command
    {"command":"npm test"}
    允许执行？ (y/n) >
```

### Web UI 模式（官方推荐 · ai-sdk-ui）

Web UI 基于 openai-agents-js 官方示例 `examples/ai-sdk-ui` 构建（Next.js 16 + Vercel AI SDK v6 + `@openai/agents-extensions`），使用 AI SDK 的 UI Message Stream 协议：

- Markdown 渲染、代码高亮、工具调用卡片、reasoning 展示
- 流式输出
- `run_command` 触发人工审批时，界面出现**「批准执行 / 拒绝」**按钮，点击后通过 AI SDK 的 `tool-approval-response` 机制回传，服务端用保存的 run 状态续跑

```bash
npm run web
# 打开 http://localhost:3800
```

> 旧版 Express + SSE 手写界面仍保留在 `src/server.js` + `public/index.html`，可用 `npm run web:legacy` 启动。

Web 应用代码位于 `web/`：

```
web/
  src/app/page.tsx              聊天页（生成 sessionId，挂载 ChatView）
  src/app/components/ChatView.tsx  官方 ChatView 适配版（含审批按钮）
  src/app/api/chat/route.ts    /api/chat 路由（run 流 + 审批续跑）
  src/lib/config.ts            .env 加载（项目根 .env）
  src/lib/tools.ts             7 个工具（同内核，TS 版）
  src/lib/agent.ts             agent 内核（chat_completions）
  src/lib/messageConverters.ts UIMessage ↔ AgentInputItem 转换
```

### 端到端测试（无需真实模型）

```bash
npm run test:e2e
```

自带一个只实现 `chat/completions` 流式协议的 mock 服务，验证「工具调用 → 审批中断 → 续跑 → 最终回答」完整链路。

## 常见模型服务配置示例

| 服务 | baseURL | 说明 |
|---|---|---|
| Ollama | `http://localhost:11434/v1` | apiKey 随意填 |
| LM Studio | `http://localhost:1234/v1` | apiKey 随意填 |
| vLLM | `http://localhost:8000/v1` | |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 硅基流动 | `https://api.siliconflow.cn/v1` | |
| 通义（兼容模式） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-max` 等 |

> 提示：模型需要支持 **function calling（tool calls）** 才能驱动 agent 工具循环。coding 场景推荐 qwen2.5-coder / deepseek-chat 等对工具调用支持较好的模型。

## 架构

```
src/                          # CLI + 旧版 Web（Express/SSE）内核，纯 ESM
  config.js   配置加载（dotenv/.env + 命令行，模型配置不硬编码于源码）
  tools.js    7 个 coding 工具（文件读写/搜索/命令执行+审批）
  agent.js    agent 内核：chat_completions 协议 + 自定义 baseURL
  cli.js      CLI 交互（readline + 流式 + y/n 审批）
  server.js   Express + SSE 服务端（web:legacy 使用，/api/chat, /api/approve）
web/                          # 新版 Web UI（Next.js 16 + AI SDK v6，官方 ai-sdk-ui 风格）
  src/lib/    config / tools / agent / messageConverters（与 src 同源逻辑，TS 版）
  src/app/    page / ChatView / api/chat 路由
test/
  mock-llm.js 仅 chat/completions 协议的 mock 模型服务
  e2e.js      端到端测试（CLI 内核）
```

关键 SDK 用法（`src/agent.js`）：

```js
setDefaultOpenAIClient(new OpenAI({ apiKey, baseURL }));
setOpenAIAPI('chat_completions');   // 只走 chat/completions，不用 responses API
setTracingDisabled(true);           // 本地模型无需上传 trace
```

审批机制（`needsApproval` + interruptions）：

```js
tool({ name: 'run_command', needsApproval: async () => !cfg.autoApproveShell, ... })
// 运行后检查 stream.interruptions，approve/reject 后用 stream.state 续跑
```
