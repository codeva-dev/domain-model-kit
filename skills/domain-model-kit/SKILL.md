---
name: domain-model-kit
description: Boundary-first domain modeling with @codeva-dev/domain-model-kit. Use when adding, refactoring, or reviewing TypeScript aggregate boundaries, domain events, repositories, persist handlers, domain errors, or pure/neverthrow/effect adapter selection.
---

# Domain Model Kit

Use `@codeva-dev/domain-model-kit` to design domain boundaries. The package helps aggregate methods make business decisions, record domain events, and let repositories dispatch those events through generated `save(...)`.

It is not an ORM, transaction manager, outbox adapter, application framework, or event-sourcing framework.

## Documentation

Use the package README as the API source of truth when exact constructors, imports, or examples matter:

- local repo: `README.md`
- installed/GitHub package: `https://github.com/codeva-dev/domain-model-kit`

Completion criterion: before emitting non-trivial code, verify the touched adapter's current README section or existing examples instead of relying on memory.

## Boundary Process

1. Select the runtime boundary.

   Choose one adapter for the bounded context:

   - `pure`: zod schemas, direct values, expected failures as thrown errors.
   - `neverthrow`: zod schemas, expected failures as `Result`.
   - `effect`: Effect Schema, Effect failures, services, layers, and dependency context.

   Completion criterion: every domain-model primitive in the touched model imports from exactly one subpath: `/pure`, `/neverthrow`, or `/effect`.

2. Place the aggregate boundary.

   Aggregate roots own consistency decisions. Entities and value objects support the aggregate; application services orchestrate but do not hide business rules that belong on the aggregate.

   Completion criterion: each state-changing business rule is either implemented on an aggregate method or explicitly left outside because it crosses aggregate/application boundaries.

3. Place the event boundary.

   Record domain events for meaningful business changes, not for technical persistence steps or every property assignment.

   Completion criterion: every recorded event has a stable, serializable payload and a business name that would make sense outside the persistence adapter.

4. Place the persistence boundary.

   Repositories load/query aggregates and use generated `save(...)` for event dispatch. Persist handlers accept event classes and translate them to storage, outbox rows, projections, or other writes.

   Completion criterion: every persisted event class is accepted by at least one handler, no repository overrides `save(...)`, and transaction/retry/logging policy stays outside handlers.

5. Place the error boundary.

   Domain errors represent expected business/application failures. Infrastructure, decode, database, config, and runtime-layer failures should not become public domain failures.

   Completion criterion: expected failures use the chosen adapter's error channel, while non-domain failures stay outside the domain error surface.

## Adapter Shapes

Pure and neverthrow use class factories:

```ts
class OrderCreated extends DomainEvent.Class("order.created", PayloadSchema) {}
class Order extends AggregateRoot.Class<OrderId>()(OrderCreated, OrderItemAdded) {}
class OrderPersistHandler extends PersistHandler.Class({ accepts, handle }) {}
class OrderRepository extends Repository.Class({ dbContext, persistHandlers }) {}
```

Pure passes handler instances and may throw expected failures. Neverthrow passes handler instances and keeps expected failures in `Result`.

Effect uses class-first services. Import Effect primitives from `effect`, not from this package:

```ts
import { Effect, Schema } from "effect"
import { DomainError, DomainEvent, PersistHandler, Repository } from "@codeva-dev/domain-model-kit/effect"

class OrderCreated extends DomainEvent.Class("order.created", Schema.Struct({ orderId: Schema.String })) {}

class OrderPersistHandler extends PersistHandler.Service<OrderPersistHandler>()("OrderPersistHandler", {
  accepts: [OrderCreated],
  dependencies: [OrderDb.Default],
  handle: (events) => Effect.gen(function* () {
    const db = yield* OrderDb
    // persist accepted events
  }),
}) {}

class OrderRepository extends Repository.Service<OrderRepository>()("OrderRepository", {
  persistHandlers: [OrderPersistHandler],
  dependencies: [OrderDb.Default, OrderPersistHandler.Default],
}) {}
```

Effect boundaries:

- `persistHandlers` contains service tags such as `[OrderPersistHandler]`, not instances.
- Put `handle` in `PersistHandler.Service` when event types should be inferred from `accepts`.
- Resolve DB, transaction, request context, and other services inside the returned `Effect`.
- Use `DomainError.Class(...)` for expected domain/application failures.

## Save Contract

`Repository.save(aggregate)` snapshots recorded events, dispatches matching events to persist handlers in order, and clears aggregate events only after every handler succeeds.

- Zero events: no-op success.
- Handler failure: events remain on the aggregate.
- Custom reads/queries: add repository methods.
- Custom dispatch: do not override `save(...)`.
