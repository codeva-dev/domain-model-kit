---
name: domain-model-kit
description: Use @codeva-dev/domain-model-kit in a TypeScript application. Use when modeling domains with value objects, entities, aggregate roots, domain events, repositories, persist handlers, or domain errors using the package's pure, neverthrow, or Effect adapters.
---

# Domain Model Kit

## Purpose

Use `@codeva-dev/domain-model-kit` to model application domains around explicit aggregate behavior and recorded domain events. The aggregate owns business decisions; repositories dispatch recorded events to persist handlers; infrastructure concerns stay outside the model.

Do not treat the package as an ORM, application framework, transaction manager, outbox adapter, or event-sourcing framework. It provides domain modeling primitives and an event-dispatching persistence boundary.

## Pick An Adapter

Choose exactly one adapter for a bounded context unless there is a strong migration reason.

```ts
import { AggregateRoot, DomainEvent, Repository } from "@codeva-dev/domain-model-kit/pure"
import { AggregateRoot, DomainEvent, Repository } from "@codeva-dev/domain-model-kit/neverthrow"
import { AggregateRoot, DomainEvent, Repository } from "@codeva-dev/domain-model-kit/effect"
```

- Use `pure` for direct values and exception-based domain failures.
- Use `neverthrow` when expected failures should be `Result` values.
- Use `effect` when the application already uses Effect, layers, services, and Effect Schema.

The adapters share names and concepts, but not runtime types. Do not mix classes from different adapters in one model.

## Modeling Flow

Model write behavior in this order:

1. Define value objects for validated immutable values.
2. Define domain events for meaningful state changes.
3. Define entities and aggregate roots for identity and consistency boundaries.
4. Put business decisions on aggregate methods.
5. Record domain events inside aggregate methods.
6. Create persist handlers that accept and persist specific event classes.
7. Create a repository that generates `save(...)` and exposes custom query/load methods.
8. Put transactions, auth, retries, logging, queues, and framework boundaries outside the domain model.

The normal application write flow is:

1. Open an application-level transaction boundary.
2. Load the aggregate and related read data needed for the rule.
3. Call aggregate methods.
4. Call `repository.save(aggregate)` inside the same boundary.
5. Let persist handlers update storage, append event records, insert outbox rows, or update projections.

## Event Persistence Semantics

`Repository.save(aggregate)` reads the aggregate's recorded events, dispatches them to matching persist handlers, and clears events only after every handler succeeds.

- Saving an aggregate with no recorded events is a no-op success.
- Events are dispatched in recorded order and handler order.
- Persist handlers receive accepted events in batch.
- If any handler fails, recorded events remain on the aggregate so the caller can retry or fail the transaction.
- Persist handlers should not own retry policy, transaction boundaries, or telemetry policy.

## Pure Adapter

Use the pure adapter when direct returns and thrown domain errors fit the project.

```ts
import { AggregateRoot, DomainEvent, PersistHandler, Repository } from "@codeva-dev/domain-model-kit/pure"
import z4 from "zod/v4"

class OrderCreated extends DomainEvent.Class("order.created", z4.object({
  orderId: z4.string(),
  items: z4.array(z4.string()),
})) {}

class Order extends AggregateRoot.Class<string>()(OrderCreated) {
  private constructor(id: string, public readonly items: readonly string[]) {
    super(id)
  }

  static create(id: string, items: string[]) {
    const order = new Order(id, items)
    order.recordDomainEvent(OrderCreated.create({
      instanceId: id,
      payload: { orderId: id, items },
    }))
    return order
  }
}

type DbContext = { orders: Map<string, { id: string; items: string[] }> }
const db: DbContext = { orders: new Map() }

class OrderPersistHandler extends PersistHandler.Class({
  accepts: [OrderCreated],
  handle(events, context: DbContext) {
    for (const event of events) {
      context.orders.set(event.payload.orderId, {
        id: event.payload.orderId,
        items: [...event.payload.items],
      })
    }
  },
}) {}

class OrderRepository extends Repository.Class({
  dbContext: db,
  persistHandlers: [new OrderPersistHandler()],
}) {
  findById(id: string) {
    // Load and return Order.
  }
}
```

Use `save(aggregate, context)` when pure persistence needs per-call context such as a transaction object.

## Neverthrow Adapter

Use the neverthrow adapter when expected domain and persistence failures should stay in `Result` instead of exceptions.

