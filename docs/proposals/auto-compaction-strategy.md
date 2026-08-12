# Auto-Compaction Strategy

## 背景

项目已实现手动 `/compact` 压缩（`SessionCompactionService` + `persistCompactionMessage`），
且已有 pre-run 自动压缩（`agent-run-executor.ts:98-106` 的 `session.runCompaction()`）。

目标：实现单次 `Runner.run()` 内部多步工具调用循环中的自动压缩，产生 codex 风格的可见压缩事件。

## 已核实的事实

### `callModelInputFilter` 的运行机制

filter 在每次模型调用前执行（`run.js:1356`，`#prepareModelCall`），包括工具循环内每步。
filter 接收 `modelData.input` → 必须返回 `{ input, instructions? }`。

但 filter 返回的修改仅影响**当前步**的模型调用。**后续步的 input 不从 filter 输出构建，而从原始 input 快照重新构建。**

源码 `turnPreparation.js:39-41`：

```js
const turnInput = prepareModelInputItems(input, generatedItems, ...)
```

其中 `input` 是 run 开始时从 session 读取的**原始历史快照**，不会被 filter 修改。
`generatedItems` 是 `state._generatedItems`（累计的产出项）。

### 对压缩的影响

```
模型调用#1: filter(input=[session原文, 用户消息]) → 压缩 → 模型看到[摘要, 近期项]
         → 模型返回工具调用 → generatedItems 追加工具调用+结果

模型调用#2: turnInput = prepareModelInputItems(原始session快照, 累加后的generatedItems)
         → filter(input=[session原文, 用户消息, 工具调用+结果]) → 又超阈值 → 又压缩
```

**每次 filter 都从原始 session 项开始，不是从上次压缩的结果开始。** filter 的压缩不累积到后续步。

### filter 输出会回写 session

`conversation.js:98-108`：filter 返回的 input 被克隆为 `persistedItems`，经
`sessionInputUpdate` → `sessionPersistence.js:51-74` 收集 → `saveToSession` 在 run 结束时写入 session。

所以 filter 的压缩会在 run 结束时持久化，影响的是**下一次 run** 的输入，不是当前 run 的后续步。

### `sessionId` 在 filter 闭包中可用

`agent-run-executor.ts:65`：`sessionId` 在 `execute()` 中定义，filter 闭包可捕获。✓

### `compactedThisRun` 标记

`let compactedThisRun = false` 可在 `execute()` 中定义，filter 闭包捕获。✓

但 filter 不累积到后续步意味着：标记只压缩一次，后续步的 input 仍包含原始 session 项，
仍可能超阈值，但标记阻止了再次压缩 → 模型调用可能失败（context length error）。

## 方案对比

### 方案 A：callModelInputFilter 压缩（不推荐）

**机制：** 在 filter 中每步检查 token，超阈值则调用 `selectRecentTail` + `summarizer` 压缩。

**已验证的问题：**

1. **不累积到后续步**——filter 的修改只影响当前步，后续步从原始 session 快照重新构建，
   每次都需要重新压缩。`compactedThisRun` 标记会导致后续步模型调用超限。

2. **每步都调 summarizer 太贵**——如果不设标记，每次超阈值都调 LLM 生成摘要，
   延迟不可控。

3. **filter 语义不纯**——压缩需要调 `persistCompactionMessage` 写事件、调 observer
   发 timeline 事件，这些是副作用，不适合放在 filter 里。

**正确用途：**
- 注入时间提醒（已实现）
- 脱敏/截断不安全输入
- 作为**安全兜底**：某步输入超限时，直接截掉最旧消息，保证模型调用不崩

### 方案 B：Pre-Run + Post-Run 自动压缩（推荐）

**已在 `agent-run-executor.ts:98-106` 实现 pre-run 压缩。** 在此基础上增加 post-run 压缩：

```typescript
// run() 之前（已有）
await session.runCompaction()
// run() 之后（新增）
const items = await session.getItems()
const tokens = estimateTokens(items)
if (tokens > budget.compactBefore) {
  await session.compact('auto')
}
```

**优势：**
- 复用现有 `SessionCompactionService` + `persistCompactionMessage` 完全不变
- 不阻塞 run 内部模型调用，不影响延迟
- 压缩事件消息自动写入 `message` 表，用户可见
- `maxTurns` 限制 run 内部步数，配合 pre-run 压缩到安全水位，内部超限概率极低

**约束：** 不解决单次 run 内部膨胀。但项目已设 `maxTurns: null`，若实际出现 run 内部超限，
需在 filter 中加**纯截断**（非 summarizer）作为安全兜底。

### 方案 C：Codex 风格自定义 run loop（高成本）

**机制：** 绕过 SDK 的 `Runner.run()`，手写 run loop，在任意步骤间插入压缩。

**优势：** 完全控制压缩时机，可对标 codex 的 PreTurn/MidTurn 压缩。

**成本：** 需重构 `AgentRunExecutor`，放弃 `Runner.run()` 的会话管理、流式、中断恢复等能力。

## 关于 `callModelInputFilter` 的最终结论

`callModelInputFilter` 不适合做 codex 风格的 run 内部摘要压缩。它的修改不累积到后续步，
导致每次超阈值都需要重新压缩，而 summarizer 的 LLM 调用成本使这不可行。

filter 的正确角色是**安全兜底**：当某步输入超限时，直接截掉最旧消息，
保证模型调用不崩。这个操作不需要 LLM 调用，纯计算，每步都可安全执行。

## 建议路线

1. **近期**：完善 pre-run + post-run 压缩（方案 B），确保 run 间水位安全。
2. **中期**：在 filter 中加纯截断兜底，防止单次 run 内超限。
3. **远期**：如果业务需要 codex 级别的 run 内部压缩，评估自定义 run loop（方案 C）的成本。
4. **替代路线**：考虑切换到 OpenAI Responses API 的服务器端自动压缩，`compactionMode: 'auto'`
   由服务器透明处理上下文管理，无需本项目实现压缩逻辑。