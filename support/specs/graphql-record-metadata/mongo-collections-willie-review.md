# Mongo collection Willie review dispositions

This follow-up starts at `42ada22ebbbe3503b196c1972b05751791c6bc97` on
`t3/graphql-mongo-collections`, in the existing checkout
`/home/andrew/.t3/worktrees/redbox-portal/t3-f9cf0af7-e8cf14b92f8bbc94`.
Only this checkout was changed. No parent checkout or `.env` was edited;
no children, push, PR, or AI commit trailers were used.

## Review result and CLI caveat

The installed `willie-review` completed its local diff review with **0 high,
2 medium, 0 low, score 3/5**. Both medium findings were independently verified
against the implementation and are classified **FIX**.

The completed review is
[Willie review local/t3-f9cf0af7-e8cf14b92f8bbc94 PR #0 10d6c1](t3-thread://v2/d7950a7a-ecf7-4d7a-9560-50508843bbe1/thread:project:fff2d58c-261a-4d9f-9c7e-09ae27429850:caa5e8e3-67c4-4d99-a549-be70283386e1),
thread
`thread:project:fff2d58c-261a-4d9f-9c7e-09ae27429850:caa5e8e3-67c4-4d99-a549-be70283386e1`.
The CLI nevertheless exited **2** with final error
`T3 Code did not record the expected diff attachment on the review thread`.
Its result was recovered via `t3_thread_read`; this follow-up also read that
completed result directly. The attachment recording failed; the review itself completed. Willie was **not rerun**. The parent will review
the fix diff and decide whether to request another review.

## 1. Selective OID predicates and ordered paging — FIX

Confirmed: every filter and sort previously used computed `v*` fields after
projection, including exact OID lookups. The initial match could not restrict the
index scan to a requested OID or continuation range.

`record-graphql/mongo.ts` now adds validated `record:oid` EQ/IN predicates to the
initial raw match. It retains all normalized filters: raw query matching can
admit arrays and must not replace exact scalar validation. Simple binary
collation, the string OID guard, ACL expressions, brand/type/stage restrictions,
and metadata's registered stage/form pairs remain in force. Metadata still uses
exact object keys through `$getField`, with the same scalar normalization and
missing/null ordering.

Default and explicit OID-only sorting now run on `redboxOid` before projection.
A validated OID-only continuation also adds its exclusive raw `$gt`/`$lt` bound to
the initial match. The initial scalar-string guard and cursor-key validation
make that raw comparison equivalent to the normalized OID comparison, so OID-only
continuations need no second computed-field keyset. The limit stays after all
normalized filters, preserving page filling and exhaustion behavior.
Compound sorts retain their full normalized tuple and each explicit direction,
including a descending OID appearing before or after a metadata sort.

No production index definitions were added or changed. Metadata and compound
sorts retain their existing normalized execution and may still scan/sort broadly.
No general metadata performance improvement is claimed.

The real-Mongo regression uses 10,000 documents in an isolated collection with
the existing unique `{ redboxOid: 1 }` index pattern. For each query it compares
complete projected rows, keys and overflow flags with the previous execution
layout reconstructed by removing raw OID predicates/order and restoring the
computed-field sort. It separately asserts expected OIDs and exclusive
continuations. Additional parity checks cover denied ACLs, wrong brand/type/stage,
wrong forms for metadata operations, array OIDs, null metadata sort buckets,
compound sorts with explicit descending OIDs, nested metadata and literal keys
containing dots. The existing HTTP grid integration suite covers hydration,
permissions, scalar/date semantics and encrypted cursors.

## 2. Whole-operation deadline and cleanup — FIX

Confirmed: `maxTimeMS` alone bounded server execution, leaving server selection,
pool checkout and stalled network reads outside the request deadline.

Driver inspection found an important distinction:

- Portal declares/loads MongoDB **7.2.0**.
- Core declares/loads **7.8.0**.
- The storage hook declares **7.2.0**; this checkout's installed hook-local copy
  is **6.21.0**. The structural provider boundary accepts both versions.
- The actual native collection comes from Sails' datastore manager, whose
  `sails-mongo@2.1.2` dependency pinned MongoDB **6.3.0**. That driver implements
  neither client-side `timeoutMS` nor aggregation AbortSignal cancellation.

The portal and standalone core manifests now override only Sails' MongoDB driver
to exact **6.21.0**, with corresponding lockfile updates. This stays within major
version 6 and supplies the required cursor-lifetime timeout and AbortSignal
support. No unrelated dependency versions changed. Source inspection of that
installed driver verified server selection cancellation in `execute_operation`,
pool checkout cancellation in `connection_pool`, network read/write cancellation
in `connection`, and cursor cleanup in `abstract_cursor`.

The provider passes the remaining budget (capped at 5,000 ms) as both server
`maxTimeMS` and client `timeoutMS`, with `timeoutMode: 'cursorLifetime'` and an
AbortSignal. A response timer also rejects and aborts at that budget, including
when an adapter never settles. Cleanup runs on success, error and expiration,
and again if an expired operation settles late. Cleanup cannot hold the response
open; its synchronous throws and promise rejections are consumed. Both outcomes
of the late operation are observed, and the response timer is always cleared.

Timeout mapping uses cross-driver error names/codes, not `instanceof`: native
`MongoOperationTimeoutError`, server code 50 and expiration return `QUERY_TIMEOUT`.
Ordinary errors remain ordinary errors for the existing resolver mapping.

Fake-clock tests cover a never-resolving operation and stalled close, exact
expiration/abort, late success/failure with rejecting cleanup, zero leftover
timers, successful reads, ordinary failures, synchronous aggregate failures, and
both native timeout mappings. Runtime driver tests cover selection against an
unavailable endpoint with a 100 ms request deadline and a 30,000 ms selection
setting, cursor cleanup, and successful reads across the Sails, portal and core
versions.

Cleanup is deliberately asynchronous so an unavailable server cannot delay the
GraphQL error. The built-in pinned driver cancels in-flight waits and handles
cursor cleanup; third-party hooks must supply these timeout/cancellation
capabilities and an idempotent `close()`. A JavaScript event-loop stall cannot be
preempted by a timer.

## Verification evidence

Package/build checks (all exit 0):

- `node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json`.
- `npm --prefix packages/sails-hook-redbox-storage-mongo run build`.
- `node_modules/.bin/tsc --noEmit` (root backend).
- `npm --prefix packages/redbox-core run test:record-graphql`: **118 passing**,
  including its TypeScript check.
- `npm --prefix packages/sails-hook-redbox-storage-mongo test`: **325 passing,
  67 pending**. Pending integration cases require their optional external setup.
- A temporary TypeScript project extending the root config and including
  `test/integration/globals.d.ts` and `RecordGraphqlMongo.test.ts`: passed.
- Prettier on all three changed TypeScript files: passed.
- Oxlint on the changed provider: **0 warnings, 0 errors**.
- `git diff --check`: passed.

The new Mongo regression suite also ran directly in a Compose container against
MongoDB **9.0.4**, using a temporary isolated database and the actual compiled
provider: **6 passing (8 seconds)**. Its database and collection were removed.
The primary portal integration command uses the committed Compose mount profile:

```bash
sudo -n env COMPOSE_PROJECT_NAME=redbox-graphql-willie-fix \
  RBPORTAL_MOCHA_TEST_PATHS=$'test/integration/services/RecordGraphqlGrid.test.ts\ntest/integration/services/RecordGraphqlMongo.test.ts' \
  docker compose --profile mount \
  -f support/integration-testing/docker-compose.mocha.yml \
  up --menu=false --abort-on-container-exit \
  --exit-code-from redboxportal-mount redboxportal-mount
```

The runner accepts separate test paths on separate lines. An initial invocation
with a space-separated value was stopped during webpack before tests ran.

The first completed portal run passed all **25 existing HTTP grid tests**, but
four new assertions failed: the explain walker incorrectly counted the echoed
command's original sort as an execution stage, and cursor tracking was read from
`client.activeCursors` instead of the actual `client.s.activeCursors`. Both test
harness mistakes were corrected. A subsequent native run exposed Mongo cursor
read-ahead (96 examined documents) from the redundant computed OID-only keyset.
The proven-equivalent raw string comparison now replaces that redundant keyset;
compound keysets and normalized filters are retained. The subsequent full run passed all HTTP, explain/parity and timeout/cleanup
checks, then its three successful compatibility reads exposed another harness
assumption: Sails normalizes away the datastore configuration URL. Those reads
now use the actual native manager target; the corrected native suite passes all
six tests. The final full run below uses fresh containers and the final compiled
provider.

Representative `executionStats` from the passing native run (10,000 stored
records; no hints):

| Query | Rows | Keys examined | Documents examined | Previous layout documents |
| --- | ---: | ---: | ---: | ---: |
| OID EQ `oid-05000` | 1 | 1 | 1 | 10,000 |
| OID IN three distant IDs | 3 | 5 | 3 | 10,000 |
| Default OID first batch | 50 | 50 | 50 | 10,000 |
| Default OID after `oid-09000` | 50 | 50 | 50 | 10,000 |
| Explicit OID ASC after `oid-09000` | 50 | 50 | 50 | 10,000 |
| Explicit OID DESC after `oid-09000` | 50 | 50 | 50 | 10,000 |

All use `FETCH -> IXSCAN redboxOid_1`, with **no blocking SORT**. EQ has the
point bound `["oid-05000", "oid-05000"]`; IN has three separate point intervals.
The first batch scans forward over `[MinKey, MaxKey]`. Ascending continuations
scan forward over `("oid-09000", {})`; descending continuations scan backward over
`("oid-09000", ""]`. These are Mongo's emitted bounds. Every optimized page was
compared with the prior projected layout and expected IDs. These counts describe
this representative fixture, not a universal scan bound for arbitrary ACLs or
metadata predicates.

In that same run, a 100 ms deadline with a 30,000 ms server selection setting
returned `QUERY_TIMEOUT` after **102 ms (Sails 6.21.0), 102 ms (core 7.8.0), and
102 ms (portal 7.2.0)**. Each driver had **zero active cursors** after timeout and
after a successful selective read. Unit fake clocks separately confirm timer
cleanup and observation of late outcomes.


Dedicated pool-starvation and established-socket-stall fault injection were not
run. Those waits use the inspected pinned driver's cursor-lifetime timeout and
signal machinery; the never-settling adapter regression independently verifies
the provider's response bound. The wider unrelated named-query/report suites
were not rerun for these provider-only fixes.

Local evidence is retained in this checkout's ignored `.tmp/` directory:

- `willie-core-build.log`, `willie-hook-build.log`, `willie-root-types-final.log`.
- `willie-unit-final.log`, `willie-hook-tests.log`, `willie-integration-types.log`.
- `willie-format-check.log`, `willie-lint.log`.
- `willie-mongo-native-current.log`: final native suite, Mongo version, all six
  explain summaries and all three driver timeout measurements.
- `willie-mongo-verified.log`: final full portal integration run.
- `willie-mongo-integration.log`, `willie-mongo-native-final.log`,
  `willie-mongo-final.log`: earlier test-harness/read-ahead diagnostics.

Final full portal integration result: **31 passing (2 minutes), exit code 0**:
25 existing authenticated HTTP grid tests and all six new Mongo regressions,
plus the required bootstrap. This run used fresh isolated Compose containers
and the final compiled provider. Its explain results match the table above.
Its 100 ms deadline checks completed after **100 ms (Sails 6.21.0), 102 ms
(core 7.8.0), and 101 ms (portal 7.2.0)**, each with zero active cursors;
all three independent successful reads and their cursor cleanup also passed.

The isolated project's containers and network were removed with Compose
`down -v --remove-orphans`. Runner-generated edits to the two integration config
shims were restored. Cleanup evidence is `.tmp/willie-mongo-cleanup-final.log`.
