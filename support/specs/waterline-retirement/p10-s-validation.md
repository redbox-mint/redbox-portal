# P10 S validation

**Current status — Prisma phase 7:** the S selector now covers all record,
DeletedRecord, CAS/lifecycle/source-intent, recordidentity, authorization/U,
Counter and OID-rebind paths as well as staged storage. Values are
`prisma | waterline`, default Prisma; `mongodb` is rejected. Counter uses an
atomic Prisma increment (S-01 improved). TX-PARITY-01/01a and ADR 0004 supersede
all transaction/shared-session and campaign gates below. No transactions;
ordered partial outcomes remain. [Phase 7 evidence](evidence/prisma-phase7.md)
and the [current operator guide](../../wiki/Staged-Storage-Persistence.md) are
current. The rest of this page records the **historical staged qualification**.


**G-S PASS for the staged, transaction-free `next` subset.** Qualification
`1e2085cd6` precedes the single default promotion `0be51a5f6`; S now defaults to
`mongodb`, retaining explicit `waterline` rollback. **G-TX remains CLOSED /
OPS-TX-01 undecided. P10.4 and all P11 bridge retirement remain unimplemented.**
The P10a/P10b sections below preserve their historical status at acceptance.

## P10c staged qualification and promotion (P10.7–P10.8)

“S promoted” covers attachment metadata/journal/access audit **except OID rebind**,
the six schema artifact/reference methods and five record/integration audit
methods in `stagedStorageOperations`, and the separate bounded revision-wrapper
maintenance operation. Record/DeletedRecord reads, writes, CAS, lifecycle,
source intents, permanent `recordidentity`, authorization grant lookup, all U
participation/access assignment, Counter and attachment OID rebind remain on
their retained Waterline/native owner **regardless of selector**. Byte I/O uses
the P10b app-owned driver while record coordination remains baseline. No atomic
adapter, shared transaction/session claim, model removal or full-S retirement
follows from this bounded gate. See [classification](p10-s-classification.md),
[operations](p10-s-operations.md) and the [wiki](../../wiki/Staged-Storage-Persistence.md).

The compact authority is `evidence/p10c-s/qualification.json`, with post-promotion
results indexed by `evidence/p10c-s/verification.json`. The qualifying runtime
before promotion is exactly the 619 P10b core/storage source files with SHA-256
`cd6bd02176adf7cbf0941cbddab479946de36051116b5a932b60df4513620844`.
Promotion changes only runtime selection plus deployment/template defaults and
corresponding regression expectations. Dependency manifests/locks remain unchanged;
clean consumer lock generation/install/prune asserts npm **11.20.0**.

The **14-check** live qualification runs simultaneous loaded Waterline and driver
processes. It proves both write/read directions, ObjectId/ISO/null/falsy/unknown
field preservation, 1,048,587-byte GridFS roundtrips, one cleanup claimant and
stale-token refusal, a SIGKILL between journal authorization and byte cleanup,
fresh-process recovery, immutable schema collisions, Date pins/expiry and bounded
reference reads. Driver-written grants are authorized through the retained
lookup; user, role, brand, portal and operation isolation is checked. Retained
record tests prove a single mixed CAS winner, applied-write/failed-ack unknown
outcomes with one dispatch, monotonic delete/restore revisions, idempotent
simultaneous restores, pre-delete ABA refusal and permanent identity after purge.
These are baseline preservation proofs, not atomic driver qualification.

Actual MongoDB failpoints separately inject insert rejection and an applied
insert with a failed write-concern acknowledgment. Both public failures remain
safe unknown outcomes; raw readback distinguishes absent/applied state without
replay. The actual registered revision migration is skipped while pending,
interrupted after application before ledger acknowledgment, resumed idempotently,
and never replayed after logging. The existing live storage suites run with both
Mongo test URLs enabled: **326 passing, zero pending** (`storage-live.json`).

