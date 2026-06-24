import type z4 from 'zod/v4';

/**
 * Fallback domain error for unexpected domain-level failures.
 */
export class UnknownDomainError extends Error {
	public readonly _tag = 'UnknownDomainError';

	public constructor(message = 'Unknown domain error', public readonly cause?: unknown) {
		super(message);
	}
}

/**
 * General validation error when no narrower validation category is appropriate.
 */
export class DomainValidationError extends Error {
	public readonly _tag = 'DomainValidationError';

	public constructor(message = 'Domain validation failed', public readonly cause?: unknown) {
		super(message);
	}
}

/**
 * Raised when a domain invariant would be violated.
 */
export class DomainInvariantError extends Error {
	public readonly _tag = 'DomainInvariantError';

	public constructor(message = 'Domain invariant failed', public readonly cause?: unknown) {
		super(message);
	}
}

/**
 * Raised when a value object input does not satisfy its schema.
 */
export class ValueObjectValidationError extends Error {
	public readonly _tag = 'ValueObjectValidationError';

	public constructor(message = 'Value object validation failed', public readonly cause?: z4.ZodError | unknown) {
		super(message);
	}
}

/**
 * Raised when a domain event payload or serialized event shape is invalid.
 */
export class DomainEventValidationError extends Error {
	public readonly _tag = 'DomainEventValidationError';

	public constructor(message = 'Domain event validation failed', public readonly cause?: z4.ZodError | unknown) {
		super(message);
	}
}

/**
 * Base persistence-category error for repository or handler implementations.
 */
export class DomainPersistenceError extends Error {
	public readonly _tag = 'DomainPersistenceError';

	public constructor(message = 'Domain persistence failed', public readonly cause?: unknown) {
		super(message);
	}
}

/**
 * Raised when optimistic concurrency or version checks fail.
 */
export class DomainConcurrencyError extends Error {
	public readonly _tag = 'DomainConcurrencyError';

	public constructor(message = 'Domain concurrency conflict', public readonly cause?: unknown) {
		super(message);
	}
}
