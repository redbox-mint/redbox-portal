# Redbox Dev Tools

The `@researchdatabox/redbox-dev-tools` package provides shared configuration, generators, and migration tooling for developing ReDBox customisation hooks.

## Overview

This package provides:
- **Shared TypeScript configuration** - Pre-configured TypeScript settings and type definitions
- **Shared configuration** - Base `tsconfig.json` following ReDBox conventions
- **CLI scaffolding** - Quick project initialization with `npx`
- **Version alignment** - Versioned to match ReDBox core releases

## Installation

```bash
npm install --save-dev @researchdatabox/redbox-dev-tools
npm install @researchdatabox/redbox-core
```

## Quick Start

Initialize a new hook project:

```bash
npx @researchdatabox/redbox-dev-tools init
```

This creates:
- `typescript/api/controllers/` directory structure (recommended location for hook controllers)
- `tsconfig.json` extending the shared base configuration
- A sample controller and registration boilerplate to get started

## TypeScript Configuration

Your hook's `tsconfig.json` should extend the shared configuration:

```json
{
    "extends": "@researchdatabox/redbox-dev-tools/config/tsconfig.base.json",
    "compilerOptions": {
        "outDir": "./",
        "rootDir": "./typescript",
        "typeRoots": [
            "node_modules/@types",
            "node_modules/@researchdatabox/redbox-dev-tools/node_modules/@types"
        ]
    },
    "include": [
        "typescript/**/*.ts"
    ]
}
```

> **Note:** The `typeRoots` configuration allows TypeScript to find type definitions from the dev tools package dependencies.

## Compiling TypeScript

Compile hooks with the dev tools wrapper so shared runtime resolution stays aligned with the Redbox hook contract:

```bash
node ./node_modules/@researchdatabox/redbox-dev-tools/bin/run-hook-tsc.js -p tsconfig.json
```

Or add to your `package.json` scripts:

```json
{
    "scripts": {
        "compile": "node ./node_modules/@researchdatabox/redbox-dev-tools/bin/run-hook-tsc.js -p tsconfig.json",
        "watch": "node ./node_modules/@researchdatabox/redbox-dev-tools/bin/run-hook-tsc.js -p tsconfig.json --watch"
    }
}
```

This avoids hook-local `paths` hacks and ensures shared runtime packages such as `rxjs`, `axios`, and `lodash` resolve through the Redbox runtime/tooling contract.

## Example Controller

```typescript
import { Controllers as controllers } from '@researchdatabox/redbox-core';

declare var sails;

export module Controllers {
    export class MyController extends controllers.Core.Controller {
        protected _exportedMethods: any = ['myAction'];

        public myAction(req: any, res: any) {
            return res.json({ message: 'Hello from my hook!' });
        }
    }
}

module.exports.registerRedboxControllers = function() {
    return {
        MyController: new Controllers.MyController().exports()
    };
};
```

Add `"sails": { "hasControllers": true }` to your hook `package.json` so the loader discovers your controller registration.

For webservice controllers, export `registerRedboxWebserviceControllers()` instead of `registerRedboxControllers()`.

## Included Dependencies

The dev tools package includes these development dependencies:
- `typescript` - TypeScript compiler
- `ts-node` - TypeScript execution environment
- `@tsconfig/node24` - Base TypeScript configuration for Node.js 24
- `@types/node` - Node.js type definitions
- `@types/lodash` - Lodash type definitions
- `lodash` - Utility library
- `rxjs` - Reactive extensions

## Peer Dependencies

- `@researchdatabox/redbox-core` (required)

## Versioning

Package versions match ReDBox Portal releases. For example, version `4.5.1` is compatible with ReDBox Portal `4.5.1`.

## CLI Commands

| Command | Description |
|---|---|
| `npx @researchdatabox/redbox-dev-tools init` | Initialize a new ReDBox hook project with TypeScript setup |
| `npx @researchdatabox/redbox-dev-tools migrate-form-config --input <legacy.js> --output <migrated.ts>` | Migrate a legacy v4 JS form config file to v5 TS format |
| `npx @researchdatabox/redbox-dev-tools completion <shell>` | Output shell completion script for `bash`, `zsh`, `fish`, and `powershell` |
| `npx @researchdatabox/redbox-dev-tools help` | Show CLI help and usage information |

## See Also

- [Redbox Core Types](redbox-core) - Core type definitions and business logic
- [Using a Sails Hook to customise ReDBox](Using-a-Sails-Hook-to-customise-ReDBox) - Hook development guide
- [Redbox Loader](Redbox-Loader) - How hooks are discovered and loaded
