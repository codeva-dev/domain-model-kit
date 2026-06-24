import z4 from 'zod/v4';
import { Effect, Schema } from 'effect';
import * as Pure from '@codeva-dev/domain-model-kit/pure';
import * as Neverthrow from '@codeva-dev/domain-model-kit/neverthrow';
import * as EffectDdd from '@codeva-dev/domain-model-kit/effect';

class PureEmail extends Pure.ValueObject.Class(z4.email().brand('Email')) {}

class NeverthrowEmail extends Neverthrow.ValueObject.Class(z4.email().brand('Email')) {}

const EffectEmailSchema = Schema.String.pipe(
	Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
	Schema.brand('Email'),
);

class EffectEmail extends EffectDdd.ValueObject.Class(EffectEmailSchema) {}

export async function runValueObjectExamples() {
	const pureEmail = PureEmail.create('test@example.com');
	const pureSameEmail = PureEmail.create('test@example.com');

	const neverthrowEmail = NeverthrowEmail.create('test@example.com');
	const neverthrowSameEmail = NeverthrowEmail.create('test@example.com');

	const effectEmail = await Effect.runPromise(EffectEmail.create('test@example.com'));
	const effectSameEmail = await Effect.runPromise(EffectEmail.create('test@example.com'));

	return {
		pureEquals: pureEmail.equals(pureSameEmail),
		neverthrowEquals:
			neverthrowEmail.isOk() && neverthrowSameEmail.isOk()
				? neverthrowEmail.value.equals(neverthrowSameEmail.value)
				: false,
		effectEquals: effectEmail.equals(effectSameEmail),
	};
}
