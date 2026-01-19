# Redbox Hook Kit

The `@researchdatabox/redbox-hook-kit` package provides TypeScript tooling and shared configuration for developing ReDBox customisation hooks.

## Overview

This package provides:
- **TypeScript tooling** - Pre-configured TypeScript, ts-node, and type definitions
- **Shared configuration** - Base `tsconfig.json` following ReDBox conventions
- **CLI scaffolding** - Quick project initialization with `npx`
- **Version alignment** - Versioned to match ReDBox core releases

## Installation

```bash
npm install --save-dev @researchdatabox/redbox-hook-kit
npm install @researchdatabox/redbox-core-types
```

## Quick Start

Initialize a new hook project:

```bash
npx @researchdatabox/redbox-hook-kit init
```

This creates:
- `typescript/api/controllers/` directory structure (recommended location for hook controllers)
- `tsconfig.json` extending the shared base configuration
- A sample controller and registration boilerplate to get started

## TypeScript Configuration

Your hook's `tsconfig.json` should extend the shared configuration:

```json
{
    "extends": "@researchdatabox/redbox-hook-kit/config/tsconfig.base.json",
    "compilerOptions": {
        "outDir": "./",
        "rootDir": "./typescript",
        "typeRoots": [
            "node_modules/@types",
            "node_modules/@researchdatabox/redbox-hook-kit/node_modules/@types"
        ]
    },
    "include": [
        "typescript/**/*.ts"
    ]
}
```

> **Note:** The `typeRoots` configuration allows TypeScript to find type definitions from the hook-kit's dependencies.

## Compiling TypeScript

Use the provided `redbox-tsc` wrapper:

```bash
npx redbox-tsc
```

Or add to your `package.json` scripts:

```json
{
    "scripts": {
        "build": "redbox-tsc",
        "watch": "redbox-tsc --watch"
    }
}
```

## Example Controller

```typescript
import { Controllers as controllers } from '@researchdatabox/redbox-core-types';

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

The hook-kit includes these development dependencies:
- `typescript` - TypeScript compiler
- `ts-node` - TypeScript execution environment
- `@tsconfig/node24` - Base TypeScript configuration for Node.js 24
- `@types/node` - Node.js type definitions
- `@types/lodash` - Lodash type definitions
- `lodash` - Utility library
- `rxjs` - Reactive extensions

## Peer Dependencies

- `@researchdatabox/redbox-core-types` (required)

## Versioning

Package versions match ReDBox Portal releases. For example, version `4.5.1` is compatible with ReDBox Portal `4.5.1`.

## CLI Commands

| Command | Description |
|---|---|
| `npx @researchdatabox/redbox-hook-kit init` | Initialize a new ReDBox hook project with TypeScript setup |
| `npx @researchdatabox/redbox-hook-kit help` | Show CLI help and usage information |

## See Also

- [Redbox Core Types](Redbox-Core-Types) - Core type definitions and business logic
- [Using a Sails Hook to customise ReDBox](Using-a-Sails-Hook-to-customise-ReDBox) - Hook development guide
- [Redbox Loader](Redbox-Loader) - How hooks are discovered and loaded
