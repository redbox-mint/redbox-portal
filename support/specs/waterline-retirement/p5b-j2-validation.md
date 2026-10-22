# P5b J2 validation

Source baseline: `c2ceddb45` before J2 changes. G-J2 **PASS for transaction-free
`next`**, 2026-10-20. This separate promotion selects MongoDB for J2, following
J1's independent promotion. Both retain explicit Waterline rollback selectors.
G-TX remains closed. All fixtures use owned isolated
standalone containers/volumes; no development or institution database is used.

The [loaded physical spike](evidence/p5b-j2/spike.txt) captures all three models,
their raw documents, defaults, null/error behavior, callbacks and actual indexes.
All have ObjectId `_id` and ISO string audit times. Every lineage dimension and
run/chunk/event/record reference is a **string**. Runs default to running and
zero counters; chunks default to processing, attempt 1, false duplicate and zero
counters; events default to upsert/failed/false. Event createdAt is **required
caller input**, without automatic creation time; updatedAt remains automatic.
Optional JSON defaults to null and extension JSON remains schemaless. Safe-mode
model declarations do not create the 14 declared secondary indexes.

`HarvestRepositories` exposes runs/chunks/events operations, loaded Waterline
baseline, opt-in driver, lifecycle guards and inspect-only readiness. Two
atomic named run operations replace service-native pipelines while retaining
lastChunkAt/status/completion rules and deliberately leaving updatedAt untouched.
The original native ID factory and five-attempt fallback are adapter-local.
All direct core harvest model calls have moved; record enrichment now uses the
configured storage service's named harvest read, while record writes stay on
the existing RecordsService/storage path. Hashing, retries, checkpointing and
compensation remain service-owned. No multi-document transaction is introduced.

All 14 indexes have explicit scoped inspect/ensure, all-scope preflight before
DDL, shared fresh-volume preparation and the matching hook template. Unique
simple keys are run dimensions and chunk run/hash/attempt; no event uniqueness,
TTL or cascading retention is invented. Custom loaded mappings/defaults/columns/
validation/callbacks are refused by MongoDB with Waterline migration guidance.

The [pre-J2 image manifest](evidence/p5b-j2/rollback-artifact.json) records the
actual built source/lock/digest/checkpoint. Qualification command/results and the
independent gate decision follow below as evidence completes.

## Initial qualification

Core build and strict persistence typecheck PASS. The focused service and boundary
suite passes **31 cases**, preserving disabled/enabled ACL policy, canonical
hashing, bounded retries, checkpoint/compensation behavior and both native counter
paths. The [real standalone contract](evidence/p5b-j2/contract.txt) passes both
raw/read/write directions, simultaneous mixed counter/duplicate increments,
unique run dimensions and hash/attempt behavior, brand-scoped lineage, fresh
process restart, config rollback/forward, stale-handle fencing, loaded hook
refusal and ported behavior, known and applied-with-failed-ack writes, unsupported
BSON refusal, conflicting index refusal, and explicit retention. Adding J1 to
an already active J2 driver app opens no additional client. The actual pre-J2
image reads all three driver-written lineage shapes and writes a chunk status
that the new driver reads. P5b.1–P5b.4 are evidenced; G-J2 remains HOLD until
operations and standard-runner/packed qualification complete.

The renewed **32-case** service/boundary suite and **4,149-case full core pass**
(106 pending) include admission/drain ordering and the unchanged 12-second lazy
startup guard. The J2 contract now also distinguishes a rejected event insert
from an applied insert with failed acknowledgement; Waterline reads the latter
through checkpoint recovery. Public raw-row metadata/summary/snapshot types
explicitly include their observed JSON null defaults; service DTO normalization
is unchanged.

Both full API selector matrix rows pass **309 requests and 553 tests each**:
J1 Waterline/J2 MongoDB, then J1 MongoDB/J2 Waterline. The stock runner includes
the existing tracked/legacy harvest and run/detail/event endpoints. The dedicated
J2 Mocha cases are completing separately. No application/index preparation or
runner code is altered by dependency-only prewarming.

The stock MongoDB Mocha attempt exposed the integration bootstrap's old global
`migrate: 'drop'` override: Waterline dropped the freshly prepared composite/query
indexes before repository readiness. Per-model migration settings cannot prevent
that library-wide reset. The bootstrap now uses the normal `safe` policy; stock
Compose runners already isolate each run on fresh volumes. No runner command,
manual index preparation, application DDL or readiness relaxation is introduced.
The failed attempt remains in the retry ledger; both backends are repeated.

