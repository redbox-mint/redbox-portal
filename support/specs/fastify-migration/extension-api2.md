# Migrating hooks from API1 / Express to API2 / Fastify

API2 is the supported v6 extension authoring contract. `node app.js` starts
the Fastify composition, with generated, bundled, packed and local WSU
consumer qualification recorded for the release candidate. The institution
production acceptance gate remains pending. [G7 evidence](evidence/FM-048.md)

API1 is rejected by `loadInstalledExtensionProvidersV2` and `resolveExtensionsV2`,
including data-only declarations. The refusal identifies the package and HTTP
fields and links here. Regenerate with the FM-037 CLI or convert each contribution
using the table below. Importing or inspecting declarations must not acquire
resources; factories wire borrowed operations and application lifecycle owns work.

| API1 / Express contribution | API2 / Fastify conversion |
| --- | --- |
| `RedboxExtension`, `apiVersion: 1` | `RedboxExtensionV2`, `apiVersion: 2`, including data-only packages |
| `handlers`, `RequestHandler`, `req`/`res` callbacks | `defineController`, named typed actions, explicit concrete inputs |
| `routes[].handler`, string/array access | `controller`/`action`, stable name and complete `RouteAccess` |
| `res.status().json()` | `reply.code().type().send()`; serialize JSON within the guarded action |
| request-local controller fields | Live request values and immutable `requestContext(request)` |
| `beforeRoutes` middleware | Review actual behavior; use scoped `afterAuthentication` or `beforeAction` at the documented guard boundary |
| `afterRoutes` unmatched dispatch | Named `fallbacks`; never `onResponse` |
| response/error middleware | Detached `HttpObservationRequest` observations; safe errors and ignored return values |
| raw-server `integrations` | Qualified core integration owner; no extension server or Express bridge |

The complete example below is compiled against public package entrypoints by both
`docs:generate` and `docs:audit`. `docs:test` checks that this block matches its
fixture. Bind `example` with `bindExtensionFactory` through application `bindings`,
then use `bindHealthController` in `http.bindings`. The declared prerequisite orders
ownership; it does not look up or inject a constructor input automatically.

Import `RedboxExtensionV2`, `loadInstalledExtensionProvidersV2` and
`resolveExtensionsV2` from `@researchdatabox/redbox-core/extensions`. Import
`defineController` and `bindControllerFactory` from `@researchdatabox/redbox-core/http`.

<!-- api2-example:start -->
```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApplicationModule } from '@researchdatabox/redbox-core/application';
import type { RedboxExtensionV2 } from '@researchdatabox/redbox-core/extensions';
import { bindControllerFactory, defineController } from '@researchdatabox/redbox-core/http';

export class Example implements ApplicationModule {
  private ready = false;
  async initialize(): Promise<void> {
    this.ready = true;
  }
  async close(): Promise<void> {
    this.ready = false;
  }
  health(): boolean {
    return this.ready;
  }
}

export interface HealthInput {
  example: Pick<Example, 'health'>;
}
export class HealthController {
  constructor(private readonly input: HealthInput) {}
  async read(_request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    const result = { ready: this.input.example.health() };
    return reply.type('application/json; charset=utf-8').send(JSON.stringify(result));
  }
}
export const healthController = defineController({
  name: 'ExampleHealthController',
  requires: ['example'],
  actions: ['read'],
  create: (input: HealthInput) => new HealthController(input),
});
export function bindHealthController(example: HealthInput['example']) {
  return bindControllerFactory(healthController, { example });
}
export function registerRedboxExtension(): RedboxExtensionV2 {
  return {
    apiVersion: 2,
    modules: [{ name: 'example', create: () => new Example() }],
    controllers: [healthController],
    routes: [
      {
        name: 'example-health',
        method: 'get',
        path: '/example/health',
        controller: healthController.name,
        action: 'read',
        access: { kind: 'public' },
      },
    ],
  };
}
```
<!-- api2-example:end -->

Convert each API1 `handlers` factory to a controller factory with explicit actions
using Fastify request/reply methods. Replace `routes[].handler` with
`controller`/`action`, keeping the existing stable route name. Use explicit
`access: { kind: 'public' }`, `{ kind: 'policies', names: ['policyName'] }` or
`{ kind: 'deny' }`. An empty policy list cannot grant public access. Existing API
schemas remain referenced through `api`; the resolver normalizes and checks their
method/path/target/CSRF/policies. Application bindings supply concrete inputs through
`bindControllerFactory`; unknown/missing bindings fail before acquisition.

Subclass replacements use the original controller name and `replaces: true`, and
must preserve its action allowlist. Only the selected factory constructs an instance,
in the application's HTTP preparation stage. Controller replacement leaves the
route's URL, policies, executable validation source and CSRF unchanged. Validation
executes at the existing FM-016 action prelude position. To change route access or
validation, declare a complete route with the original stable name and
`replaces: true`. Missing targets and undeclared duplicates fail. Inspection retains
both the selected route and its `replaced` history, including the old/new policies,
CSRF and API validation source. No metadata is inferred from controller properties.

An unchanged-access replacement inherits the owned route's normalized HEAD policy,
effective policy chain, mount-selected CSRF adapter and executable validation. API
normalization preserves the author's stable name. Frozen GET/HEAD and ALL-method
reservations retain their original owner and security metadata. Omitting `api`
retains the existing API source when access is unchanged; explicitly setting
`api: undefined`, or changing access without supplying `api`, clears the inherited
validation source. A supplied API source must still agree with the route's access,
target and CSRF. An explicit CSRF value with changed access selects that value in
place of the inherited mount adapter. HEAD behavior is derived by core; authors
replace the frozen HEAD route separately to change its action.

