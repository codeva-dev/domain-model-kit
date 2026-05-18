import { describe } from 'vitest';
import { expect, it } from '@effect/vitest';
import { Context, Effect, Exit, Layer, Schema } from 'effect';
import {
	AggregateRoot,
	DomainError,
	DomainEvent,
	DomainEventValidationError,
	DomainConcurrencyError,
	DomainInvariantError,
	DomainPersistenceError,
	DomainValidationError,
	Entity,
	PersistHandler,
	Repository,
	ValueObject,
	ValueObjectValidationError,
	UnknownDomainError,
	type DomainEventBase,
	type IPersistHandler,
} from '../src/effect/index.js';

const noRequirements = <A, E>(effect: Effect.Effect<A, E, unknown>): Effect.Effect<A, E> =>
	effect as Effect.Effect<A, E>;

const IdSchema = Schema.NonEmptyString.pipe(Schema.brand('Id'));
type Id = typeof IdSchema.Type;

class Created extends DomainEvent.Class('created', Schema.Struct({ id: IdSchema })) {}
class Renamed extends DomainEvent.Class('renamed', Schema.Struct({ id: IdSchema, name: Schema.NonEmptyString })) {}
class Other extends DomainEvent.Class('other', Schema.Struct({ id: IdSchema })) {}

class TestAggregate extends AggregateRoot.Class<Id>()(Created, Renamed) {
	private constructor(id: Id) {
		super(id);
	}

	public static create(id: Id) {
		return Effect.gen(function* () {
			const aggregate = new TestAggregate(id);
			aggregate.recordDomainEvent(yield* Created.create({ instanceId: id, payload: { id } }));
			return aggregate;
		});
	}

	public recordUnknownForTest(event: DomainEventBase) {
		this.recordDomainEvent(event as Created);
	}

	public rename(name: string) {
		const aggregate = this;
		return Effect.gen(function* () {
			aggregate.recordDomainEvent(yield* Renamed.create({ instanceId: aggregate.id, payload: { id: aggregate.id, name } }));
		});
	}
}

