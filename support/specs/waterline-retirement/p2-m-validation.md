# P2 — M migration ledger validation

**2026-10-20 — G-M technical acceptance: PASS for `next` on the matrix below.**
Pre-P2 checkpoint: `11742e911e860a5492b7cc388e6ae4ecbc52d4aa`.
Delivery commits: physical spike `3b5e11255`, Waterline repository/shared error
`66f64c1ad`, opt-in driver `688633887`, qualification `e360dccb3`.
Qualification retained Waterline; the following separate promotion changes only
M's omitted selection to **`mongodb`**, retaining explicit **`waterline`** rollback.
Prepare the name index and review institution mappings before upgrading, or
retain explicit Waterline. Other unpromoted group defaults remain Waterline;
cache remains Prisma. See [deployment guidance](p2-m-operations.md).
G0/full release remains HOLD, G-C2 remains HOLD and G-TX remains CLOSED.

## Post-promotion correction: standard stacks and existing-volume preparation

The orchestrator identified a deployment gap after promotion `ef4d80aa2`: the
custom P2 runner prepared M's index, but the standard fresh-stack MongoDB init
script still prepared only cache. Reproducing that actual old script on a new
owned volume reported M `missing` and rejected driver readiness. The earlier
custom-runner evidence did not cover standard fresh-stack deployment.

The replacement `support/resources/mongodb-persistence-indexes.js` creates only
the qualified **cache + M** full unique simple-collation name indexes. All **12**
active compose/template mounts now use it, including dev, Mocha, Bruno,
Playwright, PDF-generation examples and both hook archetype stacks. The shipped
hook init template is byte-identical. Historical inventories and archived P5
harnesses keep their original paths as dated evidence; no active mount or
operator runbook refers to the removed file.

Existing volumes use one application-aware command:

```bash
npm run persistence:indexes -- --inspect
# After reviewing the report, with writers stopped:
npm run persistence:indexes -- --ensure
```

Inspect is the default and writes no datastore data/indexes. The installed core
CLI loads actual configuration/model mappings with ORM `migrate: safe`, excludes
business controllers, and runs no HTTP lift, domain initialization, migration
bodies or business bootstrap/shutdown callbacks. Missing shims may be generated.
The internal coordinator reuses the owning inspect/ensure APIs, skips Waterline
scopes and inspects all selected groups before DDL. Known duplicates/conflicts
block all creation. It never deletes documents or drops/replaces indexes;
operators still stop writers because cross-group DDL is not atomic. Both cache
and M index-readiness errors point to this command. It is packaged separately
from normal startup imports; startup remains inspect-only.

| Verification after the correction | Observed result |
| --- | --- |
| Unmodified `npm run test:mocha:mount`, selecting the existing ledger and dashboard tests | **6 passing (2m)**, default M driver/cache Prisma; standard bootstrap and compose init, no custom P2 entrypoint or index preparation. |
| `bash packages/redbox-core/test/fixtures/waterline-retirement/run-persistence-dev.sh` | **PASS, exit 0**; standard dev compose and `app.js`, HTTP response, both indexes ready, **4 applied migrations**, operator inspect succeeds inside the real portal. |
| `npm --prefix packages/redbox-core run test:persistence-indexes` | **7 live deployment/upgrade cases passing**, including actual official fresh init and the installed npm command against existing raw history. |

Exact standard Mocha invocation (no compose override):

```bash
COMPOSE_PROJECT_NAME=p2-index-standard-815a2a6e \
RBPORTAL_IMAGE=development-rbportal:latest \
RBPORTAL_MOCHA_TEST_PATHS=$'test/integration/persistence/MigrationLedger.test.ts\ntest/integration/services/DashboardConfigService.test.ts' \
npm run test:mocha:mount
```

The dev regression changes only isolation/deployment inputs: unique project,
fresh disposable data volumes, random loopback ports, no institution env file,
and the cached application image. It preserves the standard compose services,
entrypoint, bootstrap and shared init mount, with no fixture-only index DDL.
Both standard runs used cached image
`sha256:3d66a33890bafea037db006e8bc33a5bdf0baf952ac9c0b2dc6fe52856f84bf0`
(Node **26.10.0**) and the existing pinned MongoDB **8.0.34 standalone**. Host
CLI checks used Node **24.18.0**. This additional deployment proof does not
replace the previously qualified clean Node 24.16.0/26.11.1 package matrix.

