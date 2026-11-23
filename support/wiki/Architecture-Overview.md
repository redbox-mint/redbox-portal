# Architecture Overview

ReDBox v6 uses a ReDBox-owned application runtime and Fastify HTTP composition on
Node 26.12.1. The source and production image both start with `node app.js`.
Angular applications remain embedded in EJS pages. Prisma repositories
provide MongoDB persistence; owned native pools serve GridFS, sessions and Agenda.
Published package names such as `sails-ng-common` and the storage/PDF hooks are
historical names and do not imply a framework dependency.

## Application composition

`createPortalFastifyApplication` loads the selected deployment modules, resolves
installed API2 declarations and binds concrete factories before acquiring
resources. `createPortalFastifyHost` serves the resulting application through
one HTTP/1.1 listener. The executable owns process signals.

Initialization validates configuration and capabilities, prepares selected
repositories, runs named ledger migrations and awaited bootstrap, and then
prepares the listener and activates modules before opening ordinary ingress.
See [startup and probes](Installation-Guide.md#startup-probes-and-shutdown).

Shutdown quiesces producers, drains admitted requests/jobs/sessions/streams and
closes resources in dependency order. A deadline failure retains ownership for
retry. The optional Companion adapter shares the same listener and has
[process-lifetime restrictions](TUS-and-Uppy-Companion-Setup.md#lifecycle-and-verification).

## Source layout

| Path | Responsibility |
|---|---|
| `packages/redbox-core/src/application/` | Owned application lifecycle and production composition |
| `packages/redbox-core/src/http/fastify/` and `http/controllers/` | Transport, identity, policy, CSRF, uploads, rendering and sockets |
| `packages/redbox-core/src/extensions/` | Offline declarations, async loading and deterministic resolution |
| `packages/redbox-core/src/configuration/` | Explicit, validated deployment configuration |
| `packages/redbox-core/src/persistence/` | Repository contracts, clients, native resources and draining |
| `packages/redbox-core/src/records/`, `forms/`, `identity/`, `integrations/` | Explicitly constructed business domains |
| `api/migrations/` | Retained application-owned migration history; core conversions are bound in application composition |
| `config/env/` | Retained legacy deployment inputs for deliberate conversion, never implicit discovery |
| `angular/`, `assets/`, `views/` | Embedded Angular projects, static assets and EJS pages |
| `test/`, `support/integration-testing/` | Existing regression suites and real-service qualification |

## Request flow

1. The host checks admission and matches an explicit route.
2. Route policies establish the session, actor and brand/portal context and
   enforce the declared access and CSRF requirements.
3. In-scope hooks run at their declared stages. The controller uses live request
   values for validation and invokes its explicitly supplied operations.
4. Domains enforce object authorization and use owned repositories and providers.
5. Admitted asynchronous work remains owned through disconnect and shutdown.

HTTP paths/envelopes remain compatible where specified. Review every intentional
[v6 client change](V6-Client-Compatibility.md) before upgrading an integration.

## Extensions and builds

Extensions export `registerRedboxExtension()` returning `apiVersion: 2`. Factories
receive concrete inputs from the selected application; declarations never acquire
resources. See the [API2 migration guide](../specs/fastify-migration/extension-api2.md),
[Controllers](Controllers-Architecture.md), [Services](Services-Architecture.md),
[extension loading](Redbox-Loader.md) and [core package](Redbox-Core-Types.md).

Core builds clean `dist`, generate/verify Prisma contracts and compile TypeScript.
Webpack packages browser assets; Docker assembles production dependencies and
page artifacts. Install/build never generates service/controller/config shims.
See [Development](Development-Guide.md) and [Testing](ReDBox-Automated-Tests.md).

The qualified runtime and deployment profiles are recorded in [G7 evidence](../specs/fastify-migration/evidence/FM-048.md).
