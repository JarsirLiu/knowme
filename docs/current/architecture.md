# 当前架构

状态：与当前源码同步的事实文档。

## 系统边界

CloudAgent 是一个本地 coding agent 工作台。Web UI 通过 typed client 调用
Fastify API；服务端负责产品状态、运行调度、持久化和恢复；Agent package 负责
模型与工具构造；Core package 提供跨包协议。

```text
React Web
  -> @cloudagent/client (HTTP + SSE)
  -> @cloudagent/core (types + event contracts)
  -> Fastify server
       -> application services and coordinators
       -> Prisma repositories / event stores
       -> SQLite
       -> @cloudagent/agent
            -> Agents SDK + compatible model + local tools
```

## 包职责

### `packages/core`

定义请求、响应、Project、Conversation、Run、Session、Tool Call 和 Timeline
事件类型。这里不能依赖 Fastify、Prisma、React 或模型 SDK。

### `packages/agent`

`createCodingAgent` 负责创建模型、Agent、Explorer/Reviewer 子 Agent 和本地
工具集合。当前模型通过 `@openai/agents-extensions/ai-sdk` 包装 AI SDK 的
Chat Completions provider，并使用配置的 `baseURL` 连接兼容端点。工具以 workspace
为安全边界。该包不应该知道 Conversation、AgentRun、SQLite 或 HTTP 请求。

### Skill 系统（`packages/agent/src/skills/`）

Skill 是扩展 agent 能力的本地机制，采用 `SKILL.md` 格式（YAML frontmatter + Markdown 正文），
对齐 Codex 的 skill 约定。Skill 目录按层级解析，统一由 `packages/core` 的
`CloudagentPaths` 计算，避免路径散落各处。

- 层级与优先级：项目级 `<project>/.cloudagent/skills/` > 用户级
  `CLOUDAGENT_HOME/skills/`（默认 `~/.cloudagent/skills/`）> 系统级
  `CLOUDAGENT_HOME/.system/skills/`（内置只读）。`loadSkills` 按此顺序扫描并合并，
  高优先级同名覆盖低优先级。
- 格式：每个 skill 目录包含一个 `SKILL.md`，frontmatter 提供 `name`、`description`、`version`，
  正文是模型执行的指令。可选目录 `references/`（参考文档）和 `scripts/`（可执行脚本）。
- 按需注入：`createCodingAgent` 不再把所有 skill 注入 prompt。用户在消息中使用 `$skill-name`
  显式提及某个 skill 时，`AgentRunExecutor` 会解析提及、加载对应 `SKILL.md`，并把指令以
  `<skill></skill>` 片段注入该次输入；未提及的 skill 不进入上下文。
- 管理工具：`createSkillTools()` 生成四个工具（`list_skills`、`install_skill`、`create_skill`、
  `read_skill_reference`），挂载到主 Agent 的 `tools` 数组，使模型能在运行时自行管理 skill。
  `create_skill`/`install_skill` 接受 `scope`（`project` 默认 / `user`），由模型询问用户后写入
  对应层级。
- 生效时机：skill 在每次 turn 由 `AgentRunExecutor` 加载（`loadSkills`）。新安装或创建的 skill
  需要等到下一次 turn 才生效。
- 依赖方向：skill 系统只依赖 `@cloudagent/core` 的 `CloudagentPaths` 以及本包内部的
  `skill/parser`、`mention` 和 `node:fs`，不依赖 server 或 client。`AgentRunExecutor`
  通过 `@cloudagent/agent` 导出的 `resolveMentions`/`loadSkills` 接入提及解析。

### `packages/client`

封装 API 请求、响应解析、SSE 订阅、断线重连和客户端错误。Web 不应自行拼接
服务端内部数据结构或直接调用 `fetch` 访问未封装的业务接口。

### `server`

服务端按模块组织：

| 模块 | 当前职责 |
| --- | --- |
| `projects` | Project 持久化、路径校验、目录浏览 |
| `conversations` | Conversation 创建、列表、删除、Timeline 查询、旧数据迁移 |
| `chat` | Turn 编排、Agent runtime 适配、流式事件映射、一次 Run 执行 |
| `runs` | Run 排队、claim、租约、取消、恢复和生命周期状态变更 |
| `approvals` | 工具审批查询、批准/拒绝和持久化 |
| `history` | Agent Session 持久化、Session lifecycle、上下文压缩策略与摘要 |
| `events` | Timeline 事件原子写入、查询和进程内发布 |
| `devices` | 当前版本的设备 CRUD 预留接口 |

## 服务端分层

```text
routes
  -> application services / coordinators
       -> domain-facing interfaces
            -> Prisma repositories / durable stores
       -> AgentRuntime / event publisher
```

- Routes 只负责参数读取、HTTP 状态码和流连接，不直接访问 Prisma。
- Service 负责一个产品用例的编排和输入约束，不应该同时拥有数据库查询和
  文件系统安全策略。
- Repository 负责 Prisma 查询、事务和数据库行到应用数据的转换。
- `RunCoordinator` 负责调度和生命周期，`AgentRunExecutor` 负责一次已 claim
  Run 的执行，`AgentRuntime` 负责 Agent SDK 的创建和运行。
- `TimelineEventStore` 在事务成功后发布事件；`TimelineEventHub` 只承担进程内
  订阅，不是跨进程消息队列。
- `server/src/modules/index.ts` 是当前组合根，负责实例化实现并连接模块。

## 关键数据流

```text
Draft / existing Conversation
  -> TurnService
  -> ConversationService creates or reuses Conversation + Session + Run
  -> RunCoordinator queues and claims Run
  -> AgentRunExecutor loads Project/Session and invokes AgentRuntime
  -> RunEvent / TimelineEvent / Message / SessionItem are persisted
  -> TimelineEventHub publishes to SSE subscribers
```

首条消息使用 `clientMessageId` 做幂等查找；服务端在一次事务中创建或复用会话、
Session、用户消息和 Run。后续消息进入已有 Conversation，但仍由 Coordinator
负责执行，不在 HTTP 请求中直接运行完整 Agent 循环。

## 当前明确的架构风险

这些是已知的演进点，不应在新代码中继续扩大：

1. `devices/device.service.ts` 仍直接依赖 Prisma，设备模块还没有和其他模块一样
   完整拆出 Repository。
2. `chat/stream-event-mapper.ts` 同时承担 SDK 事件解析和 Timeline 写入调用，
   解析逻辑与持久化端口仍可以继续分离。
3. `db/ensure-database.ts` 在运行时补表和补字段，长期应迁移到正式的 Prisma
   migration 流程。
4. Timeline 发布目前是内存 Hub；单进程内可靠，跨进程分发和持久化 outbox 尚未
   实现。
5. 部分类保留默认构造 Repository 的兼容方式，生产组装仍以
   `server/src/modules/index.ts` 为准；新增代码优先使用组合根注入依赖。

## 修改边界

如果修改模块职责、依赖方向、Run 生命周期、Timeline 一致性或持久化模型，必须
同步更新本页以及对应的 `runtime.md`/`persistence.md`，并补充边界或回归测试。
