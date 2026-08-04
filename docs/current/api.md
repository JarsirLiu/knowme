# 当前 API 合同

状态：以 `server/src/modules/*/*.routes.ts` 和 `packages/core` 类型为准。

## Project 与目录

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/directories?path=...` | 列出允许访问的目录 |
| `GET` | `/api/projects` | 列出 Project |
| `POST` | `/api/projects` | 创建 Project，body 为 `name`、`rootPath` |
| `GET` | `/api/projects/:projectId/conversations` | 列出项目会话 |

## Conversation 与运行

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `POST` | `/api/projects/:projectId/turns` | Draft 首条消息；创建或复用 Conversation 并排队 Run |
| `POST` | `/api/conversations/:conversationId/turns` | 已有会话追加消息并排队 Run |
| `GET` | `/api/conversations/:conversationId/timeline` | 查询持久化 Timeline |
| `GET` | `/api/conversations/:conversationId/events` | SSE 订阅；支持 `Last-Event-ID` |
| `DELETE` | `/api/conversations/:conversationId` | 归档会话并隐藏其历史 |
| `POST` | `/api/conversations/:conversationId/context/compact` | 手动触发上下文压缩 |
| `POST` | `/api/conversations/:conversationId/runs/:runId/cancel` | 请求取消 Run |

Turn body 当前是：

```json
{
  "message": "请检查这个项目",
  "clientMessageId": "client-generated-id"
}
```

`clientMessageId` 用于重试幂等。客户端若未提供，路由会生成 UUID，但需要可靠
重试的调用方应自行稳定保存该 ID。

Conversation 列表、Timeline 和 Turn 响应中的 `conversation.runtimeStatus` 描述
当前运行态：`idle`、`queued`、`running`、`waiting_approval`、`failed`、
`interrupted` 或 `cancelled`。删除/归档仍有活动 Run（包括 queued、running 和
waiting_approval）时返回 HTTP 409，调用方应等待收尾或先取消 Run。

## 审批与设备

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `POST` | `/api/conversations/:conversationId/approvals/:toolCallId/approve` | 批准工具调用 |
| `POST` | `/api/conversations/:conversationId/approvals/:toolCallId/deny` | 拒绝工具调用 |
| `GET` | `/api/devices` | 列出设备预留记录 |
| `POST` | `/api/devices` | 注册设备预留记录 |

设备接口目前只是本地 CRUD，不代表已经实现 Device Mesh、Hub 路由或远程执行。

## API 修改规则

- 修改路径、body、响应字段或 SSE 事件时，同时更新 `packages/core` 类型、
  `packages/client`、Web 调用方和本页。
- 不要让 route handler 直接调用 Prisma；把业务行为放入 service/coordinator。
- 新增流式事件时，明确它的持久化顺序、重连语义和 UI reducer 行为。
- 兼容旧客户端时，记录兼容期限或迁移策略，不要无限期增加重复分支。
