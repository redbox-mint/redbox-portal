# ReDBox Hook Kit

A development toolkit for creating ReDBox customisation hooks with TypeScript support.

## Overview

The `@researchdatabox/redbox-hook-kit` package provides all the necessary TypeScript tooling and shared configuration for developing ReDBox hook projects. It ensures consistency across hook implementations and simplifies dependency management.

## Features

- **TypeScript tooling**: Pre-configured TypeScript, ts-node, and type definitions
- **Shared configuration**: Base `tsconfig.json` that follows ReDBox conventions
- **CLI scaffolding**: Quick project initialization with `npx`
- **Type safety**: Includes ReDBox core types as peer dependency
- **Version alignment**: Versioned to match ReDBox core releases

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

This will:
- Create the `typescript/api/controllers/` directory structure
- Generate a `tsconfig.json` that extends the shared base configuration
- Create a sample controller to get you started

## TypeScript Configuration

Your hook project's `tsconfig.json` should extend the shared configuration:

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

**Note:** The `typeRoots` configuration is necessary to allow TypeScript to find type definitions from the hook-kit's dependencies.

## Compiling TypeScript

Compile your TypeScript code using the provided `redbox-tsc` wrapper:

```bash
npx redbox-tsc
```

Or add it to your `package.json` scripts:

```json
{
  "scripts": {
    "build": "redbox-tsc",
    "watch": "redbox-tsc --watch"
  }
}
```

Then run:

```bash
npm run build
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

module.exports = new Controllers.MyController().exports();
```

## Dependencies Included

This package includes the following development dependencies:

- `typescript` - TypeScript compiler
- `ts-node` - TypeScript execution environment
- `@tsconfig/node24` - Base TypeScript configuration for Node.js 24
- `@types/node` - Node.js type definitions
- `@types/lodash` - Lodash type definitions
- `lodash` - Utility library
- `rxjs` - Reactive extensions

## Peer Dependencies

- `@researchdatabox/redbox-core-types` - ReDBox core type definitions (required)

## Versioning

This package is versioned to match the ReDBox core release it supports. For example, version `4.5.1` is compatible with ReDBox Portal version `4.5.1`.

## CLI Commands

### `init`

Initialize a new ReDBox hook project with TypeScript setup.

```bash
npx @researchdatabox/redbox-hook-kit init
```

### `install-skills`

Install the bundled agent skills using the `vercel-labs/skills` CLI. Bundled agent skills are curated prompt packs that teach supported agents how to work with ReDBox conventions, file layouts, and workflows. Install them to enable consistent, repo-aware assistance from your agent.

Prerequisites
- Install the external Skills CLI: `npx @vercel/skills --help` (or follow the install instructions in the Skills docs).
- Authenticate if required by your agent runtime (some agents prompt for login on first run).

Usage
- `-a <agent>`: Target agent runtime (for example `claude-code`).
- `--skill <pattern>`: Skill name or glob pattern (for example `redbox-*` or `*`).
- Skills are optional but recommended for consistent guidance and guardrails.

This will:
- Copy the bundled skill definitions from this package into the Skills CLI workspace.
- Register the skills for the specified agent runtime.
- Make the skills available for subsequent agent sessions.

```bash
npx @researchdatabox/redbox-hook-kit install-skills -a claude-code --skill 'redbox-*'
```

For advanced options, see the `vercel-labs/skills` documentation: https://github.com/vercel-labs/skills

### `help`

Show CLI help and usage information.

```bash
npx @researchdatabox/redbox-hook-kit help
```

## Contributing

See the main [ReDBox Portal repository](https://github.com/redbox-mint/redbox-portal) for contribution guidelines.

## License

ISC
