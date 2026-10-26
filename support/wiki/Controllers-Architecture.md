# HTTP handlers and routes

V6 runs one Express 5 host. The application composes route groups from
`packages/redbox-core/src/http/express/`; there are no generated controller shims,
controller singleton registries or framework request/response globals.

A route group receives a concrete input containing only its selected domain
operations, policy implementations and request-scoped authentication context.
Transport code validates parameters, invokes the domain and serializes the result.
Domains own authorization-sensitive record operations and persistence lifetimes.
Do not recover missing dependencies through a process global.

## Core routes

API declarations in `src/api-routes/groups/` describe method, path, validation,
response and policy contracts. `http/express/apiManifest.ts` reconciles the owned
route groups. Browser routes and assets are mounted explicitly by the portal HTTP
composition. Use Express `req.params`, `req.query`, `req.body`, `res.status()` and
`res.json()`; do not depend on virtual socket requests or framework response helpers.
`responses.ts` preserves the supported API version negotiation and error envelopes.

`createHttpPolicies()` binds branding, authenticated actor, membership and access
policies. Unbound policies fail composition. Route metadata and input validation
do not grant record access. Mutations bind the session-aware CSRF middleware;
Companion shared secrets never substitute for an authenticated actor.

## Extensions

Return named `handlers` and `routes` from `registerRedboxExtension()` using the
public `RedboxExtension` contract. A handler factory declares its prerequisites
and receives the application's concrete selected dependencies. A route declares
its HTTP method, path, handler name and explicit `access` policy list, or `public`.
Duplicate registrations need intentional `replaces: true`; unknown policy and
handler names are errors. The host owns listening, activation, draining and signals.

The sole `redbox-dev-tools init` scaffold is v6. The service/controller generators
produce ordinary exported classes. Controller generation writes named route
declarations to `src/config/extensionRoutes.ts`; include them in the extension's
`routes` and supply each matching handler factory and named access policy.
Generated declarations are deliberately not a runtime discovery mechanism.

See [extension conversion](../specs/sails-retirement/hook-migration-v6.md),
[services](Services-Architecture.md), [loading](Redbox-Loader.md), and
[all intentional client behavior changes](V6-Client-Compatibility.md). Generate
and validate the [REST reference](Generated-Reference-Documentation.md) after
changing a public route contract.