The [designated built prior image](evidence/p10c-s/packed-prior-artifact.json) is
`redbox-p10-s:prior-12e566575`, source
`12e566575e046dc9b217f189f90adaf0e1126f3f`, immutable image digest
`sha256:c138489fc72f566815113599b699e13ad55486176f333c394238b361bca094d3`.
It contains the full pre-promotion core+storage packages and clean installed,
pruned production dependencies/lock; it is a qualification image, not a published
portal release. The pinned Dockerfile and source guard are committed. The actual
image reads driver-written schema/attachment/byte data, writes metadata/audit
readable after switching forward, and runs against a matching checkpoint restored
to fresh logical databases. Every existing checkpoint BSON document is compared
unchanged; indexes, GridFS file/chunk bytes, authorization and permanent identity
survive. No engine/FCV/topology downgrade or institution backup promise is made.

`packed-prior-retry.json` proves **14 live checks on each of Node 24.16.0 and
26.11.1** using installed core+storage tarballs, no workspace links or source
ancestry, offline types/imports/shims and zero import sockets. Tarball/manifest/
lock hashes are retained. The new default receives a separate packed rerun below.
Host Node is 24.18.0; stock mounted image Node is 26.10.0. MongoDB remains
**8.0.34 / FCV 8.0 standalone**. All first-party direct driver pins remain 7.7.0;
Waterline retains its private driver. No supplied topology changes or institution
data access occurred.

The isolated operations campaign (`operations-full.json`) uses a fixed 15KB
schema, 20 metadata rows, all eleven staged storage methods, attachment reads/
updates/access and journal prepare/pending/applied/read/fencing operations.
Three alternating backend pairs each have **100 warmups and 1,000 measured
operations at concurrency one**. Every sample verifies 55 durable record audits,
55 integration audits, 55 access audits and 55 applied journals; errors are zero.
Profiler calls include both logical databases and the warmup/byte work equally.

| Metric | MongoDB / Waterline | Provisional OPS-BUDGET-01 limit |
| --- | ---: | ---: |
| p95 | 0.2881 | <= 1.20 |
| Throughput | 2.4686 | >= 0.90 |
| RSS | 0.9426 | <= 1.10 |
| Database calls | 0.6331 | <= 1.25 |

Driver p99 is 17.46–19.02ms versus baseline 49.23–55.75ms. Maximum driver
readiness is 145.71ms (baseline maximum 65.39ms), within the 250ms allowance;
the existing 12-second offline source-loading deadline is unchanged. Each owner
uses one shared app driver client; measured connections are **2 observer / 11
active / 2 closed**. Separate 1,048,587-byte write/read/hash/delete cycles measure
**27.34 MB/s Waterline selection and 38.20 MB/s MongoDB selection**; both selections
retain the same qualified byte owner. This is bounded development load, not a
production capacity or HA approval. P10b owner/failure/draining coverage is renewed
at the tip, including its documented upstream Agenda sleeping-watchdog limit.

Initial attempts remain compact and excluded where appropriate: optional-field
and lifecycle fixture corrections; an injection corrected from updateOne to the
actual findOneAndUpdate dispatch; empty-namespace index enumeration; packed live
execution moved from read-only `/fixture` to writable `/tmp`; and a broad format
check narrowed to the changed fixtures after reporting six unchanged legacy
fixtures. No production assertion/timeout was relaxed. The initial timing run
used the observer's default streaming monitor and sampled an extra observer
socket; the accepted isolated campaign uses polling and bounded server socket
convergence. Legacy Waterline nullable-string warnings remain visible in raw
logs and cause no document rewrite. No raw logs or patches are committed.

## Post-promotion tip verification

All accepted tip commands, durations, counts and raw-log SHA-256 values are in
[verification.json](evidence/p10c-s/verification.json). They run on promotion
`0be51a5f6`'s exact runtime; the final commit changes documentation/evidence only.
Selectors are asserted in actual processes. Stock npm runners are unfiltered,
with unique Compose projects and fresh owned database volumes; Mocha additionally
asserts attachment manager bypass and retained record/U ownership. The complete
unchanged core retry supersedes the first tip run's existing 12-second offline
source-loading timeout (10.599 seconds on the passing run); no timeout is relaxed.