Upgrade assertions preserve raw legacy cache/history documents and index
snapshots during inspect, despite a deliberately configured `migrate: drop`.
Business controllers deliberately throw if imported; bootstrap/shutdown mark a
file if run. Neither occurs. A duplicate M name blocks even the missing cache
index; after fixture-only removal of the synthetic duplicate, explicit ensure
prepares both without rewriting history and repeated ensure/inspect is identical.
Both-Waterline, M-only driver and cache-only driver selections create exactly
their selected collections. A conflicting M index blocks all ensure writes and
remains untouched. Native configuration failure exits 1 without exposing its
synthetic credential or changing documents/indexes. Fresh init creates exactly
the two qualified collections with their required indexes and satisfies actual
driver readiness. All fixture-owned containers, volumes and temporary directories
were removed; existing development containers/data were untouched.

Build, scoped strict typecheck, core lint, changed-source/CJS format/syntax checks,
cache contract and packed file inclusion checks pass. Foundation **12** and
retained Prisma cache **17** live tests pass. Full `npm run test:core` passes
**4,127 tests, 106 pending**; the unchanged startup-loading test completes in
**10.581s**, below its existing 12s child-process limit, with lazy-import
assertions intact. No new maintenance module is imported by normal startup.
See the
[correction excerpts and full-log hashes](evidence/p2-m/index-preparation.txt)
and the [shared operator runbook](../../wiki/Persistence-Index-Preparation.md).
Known Solr-before-ready bootstrap errors remain outside this fix. G-M's
standard-stack blocker is resolved; M stays promoted and all other gates retain
their recorded disposition. Future groups must extend this single fresh script,
its hook template, the maintenance coordinator and fresh/existing-volume tests
before promotion.

## Physical spike

`bash packages/redbox-core/test/fixtures/waterline-retirement/run-migration-spike.sh`
passes against an owned, disposable MongoDB **8.0.34 standalone**. See
[raw capture](evidence/p2-m/spike.txt). No existing container/data was used.
The loaded Sails model maps `migration`, string-facing BSON ObjectId `_id`,
numeric epoch-ms `ranAt`, numeric `durationMs`, string `executedBy`, `source`,
`appVersion`, and ISO string `createdAt`/`updatedAt`. Safe-mode fresh collections
have **only `_id_`**, despite the model's unique-name declaration. Driver readiness
must require explicit deployment index preparation, never startup DDL.

Omitted optional writes are physically materialized by Waterline: strings become
`''` and `durationMs` becomes `0`. Preserve these defaults on new driver writes;
reads of historical documents must not rewrite missing fields. Preserve the
actual field names; “duration/host” in the brief mean `durationMs`/`executedBy`.
Lexical execution and no replay of logged bodies were observed. Unique ledger
names cannot prevent two nodes executing a body before either logs success.
Only one deployment migration runner is permitted.

## Repository baseline

`MigrationLedgerRepository` exposes only `executedNames`, `isExecuted`,
`recordExecution`, `removeExecution`. `MigrationExecution` preserves the six
ledger fields. MigrationRunner retains Umzug, lexical order, skip flag, metadata,
failure propagation and optional down handler. DashboardConfigService now uses
`isExecuted`; unavailable persistence fails readiness instead of appearing as an
unexecuted migration. The loaded Waterline adapter delegates to the actual model,
including overrides/callbacks. `preLiftSetup` composes the ledger before service
initialization and generated bootstrap's migrations; no domain init dependency.

Shared foundation errors use `PersistenceError`. `CachePersistenceError` extends
it, retaining its public name/code/message and cache-specific safe conversion.
Startup/Pino's existing safe diagnostic path recognizes the shared base too.
Imports add no driver acquisition or eager driver/DOM/ORM runtime imports.

Targeted baseline tests: **63 passing**, including Umzug, generated bootstrap,
dashboard and foundation tests (`baseline-unit.txt` in the final catalogue).

## Qualified runtime and commands

MongoDB **8.0.34 / FCV 8.0, standalone**, official driver **7.7.0**,
Sails **1.5.18**, sails-mongo **2.1.2**, sails-hook-orm **4.0.3**, Umzug **3.8.3**.
Host checks use Node **24.18.0**; installed Docker packages run Node
**24.16.0** and **26.11.1**, matching the P0R/P1 support record. These results
qualify this matrix, not all servers accepted by the adapter's 8+ version guard.
No replica-set conversion or transaction capability is claimed. Host npm is
12.0.2; every generated isolated consumer lock uses **npm 11.20.0**. Repository
dependency pins and locks are unchanged.

