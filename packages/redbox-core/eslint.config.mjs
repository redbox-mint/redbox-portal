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
        allowDefaultProject: ['**/*.d.ts'],
      },
    },
    rules: {
      // Baseline rules - conservative and non-blocking initially
      // These will be tightened in later phases
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-fallthrough': 'warn',
      'no-case-declarations': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-catch': 'warn',
      'no-empty': 'warn',
      'no-control-regex': 'warn',
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off'
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.js', '**/*.mjs', 'src/sails.d.ts'],
  }
);
