# Domain Model Kit

Domain encapsulation and domain-event persistence toolkit for TypeScript.

This repository is the public monorepo for `@codeva-dev/domain-model-kit`. The package is intended for teams that want domain-inspired models, explicit domain errors, and a small persistence pipeline driven by domain events rather than ORM dirty tracking or large hand-written repository save methods.

The package is currently alpha. The core concepts, examples, tests, and package shape are in place, but the public API can still change before `1.0.0`.

## What Is In This Repository

```text
apps/
  playground/       Local integration app for experiments and examples.

packages/
  ddd/              npm package: @codeva-dev/domain-model-kit
```

The publishable library lives in `packages/ddd`. The playground is intentionally separate and is not published to npm.

## Package

Install the alpha package with:

```bash
npm install @codeva-dev/domain-model-kit@alpha
```

Public imports are exposed through subpath exports:

```ts
import { AggregateRoot, DomainEvent, Repository } from "@codeva-dev/domain-model-kit/effect"
import { AggregateRoot, DomainEvent, Repository } from "@codeva-dev/domain-model-kit/neverthrow"
import { AggregateRoot, DomainEvent, Repository } from "@codeva-dev/domain-model-kit/pure"
```

The `effect` implementation is the primary direction. The `pure` and `neverthrow` implementations are kept as separate variants for teams that prefer those styles.

Package-level documentation is in `packages/ddd/README.md`.

## Project Goals

- Provide a small, explicit domain encapsulation toolkit for TypeScript.
- Model value objects, entities, aggregate roots, domain events, repositories, and persist handlers.
- Keep domain behavior close to the domain model instead of spreading rules through services and controllers.
- Persist aggregate changes through recorded domain events.
- Avoid depending on ORM dirty tracking.
- Avoid repetitive repository `saveSomething(...)` method forests.
- Keep transaction management, outbox storage, retries, telemetry, HTTP, and queue integration outside the core package.

## Non-Goals

- This is not an ORM.
- This is not a full application framework.
- This is not a full event sourcing framework.
- This is not a transaction manager.
- This does not prescribe your database, API framework, message broker, or deployment architecture.

Adapters and examples can live next to the package later, but the core package should stay narrow.

## Development

Requirements:

- Node.js compatible with the version in `package-lock.json`
- npm

Install dependencies:

```bash
npm install
```

Run the common checks:

```bash
npm run typecheck
npm run test:domain-model-kit
npm run build
```

Package-only checks:

```bash
npm run typecheck:domain-model-kit
npm run typecheck:domain-model-kit-tests
npm run test:domain-model-kit
npm run build:domain-model-kit
npm run pack:domain-model-kit
```

Run the playground:

```bash
npm run dev
```

`npm run pack:domain-model-kit` is a dry run. It builds the package and prints the npm tarball contents without publishing.

## Repository Conventions

- Keep package source under `packages/ddd/src`.
- Keep integration experiments under `apps/playground`.
- Prefer focused changes. Avoid unrelated formatting churn.
- Keep the three implementations conceptually aligned, but do not force them to share a runtime core.
- Add or update tests when behavior changes.
- Keep public API docs and examples in sync with code changes.
- Treat `effect` as the primary implementation direction unless a change explicitly concerns another variant.

## Testing

The package test suite uses Vitest. Effect-specific behavior is tested with Effect-oriented test helpers.

Current test focus:

- Value object validation and equality
- Entity identity equality
- Aggregate root event recording and clearing rules
- Domain event create/decode/encode behavior
- Persist handler dispatch and sequential normalization
- Repository `save(...)` behavior
- Effect service repository and persist handler behavior

Run:

```bash
npm run test:domain-model-kit
```

## Release Policy

Releases are published by project maintainers. External contributors should not need npm publish access to contribute code, documentation, examples, or tests.

Public releases are versioned from the package metadata in `packages/ddd/package.json`. Alpha releases use prerelease versions and the npm `alpha` dist-tag until the API is stable enough for `1.0.0`.

Before a release, maintainers are expected to run the full check suite:

```bash
npm run typecheck
npm run test:domain-model-kit
npm run build
npm run pack:domain-model-kit
```

## Contributing

Contributions are welcome while the project is still evolving, but the API is intentionally not frozen yet.

Good contribution areas:

- Bug fixes with focused tests
- Documentation corrections
- Better examples
- Type inference improvements
- Effect implementation refinements
- Playground scenarios that validate real usage

Before opening a pull request:

```bash
npm run typecheck
npm run test:domain-model-kit
npm run build
```

For larger design changes, open an issue or discussion first so the API direction can be agreed before implementation.

## License

MIT. See `packages/ddd/LICENSE`.
