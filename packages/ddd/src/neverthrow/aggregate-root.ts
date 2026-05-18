import { EntityBase } from './entity.js';
import type { DomainEventBase, DomainEventClass } from './domain-event.js';
import { DomainInvariantError } from './errors.js';

export type EventsFromClasses<TEventClasses extends readonly DomainEventClass[]> = InstanceType<TEventClasses[number]>;
export type AggregateRootClass<TId, TEvent extends DomainEventBase> = abstract new (id: TId) => AggregateRootBase<TId, TEvent>;
/**
 * Internal token used by repositories to clear persisted domain events.
 *
 * Application code should not call `clearDomainEvents(...)` directly.
 */
export const INTERNAL_DOMAIN_EVENT_CLEAR_TOKEN = Symbol('INTERNAL_DOMAIN_EVENT_CLEAR_TOKEN');

/**
 * Base class for aggregate roots.
 *
 * Aggregate roots are entities that record domain events and define a consistency boundary.
 * Use `AggregateRoot.Class<TId>()(...eventClasses)`.
 */
export abstract class AggregateRootBase<TId = unknown, TEvent extends DomainEventBase = DomainEventBase> extends EntityBase<TId> {
	private readonly domainEvents: TEvent[] = [];

	/**
	 * Records a domain event on the aggregate.
	 *
	 * The event must be one of the event classes declared on `AggregateRoot.Class<TId>()(...)`.
	 */
	protected recordDomainEvent(event: TEvent) {
		const eventClasses = ((this.constructor as typeof AggregateRootBase & { eventClasses?: readonly DomainEventClass[] }).eventClasses ??
			[]) as readonly DomainEventClass[];

		if (!eventClasses.some((eventClass) => eventClass.is(event))) {
			throw new DomainInvariantError(`Aggregate root cannot record domain event "${event.eventKey}"`);
		}

		this.domainEvents.push(event);
	}

	/**
	 * Returns a snapshot copy of the recorded domain events.
	 */
	public getDomainEvents(): readonly TEvent[] {
		return [...this.domainEvents];
	}

	/**
	 * Clears recorded domain events.
	 *
	 * This is guarded by an internal token and is intended for repository/framework code only.
	 */
	public clearDomainEvents(token: typeof INTERNAL_DOMAIN_EVENT_CLEAR_TOKEN) {
		if (token !== INTERNAL_DOMAIN_EVENT_CLEAR_TOKEN) {
			throw new DomainInvariantError('Invalid domain event clear token');
		}

		this.domainEvents.splice(0, this.domainEvents.length);
	}
}

function makeAggregateRoot<TId = unknown>() {
	return function <const TEventClasses extends readonly DomainEventClass[]>(
		...eventClasses: TEventClasses
	): AggregateRootClass<TId, EventsFromClasses<TEventClasses>> {
		type Event = EventsFromClasses<TEventClasses>;

		abstract class CreatedAggregateRoot extends AggregateRootBase<TId, Event> {
			public static readonly eventClasses = eventClasses;
		}

		return CreatedAggregateRoot as unknown as AggregateRootClass<TId, Event>;
	};
}

export const AggregateRoot = {
	/**
	 * Creates an aggregate root base class for a specific ID type and allowed event classes.
	 *
	 * @example
	 * class Order extends AggregateRoot.Class<OrderId>()(OrderCreated, OrderItemAdded) {
	 *   private constructor(id: OrderId) {
	 *     super(id)
	 *   }
	 * }
	 */
	Class: makeAggregateRoot,
};