Replace API1 `middleware` with [scoped named hooks and fallbacks](hooks.md).
API2 now accepts both collections with offline dependency/scope/replacement checks.
`afterRoutes` maps to unmatched dispatch when appropriate; it is not response observation.
Raw-server `integrations` are API1 HTTP contributions: move their ownership into a
qualified core integration, without exposing Fastify/server registration to an
extension. No Express middleware bridge is supplied.

Keep `modules` (including service factories), `config`, `forms`, `workflows`, `jobs`,
`configModels`, `contributors`, `migrations`, `bootstrap`, `views` and `assets`
unchanged. The common resolver retains module/work prerequisites, cycle rejection,
explicit replacements and package-relative path validation. Core is lowest priority;
the first `hookLoadPriority` entry is highest, with deterministic package ordering
for unlisted providers. Views/assets search highest first. CJS exports, ESM public
exports, top-level await and async registration remain supported.

## Worked example: bundled data-only hooks (FM-038)

The development, PDF and Mongo storage hooks return API2 through their public
extension entrypoints. They had no HTTP contributions: conversion changed their
version/type without inventing controllers. Configuration, forms/workflows,
storage module/migration and PDF module/job are preserved. The
[contribution inventory](evidence/FM-038.inventory.json) and
[public export audit](evidence/FM-038.exports.json) record their actual declarations.
Do the same for a data-only institution hook; retaining API1 is not supported.

HTTP route/fallback names share one offline target namespace with reserved core
owners; hook scopes resolve against it. `redbox.internal.*`, `portal.automatic-*`
and `core-native-http-*` are internal prefixes, forbidden in user route, fallback
and hook names and in scoped hook targets. See [hook semantics](hooks.md).

## Generator migration example (FM-037)

Run `redbox-dev-tools init demo --template v6` inside the extension directory.
The scaffold returns API2, with a public status GET and a protected greeting POST
(`csrf: true`). Non-HTTP module/work inputs remain explicit. To add a controller:

```sh
redbox-dev-tools --root . generate controller Catalogue --routes 'read:get:/:branding/:portal/catalogue:Admin'
redbox-dev-tools --root . generate method --file src/controllers/CatalogueController.ts --method publish --http POST --route '/:branding/:portal/catalogue/publish' --auth Admin
```

Generated `CatalogueInput` has named `read(request)` and `publish(request)`
operations. Supply them in `bindGeneratedControllers({ CatalogueController: {
read, publish } })` from the production application's `http.bindings` callback.
The scaffold already includes generated controllers/routes in registration.
The method generator updates the input interface, exposed actions and route,
including CSRF for mutations. `--public` explicitly selects public access;
omitting it selects ordered production authentication/brand/role policies.
Role rules are added to the scaffold's `auth.config.ts`. Callbacks read the live
Fastify request after hooks and allow typed failures to reach the safe host
boundary. Bind the example module and work through application `bindings`, and
borrow its greeting operation with `bindControllerFactory(exampleController,
{ example })`. Pass the resulting resolved application unchanged to
`createPortalFastifyHost`; the extension never registers a server itself.

API1 `RequestHandler`/`res.json` examples from the historical Sails-retirement
guide describe the preceding host. For API2 use `FastifyRequest`/`FastifyReply`,
`defineController`, explicit action allowlists and complete access declarations as
above. Generate JSON before calling `reply.send` so serialization errors remain
inside the action boundary. Source-linked generator qualification is FM-037;
clean packed-consumer qualification is FM-039.

## Worked example: WSU (FM-040)

The locally converted `redbox-hook-wsu` API2 source is branch `feature/v6-api2`
at `37b64b9` (local qualification, not published production acceptance). Its
`src/controllers.ts`, `src/routes.ts` and `src/deployment.ts` declare one controller,
five named actions/routes and concrete production bindings. The two regeneration
mutations retain API metadata, policy/actor checks and CSRF; verified bearer and
cookie/session requests keep their distinct admission rules. Public publication
files retain eligibility and path-containment checks. Explicit WSU/core route
precedence preserves overlapping URLs without depending on import order.

`createWsuPortal` uses public `createPortalFastifyApplication` and
`createPortalFastifyHost` composition, and binds domain operations after their
owners initialize. Progress, uploads, pages and persisted authentication-field
configuration remain selected. No Sails global or Express request/response shim is
required. See [FM-040 qualification](evidence/FM-040.md) for exact source/artifact
identities, the existing 565-case hook suite, installed route/restart/drain procedure
and separate pending institutional production acceptance. The legacy v5 checkout,
recovery source and archived agentvm passes are not converted-source evidence.

## Verification and deployment

Run builds serially with the repository's Node/npm versions, then `npm run doc:api`,
`npm run docs:generate`, `npm run docs:audit`, `npm run docs:check` and
`npm run docs:test`. The checked catalogue uses public API2 exports; the REST check
compares generated operations and metadata with executable API declarations and
their normalized controller bindings. Run `npm run test:packed:fastify` to prove a
clean generated consumer compiles, installs, starts, restarts and drains without
private core imports. Institution hooks also need their own full suite and an
installed production-composition rehearsal against current portal packages.

Do not replace the executable or deployment image merely by installing a hook.
Follow the [migration gates](implementation_plan.md#p7--cutover-candidate-and-final-qualification)
and [upgrade/recovery runbook](../sails-retirement/upgrade-recovery-v6.md). Preserve
canonical origins, explicit proxy trust, intentional session invalidation and
late-listen startup probes. Companion's private Express provider boundary is the
only supported exception; it requires process affinity and a fresh process after
full stop. No generic middleware bridge is supplied.
