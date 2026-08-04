# Server Module Guidelines

Read the root [AGENTS.md](../AGENTS.md), then read:

- [docs/current/architecture.md](../docs/current/architecture.md)
- [docs/current/runtime.md](../docs/current/runtime.md)
- [docs/current/persistence.md](../docs/current/persistence.md)
- [docs/rules/architecture.md](../docs/rules/architecture.md)
- [docs/rules/security.md](../docs/rules/security.md)

## Server Boundary

`server/src/modules/index.ts` is the composition root. Assemble and inject
dependencies there; keep routes, services, coordinators, repositories, and
runtimes within their respective responsibilities.

- `*.routes.ts` handles HTTP parameters, responses, and SSE connections.
- `*.service.ts` orchestrates product use cases and business validation.
- `*-repository.ts` owns Prisma access and persistence transactions.
- `RunCoordinator` owns queuing, claiming, leasing, cancellation, and recovery.
- `AgentRunExecutor` executes one claimed Run.
- `AgentRuntime` is the Agent SDK adapter boundary.
- `TimelineEventStore` owns durable ordering and post-transaction publication.

New code must not directly import `../../db/client.js` from routes, chat
runtimes, or services. Known exceptions are database infrastructure,
repositories, the Event Store, and `ensure-database.ts`; do not copy the
device module's direct Prisma access, which remains a known cleanup item.

## Lifecycle Requirements

When changing Run, Approval, Session, or Timeline behavior, preserve:

- `clientMessageId` idempotency.
- State changes conditioned on the current state or lease owner.
- Atomic persistence of resumable state and waiting approvals.
- Timeline publication only after the transaction succeeds.
- Cancellation, restart, lease expiry, and duplicate claims must not overwrite
  results owned by a newer lease.

## Verification

```powershell
pnpm run test:server
pnpm run build:server
```

For cross-package or API changes, also run the root `pnpm run build`. When
changing architecture boundaries, update `server/test/architecture-boundaries.test.ts`
or add a focused test.
