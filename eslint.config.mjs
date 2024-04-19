// @ts-check


import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from "globals";
// import rxjs from "eslint-plugin-rxjs";

export default tseslint.config(
    {
        // for typescript files
        files: [
            // "angular/**/*.ts",
            // "angular-legacy/**/*.ts",
            // "core/**/*.ts",
            "typescript/**/*.ts",
        ],
        ignores: [
            "test/**/*.ts",
            "support/**/*.ts",
            "config/**/*.ts",
            "assets/**/*.ts",
            ".tmp/**/*.ts",
        ],
        plugins: {
            // rxjs: rxjs,
        },
        extends: [
            eslint.configs.recommended,
            ...tseslint.configs.recommended,
            ...tseslint.configs.stylistic,
            // {rules: rxjs.configs.recommended.rules},
        ],
        languageOptions: {
            sourceType: "commonjs",
            parserOptions: {
                project: [
                    './tsconfig.json',
                    // './core/tsconfig.json',
                    // './angular-legacy/*/tsconfig.app.json',
                    // './angular/tsconfig.json',
                    // './angular/projects/researchdatabox/*/tsconfig.app.json',
                ],
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // there are too many violations of these rules - turn them off for now
            "no-var": "off",
            "prefer-const": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-this-alias": "off",
            "@typescript-eslint/prefer-namespace-keyword": "off",
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-var-requires": "off",

            // it is good to see the violations of these rules, but they should not fail the lint check

            // these rules must be followed
            "@typescript-eslint/await-thenable": "error",

            // these rules throw errors and need to be fixed
            // "rxjs/no-implicit-any-catch": "off", // https://github.com/cartant/eslint-plugin-rxjs/issues/122
        }
    },
    {
        // for javascript files
        files: [
            "config/**/*.js",
            "form-config/**/*.js",
            "api/**/*.js",
        ],
        ignores: [
            "test/**/*.js",
            "support/**/*.js",
            "config/**/*.js",
            "assets/**/*.js",
            ".tmp/**/*.js",
        ],
        extends: [
            eslint.configs.recommended,
            tseslint.configs.disableTypeChecked,
        ],
        languageOptions: {
            sourceType: "commonjs",
            globals: {
                ...globals.browser,
                "$": "readonly", // jquery
                "sails": "readonly", // sails
                "_": "readonly", // lodash
            }
        },
        rules: {
            // turn off other type-aware rules and rules that don't apply to js
            'deprecation/deprecation': 'off',
            '@typescript-eslint/internal/no-poorly-typed-ts-props': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',

            // there are too many violations of these rules - turn them off for now

            // it is good to see the violations of these rules, but they should not fail the lint check

            // these rules must be followed
            "no-unused-vars": "error",
            "no-undef": "error",
        },
    }
);