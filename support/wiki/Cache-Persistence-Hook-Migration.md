# Cache hook migration

All persistence uses Prisma. See [persistence migration](Persistence-Migration.md) for the complete institution checklist, fixed collection mappings and startup errors.

Remove `hasModels`, `registerRedboxModels`, model decorators and model globals from hooks. Port CacheEntry callbacks into service operations and declare real extension fields in the Prisma contract. Use `getCacheEntryRepository()` after initialization; its JSON/string-ID contract exposes `findByName`, `create`, `updateByName` and `deleteById`. Declare selected module overrides through `registerRedboxExtension()` with `replaces: true` and bind concrete factory inputs; see [v6 extension registration](Redbox-Loader.md).

Remove every persistence selector, including explicit `prisma`, and the corresponding environment variables. Reconcile old shims explicitly with the [manifest-based retirement tool](Redbox-Loader.md#existing-generated-files). It preserves edited/custom files for manual conversion; startup never removes them automatically. Move custom code before deleting a shim.

Qualify raw BSON/timestamps, falsy JSON, duplicate names, expiry and partial failures. Missing optional reads may return null; patches must set only supplied fields. Startup inspects indexes and never repairs duplicates. Follow [index preparation](Persistence-Index-Preparation.md) with writers stopped.
