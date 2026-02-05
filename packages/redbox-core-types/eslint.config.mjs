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
    files: [
      'src/Logger.ts',
      'src/bootstrap.ts',
      'src/config/**/*.ts',
      'src/configmodels/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
    },
  },
  {
    files: ['src/services/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': ['error', { fixToUnknown: true }],
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.js', '**/*.mjs'],
  }
);