With safe bootstrap the MongoDB Mocha row passed readiness and exposed a
previously untested failed-record producer path: snapshots contained nested
`undefined` values that Waterline omits during JSON storage. The service now
returns its already-budgeted serialized snapshot as plain JSON. Adapter JSON
validation stays strict; snapshot size/truncation and persisted contents stay
compatible. The new service regression covers absent optional fields and nested
omission: **33 service/boundary cases pass**. A fresh MongoDB stock retry follows.

The stock Mocha fixture has **2 passing cases per backend** on new
projects/volumes, including actual MongoDB selection and loaded-model bypass,
tracked failure/duplicate lineage and the real storage enrichment seam. Safe
integration bootstrap preserves the shared fresh-volume indexes. Both complete
API matrix rows and every dedicated backend Mocha case have now passed. The
MongoDB row includes the failed snapshot producer correction; final default
proof renews both backends with that correction. Final
default/packed qualification and the independent promotion remain pending.

## G-J2 decision and separate promotion

**PASS for transaction-free `next`**, 2026-10-20, source checkpoint
`95a7cade5`. P5b.1–P5b.6 are evidenced. The separate
`progress` and `harvest` selectors, gate ledgers and pre-change images remain
independent. The committed implementation was opt-in before this promotion.

[Exact commands, exits and hashes](evidence/p5b-j2/promotion.json) and
[sanitized results](evidence/p5b-j2/promotion.txt) record the fresh default
qualification, including the real selected adapter and loaded-model bypass:

- `npm --prefix packages/redbox-core run build`: PASS.

- `npm --prefix packages/redbox-core run typecheck:persistence`: PASS.

- `node_modules/.bin/tsc --noEmit`: PASS.

- `npm run test:core`: 4151 passing; 106 existing pending; offline import 10924 ms (unchanged 12000 ms limit, no eager J1/J2 adapters).

- `npm run check:cache-contract`: PASS.

- `npm run lint`: PASS.

- `npm --prefix packages/redbox-core run test:persistence-indexes`: 13 deployment/upgrade cases; omitted-selector scopes 23.

- `bash packages/redbox-core/test/fixtures/waterline-retirement/run-jobs-package.sh`: PASS clean prod install/prune; offline types/import/shims and live repositories on Node 24.16.0 + 26.11.1; npm 11.20.0.

- `npm run test:mocha:mount`: 81 passing; 1 existing pending.

- `npm run test:bruno:general:mount`: 309/309 requests; 553/553 tests.

- `bash packages/redbox-core/test/fixtures/waterline-retirement/run-persistence-dev.sh`: HTTP startup and 23 prepared index scopes ready; no manual DDL.

This checkpoint tests both omitted selectors as MongoDB after J1's promotion.
The root default, all ten deployment/archetype selector locations and direct-lift
test expectations agree. Maintenance now prepares 23 secondary-index scopes
across 12 collections, including all 14 J2 indexes; startup stays inspect-only.
The 33-case harvest service/boundary proof and full stock suites cover failed
JSON snapshots, real storage enrichment, lineage and duplicate counters.
No required multi-document unit was discovered or introduced.

Raw/bidirectional/mixed/restart/config and actual prior-image rollback, hooks,
known and ambiguous write failures, drain-before-close and all fixed provisional
operation limits pass; see the independent contract, operations and retry ledgers.
Unsuccessful attempts are excluded from acceptance. Foundation/cache/M/R/Q and
storage regression results remain in verification.json. Dependencies/locks are
unchanged from the group's baseline; temporary consumer locks use npm 11.20.0.

This accepts the bounded `next` fixture. Private institution data/hooks, published
production artifacts, release security/support/capacity/failover and P10 owner
qualification remain separate work. G-TX stays closed and OPS-TX-01 stays
undecided; G-STABLE and G-RETIRE remain separate gates. Workers and external
effects remain independently durable;
follow this group's operations guide and the P5c/P5d handoff before rollback.

## Recorded promotion and reproduction

Independent promotion commit: `7e4fc3d6e`. The final runtime
checkpoint `7e4fc3d6e` has both defaults on MongoDB; the other subgroup's
promotion remains independently recorded in its validation ledger.

```bash
bash packages/redbox-core/test/fixtures/waterline-retirement/run-jobs.sh harvest-contract
J_GROUP=harvest bash packages/redbox-core/test/fixtures/waterline-retirement/run-jobs.sh operations
```

These specialized fixtures use owned standalone containers, both loaded adapters
and the retained pre-change image. The promotion ledger records stock default
runner commands, selected test paths, paired backend API runs and clean-package
proof. [Final source/dependency/cleanup audit](evidence/p5b-j2/final-audit.json)
confirms task resources are gone, runner-mutated files are restored and both
rollback images remain retained. All runtime commits end in the required
Co-Authored-By trailer. No push or development database access was performed.
