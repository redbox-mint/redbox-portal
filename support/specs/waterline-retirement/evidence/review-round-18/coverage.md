# R18 whole-feature P1/P2 review coverage

Input/frozen runtime `790e92ca5`; merge-base `ef23e07fe`. Read R17 README,
ownership state machine and transition pairs, then R14 coverage, both programme
designs, ADR0003, P1 lifecycle contract and repository wiki standards.

This is a fresh source/diff risk pass over the programme, with the queue audited
against its actual pinned dependencies. It is not line-by-line certification of
unrelated feature history since the older merge-base or private institution hooks.

| Area | Inspection and disposition |
| --- | --- |
| Ownership | Per-delivery identity, state/user saves, acquisition failures, release deduplication/serialization, redelivery, ambiguous outcomes, retries, expiry and drain overlay. See `ownership-review.md`. |
| Foundation/configuration | Lazy application-owned pools/DBs; effective-policy hashing; retained failure/close ownership; guarded publication and operations; split/URI/TLS/SRV handling and redacted errors. No automatic backend fallback. |
| C2/M | Cache validation/DTO/null timestamps and unchanged asynchronous service writes; explicit retired-Prisma failure; migration ledger identity and write normalization. Intentional cache quirks remain out of scope. |
| R/query | Physical codecs/defaults/timestamps, reference cardinality/projection/readback, scoped named-query translation, alias normalization before tenant scope, scalar/JSON/logical/text operators, sort/page/count boundaries and explicit refusals. |
| Q/J1/J2 | Configuration cardinality and dashboard CAS; secret leases retain owner predicates and monotonic renewal; progress write-option/projection refusals; harvest paging/native atomic counters and unchanged service response paths. |
| J3/J4 | SIEM event/delivery/attempt boundaries and unknown-outcome handling; Figshare CAS/owner/lease predicates and serialized heartbeat stop before release. No blanket write replay. |
| Staged S | Explicit 11-method hook allowlist, native artifact/reference codecs and existing compensation; audit normalization/readback; attachment journal/generation/token cleanup predicates; internal compound calls remain within one admitted operation. |
| Retained owners/bytes | Records/DeletedRecord, CAS/lifecycle/permanent identity, U/authorization, Counter and attachment OID rebind remain Waterline/native-owned. GridFS uses app-owned driver/stream lifetimes; failed closure remains retryable. |
| Shutdown/HTTP | Request transport/action/store/follow-up lifetime, app/worker scope isolation, final saves/removal and early producer drain; Sails lower/signals retain resources on refused drain. |
| Composition/deployment | Pre-lift/bootstrap initialization order, loader/model bridge, promoted/default and explicit Waterline selectors, fresh-stack/operator index preparation, existing-volume upgrade, artifact provenance and pinned manifests. |

No additional concrete branch-introduced P1/P2 qualified. No speculative race or
pre-existing behavior was promoted to a finding. In particular, baseline cache
falsy-value/TTL/find-create quirks, read-compute-overwrite global counters and
pinned Agenda's generic native stale-save/remove behavior are not new findings.
Direct low-level persistence cleanup requires stopped producers as documented;
normal Sails shutdown drains them before closing foundation admission.

ADR0003 remains official-driver/no-ORM. G-TX stays CLOSED and P10 promotes only
the staged subset. C2 null timestamps and explicit retired-Prisma guidance remain
intact. No production/institution/release gate is waived by this review.
