# Agent Package Guidelines

Read the root [AGENTS.md](../../AGENTS.md) and
[docs/rules/security.md](../../docs/rules/security.md) first.

## Responsibilities

`@cloudagent/agent` adapts the Agent SDK, model providers, instructions, and
local tools. It provides Agent construction but does not own:

- Conversation, AgentRun, Approval, or SQLite persistence.
- Fastify request/reply, SSE, or UI state.
- Project lists or product-level conversation lifecycle.

The server uses this package through `AgentRuntime`. Tools must not import
server modules.

## Tool Security

- All file operations must be explicitly bound to the workspace.
- Shell tools must enforce workspace boundaries, timeout, cancellation, and output limits. Tool approval is currently disabled and reserved for a future fine-grained policy.
- Tool errors should be diagnostic without exposing secrets.
- When changing tool schemas, instructions, or provider configuration, verify
  that server recovery and Timeline mapping remain compatible.

## Verification

```powershell
pnpm --dir packages/agent run build
```

Changes to tool permissions or Agent stream shapes also require the root build
and appropriate server integration or regression tests.
