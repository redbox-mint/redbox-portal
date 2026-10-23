# P6 institution migration and recovery validation

P6.1–P6.5 and G6 pass for the representative, synthetic institution path below.
This is migration/recovery evidence for the Prisma-default **next** build, not
official v6 release qualification. The stable Prisma tooling/MongoDB-runtime
gate and final sole-backend release checks remain P7 requirements.

## Changes and published operator guidance

Input is `16d53c0e0230b299cdbf33e59cd0e17cda598ecf`, including the separate
Prisma-default promotion `210adbdc4ddd4b1100844469db8ba19d2747bc57`.

- `318cd6ef8178ba1ac5087dc16f6d4f02291a33df` publishes
  [architecture/configuration/builds](../../wiki/Cache-Persistence.md) and
  [hook migration](../../wiki/Cache-Persistence-Hook-Migration.md), linked from
  Home, Architecture, Configuration, Development, Installation, Core Types,
  Services and Loader. The checked-in core page is `Redbox-Core-Types.md`;
  the router's `redbox-core.md` filename is absent.
- `91e6684d42bf81563d0fc4472ace8f0051a6fef7` publishes
  [institution migration/readiness](../../wiki/Cache-Persistence-Migration.md),
  [backups/recovery](../../wiki/Cache-Persistence-Recovery.md), and links the
  [development rollback runbook](../../wiki/Cache-Persistence-Rollback.md).
  Its only production-code change is prerequisite error guidance in
  `packages/redbox-core/src/persistence/cache/preflight.ts`.
- This evidence/checklist commit archives the rehearsal inputs/results and
  corrects the recovery guide's upstream reference to the version-specific
  MongoDB 8.0 downgrade consideration. No dependency manifest, lock, adapter,
  contract or service behavior changes in P6.

The guides distinguish current next's temporary explicit Waterline selection
from official v6's Prisma-only contract. Official instructions require removing
**all** temporary selectors, even explicit `prisma`, from files, hooks,
environment and Compose forwarding. P7 implements removal/rejection; P6 does
not pretend those final behaviors already exist.

The public four-operation repository and both service constructor seams are
documented with direct-query, callback-wrapper and versioned-value-codec examples.
Custom collection/attribute/ID/collation mappings require a separate institution
plan; no implicit aliases, callbacks or BSON conversions are promised.

## Environment and reproduction

Date: **2026-10-19**. [Exact environment](evidence/p6/environment.json),
[archived harness and instructions](evidence/p6/harness/README.md),
[complete successful output](evidence/p6/rehearsal.txt).

Current compiled core is the `91e6684d4` implementation: Node **24.18.0**,
TypeScript **5.9.3**, root/core Sails **1.5.17 / 1.5.18**, Waterline **0.15.2**,
sails-mongo **2.1.2**, driver **7.7.0**, Prisma CLI **8.0.0-rc.23** and MongoDB
runtime **8.0.0-rc.18**. Both Prisma components remain prerelease. Contract
SHA-256 is `1cca2cc02a0c6a833ed835618cb4e8f49b4bc36224c1e91fa55be37ae89aa993`.
Host npm **12.0.2** runs build scripts only; no lock maintenance occurs.
Historical clean installs use **npm 11.20.0** and original exact locks.

The old application source is exactly
`0cfbd62b93260b63ad907d7c01ed9f33a2af619e`, extracted by `git archive` and
compiled in its own Docker build stage with Node **26.11.1**. Both original
root/core lock SHA-256 hashes are asserted before seed, as is absence of the new
persistence API. No current core/dependencies are mounted into the old process.
The worker loads the actual original Sails/Waterline model graph and applies a
synthetic callback-only CacheEntry override, then later reads the recovered data
with that same old graph. This is an ORM-loaded application/service rehearsal;
it does not rerun full portal bootstrap, hook discovery, HTTP or browser tests.
P5 supplies those broader transition/default regression results.

The final command exits **zero**:

```bash
bash support/specs/prisma-cache-persistence/evidence/p6/harness/run.sh
```

