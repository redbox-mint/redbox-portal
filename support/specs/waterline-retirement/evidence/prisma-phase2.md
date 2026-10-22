# Prisma phase 2 — M, R and Q

2026-10-22; base `01cfa9fb1`, ARM64 / 2 CPUs / 12 GiB. Node 24.16.0,
npm 11.20.0; pins remain Prisma 8.0.0-rc.24 / orm-mongo 8.0.0-rc.19.
Sequential commands use external timeouts. Only disposable `wrpz2-*` resources;
MongoDB exclusively 9.0.4 at the ADR's pinned digest. No transactions, prior
images, budget campaigns, browser runs or mixed-instance matrices.

M uses model CRUD; projected names/history read avoids optional-field decoding.
Its metadata defaults, numeric milliseconds, ISO strings and partial-body failure
semantics are unchanged. Prisma catalog/DDL and duplicate aggregation replace
index-driver operations; only the unsupported binary-version query stays native.

| Command | Result |
| --- | --- |
| `timeout 240s npm --prefix packages/redbox-core run build` | PASS (after narrowing lookup scalar type) |
| `timeout 300s bash .tmp/wrpz2/run-m.sh` | **10 passed / 0 failed**: raw/defaults both backends, failed body/restart, bidirectional reads and index refusal/preparation. Initial fixture import typo failed before cases; corrected. |

R uses all eight physical models plus raw operations for schemaless extensions
and missing JSON. The dynamic query translator retains its closed expression
subset/refusals, tenant scope, exact JSON equality and count/order/page/projection.
The fixture adapts the existing R contract, omitting campaigns/restart matrices.

| Command | Result |
| --- | --- |
| `timeout 240s npm --prefix packages/redbox-core run build` | PASS after RC builder `bool()` and nullable projection parameter corrections |
| `timeout 240s bash .tmp/wrpz2/run-r.sh` | **5 check groups passed / 0 failed**, including **16 entity read/write directions**, raw/unknown/missing fields, keys/relationships, query/refusal, and sequential failure parity. |

Q's four definitions use Prisma raw CRUD/query translation. Leases use Prisma's
typed conditional query builder (upsert, max expiry, unset owner); dashboard CAS
uses one raw conditional update and its matched count. Waterline fallback keeps
loaded-model CRUD/callbacks but shares Prisma CAS/leases/control DDL. Native Q
coordination helpers are deleted; the old lease algorithm is test-only.

| Command | Result |
| --- | --- |
| `timeout 240s npm --prefix packages/redbox-core run build` | PASS |
| `timeout 240s bash .tmp/wrpz2/run-q.sh` | **7 check groups passed / 0 failed**, eight entity directions; raw/UID/empty/null/missing/extension fields, duplicates/scoped queries, CAS and lease rejected/applied-ack failures, partial I18n write, loaded-datastore alias routing. |

The final Q rerun also covers matched-but-unchanged CAS, owner-filtered inspection,
smaller/larger renewal expiry, physical owner removal and retained freshness token.
Waterline coordination follows the loaded AppConfig/dashboard datastore alias,
subject to the existing one-client-per-logical-datastore binding policy. An initial
alias-fixture attempt failed on duplicate Sails model registration before that
case; the corrected fixture reuses loaded definitions with an independent app
runtime and verifies writes in the real alternate database. The owned failed
fixture process/container were stopped and removed.

All commands source `.tmp/wrpz2/env.sh` for Node/npm. The `.tmp/wrpz2/run-*.sh`
runners adapt the phase 1 recipes, use the pinned MongoDB digest and clean their
owned resources in exit traps. Committed R/Q `test:*-transition` runners now select
the light Prisma fixtures. Historical budget/prior-image/mixed-instance campaigns
were not rerun or adapted as phase 2 qualification.

| Final command | Result |
| --- | --- |
| `timeout 240s npm --prefix packages/redbox-core run build` | PASS; core and storage contract artifact pairs regenerated (empty storage pair unchanged). |
| `timeout 120s npm --prefix packages/redbox-core run typecheck:persistence` | PASS, including after the final alias fix. |
| `timeout 120s npm --prefix packages/redbox-core run check:prisma` | PASS, both artifact pairs fresh. |
| `timeout 120s npm --prefix packages/redbox-core run lint` | PASS, including after the alias fix. |
| `bash .tmp/wrpz2/run-core.sh` (600s / 90s inner timeouts) | **4,307 passed / 108 pending / 0 failed**. Full suite once: 4,306 plus startup test in a fresh process; unchanged startup deadline, 9,530 ms. |
| `timeout 1200s bash .tmp/wrpz2/run-portal.sh` | **419 passed / 10 pending / 0 failed**, standard portal Mocha with default selectors. |
| `node node_modules/@researchdatabox/redbox-core/bin/persistence-indexes.cjs --inspect` (inside timed portal runner) | **72 scopes / 29 collections ready**; M/R/Q report Prisma. |
| `timeout 1300s bash .tmp/wrpz2/run-bruno.sh` | **309 requests / 553 tests / 3 assertions passed; 0 failed**, only General folders 1–4, default selectors. |

