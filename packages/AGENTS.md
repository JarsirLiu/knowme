# Shared Package Guidelines

Read the root [AGENTS.md](../AGENTS.md) first. Packages under `packages/` are
reusable boundaries and must not depend on `server` or `web`.

## Package Responsibilities

- `core` contains cross-package contracts and side-effect-free types or small
  pure functions.
- `client` wraps HTTP, SSE, client errors, and core types; it does not
  implement server business logic.
- `agent` owns model, Agent SDK, and tool construction. See also
  [packages/agent/AGENTS.md](agent/AGENTS.md).

Do not introduce Prisma, Fastify, React, or local database details into shared
packages. When changing exported types, inspect callers in `server`, `client`,
and `web`, then run the relevant package build.