describe('effect', () => {
	it.effect('exposes tagged error instances', () =>
		Effect.sync(() => {
			expect(new UnknownDomainError({ message: 'unknown' })._tag).toBe('UnknownDomainError');
			expect(new DomainValidationError({ message: 'validation' })._tag).toBe('DomainValidationError');
			expect(new DomainInvariantError({ message: 'invariant' })._tag).toBe('DomainInvariantError');
			expect(new ValueObjectValidationError({ message: 'vo' })._tag).toBe('ValueObjectValidationError');
			expect(new DomainEventValidationError({ message: 'event' })._tag).toBe('DomainEventValidationError');
			expect(new DomainPersistenceError({ message: 'persistence' })._tag).toBe('DomainPersistenceError');
			expect(new DomainConcurrencyError({ message: 'concurrency' })._tag).toBe('DomainConcurrencyError');
		}),
	);

	it.effect('creates immutable value objects and compares structurally', () =>
		Effect.gen(function* () {
			class Email extends ValueObject.Class(Schema.Struct({ value: Schema.String.pipe(Schema.pattern(/@/)) })) {}

			const email = yield* Email.create({ value: 'a@b.com' });
			const same = yield* Email.create({ value: 'a@b.com' });
			const invalid = yield* Effect.exit(Email.create({ value: 'bad' }));

			expect(email.equals(same)).toBe(true);
			expect(email.toJSON()).toEqual({ value: 'a@b.com' });
			expect(() => ((email.toJSON() as { value: string }).value = 'changed')).toThrow();
			expect(Exit.isFailure(invalid)).toBe(true);
			if (Exit.isFailure(invalid)) {
				expect(String(invalid.cause)).toContain('ValueObjectValidationError');
			}

			const error = new ValueObjectValidationError({ message: 'bad value' });
			expect(error._tag).toBe('ValueObjectValidationError');
		}),
	);

	it.effect('compares entities by identity', () =>
		Effect.sync(() => {
			class User extends Entity.Class<Id>() {
				public constructor(id: Id) {
					super(id);
				}
			}

			expect(new User('1' as Id).equals(new User('1' as Id))).toBe(true);
			expect(new User('1' as Id).equals(new User('2' as Id))).toBe(false);
		}),
	);

	it.effect('creates, encodes and decodes domain events', () =>
		Effect.gen(function* () {
			const event = yield* Created.create({
				instanceId: '1',
				occurredAt: new Date('2026-01-01T00:00:00.000Z'),
				payload: { id: '1' },
			});
			const serialized = yield* event.encode();
			const decoder = DomainEvent.Decoder(Created, Renamed);

			expect(serialized).toEqual({
				eventKey: 'created',
				instanceId: '1',
				occurredAt: '2026-01-01T00:00:00.000Z',
				payload: { id: '1' },
			});
			expect(yield* Created.decode(serialized)).toBeInstanceOf(Created);
			expect(yield* DomainEvent.decode(Created, serialized)).toBeInstanceOf(Created);
			expect(decoder.get('created')).toBe(Created);
			expect(yield* decoder.decode(serialized)).toBeInstanceOf(Created);
			expect(Created.is(event)).toBe(true);
			expect(yield* Effect.exit(Created.create({ instanceId: '1', payload: { id: '' } }))).toSatisfy(Exit.isFailure);
			expect(yield* Effect.exit(Created.decode({ ...serialized, eventKey: 'wrong' }))).toSatisfy(Exit.isFailure);
			expect(yield* Effect.exit(Created.decode({ ...serialized, occurredAt: 'nope' }))).toSatisfy(Exit.isFailure);
			expect(yield* Effect.exit(decoder.decode({ ...serialized, eventKey: 'unknown' }))).toSatisfy(Exit.isFailure);
			expect(() => DomainEvent.Decoder(Created, Created)).toThrow();
			expect(new DomainEventValidationError({ message: 'bad event' })._tag).toBe('DomainEventValidationError');
		}),
	);

	it.effect('guards aggregate event lifecycle', () =>
		Effect.gen(function* () {
			const aggregate = yield* TestAggregate.create('1' as Id);
			const snapshot = aggregate.getDomainEvents();
			(snapshot as Created[]).pop();

			expect(aggregate.getDomainEvents()).toHaveLength(1);
			expect(() => aggregate.clearDomainEvents(Symbol('wrong') as never)).toThrow(DomainInvariantError);
			const other = yield* Other.create({ instanceId: '1', payload: { id: '1' } });
			expect(() => aggregate.recordUnknownForTest(other)).toThrow(DomainInvariantError);
		}),
	);

	it.effect('creates custom tagged domain errors', () =>
		Effect.sync(() => {
			const OrderNotFound = DomainError.Class('OrderNotFound', {
				message: Schema.String,
				orderId: Schema.String,
			});
			const error = new OrderNotFound({ message: 'Order not found', orderId: '1' });

			expect(error._tag).toBe('OrderNotFound');
			expect(error.orderId).toBe('1');
		}),
	);

	it.effect('dispatches repository handlers sequentially and clears only on success', () => {
		class Db extends Context.Tag('EffectRepositoryDb')<Db, { calls: string[] }>() {}
		type HandlerService = IPersistHandler<Created, Error, Db>;
		type SkippedHandlerService = IPersistHandler<Renamed, Error, Db>;
		const SkippedHandler = PersistHandler.Service<SkippedHandlerService>()('SkippedEffectRepositoryHandler', {
			accepts: [Renamed],
			handle() {
				return Effect.gen(function* () {
					const db = yield* Db;
					db.calls.push('skipped');
				});
			},
		});
		const Handler = PersistHandler.Service<HandlerService>()('EffectRepositoryHandler', {
			accepts: [Created],
			handle(events) {
				return Effect.gen(function* () {
					const db = yield* Db;
					db.calls.push(...events.map((event) => event.eventKey));
				});
			},
		});
		type RepoService = { save(aggregate: TestAggregate): Effect.Effect<void, Error, Db> };
		const Repo = Repository.Service<RepoService>()('EffectRepository', {
			persistHandlers: [SkippedHandler, Handler],
			dependencies: [SkippedHandler.Default, Handler.Default],
		});
		const db = { calls: [] as string[] };

		return noRequirements(Effect.gen(function* () {
			const aggregate = yield* TestAggregate.create('1' as Id);
			const repo = yield* Repo;
			yield* repo.save(aggregate);
			expect(db.calls).toEqual(['created']);
			expect(aggregate.getDomainEvents()).toHaveLength(0);
			yield* repo.save(aggregate);
			expect(db.calls).toEqual(['created']);
		}).pipe(Effect.provide(Repo.Default), Effect.provideService(Db, db)));
	});

	it.effect('supports effect custom methods and rejects save override', () => {
		type RepoService = {
			findLabel(): Effect.Effect<string>;
			save(aggregate: TestAggregate): Effect.Effect<void>;
		};
		const Repo = Repository.Service<RepoService>()('EffectCustomRepository', {
			persistHandlers: [],
			effect: Effect.succeed({
				findLabel() {
					return Effect.succeed('ok');
				},
			}),
		});
		const InvalidRepo = Repository.Service<RepoService>()('InvalidEffectCustomRepository', {
			persistHandlers: [],
			sync: () =>
				({
					save() {
						return Effect.void;
					},
					findLabel() {
						return Effect.succeed('bad');
					},
				}) as never,
		});

		return noRequirements(Effect.gen(function* () {
			const repo = yield* Repo;
			expect(yield* repo.findLabel()).toBe('ok');
			const invalid = yield* Effect.exit(InvalidRepo.pipe(Effect.provide(InvalidRepo.Default)));
			expect(Exit.isFailure(invalid)).toBe(true);
		}).pipe(Effect.provide(Repo.Default)));
	});

	it.effect('keeps aggregate events when repository persistence fails', () => {
		class Failure extends DomainError.Class('Failure') {}
		type HandlerService = IPersistHandler<Created, Failure>;
		const Handler = PersistHandler.Service<HandlerService>()('FailingEffectHandler', {
			accepts: [Created],
			handle() {
				return Effect.fail(new Failure({ message: 'fail' }));
			},
		});
		type RepoService = { save(aggregate: TestAggregate): Effect.Effect<void, Failure> };
		const Repo = Repository.Service<RepoService>()('FailingEffectRepository', {
			persistHandlers: [Handler],
			dependencies: [Handler.Default],
		});

		return noRequirements(Effect.gen(function* () {
			const aggregate = yield* TestAggregate.create('1' as Id);
			const repo = yield* Repo;
			const result = yield* Effect.exit(repo.save(aggregate));
			expect(Exit.isFailure(result)).toBe(true);
			expect(aggregate.getDomainEvents()).toHaveLength(1);
		}).pipe(Effect.provide(Repo.Default)));
	});

	it.effect('resolves handler db from the current save execution context', () => {
		class Db extends Context.Tag('CurrentDb')<Db, { name: string; calls: string[] }>() {}
		type HandlerService = IPersistHandler<Created, never, Db>;
		const Handler = PersistHandler.Service<HandlerService>()('CurrentDbHandler', {
			accepts: [Created],
			handle(events) {
				return Effect.gen(function* () {
					const db = yield* Db;
					db.calls.push(`${db.name}:${events[0]?.eventKey}`);
				});
			},
		});
		type RepoService = { save(aggregate: TestAggregate): Effect.Effect<void, never, Db> };
		const Repo = Repository.Service<RepoService>()('CurrentDbRepository', {
			persistHandlers: [Handler],
			dependencies: [Handler.Default],
		});
		const first = { name: 'first', calls: [] as string[] };
		const second = { name: 'second', calls: [] as string[] };

		return noRequirements(Effect.gen(function* () {
			const repo = yield* Repo;
			const firstAggregate = yield* TestAggregate.create('1' as Id);
			const secondAggregate = yield* TestAggregate.create('2' as Id);

			yield* repo.save(firstAggregate).pipe(Effect.provideService(Db, first));
			yield* repo.save(secondAggregate).pipe(Effect.provideService(Db, second));

			expect(first.calls).toEqual(['first:created']);
			expect(second.calls).toEqual(['second:created']);
		}).pipe(Effect.provide(Repo.Default), Effect.provide(Layer.empty)));
	});
});
