import type z4 from 'zod/v4';
import { ValueObjectValidationError } from './errors.js';

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

function stableStringify(value: unknown): string {
	if (typeof value !== 'object' || value === null) {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`;
	}

	return `{${Object.entries(value)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
		.join(',')}}`;
}

/**
 * Base class for immutable value objects.
 *
 * Use `ValueObject.Class(schema)` so the value is validated before an instance is created.
 */
export abstract class ValueObjectBase<TValue = unknown> {
	protected constructor(public readonly value: TValue) {
		deepFreeze(value);
	}

	/**
	 * Structural equality based on the validated value.
	 */
	public equals(other: ValueObjectBase<TValue>): boolean {
		return stableStringify(this.value) === stableStringify(other.value);
	}

	/**
	 * Returns the validated value in a JSON-friendly shape.
	 */
	public toJSON(): TValue {
		return this.value;
	}
}

function makeValueObject<const TSchema extends z4.ZodTypeAny>(schema: TSchema) {
	type Value = z4.infer<TSchema>;

	class CreatedValueObject extends ValueObjectBase<Value> {
		protected constructor(value: Value) {
			super(value);
		}

		public static readonly schema = schema;

		public static create(input: z4.input<TSchema>): CreatedValueObject {
			const parsed = schema.safeParse(input);

			if (!parsed.success) {
				throw new ValueObjectValidationError('Value object validation failed', parsed.error);
			}

			return new CreatedValueObject(parsed.data);
		}
	}

	return CreatedValueObject;
}

export const ValueObject = {
	/**
	 * Creates a value object class backed by a zod schema.
	 *
	 * @example
	 * const EmailSchema = z4.email().brand("Email")
	 * class Email extends ValueObject.Class(EmailSchema) {}
	 * const email = Email.create("test@example.com")
	 */
	Class: makeValueObject,
};
