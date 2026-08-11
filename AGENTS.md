# CloudAgent Repository Guidelines

## AI Reading Protocol

Before changing code, read [docs/README.md](docs/README.md). It is the
navigation entry for this repository.

Read the relevant documents under `docs/current/` for facts about the current
runtime and the relevant documents under `docs/rules/` for mandatory rules.
Documents under `docs/design/`, `docs/proposals/`, and `docs/issues/` are not
descriptions of the current implementation unless the task explicitly asks
about them.

When a task enters a package or server module, also read the nearest nested
`AGENTS.md`. Nested instructions add constraints; they do not replace this
file.

The source code and tests are the final evidence for runtime behavior. If a
document and the code disagree, report the discrepancy and follow the code
until the task deliberately changes the behavior.

## Repository Shape

CloudAgent is a pnpm workspace for a local coding agent:

- `packages/core` - shared domain types, requests, responses, and timeline
  event contracts. It must stay independent of Fastify, Prisma, React, and
  model SDKs.
- `packages/agent` - Agent SDK adapter, model configuration, instructions,
  and local tools. It owns model/tool construction, not product persistence.
- `packages/client` - typed HTTP and SSE client used by the web application.
- `server` - Fastify API, durable conversation/run/session state, approvals,
  scheduling, recovery, and event persistence.
- `web` - React user interface. It talks to the server through
  `@cloudagent/client` and shared `@cloudagent/core` contracts.
- `docs` - current architecture facts, mandatory rules, and future design
  notes.

Keep implementation code in the owning package. Do not put generated output,
local SQLite data, or dependency directories under version control.

## Dependency Direction

The intended dependency direction is:

```text
web -> client -> core
server -> agent + core
agent -> core
```

The server is the composition root for application services. HTTP routes
translate requests and responses; services coordinate use cases; repositories
own persistence details; runtime adapters own Agent SDK execution; event
stores own durable timeline writes and publication. A lower layer must not
reach upward into routes or UI state.

For server changes, read [server/AGENTS.md](server/AGENTS.md). For Agent SDK
or tool changes, read [packages/agent/AGENTS.md](packages/agent/AGENTS.md).
For UI changes, read [web/AGENTS.md](web/AGENTS.md).

## Engineering Rules

- Inspect callers, tests, schema, and configuration before editing a module.
- Prefer the smallest change that preserves existing API, approval, lease,
  recovery, timeline, and session behavior.
- Do not introduce a new service or repository only to rename an existing
  method. Add an abstraction when it owns a real boundary or makes a behavior
  independently testable.
- Do not import Prisma from routes, UI, shared packages, or Agent SDK tools.
- Keep transactions around state changes that must be atomic with their
  durable timeline event. Do not publish a timeline event before its database
  transaction succeeds.
- Treat `clientMessageId`, run leases, approval status, cancellation, and
  timeline sequence numbers as correctness boundaries, not implementation
  details.
- Preserve workspace path and shell approval boundaries. Never broaden tool
  permissions as a shortcut for a failing task.
- New source comments and docstrings should be in English. User-visible text
  belongs in the existing UI contract and should not be invented in a server
  module without checking the client behavior.
- If a change alters a module boundary, lifecycle, persistence contract, API,
  or security rule, update the relevant `docs/current/` document in the same
  change.

## Commands and Verification

Install dependencies with `pnpm install` when needed. Common commands from the
repository root are:

```powershell
pnpm run build
pnpm run build:packages
pnpm run build:server
pnpm run build:web
pnpm run test:server
git diff --check
```

For a narrow change, run the narrowest relevant command first, then run the
broader build or test command when the change crosses package or runtime
boundaries. A task is not complete when the code merely typechecks if it
changes persistence, recovery, approvals, streaming, or path security; add or
run a focused regression test for that behavior.

## Documentation Protocol

Document current behavior in `docs/current/`. Put non-implemented options or
future phases in `docs/design/` or `docs/proposals/`, and label their status.
Do not use a design document as evidence that a feature exists.

When adding a repeated review finding or a stable developer correction,
promote it into `docs/rules/` or this file. Keep documents short, link to the
owning source file, and prefer one authoritative description over duplicated
lists that will drift.

## Git

Only create commits when explicitly requested. Use Conventional Commits:
`<type>(<scope>): <imperative English summary>`.
