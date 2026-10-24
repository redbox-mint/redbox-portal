# ReDBox core package

`@researchdatabox/redbox-core` supplies the v6 application runtime, Express
adapters, business domains, shared contracts, Prisma repositories and configuration
defaults. The directory is `packages/redbox-core`; the historical page title is
retained for existing links.

## Supported entrypoints

| Entrypoint | Purpose |
|---|---|
| `@researchdatabox/redbox-core/portal` | Production application/HTTP composition and selected maintenance |
| `/application` | Owned module lifecycle and migrations |
| `/extensions`, `/extensions/storage`, `/extensions/config` | Offline declarations, storage capabilities and config contributions |
| `/configuration` | Explicit deployment loading, validation and conversion |
| `/http/express` | Express host, typed adapters, policy and transport contracts |
| `/record-types`, `/forms`, `/translations`, `/dashboards`, `/workspaces` | Concrete domains with explicit inputs |
| `/queues`, `/maintenance` | Owned background work and inactive index operations |

The root entry re-exports shared contracts and pure domain types. Loader,
controllers, policies, response helpers and `compat/sails` comparison entrypoints
are retired. `Services` utility classes do not install or discover globals.
Use [generated references](Generated-Reference-Documentation.md) for classified
extension contracts and [Services Architecture](Services-Architecture.md) for
ownership and replacements.

## Build and use

```sh
npm --prefix packages/redbox-core run build
```

This cleans emitted output, regenerates Prisma contracts, checks the portal-domain
schema and compiles TypeScript. Dependents build after core completes. Reusing an
old `dist` can hide removed code; artifact qualification uses a clean committed
source and packed installation. Node 26.11.1/npm 11.20.0 are the qualified toolchain.
Use exact package pins and retain the lockfile.

Configuration is provided to the selected application; repositories and external
clients are acquired during awaited initialization. There is no generated shim
layer. See [Configuration](Configuration-Guide.md), [extension loading](Redbox-Loader.md)
and [v6 client changes](V6-Client-Compatibility.md).
