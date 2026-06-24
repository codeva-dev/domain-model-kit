/**
 * Base class for domain objects that are identified by an ID.
 *
 * Use `Entity.Class<TId>()` instead of extending this class directly.
 */
export abstract class EntityBase<TId = unknown> {
	protected constructor(public readonly id: TId) {}

	/**
	 * Compares entities by identity.
	 */
	public equals(entity: EntityBase<TId>): boolean {
		return Object.is(this.id, entity.id);
	}
}

function makeEntity<TId = unknown>() {
	return EntityBase<TId>;
}

export const Entity = {
	/**
	 * Creates an entity base class with the given ID type.
	 *
	 * @example
	 * class Product extends Entity.Class<ProductId>() {
	 *   constructor(id: ProductId, public readonly name: string) {
	 *     super(id)
	 *   }
	 * }
	 */
	Class: makeEntity,
};
