# P5d J4 validation

G-J4 **PASS for bounded transaction-free `next`**. MongoDB-default candidate
qualification is complete; the default is committed as an independent promotion
unit: `6c0194dcb`. Explicit Waterline rollback remains. G-J3 is independent (`32e2c2fca`).
G-TX remains closed, OPS-TX-01 is undecided, and supplied stacks stay standalone.
Figshare vocabulary and record storage remain with their current owners/paths.

Pre-change runtime checkpoint: `32e2c2fca`; the subsequent `58e345e54` changes
only J3 documentation. The [retained built image](evidence/p5d-j4/rollback-artifact.json)
contains the full pre-J4 core runtime on the installed pruned qualification layer.
It is a rollback qualification artifact, not a published production image.
Dependencies and locks are unchanged. Baseline `2ecb7062a`, opt-in adapter
`645e74f04`, and qualification `7ef6087e2` precede the separate default promotion.

`FigshareSyncRepository`, `initializeFigsharePersistence` and
`getFigshareSyncRepository` provide named durable source, revision replacement,
lease, dispatch and administrative binding operations. All worker, wake, status
and administrative consumers use this plain boundary. Driver/BSON handles stay
inside adapters. Waterline uses the actual loaded model's datastore and fixed
legacy `figsharesync` collection, bypassing model create/update callbacks and
preparing its legacy indexes on first use. MongoDB uses the shared foundation
pool, requires qualified mappings and inspects readiness before publication.

| Evidence | Result |
| --- | --- |
| [Loaded spike](evidence/p5d-j4/spike.txt), [baseline](evidence/p5d-j4/baseline.txt) | ObjectId identity; omitted optional fields and Waterline insertion timestamps/defaults; numeric millisecond leases; original partial/full uniqueness and revision/receipt mappings. |
| [Shared contract](evidence/p5d-j4/contract.txt) | Both write/read directions; raw full replacement removes omitted fields and preserves `_id`/receipts; simultaneous mixed CAS and claimers; expired/stale owners across process restart and selector rollback; dispatch cooldowns, generations, actual pre-J4 image read/write; loaded callback/table/datastore overrides; unsupported BSON refusal without rewrite. |
| [Readiness/upgrade](evidence/p5d-j4/readiness.txt) | All three scopes reviewed before DDL; full OID and scalar partial duplicate audits; null/missing exclusions; partial-eligible array refusal; conflicts retained; model-free driver; explicit preparation. Shared fresh script and hook template match. |
| [Live worker/HTTP suite](evidence/p5d-j4/unit.txt) | **56 passing per backend**, including remote ambiguity, receipts, generations, queue loss, administrative recovery, superseded saves and a held HTTP worker draining through its final checkpoint/release. |
| [Stock selector matrix](evidence/p5d-j4/standard-runners.json) | Mocha **2 passing per backend**, actual owner and manager bypass verified; Bruno general **309 requests / 553 tests / 3 assertions per backend**, each with fresh owned volumes. |
| [Broad verification](evidence/p5d-j4/verification.json) | Build, strict persistence/root types, lint, cache contract, foundation/cache/M/R/Q/J1/J2 suites, 288 storage cases (38 existing pending), and 15 deployment/upgrade cases. [J3 contract renewed](evidence/p5d-j4/siem-regression.txt). |
| [Default qualification](evidence/p5d-j4/promotion.json) | Core **4,158 passing / 107 pending**, unchanged 12-second offline check and lazy-adapter assertions; 98 fresh stock Mocha cases, default Bruno 309/553, development HTTP startup and 34 ready index scopes across 15 collections. |
| [Clean packed default](evidence/p5d-j4/packed-default-artifact.json) | Selectors omitted; offline types/shims/no sockets plus live replacement/lease operations on Node **24.16.0 and 26.11.1**. Temporary lock/install/prune uses asserted npm **11.20.0**. |

The source-ack injection executes the real import/CAS path and returns
`matchedCount: 1` / `modifiedCount: 1` without applying the replacement. Readback
still sees generation zero and withholds acknowledgment on both adapters.
Real Mongo failpoints separately prove known rejection and applied writes with
failed acknowledgments. Restart/replay retains one imported generation; a lost
storage acknowledgment may leave pending false; an older acknowledgment cannot
clear a newer generation. Import verifies brand, imported generation and per-kind
source work before generation-conditional storage acknowledgment. Record storage
retains its existing implementation. Unmatched CAS retries are bounded at 30;
ambiguous native errors are sanitized and never automatically retried by the
repository. Competing real processes and the bounded retry unit cases pass.

The [full operational comparison](evidence/p5d-j4/operations.json) uses 20 × 15KB
states, 100 warmups and 1,000 operations in three alternating pairs. The mix covers
reads, receipt/checkpoint replacements, requests, due/dispatch claims,
claim/renew/assert/release, and source-storage intent writes followed by actual
worker import/readback/conditional acknowledgment. Ten source rows are checked
acknowledged with matching durable generations; payload/receipt fields remain
unchanged. Ratios are the ratios of three backend sample means.

| Metric | MongoDB / Waterline | Fixed provisional limit |
| --- | ---: | ---: |
| p95 | 1.0726 | <= 1.20 |
| Throughput | 0.9639 | >= 0.90 |
| RSS | 1.0066 | <= 1.10 |
| Database calls | 1.0000 | <= 1.25 |

Every readiness sample is below 250ms (maximum 85.49ms), driver owners use
one shared foundation client, and connections return to the observer baseline
of two. Shared-pool reuse with J1 passes. Draining refuses new jobs and waits for
accepted HTTP/storage work before foundation cleanup.

The 107 core pending cases include 106 prior cases and the additional live drain
case, exercised in both real-Mongo worker runs. Default stock Mocha's one pending
case is the existing unmigrated legacy embargoed form. No new live case is hidden
by these optional-runner skips.

Excluded attempts remain explicit: the [loaded-host timing failure](evidence/p5d-j4/operations-loaded-host.txt)
overlapped compiler/stack startup and is superseded by isolated measurement.
The earlier passing [state-only workload](evidence/p5d-j4/operations-state-only.json)
is retained; the full workload above adds source acknowledgment and receipt/
dispatch costs. Initial fixture syntax, missing export, invalid sparse conflict,
concurrent dist-rebuild and stale J3 default-assertion failures were corrected
before accepted runs. The [default Bruno infrastructure retry](evidence/p5d-j4/fresh-runner-retries.txt)
stopped before app startup on an isolated Mongo listener bind failure; a new
fresh project passes the unchanged runner. No development MongoDB data was used.

[Operations and rollback](p5d-j4-operations.md) cover explicit index preparation,
selectors, hooks, draining, uncertain remote effects and prior-image recovery.
P10 still owns transaction-free record/attachment/schema repositories, revisions/
incarnations/tombstones, backfills, staged binary coordination and remaining
Agenda/history, session/connect-mongo, GridFS and legacy-logo owners. U/V/B and
atomic S remain G-TX gated; P11/P12 retirement and stable/release qualification
are separate. J4 does not claim cross-system transactions or exactly-once effects.
