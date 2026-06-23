import { Effect } from 'effect';
import { INTERNAL_DOMAIN_EVENT_CLEAR_TOKEN, type AggregateRootBase } from './aggregate-root.js';
import type { DomainEventBase } from './domain-event.js';
import {
	makeEffectServiceClass,
	serviceImplementation,
	type EffectServiceClass,
	type EffectServiceDependencies,
} from './effect-service.js';
import type { AnyPersistHandler, IPersistHandler, PersistHandlerError, PersistHandlerRequirements } from './persist-handler.js';

export type RepositoryPersistHandlers = readonly AnyPersistHandler[];
export type RepositoryPersistHandlerServices = readonly Effect.Effect<AnyPersistHandler, never, unknown>[];
export type AnyAggregateRoot = AggregateRootBase<unknown, DomainEventBase>;
export type SaveError<THandlers extends RepositoryPersistHandlers> = PersistHandlerError<THandlers[number]>;
export type SaveRequirements<THandlers extends RepositoryPersistHandlers> = PersistHandlerRequirements<THandlers[number]>;
type HandlerFromService<TService> = TService extends Effect.Effect<infer THandler, never, unknown> ? THandler : never;
type SaveErrorFromServices<TServices extends RepositoryPersistHandlerServices> = PersistHandlerError<HandlerFromService<TServices[number]>>;
type SaveRequirementsFromServices<TServices extends RepositoryPersistHandlerServices> = PersistHandlerRequirements<
	HandlerFromService<TServices[number]>
>;

/**
 * Generated repository methods provided by `Repository.Service(...)`.
 */
export type RepositoryServiceMethods<TError = never, TRequirements = never> = {
	/**
	 * Persists recorded aggregate domain events by dispatching them to persist handlers.
	 */
	save<TAggregate extends AnyAggregateRoot>(
		aggregate: TAggregate,
	): Effect.Effect<void, TError, TRequirements>;
};
type RepositoryServiceImplementation<THandlers extends RepositoryPersistHandlerServices> = RepositoryServiceMethods<
	SaveErrorFromServices<THandlers>,
	SaveRequirementsFromServices<THandlers>
>;
/**
 * Definition object accepted by `Repository.Service(...)`.
 */
export type RepositoryServiceDefinition<THandlers extends RepositoryPersistHandlerServices> = {
	persistHandlers: THandlers;
	dependencies?: EffectServiceDependencies;
};

function saveWithHandlers(
	aggregate: AnyAggregateRoot,
	persistHandlers: readonly AnyPersistHandler[],
): Effect.Effect<void, unknown, unknown> {
	const events = aggregate.getDomainEvents();

	if (events.length === 0) {
		return Effect.void;
	}

	return Effect.gen(function* () {
		for (const handler of persistHandlers) {
			const acceptedEvents = events.filter((event) => handler.canHandle(event));

			if (acceptedEvents.length === 0) {
				continue;
			}

			yield* handler.handle(acceptedEvents);
		}

		aggregate.clearDomainEvents(INTERNAL_DOMAIN_EVENT_CLEAR_TOKEN);
	});
}

function makeRepositoryService<Self extends object>() {
	return function <
		const TKey extends string,
		const THandlers extends RepositoryPersistHandlerServices,
	>(
		key: TKey,
		definition: RepositoryServiceDefinition<THandlers>,
	): EffectServiceClass<Self, RepositoryServiceImplementation<THandlers>> {
		const Base = makeEffectServiceClass<Self, RepositoryServiceImplementation<THandlers>>(
			key,
			Effect.gen(function* () {
				const persistHandlers: AnyPersistHandler[] = [];

				for (const persistHandlerService of definition.persistHandlers) {
					persistHandlers.push(yield* persistHandlerService);
				}

				return serviceImplementation<RepositoryServiceImplementation<THandlers>>({
					save<TAggregate extends AnyAggregateRoot>(aggregate: TAggregate) {
						return saveWithHandlers(aggregate, persistHandlers);
					},
				});
			}),
			definition.dependencies,
		);
		const BaseClass = Base as unknown as { new (...args: never[]): object };

		abstract class RepositoryService extends BaseClass {
			public constructor(...args: never[]) {
				super(...args);

				if (Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(this), 'save')) {
					throw new Error('Repository.Service custom implementation must not define save().');
				}
			}
		}

		return RepositoryService as unknown as EffectServiceClass<Self, RepositoryServiceImplementation<THandlers>>;
	};
}

export const Repository = {
	/**
	 * Creates an Effect service with generated `save(...)` plus custom repository methods.
	 *
	 * @example
	 * class OrderRepository extends Repository.Service<OrderRepository>()(
	 *   "OrderRepository",
	 *   {
	 *     persistHandlers: [OrderPersistHandler],
	 *     dependencies: [OrderDb.Default, OrderPersistHandler.Default]
	 *   }
	 * ) {
	 *   findById(id: OrderId) {
	 *     return Effect.gen(function* () {
	 *       const db = yield* OrderDb
	 *       // load aggregate
	 *     })
	 *   }
	 * }
	 *
	 * const repo = yield* OrderRepository
	 */
	Service: makeRepositoryService,
};
