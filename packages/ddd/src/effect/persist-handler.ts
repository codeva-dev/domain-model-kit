import { Effect } from 'effect';
import type { DomainEventBase, DomainEventClass } from './domain-event.js';
import {
	makeEffectServiceClass,
	serviceImplementation,
	type EffectServiceClass,
	type EffectServiceDependencies,
} from './effect-service.js';

export type EventsHandledBy<TEventClasses extends readonly DomainEventClass[]> = InstanceType<TEventClasses[number]>;
export type PersistHandlerError<THandler> =
	THandler extends IPersistHandler<DomainEventBase, infer TError, unknown> ? TError : never;
export type PersistHandlerRequirements<THandler> =
	THandler extends IPersistHandler<DomainEventBase, unknown, infer TRequirements> ? TRequirements : never;
export type AnyPersistHandler = IPersistHandler<DomainEventBase, unknown, unknown>;

/**
 * Effect persist handler service shape used by repositories.
 */
export interface IPersistHandler<
	TEvent extends DomainEventBase = DomainEventBase,
	TError = never,
	TRequirements = never,
> {
	/** Event keys accepted by this handler. */
	readonly accepts: readonly TEvent['eventKey'][];
	/** Narrows an event to the event union accepted by this handler. */
	canHandle(event: DomainEventBase): event is TEvent;
	/** Persists a batch of already accepted events. */
	handle(events: readonly TEvent[]): Effect.Effect<void, TError, TRequirements>;
}

type PersistHandlerBaseImplementation<TEvent extends DomainEventBase> = {
	readonly accepts: readonly TEvent['eventKey'][];
	canHandle(event: DomainEventBase): event is TEvent;
};

type PersistHandlerServiceImplementation<
	TEvent extends DomainEventBase,
	TError,
	TRequirements,
> = PersistHandlerBaseImplementation<TEvent> & {
	handle(events: readonly TEvent[]): Effect.Effect<void, TError, TRequirements>;
};

export type PersistHandlerServiceDefinition<
	TEventClasses extends readonly DomainEventClass[],
	TError = never,
	TRequirements = never,
> = {
	accepts: TEventClasses;
	handle(events: readonly EventsHandledBy<TEventClasses>[]): Effect.Effect<void, TError, TRequirements>;
	dependencies?: EffectServiceDependencies;
};

function makePersistHandlerService<Self extends object>() {
	return function <
		const TKey extends string,
		const TEventClasses extends readonly DomainEventClass[],
		TError = never,
		TRequirements = never,
	>(
		key: TKey,
		definition: PersistHandlerServiceDefinition<TEventClasses, TError, TRequirements>,
	): EffectServiceClass<Self, PersistHandlerServiceImplementation<EventsHandledBy<TEventClasses>, TError, TRequirements>> {
		type Event = EventsHandledBy<TEventClasses>;

		return makeEffectServiceClass<Self, PersistHandlerServiceImplementation<Event, TError, TRequirements>>(
			key,
			Effect.succeed(
				serviceImplementation<PersistHandlerServiceImplementation<Event, TError, TRequirements>>({
					accepts: definition.accepts.map((eventClass) => eventClass.eventKey),
					canHandle(event: DomainEventBase): event is Event {
						return definition.accepts.some((eventClass) => eventClass.is(event));
					},
					handle(events: readonly Event[]) {
						return definition.handle(events);
					},
				}),
			),
			definition.dependencies,
		);
	};
}

export const PersistHandler = {
	/**
	 * Creates an Effect service that persists one or more domain event classes.
	 *
	 * @example
	 * class OrderPersistHandler extends PersistHandler.Service<OrderPersistHandler>()(
	 *   "OrderPersistHandler",
	 *   {
	 *     accepts: OrderEvents,
	 *     dependencies: [OrderDb.Default],
	 *     handle(events) {
	 *       return Effect.gen(function* () {
	 *         const db = yield* OrderDb
	 *         // persist accepted events
	 *       })
	 *     }
	 *   }
	 * ) {}
	 */
	Service: makePersistHandlerService,
};
