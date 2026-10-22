# C2 cache qualification, promotion and Prisma retirement

Decision ledger, **2026-10-20 Australia/Adelaide**. The user approved
**driver-repository cache** for official v6; [ADR0003](adr/0003-orm-reevaluation.md)
is accepted. Qualification starts at
`b83234da9a6e5ce31387c75f3873bd3100e83175`, with **Prisma still the default**.
Promotion and Prisma removal are separately gated commits. The temporary selector
is `mongodb`, with no `driver` alias. OPS-TX-01 remains undecided, supplied servers
remain standalone, and G-TX stays closed.

**G-C2 PASS for next promotion.** C2.1–C2.5 meet the bounded pilot-standard
gate below. C2.6 separately promotes the MongoDB next default in `744517a55`.
C2.7 completes Prisma removal with its separate full regression, artifact and
fresh-runner evidence below. Explicit Waterline remains available on next;
current artifacts reject Prisma with migration guidance. Qualification retained
the original production defaults/dependencies until commit `ac39fa987`.
The [qualification ledger](evidence/c2/qualify/results.json),
[promotion ledger](evidence/c2/promote/results.json) and
[removal ledger](evidence/c2/remove/results.json) record exact commands and exits.
Failed-attempt counts, hashes and short excerpts are retained and do not constitute acceptance. [Evidence instructions](evidence/c2/README.md)
identify the replayable fixtures and resource isolation rules.

## Qualification environment and scope

