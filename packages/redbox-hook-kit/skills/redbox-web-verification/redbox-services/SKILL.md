# Skill: Redbox Services

## Context
ReDBox business logic is encapsulated in TypeScript services in `@researchdatabox/redbox-core-types`.

## Locations
- Services: `packages/redbox-core-types/src/services/`
- Index: `packages/redbox-core-types/src/services/index.ts`

## Patterns
- Extend `Services.Core.Service`.
- Implement `bootstrap()` for initialization.
- Use `_exportedMethods` to define exposed methods.
- Often use RxJS Observables for async operations.
- Access Waterline models via globals (e.g., `declare var Record: Model;`).

## Generating Services
Use the `redbox-hook-kit` CLI generator `generate_service`:
- `name`: Service name (e.g., `Records`) as an argument.
- `--methods <list>`: Comma-separated initial methods.

## Adding Methods
Use `redbox-hook-kit generate method` to add methods to an existing service:
- `--file <path>`: Path to the service file.
- `--method <name>`: Method name.

## Index Updates
When adding a service, update `packages/redbox-core-types/src/services/index.ts`:
- Import the service module.
- Re-export the service.
- Add to `ServiceExports` with a lazy getter.

## Overriding Services in Hooks
Hooks can override core services by registering them in `registerRedboxServices`.
Override services should extend the core service they are replacing.
