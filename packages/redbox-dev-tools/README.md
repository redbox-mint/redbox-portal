# ReDBox Dev Tools

A development toolkit for creating and maintaining ReDBox customisation hooks.

## Overview

The `@researchdatabox/redbox-dev-tools` package provides shared configuration, generators, and migration tooling for developing ReDBox hook projects. It ensures consistency across hook implementations and simplifies dependency management.

## Features

- **Shared TypeScript configuration**: Pre-configured TypeScript settings and type definitions
- **Shared configuration**: Base `tsconfig.json` that follows ReDBox conventions
- **CLI scaffolding**: Quick project initialization with `npx`
- **Type safety**: Includes ReDBox core types as peer dependency
- **Version alignment**: Versioned to match ReDBox core releases

## Installation

```bash
npm install --save-dev @researchdatabox/redbox-dev-tools
```

## Quick Start

Initialize a new hook project:

```bash
npx @researchdatabox/redbox-dev-tools init
```

This will:

- Create the `src/api/controllers/` directory structure
- Generate a `tsconfig.json` that extends the shared base configuration
- Update `package.json` to the minimal hook dependency contract
- Create a sample controller to get you started

## TypeScript Configuration

Your hook project's `tsconfig.json` should extend the shared configuration:

```json
{
  "extends": "@researchdatabox/redbox-dev-tools/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "typeRoots": ["node_modules/@types", "node_modules/@researchdatabox/redbox-dev-tools/node_modules/@types"]
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts"]
}
```

**Note:** The `typeRoots` configuration is necessary to allow TypeScript to find type definitions from the dev tools package's dependencies.

## Compiling TypeScript

Compile your TypeScript code using the toolchain provided by dev tools:

```bash
node ./node_modules/@researchdatabox/redbox-dev-tools/bin/run-hook-tsc.js -p tsconfig.json
```

Or add it to your `package.json` scripts:

```json
{
  "scripts": {
    "compile": "node ./node_modules/@researchdatabox/redbox-dev-tools/bin/run-hook-tsc.js -p tsconfig.json"
  }
}
```

Then run:

```bash
npm run compile
```

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

module.exports = new Controllers.MyController().exports();
```

## Shared Dependency Contract

Hooks should declare only:

- `peerDependencies.@researchdatabox/redbox-core`
- `devDependencies.@researchdatabox/redbox-dev-tools`
- direct `dependencies` for hook-owned runtime libraries only

Do not directly declare shared Redbox runtime or toolchain packages in a hook if they are already supplied by the core or dev-tools contract. That includes `axios`, `rxjs`, `lodash`, `mocha`, `chai`, `ts-node`, and `typescript`.

`redbox-dev-tools` directly provides the shared hook authoring toolchain:

- `typescript`
- `ts-node`
- `mocha`
- `chai`
- `@types/node`
- `@types/mocha`
- `@types/chai`
- `@types/lodash`

For hook tests and authoring utilities, `redbox-dev-tools` also exposes shared resolution helpers via `@researchdatabox/redbox-dev-tools/testing` and `@researchdatabox/redbox-dev-tools/runtime-resolver`. These are for development-time use only. Hook runtime code should continue to import normal runtime packages such as `axios` and `rxjs` directly and rely on the Redbox host contract to provide them. The shared TypeScript config prefers resolving those runtime modules from the installed `@researchdatabox/redbox-core` dependency tree, and only falls back to the `redbox-dev-tools` install when package manager flattening hoists them there.

`@researchdatabox/redbox-core` is the runtime compatibility contract for hooks. It supplies the approved shared runtime dependency surface that hook authors may rely on implicitly, including `axios`, `rxjs`, and `lodash`.

## Versioning

This package is versioned to match the ReDBox core release it supports. For example, version `4.5.1` is compatible with ReDBox Portal version `4.5.1`.

## CLI Commands

### `init`

Initialize a new ReDBox hook project with TypeScript setup.

```bash
npx @researchdatabox/redbox-dev-tools init
```

### `check`

Validate that the current hook package does not directly pin shared Redbox runtime or toolchain dependencies.

```bash
npx @researchdatabox/redbox-dev-tools check
```

### `migrate-hook-dependencies`

Rewrite the current hook `package.json` to the minimal shared dependency contract.

```bash
npx @researchdatabox/redbox-dev-tools migrate-hook-dependencies
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
npx @researchdatabox/redbox-dev-tools install-skills -a claude-code --skill 'redbox-*'
```

For advanced options, see the `vercel-labs/skills` documentation: https://github.com/vercel-labs/skills

### `migrate-form-config`

Migrate a legacy v4 JavaScript form config to the v5 TypeScript form framework format.

```bash
npx @researchdatabox/redbox-dev-tools migrate-form-config \
  --input /path/to/legacy-form.js \
  --output /path/to/migrated-form.ts
```

### `generate form-component`

Generate end-to-end scaffold for a new form component in Angular and `sails-ng-common`.

```bash
npx @researchdatabox/redbox-dev-tools generate form-component my-widget --app form
```

Optional Angular service scaffold:

```bash
npx @researchdatabox/redbox-dev-tools generate form-component my-widget --app form --with-service
```

### `help`

Show CLI help and usage information.

```bash
npx @researchdatabox/redbox-dev-tools help
```

### `completion`

Output shell completion scripts for `bash`, `zsh`, `fish`, and `powershell`.

```bash
npx @researchdatabox/redbox-dev-tools completion <shell>
```

Install examples:

```bash
# bash
npx @researchdatabox/redbox-dev-tools completion bash > ~/.local/share/bash-completion/completions/redbox-dev-tools

# zsh
mkdir -p ~/.zsh/completions
npx @researchdatabox/redbox-dev-tools completion zsh > ~/.zsh/completions/_redbox-dev-tools
# then ensure your ~/.zshrc includes:
# fpath=(~/.zsh/completions $fpath)
# autoload -U compinit && compinit

# fish
npx @researchdatabox/redbox-dev-tools completion fish > ~/.config/fish/completions/redbox-dev-tools.fish

# powershell
npx @researchdatabox/redbox-dev-tools completion powershell > ~/.config/powershell/redbox-dev-tools-completion.ps1
# then source it from your PowerShell profile
```

## Contributing

See the main [ReDBox Portal repository](https://github.com/redbox-mint/redbox-portal) for contribution guidelines.

## License

ISC
