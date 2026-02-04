import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Baseline rules - conservative and non-blocking initially
      // These will be tightened in later phases
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-require-imports': 'off',
      'no-fallthrough': 'warn',
      'no-case-declarations': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.js', '**/*.mjs'],
  }
);
