---
name: 'Redbox Hook Development'
description: 'Create and migrate ReDBox v6 extension packages with explicit declarations and lifecycle ownership.'
---

# ReDBox v6 extensions

Read `support/wiki/Using-a-Sails-Hook-to-customise-ReDBox.md` (historical page name)
and `support/specs/sails-retirement/extensions-v6.md` for the implemented protocol.
Use `redbox-dev-tools init` with the sole v6 scaffold. Export the extension under
`package.json` `redbox.extension` and a public `registerRedboxExtension` function.
Declare configuration, modules, routes, jobs and migrations explicitly; select
factories and named operations at composition. Keep import/registration offline.

Use explicit initialization, activation, quiesce, drain and close. Qualify a clean
packed package and generated application, native resource cleanup and admitted
work during stop. Record every dependency change with an exact version and reason.
See `support/wiki/Persistence-Migration.md` and the v6 upgrade/recovery runbook
for persisted declarations, byte stores and institution cutover.
