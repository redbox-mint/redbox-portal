import { defineConfig } from 'vitest/config';

export default defineConfig({
	// Oxc resolves the nested test tsconfig from the repository root, while
	// this package's CI job installs dependencies in the package directory.
	oxc: { tsconfig: false } as any,
	test: {
		environment: 'node',
		include: ['test/**/*.test.ts']
	}
});
