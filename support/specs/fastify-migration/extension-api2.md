# Extension API2 loading and replacement

FM-017 adds the API2 loading/composition path for the Fastify migration. The
production Express entrypoint continues to load API1 until cutover. API1 is rejected
by `loadInstalledExtensionProvidersV2` and `resolveExtensionsV2`, including declarations
containing only non-HTTP data. Trusted entrypoints and async registration must be
offline: importing packages and reading declarations must not acquire application
resources. The loader is not a JavaScript sandbox; it never runs factories or work.

Import `RedboxExtensionV2`, `loadInstalledExtensionProvidersV2` and
`resolveExtensionsV2` from `@researchdatabox/redbox-core/extensions`. Import
`defineController` and `bindControllerFactory` from `@researchdatabox/redbox-core/http`.

```ts
const greeting = defineController({
  name: 'GreetingController',
  actions: ['greet'],
  create: (input: GreetingInput) => new GreetingController(input),
});

export function registerRedboxExtension(): RedboxExtensionV2 {
  return {
    apiVersion: 2,
    controllers: [greeting],
    routes: [
      {
        name: 'example-greeting',
        method: 'get',
        path: '/greeting',
        controller: greeting.name,
        action: 'greet',
        access: { kind: 'public' },
      },
    ],
  };
}
```

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

Replace API1 `middleware` with scoped named hooks/fallbacks under FM-018; these
collections are not yet accepted by FM-017. `afterRoutes` is not response observation.
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

Bundled development, PDF and Mongo storage hooks still return API1. FM-038 must
update their public declaration type/version and rebuild/qualify them. Their current
declarations contribute no HTTP handlers/routes/middleware/integrations, so no HTTP
conversion is needed at this revision. They remain unchanged for Express production.