The two portal runners ran sequentially through `run-standard.sh`, following the
phase 1 dependency-isolation recipe; held root dependencies were restored. Full
default suites preceded the narrow Waterline alias correction. That correction
was rebuilt and verified with the final Q checks and strict typecheck/lint;
default suites were not repeated. Raw logs remain in `.tmp/wrpz2/` (ignored).

M/R/Q selectors are `prisma | waterline`, default Prisma; explicit `mongodb`
fails with index-preparation/migration guidance. Driver adapters were deleted.
Waterline loaded-model CRUD remains for explicit rollback. Q fallback's native
CAS, lease and DDL helpers were also replaced by Prisma; the old lease algorithm
is test-only. Cross-group query targets retain their current U/S/J/V owners for
later phases. There are no new unique indexes, transactions or data rewrites.

Rewrite register entries: **M-PG-01–03, R-PG-01–04, Q-PG-01–08**. They cover raw
schemaless CRUD/query translation, lease inspection, CAS and control catalog/DDL/
duplicate checks. The only retained production driver calls in M/R/Q are their
three preflight `buildInfo` queries: RC19 exposes no supported binary-version or
arbitrary-command API. Quirks **M-01–02, R-01–04, Q-01–07** are recorded;
**R-04/Q-07 improve conditional-write fencing**, all others preserve the described
Waterline/service behavior. Missing JSON is never materialized by read/patch.

Phase 3 J1–J4 notes:

- **J1 progress:** reuse the app-owned Prisma client and preserve optional JSON,
  references, timestamps and physical absence; move its named-query reader too.
- **J2 harvest:** preserve run/chunk/event lineage and ordered partial effects;
  use conditional Prisma updates for leases/CAS and supported atomic counters.
- **J3 SIEM:** preserve redaction, owner/token/expiry fencing, delivery outcomes
  and explicit non-TTL indexes; keep external delivery separate from persistence.
- **J4 Figshare:** preserve replacement/unset semantics, partial unique index
  definitions, millisecond leases and intent receipts; use Prisma conditional
  claims/counters and register every raw/control operation.

Reuse the actual RC19 typed query builder/runtime/control APIs rather than
conventional Prisma method names. No job transactions or stronger multi-document
guarantees follow from moving the adapter.

Cleanup verified: no `wrpz2` containers (including stopped), networks or volumes;
all owned anonymous volumes removed by `rm -fv` / Compose `down -v`. No images
were built. Existing `development-*` containers remain running and untouched.
All work stays in the supplied worktree; local commits only, no push or PR.


## Phase 2b — model API first (2026-10-22)

Reworked forward from `73bd3b3b7` under the updated ADR 0004. All eight R and four
Q definition repositories now use `client.orm` for CRUD, including ordered
translation `createAll`. Dashboard CAS uses a revision-filtered model `update`
and its returned document to distinguish matched/no-op from unmatched, avoiding
modified-count ambiguity. Lease inspection uses the model API; conditional
lease writes retain Prisma's supported typed builder (`upsertOne`, `max`,
owner `unset` and matched counts), with no raw collection operations.

Field audit (corrected by phase 3 step 0): the only real stored fields added in
2b are `WorkspaceType.label` (WorkspaceTypesService/workspacetype.config.ts)
and `Form.attachmentFields` (FormsService). The other 17 fields were synthetic
P0/transition/unit probes, not production extensions: `institutionUnknown` on
all twelve R/Q models, `Form.syntheticUnknown`, `AppConfig.syntheticUnknown`,
`RecordType.unknown`, `ThemeConfig.extension` and `Form.extension`. They have
been removed and artifacts regenerated. Existing free-form configuration stays
in its documented JSON fields. Virtual `workflowSteps` / `entries` are not
stored fields. New real institution fields require evidence and declaration.
Undeclared fields written by Waterline remain in storage after Prisma patches;
Prisma model reads do not return them. This is accepted behaviour, not a schema
gap that synthetic fixture fields should fill. Transition checks now verify raw
preservation rather than expecting undeclared fields in Prisma read results.

