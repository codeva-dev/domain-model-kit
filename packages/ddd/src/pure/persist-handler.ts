import type { DomainEventBase, DomainEventClass } from './domain-event.js';

type OneOrMany<TValue> = TValue | readonly TValue[];
export type EventsHandledBy<TEventClasses extends readonly DomainEventClass[]> = InstanceType<TEventClasses[number]>;
/**
 * Pure persist handlers may return a single sync/async operation or an array of operations.
 *
 * Arrays are normalized sequentially, left to right.
 */
export type PersistHandlerResult = OneOrMany<void | Promise<void>>;

/**
 * Persists accepted domain events for a repository.
 */
export interface IPersistHandler<TEvent extends DomainEventBase = DomainEventBase, TContext = unknown> {
	/** Event keys accepted by this handler. */
	readonly accepts: readonly TEvent['eventKey'][];
	/** Narrows an event to the event union accepted by this handler. */
	canHandle(event: DomainEventBase): event is TEvent;
	/** Persists a batch of already accepted events. */
	handle(events: readonly TEvent[], context: TContext): PersistHandlerResult;
}

/**
 * Normalizes handler return values sequentially.
 */
export async function normalizePersistHandlerResult(result: PersistHandlerResult): Promise<void> {
	const results = Array.isArray(result) ? result : [result];

	for (const item of results) {
		await item;
	}
}

function makePersistHandler<const TEventClasses extends readonly DomainEventClass[], TContext = unknown>(definition: {
	accepts: TEventClasses;
	handle: (events: readonly EventsHandledBy<TEventClasses>[], context: TContext) => PersistHandlerResult;
}) {
	type Event = EventsHandledBy<TEventClasses>;

	abstract class CreatedPersistHandler implements IPersistHandler<Event, TContext> {
		public readonly accepts = definition.accepts.map((eventClass) => eventClass.eventKey);

		public canHandle(event: DomainEventBase): event is Event {
			return definition.accepts.some((eventClass) => eventClass.is(event));
		}

		public handle(events: readonly Event[], context: TContext): PersistHandlerResult {
			return definition.handle(events, context);
		}
	}

	return CreatedPersistHandler;
}

export const PersistHandler = {
	/**
	 * Creates a persist handler class for one or more domain event classes.
	 *
	 * @example
	 * class OrderPersistHandler extends PersistHandler.Class({
	 *   accepts: [OrderCreated, OrderItemAdded],
	 *   handle(events, db) {
	 *     // persist accepted events
	 *   }
	 * }) {}
	 */
	Class: makePersistHandler,
};
