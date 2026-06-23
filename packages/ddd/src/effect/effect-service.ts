import { Effect, Layer } from 'effect';

type NonNever<TValue> = [TValue] extends [never] ? object : TValue;

type EffectServiceMake<TImplementation extends object> = {
	readonly accessors: true;
	readonly effect: Effect.Effect<NonNever<TImplementation>, unknown, unknown>;
	readonly dependencies?: ReadonlyArray<Layer.Layer.Any>;
};

export type EffectServiceClass<
	TSelf extends object,
	TImplementation extends object = NonNever<TSelf>,
> = Effect.Service.Class<
	NonNever<TSelf>,
	string,
	EffectServiceMake<TImplementation>
>;

/**
 * Layer dependencies accepted by generated Effect service factories.
 */
export type EffectServiceDependencies = ReadonlyArray<Layer.Layer.Any>;

/**
 * Creates a yieldable Effect service class from a factory Effect.
 *
 * This helper centralizes the small cast needed to create Effect service
 * classes from library-generated implementation objects.
 */
export function makeEffectServiceClass<
	TSelf extends object,
	TImplementation extends object = NonNever<TSelf>,
>(
	key: string,
	effect: Effect.Effect<TImplementation, unknown, unknown>,
	dependencies: EffectServiceDependencies = [],
): EffectServiceClass<TSelf, TImplementation> {
	const service = Effect.Service<NonNever<TSelf>>() as unknown as (
		key: string,
		make: EffectServiceMake<TImplementation>,
	) => EffectServiceClass<TSelf, TImplementation>;

	return service(key, {
		accessors: true,
		effect: effect as Effect.Effect<NonNever<TImplementation>, unknown, unknown>,
		dependencies,
	});
}

export function serviceImplementation<TSelf extends object>(value: unknown): TSelf {
	return value as TSelf;
}
