# Customising ReDBox with a v6 extension

This page retains its historical URL. V6 loads versioned extension declarations;
installable framework hooks and their `sails` manifest flags are retired.
Published packages with historical names, including `sails-ng-common` and the
bundled PDF/storage packages, keep those names and expose neutral entrypoints.

Generate the supported scaffold with `redbox-dev-tools init institution-name`.
`--template v6` is equivalent. The former `standard` template is rejected.
The package declares `redbox.extension` and exports
`registerRedboxExtension(): RedboxExtension` with `apiVersion: 1`.

Registration is safe to inspect offline: return data and named factories, with
explicit prerequisites and replacements. Acquire native resources in awaited
`initialize()`, admit ordinary work at `activate()`, stop admission at `quiesce()`,
await accepted work at `drain()` and close owned resources at `close()`. The
application binds selected concrete inputs and owns its one server and signals.
Do not open resources, run migrations or write bootstrap data while registering.

Convert global service/configuration/model lookups into explicit factory inputs.
Convert legacy expression strings to registered operation names. Keep migration
names stable and register awaited migration/bootstrap work separately. V6 does
not interpret arbitrary service expressions or mount old controller classes.

Use package-relative `views` and `assets` directories included in the published
artifact. EJS receives the request-scoped `page` object; use `page.root`,
`page.base`, `page.t()` and the supplied nonce. Forms and workflows are ordinary
extension declarations, resolved in documented precedence order.

Follow the [complete conversion guide](../specs/sails-retirement/hook-migration-v6.md),
[extension contract](../specs/sails-retirement/extensions-v6.md),
[configuration guide](Configuration-Guide.md) and [loading guide](Redbox-Loader.md).
Operators and client developers must review the
[v6 behavior changes](V6-Client-Compatibility.md) before upgrading.
