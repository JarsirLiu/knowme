# 当前持久化模型

状态：与 `server/prisma/schema.prisma` 和服务端实现同步的事实文档。

## 存储

当前使用 Prisma Client + SQLite，数据库默认是
`server/prisma/data.db`。应用启动时 `ensureDatabase` 会连接数据库、启用外键，
并兼容早期本地数据库的补表/补字段逻辑。这个启动补丁机制仍在使用，但新结构
变更不应继续依赖它作为长期 migration 方案。

## 主要模型

```text
Project
  -> Conversation
       -> AgentSession -> SessionItem[]
       -> Message[]
       -> AgentRun[] -> RunEvent[] / Approval[] / Artifact[]
       -> TimelineEvent[] + TimelineSequence

Device (当前为独立 CRUD 预留模型)
```

### Project 与 Conversation

Project 以唯一 `rootPath` 标识本地工作区。Conversation 记录项目归属、标题、
Agent profile、activeRunId 和运行序号。删除 Conversation 会级联删除其 Session、
Message、Run 及相关事件。

### AgentSession 与 SessionItem

SessionItem 保存完整的 Agent SDK `AgentInputItem` JSON，而不是只保存 role/content。
这样工具调用、工具输出和多轮恢复不会被压扁成普通文本。Session repository
负责按 sequence 读写、追加、弹出、清空和整体替换。

### AgentRun

AgentRun 保存输入、输出、SDK 恢复 state、status、attempt、lease、heartbeat、
取消请求和时间戳。`clientMessageId` 唯一约束支撑首条消息和网络重试幂等。

### TimelineEvent 与 RunEvent

TimelineEvent 是面向 Conversation/UI 的有序事件流，使用 Conversation 级
TimelineSequence。RunEvent 是 Run 级事件存储模型；当前主要 UI 广播路径使用
TimelineEventStore。新增事件时必须明确它属于运行内部事件还是用户可见 Timeline。

### Approval 与 Artifact

Approval 保存工具调用参数、pending/resolved 状态、decision 和时间戳。Artifact
保存文件元数据和本地路径；大文件不应塞入模型上下文或 Timeline payload。

## 原子性规则

以下组合必须在同一事务中完成，或者有明确的可恢复补偿逻辑：

- 创建首条 Turn 的 Conversation、Session、用户 Message 和 AgentRun。
- Run 状态变化与对应的 Timeline 事件。
- 进入 `waiting_approval`、保存 state、创建 Approval 和写入等待事件。
- Run 完成、保存 assistant Message、清除 activeRun 和写入完成事件。
- Timeline sequence 分配与 TimelineEvent 写入。

TimelineEventStore 的 publish 必须发生在事务成功以后。事务回滚时不能让 SSE
客户端看到一个数据库中不存在的事件。

## Session 压缩

History 模块通过 `SessionCompactionCoordinator` 编排自动或手动压缩：

1. 从 repository 读取 SessionItem。
2. 根据配置估算 token 使用量和触发阈值。
3. 保留最近完整 turn，排除不适合摘要的 reasoning item。
4. 通过 ContextSummarizer 生成摘要。
5. 用摘要 item + 最近 item 原子替换 SessionItem。
6. 持久化一条上下文压缩 Timeline/Message 投影供 UI 展示。

压缩策略、token 估算、摘要器和 Prisma 持久化是不同职责。新增策略时应优先
扩展 `CompactionPolicy` 或配置，而不是把条件堆进 AgentSession。

## 数据库演进风险

当前 `ensure-database.ts` 包含运行时 schema 兼容逻辑。它是本地版本升级的过渡
措施，不是完整迁移审计。未来迁移数据库时，需要保留旧数据库升级能力、验证
数据兼容，并更新本页和启动/部署说明。