Run from the repository root, with core built before runtime suites. All live
tests create their own containers, database names, networks or Compose project;
EXIT traps remove only those resources/volumes. No existing development MongoDB
container or data is started, mounted, inspected or changed.

| Command | Result |
| --- | --- |
| `bash packages/redbox-core/test/fixtures/waterline-retirement/run-migration-spike.sh` | PASS, actual loaded pre-P2 model/raw defaults/index discovery. |
| `npm --prefix packages/redbox-core run build` | PASS, TypeScript and existing cache contract generation/copy. |
| `npm run test:core` | PASS after promotion: **4,127 passing, 106 pending**; one earlier loaded run timed out in the existing startup test (below). |
| `npm --prefix packages/redbox-core run check:cache-contract` | PASS, retained Prisma contract unchanged. |
| `npm --prefix packages/redbox-core run typecheck:persistence` | PASS, scoped strict source and foundation/M tests. |
| `npm --prefix packages/redbox-core run lint` | PASS; changed persistence/test files also passed scoped oxlint with zero warnings/errors. |
| `npm --prefix packages/redbox-core run test:persistence-foundation` | **12 passing**, actual routing/index/pool/readiness/lifecycle/cache checks. |
| `npm --prefix packages/redbox-core run test:cache-prisma` | **17 passing**, retained cache baseline and failure cleanup. |
| `npm --prefix packages/redbox-core run test:cache-driver-transition` | **15 passing**, real Waterline/Prisma/driver compatibility. |
| `P2_ROLLBACK_IMAGE=sha256:8a996239b1ba3a94e71ce9d35f6a2f5b0edef00ccbdd51131a476fbfab0771be npm --prefix packages/redbox-core run test:migration-transition` | **15 passing, zero pending** after promotion, including omitted M selection, explicit rollback and the actual pre-P2 image. |
| `RBPORTAL_MIGRATION_BACKEND=both bash packages/redbox-core/test/fixtures/waterline-retirement/run-migration-portal.sh` | **6 passing per backend**, full loaded portal/bootstrap/dashboard consumer on both M selectors. |
| `MIGRATION_PACKAGE_NODE_VERSION=24.16.0 bash packages/redbox-core/test/fixtures/waterline-retirement/run-migration-package.sh` | PASS, clean production-pruned core/storage install, offline NodeNext/CommonJS consumer/import/shims, cache interop and M mixed/raw/no-replay runtime. |
| `MIGRATION_PACKAGE_NODE_VERSION=26.11.1 bash packages/redbox-core/test/fixtures/waterline-retirement/run-migration-package.sh` | Same PASS on Node 26.11.1; the post-promotion image build was resumed sequentially from its exact staged context as described below. |
| `npm --prefix packages/redbox-core run test:migration-operations` | PASS, three paired repeats, pressure, durable state, index access and shutdown budgets. |
| `node packages/redbox-core/test/fixtures/waterline-retirement/migration-startup.cjs /tmp/redbox-p2-11742e9/prior-source/packages/redbox-core` | PASS, three alternating pre-P2/current source-load measurements; setup below. |

[Qualification excerpts and full-log hashes](evidence/p2-m/qualification.txt),
[shared-suite/raw capture](evidence/p2-m/transition.txt),
[operation samples](evidence/p2-m/operations.txt),
[startup samples](evidence/p2-m/startup.txt) preserve the observed results.
[Post-promotion results and log hashes](evidence/p2-m/promotion.txt) record the
repeated build, strict typecheck/lint/format/contract, core, foundation/cache,
15-case M suite, both portal adapters and both production-pruned slim Node
runtimes. The packed runtime adds an omitted-selector process beside explicit
Waterline and driver processes; all three read every entry without body replay.

Run the package matrix **sequentially**. During the post-promotion rerun, two
concurrent Buildx assemblies spent a prolonged interval in filesystem work.
The newer Node 26 request was deliberately cancelled (exit 130), preserving
its already-generated npm-11.20.0 lock, manifest, vendor tarballs and Dockerfile
at `/tmp/redbox-p2-11742e9/node26-retry`. Node 24 then completed successfully.
`bash /tmp/redbox-p2-11742e9/resume-node26.sh` resumed the original runner at
`docker build --progress plain --build-arg NODE_VERSION=26.11.1` with that exact
context, then ran all its original offline and MongoDB runtime probes and cleanup;
it returned **0**. No packages/locks were regenerated and no checks were omitted.
The cancelled attempt's full-log hash and final diagnostic are retained in the
promotion archive. Both final runtime results are PASS; this was image assembly
contention, not an application test failure or a deadline change.

