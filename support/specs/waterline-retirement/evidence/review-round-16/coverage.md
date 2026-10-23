# R16 review coverage

Input `ebb1e6165`; merge-base `ef23e07fe`; fixes `1d6666614`, `c323055d8`; qualification `c323055d8`.
Read R15 and R14 README/coverage, ADR0003, both programme specifications,
P10 classification and wiki standards. Independent standards/spec source passes
initially found the same SQS P2. The parent later reproduced a separate Mongo release replacement P2. The final qualification passes include both reproductions/fixes and
report NO ISSUES FOUND. Their task IDs, model/options and separate reports are
in review-axes.json.

- **Receipt lifetime:** R15's ID-plus-receipt key remains intact. Confirmed ended
  initial/final state-save errors previously skipped map deletion, retaining a
  separate payload for every redelivery until shutdown. Three actual Agenda,
  repository and AWS SDK protocol controls reproduce sixteen retained stale
  deliveries each. The fix removes only the captured exact receipt/map entry,
  using R14's existing terminal classification, and rethrows the save error.
  AccessDenied still retains ownership. Successful final saves, explicit unlocks,
  prefetched receipts, old completion/new receipt, terminal releases and failed
  release/retry remain covered. A separate compiled-runtime lifetime probe mixes
  256 successful completions, unlocks and ended final saves of one envelope ID;
  only the final active receipt may remain for shutdown release.
- **Late same-ID Mongo claims:** A native fenced old release can apply before its held acknowledgement returns, allowing an admitted query to claim the same document. If the late release fails, the old reply previously deleted the new map entry and allowed backend closure. The actual Agenda regression and real Mongo/backend probe fail before `c323055d8`; the guard compares the captured map entry before deletion and retains the replacement for retry. No database fencing protocol changes.
- **Drain and ownership:** Existing Mongo job ID/timestamp/unique-owner fencing,
  ambiguous save candidates, future retries and null-nextRunAt repair are
  unchanged. Both live ownership selectors, failed release/retry and real Sails
  lower/signal controls remain in the runner. Worker/request completion admission
  retains its application scope and original 30,000 ms deadline. Actual default
  worker and HTTP probes require one failure callback, retained resources,
  refused late admission and successful cleanup retry. HTTP follow-ups retain
  explicit work after a completed 200 response; other applications and completed
  request/handler descendants gain no permission.
- **Consumers and storage:** Rechecked record/attachment audit follow-ups,
  GridFS initialization/write/read/close ownership, selected staged storage
  initialization, immutable schema/reference operations and cleanup journals.
  The operation classification still routes record lifecycle/identity/CAS,
  authorization, Counter and attachment OID rebind through retained owners.
  Figshare retains serialized heartbeat completion before owner-fenced release;
  neither its timing arithmetic nor lease predicates change in R16.
- **Whole-feature foundations:** Rechecked app-owned lazy compatible-policy
  pools, selector failure behavior, mapping/default/callback qualification,
  physical identity/string/null/timestamp codecs, named-query/tenant/association
  translation, ledger normalization, configuration cardinality/secret leases,
  progress/harvest counters and SIEM/Figshare native operation boundaries.
  The retained inventory executes transition/mixed-instance/rollback, scalar,
  mapping, native-value, error/no-replay, query/page, index, TLS/SRV, live storage,
  stock API, development selector, existing-volume upgrade and budget controls.

ADR0003 remains official MongoDB driver/no ORM. Explicit `prisma` still fails
with migration guidance; C2's intentional legacy-null timestamp contract remains.
G-TX stays CLOSED and P10 promotes only the staged subset. No transaction,
generic query/retry framework, new pool or Mongo fencing protocol is introduced.

Pre-existing master behavior remains outside the fixes: falsy local cache hits
fall through; per-call local TTL is not persisted TTL; local-first void cache
writes retain find/create/best-effort behavior; RDMP global counters retain
read/compute/overwrite. Public standalone fixtures do not qualify private
institution hooks, production failover or an official release.
