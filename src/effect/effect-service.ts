import { Effect, Layer } from 'effect';

type NonNever<TValue> = [TValue] extends [never] ? object : TValue;

type EffectServiceMake<
	TImplementation extends object,
	TError,
	TRequirements,
	TDependencies extends EffectServiceDependencies,
> = {
	readonly accessors: true;
	readonly effect: Effect.Effect<NonNever<TImplementation>, TError, TRequirements>;
	readonly dependencies: TDependencies;
};

export type EffectServiceClass<
	TSelf extends object,
	TImplementation extends object = NonNever<TSelf>,
	TError = never,
	TRequirements = never,
	TDependencies extends EffectServiceDependencies = readonly [],
> = Effect.Service.Class<
	NonNever<TSelf>,
	string,
	EffectServiceMake<TImplementation, TError, TRequirements, TDependencies>
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
	TError = never,
	TRequirements = never,
	const TDependencies extends EffectServiceDependencies = readonly [],
>(
	key: string,
	effect: Effect.Effect<TImplementation, TError, TRequirements>,
	dependencies: TDependencies = [] as unknown as TDependencies,
): EffectServiceClass<TSelf, TImplementation, TError, TRequirements, TDependencies> {
	const service = Effect.Service<NonNever<TSelf>>() as unknown as (
		key: string,
		make: EffectServiceMake<TImplementation, TError, TRequirements, TDependencies>,
	) => EffectServiceClass<TSelf, TImplementation, TError, TRequirements, TDependencies>;

	return service(key, {
		accessors: true,
		effect: effect as Effect.Effect<NonNever<TImplementation>, TError, TRequirements>,
		dependencies,
	});
}

export function serviceImplementation<TSelf extends object>(value: unknown): TSelf {
	return value as TSelf;
}
