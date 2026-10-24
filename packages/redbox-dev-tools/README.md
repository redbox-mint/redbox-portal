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
npm install --save-dev /approved-artifacts/researchdatabox-redbox-dev-tools-4.5.1.tgz
```

## Quick Start

Initialize a new hook project:

```bash
npx --no-install redbox-dev-tools init redbox-hook-my-client
```

The only supported scaffold is **v6**, also the default. `--template standard`
is rejected. Install the qualified v6 dev-tools and matching core artifacts before
running these commands; an older published package with the same historical
version label is not proof of v6 compatibility.

The generated project contains `src/`, `assets/`, `views/`, a standalone TypeScript
configuration and an exact-pinned package manifest. It declares a neutral
`registerRedboxExtension()` export, a concrete module with an owned audit file,
a public handler/route, startup configuration under `custom.<hook-name>`, and
migration/bootstrap operations. Registration and factory binding remain offline.

```sh
npm run build
npm pack --ignore-scripts
```

The package is a portal extension. Install its pack in the deployment and bind
its concrete module, handler and `ensureNamedQuery` repository inputs through
`createPortalHost`'s `bindings` option. Supply a writable audit path and the
finalized `config.custom[hookName].greeting`. The production application owns
initialization, activation, migration ledger, HTTP admission, drain and close;
the hook does not create another listener or signal owner. Protected routes need
ordered policies; the sample status route is deliberately public.

See [v6 conversion and deployment bindings](../../support/specs/sails-retirement/hook-migration-v6.md)
and [the generated-app qualification](../redbox-core/test/qualification/generated-institution.cjs).
The latter compiles and packs a fresh hook, supplies concrete persisted operations,
then exercises production HTTP startup, restart and cleanup with real MongoDB.

Use exact dependency versions. The scaffold explicitly pins TypeScript and Node
declarations for standalone compilation and declares core as a matching peer/dev
dependency. Runtime libraries owned by a hook need explicit direct dependencies.
The development-only `runtime-resolver`, `testing`, `run-hook-tsc` and
`run-hook-mocha` helpers support existing converted hooks; they do not register
runtime services or install globals.

Package names retain historical version labels. Qualify core/dev-tools together;
matching numeric labels alone do not establish runtime compatibility.

## CLI Commands

### `init`

Initialize a new ReDBox hook project from the v6 archetype:

```sh
npx --no-install redbox-dev-tools init redbox-hook-my-client
# Explicit equivalent:
npx --no-install redbox-dev-tools init redbox-hook-my-client --template v6
```

Build and pack the generated extension, then install it in the configured portal
application with its explicit bindings as described above. Existing institution
customizations require source conversion; regeneration is not a migration.

### `check`

Validate the current hook package's exact dependency contract, including the
explicit v6 scaffold compiler/declaration pins and direct hook-owned libraries.

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

Generated model and outline exports are registered in `sails-ng-common/src/shared.ts`,
which is re-exported by the Node root, browser and compiler-free runtime entrypoints.

```bash
npx @researchdatabox/redbox-dev-tools generate form-component my-widget --app form
```

Optional Angular service scaffold:

```bash
npx @researchdatabox/redbox-dev-tools generate form-component my-widget --app form --with-service
```

### `sync-translation`

Read translations from API and write to language defaults files.

```bash
npx @researchdatabox/redbox-dev-tools sync-translation -a "https://example.com" -l ~/redbox-portal/language-defaults
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

## V6 migration

The legacy scaffold, shim metadata and framework/global registration examples are
retired. Port the institution's code using the
[v6 migration guide](../../support/specs/sails-retirement/hook-migration-v6.md)
and run the deployment's supported checks against its exact qualified artifacts.
