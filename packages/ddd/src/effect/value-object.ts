import { Data, Effect, Equal, Schema } from 'effect';
import { ValueObjectValidationError } from './errors.js';

function toEqualValue(value: unknown): unknown {
	if (typeof value !== 'object' || value === null) {
		return value;
	}

	if (Array.isArray(value)) {
		return Data.array(value.map(toEqualValue));
	}

	return Data.struct(
		Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toEqualValue(child)])),
	);
}

function deepFreeze<TValue>(value: TValue): TValue {
	if (typeof value !== 'object' || value === null) {
		return value;
	}

	Object.freeze(value);

	for (const child of Object.values(value)) {
		deepFreeze(child);
	}

	return value;
}

/**
 * Base class for immutable value objects.
 *
 * Use `ValueObject.Class(schema)` so the value is decoded before an instance is created.
 */
export abstract class ValueObjectBase<TValue = unknown> {
	protected constructor(public readonly value: TValue) {
		deepFreeze(value);
	}

	/**
	 * Structural equality based on the validated value.
	 */
	public equals(other: ValueObjectBase<TValue>): boolean {
		return Equal.equals(toEqualValue(this.value), toEqualValue(other.value));
	}

	/**
	 * Returns the validated value in a JSON-friendly shape.
	 */
	public toJSON(): TValue {
		return this.value;
	}
}

function makeValueObject<const TSchema extends Schema.Schema.Any>(schema: TSchema) {
	type Value = typeof schema.Type;

	class CreatedValueObject extends ValueObjectBase<Value> {
		protected constructor(value: Value) {
			super(value);
		}

		public static readonly schema = schema;

		public static create(input: unknown): Effect.Effect<CreatedValueObject, ValueObjectValidationError> {
			return Schema.decodeUnknown(schema)(input).pipe(
				Effect.mapError(
					(error) =>
						new ValueObjectValidationError({
							message: 'Value object validation failed',
							cause: error,
						}),
				),
				Effect.map((value) => new CreatedValueObject(value)),
			) as Effect.Effect<CreatedValueObject, ValueObjectValidationError>;
		}
	}

	return CreatedValueObject;
}

export const ValueObject = {
	/**
	 * Creates a value object class backed by an Effect Schema.
	 *
	 * @example
	 * const EmailSchema = Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
	 * class Email extends ValueObject.Class(EmailSchema) {}
	 * const email = yield* Email.create("test@example.com")
	 */
	Class: makeValueObject,
};
