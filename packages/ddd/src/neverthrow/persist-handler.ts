import { okAsync, ResultAsync, type Result } from 'neverthrow';
import type { DomainEventBase, DomainEventClass } from './domain-event.js';

type OneOrMany<TValue> = TValue | readonly TValue[];

export type EventsHandledBy<TEventClasses extends readonly DomainEventClass[]> = InstanceType<TEventClasses[number]>;
/**
 * Neverthrow persist handlers may return a single `Result` / `ResultAsync` or an array of them.
 *
 * Arrays are normalized sequentially, left to right.
 */
export type PersistHandlerResult<TError> = OneOrMany<Result<unknown, TError> | ResultAsync<unknown, TError>>;
export type PersistHandlerError<THandler> =
	THandler extends IPersistHandler<DomainEventBase, unknown, infer TError> ? TError : never;

/**
 * Persists accepted domain events for a repository.
 */
export interface IPersistHandler<TEvent extends DomainEventBase = DomainEventBase, TContext = unknown, TError = Error> {
	/** Event keys accepted by this handler. */
	readonly accepts: readonly TEvent['eventKey'][];
	/** Narrows an event to the event union accepted by this handler. */
	canHandle(event: DomainEventBase): event is TEvent;
	/** Persists a batch of already accepted events. */
	handle(events: readonly TEvent[], context: TContext): PersistHandlerResult<TError>;
}

function toResultAsync<TError>(result: Result<unknown, TError> | ResultAsync<unknown, TError>): ResultAsync<unknown, TError> {
	return ResultAsync.fromSafePromise(Promise.resolve(result)).andThen((resolved) => resolved);
}

/**
 * Normalizes handler return values sequentially.
 */
export function normalizePersistHandlerResult<TError>(result: PersistHandlerResult<TError>): ResultAsync<void, TError> {
	const results = Array.isArray(result) ? result : [result];

	if (results.length === 0) {
		return okAsync(void 0);
	}

	let normalized: ResultAsync<unknown, TError> = okAsync<unknown, TError>(void 0);

	for (const item of results) {
		normalized = normalized.andThen(() => toResultAsync(item) as ResultAsync<unknown, TError>);
	}

	return normalized.andThen(() => okAsync(void 0)) as ResultAsync<void, TError>;
}

function makePersistHandler<const TEventClasses extends readonly DomainEventClass[], TContext = unknown, TError = Error>(
	definition: {
		accepts: TEventClasses;
		handle: (events: readonly EventsHandledBy<TEventClasses>[], context: TContext) => PersistHandlerResult<TError>;
	},
) {
	type Event = EventsHandledBy<TEventClasses>;

	abstract class CreatedPersistHandler implements IPersistHandler<Event, TContext, TError> {
		public readonly accepts = definition.accepts.map((eventClass) => eventClass.eventKey);

		public canHandle(event: DomainEventBase): event is Event {
			return definition.accepts.some((eventClass) => eventClass.is(event));
		}

		public handle(events: readonly Event[], context: TContext): PersistHandlerResult<TError> {
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
	 *     return ok(undefined)
	 *   }
	 * }) {}
	 */
	Class: makePersistHandler,
};