Project `redbox-cache-p6-rehearsal-9qpxct` owns three separate volumes/servers.
Source starts at standalone **7.0.43 / FCV 7.0**, uses the same owned volume on
**8.0.34**, and explicitly advances FCV to **8.0**. Restore targets are separate
empty **7.0.43** and **8.0.34** volumes. Images are pinned by digest in the
harness/environment record. Only ephemeral loopback ports and guarded synthetic
databases `redbox_cache_p6`, `redbox_storage_p6`, `redbox_sessions_p6` are used.

## Existing data, index remediation and migrated hook

The original Waterline application creates **11 cache documents**, including
objects, arrays, falsy primitives, null/missing data, unknown legacy fields,
duplicate names and a BSON Date value. Its CacheEntry `beforeCreate` callback
runs **9 times**, labeling `institution:` object values. Additional fixtures
include a user/role, a session, GridFS binary bytes, a native storage record and
a durable Agenda job. All are synthetic; the job is scheduled and the session
expires in 2100 so neither executes/expires during the quiesced dump.

1. Source starts **without** an init-index script. Only after data exists does
   the upgrade overlay mount `fresh-index.js` in `docker-entrypoint-initdb.d`.
   The existing volume skips initialization: duplicate groups remain **1** and
   the unique name index remains **missing**. This reproduces the existing-dev-
   volume problem, without opening or modifying any actual development volume.
2. Actual `initializeCachePersistence` and `ensureCachePersistenceIndex` reject
   duplicates. Canonical BSON before/after the failures is identical.
