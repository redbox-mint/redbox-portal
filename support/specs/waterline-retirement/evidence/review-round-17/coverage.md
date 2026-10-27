# R17 whole-feature P1/P2 coverage

Input `2cdb5442d`; fixed checkpoint `3691a3d73`; comparison `ef23e07fe`.
Read R16/R15/R14 README and coverage, ADR0003, both programme designs,
P1 ownership/shutdown contract, staged P10 classification and wiki standards.
This round is one reviewer, with no delegated/independent-axis claim.

## Holistic queue pass

See `ownership-state-machine.md` and `transition-pairs.json`: all 144 ordered
pairs per backend are explicitly reviewed, including terminal-delivery behavior,
new-delivery identity and the application drain overlay. Pair enumeration is
source inspection with named executable witnesses; it is not represented as
288 independently executed live interleavings.

Two branch-introduced P2 scenarios reproduce in the real Mongo/Agenda path:
old Mongo delivery unlocks its newer same-ID owner; older renewal acknowledgement
forgets a newer ambiguously applied renewal. The possible-fences implementation
also dispatches 129 releases after 128 failed heartbeat replies. A single forward
simplification replaces the array protocol with per-delivery records and ordered
save/release, using a unique persisted Mongo delivery owner. SQS retains exact
receipt identity and the two existing ended-receipt classifications. No new
index, pool, schema, dependency or general retry framework is introduced.

The eight retained live scenarios additionally cover stale same-ID completion,
applied completion reply loss, applied future retry reply loss and refused final
save. Existing real Agenda/AWS SDK receipt redelivery, ended state-save errors,
AccessDenied, partial release, startup, late acquisition, watchdog, automatic
removal, HTTP follow-up and deadline tests remain enabled. The forward handler Job.save correction preserves lock/owner and final
completion; ended/stale Mongo job saves are refused. A new real Agenda
control verifies SQS renewal precedes release and a later touch cannot hide the
released delivery again.

## Remaining feature diff

- **Foundation and configuration:** inspected app-owned lazy pool/database
  acquisition, compatible-policy keying, failed startup/close ownership,
  repository publication and retained-reference lifecycle guards. Split settings,
  URI/TLS/SRV policies and redacted failures remain explicit; unavailable group
  and retired Prisma selection fail without fallback. Operator index ensure
  remains explicit and scoped. Compound key order, partial predicates, collation,
  missing/null unique-key counts and existing-volume readiness remain qualified.
- **C2/M/R codecs and queries:** inspected cache null-timestamp read handling,
  plain finite JSON validation, scalar write/query normalization, identity and
  association codecs, automatic timestamp flags/batch clocks, fetch/mapping/hook
  refusal, reference defaults/projection/readback, named-query normalization and
  tenant scope after alias flattening. Logical/text/object-literal clauses,
  ordering, pages/counts and association targets retain explicit supported
  dialects and refusals. Ledger query and write normalization stay separate.
- **Q/J consumers:** inspected configuration singular cardinality, dashboard
  revision CAS, secret lease owner predicates and monotonic renewal, progress
  write-option refusals and projections, harvest native counters and paging,
  SIEM event/delivery/attempt boundaries, and Figshare CAS/heartbeat/release.
  Domain errors preserve unknown-outcome/no-blanket-replay behavior. Migrated
  service calls preserve scope and plain DTO contracts.
- **Staged S and bytes:** inspected the explicit staged allowlist, native schema
  artifact/reference codec and existing compensation behavior, audit append/read
  mapping, attachment journal/coordinator identity/generation/token predicates,
  cleanup reconciliation and retained unknown outcomes. Internal compound calls
  stay within one admitted operation. GridFS initialization/streams/copy/close
  remain application owned and failed closure remains retryable.
- **Shutdown/HTTP:** inspected request transport/action/store/follow-up ownership,
  app/worker context isolation, response completion, late descendant refusal,
  normal early producer drain and Sails lower/signal guard. Default worker/HTTP
  deadline probes and retained real owner/signal suites qualify these boundaries.
- **Composition/deployment:** checked pre-lift/bootstrap and consumer migration
  boundaries, model bridge/loader and default selectors, CI/dev selector routing,
  shared fresh-stack/operator index preparation, package exports/runtime artifacts
  and exact dependency pins. The mandatory inventory covers fresh Mocha/Bruno,
  both dev selector configurations, live storage, rollback, budgets and existing
  volume upgrade rather than treating unit tests as deployment evidence.

No additional concrete branch-introduced P1/P2 qualified outside queue ownership.
This is a fresh source/diff risk pass with executable coverage, not a claim of
line-by-line certification of every unrelated historical addition at the older
merge-base or of private institution hooks.

## Dismissed candidates and scope discipline

- Direct `cleanupPersistence` refusing newly started repository operations is the
  documented contract: P1 requires stopping producers/awaiting jobs first. Normal
  Sails shutdown performs the early producer drain. It is not a new P2.
- Mongo `limit(0)` is unlimited, but the named-query entrypoint refuses rows ≤0
  before dispatch; the progress/harvest zero-page paths return empty arrays.
- A general stale save in the pinned Agenda repository predates this ownership
  wrapper. It is not counted as a third new issue; the small fenced state-save
  adapter is needed to keep the new delivery token valid through Agenda writes.
- C2's legacy null timestamps are intentionally omitted by its DTO read contract.
  Falsy local-cache fall-through, local TTL versus persisted TTL, local-first
  best-effort find/create cache writes and RDMP read/compute/overwrite counters
  remain the documented pre-existing behavior.

ADR0003 remains official-driver/no-ORM. C2 retains explicit Prisma refusal and
its intentional timestamp contract. G-TX stays CLOSED: Records/DeletedRecord,
CAS/lifecycle/permanent identity, U/authorization, Counter and attachment OID
rebind keep their Waterline/native owners. P10 promotes only staged operations.
No production topology, institution acceptance or official-release gate is waived.
