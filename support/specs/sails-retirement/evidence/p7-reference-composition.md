# P7 production prerequisite: reference domains and migrations

## Shared historical typeface migration

The historical `20260904000000-branding-typeface-backfill` implementation now
lives in `branding/typefaceMigration.ts` and receives the existing branding
repository, history retention setting and log explicitly. The comparison API
migration resolves those inputs and delegates to the same implementation. The
standalone reference plan binds that function directly; no Sails context is needed.
The frozen editable-key allowlist, recovery snapshot, conditional backfill,
concurrent convergence and retention behavior are retained. Detection of duplicate
errors retains plain error objects' string `message` as well as their `code`.

With the absolute Node **26.11.1** toolchain bin on PATH, from
`packages/redbox-core`:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/migrations/BrandingTypefaceBackfill.test.ts \
  test/migrations/AdminSidebarTextColor.test.ts
```

Existing unchanged suites: **26 passing / 0 failing / 0 pending**, exit **0**.
Log: `.tmp/sails-retirement/p7/portal-branding-migration-node26-existing.log`
(records `v26.11.1` before the invocation). Core TypeScript emission also passed,
log `portal-schema-build-final.log`. An earlier invocation used shell-default
Node 24 and is not Node-26 evidence. No existing test/assertion changed and no
dependency changed. This is migration algorithm regression, not a full portal
upgrade/recovery result. Production composition qualification is recorded below
when executed.
