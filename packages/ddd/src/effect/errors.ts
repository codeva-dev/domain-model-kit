import { Schema, type Cause } from 'effect';

const defaultDomainErrorFields = {
	message: Schema.String,
	cause: Schema.optional(Schema.Unknown),
};

type DefaultDomainErrorFields = typeof defaultDomainErrorFields;
type TaggedDomainErrorFields<TTag extends string, TFields extends Schema.Struct.Fields> = {
	readonly _tag: Schema.tag<TTag>;
} & TFields;
export type DomainErrorInstance<TTag extends string, TFields extends Schema.Struct.Fields = DefaultDomainErrorFields> =
	Cause.YieldableError & Schema.Struct.Type<TFields> & { readonly _tag: TTag };
export type DomainErrorClass<TTag extends string, TFields extends Schema.Struct.Fields = DefaultDomainErrorFields> =
	Schema.TaggedErrorClass<
		DomainErrorInstance<TTag, TFields>,
		TTag,
		TaggedDomainErrorFields<TTag, TFields>
	>;

/**
 * Creates Effect `Schema.TaggedError` classes for domain errors.
 *
 * @example
 * const OrderDomainError = DomainError.Class("OrderDomainError")
 * type OrderDomainError = InstanceType<typeof OrderDomainError>
 *
 * yield* Effect.fail(new OrderDomainError({ message: "Order is invalid" }))
 *
 * @example
 * const OrderNotFound = DomainError.Class("OrderNotFound", {
 *   message: Schema.String,
 *   orderId: Schema.String
 * })
 */
function makeDomainError<const TTag extends string, const TFields extends Schema.Struct.Fields = DefaultDomainErrorFields>(
	tag: TTag,
	fields?: TFields,
): DomainErrorClass<TTag, TFields> {
	const errorFields = (fields ?? defaultDomainErrorFields) as unknown as TFields;

	return Schema.TaggedError<DomainErrorInstance<TTag, TFields>>(tag)(
		tag,
		errorFields,
	) as unknown as DomainErrorClass<TTag, TFields>;
}

export const DomainError = {
	/**
	 * Creates an Effect `Schema.TaggedError` class.
	 *
	 * If fields are omitted, the error shape is `{ message: string; cause?: unknown }`.
	 */
	Class: makeDomainError,
};

/**
 * Fallback domain error for unexpected domain-level failures.
 */
export const UnknownDomainError = DomainError.Class('UnknownDomainError');
export type UnknownDomainError = InstanceType<typeof UnknownDomainError>;

/**
 * General validation error when no narrower validation category is appropriate.
 */
export const DomainValidationError = DomainError.Class('DomainValidationError');
export type DomainValidationError = InstanceType<typeof DomainValidationError>;

/**
 * Raised when a domain invariant would be violated.
 */
export const DomainInvariantError = DomainError.Class('DomainInvariantError');
export type DomainInvariantError = InstanceType<typeof DomainInvariantError>;

/**
 * Raised when a value object input does not satisfy its schema.
 */
export const ValueObjectValidationError = DomainError.Class('ValueObjectValidationError');
export type ValueObjectValidationError = InstanceType<typeof ValueObjectValidationError>;

/**
 * Raised when a domain event payload or serialized event shape is invalid.
 */
export const DomainEventValidationError = DomainError.Class('DomainEventValidationError');
export type DomainEventValidationError = InstanceType<typeof DomainEventValidationError>;

/**
 * Raised when optimistic concurrency or version checks fail.
 */
export const DomainConcurrencyError = DomainError.Class('DomainConcurrencyError');
export type DomainConcurrencyError = InstanceType<typeof DomainConcurrencyError>;

/**
 * Base persistence-category error for repository or handler implementations.
 */
export const DomainPersistenceError = DomainError.Class('DomainPersistenceError');
export type DomainPersistenceError = InstanceType<typeof DomainPersistenceError>;
