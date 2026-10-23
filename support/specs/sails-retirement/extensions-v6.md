# Implemented v6 extension declarations (P2)

Packages opt in with `"redbox": { "extension": "./extension" }` in their installed
manifest and expose that public subpath through `exports` (or use `"."` for the
main public entry). Export `registerRedboxExtension()` returning a fresh
`RedboxExtension` with `apiVersion: 1`. Native awaited import supports ESM named
exports, ESM default registration functions/objects and CommonJS exports. CommonJS
format compatibility requires converted v6 source; existing Sails hooks do not
become compatible merely by changing manifest metadata.

Import the narrow types from `@researchdatabox/redbox-core/extensions`.
Registration/imports are offline: no repositories, clients, writes, workers,
listeners or process handlers. Factories synchronously wire concrete dependencies;
awaited module initialization acquires resources. Inspection does not run work.

The contract declares startup config, module factories, HTTP handler factories,
routes, middleware at beforeRoutes/afterRoutes stages, server integrations,
migrations/bootstrap work, jobs, forms/workflows, contributor ownership and
package-relative view/asset roots. Domain factories implement `ApplicationModule`;
Express handler factories stay separate. Each concrete factory defines its own
input interface. A host composition binds only that factory's required operations
and startup slices; the declarations do not receive a service locator.

Resolve the complete set before creating instances. Core is lowest precedence;
`hookLoadPriority[0]` wins over later listed hooks and unlisted hooks. Unlisted
lookup is descending package name. Contributions process low to high, resources
search high to low. Names within one provider are unique. A higher-precedence
named replacement explicitly declares `replaces: true` and requires an existing
target. Missing module prerequisites and cycles fail offline. Migrations retain
lexical name order independently of extension priority; resolving does not run
them or replace the existing migration ledger. P3 owns orchestration and config
merge rules.

Routes identify a named handler factory and explicitly declare `access: 'public'`
or a nonempty ordered list of policy names. Named replacements retain or expressly
revise the route's contract and policies; accidental method/path collisions fail
before mounting, including collisions differing only in parameter names. The host
must bind policy execution; declaration metadata is not authorization. Middleware
and integrations participate in the host's admission and application cleanup.
Integrations attach to the host's single server, never call listen or add signal
handlers, and register ownership before preparation. This interface is a supported
contract, not a sandbox for arbitrary hook code.

P2 does not promote a production host, merge institution configuration, activate
queue backends, or implement public route/authentication/provider parity. Those
remain in P3–P6. Bundled packages temporarily retain their explicit legacy entry
alongside the neutral public extension subpath for the separate comparison host.