| Verification | Accepted result | P10c ledger |
| --- | --- | --- |
| Core/storage builds, strict persistence/root types, storage test compile and all three lints | PASS | `promotion-build.json`, `final-static.json` |
| `npm run test:core` | 4,159 passing / 113 existing pending | `tip-core-isolated.json` |
| Storage normal and fully enabled live suites | 288 passing / 38 existing pending; 326 passing / zero pending live | `tip-storage-{default,live}.json` |
| Agenda SQS package | 6 passing | `tip-agenda-sqs.json` |
| Foundation/cache/M transition | 12 / 17 / 14 passing; one existing migration pending | `tip-{foundation,cache,migration}.json` |
| Shared deployment/upgrade index suite | 15 cases PASS, including all 49 default scopes / 20 collections | `tip-indexes.json` |
| Reference/configuration/progress/harvest/SIEM/Figshare persistence | PASS | `tip-{reference,configuration,progress,harvest,siem,figshare}.json` |
| Existing S live contract/readiness/backfill/ownership/failures | 37 / 8 / 16 / 16 per selector / 5 checks PASS | `tip-s-live.json` |
| Promoted omitted selector plus actual prior image/checkpoint recovery | 15 checks PASS | `tip-qualification.json` |
| Clean installed packed default, Node 24.16.0 and 26.11.1 | 15 live checks per Node; offline types/imports/shims, zero import sockets | `tip-packed.json`, `packed-default-artifact.json` |
| Final isolated operations comparison | PASS; zero errors and all provisional limits met | `tip-operations.json` |
| Fresh default and explicit Waterline `npm run test:mocha` | 419 passing / 10 existing pending each | `tip-mocha-{default,waterline}.json` |
| Fresh default and explicit Waterline `npm run test:bruno:general` | 309/309 requests, 553/553 tests, 3/3 assertions each | `tip-bruno-{default,waterline}.json` |
| Fresh default and explicit Waterline dev startup | HTTP/bootstrap/migrations ready; 49 / 34 selected scopes ready | `tip-dev-{default,waterline}.json` |

The final operations ratios are **p95 0.2899, throughput
2.4550, RSS 0.9279, calls 0.6331**.
Maximum readiness is **192.50ms**;
all samples return from 11 active connections to the two-observer baseline.
Separate byte cycles measure **25.05 MB/s Waterline selection /
39.04 MB/s MongoDB selection** on the same retained byte owner.
P10b connection/drain results are renewed: 14 active to 2 observer-only after lower,
with 145–147ms controlled draining including the deliberate held work.

The normal pending counts are unchanged; every optional live storage case is
explicitly enabled in the 326-case run. No new skip or assertion relaxation is
introduced. All runtime pin guards pass after stock installs. The first tip core
timeout is retained as a failed ledger, along with the earlier fixture attempts;
successful final ledgers are explicitly indexed rather than replacing failures.
The post-stock SQS unit runner initially found an incomplete local dev install
(missing Vite). npm 11.20.0 `ci` restored that package's existing locked dev
dependencies; all six tests pass without manifest/lock changes.

`cleanup.json` records zero remaining owned containers/networks/volumes. The
sole retained new image is the immutable pre-promotion rollback artifact above;
its installed lock remains inside it. Temporary installs, npm cache and local raw
logs are removed after hash verification; committed fixture code and compact
ledgers reproduce the runs. Unrelated pre-existing stacks/images are untouched.
Nothing is pushed. Exact compact P10c and combined P10a/P10b/P10c sizes are in
`verification.json`; both remain below 500 KB, with no transcript or patch retained.

Human decisions remain OPS-TX-01 before P10.4, stronger Counter allocation if
required, REL-01 scope/date, SEC-01 atomicity/effect boundaries, INST-01 private
hooks/mappings/data/pending migrations, and formal production budget/rollback/
support acceptance. These do not imply full-S, G-TX, P11 or official-release
acceptance. The current gate is **PASS for staged transaction-free next only**.

## Historical P10b public-boundary correction

The storage hook now uses core's package entry for all imports. Existing
`assertJsonValue` is reused; `mongoDatabase`, `persistenceOperation`,
`assertStorageMapping` and the narrow `storageAuditFields` accessor are exported
for first-party concrete adapters with `@internal` TSDoc. Full mapping fixtures
remain private. Driver handles remain excluded from the hook extension catalogue.
The JS webpack wrapper also uses its already-exported core contracts.
`scripts/verify-core-imports.cjs`, run by root lint, rejects static, dynamic and
CommonJS `redbox-core/dist/` imports in other packages, including their JS tools.

