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
	type DomainEventBase,
} from '../src/pure/index.js';

const IdSchema = z4.string().min(1).brand('Id');
type Id = z4.infer<typeof IdSchema>;
const CountSchema = z4.number().int().positive();

class Created extends DomainEvent.Class('created', z4.object({ id: IdSchema, count: CountSchema })) {}
class Renamed extends DomainEvent.Class('renamed', z4.object({ id: IdSchema, name: z4.string().min(1) })) {}
class Other extends DomainEvent.Class('other', z4.object({ id: IdSchema })) {}

class TestAggregate extends AggregateRoot.Class<Id>()(Created, Renamed) {
	private constructor(id: Id) {
		super(id);
	}

	public static create(id: Id) {
		const aggregate = new TestAggregate(id);
		aggregate.recordDomainEvent(Created.create({ instanceId: id, payload: { id, count: 1 } }));
		return aggregate;
	}

	public rename(name: string) {
		this.recordDomainEvent(Renamed.create({ instanceId: this.id, payload: { id: this.id, name } }));
	}

	public recordUnknownForTest(event: DomainEventBase) {
		this.recordDomainEvent(event as Created);
	}
}

describe('pure', () => {
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
		const json = email.toJSON();

		expect(email.equals(same)).toBe(true);
		expect(json).toEqual({ value: 'a@b.com' });
		expect(() => ((json as { value: string }).value = 'changed')).toThrow();
		expect(() => Email.create({ value: 'bad' })).toThrow(ValueObjectValidationError);
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

	it('creates, serializes and decodes domain events', () => {
		const event = Created.create({ instanceId: '1', occurredAt: new Date('2026-01-01T00:00:00.000Z'), payload: { id: '1', count: 1 } });
		const serialized = event.toJSON();
		const decoder = DomainEvent.Decoder(Created, Renamed);

		expect(serialized).toEqual({
			eventKey: 'created',
			instanceId: '1',
			occurredAt: '2026-01-01T00:00:00.000Z',
			payload: { id: '1', count: 1 },
		});
		expect(Created.decode(serialized)).toBeInstanceOf(Created);
		expect(DomainEvent.decode(Created, serialized)).toBeInstanceOf(Created);
		expect(decoder.get('created')).toBe(Created);
		expect(decoder.decode(serialized)).toBeInstanceOf(Created);
		expect(Created.is(event)).toBe(true);
		expect(() => Created.create({ instanceId: '1', payload: { id: '', count: 1 } })).toThrow(DomainEventValidationError);
		expect(() => Created.decode({ ...serialized, eventKey: 'wrong' })).toThrow(DomainEventValidationError);
		expect(() => Created.decode({ ...serialized, occurredAt: 'nope' })).toThrow(DomainEventValidationError);
		expect(() => decoder.decode({ ...serialized, eventKey: 'unknown' })).toThrow(DomainEventValidationError);
		expect(() => DomainEvent.Decoder(Created, Created)).toThrow(DomainEventValidationError);
	});

	it('guards aggregate event lifecycle', async () => {
		const aggregate = TestAggregate.create('1' as Id);
		const snapshot = aggregate.getDomainEvents();
		(snapshot as Created[]).pop();

		expect(aggregate.getDomainEvents()).toHaveLength(1);
		expect(() => aggregate.clearDomainEvents(Symbol('wrong') as never)).toThrow(DomainInvariantError);
		expect(() => aggregate.recordUnknownForTest(Other.create({ instanceId: '1', payload: { id: '1' } }))).toThrow(DomainInvariantError);

		const calls: string[] = [];
		const db = { saved: [] as string[] };
		class Handler extends PersistHandler.Class({
			accepts: [Created, Renamed],
			handle(events, context: typeof db) {
				calls.push(...events.map((event) => event.eventKey));
				context.saved.push(...events.map((event) => event.eventKey));
			},
		}) {}
		class Repo extends Repository.Class({ dbContext: db, persistHandlers: [new Handler()] }) {}

		const repo = new Repo();
		await repo.save(aggregate);
		expect(calls).toEqual(['created']);
		expect(db.saved).toEqual(['created']);
		expect(aggregate.getDomainEvents()).toHaveLength(0);
		aggregate.rename('new name');
		await repo.save(aggregate);
		expect(calls).toEqual(['created', 'renamed']);
		await repo.save(aggregate);
		expect(calls).toEqual(['created', 'renamed']);
	});

	it('keeps aggregate events when repository persistence fails', async () => {
		const aggregate = TestAggregate.create('1' as Id);
		class FailingHandler extends PersistHandler.Class({
			accepts: [Created],
			handle() {
				throw new Error('fail');
			},
		}) {}
		class Repo extends Repository.Class({ dbContext: {}, persistHandlers: [new FailingHandler()] }) {}

		await expect(new Repo().save(aggregate)).rejects.toThrow('fail');
		expect(aggregate.getDomainEvents()).toHaveLength(1);
	});

	it('normalizes persist handler result arrays sequentially', async () => {
		const order: string[] = [];
		class Handler extends PersistHandler.Class({
			accepts: [Created],
			handle() {
				return [
					Promise.resolve().then(() => {
						order.push('a');
					}),
					Promise.resolve().then(() => {
						order.push('b');
					}),
				] as const;
			},
		}) {}

		await new Handler().handle([], {});
		expect(order).toEqual(['a', 'b']);
	});
});
