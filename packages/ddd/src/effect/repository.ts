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

/**
 * Custom repository methods supplied by the consumer.
 *
 * `save` is reserved for the generated repository method.
 */
export type RepositoryCustomMethods = object & { readonly save?: never };
/**
 * Definition object accepted by `Repository.Service(...)`.
 */
export type RepositoryServiceDefinition<TCustomMethods extends RepositoryCustomMethods> = {
	persistHandlers: RepositoryPersistHandlerServices;
	effect?: Effect.Effect<TCustomMethods, unknown, unknown>;
	sync?: () => TCustomMethods;
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
	return function <const TKey extends string, TCustomMethods extends RepositoryCustomMethods = {}>(
		key: TKey,
		definition: RepositoryServiceDefinition<TCustomMethods>,
	): EffectServiceClass<Self> {
		return makeEffectServiceClass<Self>(
			key,
			Effect.gen(function* () {
				const persistHandlers: AnyPersistHandler[] = [];

				for (const persistHandlerService of definition.persistHandlers) {
					persistHandlers.push(yield* persistHandlerService);
				}

				const customMethods = definition.effect
					? yield* definition.effect
					: (definition.sync?.() ?? ({} as TCustomMethods));

				if ('save' in customMethods) {
					throw new Error('Repository.Service custom implementation must not define save().');
				}

				return serviceImplementation<Self>({
					...customMethods,
					save<TAggregate extends AnyAggregateRoot>(aggregate: TAggregate) {
						return saveWithHandlers(aggregate, persistHandlers);
					},
				});
			}),
			definition.dependencies,
		);
	};
}

export const Repository = {
	/**
	 * Creates an Effect service with generated `save(...)` plus custom repository methods.
	 *
	 * @example
	 * const OrderRepository = Repository.Service<OrderRepositoryService>()(
	 *   "OrderRepository",
	 *   {
	 *     persistHandlers: [OrderPersistHandler],
	 *     sync: () => {
	 *       return {
	 *         findById(id: OrderId) {
	 *           return Effect.gen(function* () {
	 *             const db = yield* OrderDb
	 *             // load aggregate
	 *           })
	 *         }
	 *       }
	 *     },
	 *     dependencies: [OrderDb.Default, OrderPersistHandler.Default]
	 *   }
	 * )
	 *
	 * const repo = yield* OrderRepository
	 */
	Service: makeRepositoryService,
};