3. Synthetic data-owner decision **D1** identifies only owner B's duplicate by
   `_id` and renames it to `duplicate:owner-b`. It represents a distinct key;
   no record is discarded. Startup then rejects `missing-index` and its actual
   error points to the copyable
   [existing-volume commands](../../wiki/Cache-Persistence-Migration.md#existing-development-volumes),
   explicitly explaining that init scripts do not rerun on existing volumes.
4. Explicit exported `ensureCachePersistenceIndex(app)` creates the scoped
   unique name index. A second invocation leaves the indexes unchanged. Startup
   then selects `PrismaCacheEntryRepository` **without a selector**. Read-only
   inspection reports `{ mongoMajor: 8, duplicateNameGroups: 0, index: 'ready' }`.
   The wiki also publishes direct Mongo shell inspection/scoped DDL for an
   application that cannot reach bootstrap. No automatic cleanup is added.
5. Reading the legacy BSON Date through Prisma rejects and leaves it unchanged.
   Synthetic decision **D2** updates only that fixture's `data` by `_id` to
   `{ codec: 'institution-observation-v1', observedAt: '2026-10-01T00:00:00.000Z' }`.
   This explicit codec then reads successfully. It is a fixture-specific approved
   conversion, not generic migration/cleanup tooling.
6. Raw assertions retain **11/11 original IDs**; D1/D2 change only their named
   fields, and the other **9 documents** retain canonical BSON exactly. There
   is no flush, bulk rewrite, automatic duplicate winner or silent conversion.
7. The migrated wrapper is injected into both CacheService and BrandingService
   constructors, matching the public hook example. CacheService's completed
   write carries the institution effect; a separate process reads it after
   graceful shutdown. Preview create/fetch/delete succeeds and a consumed token
   rejects. The retained old callback records **0 invocations** under Prisma,
   proving that wrapper behavior, rather than Waterline callback execution,
   supplies the migrated effect. Falsy/null/missing values and unknown fields
   are checked directly, including physical ObjectId/string timestamps.

The model override and wrapper are deliberately small representative institution
extensions. Arbitrary private hooks, nonstandard collections/IDs/collations and
business invariants outside this seam still need their own migration review.

## Engine upgrade and shared clients

The 7.0 source is shut down cleanly before 8.0 starts on its owned volume.
The [before](evidence/p6/before7.json) and
[upgraded](evidence/p6/upgraded8.json) namespace snapshots match exactly for
documents, collection options and logical index definitions. Old application
reads pass on 8.0 while FCV remains **7.0**. Only then does the rehearsal issue
`setFeatureCompatibilityVersion: '8.0', confirm: true` and verify **8.0**.
Application startup checks binary major; the operator runbook separately requires
FCV verification, supported intermediate upgrades and a burn-in decision.

Shared-client assertions pass on original/restored 7.0, upgraded 8.0 and restored
post-cutover 8.0:

- Waterline reads existing users/roles; current readiness creates/updates/deletes
  a synthetic role.
- Two actual connect-mongo stores read existing session state and perform
  set/get/touch/destroy; stores close explicitly.
- The actual GridFSDriver reads pre-existing binary bytes and writes/reads/
  replaces/deletes a synthetic object without altering the existing fixture.
- The native storage service reads existing data, creates a new synthetic record,
  updates with revision precondition and removes with the next revision.
  Fresh probe IDs respect the durable identity ledger on the restored deployment.
- The actual Agenda backend retains its original durable job, executes a separate
  synthetic job, and closes its worker/backend.

The successful source and recovered readiness snapshots each observe **9 current
server connections, 0 rejected**, including the observer and remaining Waterline
connections at that point. This is a small standalone fixture, not a production
connection/memory/startup budget. P5's bounded operational measurements still
apply; institutions must verify their real pools and instance counts. Authentication,
TLS/SRV, replica sets/sharding, external assets and private drivers need separate
qualification. The independent prerequisite suite below uses authentication.

## Independent backup/restoration rehearsals

All worker processes exit and writers are quiesced before each **full** logical
dump; no cache write is accepted merely because `set()` returned. Synthetic
fixtures have no TTL deletion in this window. The backup includes all three
application/storage/session databases, not just the cache collection.

| Checkpoint | Restore target/tools | Result |
| --- | --- | --- |
| Pre-upgrade 7.0 / FCV 7.0 | Separate empty 7.0.43; Database Tools 100.18.0 | 18 documents, 9 namespaces, 0 failures; integer elapsed seconds 0 (below timer resolution). |
| Post-cutover 8.0 / FCV 8.0 | Separate empty 8.0.34; Database Tools 100.19.1 | 21 documents, 10 namespaces, 0 failures; integer elapsed seconds 1. |

[Archive hashes/sizes and timing](evidence/p6/backups.json) are recorded; tiny
fixture timings are not a recovery SLA. Archives remain in ignored temporary
storage, not source control. Every namespace's canonical BSON data hash, logical
index hash and collection-option hash matches its checkpoint:
[before7](evidence/p6/before7.json) = [restored7](evidence/p6/restored7.json),
[after8](evidence/p6/after8.json) = [restored8](evidence/p6/restored8.json).
Index enumeration/metadata field order is normalized, while compound key order
and document BSON field order are retained.

The original app reads the pre-upgrade restored database. The recovered
post-cutover deployment reads the completed cache value in a new process, then
passes Prisma-default hook/cache/preview/shared-client readiness again. The
pre-upgrade checkpoint deliberately retains duplicates/missing index; restoring
it does not make it Prisma-ready. No 8.0 data files or dump are sent to 7.0.

This independently proves recovery to each **matching-engine checkpoint**, not
engine downgrade or in-place v5 rollback. Current-next backend/code rollback on
unchanged MongoDB 8 is separately qualified by P5. Official v6 instructions use
a known-good qualified v6 artifact or isolated verified restoration; no official
v6 artifact exists in P6, so final artifact qualification remains P7.

## Focused verification and investigations

- `npm run check:cache-contract` followed by
  `npm --prefix packages/redbox-core run build`: pass;
  [build output](evidence/p6/build.txt). Existing module-type and optional Prisma
  agent-skills notices are unchanged; no module conversion/skill installation.
- `P3_SKIP_BUILD=true bash packages/redbox-core/test/fixtures/cache-persistence/run-prisma.sh`:
  **13 passing (3 seconds)**, exit zero on its own authenticated MongoDB 8.0.34.
  [Final output](evidence/p6/prerequisites-final.txt). Missing/conflicting index,
  duplicates, safe failure handling and lifecycle checks remain intact. Logged
  injected original-startup errors are expected assertions.
- Scoped persistence TypeScript, strict NodeNext compilation of the public hook
  examples, changed source oxlint/Prettier, worker/bash syntax and compiled
  repository/service/shim import smoke pass. The import smoke observes **zero
  socket attempts**. [Static output](evidence/p6/static.txt).
- Compose rendering, new documentation links, exact pins and absence of
  manifest/lock changes pass the [documentation audit](evidence/p6/documentation-audit.txt).
  P5's full core/API/browser/deployment evidence is retained; message-only P6
  production changes do not claim a fresh full-portal qualification.

Investigations are not counted as successful rehearsals:

- Initial old-image multi-stage copies/layer export were interrupted for disk
  contention after compilation. The accepted run instead uses the same original
  lock graph in a cache-only build stage; no application image is exported/pushed.
- An initial non-PTY shell terminated during preparation; its trap removed the
  project. Subsequent executions used a persistent PTY.
- Early harness loads omitted the storage datastore/model graph, then keyed
  RBReport by registration name instead of actual identity `report`. Loading the
  complete real model graph by declared identity fixes both harness errors.
- An early restore comparison treated index enumeration order as significant;
  normalized logical definitions match, preserving compound-key order.
- A source-readiness attempt omitted the actual Record/DeletedRecord globals
  that the native storage service evaluates; the harness now exposes those two
  loaded models while keeping unrelated globals disabled.
- The next attempt completed source readiness but stayed alive on Agenda's
  five-minute half-lock-lifetime monitor delay after shutdown. Inspector showed
  a single Timeout and no database sockets. The synthetic instant job now has a
  one-second lock lifetime; no library/production setting was changed.
- A subsequent restore passed all snapshot comparisons, then correctly refused
  recreation of the removed source probe ID. Storage retains its identity ledger.
  The final run uses fresh probe IDs on each deployment, preserving that ledger.
- An early prerequisite run under overlapping build load hit Waterline's existing
  **500 ms server-selection timeout** before assertions (0 passing, 2 setup/
  teardown failures). Its child/container were stopped/removed. The unchanged
  clean rerun passes all 13 tests; no timeout/assertion was relaxed.
  [Initial failure](evidence/p6/prerequisites-initial.txt).

## G6 decision, cleanup and P7 handoff

**G6 passes for this bounded institution migration/recovery path.** Published
instructions cover versions/FCV, shared clients, hook review, explicit existing-
volume index preparation, targeted data decisions, readiness, backup restoration
and official-v6 configuration removal/recovery. Real old data/model callbacks,
new repository composition and both independent restores pass without a flush,
bulk rewrite or silent conversion. This does not grant G7 or certify a private
institution deployment without its own rehearsed plan.

Every attempt uses a unique task-owned Compose project and EXIT cleanup. Final
output records removal of the accepted project's three containers/volumes/network;
the final resource inventory is in [cleanup](evidence/p6/cleanup.txt). No global
Docker prune is used. Existing development containers/data, including
`development-mongodb-1`, are never targets of rehearsal/database/cleanup commands.

P7 must preserve the following constraints:

1. Requalify supported **stable CLI and MongoDB runtime**, pin exact replacements
   with npm 11.20.0 lock maintenance, and rerun affected contract/package/runtime
   checks. Current RC evidence cannot satisfy official v6.
2. Remove the Waterline cache adapter and temporary selectors/Compose forwarding;
   reject stale configuration even when it explicitly says `prisma`. Retire
   transition-only cache model/shim surfaces while retaining Waterline elsewhere.
3. **Inspect/ensure and datastore resolution currently require a loaded CacheEntry
   model.** Adapt those operations before retiring that model, and recheck the
   published existing-volume commands/errors against final startup/configuration.
4. Repeat final core, Docker Mocha, API/browser, clean package and deployment
   qualification with the sole-backend stable v6 artifact; verify the runbooks
   against its actual behavior. P6 recovery uses next because v6 does not exist.
5. Keep P5's pre-existing source-module-loading 12-second timeout and Solr-before-
   ready bootstrap indexing errors visible; P6 neither fixes nor requalifies them.
   Deferred TTL/falsy behavior, void best-effort writes/races, notification reset
   and non-atomic preview read/delete also remain unchanged.
6. Retain bounded evidence and explicit institution limits: custom mappings/IDs,
   richer values/codecs, private hooks, production security/topologies and external
   asset recovery need their own validation. No engine downgrade/v5 rollback
   promise follows from G6.