The cache-specific error regression also passed **20 tests**; shared M unit
tests assert superclass identity, unchanged cache name/code/controlled message,
native authentication redaction and safe wrapped startup diagnostics.

## Physical, mixed-instance and recovery evidence

The same contract runs through real loaded-model Waterline and driver workers.
Each asserts its concrete adapter, writes all six fields and defaults, reads
raw BSON `_id`, numeric milliseconds and ISO timestamps, preserves unknown/missing
historical fields without rewriting, and exercises duplicate/missing/remove
semantics. The raw archive uses `promoteValues: false` with canonical EJSON;
synthetic identifiers/metadata contain no institution data or credentials.

Both directions run with **two simultaneously live independent processes**:
Waterline write → driver read/no-replay/delete → Waterline absence, then driver
write → Waterline read/no-replay/delete → driver absence. Distinct PIDs and
concrete adapters are asserted. Each backend also runs fresh/applied/lexically
ordered/pending/failed/skipped cases, closes its process and restarts against
unchanged data. Applied bodies deliberately throw if replayed. A failed body
retains its original cause and leaves itself/later bodies pending; skipped
bodies run on the next permitted attempt. Metadata and applied raw documents
remain unchanged across those operations.

Config rollback drains the driver runtime, switches the same loaded app to
explicit Waterline, reads driver history and runs only a pending body; switching
back to the driver reads that new history. Retained old repository references
reject work. Shared lifecycle tests cover concurrent initialization, active-op
drain, shutdown refusal, failure cleanup and safe original-error propagation.

Readiness refuses missing/nonunique/sparse/partial/conflicting indexes,
duplicates, non-simple collation and unsupported loaded mappings/callbacks/
validation without DDL, history deletion, rewrites or fallback. Only explicit
`ensureMigrationPersistenceIndex` prepares the scoped index after review.
Institution fixtures prove Waterline callbacks/custom collection writes still
run; the driver refuses custom collection/column/callback/validation mappings.
Private hooks and private historical migration bodies still need local adoption
qualification, as described in [operations](p2-m-operations.md).

The deployment rehearsal keeps the standby on `REDBOX_SKIP_MIGRATIONS=true`,
runs one designated driver runner, then proves the standby sees success without
executing the body. A deliberate two-runner barrier also proves **both bodies
can execute before one duplicate log fails**. Unique names are ledger integrity,
not an exactly-once body guarantee. A crash between body effects and logging
requires inspection/reconciliation before retry; no transaction is introduced.

## Prior-artifact rollback

Retained local image: `redbox-p2:prior-11742e9`, immutable
`sha256:8a996239b1ba3a94e71ce9d35f6a2f5b0edef00ccbdd51131a476fbfab0771be`.
[Artifact manifest](evidence/p2-m/rollback-artifact.json) records the source
revision label, tarball/lock/manifest hashes and the unchanged compiled pre-P2
MigrationRunner hash; [Dockerfile](evidence/p2-m/Dockerfile.rollback) records
the production-pruned Node 26.11.1 image recipe. This is an installed core/storage
runtime image from the group's pre-change commit, not a source override or
the new Waterline adapter pretending to be the old artifact.

Preparation before changing P2 sources used the existing built checkpoint:

```bash
node packages/redbox-core/test/fixtures/cache-persistence/prepare-package.cjs /tmp/redbox-p2-11742e9/prior
cp -a packages/redbox-core/dist /tmp/redbox-p2-11742e9/pre-dist
cp packages/redbox-core/test/fixtures/cache-persistence/Dockerfile.package /tmp/redbox-p2-11742e9/prior/Dockerfile
```

The fixture manifest then adds the portal-owned exact `sails-hook-orm: 4.0.3`
(core deliberately does not own that Sails hook). Its lock is generated in a
clean Node 26.11.1 container with npm 11.20.0 using
`npm install --package-lock-only --omit=dev --ignore-scripts --strict-peer-deps --no-audit --no-fund`.
The final image is built with
`docker build --label org.opencontainers.image.revision=11742e911e860a5492b7cc388e6ae4ecbc52d4aa -t redbox-p2:prior-11742e9 /tmp/redbox-p2-11742e9/prior`.
An earlier incomplete consumer lock and an image missing the app-owned ORM hook
failed qualification; only the corrected digest above is accepted.