Production cache code, defaults, manifests and locks are unchanged during
qualification. [Baseline](evidence/c2/baseline.json) records the source and hashes.
Every test MongoDB/Compose project uses newly allocated owned resources and removes
them; no existing development container or its data is used. The engine is
MongoDB **8.0.34**, FCV **8.0**, pinned to
`sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
The official driver remains exactly **7.7.0**. Host Node **24.18.0** / npm **12.0.2**
run existing scripts without maintaining locks; clean package consumers use
asserted npm **11.20.0**, with **Node 24.16.0 and 26.11.1** runtime images.
The standard mounted portal image is separately identified in its runner logs;
it is not evidence of either exact packed Node runtime.

## Raw, process and behavior contracts

The expanded three-adapter suite passes **20 cases** against actual standalone
MongoDB. Independent processes assert concrete adapter classes, rather than
inferring selection from an environment variable. Coverage includes:

- Every Prisma/driver/Waterline writer-reader-updater direction against one
  collection, simultaneous mixed instances, competing creates with one winner,
  last-write updates, cross-backend deletes and restart after observed completion.
- ObjectId/string-ID mapping, ISO string timestamps, finite numeric seconds,
  null, missing, falsy, scalar, array and nested JSON; omitted create data becomes
  null, omitted update data preserves the field, unknown fields and createdAt
  survive updates, and reads never rewrite legacy rows. The plain repository
  permits missing data; Prisma projects that as null while the driver preserves
  omission. CacheService behavior is identical.
  Legacy null timestamps are omitted by Prisma/driver reads; the retained
  Waterline adapter rejects them. The regression asserts that existing
  difference and verifies no raw-row rewrite, rather than broadening Waterline.
- CacheService Observable reads and void, memory-first, best-effort asynchronous
  writes: a returned set is not a persistence acknowledgment. Truthy memory hits,
  repeated falsy database reads, expiry equality, per-call memory TTL versus
  configured database expiry, retained expired rows, empty results, read errors
  and persistence failures preserve P0 behavior. Failed persistence is logged;
  the already admitted memory value remains available.
- Notification failure throttling survives process restart; recovery writes null
  with the existing memory reset behavior. Tests observe the actual persisted
  iteration/state before stopping a writer.
- Actual BrandingService draft and retained-version CSS preview create/fetch,
  one-shot deletion, expired deletion, missing/wrong-brand versions, delete-error
  precedence and forced double reads. Read/delete remains non-atomic and can
  deliver the same preview twice. The full portal integration adds the existing
  deletion-before-304 behavior and next-request 404.
- Explicit Waterline still honors loaded hook datastore/collection/callback
  overrides. Nonstandard physical mappings fail before driver selection; the
  driver does not execute Waterline callbacks.

The new authenticated prerequisite mode runs the same readiness/lifecycle suite
against the driver as well as Prisma. It uses escaped split credentials and a
custom application datastore, checks raw storage in that resolved database and
leaves record storage unused. An intentionally failed close retains ownership;
fixtures restore close and explicitly retry cleanup before the next stage.

The campaign also corrects stale test assumptions without changing production
behavior: the shared-client portal test recognizes the third adapter; J3-only
readiness explicitly leaves Figshare on Waterline after J4's independent default
promotion, retaining its eight-scope assertion; strict service-test helper name
maps have string index signatures. Original failed attempts remain in the ledger.

## Readiness, lifecycle and front-door evidence

[Live TLS/SRV](evidence/c2/raw-artifacts.json) proves an authenticated TLS server, local
SRV/TXT discovery, trusted-CA success, and rejected CA/credentials. Successful SRV
authentication requires the TXT-supplied authSource (no URI authSource override);
the log asserts one SRV and one TXT query on Node 26.11.1. DNS/hosts changes exist
only inside the owned Node container. This functional configuration run overlaps
the image copy, not the operational timing campaign; it does not certify an
institution's network certificate policy.

[Lifecycle](evidence/c2/raw-artifacts.json) proves missing/duplicate/conflicting index
readiness is inspect-only, without row/index cleanup. Remediation is explicitly
performed by the synthetic data owner. A real accepted update held by a server
failpoint completes while foundation cleanup drains; new work is refused,
connections close, reinitialization succeeds, and an actual standalone restart
retains the owned volume and completed write. This is outage/restart recovery;
there is no replica-set failover, HA or transaction claim.

The authoritative fresh-stack script and `persistence:indexes` command remain
unchanged. Standard/default scopes remain 34 indexes across 15 collections.
Startup creates no indexes, retries, upserts or fallback.

[Browser](evidence/c2/qualify/raw-artifacts.json) runs the repository's A17 Chromium
scenario against a fresh full portal with CSRF.
[Portal log](evidence/c2/qualify/raw-artifacts.json) proves
`C2_ACTIVE_BACKEND mongodb MongoCacheEntryRepository`. An earlier A17 run lacked
that observer and is archived separately, without counting as adapter acceptance.
The cold, loaded-host browser startup is not an operational timing sample.
Fresh-volume standard runners now pass: unmodified `npm run test:mocha` has
**418 passing / 10 pending / zero failures**; `npm run test:bruno:general` has
**309/309 requests, 553/553 tests and 3/3 assertions**; standard development
startup/readiness passes in **72 seconds**, with lift complete at **60.96s**,
all 34 scopes/15 collections ready and four durable applied migrations.
[Runner ledger](evidence/c2/qualify/standard-results.json) records commands,
exits, durations and hashes; [runtime](evidence/c2/qualify/standard-runtime.json)
identifies the standard mounted Node 26.10.0 image separately from exact packed
24.16.0/26.11.1 checks. The isolation overlay gives each project fresh mail,
attachment/upload data and a network-local alias for the fixture's fixed mail
hostname; commands, tests and healthchecks are unchanged. The earlier full
Mocha attempt's upload EACCES/mail EAI_AGAIN failures remain archived. Corrected
isolation passes the same complete suite; no production/test assertion changed.


## Recovery and prior-image rollback

[Recovery](evidence/c2/raw-artifacts.json) records a completed driver checkpoint and
independent mongodump/mongorestore into an empty matching engine. Canonical
application/storage/session documents, index definitions, collection options and
font assets match; the retained record's asset SHA-256 matches the restored
bytes. New driver processes read both original and restored checkpoints.

The immutable group rollback image is **redbox-c2:prior-b83234da9**,
`sha256:4f4f3570cae35fab61929d66fe79b8bf4d037359e35704d9af09b94def707e06`.
[Artifact manifest](evidence/c2/rollback-artifact.json),
[Dockerfile](evidence/c2/Dockerfile.prior),
[archived-source core build](evidence/c2/raw-artifacts.json) and
[image build](evidence/c2/raw-artifacts.json) record its provenance. The entire
core was compiled independently from `git archive b83234da9`, over the matching
pruned programme qualification dependency layer. Original root/core lock hashes
match the starting source. No current dist or node_modules is mounted into the
running image. It is a group-scoped installed-core rollback artifact, not a
published institution/full-portal release image.

Its original **absent-selector Prisma default** reads driver-written JSON,
ObjectIds, string timestamps, observed CacheService writes and notification
state. It updates/deletes those original rows, consumes valid/expired/missing
previews, resets notifications and completes a new service write. The checkpoint
restoration and code/config rollback are distinct operations.

The prior artifact's first cold import exceeded the fixture's original 30-second
startup deadline. That failed run is retained. The artifact-only deadline was
bounded at 120 seconds; the successful cold startup took about 79.6 seconds,
with about 56.0 seconds in core import. No production deadline or the existing
12-second source-module test was changed. This cold filesystem result is not
operational acceptance or a full prior-portal startup claim.

The complete original Dockerfile's **test** image has also been built from the
same archived pre-C2 commit, with its original own dependency/build/pruning paths:
**`redbox-c2:prior-portal-b83234da9`**, immutable image ID
**`sha256:cd54d56b5adf3afa9fc7c3ba610601375907bb1a368fc7201a5233c675b75f7c`**.
[Full image manifest](evidence/c2/prior-portal-artifact.json),
[build](evidence/c2/raw-artifacts.json) and
[rehearsal](evidence/c2/raw-artifacts.json) record the exact provenance and result.
Its original maintenance command prepares indexes before the driver refreshes
only the valid synthetic preview timestamp; the preview TTL remains 300 seconds.
The original app.js then boots with its absent-selector Prisma default, reads
completed driver CacheService state and JSON, updates/deletes the
original driver row while preserving ID/createdAt, and serves valid/consumed/
expired/missing preview HTTP responses. Retained session data and actual
attachment-font bytes match their checkpoint. A completed old CacheService write
is then read by a fresh current-driver process. Full old-portal startup was
**50.4 seconds**, on Node **26.11.1**. Only deployment config, owned attachments
and a read-only observer were mounted; no current application code/dependencies.
The first attempt's cold driver-seed import exceeded the unchanged fixture
30-second limit, before the old app ran; that failure remains archived. A warmed
module import allowed the unchanged probe to pass. Existing application/source
deadlines were not increased.

## Operational comparison and gate

The fixed pilot workload now has nine alternating samples, three per backend:
100 warmup cycles, 500 measured five-operation CRUD cycles at concurrency 8,
100 observed service completions, 1,000 memory hits, 100 forced database reads
and 100 actual CSS preview create/fetch pairs per sample. Two further identical
workloads plus forced GC bound retained memory. Startup stages, RSS/heap, server
operation counters, sampled connection peaks and post-close connections are
recorded. The observer is warmed past its monitoring heartbeat before baseline
connection counts. A separate no-application control proves concurrent status
requests grow the default observer operation pool from 3 to 4 total sockets;
maxPoolSize=1 keeps it at 3. The initial incomplete run is archived. Only the
observer is bounded; application pool options and gate limits are unchanged.
[Control](evidence/c2/raw-artifacts.json) and
[run ledger](evidence/c2/operations-run.json) make that correction explicit.

The provisional next comparison uses the programme's existing bounds relative
to Waterline: cycle p95 <=1.20, throughput >=0.90, RSS <=1.10, database calls
<=1.25, driver readiness <250ms, shared app-owned pool and application connections
returning to baseline after close. Prisma is an additional comparison, not the
release architecture. The final nine samples ran after all builds/test stacks finished; no other
containers were running at start. [Operation summaries](evidence/c2/operations-summary.json) and
[assessment](evidence/c2/operations-assessment.json) pass every inherited limit:

| Mean metric | Waterline | Prisma | MongoDB | MongoDB / Waterline |
| --- | ---: | ---: | ---: | ---: |
| CRUD cycle p95 (ms) | 103.48 | 47.78 | 32.97 | 0.319 |
| CRUD operations/second | 459.33 | 1,026.26 | 1,572.69 | 3.424 |
| RSS (MiB) | 444.05 | 419.87 | 388.80 | 0.876 |
| Measured database calls | 5,001 | 3,302 | 3,300.67 | 0.660 |

Driver readiness was **55.98 / 56.80 / 86.44 ms**. Every sample has zero
failures, logged errors and rejected connections. Baseline/closed connections
are **3/3** for all nine samples; sampled peaks are 9–10 including the fixed
observer. Driver forced-GC heap stays **118.64–119.19 MiB** and ends below its
initial warmed heap in every sample. After the measured workload, its two further
workloads add at most 1.88 MiB RSS; final RSS is 389.41–390.75 MiB. This bounded
retention observation does not establish institution capacity or an unlimited
no-leak claim. Prisma comparison ratios are retained in the assessment too.

**G-C2 decision: PASS for the separately reviewed next default promotion.**
All 26 final verifier labels pass: contract freshness/build, core **4,158 passing /
107 pending**, lint, three typechecks, foundation, cache **20 cases**, Prisma and
driver prerequisites **17/16**, M/R/Q/J1–J4 contracts/readiness/unit regressions,
15-case shared index checks and complete clean packed **Node 24.16.0 / 26.11.1**
consumers/runtimes. Failed attempts remain in the command ledger. The isolated
core retry passes the existing 12-second source-import test without increasing
its deadline. Both packed runs include strict public types, offline imports/shims
with zero sockets, production pruning, actual MongoDB CRUD/raw interop and
separate-database routing. The complete original Docker image build, full portal/
API/browser, lifecycle/TLS/SRV/TXT, matching recovery/prior-image rollback and
bounded operations above close C2.3/C2.5. Production source/defaults/manifests/
locks are byte-identical to the starting runtime; [source check](evidence/c2/qualify-source-check.json)
records the empty diff. C2.6 promotion and C2.7 removal must follow in separate
commits, each with its own full regression/artifact/fresh-start verification.

Private hook/data migrations, actual institutional auth/TLS/SRV, pool sizing,
production HA/capacity, deployment assets and external effects remain
institution/release obligations. Provisional next budgets and this bounded gate
do not approve official v6. Revised pilot P7/G7 also requires retirement of the
remaining temporary Waterline surface and final release qualification.

## Separate promotion — C2.6 complete

Qualification commit **`ac39fa987`** retained the Prisma default. This following
separate change promotes **`mongodb`** in core's default/absent selection and the
ten portal/archetype Compose forwards audited at that step; CI defaults to MongoDB and temporarily tests all
three backend values. Explicit `waterline` and `prisma` remain selectable until
the separate removal step. Dependencies, root/core locks, Dockerfile generation
and contract checks are unchanged. No field/namespace/behavior/index change.

[Promotion matrix](evidence/c2/promote/results.json) passes **all 26 commands**:
core **4,158 passing / 107 pending**, cache **20**, prerequisites **17/16**,
foundation and every M/R/Q/J1–J4 contract/readiness/unit/index suite, build/lint/
three typechecks and full clean packed **24.16.0 / 26.11.1** runtimes. Default
assertions and the packed driver query omit the cache override and assert the
actual MongoDB repository. [Configuration audit](evidence/c2/promote/configuration-audit.json)
parses CI, checks all ten forwards and verifies unchanged lock hashes. Repeated
TLS/SRV/TXT, lifecycle/drain/server restart and matching restore/prior-image
rollback pass again, recorded in [artifact manifest](evidence/c2/promote/artifact.json).

The complete current Dockerfile **test** image builds successfully as
**`redbox-c2:promote`**, immutable
**`sha256:cce6fc8a6144a6e2966af06b08dba6aa0e4688f9b6526d37a5d2d499b7ebcfbd`**.
The manifest records the exact production patch from qualification and both lock
hashes. Production core/companion imports pass. The HDD-bound build took about
6,110 seconds (root test dependency copy 2,296s); container provisioning is
separate from application startup, not an operational readiness sample.

[Fresh standard results](evidence/c2/promote/standard-results.json) pass on that
**Node 26.11.1** image, with outer cache overrides unset and no upload observer:
Mocha **418 passing / 10 pending / zero failures** (473s), Bruno general
**309/309 requests, 553/553 tests, 3/3 assertions** (262s), and default dev startup/
readiness (130s), lift at **117.10s**, all **34 scopes / 15 collections** ready
and four durable migrations. Mocha reports actual `cache backend=mongodb`.
Fresh owned mail/attachment/upload/database volumes and network-local fixture
mail alias isolate the stock runners; tests, limits and healthchecks are unchanged.

Failed attempts are retained: the first cold Keycloak dependency was unhealthy
before portal startup. A later initial Bruno run returned 413 for the intact
**21,884-byte** regular font (SHA-256
`425c0713a8176f92273d378599c7eac57de7fafabd4bd0ed457b70eb8f80d371`), below its
unchanged 2 MiB limit. A transparent diagnostic error observer then passed the
entire collection; it recorded only the expected variable-font rejection. The
final **unobserved, unmodified** fresh Bruno run also passed. The transient
upload cause is not established; no production fix, relaxed limit, assertion or
healthcheck change is claimed. Only the final plain run is accepted here.

**C2.6 complete at the promotion checkpoint.** The following separate C2.7
change removes Prisma, maintaining other exact pins and the explicit Waterline
next bridge.
P7/G7 remains open for final cache/model/selector retirement and formal release/
institution qualification. No topology conversion or G-TX approval is inferred.

## Separate Prisma removal — C2.7 complete

The following change removes the Prisma cache adapter, private Prisma tree and
config, contract generator/freshness commands and Docker/CI steps, and both core
Prisma dependencies. Historical comparisons and actual prior-image rollback
fixtures/results are frozen at qualification commit `ac39fa987`; useful current
raw, service, preview and Waterline/driver regressions remain live. The accepted
ORM reevaluation spike is retained only as evidence supporting ADR0003.

Explicit `prisma` now fails before acquiring resources, with the replacement
`mongodb` setting and both environment variable names. Cache uses the shared
foundation pool; cleanup invalidates its view while foundation drains/closes.
The expanded configuration audit found two PDF-hook Compose defaults omitted by
the promotion audit; this removal change corrects both, and verifies all twelve
portal/archetype/PDF forwards use MongoDB. Current next continues to permit
explicit Waterline. P7.1's Prisma maturity requirement is superseded, while final
bridge/model/selector retirement and official-v6 release/institution acceptance
remain open.

[Install ledger](evidence/c2/remove/install-results.json) records npm **11.20.0**
root/core lock maintenance on Node 26.11.1 and successful clean, strict CI-path
root/core installs inside an owned **Node 24.16.0** container. Root/core locks
remove **333 / 390** package entries with **zero additions or retained version,
resolution or integrity changes**. Seven/three metadata entries update the core
manifest and dev/optional reachability flags; all other exact manifest pins are
unchanged. Original key order is retained with semantic identity checked against
npm-generated JSON, avoiding unrelated formatting churn. A histogram diff
reports root **12 insertions / 4,840 deletions**, core **3 / 5,917**; the semantic
graph comparison remains authoritative for retained dependency identity.

[Removal matrix](evidence/c2/remove/results.json) passes **all 24 current
commands**: build, core **4,159 passing / 113 pending**, lint and three typechecks,
foundation **12**, current cache transition **14**, authenticated driver
prerequisites **17**, M/R/Q/J1–J4 contracts/readiness/unit regressions and all
**15** index scenarios. Clean packed **Node 24.16.0 / 26.11.1** consumers pass
in **233.62s / 288.92s**, including strict plain public types, Prisma artifact/
dependency absence, retired-selector failure before sockets, offline imports/
shims, production pruning and actual default-driver CRUD/raw/routing checks.
The first core run hit the unchanged 12-second cold source-import deadline after
clean installs; its unchanged retry passed in 102.24s. The failure remains
archived. Repeated live TLS/SRV/TXT, actual accepted-write drain/standalone
restart/readiness and matching restore plus explicit Waterline configuration
rollback/default-driver forward read all pass. Their exact commands, exits and
hashes are in the [removal artifact manifest](evidence/c2/remove/artifact.json).

The complete current Dockerfile **test** image builds as **`redbox-c2:remove`**,
immutable **`sha256:a548beebd26afabcc29a3ae2d89ece6a7d3e1dc9f69d3c7b5090b155c54d9a2c`**,
on **Node 26.11.1**. The full build takes **2,913 seconds**; its install/build/prune/copy/export timing is separate from
application startup. The manifest retains the SHA-256 of the reproducible production patch against
promotion `744517a55`, both lock hashes and the full build log hash. Production
core/companion imports pass. A read-only probe inside the actual image, with no
current application/dependency mount and no network, proves the MongoDB default,
absence of the Prisma directory/adapter/CLI/runtime, actionable retired-selector
failure and **zero sockets**. Clean `npm ci` succeeds through the actual Docker
root/core/production paths as well as the strict CI-equivalent paths above.
No hosted CircleCI run was triggered; no push was made.

[Fresh standard results](evidence/c2/remove/standard-results.json) pass on that
image with outer cache overrides unset and no diagnostic observer:

- Unmodified **`npm run test:mocha`**: **418 passing / 10 pending / zero failures**,
  **446s**, with the actual `cache backend=mongodb` assertion.
- Unmodified **`npm run test:bruno:general`**: **309/309 requests, 553/553 tests,
  3/3 assertions**, **284s**.
- Standard development app.js HTTP startup/readiness: **120s**, lift complete at
  **95.72s**, all **34 scopes / 15 collections** ready and **four** durable
  applied migrations.

Each project starts on new owned database/mail/attachment/upload volumes; cleanup
removes only its own resources. Stock runner commands, tests, limits and
healthchecks remain unchanged. The first current-image Mocha attempt stopped at
Keycloak's unchanged healthcheck before portal startup; its log hash, exit and failure excerpt are
retained, and the complete unchanged retry uses a new project/volumes. The
preserved earlier cold-import, Keycloak and unreproduced font-413 attempts remain
visible; acceptance uses the successful
unchanged runs, without claiming an established font failure cause or production
fix. Existing Solr-before-ready messages and timing-sensitive source import remain
separate release concerns as recorded by the pilot.

**C2.1–C2.7 complete; G-C2 PASS.** MongoDB is the next cache default and Prisma
is removed. Explicit Waterline remains a bounded next transition choice. Revised
P7.1 is superseded; P7.2–P7.6/G7 remain open for Waterline adapter/model/selector
retirement, final sole-driver artifacts and official-v6 release/institution
acceptance. Provisional next budgets/rollback do not approve official v6;
OPS-TX-01 remains undecided, supplied stacks remain standalone and G-TX is closed.


## Review rewrite and compact retention

The C2 history was replayed from `b83234da9` with qualification, promotion and
four separate Prisma-removal stages (runtime, tooling/CI, dependencies/locks,
documentation/evidence). [Rewrite checks](evidence/c2/rewrite-results.json)
record each stage's build, persistence typecheck, cache tests and the repeated
npm 11.20.0 lock generation. The generated graph and original generated hashes
match the accepted removal: 333/390 removals, no additions and no retained
version/resolved/integrity changes. The accepted lock bytes/key order are kept.

Raw transcripts, inspect output, source patches and individual latency samples
are excluded from every rewritten C2 commit. Per-directory `raw-artifacts.json`
files retain original SHA-256 hashes, byte/line counts, pass/fail counts and short
failure/diagnostic excerpts; structured command/duration/runtime/image/lock
ledgers remain. [Operation summaries](evidence/c2/operations-summary.json) and
the original gate assessment replace full latency arrays. Earlier ledger source
SHAs and image labels remain original campaign provenance; the rewrite ledger
maps them to the replayable source commits. Archive instructions use those new
commits. The reproducible source patch is identified by its original hash.

Final production source and packaging are byte-identical to accepted
`d6084a79b`. The requested comparison outside evidence and this page has eight
intentional exceptions: the new `c2_evidence.py` summary/audit helper;
`verify-c2.py`, `run-c2-standard.sh` and `run-c2-browser.sh` routing raw output
outside tracked evidence; `review-inventory.py` checking frozen P0 ownership and
the archived capture-runner hash after retirement; and the archive commit references in
`ARCHIVED-COMPARISONS.md`, programme `tasks.md` and the archived Prisma spike
`README.md`. These do not change application behavior or packaged runtime code.
No fresh Mocha/Bruno/dev-stack rerun is required for this rewrite; their original
accepted command results and hashes are preserved. No push is made.


[Tip revalidation](evidence/c2/rewrite-tip/results.json) records core build,
core/root lint, persistence/root/cache typechecks, `npm run test:core`, the
Prisma-free full-image offline probe, clean packed Node 24.16.0/26.11.1 consumers,
and evidence/inventory audits. The core suite passes **4,159 / 113 pending** on
its unchanged retry. Its first run has **4,158 / 113 pending / one failure** at
the existing 12-second cold source-import deadline; the hash and bounded failure
excerpt remain in the tip artifact manifest. No deadline/assertion changed.
The retired spike executables belong to the tooling stage; regrouped tooling,
dependency and documentation commits were each checked again. Final production
source and packaging remained unchanged throughout this metadata regrouping.
