import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			include: ['src/{pure,neverthrow,effect}/**/*.ts'],
			exclude: ['src/**/index.ts'],
			thresholds: {
				lines: 95,
				functions: 95,
				branches: 90,
				statements: 95,
			},
		},
		include: ['test/**/*.test.ts'],
	},
});