```ts
import { ok } from "neverthrow"
import { AggregateRoot, DomainEvent, PersistHandler, Repository } from "@codeva-dev/domain-model-kit/neverthrow"
import z4 from "zod/v4"

class OrderCreated extends DomainEvent.Class("order.created", z4.object({
  orderId: z4.string(),
  items: z4.array(z4.string()),
})) {}

type DbContext = { orders: Map<string, { id: string; items: string[] }> }
const db: DbContext = { orders: new Map() }

class OrderPersistHandler extends PersistHandler.Class({
  accepts: [OrderCreated],
  handle(events, context: DbContext) {
    for (const event of events) {
      context.orders.set(event.payload.orderId, {
        id: event.payload.orderId,
        items: [...event.payload.items],
      })
    }

    return ok(undefined)
  },
}) {}

class OrderRepository extends Repository.Class({
  dbContext: db,
  persistHandlers: [new OrderPersistHandler()],
}) {
  findById(id: string) {
    // Return Result<Order, Error>.
  }
}
```

Keep expected application failures in the `Result` error branch. Reserve thrown exceptions for defects or truly unexpected runtime failures.

## Effect Adapter

Use the Effect adapter with Effect services, layers, and Effect Schema. Import Effect primitives from `effect`, not from this package.

```ts
import { Effect, Schema } from "effect"
import { AggregateRoot, DomainEvent, PersistHandler, Repository } from "@codeva-dev/domain-model-kit/effect"
```

Use class-first services:

```ts
class OrderCreated extends DomainEvent.Class("order.created", Schema.Struct({
  orderId: Schema.String,
  items: Schema.Array(Schema.String),
})) {}

class OrderDb extends Effect.Service<OrderDb>()("OrderDb", {
  succeed: {
    orders: new Map<string, { id: string; items: string[] }>(),
  },
}) {}

class OrderPersistHandler extends PersistHandler.Service<OrderPersistHandler>()(
  "OrderPersistHandler",
  {
    accepts: [OrderCreated],
    dependencies: [OrderDb.Default],
    handle: (events) =>
      Effect.gen(function* () {
        const db = yield* OrderDb

        for (const event of events) {
          db.orders.set(event.payload.orderId, {
            id: event.payload.orderId,
            items: [...event.payload.items],
          })
        }
      }),
  },
) {}

class OrderRepository extends Repository.Service<OrderRepository>()(
  "OrderRepository",
  {
    persistHandlers: [OrderPersistHandler],
    dependencies: [OrderDb.Default, OrderPersistHandler.Default],
  },
) {
  findById(id: string) {
    return Effect.gen(function* () {
      const db = yield* OrderDb
      return db.orders.get(id)
    })
  }
}
```

Effect usage rules:

- `Repository.Service<Self>()(...)` generates `save(...)`; define custom methods in the class body.
- Do not define a custom `save`; it is the generated persistence dispatch method.
- `PersistHandler.Service<Self>()(...)` should usually put `handle` in the definition object so event types are inferred from `accepts`.
- `persistHandlers` are service tags such as `[OrderPersistHandler]`, not instances.
- `dependencies` should include the layers needed to construct the repository or handler defaults.
- Resolve DB, transaction, request context, or other services inside the returned `Effect`, not at service construction time.

## Domain Errors

Use domain errors for expected business failures, not infrastructure defects.

In Effect, `DomainError.Class(...)` creates Effect Schema tagged errors. The public encoded shape is intentionally serializable:

```ts
import { Schema } from "effect"
import { DomainError } from "@codeva-dev/domain-model-kit/effect"

const OrderNotFound = DomainError.Class("OrderNotFound", {
  orderId: Schema.String,
})
```

Do not expose raw `Error`, `cause: unknown`, database errors, decode errors, or runtime layer failures as public domain failures. Map only intentional domain/application errors across transport boundaries.

## Usage Checklist

- Keep domain methods on aggregates, not in controllers or persistence adapters.
- Record events for meaningful state changes, not for every property assignment.
- Keep event payloads stable and serializable.
- Keep persist handlers narrow: they persist accepted event classes.
- Keep transaction and infrastructure policy outside this package's primitives.
- Use one adapter consistently inside a bounded context.
- Let generated `save(...)` dispatch recorded events instead of hand-writing repository save forests.