`evidence/p10b-s/part1-*.json` records passing builds, root/persistence typechecks,
lint, documentation audit/generation (42 published surfaces, 816 advisory
findings), the negative import-guard probe and all 37 live staged contract checks.
No storage behavior, selector, dependency pin or transaction gate changes.

## P10b revision maintenance (P10.5)

The migration's unchanged ledger name now invokes a plain bounded maintenance
operation. S=mongodb uses the app-owned redboxStorage driver with target wrapper
mapping checks and operation draining. Waterline retains its native manager.
The engine is adapter-private; existing maintenance exports remain compatible.
The driver entrypoint also runs without ORM/model loading, using fixed physical
namespaces and checking target-column overrides only when models are present.
The final guard run adds this standalone entrypoint proof (**16 checks**); see
`final-guards-build.json` and `final-guard-results.json`.
This independent missing/null wrapper fill is staged-safe and does not move U,
record saves, identity or lifecycle operations to the driver.

`backfill-checks.json` and `backfill-results.json` record **15 live checks** on
1,207 synthetic documents per adapter, batches no larger than 73, partial
applied/failed-ack restart, no-progress refusal, idempotent rerun, concurrent
revision preservation, mapping refusal and migration entrypoint execution.
Both adapters produce identical raw SHA-256 results. Metadata, workflow,
authorization, lastSaveDate, unknown fields and existing non-null values are
deep-compared unchanged. No broad rewrite occurs. Storage tests remain
**288 passing / 38 pending**. Core/storage builds, persistence types and lint
pass. An initial nominal-Db compile refusal was corrected with an adapter-private
structural port, retained in `backfill-build.json`; no dependency change is
needed for this maintenance seam.

## P10b exact driver alignment

Storage's dependency and devDependency now both pin **mongodb 7.7.0**, matching
root/core. Inspection found no mongodb peerDependency (the peers are luxon/rxjs).
`driver-pin-decision.json` records the exact lock delta: npm **11.20.0** regenerated
root/storage locks, updated the storage driver/BSON/connection-string/saslprep
subtree without unrelated version upgrades or removing peer entries. Explicit
`--legacy-peer-deps=false --include=peer` overrides this machine's legacy setting;
strict npm ci dry-run validates both locks. The accepted lock ledger is
`driver-locks-final-pinned.json`; earlier generation ledgers retain the
investigation only. The unpublished pin commit was corrected in place before
review, avoiding a lock removal/restoration sequence in the final history.
The root lock also contained stale linked-package MongoDB 7.2.0 and TypeScript
6.0.2 copies despite the declared 7.7.0 / 5.9.3 pins. These entries are removed
so a stock root install cannot reinstate them. Root `.npmrc` explicitly disables
legacy peers, and stock pre/post-install, in-process Mocha and dev readiness
guards verify loaded driver/compiler versions and this checkout's package builds.
The initial stock passes using the stale driver copy are diagnostic only; final
verification reruns with the runtime guards enabled.
The dedicated pin commit builds/typechecks and passes the 288 storage tests.
This aligns first-party binary/driver types and the selected stable runtime;
it does not by itself repair a BSON 7 bucket on a Waterline BSON 6 manager.
That mismatch requires an ownership fix in the following resource change.
Two npx-wrapped install attempts refused npm's propagated allow-scripts setting;
the direct npm 11.20.0 CLI with scripts disabled completed successfully.

## P10b resource ownership (P10.6)

`s-final-results.json` records the guarded final **16 live checks per selector**
and **5 partial startup/cleanup checks**, plus **37 staged contract checks**,
**8 readiness checks / 15 scopes** and **16 revision backfill checks**. A 1,048,587-byte payload roundtrips through both modern
and legacy GridFS with SHA-256 `df4a197909a34edf52c4bd8c64bd8edb3674db2dfb4978f1a498db6198051f2a`.
The legacy bucket now uses the app-owned BSON 7 Db in its existing Record
datastore/fs namespace. The borrowed-manager BSON 6/7 failure is **fixed by byte
ownership**, independently of pin alignment; the record manager and all U/
lifecycle routing remain unchanged.

