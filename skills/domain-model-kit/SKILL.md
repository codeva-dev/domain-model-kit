---
name: domain-model-kit
description: Work on the @codeva-dev/domain-model-kit TypeScript package. Use when modifying its pure, neverthrow, or Effect adapters; changing repository, persist-handler, domain-event, value-object, or domain-error APIs; updating examples or README; validating builds; installing from GitHub; or preparing npm alpha releases.
---

# Domain Model Kit

## Repository Shape

The repository root is the publishable `@codeva-dev/domain-model-kit` package. Keep it that way: do not reintroduce `packages/ddd`, `apps`, or Lerna-style release management.

- Source lives in `src/pure`, `src/neverthrow`, and `src/effect`.
- Public subpaths are `@codeva-dev/domain-model-kit/pure`, `/neverthrow`, and `/effect`.
- Tests live in `test`.
- `examples` is a private TypeScript workspace that depends on the root package through `file:..` and should import only public package subpaths.
- Build output belongs in `dist`; example build output belongs in `examples/dist`.

## Design Rules

Keep the three adapters conceptually cohesive while respecting their runtime differences.

- Pure and neverthrow APIs use class-extension factories such as `Repository.Class(...)`.
- Effect APIs use class-first services such as `Repository.Service<Self>()(...)` and `PersistHandler.Service<Self>()(...)`.
- Prefer minimal, understandable type helpers over broad type machinery.
- Do not add parallel public names unless the existing public name cannot be kept technically.
- Do not change pure or neverthrow implementations for an Effect-only fix unless package cohesion or documentation requires it.
- When fixing inference or interop, add focused type-level coverage so regressions are visible in `typecheck:test`.

## Effect Adapter Rules

Effect adapter examples and docs must import Effect primitives from `effect`, not from this package:

```ts
import { Effect, Schema } from "effect"
import { DomainError, Repository } from "@codeva-dev/domain-model-kit/effect"
```

The package Effect subpath should expose DDD primitives, not re-export the full Effect ecosystem.

For repositories:

- Use `class OrderRepository extends Repository.Service<OrderRepository>()("OrderRepository", { ... })`.
- `Repository.Service` generates `save(...)`; class bodies define custom methods.
- Do not allow overriding `save`; keep the runtime guard and tests.
- `persistHandlers` are service tags such as `[OrderPersistHandler]`, not instances.
- Dependencies should be provided with layers such as `[OrderDb.Default, OrderPersistHandler.Default]`.
- If all construction dependencies are listed in `dependencies`, the generated `Default` layer should not leak construction requirements.

For persist handlers:

- Use `class OrderPersistHandler extends PersistHandler.Service<OrderPersistHandler>()("OrderPersistHandler", { accepts, dependencies, handle }) {}`.
- Keep `handle` in the definition object when event inference should come from `accepts`.
- Keep `accepts` and `canHandle` generated from the accepted event classes.
- Resolve DB, transaction, and context services inside the returned `Effect`, not while constructing the service layer.

For domain errors:

- `DomainError.Class(...)` must remain compatible with Effect `Schema.TaggedErrorClass`.
- The default public encoded payload is `{ _tag, message }`.
- Do not include raw `cause?: unknown` in the default encoded schema; it breaks transport serializability.

## Documentation Rules

README examples should be general package examples, not project-specific migrations.

- Use the order domain as the default documentation example.
- Avoid server boundary, application route, or platform-specific examples in the package README.
- Keep pure, neverthrow, and Effect sections aligned in vocabulary and concepts.
- Update `examples` when public API examples change.

## Validation

Run the narrowest useful checks while iterating. Before release or broad API changes, run:

```bash
npm run typecheck
npm run typecheck:test
npm run test
npm run build
npm run examples:typecheck
npm run examples:build
npm run pack:dry-run
```

Use `npm run pack:dry-run` to verify the published package shape and GitHub install shape.

## Release Notes

The root package can be installed from a GitHub tag or commit because `prepare` builds `dist`.

For alpha releases, use the package scripts or the equivalent npm commands:

```bash
npm run version:alpha
npm run publish:alpha
```

Equivalent commands:

```bash
npm version prerelease --preid alpha
npm publish --tag alpha --access public
```

Known npm auth path: stale local npm tokens can produce misleading publish failures. Prefer a temporary npm config with web auth and the 1Password OTP when available:

```bash
tmp_npmrc=/tmp/domain-model-kit-npmrc
printf 'registry=https://registry.npmjs.org/\nauth-type=web\n' > "$tmp_npmrc"
npm adduser --auth-type=web --userconfig "$tmp_npmrc"
npm publish --tag alpha --access public \
  --userconfig "$tmp_npmrc" \
  --otp "$(op item get h746mmr2yvbhnml327px3cabom --account codeva.1password.com --otp)"
```

Never print npm tokens or OTP values. If the `op` item is unavailable, ask the user to authenticate.

## Workflow

1. Read the relevant source, tests, and README section before editing.
2. Keep edits scoped to the adapter or behavior being changed.
3. Update tests before or alongside API changes.
4. Update README and `examples` when the public usage changes.
5. Run the relevant validation commands and report exactly what passed or failed.
