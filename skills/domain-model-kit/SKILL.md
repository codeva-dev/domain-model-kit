---
name: domain-model-kit
description: Use @codeva-dev/domain-model-kit in a TypeScript application. Use when modeling domains with value objects, entities, aggregate roots, domain events, repositories, persist handlers, or domain errors using the package's pure, neverthrow, or Effect adapters.
---

# Domain Model Kit

## What This Skill Is For

Use `@codeva-dev/domain-model-kit` to build explicit domain models:

- aggregate methods make business decisions
- aggregate roots record domain events
- repositories dispatch recorded events through generated `save(...)`
- persist handlers translate events to storage, outbox rows, projections, or other infrastructure writes

Do not use it as an ORM, application framework, transaction manager, outbox adapter, or full event-sourcing framework.

## Choose One Adapter

Use one adapter consistently inside a bounded context:

```ts
import { AggregateRoot, DomainEvent, Repository } from "@codeva-dev/domain-model-kit/pure"
import { AggregateRoot, DomainEvent, Repository } from "@codeva-dev/domain-model-kit/neverthrow"
import { AggregateRoot, DomainEvent, Repository } from "@codeva-dev/domain-model-kit/effect"
```

- `pure`: direct values, zod schemas, expected failures as thrown errors.
- `neverthrow`: zod schemas, expected failures as `Result`.
- `effect`: Effect Schema, Effect failures, services, layers, and dependency context.

Do not mix classes from different adapters in the same model.

## Domain Modeling Flow

Build write models in this order:

1. Define value objects for validated immutable values.
2. Define domain events for meaningful business state changes.
3. Define entities and aggregate roots for identity and consistency boundaries.
4. Put behavior on aggregate methods.
5. Record domain events inside aggregate methods.
6. Define persist handlers for accepted event classes.
7. Define repositories with generated `save(...)` plus custom load/query methods.
8. Keep HTTP, auth, transactions, retries, logging, queues, and DB policy outside the domain model.

The usual application write flow:

1. Open an application-level transaction boundary.
2. Load the aggregate and read data needed for the rule.
3. Call aggregate methods.
4. Call `repository.save(aggregate)` inside the same boundary.
5. Let persist handlers write storage/outbox/projection changes.

## Save Semantics

`Repository.save(aggregate)`:

- snapshots recorded domain events
- dispatches matching events to persist handlers in order
- calls each handler with accepted events in batch
- clears aggregate events only after all handlers succeed
- leaves events on the aggregate if persistence fails
- is a no-op success when there are no events

Do not override generated `save(...)`. Add custom repository methods for reads or application-specific queries.

## Adapter Notes

Pure and neverthrow use class factories:

```ts
class OrderCreated extends DomainEvent.Class("order.created", PayloadSchema) {}
class Order extends AggregateRoot.Class<OrderId>()(OrderCreated, OrderItemAdded) {}
class OrderPersistHandler extends PersistHandler.Class({ accepts, handle }) {}
class OrderRepository extends Repository.Class({ dbContext, persistHandlers }) {}
```

Effect uses class-first services:

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
}) {
  findById(id: OrderId) {
    return Effect.gen(function* () {
      const db = yield* OrderDb
      // load aggregate
    })
  }
}
```

Effect rules:

- Import `Effect`, `Schema`, and other Effect primitives from `effect`, not from this package.
- `persistHandlers` are service tags such as `[OrderPersistHandler]`, not instances.
- Put `handle` in the `PersistHandler.Service` definition object when event inference should come from `accepts`.
- Resolve DB, transaction, request context, and other services inside the returned `Effect`.
- Use `DomainError.Class(...)` for expected domain/application failures; keep infrastructure/decode/runtime failures out of public domain failure DTOs.

## Checklist

- Keep domain behavior on aggregates.
- Record events for meaningful business changes, not every assignment.
- Keep event payloads stable and serializable.
- Keep persist handlers narrow and event-focused.
- Keep transaction and infrastructure policy outside the package primitives.
- Use generated `save(...)` instead of hand-written repository save method forests.
