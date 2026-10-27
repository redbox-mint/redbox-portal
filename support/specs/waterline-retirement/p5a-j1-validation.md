# P5a J1 validation

Source baseline: `0aa801ee6` on `t3/waterline-retirement`. G-J1 **PASS for
transaction-free `next`**, 2026-10-20. This separate promotion selects MongoDB
for J1; J2 stays Waterline at this checkpoint. G-TX remains closed and all
stacks remain standalone. All live fixtures create their own
containers/volumes and remove only those resources.

The [loaded physical spike](evidence/p5a-j1/spike.txt) covers both models plus
the following J2 group. AsynchProgress has ObjectId `_id` and branding; user,
record and task type references remain strings. WorkspaceAsync has ObjectId
`_id` and string recordType/user/service/method. Audit timestamps are ISO strings;
service start/finish timestamps retain the existing local formats. Optional
strings default to empty, counters to zero, JSON to null. Required values and
null string/number patches fail. Unknown JSON extension fields remain supported.
Neither model has a secondary index. No uniqueness or TTL/automatic cleanup is
introduced. Progress and workspace writes are independent of job/storage writes.

`ProgressRepositories` exposes `progress` lifecycle/list/revise/remove and
`workspaces` register/status/list/remove operations. Waterline borrows actual
loaded models/callbacks. MongoDB borrows the application pool and performs
inspect-only mapping/server/collation readiness before services; incompatible
hooks fail with Waterline migration guidance. BSON remains private. AsynchsService,
WorkspaceAsyncService and the AsynchProgress named-query target use J1's selector.
Controller/Observable service signatures and replay-on-subscription semantics
remain. `WorkspaceAsyncService.drain()` stops future loop dispatches and waits
for accepted jobs and their status/result writes; call it before persistence
cleanup while repositories can still accept completion writes.

The pre-J1 image is [recorded with source/locks/digest](evidence/p5a-j1/rollback-artifact.json).
Qualification and final command results are recorded below as they complete.

## Initial implementation evidence

Build and strict persistence typecheck PASS. Three boundary cases PASS. The
[standalone contract](evidence/p5a-j1/contract.txt) passes raw shapes, service
Observables, both write/read directions, simultaneous mixed independent processes,
fresh-process restart, selector rollback/forward, stale-handle fencing, cleanup,
loaded callback/collection overrides and a ported hook, tenant-scoped named query,
rejected writes and applied writes with failed acknowledgements. The actual
pre-J1 image reads driver-written references and writes rows the driver reads.
The workspace drain waits for a delayed worker's final status/result write.
P5a.1–P5a.4 are evidenced; operations and standard-runner qualification remain.

The stock `npm run test:mocha:mount` runner passes **2 cases on Waterline and
2 on MongoDB**, on separate new Compose projects/fresh MongoDB volumes. No
manual index preparation is used. The dependency-only prewarm retry is recorded
because the first cold run exceeded Keycloak health startup before the app ran.
The latest unit fixtures exercise the repository seam rather than uninitialized
model globals: **15 focused J1 cases pass**, including lazy/replayed Observable
results, failure propagation, delayed worker writes, Error JSON and shutdown
ordering. The complete core suite is renewed after J2 assembly; its first run
exposed the old unit fixtures and hit the unchanged startup deadline while
other builds/dependency startup were active. That failed attempt is not gate
evidence and the deadline is not increased.

The final progress filter boundary accepts the existing comparison/text dialect,
refuses caller-supplied native regex/exists operators, and retains lowercase sort
directions. Four focused boundary cases and the renewed loaded-Waterline/driver
contract pass, including ordering and refusal on both adapters. Renewed paired
operations include the validation cost and pass all limits; see operations.json.
Both full API selector matrix rows pass 309 requests and 553 tests each, on
new Compose projects/volumes with dependency-only prewarming and stock runners.

## G-J1 decision and separate promotion

**PASS for transaction-free `next`**, 2026-10-20, source checkpoint
`b68846eeb`. P5a.1–P5a.6 are evidenced. The separate
`progress` and `harvest` selectors, gate ledgers and pre-change images remain
independent. The committed implementation was opt-in before this promotion.

[Exact commands, exits and hashes](evidence/p5a-j1/promotion.json) and
[sanitized results](evidence/p5a-j1/promotion.txt) record the fresh default
qualification, including the real selected adapter and loaded-model bypass:

- `npm --prefix packages/redbox-core run build`: PASS.

- `npm --prefix packages/redbox-core run typecheck:persistence`: PASS.

- `node_modules/.bin/tsc --noEmit`: PASS.

- `npm run test:core`: 4151 passing; 106 existing pending; offline import 11075 ms (unchanged 12000 ms limit, no eager J1/J2 adapters).

- `npm run check:cache-contract`: PASS.

- `npm run lint`: PASS.

- `npm --prefix packages/redbox-core run test:persistence-indexes`: 13 deployment/upgrade cases; omitted-selector scopes 9.

- `bash packages/redbox-core/test/fixtures/waterline-retirement/run-jobs-package.sh`: PASS clean prod install/prune; offline types/import/shims and live repositories on Node 24.16.0 + 26.11.1; npm 11.20.0.

- `npm run test:mocha:mount`: 81 passing; 1 existing pending.

- `npm run test:bruno:general:mount`: 309/309 requests; 553/553 tests.

- `bash packages/redbox-core/test/fixtures/waterline-retirement/run-persistence-dev.sh`: HTTP startup and 9 prepared index scopes ready; no manual DDL.

This checkpoint tests omitted selectors with J1 MongoDB and J2 Waterline.
The root default, all ten deployment/archetype selector locations and direct-lift
test expectations agree. J1 adds no secondary index; maintenance still prepares
nine secondary-index scopes while checking J1 mapping/server/collation readiness.
The latest full core includes both the filter-dialect regression and failed
harvest snapshot producer correction, with the unchanged import deadline.

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

Independent promotion commit: `95a7cade5`. The final runtime
checkpoint `7e4fc3d6e` has both defaults on MongoDB; the other subgroup's
promotion remains independently recorded in its validation ledger.

```bash
bash packages/redbox-core/test/fixtures/waterline-retirement/run-jobs.sh progress-contract
J_GROUP=progress bash packages/redbox-core/test/fixtures/waterline-retirement/run-jobs.sh operations
```

These specialized fixtures use owned standalone containers, both loaded adapters
and the retained pre-change image. The promotion ledger records stock default
runner commands, selected test paths, paired backend API runs and clean-package
proof. [Final source/dependency/cleanup audit](evidence/p5a-j1/final-audit.json)
confirms task resources are gone, runner-mutated files are restored and both
rollback images remain retained. All runtime commits end in the required
Co-Authored-By trailer. No push or development database access was performed.