The transition runner launches that digest against **the same disposable
MongoDB 8.0.34 standalone**, unchanged engine/FCV. The old Umzug/model path reads
driver-written history, skips a body configured to fail if replayed, writes one
pending success, and the driver reads it. Exact applied-document and index
snapshots are compared before/after. Each run records a SHA-256 checkpoint of
the synthetic applied document. External assets: **none in this ledger fixture**.
Real historical bodies can touch other domains/assets; this does not undo their
effects or certify an engine downgrade, full deployment restore or private hooks.

## Operations and startup

Same standalone, 100 existing history rows, one independent loaded app at a
time, 100 warmups + **1,000 measured operations per backend, three repeats**.
The mix cycles history/existence/record/remove. All final counts return to 100;
no body is replayed to manufacture throughput. Driver/Waterline ratios:
p50 **0.488**, p95 **0.506**, p99 **0.417**, throughput **1.999**, RSS **0.984**;
zero errors. Profiled ledger calls including warmups: **1,100 vs 1,375**;
the driver uses one call per ledger operation and no extra call per migration.
History retains the baseline collection scan plus `ranAt` sort; exact-name
lookup examines **one key and one document** through the prepared unique index.
No automatic history-sort index was added.

Cold ledger readiness adds **51ms** on average, under the provisional 250ms
limit. Serial server connections are **5 Waterline / 6 driver** including the
observer's three sockets and the loaded Waterline bridge. An additional
**1,200 operations with 12 concurrent lanes** per repeat exercise configured
**maxPoolSize 5**: all complete in 1.0–2.7s without errors, peak total connections
**9 / 10**, below the explicit borrowed/owned pool-plus-monitor caps. Each close
returns to observer baseline **3**, with no leaked group/entity pool. Foundation
tests separately prove compatible two-database owners share one persistence pool.
This is a bounded ledger comparison, not deployment capacity certification.

The existing 12-second source-loading deadline is unchanged. Under concurrent
build/test load one full-core run produced **4,126 passing + one ETIMEDOUT**;
the isolated run passed all **4,127**. The promoted source passed again with
the startup test at **9.811s**; its extra default-selection live test adds one
opt-in pending case to normal source-only discovery. Alternating three pre-P2/current samples
are 10.034/10.115/10.584s versus 9.989/10.390/10.663s: average added **102.8ms
(1.0%)**, within max(250ms, 10% baseline), every sample under 12s. The prior-source
directory is `git archive` of the checkpoint's core source/config plus links to
the same installed dependencies. Lazy module assertions prove no ledger adapter,
driver acquisition, DOM, Prisma runtime or full Effect barrel is eagerly loaded.

Portal tests retain the known Solr-before-ready bootstrap indexing TypeErrors;
these are outside M and remain qualification work for their owning phase. They
do not invalidate the asserted M/bootstrap/dashboard outcomes. Neither this
record nor the isolated startup pass claims those broader issues are fixed.

## G-M disposition and P3 handoff

**G-M PASS for this transaction-free M implementation on `next`**, including
shared physical history, no replay, pending/failure semantics, actual prior-image
rollback, loaded portal consumers, supported packed runtimes and provisional
budgets. P2.1–P2.5 have evidence in `e360dccb3`; P2.6 is the following distinct
promotion commit. Waterline rollback remains explicit and supported. No bridge/model/shim removal
is performed by P2, and historical bodies can still use loaded domain models.

P3 must follow the same spike → loaded Waterline seam → opt-in driver → evidence
→ separate promotion protocol for all eight R models and dynamic consumers.
Reuse shared `PersistenceError`, plain operations, app-owned lazy pools and
explicit index preparation; resolve the M repository only after pre-lift setup.
Use pre-P3 built-image rollback, concrete backend assertions and bounded budgets.
M has no dependency on R/domain initialization. Inventory stored NamedQuery/
Reports targets and institution expressions; unsupported expressions/mappings
must fail explicitly, without exposing a generic model/query registry.
M now defaults to the driver: P3 fixtures invoking full pre-lift setup must
prepare its index, or explicitly select Waterline M when isolating R behavior.

PostgreSQL obligations remain name identity/uniqueness/simple comparison,
numeric milliseconds, omitted/default metadata, unknown historical fields,
unchanged history/body order and one-runner/crash recovery semantics. No SQL
adapter, exactly-once effects or public BSON/session type is introduced.
G0/REL-01/SEC-01/INST-01 and formal release operations approval remain open;
OPS-TX-01 is undecided, so U/V/B/atomic S stay blocked on standalone stacks.
