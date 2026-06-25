---
name: domain-model-kit
description: Domain modeling with @codeva-dev/domain-model-kit. Use when adding or reviewing TypeScript aggregate roots, domain events, repositories, persist handlers, domain errors, or pure/neverthrow/effect adapter usage.
---

# Domain Model Kit

Use `@codeva-dev/domain-model-kit` to build an event-first model: aggregate methods make business decisions, record domain events, and repositories dispatch those events through generated `save(...)`.

It is not an ORM, transaction manager, outbox adapter, application framework, or event-sourcing framework.

## Process

1. Pick exactly one adapter for the bounded context.

   Completion criterion: every imported primitive in the model comes from the same subpath: `/pure`, `/neverthrow`, or `/effect`.

2. Model the write boundary event-first.

   Completion criterion: every state-changing aggregate method either records a meaningful domain event or has an explicit reason not to.

3. Wire persistence through handlers, not repository save methods.

   Completion criterion: every persisted event class is accepted by at least one persist handler, and repositories use generated `save(...)` for dispatch.

4. Keep infrastructure outside the domain model.

   Completion criterion: HTTP, auth, transaction, retry, logging, queue, and DB policy live in application/infrastructure code; persist handlers only translate accepted events to writes.

## Adapter Choice

```ts
import { AggregateRoot, DomainEvent, Repository } from "@codeva-dev/domain-model-kit/pure"
import { AggregateRoot, DomainEvent, Repository } from "@codeva-dev/domain-model-kit/neverthrow"
import { AggregateRoot, DomainEvent, Repository } from "@codeva-dev/domain-model-kit/effect"
```

- `pure`: zod schemas, direct values, expected failures as thrown errors.
- `neverthrow`: zod schemas, expected failures as `Result`.
- `effect`: Effect Schema, Effect failures, services, layers, and dependency context.

Do not mix adapter classes in one model.

## Save Contract

`Repository.save(aggregate)` snapshots recorded events, dispatches matching events to persist handlers in order, and clears aggregate events only after every handler succeeds.

- Zero events: no-op success.
- Handler failure: events remain on the aggregate.
- Custom persistence reads/queries: add repository methods.
- Custom event dispatch: do not override `save(...)`.

## Pure And Neverthrow Shape

Pure and neverthrow use class factories:

```ts
class OrderCreated extends DomainEvent.Class("order.created", PayloadSchema) {}
class Order extends AggregateRoot.Class<OrderId>()(OrderCreated, OrderItemAdded) {}
class OrderPersistHandler extends PersistHandler.Class({ accepts, handle }) {}
class OrderRepository extends Repository.Class({ dbContext, persistHandlers }) {}
```

Rules:

- Use zod schemas for payload/value validation.
- Pass handler instances to `persistHandlers`.
- In pure, expected failures may throw.
- In neverthrow, expected failures should stay in `Result`.

## Effect Shape

Effect uses class-first services. Import Effect primitives from `effect`, not from this package.

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

Rules:

- `persistHandlers` contains service tags such as `[OrderPersistHandler]`, not instances.
- Put `handle` in the `PersistHandler.Service` definition when event types should be inferred from `accepts`.
- Resolve DB, transaction, request context, and other services inside the returned `Effect`.
- Use `DomainError.Class(...)` for expected domain/application failures.
- Keep infrastructure, decode, and runtime layer failures out of public domain failure DTOs.
