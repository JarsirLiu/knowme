# Web Module Guidelines

Read the root [AGENTS.md](../AGENTS.md),
[docs/current/api.md](../docs/current/api.md), and
[docs/current/runtime.md](../docs/current/runtime.md).

## Web Boundary

- Use `@cloudagent/client` for API and SSE access; do not depend directly on
  server source, Prisma, or the database.
- Use request, response, and Timeline types from `@cloudagent/core`; update
  both client and server when contracts change.
- Keep Draft Conversations in frontend memory until the first message
  succeeds, then replace them with the server `conversationId`.
- The Timeline reducer must handle duplicate connections, historical replay,
  and events arriving by sequence.
- UI state must not provide authorization; approval, rejection, and
  cancellation must call server APIs.

## Streaming Chat Changes

Inspect `useAgentChat`, the reducer, SSE parser, Timeline message components,
and client reconnection logic. Do not fix server event ordering problems only
in a display component.

## Verification

```powershell
pnpm run build:web
```

For core/client/server contract changes, also run the root `pnpm run build`.
