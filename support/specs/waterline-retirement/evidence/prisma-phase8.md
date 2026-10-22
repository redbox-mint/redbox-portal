# Prisma phase 8 — Waterline retirement

2026-10-22. ADR 0004 step 4 implemented on `t3/waterline-retirement`, starting
at `3f5909129`. All twelve groups C/M/R/Q/J1–J4/V/B/S/U use Prisma exclusively.
This is the agreed light implementation verification; ADR step 5 review, fuller
qualification and release acceptance remain separate. No push or PR.

## Removal and upgrade contract

Removed every rollback adapter/selector branch, loaded-definition preflight,
inline record-revision maintenance rollback, core `waterline-models`, storage
models, model decorators/globals/types, model registration/generation/shims and
dev-tool model examples. Removed `config/models.js`, model/migrate defaults and
ORM datastore adapter configuration. Sails keeps services, controllers, policies,
config and hooks, with `hooks.orm=false` and `globals.models=false`.

Root/core remove `sails-hook-orm`, `sails-mongo`, `rttc`, adapter-specific overrides
and their now-unreachable transitive dependencies, including `waterline` and its
utilities. Application validators use the shared scalar codecs, with no `rttc`
imports. Sails still requires its generic transitive `rttc` for action input
validation; retaining Sails requires that utility, independently of Waterline. Six lockfiles were regenerated with Node 24.16.0 / npm 11.20.0;
changes are removals and local package metadata, without unrelated upgrades.
Exact Prisma CLI `8.0.0-rc.24` and runtime `8.0.0-rc.19` remain pinned. Storage
and dev-tools builds now clear dist so removed compiled models/generators cannot
survive rebuilds. Transition-only tests/fixtures/runners, CI jobs and executable
comparison spikes are deleted; historical reports stay in Git/the spec evidence.

Every explicit `persistence` setting and `RBPORTAL_*_BACKEND`/Sails persistence
environment override fails, including `prisma`, `mongodb`, `waterline` and empty
values. Compose passes stale selector variables through without creating empty
defaults. Retired model/ORM options, enabled model globals/ORM hooks, and retired
adapter/schema/migrate options on **any** datastore are refused without exposing
credentials. Existing URL/split connection keys and driver option policy remain.

Institution `hasModels:true`/`registerRedboxModels` registrations fail before lift,
including cached production starts. Exact complete loader-generated model/config
shim source is removable provenance; edited/custom files are preserved and
startup names their path. Port behavior to services/repositories and declare
extension fields in Prisma; there is no replacement model/query emulator.
See [institution guidance](../../../wiki/Persistence-Migration.md).

**SIEM decision:** both `securityevent` and `siemdeliveryattempt` use
`datastores.mongodb`. Split model datastores remain unsupported; old model config
or registrations fail with explicit instructions to migrate both collections.
No mapping is silently adopted or ignored.

## Final native owners and raw audit

F-PG-01 now records final app-owned transport. Equal effective connection policies
share pools; distinct policies stay separate. Lifecycle closes resources, then
borrowed Prisma clients, then transport, retaining failed cleanup for retry.

| Owner | App runtime source / registration | Supported API gap |
| --- | --- | --- |
| Modern GridFS | `mongoDatabase` or `mongoResourceDatabase`; `gridfs` stream/cleanup drain | Permanent ADR exception for GridFS bytes/chunks/streams. |
| Legacy storage GridFS | Runtime storage Db; `storage-gridfs` drain | Same permanent byte protocol. |
| Legacy branding logos | Runtime mongodb Db; `legacy-logo-gridfs` | Same GridFS stream protocol. |
| Agenda | Runtime mongodb Db or explicit address through `mongoResourceDatabase`; `agenda` | Third-party MongoBackend requires native Db and opaque scheduling BSON; claim fencing/history/indexes remain SDK protocol, not domain CRUD. |
| Session store | `mongoSessionDatabase`; `sessions` plus request drain | connect-mongo requires a native client. Close-only proxy prevents closing borrowed transport; timers/callbacks drain first. |
| Version checks | Runtime Db, tracked persistence operations | RC19 has no binary-version/arbitrary-command API. |
| Prisma | One client per logical schema borrowing runtime pools | Native SDK owners need a real Db/client, which URL-owned Prisma clients do not expose. |

[Rewrite register](../postgres-rewrite-register.md) lists each retained call and
PostgreSQL replacement, including Agenda's SDK BSON/history rationale. Prisma raw
use is limited to registered stored-query translation and duplicate audits;
catalog/index DDL uses supported Prisma control APIs. The direct-driver index
fallback and unused native record/Figshare pipeline remnants are removed. Domain
CRUD uses model APIs or previously registered typed operations. GridFS remains
MongoDB-backed in a future PostgreSQL deployment unless the byte store changes.

