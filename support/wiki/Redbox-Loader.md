# Extension loading

V6 discovers installed packages through their explicit `redbox.extension` manifest
entry and public package export. The entry exports `registerRedboxExtension()`;
API2 registration returns an offline `RedboxExtensionV2` declaration. Native
awaited import supports CommonJS, ESM and top-level await.

```ts
import type { RedboxExtensionV2 } from '@researchdatabox/redbox-core/extensions';
export function registerRedboxExtension(): RedboxExtensionV2 {
  return { apiVersion: 2, config: {}, modules: [] };
}
```

Use `loadInstalledExtensionProvidersV2` and `resolveExtensionsV2` through the public
extensions entrypoint or the production `createPortalFastifyApplication` bootstrap.
API1 is rejected even for data-only hooks, with the package name, offending fields
and a link to the [migration guide](../specs/fastify-migration/extension-api2.md).
Import and registration must not open clients, listen, run work or acquire resources.

Declarations select module/controller factories, explicit routes, named scoped
hooks, fallbacks, migrations/bootstrap work, jobs, configuration, forms/workflows,
contributors and package-relative views/assets. The application supplies concrete
factory inputs; initialization acquires resources. There is no global service
lookup, generated shim registration or directory scan for callable actions.

Core has lowest precedence. `hookLoadPriority[0]` has highest precedence; unlisted
providers have deterministic package order. A replacement needs an existing owned
name and `replaces: true`. Resolve dependencies, scopes, collisions and cycles
before acquisition. Views/assets search highest precedence first. Only selected
factories construct instances. The application owns migrations, activation,
quiesce, drain and close.

The old Sails loader and API1 handler/middleware composition are legacy. Remove
generated model/controller/service shims when converting; do not recreate them.
Use the [v6 generator](Redbox-Hook-Kit.md), [controllers](Controllers-Architecture.md)
and [services](Services-Architecture.md) for supported application wiring.
