# Skill: Redbox Controllers

## Context
ReDBox controllers live in `@researchdatabox/redbox-core-types` and are surfaced to Sails.js through generated shims.

## Locations
- API controllers: `packages/redbox-core-types/src/controllers/`
- Webservice controllers: `packages/redbox-core-types/src/controllers/webservice/`

## Patterns
- Extend `Controllers.Core.Controller`.
- Implement `init()` for sails-dependent setup (avoid using `sails` in constructors).
- Use `_exportedMethods` to define which methods are exposed.
- Actions are usually `async index(req, res)`.
- **Response Handling:** Use `this.sendResp(data, req, res)` instead of direct `res.json()` or `res.send()`. This ensures consistent response formatting.

## Generating Controllers
Use the `redbox-hook-kit` CLI generator `generate_controller`:
- `name`: Controller name (e.g., `MyRecord`) as an argument.
- `--actions <list>`: Comma-separated actions (e.g., `index,get,save`).
- `--webservice`: If it's a webservice controller.
- `--routes <routes>`: Action-to-route mappings: `action:verb:path[:role1:role2],...` (e.g., `list:get:/api/items:Admin:Researcher`).
- `--auth <roles>`: Default roles for auth rules (can be overridden per-route).

## Adding Methods
Use `redbox-hook-kit generate method` to add actions to an existing controller:
- `--file <path>`: Path to the controller file.
- `--method <name>`: Method name.
- `--route <route>`: Route path (e.g., `/api/new-path`).
- `--http <verb>`: HTTP verb (GET, POST, etc.).
- `--auth <roles>`: Auth roles.

## Index Updates
When adding a controller, you must update `packages/redbox-core-types/src/controllers/index.ts`:
- Import the controller module.
- Add to `ControllerExports` (or `WebserviceControllerExports`) with a lazy getter.
- Add to `ControllerNames` (or `WebserviceControllerNames`) array.

## Route Configuration
Routes are defined in `packages/redbox-core-types/src/config/routes.config.ts`.
Pattern: `'get /api/my-path': { controller: 'MyController', action: 'index' }`

## Auth Rules
Auth rules are defined in `packages/redbox-core-types/src/config/auth.config.ts`.
Pattern: `{ path: '/api/my-path', role: 'admin', can_read: true }`
