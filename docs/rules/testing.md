# 测试与验证规则

## 风险匹配

- 纯类型或展示改动：至少运行对应包构建。
- API 或跨包合同改动：运行 `pnpm run build`，并验证 client/core 编译。
- Service、Repository、Session 或 Timeline 改动：增加或运行服务端回归测试。
- Run、审批、取消、租约或恢复改动：覆盖成功、失败、重试、竞态或重启路径中
  受影响的场景。
- 路径、Shell、网络工具或审批策略改动：验证越界、拒绝和超时行为。

## 服务端基线

```powershell
pnpm run test:server
pnpm run build
git diff --check
```

`server/test/architecture-boundaries.test.ts` 用于防止跨层依赖回退；
`server/test/local-persistence.test.ts` 用于验证本地数据库、幂等、Session、
审批和持久化生命周期。架构重构不能只验证“能编译”。

## 测试原则

- 优先用小型 hand-written fake 和明确的依赖注入测试边界。
- 断言状态、事件顺序、幂等结果和错误语义，不只断言 Promise 成功。
- 测试中不要依赖提交后的 `dist` 或已有本地数据库状态。
- 新增回归测试应说明它保护的是哪一条架构或用户合同。
