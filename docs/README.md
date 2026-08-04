# SuperAgent AI 文档导航

这套文档服务于两类读者：维护项目的人，以及需要在项目中执行任务的 AI
Agent。它把“当前代码是什么”与“未来想做什么”分开，避免 Agent 把设计方案
误当成已经实现的行为。

## 阅读顺序

1. 先读根目录 [AGENTS.md](../AGENTS.md)，了解全局边界、验证要求和文档规则。
2. 再读本页，按任务类型选择 `docs/current/` 和 `docs/rules/` 中的文档。
3. 进入 `server`、`web` 或 `packages` 后，读取最近的目录级 `AGENTS.md`。
4. 最后以源码、测试和 Prisma schema 验证文档中的具体事实。

## 当前事实

以下文档只描述当前代码已经实现的行为：

- [architecture.md](current/architecture.md)：包边界、服务端分层、组合根和当前耦合点。
- [runtime.md](current/runtime.md)：Turn、Run、Agent 执行、审批、租约恢复和 SSE 生命周期。
- [persistence.md](current/persistence.md)：SQLite/Prisma 模型、事务边界、Session 和上下文压缩。
- [api.md](current/api.md)：当前 HTTP/SSE 路由、幂等键和主要响应语义。

## 强制规则

- [architecture.md](rules/architecture.md)：依赖方向、模块职责和允许的跨层访问。
- [testing.md](rules/testing.md)：按风险选择测试和完成前的验证门槛。
- [security.md](rules/security.md)：工作区路径、Shell、审批和敏感配置边界。
- [documentation.md](rules/documentation.md)：如何维护 AI 文档，如何处理现状与提案。

## 设计与提案

`docs/local-agent-architecture.md` 和 `docs/device-mesh-architecture.md` 是
阶段性设计文档。它们包含已实现内容，也包含尚未完成的规划，因此不能替代
`docs/current/`。当设计落地后，应把验证过的事实同步到 current 文档，并在
设计文档顶部更新状态。

## 按任务查文档

| 任务 | 必读文档 |
| --- | --- |
| 新增或修改服务端模块 | `AGENTS.md`、`server/AGENTS.md`、`current/architecture.md`、`rules/architecture.md` |
| 修改 Run、审批、恢复或 SSE | `server/AGENTS.md`、`current/runtime.md`、`current/persistence.md`、`rules/testing.md` |
| 修改 Prisma、Session 或压缩 | `current/persistence.md`、`rules/architecture.md`、`rules/testing.md` |
| 修改 Agent、模型或工具 | `packages/agent/AGENTS.md`、`current/runtime.md`、`rules/security.md` |
| 修改 Web UI 或事件展示 | `web/AGENTS.md`、`current/api.md`、`current/runtime.md` |
| 只做文档或架构评审 | `current/architecture.md`、`rules/documentation.md`，再核对源码和测试 |

## 文档状态

当前文档是随代码建立的第一版基线。它优先记录已经落地的本地 Agent、持久化
Run、审批恢复、Timeline 和上下文压缩；设备互联、正式 Prisma migration、
跨进程可靠事件分发仍属于后续演进，不在 current 文档中宣称为已完成能力。
