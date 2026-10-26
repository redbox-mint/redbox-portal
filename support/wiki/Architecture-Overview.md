# Architecture Overview

ReDBox v6 uses a ReDBox-owned application runtime and Express 5 HTTP host on
Node 26. Angular applications remain embedded in EJS pages. Prisma repositories
provide MongoDB persistence; owned native pools serve GridFS, sessions and Agenda.
Published package names such as `sails-ng-common` and the storage/PDF hooks are
historical names and do not imply a framework dependency.

## Application composition

`app.express.cjs` loads the selected deployment modules, discovers installed v6
extension declarations, resolves precedence and binds concrete factories before
acquiring resources. `createPortalApplication` composes the actual domains;
`createPortalHost` adds one HTTP listener and a process signal boundary.

Initialization validates configuration and capabilities, prepares selected
repositories, runs named ledger migrations and awaited bootstrap, and then
activates workers and ingress. Failed initialization never activates ordinary
work. Health and readiness are separate endpoints: `/healthz` and `/readyz`.

Shutdown quiesces producers, drains admitted requests/jobs/sessions/streams and
closes resources in dependency order. A deadline failure retains ownership for
retry; a closed socket alone does not prove work has drained. Companion has a
separate, documented process-lifetime limitation in [v6 client changes](V6-Client-Compatibility.md).

## Source layout

| Path | Responsibility |
|---|---|
| `packages/redbox-core/src/application/` | Owned application lifecycle and production composition |
| `packages/redbox-core/src/http/express/` | Transport, identity, policy, CSRF, uploads, rendering and sockets |
| `packages/redbox-core/src/extensions/` | Offline declarations, async loading and deterministic resolution |
| `packages/redbox-core/src/configuration/` | Explicit, validated deployment configuration |
| `packages/redbox-core/src/persistence/` | Repository contracts, clients, native resources and draining |
| `packages/redbox-core/src/records/`, `forms/`, `identity/`, `integrations/` | Explicitly constructed business domains |
| `api/migrations/` | Retained application-owned migration history; core conversions are bound in application composition |
| `config/env/` | Retained legacy deployment inputs for deliberate conversion, never implicit discovery |
| `angular/`, `assets/`, `views/` | Embedded Angular projects, static assets and EJS pages |
| `test/`, `support/integration-testing/` | Existing regression suites and real-service qualification |

## Request flow

1. Express resolves the root context, session and authenticated actor.
2. Selected policies resolve brand/portal, membership, object grants and CSRF.
3. Typed route adapters validate input and invoke explicitly supplied domains.
4. Domains use owned repositories/providers; transport errors expose safe envelopes.
5. Admitted asynchronous work remains owned through disconnect and shutdown.

HTTP paths/envelopes remain compatible where specified. Review every intentional
[v6 client change](V6-Client-Compatibility.md) before upgrading an integration.

## Extensions and builds

Extensions export `registerRedboxExtension()` returning `apiVersion: 1`. Factories
receive concrete inputs from the selected application; declarations never acquire
resources. See [Services Architecture](Services-Architecture.md),
[extension loading](Redbox-Loader.md) and [core package](Redbox-Core-Types.md).

Core builds clean `dist`, generate/verify Prisma contracts and compile TypeScript.
Webpack packages browser assets; Docker assembles production dependencies and
page artifacts. Install/build never generates service/controller/config shims.
See [Development](Development-Guide.md) and [Testing](ReDBox-Automated-Tests.md).
