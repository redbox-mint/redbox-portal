# Skill: Redbox Hook Development

## Context

ReDBox hooks are NPM packages that extend or customize ReDBox functionality. They are loaded during the Sails lift process.

## Project Structure

- `redbox-hook-[project-name]`
- `typescript/`: TypeScript source code.
- `assets/`: Custom assets.
- `views/`: Custom EJS views.
- `config/`: Configuration overrides.
- `form-config/`: Form configuration overrides.

## Hook Capabilities

Declared in `package.json` under the `sails` key:

- `hasPolicies`: Provides Sails policies.
- `hasServices`: Provides business logic services (can override core).
- `hasControllers`: Provides internal/app controllers (Sails controllers used by the portal).
- `hasWebserviceControllers`: Provides HTTP/webservice-facing controllers (API endpoints).
- `hasBootstrap`: Provides a startup function.
- `hasConfig`: Provides configuration object to merge.

## Required Exports

The hook's main entry point (usually `index.ts` compiled to `index.js`) must export registration functions **only** for the capabilities enabled in `package.json`:

- `registerRedboxPolicies()` — required when `hasPolicies` is `true`.
- `registerRedboxServices()` — required when `hasServices` is `true`.
- `registerRedboxControllers()` — required when `hasControllers` is `true` (internal/app controllers).
- `registerRedboxWebserviceControllers()` — required when `hasWebserviceControllers` is `true` (HTTP/webservice controllers).
- `registerRedboxBootstrap()` — required when `hasBootstrap` is `true`.
- `registerRedboxConfig()` — required when `hasConfig` is `true`.

If a capability is disabled, its matching export must be omitted.

## Development with Hook Kit

The `redbox-dev-tools` CLI simplifies hook development:

- Use `init` to scaffold a new project.
- Use generators to add components (controllers, services, etc.).

## Persistence extensions

Use ReDBox repository/service interfaces and declared Prisma contract fields. Model registration, decorators, globals and generated model shims are removed. Remove `hasModels` and `registerRedboxModels`; stale registrations block startup. Port callbacks to services and qualify partial failures. See `support/wiki/Persistence-Migration.md`.

## Overriding Core Components

To override a core service or controller, register a component with the same name as the core one. It is recommended to extend the core class in your implementation.
