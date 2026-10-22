# P5c J3 validation

Pre-change checkpoint `7c1906849b1dd3bdffe6930d9976202b1ccf6ac4`.
G-J3 **PASS for transaction-free `next`**. The separate promotion selects MongoDB; explicit Waterline rollback remains. J4 is independent.
G-TX stays closed; OPS-TX-01 is undecided. Only owned standalone fixtures are used.

The [loaded spike](evidence/p5c-j3/spike.txt) records actual models, raw
ObjectId identities, string brand/event references and ISO string lease/audit
timestamps, null/default/extension behavior, callbacks and safe-mode indexes.
No secondary indexes are created by model loading. Figshare's native result shape
is captured separately from Waterline model insertion defaults.

`SiemRepository` provides capture/replay, envelope/history lookup and paging,
ready-event polling, fenced claims/completion and ordered dead-letter retention.
All J3 service model/native consumers use this plain boundary. The baseline
borrows the actual loaded models and their configured managers/collections;
callbacks remain active. The unchanged legacy protocol prepares its indexes on
Waterline. Driver startup will instead inspect explicit deployment preparation.

The [pre-change built image manifest](evidence/p5c-j3/rollback-artifact.json)
retains the entire core runtime on the installed pruned qualification dependency
layer, with offline smoke proof and lock hashes. It is a qualification artifact,
not a published production image. No dependencies or locks changed.

The [paired standalone contract](evidence/p5c-j3/contract.txt) passes raw envelope
and history shapes, create/replay and reads in both directions, simultaneous
independent Waterline/driver claimers, token/expiry rejection across restart,
selector rollback/forward, callbacks/collection overrides, legacy recovery,
per-destination budgets, redaction, history and ordered retention. Applied writes
with failed acknowledgments are observed directly; an ambiguous claim sends
nothing and remains fenced until expiry. The actual pre-J3 image reads/writes the
same driver-produced rows and runs its original native claim protocol.

[Readiness/upgrade proof](evidence/p5c-j3/readiness.txt) covers missing indexes,
inspect-only startup, all eight scopes inspected before DDL, known duplicates
and conflicting definitions retained without modification, explicit ensure and
model-free driver operation. The shared fresh-volume script and archetype are
identical. [Live unit/receiver cases](evidence/p5c-j3/unit.txt): **73 passing**.
Three additional plain-boundary cases run in the core suite.

The [renewed operational comparison](evidence/p5c-j3/operations.json) meets the
fixed provisional limits: p95 0.640, throughput 1.566, RSS 0.706 and database
calls 0.862 relative to Waterline. All measured readiness samples are below
250ms, driver instances use one foundation client, and connections return to
the observer baseline after shutdown. The contract's delayed receiver proves
service draining waits for delivery acknowledgment and history before cleanup.

Broad and fresh-runner qualification is complete; the independent G-J3 gate
record and separate promotion are recorded below. Initial invalid fixture adapter/retry settings
and two stale bootstrap unit fakes are excluded from acceptance. A first stock
Mocha attempt stopped before app startup on prior root-owned attachment fixtures;
preparation now fixes ownership only in this worktree's test directory, leaving
the stock npm/Compose command unchanged. No development database is involved.

## Completed opt-in qualification

The [verification ledger](evidence/p5c-j3/verification.json) records the final
build, strict persistence/root types, **4,155 core cases with 106 existing pending**,
unchanged offline startup deadline and lazy-adapter assertion, cache contract,
lint, foundation, both cache bridge/driver suites, M/R/Q/J1/J2 contracts,
288 storage cases (38 existing pending), the real 14-case deployment/upgrade
command and clean packed runtime. Temporary consumer locks use npm 11.20.0;
Node 24.16.0 and 26.11.1 both pass offline and live qualification.

[Stock selector-matrix commands](evidence/p5c-j3/standard-runners.json) pass
14 SIEM Mocha cases on each backend and 309 requests / 553 tests on each backend
through Bruno general, using separate fresh projects/volumes and the shared init
script. No manual DDL or stock-runner changes are used. The separate wrapper
parse/preparation retries are excluded from acceptance and recorded explicitly.

The capture fallback now calls RecordsService.getMeta rather than acquiring a
Record model global. Its targeted ownership/privacy case and the full core suite
pass. Record storage remains on its current configured path. Both known and
ambiguous history-write failures after a saved destination acknowledgment retain
that acknowledgment across restart, so recovery does not send it again. Missing
auxiliary history after a known failed write is preserved as the legacy
non-atomic behavior; an applied history write with a failed acknowledgment is
observed directly.

The renewed fixed comparison now includes measured capture, fenced terminal
delivery, history insertion and retention as well as polling/counts. All original
limits pass without relaxation; the final standalone contract readiness is
165ms Waterline / 81ms MongoDB. Startup and all operational acceptance samples
run without concurrent build/Java-stack load. Earlier loaded samples are not
performance acceptance. The actual pre-change image remains retained.

**G-J3 PASS for transaction-free `next`, 2026-10-20.**
G-TX, G-STABLE/release, institution data/hooks and P10 owner qualifications remain
separate. At this J3 checkpoint, the qualified default changes only J3; J4 remains Waterline. Its subsequent independent disposition is in [P5d validation](p5d-j4-validation.md).

## Independent G-J3 gate and promotion

**PASS for transaction-free `next`**, qualified from `338482f3a` with the
separate selector change in [promotion.json](evidence/p5c-j3/promotion.json).
[Sanitized default results](evidence/p5c-j3/promotion.txt) record 96 stock Mocha
cases, 309/309 Bruno requests and 553/553 tests, normal development HTTP startup
and 31 ready index scopes, and all 14 deployment/upgrade cases, each on fresh
owned volumes without manual DDL. The stock SIEM test confirms the selected
MongoDB backend and loaded-manager bypass after readiness. Clean production
install/prune, offline imports/types/shims and live repositories pass again with
omitted selectors on Node 24.16.0 and 26.11.1, npm 11.20.0.

This accepts the bounded next fixture and provisional operations/rollback limits.
It does not pass the full-graph, stable release, institution deployment or owner
retirement gates. G-TX stays closed; U/V/B and atomic S remain blocked. Follow
[J3 operations](p5c-j3-operations.md) when draining or restoring an older image;
record storage remains owned by its current configured adapter.

Independent J3 promotion commit: `32e2c2fca`. J4 remains Waterline at this checkpoint.

Subsequent J4 promotion is independent: `6c0194dcb`; see [J4 validation](p5d-j4-validation.md). J3 was renewed by the J4 core, stock-default and mixed-worker checks.
