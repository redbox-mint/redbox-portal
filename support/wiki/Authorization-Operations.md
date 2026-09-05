# Authorization Operations

Operator-facing tooling for rollout readiness, evidence, recovery, and
maintenance. These commands run in the normal application environment via a
Sails lift; none of them changes the deployment-wide rollout mode, and none is
reachable over HTTP.

## Rollout readiness

```bash
npm run authorization:readiness
```

Prints the full machine-readable readiness report (JSON) followed by a concise
operator summary. The report covers registry generation and conflicts, route
declaration coverage, unknown/orphaned scope references, migration completion
and legacy projection drift, protected Guest/brand-admin/system-admin
invariants, at least one effective brand administrator per brand, at least two
effective system administrators, datastore transaction support, unresolved
shadow mismatch counts, and the fail-closed release gates (navigation parity,
approved security differences, performance evidence against the approved
budget, build/instance identity, shadow window, rollback rehearsal, and the
product/security/operations/hook-owner/integrator approvals).

`readyForEnforce` is true only when no blocker exists. Missing or malformed
release evidence is a blocker; it is never treated as an implicit approval.
Performance evidence must be complete, finite, non-negative, and ordered:
`baselineP95Ms`, `baselineP99Ms` (with `baselineP99Ms >= baselineP95Ms`),
`maximumOverheadP95Ms`, `maximumOverheadP99Ms`, `observedOverheadP95Ms <=
maximumOverheadP95Ms`, `observedOverheadP99Ms <= maximumOverheadP99Ms`, plus
integer `baselineQueryCount`, `maximumQueryCount`, and `observedQueryCount <=
maximumQueryCount`. Non-finite (`NaN`/`Infinity`), negative, unordered, or
missing values fail closed. Numeric budgets and production latency baselines
are operator-supplied external release input, not repository claims.
Exit code is `2` when not ready.

## Rollout mode

The mode (`legacy`, `shadow`, `enforce`) is deployment-wide configuration
changed through normal deployment controls. Readiness tooling reports evidence;
it never switches modes.

## Orphan reconciliation

After a rolling deployment completes on the new release, reconcile scopes that
are no longer declared by any installed package:

```bash
npm run authorization:reconcile-orphans                 # preview only
npm run authorization:reconcile-orphans -- --apply --generation=<reviewed-generation>
```

Preview lists what would be marked `orphaned` with impact output; apply requires
the exact reviewed registry generation, is transactional and audited, never
deletes definitions or grants, and is idempotent. Orphaned scopes grant nothing
but remain visible for impact analysis.

## Shadow mismatch acknowledgement and retention

Shadow comparison aggregates discrepancies keyed by a bounded fingerprint that
never contains actor, resource, or credential data. Operators acknowledge
resolved fingerprints with a reason and run bounded retention for old resolved
aggregates:

```bash
node scripts/reconcile-authorization-orphans.js   # see script help for related tooling
```

Acknowledgement updates `resolvedAt`, `resolvedBy`, and a bounded
`resolutionReason` on the aggregate row; this is operational evidence and never
enters the append-only authorization audit. Retention deletes only already
resolved aggregates older than the configured age, bounded per invocation;
unresolved evidence is never deleted.

## System administrator recovery

If a deployment ever has no effective system administrator, a non-HTTP operator
command restores one protected assignment:

```bash
npm run authorization:recover-system-admin -- \
  --target=<exact-username-or-userId> \
  --reason="<operator reason>" \
  --confirm=RECOVER-SYSTEM-ADMIN \
  [--operator=<operator identity>]
```

The command requires the exact typed confirmation phrase, a non-empty operator
reason of at most 1,000 characters, and rejects ambiguous, disabled, or
linked-alias targets (recover the canonical primary account instead). The
target is revalidated inside the mutation transaction: if it changed, was
disabled, or became an alias since invocation, recovery fails closed and must
be restarted.

Reactivation semantics (operator CAS, same code path as ordinary
administration):

- No existing recovery row: the assignment is created with the operator as
  `assignedBy`, the operator reason stored on the row, and an
  `assignment.created` audit event in the same required transaction.
- An existing revoked, suppressed, expired, or source-absent recovery row is
  **reactivated in place**: status returns to `active`, presence is restored,
  expiry/revocation/suppression metadata is cleared, the operator reason is
  recorded, and an `assignment.reactivated` audit event (with the prior
  status/presence as `before`) commits in the same required transaction.
  Reactivation is conditional (compare-and-swap): versioned rows must still
  carry the read version, and versionless rows must still match the full
  pre-write snapshot (tuple identity, status, presence, expiry,
  revocation/suppression metadata, actor/time, reason). A concurrent change
  matches zero rows, fails closed, and the operator restarts recovery to
  revalidate — it is never silently clobbered.
- An already effective (active, present, unexpired) row is a no-op: nothing is
  mutated and an `assignment.noop` audit event records the operator, reason,
  and adopted state.
- A concurrent operator winning the exact-tuple creation race is adopted only
  after rereading the winner in a fresh required transaction, validating the
  exact canonical tuple and its effectiveness, and recording the `assignment.noop`
  audit on that same transaction connection.

Audit/reason semantics: the actor is the supplied `--operator` identity
(default `operator:system-admin-recovery`), the method is `operator`, every
outcome carries the operator reason on both the row and the audit event, and
rejected/failed attempts are recorded via the denied/failed attempt path
without masking the validation error. Verification output is bounded (no
credentials, no role topology).

## Metrics and logging expectations

Authorization logging uses bounded fields only: decision counters by route ID,
mode, outcome, reason code, and principal category; invalid bearer attempts;
optimistic concurrency conflicts; transaction-unavailable failures; quorum
guard rejections; and orphaned-scope grant counts. Usernames, user IDs, bearer
values, arbitrary entity IDs, raw paths, and raw scope arrays are never used as
log or metric labels.