Measured connection counts in the isolated final owner runs: observer **2**,
ORM/shared-runtime **6**, all owners active **14**, owner cleanup with ORM retained
**5**, and after app lower **2**. Cleanup waits for a running job, session response
and an unconsumed GridFS stream, then closes queue/address, session, blob and
shared-driver clients. The measured guarded final drain/lower path was **144–146 ms**,
including the deliberate 60 ms hold. App isolation, repeat cleanup, failed GridFS
connect, failed GridFS close/retry, partial Agenda initialization during cleanup,
failed queue connect and failed backend close/retry pass. Shared pools remain
owned if a resource close fails. New resources cannot reopen a closed runtime
without explicit initialization.

The same fixture proves custom queue-address versus application-history routing,
SQS local protocol send/receive and owned-client destruction, retained SQS
restrictions, real express-session login/cookie continuity, physical native TTL
index/deletion, and legacy-logo bytes/effective split database resolution with
short-lived client closure. Stock regressions supply actual portal login coverage.
Core/storage builds, strict persistence types and lint pass; 64 focused core
checks and all 288 storage tests pass. Full tip regressions are recorded below.

Initial fixture corrections (missing service container and unsupported human
interval spelling) are retained compactly. One early full core run found two
old tests stubbing static `MongoClient.connect`; the owner now constructs before
connect so it can close partial initialization. The tests now stub instance
connect/close and retain their app-isolation/reload/error/retry assertions.
An exploratory owner process was stopped after successful socket cleanup exposed
Agenda's existing sleeping watchdog; accepted final fixtures use a 1-second job
lock lifetime. This proves connection/worker draining, not removal of the upstream
completed-job timer (see operations notes). No production timeout is relaxed.

## P10b final verification

The accepted ledgers are indexed in `evidence/p10b-s/verification.json`.
All runtime sources match verified commit `97052abed`; the final documentation
commit adds compact evidence and the tested SQS spy resolution correction only.
Root/core/storage load MongoDB **7.7.0**; storage loads TypeScript **5.9.3**.
Guards run before/after stock installs, inside Mocha and inside fresh dev startup.
Host Node is **24.18.0**; the mounted stock image is **26.10.0**. Test MongoDB is
**8.0.34 / FCV 8.0 standalone**. No institution database or topology is changed.

| Verification | Accepted result | P10b command ledger |
| --- | --- | --- |
| Core/storage builds, strict persistence/root types, storage test compile, all three lints | PASS | `final-build-pinned.json` |
| `npm run test:core` | **4,159 passing / 113 pending** | `final-core-pinned.json` |
| Storage package tests | **288 passing / 38 pending** | `final-storage-pinned.json` |
| Agenda SQS package tests | **6 passing** | `final-sqs-after-stock.json` |
| Live S contract/readiness/backfill/ownership/failure cases | **37 / 8 / 16 / 16 per selector / 5 PASS** | `final-s-live.json`, `s-final-results.json` |
| Foundation/cache/migration suites | **12 / 17 / 14 passing; 1 existing migration pending** | `tip-foundation.json`, `tip-cache.json`, `tip-migration.json` |
| Shared index deployment/upgrade suite | **15 cases PASS** | `tip-indexes.json` |
| Reference/configuration/progress/harvest/SIEM/Figshare persistence suites | PASS | `tip-{reference,configuration,progress,harvest,siem,figshare}.json` |
| Fresh default and MongoDB-selected stock Mocha | **419 passing / 10 pending each** | `final-mocha-{default,mongodb}.json` |
| Fresh default and MongoDB-selected stock Bruno general | **309/309 requests; 553/553 tests; 3/3 assertions each** | `final-bruno-default-retry.json`, `final-bruno-mongodb.json` |
| Fresh default and MongoDB-selected development startup/readiness | PASS; selected indexes ready, durable migration ledger | `final-dev-{default,mongodb}.json` |

Stock runs use unique Compose projects, fresh volumes and normal unfiltered npm
runners. Pending counts are pre-existing and are not qualification. The first
guarded default Bruno run failed at an external DataCite 10-second timeout;
the complete unchanged fresh-volume retry passed. No timeout or assertion was
relaxed. Earlier stock `tip-*` passes using a stale linked driver are diagnostic
only. Final guarded runs above replace them. npm 11.20.0 strict dry-run lock
validation is evidence of lock consistency, not clean installed qualification.

