import { serve } from '@hono/node-server';
import { Effect } from 'effect';
import { Hono } from 'hono';
import { runEffectOrderExample } from './order-effect.js';
import { runNeverthrowOrderExample } from './order-neverthrow.js';
import { runPureOrderExample } from './order-pure.js';
import { runValueObjectExamples } from './value-object-examples.js';

const app = new Hono();

app.get('/', (c) =>
	c.json({
		examples: [
			'/pure/order',
			'/neverthrow/order',
			'/effect/order',
			'/value-objects',
		],
	}),
);

app.get('/pure/order', async (c) => {
	await runPureOrderExample();
	return c.json({ ok: true, implementation: 'pure' });
});

app.get('/neverthrow/order', async (c) => {
	const result = await runNeverthrowOrderExample();

	return result.match(
		() => c.json({ ok: true, implementation: 'neverthrow' }),
		(error) => c.json({ ok: false, error: error._tag, message: error.message }, 500),
	);
});

app.get('/effect/order', async (c) => {
	const result = await Effect.runPromiseExit(runEffectOrderExample);

	return result._tag === 'Success'
		? c.json({ ok: true, implementation: 'effect' })
		: c.json({ ok: false, error: String(result.cause) }, 500);
});

app.get('/value-objects', async (c) => {
	return c.json(await runValueObjectExamples());
});

serve(
	{
		fetch: app.fetch,
		port: 3000,
	},
	(info) => {
		console.log(`Examples server is running on http://localhost:${info.port}`);
	},
);
