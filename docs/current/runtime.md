# 当前运行时与生命周期

状态：与当前源码同步的事实文档。

## Turn 到 Run

一次用户发送对应一个持久化 `AgentRun`。TurnService 负责把 HTTP 请求映射成
启动请求，并把 Run 交给 RunCoordinator；Agent 不直接知道 HTTP 或 Draft。

```text
POST /api/projects/:projectId/turns
  -> validate message + clientMessageId
  -> create/reuse Conversation, Session, Message, Run
  -> enqueue Run
  -> return conversationId + runId

POST /api/conversations/:conversationId/turns
  -> create Message + Run
  -> enqueue Run
```

请求返回后，Coordinator 通过轮询调度器 claim queued Run。这样进程重启后可以
从数据库状态重新发现任务，而不是依赖一个仍然存在的请求 Promise。

## Run 状态

当前持久化状态包括：

```text
queued -> running -> completed
                 -> failed
                 -> cancelled
                 -> interrupted
                 -> waiting_approval -> queued
```

`waiting_approval` 会保存 Agent state 和待审批工具调用；所有审批解决后，协调器
把 Run 重新放回 `queued`。没有可恢复 state 的运行在重启或租约失效时会进入
`interrupted`，而不是假装可以安全续跑。

## Coordinator 与 Executor

### `RunCoordinator`

负责：

- 启动和停止调度循环。
- 从 `RunScheduler` claim queued Run。
- 为运行维护 AbortController。
- 刷新 lease、发现过期 Run、恢复等待审批的 Run。
- 把取消请求转成持久化状态和 Timeline 事件。
- 等待所有执行任务结束后关闭。

### `AgentRunExecutor`

负责一条已经 claim 的 Run：

- 读取 Run、Project 和 Conversation Session。
- 通过 `AgentRuntime` 创建或恢复 Agent。
- 把 SDK stream event 交给事件映射器。
- 保存 checkpoint、heartbeat、审批等待状态和最终输出。
- 处理取消、租约丢失和执行错误。

Executor 不应该自己创建 HTTP response、启动调度 timer 或直接决定下一条 Run。

### Checkpoint recovery

During execution, the executor keeps the latest SDK `RunState` when the stream
fails or is aborted. A run with a checkpoint is returned to `queued` and may be
resumed up to three attempts; user cancellation still ends the run immediately.
An SDK stream that ends without a final output is treated as an incomplete run
and follows the same bounded recovery path instead of being marked completed.

### `AgentRuntime`

是服务端和 `@superagent/agent` 之间的适配端口。它隐藏 Agent 创建、Session
构造和 SDK Runner 细节，便于单测 Executor 和未来替换运行内核。

不同 Conversation 的 Run 可以由 Coordinator 并行执行，默认上限为 4，可通过
`SUPERAGENT_MAX_CONCURRENT_RUNS` 调整；同一 Conversation 仍由 `activeRunId`
保证最多一个 active Run。每个 Conversation 独立拥有 AgentSession、checkpoint、
Timeline 和 SSE 订阅。

AgentSession 持久化 `active`、`archived` 状态、`lastActivityAt` 和 `archivedAt`。
`PrismaAgentSessionLifecycleRepository` 统一负责这些生命周期字段；Session item
写入、Run claim、Run 状态收尾及 Conversation 归档都会通过它更新元数据；
Session 本身跨 Run 保持打开，不在单轮执行结束时销毁。

Conversation API 同时返回由 Run 状态聚合出的 `runtimeStatus`，前端历史 hydration
以该状态恢复 loading 和 Sidebar 状态，而不是从 Timeline 最后一条事件猜测。

## 审批恢复

需要审批的工具调用会在同一数据库事务中：

1. 将 Run 从 `running` 改为 `waiting_approval`。
2. 保存可恢复的 Agent state。
3. 释放 Run lease 和 Conversation activeRun。
4. 写入 `run.waiting_approval` 与 `tool.awaiting_approval` Timeline 事件。
5. 持久化 Approval 行。

用户批准或拒绝后，ApprovalService 只更新持久化审批记录。Coordinator 发现一个
Run 已无 pending approval 后再重新排队，避免审批接口直接运行 Agent。

## Lease 与恢复

每个 Coordinator 有唯一 owner。claim 后 Run 获得有限期 lease；执行中通过
heartbeat 刷新。服务重启、owner 退出或 lease 过期时：

- 有 state 且恢复次数未达到三次：清除旧 owner 后重新排队，从 checkpoint 恢复。
- 有 state 但已达到三次恢复：标记 `interrupted`，写入原因和 Timeline 事件。
- 无 state：标记 `interrupted`，写入原因和 Timeline 事件。

所有改变 Run 状态的持久化操作必须带上状态或 lease owner 条件，防止旧执行者在
失去所有权后覆盖新执行者的结果。

恢复 Run、释放 `activeRunId` 和更新时间在同一个事务中完成，并使用旧
`leaseOwner`/`leaseExpiresAt` 快照作为条件。Conversation 归档会在同一事务中拒绝
任何 active Run；调度器也只 claim active Conversation。

## Timeline 与 SSE

TimelineEventStore 先在事务中分配 conversation sequence 并写入
`TimelineEvent`，事务成功后才调用 TimelineEventHub。SSE 订阅者可使用
`Last-Event-ID` 请求从指定位置之后补发事件；client 包含有限次数的指数退避重连。

当前 Hub 是进程内广播器。数据库是历史查询来源，Hub 不是跨进程事件总线。

SDK 事件路径为：

```text
Agents SDK RunStreamEvent
  -> stream-event-mapper
  -> TimelineEventStore.append / appendOwned
  -> SQLite TimelineEvent
  -> TimelineEventHub
  -> SSE
```

事件映射必须保证一个 provider delta 不重复变成多个 Timeline 事件，并保留
`message.delta`、`reasoning.delta`、`tool.called`、`tool.arguments`、
`tool.output` 等当前 UI 所需事件。

## 运行时修改要求

服务收到 `SIGINT` 或 `SIGTERM` 时，会先关闭 Fastify、停止 RunCoordinator，
再断开 Prisma 数据库连接；重复信号不会重复执行关闭流程。

修改状态转换、恢复、取消、审批或事件顺序时，必须同时检查：

- `server/src/modules/runs/`
- `server/src/modules/chat/agent-run-executor.ts`
- `server/src/modules/approvals/`
- `server/src/modules/events/`
- `server/test/local-persistence.test.ts`
- `server/test/architecture-boundaries.test.ts`

不能只修改 HTTP 路由或 UI 状态来修复一个服务端生命周期问题。
