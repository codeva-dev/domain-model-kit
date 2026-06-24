import { INTERNAL_DOMAIN_EVENT_CLEAR_TOKEN, type AggregateRootBase } from './aggregate-root.js';
import type { DomainEventBase } from './domain-event.js';
import { normalizePersistHandlerResult, type IPersistHandler } from './persist-handler.js';

export type RepositoryPersistHandlers<TContext = unknown> = readonly IPersistHandler<DomainEventBase, TContext>[];
export type AnyRepositoryPersistHandlers = RepositoryPersistHandlers<unknown>;
export type AnyAggregateRoot = AggregateRootBase<unknown, DomainEventBase>;
export type HandlerContext<THandlers extends AnyRepositoryPersistHandlers> =
	THandlers[number] extends IPersistHandler<DomainEventBase, infer TContext> ? TContext : never;
export type RepositoryClass<TDbContext extends TContext, TContext, THandlers extends AnyRepositoryPersistHandlers> =
	abstract new () => RepositoryBase<TDbContext, TContext, THandlers>;

/**
 * Base class for event-dispatching persistence repositories.
 *
 * Use `Repository.Class(...)` and add query/load methods in the concrete repository.
 */
export abstract class RepositoryBase<TDbContext extends TContext, TContext, THandlers extends AnyRepositoryPersistHandlers> {
	protected readonly dbContext: TDbContext;
	protected readonly persistHandlers: THandlers;

	protected constructor(props: { dbContext: TDbContext; persistHandlers: THandlers }) {
		this.dbContext = props.dbContext;
		this.persistHandlers = props.persistHandlers;
	}

	/**
	 * Persists recorded aggregate domain events by dispatching them to persist handlers.
	 *
	 * Events are processed sequentially in handler order. The aggregate events are cleared only
	 * after all matching handlers complete successfully.
	 */
	public async save<TAggregate extends AnyAggregateRoot>(
		aggregate: TAggregate,
		context: TContext = this.dbContext,
	): Promise<void> {
		const events = aggregate.getDomainEvents();

		if (events.length === 0) {
			return;
		}

		for (const handler of this.persistHandlers) {
			const acceptedEvents = events.filter((event) => handler.canHandle(event));

			if (acceptedEvents.length === 0) {
				continue;
			}

			await normalizePersistHandlerResult(handler.handle(acceptedEvents, context));
		}

		aggregate.clearDomainEvents(INTERNAL_DOMAIN_EVENT_CLEAR_TOKEN);
	}
}

function makeRepository<const THandlers extends AnyRepositoryPersistHandlers, TDbContext extends HandlerContext<THandlers>>(
	definition: { dbContext: TDbContext; persistHandlers: THandlers },
): RepositoryClass<TDbContext, HandlerContext<THandlers>, THandlers> {
	abstract class CreatedRepository extends RepositoryBase<TDbContext, HandlerContext<THandlers>, THandlers> {
		public constructor() {
			super(definition);
		}
	}

	return CreatedRepository as RepositoryClass<TDbContext, HandlerContext<THandlers>, THandlers>;
}

export const Repository = {
	/**
	 * Creates a repository base class with generated `save(...)`.
	 *
	 * @example
	 * class OrderRepository extends Repository.Class({
	 *   dbContext,
	 *   persistHandlers: [new OrderPersistHandler()]
	 * }) {
	 *   findById(id: OrderId) {
	 *     return this.dbContext.orders.get(id)
	 *   }
	 * }
	 */
	Class: makeRepository,
};
