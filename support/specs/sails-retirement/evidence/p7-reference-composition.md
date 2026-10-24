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

## Actual reference plan on MongoDB and Solr

`application/portal/reference.ts` binds **18** existing concrete domains behind
selected named factories. It supplies their actual repositories, narrow ports,
application configuration/model registry and bundled forms. The fixed lifecycle
stages run the three real historical migrations, brand/role/administrator/path-rule
bootstrap, record types, workflows/forms, vocabulary, reports/queries, translations,
application settings and workspace/dashboard/schema readiness. No synthetic seed
records or startup index DDL are added to production code. Factory cleanup retains
the instance if cleanup fails, permits retry and forwards the absolute drain
deadline. Reports explicitly require search and typefaces require storage disks.

On Node **26.11.1**, Mongo **8.0.34** at the owned Docker server on `29511` and
Solr **10.0.0** (digest
`sha256:c2a983cd9a5759c3b802b7b47f48b5cfae2b34d63a9444d62730fdbdb1b5308b`):

```sh
node packages/redbox-core/node_modules/typescript/bin/tsc -p packages/redbox-core/tsconfig.json
SR_REFERENCE_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_reference \
SR_REFERENCE_SOLR_PORT=8983 node --test packages/redbox-core/test/qualification/portal-reference.cjs
```

The compiled aggregate passed **1 / 0 failing / 0 skipped**, exit **0**,
**15443.862301 ms** total. Results: **29** actual configured record types,
**31** persisted forms, **3** migrations. Three fresh instances each selected
the named branding override; the unselected core constructor ran **0** times.
Fresh bootstrap and restart retain brand/form identity and counts. A post-bootstrap
failure plus first-close failure leaves cleanup visible and the domain retained;
retry closes it and clears the handle. Prepared index definitions remain identical
before/after startup. The compiled graph contains no Sails/CoreBase/CoreService
or legacy service-barrel import. The disposable core/storage databases and local
disk directory are removed by the aggregate's finally block.

Log: `.tmp/sails-retirement/p7/reference-second.log`; build:
`reference-build.log`. Focused formatting/lint and diff checks pass. This new
qualification exercises the newly introduced wiring; no existing regression suite
or assertion was modified.

The first attempt failed **0/1** because the qualifier had not initialized core
storage repositories before constructing the actual Records collaborator. The
qualifier now initializes that existing group explicitly. Its initial Solr setup
also used an ineffective port setting/bridge mapping on this bridge-disabled test
daemon. The successful Solr run uses host networking on **8983**, with a 1024 MiB
limit and **65536** fd limit. No failed attempt counts as passing qualification.

Scope: this is reference composition, not the complete portal executable. The
qualification supplies real StorageManager, Mongo storage, Solr, Records,
AuthenticationAccounts and Agenda objects; it does not initialize/activate the
complete job registry or execute record writes. RVA imports are explicitly disabled
in this qualifier while local vocabulary bootstrap runs; external RVA behavior is
separately covered by the existing provider suites. Full selected provider/HTTP
assembly, all broad suites, clean artifacts and complete v6 cutover remain open.

## Persisted v5 record-hook conversion and explicit bindings (2026-10-24)

`recordTypes/migrateRecordHooks.ts` supplies the deliberate core ledger migration
`20261024T000000-v6-record-hook-operations`. It reads all persisted brands/types,
validates the complete declaration plan before its first write, converts only
known built-in expressions and explicit nested `options.hooks`, and preserves
templates/options/other row fields. Invalid shapes, execution policies, unknown
Sails expressions, modes or phases fail with the record-type ID and conversion
instructions, without echoing arbitrary expressions or options. Already named
institution operations retain their names; actual bindings remain a composition
responsibility. Missing JSON hooks decoded as null are absent. Partial body writes
are resumable through idempotent conversion; writers must remain stopped.

`application/portal/recordOperations.ts` binds concrete selected record/workflow/
email/DOI/RAiD/ONI/Figshare operations through lazy instance references. No path
evaluation, service locator or comparison fallback is used. Known Figshare aliases
convert to their existing equivalent validate/wake/cleanup operations, retaining
the final names recognized by source-intent preparation. The converter now checks
the runtime shape of persisted unknown JSON as well as typed bundled input.

Node **26.11.1**, Mongo **8.0.34**, qualified Node bin on PATH:

```sh
node packages/redbox-core/node_modules/typescript/bin/tsc -p packages/redbox-core/tsconfig.json
SR_RECORD_HOOK_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_record_hooks \
  node --test packages/redbox-core/test/qualification/{record-hook-names,persisted-record-hooks,workflow-triggers}.cjs
SR_REFERENCE_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_reference \
SR_REFERENCE_SOLR_PORT=8983 node --test packages/redbox-core/test/qualification/portal-reference.cjs
```

Build exits **0**. Hook aggregate **4 passing / 0 failing / 0 skipped**, exit **0**,
**5270.592084 ms** total: two real brands/four types, three converted rows, invalid
second-brand plan performs **0 writes**; interruption on write 2 leaves one
converted row; retry performs **2 writes** and the next run **0**. Stored converted
template hook executes through the selected registry and real RecordTriggers,
preserving record identity/content; legacy/unregistered/object-prototype names
are rejected. Seven malformed persisted shapes/policies are rejected. Standalone
graph is clean and disposable DB is removed. Reference composition recheck:
**1 passing / 0 failing / 0 skipped**, exit **0**, **10020.323418 ms**; **29 types /
31 forms / 4 migrations**, selected override constructed three times and default
zero, restart/failure-cleanup/index-invariance assertions retained.

Logs: `record-operations-build.log`, `record-operations-mongo.log`,
`record-hooks-reference.log`, `record-operations-lint.log` under the ignored P7
directory. Focused lint **0 warnings / 0 errors**; format/diff checks pass. No
dependencies or existing regression tests changed. The new reference qualifier's
expected ledger count changes **3→4** solely to assert the added real migration;
no check is removed or weakened. Full v5 fixture/portal cutover is still open.
