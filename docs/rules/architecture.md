# 架构规则

## 依赖方向

允许的方向是：

```text
web -> client -> core
server -> agent/core
agent -> core
```

`core` 不能依赖任何应用层包。`agent` 不能依赖 server。Web 不能依赖 Prisma、
Fastify 或 server 内部路径。

## Server 模块边界

- Route：HTTP 适配，不做持久化查询和长流程编排。
- Service：一个或一组相关用例的业务编排，不隐藏多个无关领域。
- Repository：数据库查询、事务和持久化映射。
- Coordinator：跨组件生命周期、调度、恢复和并发控制。
- Runtime：Agent SDK 的适配，不处理 HTTP 或业务表。
- Event Store：事件写入、序号和发布时机。

Prisma 直接依赖只允许出现在 `db`、Repository、Event Store 和明确的数据库迁移
兼容代码中。新模块不得复制 `DeviceService` 这种 service 直连 Prisma 的模式。

## 事务与事件

状态写入和用户可见事件需要一致时，先事务写库，事务成功后再发布。不能依赖
“先广播，失败后补库”来维持一致性。

## 组合根

生产依赖应在 `server/src/modules/index.ts` 组装。类可以保留默认实现以兼容旧调用
或简化独立使用，但新业务代码不要在深层模块中随意 `new` 互相耦合的实现。

## 何时新增抽象

满足以下至少一项时才新增接口或类：

- 隔离外部系统（数据库、SDK、文件系统、网络）。
- 让并发、恢复或安全策略可独立测试。
- 一个职责已经有两个稳定变化方向。
- 需要替换实现或支持第二种运行模式。

不要为了让文件数量看起来更“分层”而机械拆分简单 CRUD。
