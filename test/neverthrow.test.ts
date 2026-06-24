import { describe, expect, it } from 'vitest';
import z4 from 'zod/v4';
import {
	AggregateRoot,
	DomainEvent,
	DomainEventValidationError,
	DomainInvariantError,
	DomainConcurrencyError,
	DomainPersistenceError,
	DomainValidationError,
	Entity,
	PersistHandler,
	Repository,
	UnknownDomainError,
	ValueObject,
	ValueObjectValidationError,
	err,
	ok,
	okAsync,
	type DomainEventBase,
} from '../src/neverthrow/index.js';

const IdSchema = z4.string().min(1).brand('Id');
type Id = z4.infer<typeof IdSchema>;

class Created extends DomainEvent.Class('created', z4.object({ id: IdSchema })) {}
class Renamed extends DomainEvent.Class('renamed', z4.object({ id: IdSchema, name: z4.string().min(1) })) {}
class Other extends DomainEvent.Class('other', z4.object({ id: IdSchema })) {}

class TestAggregate extends AggregateRoot.Class<Id>()(Created, Renamed) {
	private constructor(id: Id) {
		super(id);
	}

	public static create(id: Id) {
		const event = Created.create({ instanceId: id, payload: { id } });
		if (event.isErr()) throw event.error;
		const aggregate = new TestAggregate(id);
		aggregate.recordDomainEvent(event.value);
		return aggregate;
	}

	public recordUnknownForTest(event: DomainEventBase) {
		this.recordDomainEvent(event as Created);
	}

	public rename(name: string) {
		const event = Renamed.create({ instanceId: this.id, payload: { id: this.id, name } })._unsafeUnwrap();
		this.recordDomainEvent(event);
	}
}

describe('neverthrow', () => {
	it('exposes tagged error instances', () => {
		expect(new UnknownDomainError()._tag).toBe('UnknownDomainError');
		expect(new DomainValidationError()._tag).toBe('DomainValidationError');
		expect(new DomainInvariantError()._tag).toBe('DomainInvariantError');
		expect(new ValueObjectValidationError()._tag).toBe('ValueObjectValidationError');
		expect(new DomainEventValidationError()._tag).toBe('DomainEventValidationError');
		expect(new DomainPersistenceError()._tag).toBe('DomainPersistenceError');
		expect(new DomainConcurrencyError()._tag).toBe('DomainConcurrencyError');
	});

	it('creates immutable value objects and compares structurally', () => {
		class Email extends ValueObject.Class(z4.object({ value: z4.string().email() })) {}

		const email = Email.create({ value: 'a@b.com' });
		const same = Email.create({ value: 'a@b.com' });
		const invalid = Email.create({ value: 'bad' });

		expect(email.isOk()).toBe(true);
		expect(same.isOk()).toBe(true);
		expect(invalid.isErr() && invalid.error instanceof ValueObjectValidationError).toBe(true);
		if (email.isOk() && same.isOk()) {
			expect(email.value.equals(same.value)).toBe(true);
			expect(() => ((email.value.toJSON() as { value: string }).value = 'changed')).toThrow();
		}
	});

	it('compares entities by identity', () => {
		class User extends Entity.Class<Id>() {
			public constructor(id: Id) {
				super(id);
			}
		}

		expect(new User('1' as Id).equals(new User('1' as Id))).toBe(true);
		expect(new User('1' as Id).equals(new User('2' as Id))).toBe(false);
	});

	it('creates, serializes and decodes domain events as results', () => {
		const event = Created.create({ instanceId: '1', occurredAt: new Date('2026-01-01T00:00:00.000Z'), payload: { id: '1' } });
		expect(event.isOk()).toBe(true);
		if (event.isErr()) return;

		const serialized = event.value.toJSON();
		const decoder = DomainEvent.Decoder(Created, Renamed);

		expect(Created.decode(serialized).isOk()).toBe(true);
		expect(DomainEvent.decode(Created, serialized).isOk()).toBe(true);
		expect(decoder.get('created')).toBe(Created);
		expect(decoder.decode(serialized).isOk()).toBe(true);
		expect(Created.is(event.value)).toBe(true);
		expect(Created.create({ instanceId: '1', payload: { id: '' } })._unsafeUnwrapErr()).toBeInstanceOf(DomainEventValidationError);
		expect(Created.decode({ ...serialized, eventKey: 'wrong' })._unsafeUnwrapErr()).toBeInstanceOf(DomainEventValidationError);
		expect(Created.decode({ ...serialized, occurredAt: 'nope' })._unsafeUnwrapErr()).toBeInstanceOf(DomainEventValidationError);
		expect(decoder.decode({ ...serialized, eventKey: 'unknown' })._unsafeUnwrapErr()).toBeInstanceOf(DomainEventValidationError);
		expect(() => DomainEvent.Decoder(Created, Created)).toThrow(DomainEventValidationError);
	});

	it('dispatches repository handlers sequentially and clears only on success', async () => {
		const aggregate = TestAggregate.create('1' as Id);
		const snapshot = aggregate.getDomainEvents();
		(snapshot as Created[]).pop();
		expect(aggregate.getDomainEvents()).toHaveLength(1);
		expect(() => aggregate.clearDomainEvents(Symbol('wrong') as never)).toThrow(DomainInvariantError);

		const other = Other.create({ instanceId: '1', payload: { id: '1' } })._unsafeUnwrap();
		expect(() => aggregate.recordUnknownForTest(other)).toThrow(DomainInvariantError);

		const calls: string[] = [];
		class Handler extends PersistHandler.Class({
			accepts: [Created],
			handle(events) {
				calls.push(...events.map((event) => event.eventKey));
				return ok(undefined);
			},
		}) {}
		class Repo extends Repository.Class({ dbContext: {}, persistHandlers: [new Handler()] }) {}

		const saved = await new Repo().save(aggregate);
		expect(saved.isOk()).toBe(true);
		expect(calls).toEqual(['created']);
		expect(aggregate.getDomainEvents()).toHaveLength(0);
		aggregate.rename('new name');
		const renamed = await new Repo().save(aggregate);
		expect(renamed.isOk()).toBe(true);
		expect(calls).toEqual(['created']);
		const noEvents = await new Repo().save(aggregate);
		expect(noEvents.isOk()).toBe(true);
	});

	it('short-circuits handler failures and keeps events', async () => {
		const aggregate = TestAggregate.create('1' as Id);
		const calls: string[] = [];
		class Failing extends PersistHandler.Class({
			accepts: [Created],
			handle() {
				calls.push('fail');
				return err(new Error('fail'));
			},
		}) {}
		class Later extends PersistHandler.Class({
			accepts: [Created],
			handle() {
				calls.push('later');
				return ok(undefined);
			},
		}) {}
		class Repo extends Repository.Class({ dbContext: {}, persistHandlers: [new Failing(), new Later()] }) {}

		const result = await new Repo().save(aggregate);
		expect(result.isErr()).toBe(true);
		expect(calls).toEqual(['fail']);
		expect(aggregate.getDomainEvents()).toHaveLength(1);
	});

	it('normalizes result arrays sequentially', async () => {
		const order: string[] = [];
		class Handler extends PersistHandler.Class({
			accepts: [Created],
			handle() {
				return [
					ok(order.push('a')),
					okAsync(undefined).map(() => {
						order.push('b');
					}),
				] as const;
			},
		}) {}

		const result = await new Handler().handle([], {});
		expect(result).toBeDefined();
		expect(order).toEqual(['a', 'b']);
	});
});
