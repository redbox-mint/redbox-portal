import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.tmp/**',
      '**/.git/**',
      'support/wiki/**',
      'support/docs/**',
      '**/*.d.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['{api,config,test,typescript}/**/*.{ts,tsx}', 'packages/*/{src,test}/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    files: ['test/**/*.ts', 'packages/*/test/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  }
);
