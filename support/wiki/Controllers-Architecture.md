# HTTP controllers and routes

API2 uses Fastify request/reply types and explicit controller classes with named
actions. Import authoring contracts from `@researchdatabox/redbox-core/http` and
`RedboxExtensionV2` from `@researchdatabox/redbox-core/extensions`.

Each controller is constructed once per application with concrete borrowed inputs.
Constructors wire dependencies; application modules acquire and close resources.
Keep actor, brand, portal and validated input local to each request. The public
`requestContext(request)` accessor supplies an immutable snapshot after the route's
brand resolution stage and throws if that stage has not run.

## Declaring an action

Use `defineController({ name, actions, create })` to check the action allowlist,
and supply its concrete input through `bindControllerFactory(factory, input)` in
the application's `http.bindings` callback. A class method becomes reachable only
when an explicit route targets that controller/action. Missing bindings, unknown
policies and unlisted actions fail composition before listening.

Actions accept `FastifyRequest` and `FastifyReply` via the public HTTP authoring
contracts. Read live request values after hooks, call domain operations and send
the declared response. For guarded core JSON actions, check serialization inside
the action's error guard so a serialization fault reaches its safe error boundary.
Preserve typed authorization, validation and not-found responses. Domains retain
object authorization.

API declarations in `src/api-routes/groups/` supply executable validation, response
metadata and method/path/target information. Native bindings derive from those
sources. Response schemas document the contract; they do not strip fields. Browser
controllers and assets join the explicit registration inventory.

## Extension routes and replacements

Return `apiVersion: 2`, `controllers` and `routes` from `registerRedboxExtension()`.
Every route declares a stable name, method, path, controller, action and complete
`access`: `{ kind: 'public' }`, `{ kind: 'deny' }`, or a nonempty ordered
`{ kind: 'policies', names: [...] }`. Mutations retain CSRF and canonical-origin
guards. An empty policy list cannot make a route public.

A controller replacement uses the owned name and `replaces: true`, preserves the
action allowlist, and leaves route security and validation unchanged. Changing
access requires a separate complete route replacement. API2 hooks have explicit
scope and order. `beforeAction` runs after access and CSRF checks and before
request validation. Response and error observers receive detached snapshots.
Named fallbacks dispatch only within their eligible unmatched namespace outside
reserved core paths.

Use the [API1 to API2 migration guide](../specs/fastify-migration/extension-api2.md)
for the compile-checked example, generated application bindings, bundled hooks and
WSU worked example. See [hook ordering](../specs/fastify-migration/hooks.md),
[services](Services-Architecture.md), [loading](Redbox-Loader.md), and
[generated references](Generated-Reference-Documentation.md).

The production bootstrap binds these contracts on the Fastify listener started
by `app.js`. [G7 evidence](../specs/fastify-migration/evidence/FM-048.md) records
route, policy and installed-consumer qualification.