Model reads may return null for missing optional fields; patch writers use only
submitted fields and the existing timestamp policy. Whole raw document
comparisons verify unrelated stored fields and historical absence survive
updates, and omitted extensions remain absent on create. Quirks R-05/Q-08 record
that read shape and null lease metadata policy; Q-09 records model CAS no-op
semantics. R-04 now points to the model after-image. Removed rewrite rows
R-PG-01 / Q-PG-01 / Q-PG-05 / Q-PG-06 and retired the non-raw Q-PG-07 operator
note from the raw table. Remaining R/Q raw uses are stored NamedQuery/report
expression translation and duplicate audits, plus catalog/index control DDL;
`buildInfo` remains native for the documented RC19 server-version API gap.

Sequential commands source `.tmp/wrpz2b/env.sh`; Node **24.16.0**, npm **11.20.0**,
unchanged exact Prisma **8.0.0-rc.24** / orm-mongo **8.0.0-rc.19**. Runners adapt
`.tmp/wrpz2`, with unique `wrpz2b-*` owners and the pinned MongoDB 9.0.4 digest.
Initial compilation found overloaded union delegates/JSON input typing; these
were corrected without `any` casts. Initial R fixtures stopped before completing
checks on the Prisma-only field readiness check and empty-AND rule; corrected
before the successful final runs below. Disposable debug output was removed by
the final rebuild. No prior image, budget, mixed-instance campaign or browser run.

| Command | Result |
| --- | --- |
| `timeout 15s python3 .tmp/wrpz2b/audit-fields.py` | **12 model field audits passed / 0 failed** |
| `timeout 240s npm --prefix packages/redbox-core run build` | PASS |
| `timeout 240s bash .tmp/wrpz2b/run-r.sh` | **5 check groups / 16 entity directions passed / 0 failed** |
| `timeout 240s bash .tmp/wrpz2b/run-q.sh` | **7 check groups / 8 entity directions passed / 0 failed** |
| `timeout 120s npm --prefix packages/redbox-core run typecheck:persistence` | PASS |
| `timeout 120s npm --prefix packages/redbox-core run check:prisma` | PASS, both artifact pairs fresh |
| `timeout 120s npm --prefix packages/redbox-core run lint` | PASS after removing an unused binding |
| `timeout 720s bash .tmp/wrpz2b/run-core.sh` | **4,307 passed / 108 pending / 0 failed**; startup case in a fresh process (9,763 ms) |
| `timeout 1200s bash .tmp/wrpz2b/run-portal.sh` | **419 passed / 10 pending / 0 failed**, default selectors |
| Portal runner: `persistence-indexes.cjs --inspect` | **72 ready scopes / 29 collections**; R/Q Prisma |
| `timeout 1300s bash .tmp/wrpz2b/run-bruno.sh` | General folders 1–4 only: **309 requests / 553 tests / 3 assertions passed; 0 failed** |

The standard wrapper runs the portal suites sequentially and temporarily isolates
root `redoc` / `should` dependencies, restoring them afterwards. Its first Bruno
launch failed before any requests because the copied `.bin/bru` symlink had been
dereferenced. Restored the 31 copied CLI/dependency symlinks and invoked only
Bruno with `timeout 1400s bash .tmp/wrpz2b/run-bruno-with-deps.sh`; portal Mocha
was not repeated. Full suite counts above are from one actual run of each.

J1–J4 should use this same pattern: inventory fields first, reuse the app-owned
client and model CRUD, keep free-form payloads in JSON, accept/log null reads,
and never round-trip full decoded DTOs into writes. Keep partial effects and
fencing at Waterline parity without transactions. For conditional writes use a
model after-image or conditional predicate/re-read before considering the typed
builder; raw requires ADR 0004's strict exception plus an individually justified
register entry. Register catalog/DDL, duplicate audits and stored-expression
translation separately from ordinary CRUD.


Cleanup verified: no `wrpz2b-*` containers (including stopped), networks or
volumes remain. R/Q runner traps use `docker rm -fv`; portal Compose cleanup uses
`down -v --remove-orphans`. Images were reused, none built. Root dependencies
are restored and the temporary holding directory is empty. Existing
`development-*` containers remain running and untouched. All changes are local
to this worktree; no push or PR.

Phase 3 step 0 verification: `timeout 240s npm --prefix packages/redbox-core run build`
PASS (regenerated artifacts); `timeout 240s bash .tmp/wrpz3/run-r.sh` **5 check
groups / 16 directions passed**, and `timeout 240s bash .tmp/wrpz3/run-q.sh`
**7 check groups / 8 directions passed**. R initially launched before the build
finished; its subsequent name-conflict attempt was stopped and cleaned before
the successful run. Q initially exposed a cross-backend comparison of decoded
unknown fields; it now compares raw documents for failure non-application. No
additional broad suites were run for step 0; phase 3 runs them once at the end.