`cleanup-final.json` records zero remaining owned containers, networks or volumes;
unrelated pre-existing stopped stacks are retained. Nothing is pushed. The phase
retains compact JSON only, with commands, durations, counts, raw-log byte lengths,
SHA-256 and short failure excerpts. Exact payload sizes are in `verification.json`;
P10b and combined P10a/P10b evidence remain well below **500 KB**. No raw transcript
or source patch is committed.

Human decisions remain **OPS-TX-01**, whether Counter needs a stronger allocator,
and the existing release/security/institution and G-S operational acceptance
gates. G-TX stays closed, Waterline stays default, and P10.4/P10.7/P10.8 remain
unticked. The retained upstream Agenda timer limit is described above and in the
operations notes; connection cleanup does not imply whole-process quiescence.

## Historical P10a evidence

Scope: **P10.1–P10.3**, starting at `004c91054`. Waterline remains the S default.
**G-S remains OPEN; G-TX CLOSED / OPS-TX-01 undecided.** P10.4–P10.8 (atomic
implementation, backfill port, final owner draining, full proof matrix and
promotion) remain outstanding. No institution database is inspected or supplied
stack topology changed.

The [classification](p10-s-classification.md) inventories every repository and
storage operation across all nine entities, recordidentity, native schema and
attachment/binary coordination. [Operations](p10-s-operations.md) describes the
selector and explicit preparation procedure.

Implementation commits:

- `34c17bbc5`: loaded raw-document/index/byte fixtures and staged/atomic classification.
- `1d6f5de0e`: named attachment/Counter repositories and storage baseline seam.
- `c95a2b829`: opt-in staged adapters, explicit baseline allowlist, mapping/readiness and stock fixture coverage.
- `5faa546c2`: retain original dependency pins/locks through an adapter-private structural schema port.
- `27980c1ae`: preserve codec/error/Counter parity, remove native OID rebind and correct stock runner selector/fault isolation.

Evidence under `evidence/p10-s/` contains exact commands, durations, exit status,
counts, SHA-256 and byte lengths of local raw logs, short failure excerpts and
synthetic raw-document/codec/index fixtures. Full transcripts and source patches
are excluded. `verification.json` identifies the accepted command ledgers,
qualification stages and runtime versions. **87,692 bytes (85.6 KiB)** is retained for this
phase, well below 500 KB.

The attachment API uses named operations and plain DTOs. Existing service names,
capabilities, binary contracts and RxJS boundaries remain. Counter keeps actual
loaded model callbacks, its array-shaped read result, candidate mutation before
write and lost-update race. A historical-source fixture also catches a seam
regression: original string value `"4"` increments to `"41"`, not numeric 5.
The final producer preserves the original behavior without storing source copies.

The storage facade selects six schema artifact/reference methods and five
audit methods. Every record/identity/U method, authorization grant lookup,
attachment OID rebind and Counter operation remains baseline regardless of
selector. Native record code was relocated, not ported. The live contract checks
every exported baseline operation's owner and invokes the actual loaded model
for Counter and attachment rebind. No native rebind implementation remains.

Readiness covers six attachment and nine native schema/audit index scopes.
Inspection reviews every selected scope before any DDL; startup refuses missing
preparation. Native schema options, including hidden-index conflicts, retain
their original strict checks. Loaded mapping/default/callback changes refuse
selection; failures are sanitized. The fresh init script and hook template are
identical. No dependency or lockfile changes remain; the package test runner's
Node stripping flag aligns it with the core runner.