The phase-7 file/line checklist was followed and the whole repository searched
for `waterline`, `sails-hook-orm`, `sails-mongo`, `sails.models`, `.getDatastore(`,
`Model.`, globals, model imports and `toWaterlineModelDef`. Runtime, rebuilt dist,
Prisma contracts, migrations, tests, manifests/locks, templates, CI, Compose and
operator/wiki docs have **no executable ORM import/access/call**. A supplementary
TypeScript AST pass over **1800 source/test/tool files** also reports zero findings,
accounting for locally declared fixtures rather than mistaking them for globals. Remaining
matches are safe upgrade refusal/provenance strings and their tests, comments
explaining retained physical/validation compatibility, and historical reports.
The old shim source is compared as text and is never executed. No ORM model
compatibility implementation remains. Current operator docs no longer instruct
model registration, selector switching or ORM setup.

## Verification

ARM64 / two CPUs; one heavy command at a time, external `timeout`. All database
containers used only `mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`.
Node **24.16.0**, npm **11.20.0**. Defaults had no backend overrides. Local logs
are under `.tmp/wrpz8/`; the official index CLI reports `ready:true`, **99 entries**,
all `backend:prisma`. Final logs: `core-no-utility.log`, `storage-complete.log`,
`mocha.log`, `bruno.log`, `dev-final.log`, `lint-no-utility.log` and
`orm-ast-final.json` (install/build/typecheck/dependency logs are alongside them).

| Command / scope | Result |
| --- | --- |
| `timeout … npm ci` in root, core, storage, dev-tools, dev hook and PDF hook | Six clean installs passed. PDF uses `PUPPETEER_SKIP_DOWNLOAD=true`; no browser run. |
| `timeout … npm --prefix … run build` for core/storage/dev-tools/dev hook; PDF `run compile`; root `tsc` | All passed; final core/storage/dev-tools builds clear stale output. |
| `timeout 300s npm --prefix packages/redbox-core test -- --exit` | **4267 passing, 83 pending, 0 failing**. Optional live cases remain opt-in; the durable persistence suite below runs live separately. |
| `PERSISTENCE_TEST_MONGO_URL=… timeout 180s npm --prefix packages/redbox-core run test:persistence` | **14 passing**: raw BSON/absence, all groups, credential projection, Counter concurrency, leases/CAS, duplicate-index refusal, shared sessions and stale handles. |
| `MONGO_TEST_URL=… MONGO_CONCURRENCY_TEST_URL=… timeout 180s npm --prefix packages/sails-hook-redbox-storage-mongo test -- --exit` | **302 passing, 0 pending, 0 failing**, including live database suites. |
| Standard portal bootstrap + `test/integration/**/*.test.ts`, via isolated mount Compose | **418 passing, 10 pending, 0 failing**. Pending: external DOI/DataCite/RVA integrations and one unmigrated legacy form. |
| Bruno General folders 1–4, `bru run --disable-cookies --env int-test --sandbox developer` | **309/309 requests, 553/553 tests, 3/3 assertions**, PASS. |
| Fresh actual development Compose stack, HTTP login check | `/default/rdmp/user/login` **HTTP 200**, login HTML present; clean shutdown. |
| `npm --prefix packages/redbox-core run typecheck:persistence`; `run check:prisma`; root `npm run lint`; `git diff --check` | PASS; lint **0 warnings / 0 errors**. |
| `npm --prefix <tree> ls --all waterline sails-hook-orm sails-mongo` in the six trees above | All **`(empty)`**, expected exit 1 for no matched packages; no dependency errors. |

Early failures were corrected before recording the passing results: test fixtures
still installed removed globals or expected legacy query/default/null behavior;
portal report setup needed its composite key; the Bruno CLI dependency symlink
was not valid inside its mount. A selected-file core invocation inherited the
configured full-suite glob and changed global-fixture order; the final core run
uses the standard default command. PDF's initial browser download failed and was
disabled for its non-browser build. A later core repeat hit the existing 12-second startup-import subprocess deadline;
the unchanged test passed separately in 9.2 seconds, and the standard suite then passed all 4267 tests. No timeout/budget was relaxed. No product failure is hidden by a test skip.

## Commits, cleanup and later work

Local implementation commits: `ccd83e10b` consumers, `435fec460` adapters/selectors,
`9109ad6a6` models/loader, `a0246cde5` dependencies, `6d96391d9` final native
ownership/refusal, `101bb4ed1` clean compiled outputs, `f02ce6888` durable package
tests, `6d758ef10` portal fixtures and `ce17646da` historical executable tooling.
`2a6fa0b88` updates dev-tools guidance. A final codec/audit cleanup removes the
last two application `rttc` imports and a fake loaded-model migration surface
(`39909d279`).
The following documentation commit completes guidance and evidence;
the branch log gives their exact hashes.

All owned Docker resources use `wrpz8` and are removed at completion, including
standalone live-test Mongo and anonymous volumes. Unrelated `development-*`
containers are untouched. `.tmp/wrp8/prior-0ea5e9bc2.tar` remains **723557888 bytes**.

Fuller qualification/final review should focus on actual institution hooks and
old-volume/pending-migration upgrades; final packaged/image contents; borrowed
pool drain and retry behavior under connection/shutdown failures; Agenda's native
SDK protocol exception; SIEM collection relocation where old split config exists;
and whole-branch browser/budget/backup/prior-artifact recovery. No transaction,
stronger multi-document consistency or official release acceptance is claimed.
