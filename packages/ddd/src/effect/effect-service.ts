import { Effect, Layer } from 'effect';

type NonNever<TValue> = [TValue] extends [never] ? object : TValue;

type EffectServiceMake<TSelf extends object> = {
	readonly accessors: true;
	readonly effect: Effect.Effect<NonNever<TSelf>, unknown, unknown>;
	readonly dependencies?: ReadonlyArray<Layer.Layer.Any>;
};

export type EffectServiceClass<TSelf extends object> = Effect.Service.Class<
	NonNever<TSelf>,
	string,
	EffectServiceMake<TSelf>
> &
	Effect.Effect<TSelf, never, TSelf>;

/**
 * Layer dependencies accepted by generated Effect service factories.
 */
export type EffectServiceDependencies = ReadonlyArray<Layer.Layer.Any>;

type EffectServiceBase<TSelf extends object> = Effect.Service.Class<NonNever<TSelf>, string, EffectServiceMake<TSelf>>;

// Effect.Service is designed for `class X extends Effect.Service<X>()(...) {}`.
// This is the single unsafe boundary that adapts that class API to yieldable const service tags.
function makeYieldableServiceClass<TSelf extends object>(base: unknown): EffectServiceClass<TSelf> {
	const serviceBase = base as EffectServiceBase<TSelf>;
	const BaseClass = base as { new (...args: never[]): object };

	abstract class YieldableService extends BaseClass {
		public static readonly Default = serviceBase.Default;
		public static readonly make = serviceBase.make;
		public static readonly use = serviceBase.use;

		public static [Symbol.iterator]() {
			return serviceBase[Symbol.iterator]();
		}
	}

	if ('DefaultWithoutDependencies' in serviceBase) {
		Object.defineProperty(YieldableService, 'DefaultWithoutDependencies', {
			value: serviceBase.DefaultWithoutDependencies,
		});
	}

	return YieldableService as unknown as EffectServiceClass<TSelf>;
}

/**
 * Creates a yieldable Effect service class from a factory Effect.
 *
 * This helper centralizes the unsafe cast needed to adapt Effect's class-first
 * `Effect.Service` API to this library's const service factory API.
 */
export function makeEffectServiceClass<TSelf extends object>(
	key: string,
	effect: Effect.Effect<TSelf, unknown, unknown>,
	dependencies: EffectServiceDependencies = [],
): EffectServiceClass<TSelf> {
	const service = Effect.Service<NonNever<TSelf>>() as unknown as (
		key: string,
		make: EffectServiceMake<TSelf>,
	) => EffectServiceBase<TSelf>;
	const base = service(key, {
		accessors: true,
		effect: effect as Effect.Effect<NonNever<TSelf>, unknown, unknown>,
		dependencies,
	});

	return makeYieldableServiceClass<TSelf>(base);
}

export function serviceImplementation<TSelf extends object>(value: unknown): TSelf {
	return value as TSelf;
}