| Verification | Accepted result | Command ledger |
| --- | --- | --- |
| Core build | PASS | `core-build-boundary.json` |
| Strict persistence types / root types / lint | PASS | `persistence-types-boundary.json`, `root-types-boundary.json`, `lint-boundary.json` |
| `npm run test:core` | **4,159 passing / 113 pending** | `core-tests-final-isolated.json` |
| Storage package build / `npm run test:storage-mongo` | **288 passing / 38 pending** | `final-storage-build.json`, `storage-tests-complete.json` |
| Live staged contract, distinct application/storage DBs | **37 checks PASS** | `contract-boundary.json` |
| S readiness | **8 checks PASS / 15 scopes** | `readiness-final.json` |
| Existing shared index deployment/upgrade suite | **15 cases PASS** | `shared-indexes.json` |
| Historical Counter producer characterization | **4 checks PASS** | `counter-characterization.json` |
| Fresh default Waterline stock Mocha | **419 passing / 10 pending** | `mocha-default-retry.json` |
| Fresh MongoDB-selected stock Mocha | **419 passing / 10 pending** | `mocha-mongodb-retry.json` |
| Fresh default Waterline stock Bruno general | **309/309 requests; 553/553 tests; 3/3 assertions** | `bruno-default.json` |
| Fresh MongoDB-selected stock Bruno general | **309/309 requests; 553/553 tests; 3/3 assertions** | `bruno-mongodb.json` |

Live contracts cover Waterline→driver and driver→Waterline attachments, insertion
defaults, ISO/native Date codecs, journal state transitions, cleanup and stale
token fencing, applied-write/failed-ack without replay, validation refusal without
dispatch, malformed scalar/rich-BSON refusal without rewrite, singularity/missing
semantics, audit failure order and date filtering, schema collisions/pins/domain
codes, safe read diagnostics, unsupported Record datastore refusal, manager
bypass for staged entities, all baseline routing and selector/cleanup guards.
The raw fixture additionally loads all nine definitions, proves ordinary
callback protection of native record fields, records native identity/schema
documents/indexes and roundtrips a binary SHA-256 fixture on an owned driver.

Stock runners use unique Compose projects and fresh volumes, without test-path
filters. The Mocha bootstrap now forwards S's selector, and a test asserts its
effective value plus attachment manager bypass and retained record/U ownership.
The normal Bruno app already reads the forwarded Sails environment configuration.
No new skipped test was introduced; pending counts are not qualification.

The four stock runs preceded the final negative codec/error parity and injected
rebind refinements. Those refinements were rebuilt, typechecked and exercised by
the final live contract; full core and storage suites also pass after the codec
and error changes. This is bounded P10.1–P10.3 evidence, not a clean installed
artifact, prior-image rollback or full P10.7 proof claim. Host Node is 24.18.0;
the mounted stock image is Node 26.10.0. npm 11.20.0 was used for the temporary
lock investigation, then original pins and locks were restored byte-for-byte.

Failed attempts are retained compactly with their corrections:

- Under concurrent load, core's unchanged 12-second startup subprocess deadline
  timed out; the isolated full-suite rerun passed. No timeout was relaxed.
- Initial stock default Mocha found root-owned upload paths and a missing SMTP
  network alias in unique Compose projects. Fixture ownership/alias preparation
  corrected these, and the full stock suite passed.
- Initial MongoDB Mocha exposed the missing bootstrap selector forwarding and
  a chronicle assertion that counted background HTTP probes. Forwarding is now
  asserted; the virtual-request assertion checks its own path. Two fault tests
  explicitly select their baseline adapter because they stub Waterline methods;
  driver failure timing runs separately against the live adapter.
- Initial package tests exposed Node native stripping versus ts-node loading;
  the runner now uses the core runner's explicit flag. An invalid-digest check
  exposed schema domain codes being wrapped; final adapters preserve those codes.
- Earlier spike path/export/assertion and EJSON regex mapping attempts are kept
  as small failure ledgers; passing ledgers supersede them.

The extended borrowed-manager GridFS probe still fails with a BSON-version
mismatch: a newer GridFSBucket creates BSON 7 ObjectIds while Waterline's manager
serializes BSON 6. The original storage 7.2.0 pin and attempted 7.7.0 alignment
both use BSON 7; the owned-driver byte fixture passes. See
`legacy-gridfs-abi.json` and `legacy-gridfs-probe.json`. Stock attachment/API
workflows pass, but this remains an explicit **P10.6 owner/ABI issue**, with no
byte-owner/drain claim or dependency workaround.

Human decisions remain OPS-TX-01 before any atomic/U driver work, and whether
Counter needs a stronger allocation contract. The GridFS owner/ABI fix, revision
backfill port, real queue/session/stream draining, clean installed qualification,
full recovery/rollback matrix and S promotion remain their later task rounds.
Owned containers, networks and volumes are removed; nothing is pushed.
