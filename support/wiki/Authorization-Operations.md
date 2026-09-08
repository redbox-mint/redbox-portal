# Authorization Operations

Operator-facing tooling for rollout readiness, evidence, recovery, and
maintenance. The readiness, orphan, mismatch and recovery CLIs run through their
own Sails lift; the stabilization verifier reads exported evidence without a lift.
These commands never change deployment-wide rollout mode. Readiness also has a
privileged read-only HTTP API; the mutation/maintenance CLIs are not HTTP endpoints.
See the [rollout guide](Authorization-Migration-and-Rollout.md) and
[contract API](Authorization-Contract-API.md).

## Rollout readiness

For fleet verification, collect a fresh direct serving-process report from
**every serving instance** using the authenticated
`GET /:branding/:portal/api/authorization/rollout/readiness` API (requires
`system.authorization.manage`). For example:

```bash
# Site inputs: direct URL for the named instance and a protected operator curl config.
curl --fail --silent --show-error --max-time 30 \
  --config "${AUTHZ_CURL_CONFIG:?}" \
  "${INSTANCE_BASE_URL:?}/default/rdmp/api/authorization/rollout/readiness"
```

Replace `/default/rdmp` with the actual brand/portal prefix. Bypass arbitrary
load-balancer selection: verify the response's observed `deploymentIdentity`
against the reviewed fleet inventory. Capture `generatedAt`, `mode`, build and
instance identity, registry generation, migration/transaction/invariant results,
and any `authorization-readiness.collection-evidence-gap` blocker. Pair the report with the named serving
process's `AuthorizationRolloutService.getCollectionHealth()` snapshot for
boot/durability/gap details, using the existing privileged in-process operator
adapter described in the [collection-health runbook](Authorization-Migration-and-Rollout.md#collection-failure-recovery-restart-and-rollback).
There is no separate public HTTP health endpoint. Include worker, hook and
WebSocket hosts as applicable. Compare against the reviewed build and registry,
not merely agreement between fleet members.

The CLI below is **supplementary only**: it lifts a new operator process. Its
loaded mode, build, registry and collection health cannot certify an existing
serving process, even when run on the same host or given matching environment
values. Use direct serving-process reports for every fleet step below.

```bash
npm run authorization:readiness
```

The CLI prints the full machine-readable readiness report (JSON) followed by a concise
operator summary. The report covers registry generation and conflicts, route
declaration coverage, unknown/orphaned scope references, migration completion
and legacy projection drift, protected Guest/brand-admin/system-admin
invariants, at least one effective brand administrator per brand, at least two
effective system administrators, datastore transaction support, unresolved
shadow mismatch counts, bounded custom-scope rollback exposure, and the fail-closed release gates (navigation parity,
approved security differences, performance evidence against the approved
budget, build/instance identity, shadow window, rollback rehearsal, and the
product/security/operations/hook-owner/integrator approvals).

`readyForEnforce` is true only when no blocker exists. Missing or malformed
release evidence is a blocker; it is never treated as an implicit approval.
Build/instance identity is observed from the running process (build
environment signals, OS hostname) and reported as `deploymentIdentity`
alongside mode and registry generation; operator-supplied
`releaseEvidence.identity` carries only optional expected values that are
compared against the observed identity and never accepted as proof by
themselves. Performance evidence must be complete, finite, non-negative, and ordered:
`baselineP95Ms`, `baselineP99Ms` (with `baselineP99Ms >= baselineP95Ms`),
`maximumOverheadP95Ms`, `maximumOverheadP99Ms`, `observedOverheadP95Ms <=
maximumOverheadP95Ms`, `observedOverheadP99Ms <= maximumOverheadP99Ms`, plus
integer `baselineQueryCount`, `maximumQueryCount`, and `observedQueryCount <=
maximumQueryCount`. Non-finite (`NaN`/`Infinity`), negative, unordered, or
missing values fail closed. Numeric budgets and production latency baselines
are operator-supplied external release input, not repository claims.
Exit code is `2` when not ready.

### Constructing `authorization.releaseEvidence`

Supply a JSON-encodable `releaseEvidence` object in the deployment-owned
`authorization` configuration after the corresponding reviews and measurements.
Every approval object (`navigationParity`, `approvedSecurityDifferences`,
`performance`, `shadowWindow`, `rollback`, and each of
`approvals.product`, `security`, `operations`, `hookOwners`, `integrators`)
requires `approved: true`, `approvedAt`, and `fingerprint`. The fingerprint is
64 lowercase hexadecimal SHA-256 characters identifying retained immutable
evidence. Keep the underlying artifacts and named approvals: readiness validates
shape, timing and bundle integrity; it does not retrieve artifacts or grant
external approval. Missing or malformed evidence leaves the gate OPEN.

Use UTC ISO timestamps. Every `approvedAt` must parse as a finite date and be
no later than the readiness report's `generatedAt`. The shadow window requires
finite dates with `startedAt < completedAt <= generatedAt`, positive
`minimumHours`, and elapsed hours at least `minimumHours`. Approval timestamps
and shadow completion exactly equal to `generatedAt` are accepted; future times
are not. Record approval after reviewing the completed observations. The runtime
comparison is against the report time, not the operator workstation's clock.
The performance fields and budgets listed above must also pass validation.

`identity` is optional. If supplied, its expected build/instance values must
match observed identity. Do not copy one member's expected instance ID to every
fleet member, or populate observed identity from approval data. Per-member
bundles with different expected IDs need their own fingerprints; a shared bundle
can omit `identity` while the fleet verifier independently checks observations.

Compute `durableFingerprint` as SHA-256 of UTF-8, compact `JSON.stringify` output
for the entire bundle **excluding its top-level `durableFingerprint` property**.
Recursively sort object keys using JavaScript `Object.keys(value).sort()`, omit
object properties whose value is `undefined`, and preserve array order while
recursively canonicalizing elements. Do not use a top-level-only sort, a
`JSON.stringify` key whitelist, pretty-printed JSON, or hash the bundle including
its own digest. Retain this immutable bundle; any evidence change requires a new
reviewed bundle and recalculated hash.

This standalone JavaScript is a **documentation validation fixture**, valid for
a report generated at or after `2026-09-08T00:00:00.000Z`. Its example artifacts,
measurements and approvals are fictional; never install it as production release
evidence. For an actual bundle, use hashes of the retained evidence artifacts,
real approval times, approved site budgets and measured results. No example or
repository test closes an external rollout gate.

```javascript
const { createHash } = require('node:crypto');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

function durableFingerprint(evidence) {
  const { durableFingerprint: ignored, ...bundle } = evidence;
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(bundle)), 'utf8')
    .digest('hex');
}

function exampleApproval(artifactName) {
  return {
    approved: true,
    approvedAt: '2026-09-08T00:00:00.000Z',
    fingerprint: createHash('sha256').update(`Documentation fixture: ${artifactName}`, 'utf8').digest('hex'),
  };
}

const releaseEvidence = {
  navigationParity: exampleApproval('navigation-parity'),
  approvedSecurityDifferences: exampleApproval('security-differences'),
  performance: {
    ...exampleApproval('performance'),
    baselineP95Ms: 10,
    baselineP99Ms: 20,
    maximumOverheadP95Ms: 5,
    maximumOverheadP99Ms: 8,
    observedOverheadP95Ms: 3,
    observedOverheadP99Ms: 6,
    baselineQueryCount: 4,
    maximumQueryCount: 4,
    observedQueryCount: 4,
  },
  shadowWindow: {
    ...exampleApproval('shadow-window'),
    startedAt: '2026-09-06T00:00:00.000Z',
    completedAt: '2026-09-07T00:00:00.000Z',
    minimumHours: 24,
  },
  rollback: exampleApproval('rollback-rehearsal'),
  approvals: {
    product: exampleApproval('product'),
    security: exampleApproval('security'),
    operations: exampleApproval('operations'),
    hookOwners: exampleApproval('hook-owners'),
    integrators: exampleApproval('integrators'),
  },
};
releaseEvidence.durableFingerprint = durableFingerprint(releaseEvidence);
module.exports = { releaseEvidence };
```

Shell examples use site-supplied inputs: `REVIEWED_GENERATION` is the reviewed
registry generation; `MISMATCH_FINGERPRINT` is a listed 64-hex fingerprint;
`MISMATCH_CLASSIFICATION` is a canonical triage label; `OPERATOR_ID` and
`OPERATOR_REASON` identify the operator and reviewed reason. `RECOVERY_TARGET`
is the exact recovery username or user ID. `${NAME:?}` stops the shell if an
input is absent; do not substitute arbitrary values to bypass a gate.

## Rollout mode

The mode (`legacy`, `shadow`, `enforce`) is deployment-wide configuration
changed through normal deployment controls. Readiness tooling reports evidence;
it never switches modes.

## Phase 14.1 legacy-mode deployment verification

Scope: this runbook verifies a deployment that is intentionally running in
`legacy` rollout mode. It confirms the legacy baseline is intact,
observable, and ready for later-phase work to begin. It does not evaluate
shadow or enforce gates, and a passing legacy check must never be read as
shadow/enforce readiness: `readyForEnforce` is expected to remain false
while later-gate release evidence is absent, and that is the correct
outcome for this phase.

Run every step on each fleet instance (per-instance verification), then
compare the collected reports (fleet verification). Runtime identity,
mode, and registry generation are per-process observations, so a single
instance report cannot speak for the fleet.

0. Back up and lift one instance for migrations first. Back up per the
   normal deployment procedure, then lift exactly one application
   instance for migrations before scaling out: the current migration
   runner has no cross-instance lock. Scale out only after the
   single-instance lift completes, then run declaration reconciliation
   on the deployment.

1. Confirm legacy mode and registry generation. Collect the direct readiness
   report from each serving process as above and check `mode === 'legacy'` plus the `registry.generation`,
   `declaredScopeCount`, `persistedScopeCount`, and `orphanedScopeCount`
   fields. Every fleet instance must report the same generation and mode;
   a generation skew between instances means the rolling deployment has
   not converged — stop and redeploy before continuing.

   Use the CLI only as supplementary evidence; it does not establish the
   serving fleet's loaded state or collection health.

2. Confirm migration completion and reconcile orphans (preview only).
   The report's `migration.completed` must be true with zero drift
   blockers. Separately preview orphan reconciliation and review any
   scopes no longer declared by installed packages. Do not apply
   reconciliation as part of legacy verification unless a reviewed
   generation handoff explicitly requires it; preview output is the
   evidence for this phase.

   ```bash
   npm run authorization:reconcile-orphans
   ```

3. Confirm transaction support. The report's `transactions.available`
   must be true. A `transactions-unavailable` blocker fails the legacy
   check: authorization persistence requires datastore transaction
   support, and later phases cannot proceed without it.

4. Confirm protected invariants and administrator coverage. The report
   must carry no `bootstrap-invariants-blocked` finding, every brand
   must have at least one effective brand administrator, and at least
   two effective system administrators must exist. If system
   administration is ever empty, use the recovery command and then
   re-run readiness from step 1.

5. Confirm runtime deployment identity per instance. Each report's
   `deploymentIdentity.complete` must be true with the observed
   `buildVersion` and `instanceId`. Identity sources, in precedence
   order: `REDBOX_BUILD_VERSION`, `BUILD_VERSION`, `APP_VERSION` for the
   build; `REDBOX_INSTANCE_ID`, `HOSTNAME`, then the OS hostname for the
   instance. An absent value is reported as missing, never inferred. If
   `releaseEvidence.identity` expected values are configured, each
   instance additionally reports `releaseGates.identity.match`; a
   mismatch blocks and means the deployed artifact is not the reviewed
   release. Fleet check: collect one report per instance and confirm
   identical `buildVersion` values with distinct `instanceId` values.

6. Re-verify drift after any write. Every administrative write in this
   phase (recovery, reconciliation apply, role/assignment changes) must
   be followed by a fresh readiness run plus a drift review before the
   change is considered complete. Post-write drift blockers reopen the
   legacy check; do not carry a pre-write passing report forward.

7. Exercise the new UI/API with controlled administrators. Use the
   opt-in live legacy-mode UI/API smoke below (controlled legacy-mode
   deployment, dedicated fixture user, exactly one reversible grant
   with preflight and versioned revoke). It is environment evidence
   for the deployment under test, not a repository claim, and it has
   not been executed against a live deployment in this change.

8. Confirm no token/claim leakage in operational output. Readiness,
   drift, and recovery output carry bounded fields only (never bearer
   values, passwords, session material, raw claims, usernames as metric
   labels, or raw scope arrays). The readiness command funnels lift and
   report failures through the shared authorization credential redactor
   (`redactAuthorizationCredentialStrings` from the officially exported
   `@researchdatabox/redbox-core/authorization/persistence-contracts`
   module); inspect the collected reports for absent credential-shaped
   values before treating any output as releasable evidence.

Exit criteria for phase 14.1: steps 0–8 pass on every instance, later-gate
blockers (navigation parity, performance, shadow window, rollback,
approvals, durable fingerprint) remain open as expected, and no operator
step has treated those later gates as complete.

## Opt-in live legacy-mode UI/API smoke

`test/playwright/authorization-live-smoke.spec.ts` is an opt-in,
production-like Playwright workflow for a controlled legacy-mode
deployment. Unlike the mocked `manage-roles.spec.ts` suite, it performs
no `**/api/authorization/**` interception: it loads the live roles
administration UI through the controlled admin session fixture, reads the
live projection/scopes/roles contract API, requires `rolloutMode ===
'legacy'` (skipping otherwise), and attempts one supported manual assignment
grant for a dedicated fixture user. A preflight `GET /assignments` skips the
run when the fixture user already holds the target role. The `finally` block
attempts a versioned revoke only when the grant returned a numeric version and
`changed === true` established this run's cleanup ownership. Pre-existing grants
and concurrent idempotent `changed === false` results are never revoked by the
run. After a successful revoke, a `GET /assignments` checks that no active
assignment remains and the retained row is revoked at the returned revoke
version. It never touches protected roles and skips when no non-protected role
target exists.

Cleanup is conditional: the grant response may not establish ownership/version,
and revoke or post-revoke verification can fail. Failed or ambiguous cleanup
must remain **OPEN** with an owner and follow-up reference for operator
reconciliation, including after a failed probe. On a version conflict, stop,
reread and reconcile ownership; never retry blindly against a newer version.
Follow the [rollout cleanup procedure](Authorization-Migration-and-Rollout.md#temporary-legacy-roles-and-ownership-aware-cleanup),
including fresh drift/readiness checks after every cleanup or remediation write.

The smoke is disabled by default and runs only
via the dedicated wiring below (see the spec header for
fixture provisioning and the exact command). It has not been executed
against a live deployment in this change; run it in a controlled
environment and treat its result as environment evidence, not a
repository claim.

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:1500 npm run test:playwright:live-smoke
```

## Phase 14.2 shadow-mode deployment verification

Scope: this runbook verifies a deployment that is intentionally running in
`shadow` rollout mode. Legacy path rules still enforce; the new scope
engine observes every request and records bounded mismatch aggregates for
representative traffic. A passing shadow check collects and triages that
evidence — it never switches the deployment to `enforce`.

Run every step on each fleet instance (per-instance verification), then
compare the collected reports (fleet verification). Runtime identity,
mode, and registry generation are per-process observations, so a single
instance report cannot speak for the fleet.

0. Switch to shadow through normal deployment controls and collect direct
   serving-process readiness reports from every instance as above. Confirm
   `shadow` mode, reviewed build/registry, instance identity and current collection
   health. A mode skew means the rollout has not converged — stop and redeploy
   before continuing. The CLI is supplementary only.

1. Run representative traffic. Cover every high-risk family at least
   once: anonymous, session, and bearer principals; all default/custom
   role scenarios; two-brand plus system-admin scenarios; record ACL,
   search, and export scenarios; vocabulary and other brand-entity
   scenarios; onboarding/link/claim-hook scenarios; WebSocket/background
   scenarios. The opt-in shadow evidence workflow below automates the
   anonymous/session/bearer, two-brand, record search, and
   readiness/mismatch portion; the remaining families use their
   maintained suites against the shadow deployment. Treat the collected
   results as environment evidence for the deployment under test, not a
   repository claim — no live shadow-mode deployment is available in
   this worktree/CI context.

   ```bash
   PLAYWRIGHT_BASE_URL=http://127.0.0.1:1500 npm run test:playwright:shadow-smoke
   ```

2. Review discrepancies by route/reason/brand category, not by ad hoc
   log sampling. The readiness report carries bounded grouped summaries
   (`shadow.byRoute`, `shadow.byReason`, `shadow.byBrand`,
   `shadow.byClassification`, `shadow.groupsTruncated`) for triage;
   `shadow.unresolvedMismatchCount` remains the authoritative total.
   Grouping is observational and never gates readiness.

3. Classify each mismatch as mapping defect, data migration/drift
   defect, missing route declaration, resource-gate defect, approved
   legacy security bug, or intentional product change. Acknowledge
   triaged fingerprints with the bounded classification vocabulary
   (never free text) and a reason, then add a regression test for each
   resolved/approved category. Acknowledge through the documented CLI
   process; recurrence automatically reopens and resets the aggregate as
   described below. There is no manual reset command.

   ```bash
   npm run authorization:shadow-mismatches -- list --limit=50
   npm run authorization:shadow-mismatches -- acknowledge --fingerprint="${MISMATCH_FINGERPRINT:?}" --reason="${OPERATOR_REASON:?}" --operator="${OPERATOR_ID:?}" --classification="${MISMATCH_CLASSIFICATION:?}"
   ```

4. Fix mapping/data defects, rerun evidence and use the separate
   `close-remediated` workflow below for verified repairs. Retention deletes only
   approved, already-resolved aggregates past a bounded cutoff and always appends
   a `shadow.retention.completed` audit summary carrying the confirmed
   `deletedCount`:

   ```bash
   npm run authorization:shadow-mismatches -- retain --older-than-days=30 --reason="${OPERATOR_REASON:?}" --operator="${OPERATOR_ID:?}"
   ```

5. Re-verify readiness per instance after every fix. Enforce approval
   (Stop Gate O) stays open until all readiness blockers are clear, the
   representative shadow window is complete, rollback rehearsal
   succeeds, and approval/evidence links are recorded.

Exit criteria for phase 14.2: representative traffic covers every
high-risk route family, no mismatch remains unexplained, remaining
differences are approved security/product changes with regression
tests, and the external deployment (not a repository change) supplies
the shadow-window evidence.

## Opt-in live shadow-mode evidence workflow

`test/playwright/authorization-shadow-smoke.spec.ts` is an opt-in,
production-like, read-only Playwright workflow for a controlled
shadow-mode deployment. It performs no interception and issues no
mutations: it loads the live roles administration UI through the
controlled admin session fixture, asserts the authenticated session
principal (`category === 'authenticated'`, `authMethod === 'session'`,
`active`, `userId`, contract `brand.id`, `scopeKeys`), collects
anonymous/session/bearer projections (invalid bearer must return `401`,
never a Guest fallback), checks two actual brands using the contract
`brandId` field (default-brand `GET /me` plus the `GET /roles` catalog
`brandId`, then the second branding prefix `GET /me`), runs bounded
direct record read/ACL agreement (`GET /api/records/list` plus
`GET /api/records/metadata/:oid`), bounded search
(`GET /record/search/:type` with `searchStr`/`rows`), a bounded
read-only export probe
(`GET /api/export/record/download/:format` with
`recType`/`before`/`after`), and asserts the live readiness report
carries `mode === 'shadow'`, a complete per-instance deployment
identity, bounded grouped shadow summaries
(`byRoute`/`byReason`/`byBrand`/`byClassification`, at most 20 entries
each), `readyForEnforce === false` while enforce gates remain open,
plus a bounded read-only `GET /audit` probe. Shadow mismatch
acknowledgement and retention stay non-HTTP CLI operations (see above)
and are not reachable over HTTP. It is disabled by default and runs
only via the dedicated wiring below (see the spec header for the exact
command). It has not been executed against a live deployment in this
change; run it in a controlled environment and treat its result as
environment evidence, not a repository claim.

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:1500 npm run test:playwright:shadow-smoke
```

## Orphan reconciliation

After a rolling deployment completes on the new release, reconcile scopes that
are no longer declared by any installed package:

```bash
npm run authorization:reconcile-orphans                 # preview only
npm run authorization:reconcile-orphans -- --apply --generation="${REVIEWED_GENERATION:?}"
```

Preview lists what would be marked `orphaned` with impact output; apply requires
the exact reviewed registry generation, is transactional and audited, never
deletes definitions or grants, and is idempotent. Orphaned scopes grant nothing
but remain visible for impact analysis.

## Shadow mismatch acknowledgement and retention

Shadow comparison aggregates discrepancies keyed by a bounded fingerprint that
never contains actor, resource, or credential data. Operators list unresolved
or unapproved aggregates with bounded fingerprint-ordered pagination, triage
fingerprints with a reason and operator identity, and run bounded retention
for old resolved aggregates:

```bash
npm run authorization:shadow-mismatches -- list --limit=50
npm run authorization:shadow-mismatches -- acknowledge --fingerprint="${MISMATCH_FINGERPRINT:?}" --reason="${OPERATOR_REASON:?}" --operator="${OPERATOR_ID:?}" --classification="${MISMATCH_CLASSIFICATION:?}"
npm run authorization:shadow-mismatches -- retain --older-than-days=30 --reason="${OPERATOR_REASON:?}" --operator="${OPERATOR_ID:?}" --limit=1000
```

Listing accepts `--limit` from 1 to 200 and an optional `--cursor` containing the
previous page's 64-hex fingerprint. Retention accepts `--older-than-days` from
1 to 36500 and `--limit` from 1 to 10000. Examples use concrete bounds; review
the site's retention policy before applying them.

Mismatch classifications use these six canonical categories (bounded and
required for acknowledgement). Use the exact label in `--classification`:

| Category                       | Operator decision and readiness behavior                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `mapping-defect`               | Correct the role-to-scope mapping and rerun the affected role/route comparison. Remains a blocker.                                   |
| `data-migration-drift-defect`  | Repair migrated assignments or drift and rerun migration/request evidence. Remains a blocker.                                        |
| `missing-route-declaration`    | Declare route authorization and rerun inventory and direct-route parity. Remains a blocker.                                          |
| `resource-gate-defect`         | Repair the resource/brand gate and rerun denial and opacity regressions. Remains a blocker.                                          |
| `approved-legacy-security-bug` | Record the external security approval and regression proving the intentional correction. Acknowledgement resolves the aggregate.     |
| `intentional-product-change`   | Record the external product approval and regression proving the intentional behavior change. Acknowledgement resolves the aggregate. |

Legacy compatibility is explicit. The CLI and service continue to accept these
aliases and preserve the supplied label on stored rows and audit events. New
triage should use the canonical category. Existing approvals keep their meaning;
legacy investigation and defect labels never become approvals:

| Legacy label                     | Canonical category             | Readiness after acknowledgement |
| -------------------------------- | ------------------------------ | ------------------------------- |
| `approved-security-difference`   | `approved-legacy-security-bug` | Resolved                        |
| `expected-legacy-gap`            | `intentional-product-change`   | Resolved                        |
| `scope-declaration-fix-required` | `missing-route-declaration`    | Blocker                         |
| `needs-investigation`            | `data-migration-drift-defect`  | Blocker                         |

The free-text reason explains the decision and references the approval or
remediation evidence; it cannot override classification semantics. Arbitrary
labels are rejected. Acknowledging a defect or investigation is triage, and
leaves `resolvedAt` null. A remediation claim alone does not approve a difference
or clear readiness: fix and reverify the defect, then record a separate audited
remediation closure as described below. Do not relabel it as an intentional
change merely to clear a blocker. Fixtures and tests
exercise these semantics; they do not grant external release approval.

List output carries only bounded aggregate fields and never writes to the
append-only authorization audit. Acknowledgement stores `resolvedBy`, a bounded
`resolutionReason`, and typed `resolutionClassification`; it sets `resolvedAt`
only for the two approved categories or their two approved legacy aliases.
It appends a typed `shadow.mismatch-acknowledged` event with the same canonical
values (`actorType=operator`, `authMethod=operator`, operator identity, reason,
classification, resolution timestamp or null, and succeeded outcome). Mutation
and audit commit in one required transaction; audit failure rolls back triage.

`shadow.unresolvedMismatchCount` counts all open aggregates plus historical rows
that have a resolution timestamp without an approved classification, excluding
separately verified defect closures described below. Unverified defects,
`needs-investigation`, missing classifications, and unknown historical labels
remain blockers even if an older implementation set `resolvedAt`. Listing and
acknowledgement include these historical blockers, allowing operators to inspect
and re-triage them with an audit event. Re-triaging a defect clears its stale
resolution timestamp; approving a difference records a new one. Existing approved
resolutions, including legacy aliases, remain unchanged until recurrence.
Bounded grouped summaries are observational; they never replace this full
readiness count. If summary evidence cannot be read, groups are empty and
`shadow.groupsTruncated` is true; the independent readiness count still applies.

The supported automatic reopen/reset process is a new observation of the same
fingerprint through shadow comparison. The atomic upsert increments `count`,
refreshes `lastSeenAt` and `sampleRequestId`, preserves `firstSeenAt`, and clears
the four fields `resolvedAt`, `resolvedBy`, `resolutionReason`, and
`resolutionClassification`, plus the three remediation closure fields described
below. The same reset applies to a retry after concurrent
first observations. The aggregate returns to the unresolved list and blocks
readiness until reviewed again, including previously approved differences.
Prior append-only audit entries remain intact. There is no manual reset CLI or
HTTP endpoint; rerun the affected comparison after changes and use the
acknowledgement CLI for a newly reviewed disposition.

Retention requires a bounded operator identity and reason. It deletes only
approved aggregates with a resolution timestamp older than the configured
last-seen age (a safe integer of 1-36500 days; fractional, scientific-notation,
Infinity, and unsafe dates are rejected), bounded per invocation. Both selection
and deletion check approval, resolution, and age so reopened evidence is protected.
Investigation, defect, unknown, unclassified, and unresolved evidence is never
deleted, including incorrectly resolved historical rows. The typed
`shadow.retention.completed` summary records the operator identity, reason,
confirmed deleted count, and truncation on every invocation, including zero
matches. Deletion and audit commit in one required transaction. Append-only audit
evidence is never deleted. None of these commands changes deployment-wide rollout
mode or is reachable over HTTP.

## Custom-scope rollback exposure

Readiness includes `rollbackExposure`: `complete`, bounded `incompleteReasons`,
`affectedUserCount`, `affectedRoleCount`, `affectedCapabilityCount`, and `items`
(maximum 100 user/role pairs, 100 scope keys per item). Each item names the user,
role ID/key, brand when applicable, effective capabilities and
`temporaryLegacyRoleAssessment: "required"`. It is visible only through the
existing system-authorized readiness API/operator workflow; do not use identities
or scope arrays as telemetry labels.

The scan considers active, present, unexpired user assignments across all
supported sources, deduplicates user/role pairs, excludes disabled users and
protected roles with established legacy behavior, and resolves both custom and
template-backed nonprotected roles with the shared effective-scope calculator
(including removals). This deliberately reports **potential** exposure: scope
semantics have no automatic inverse mapping to legacy path rules, and template
roles can acquire scope-only effects. The report never grants a temporary role
or promises that an existing role retains a particular route capability.

Reads are bounded to 500 active roles, 1,000 assignments and users, and 100
scope entries per role/template, each with a one-row overflow sentinel where
supported. Reasons are `roles-limit`, `assignments-limit`, `users-limit`,
`scopes-limit`, `items-limit`, `invalid-state` and `query-failed`. Any overflow,
unreadable/missing state, invalid ownership or query failure sets `complete=false`;
counts then mean observed lower bounds, including zero. Roles with incomplete
template or override inputs contribute no counts or detail: an omitted removal
could otherwise make a capability appear effective. Other verified roles still
contribute to the report. Partial detail can remain
useful but must not be presented as a complete inventory. The readiness blocker
is `authorization-readiness.rollback-exposure-incomplete`. Complete identified
exposure produces `authorization-readiness.rollback-custom-scope-exposure` as a
warning requiring a documented assessment, not an automatic authorization change.

Run during a controlled administration/synchronization pause, then rerun after
writes. For large installations, prepare a separately reviewed complete inventory
through bounded, paginated role/assignment catalog exports and owner capability
probes. The current scanner has no resume cursor; repeated capped scans do not
prove completeness and external inventory does not automatically clear this
readiness blocker. Resolve invalid state or extend/validate the scan strategy for
that deployment before enforce. Follow the Phase 14.4 rollback runbook for the
per-user decision on accepted temporary loss or an approved, least-privilege
legacy assignment with ownership/versioned cleanup. Execution and approvals
remain OPEN.

## Verified defect remediation

Classification records what is wrong; approval accepts an intentional difference;
remediation closure records a repaired defect with completed verification.
`close-remediated` is a separate non-HTTP operator command. It cannot classify a
row or approve a security/product difference. It accepts the four defect
categories and the two legacy investigation/defect aliases only after triage.

After repairing the defect, run the affected regression and representative live
comparison against the reviewed build/registry. Confirm no new occurrence during
the verification interval. Keep an immutable verification artifact with test and
request references, expected/actual outcomes, deployment/fleet identity and the
repair reference. An operator must inspect that artifact: the service validates
the supplied evidence and its binding; it does not fetch the referenced artifact
or execute a test on the operator's behalf. Failed, skipped, incomplete or merely
planned verification cannot be attested as `passed`.

Prepare a regular JSON file of at most 8,192 bytes with **exactly** these fields
(the example values must be replaced with actual verified observations):

```json
{
  "fingerprint": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "observedCount": 3,
  "lastSeenAt": "2026-09-01T00:00:00.000Z",
  "buildVersion": "reviewed-build-id",
  "registryGeneration": "observed-registry-generation",
  "repairReference": "change:repair-123",
  "verificationReference": "artifact:immutable-regression-and-shadow-report",
  "startedAt": "2026-09-01T00:01:00.000Z",
  "completedAt": "2026-09-01T00:16:00.000Z",
  "result": "passed"
}
```

Use `list` to obtain the exact fingerprint/count/last-seen snapshot. Dates must be
canonical UTC ISO strings; verification must start strictly after the last
occurrence, finish after its start, and finish no later than closure. Build
identity must match the running operator process (`REDBOX_BUILD_VERSION`, then
`BUILD_VERSION`, then `APP_VERSION`); registry generation must match its loaded
registry. Run the operator process from the verified deployment configuration,
not by assigning a synthetic build value to satisfy this check.

```bash
npm run authorization:shadow-mismatches -- close-remediated \
  --evidence-file=/secure/evidence/verified-defect.json \
  --operator=operator-identity --reason="Repaired and verified; incident reference"
```

The service atomically checks fingerprint, count, last-seen timestamp and current
defect classification, then stores `remediationStatus: "verified"`,
`remediationEvidenceFingerprint` (SHA-256 of the validated evidence JSON) and
`remediationVerifiedAt`. It retains `resolvedAt`, original triage fields,
`firstSeenAt`, `lastSeenAt` and count unchanged. The append-only
`shadow.mismatch-remediated` event contains the canonical operator/reason,
previous triage/observation state, full validated evidence, hash and closure time.
Closure and audit use one required transaction; audit failure rolls back closure.
A stale snapshot, missing evidence/build identity or changed build/registry fails
closed. A repeat closure is rejected until a new observation reopens the defect.

Readiness and listing exclude verified defect closures while unverified or
historically mis-resolved defects remain blockers. Recurrence clears the three
closure fields along with the four approval/triage fields, increments count and
preserves first-seen and all previous append-only audit evidence. Re-triage and
new verification are required; old evidence cannot close the new occurrence.
Closed defect aggregates are deliberately excluded from retention, preserving
their observation history as well as the audit trail. This does not approve a
rollout mode or populate external release approvals.

## System administrator recovery

If a deployment ever has no effective system administrator, a non-HTTP operator
command restores one protected assignment:

```bash
npm run authorization:recover-system-admin -- \
  --target="${RECOVERY_TARGET:?}" \
  --reason="${OPERATOR_REASON:?}" \
  --confirm=RECOVER-SYSTEM-ADMIN \
  --operator="${OPERATOR_ID:?}"
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

Authorization logging uses bounded fields only: decision counters by fixed route
family (the `route` metric label), mode, outcome, reason code, and principal
category; invalid bearer attempts; optimistic concurrency conflicts;
transaction-unavailable failures; quorum
guard rejections; and orphaned-scope grant counts. Usernames, user IDs, bearer
values, arbitrary entity IDs, route IDs, raw paths, and raw scope arrays are never
used as log or metric labels.

## Phase 15.2 telemetry and read-only stabilization probes

Use the separate [stabilization closure contract](Authorization-Migration-and-Rollout.md#phase-152-stabilization-closure)
for all ten signals. Pre-enforce readiness does not close stabilization. The
read-only `scripts/authorization-stabilization.js` verifies complete exported
observations and dispositions for every reviewed member, with explicit freshness,
baseline and cardinality checks. Its per-signal results remain OPEN on missing or
invalid evidence. Do not substitute local unit-test results for production traffic
or independently acknowledged collector exports.

The existing OpenTelemetry meter `redbox.authorization` now emits these
instruments; install/configure the site's normal SDK and exporter before lift.
The API's default no-op meter is **not** an operational collector. Require a fresh
collector acknowledgement for every interval and partition, along with ingress
counts for response-rate denominators. Verify expected counter/histogram series
are present and have complete coverage; do not use `or vector(0)` or equivalent
missing-series replacement. Counter resets require boot-aware deltas and trigger
the restart procedure, not negative counts or a reset baseline.

| Instrument prefix `redbox.authorization.` | Counting semantics                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decisions`                               | One final rollout evaluation, `outcome=allow/deny`, including legacy and security-fix results. Shadow comparison does not add a second final decision. Repeated explicit evaluations count separately; this is not a unique-request counter.                                                                                                                                                |
| `responses`                               | One selected HTTP helper response, by status/reason, including policy, resource, contract API and legacy adapters. Delegating helpers do not double-count. Redirects use `302`; selected responses do not assert successful delivery across the network. Compare to independently observed matching request counts.                                                                         |
| `context_queries`                         | One actual dispatched datastore query, including rejected attempts and username fallback after ID lookup. Operations are `user-id`, `user-name`, `assignments`, `roles`, `revisions`, `overrides`. Empty batch skips and in-memory branding/registry reads count zero. Custom dependency/hook implementations must wrap actual queries in `contextQuery`; otherwise coverage is incomplete. |
| `context_resolutions`                     | One uncached context resolution, success or error. Direct user resolutions are measured too; nested calls inside a request share its measurement.                                                                                                                                                                                                                                           |
| `context_query_count`                     | Histogram of actual dispatched queries per resolution, including zero and errors. Async-local measurement isolates concurrent resolutions.                                                                                                                                                                                                                                                  |
| `context_duration`                        | Monotonic elapsed milliseconds per uncached resolution, including errors; export histogram buckets/count/sum for p95/p99. This includes brand lookup, linked canonical identity traversal, assignments, roles and scope materialization.                                                                                                                                                    |
| `context_cache`                           | One lookup per `resolveRequestContext` call, `hit/miss`. An in-flight hit shares the pending resolution and does not add queries or a latency sample. Rejected resolutions evict the request entry; a retry is a new miss. No cross-request cache is introduced.                                                                                                                            |
| `orphan_observations`                     | During resolution, unique inactive/missing scope keys observed, before bounded diagnostic truncation; during action checks, one inactive/missing required scope observation. `source=resolution/decision` separates these populations; do not sum them as unique orphaned scopes. Zero observations still require a successful resolution/action sample.                                    |
| `quorum_rejections`                       | One guard rejection at the service boundary, even without HTTP, by `source=system-admin/brand-admin` and bounded reason. Query-bound rejection is distinct from final-administrator rejection. An HTTP `409` for the same event belongs to a different population.                                                                                                                          |
| `shadow_collection`                       | Each attempted request or navigation shadow mismatch persistence completion, success/error, in shadow and optional enforce request comparison. Legacy mode has no mismatch writer; its decision/response/query/guard telemetry continues.                                                                                                                                                   |
| `collection_transitions`                  | Each failed/recovered collection transition; repeated failures remain counted in `shadow_collection` and the durable health counter.                                                                                                                                                                                                                                                        |
| `telemetry_rejections`                    | One rejected metric update containing an unknown dimension or out-of-vocabulary value. Values are replaced/discarded before export; the rejected input is never logged. Any nonzero count requires investigation.                                                                                                                                                                           |

Only fixed route families (`authorization`, `records`, `record-schema`,
`legacy-admin`, `user`, `other`, `internal`), fixed rollout modes, principal
categories, known reasons, statuses, operations, outcomes and sources become
metric dimensions. Route family comes from controller metadata, never the URL,
request ID or route ID. Internal calls use `internal`; unresolved principal
category is `unknown`. Hook controllers collapse to `other`. Build, instance and
boot identities belong in the separately reviewed collector resource/inventory;
never add them to per-event labels. Raw routes, brands, users, role/scope arrays,
record IDs, exception messages, tokens, cookies and claim values are excluded.
Keep collector resource cardinality within the approved fleet cap as well.

Read-only collection probes use the privileged serving-process
`AuthorizationRolloutService.getCollectionHealth()` method. Pair its snapshot
with independently acknowledged exported metrics, complete paginated drift
reports, support/integrator feed exports and a secret/series inventory scan.
The method returns fixed fields and does not expose the health file path. A
freshly lifted CLI cannot certify another process's health. See the rollout
runbook for persistent-volume configuration, fail/recover/fail behavior and why
a restart always needs renewed evidence. Telemetry/provider/logger failures
never grant, deny or change an authorization result; they invalidate observation
coverage and block readiness/stabilization instead.

Navigation comparisons call the serving process's exported
`AuthorizationRolloutService.recordShadowMismatch()` boundary, sharing the
request collector's durable health and transition counters. Hook overrides must
retain this method and its guarded observation behavior. A missing collector
invalidates telemetry coverage; navigation visibility remains unchanged. A
successful write after an outage restores current health but retains failure
counters and gap timestamps, so it cannot close a window containing lost
navigation evidence. Restarted processes must collect successfully again and
complete a newly approved observation window.

Alert operations immediately for absent/late collector heartbeats, failed health
or non-durable state, incomplete drift scans, changed boot/inventory or missing
histograms. Alert security and operations for secret findings, cardinality
rejections, orphan-use growth, quorum rejections and unexplained high-severity
reports. Compare 401/403/404 and deny fractions with the same reviewed baseline
partitions; investigate credential/integrator regressions before widening access.
For transaction 503s inspect datastore transaction capability and availability;
for CAS 409s inspect contention and stale client versions, retaining atomicity.
For query-count or p95/p99 budget breaches inspect linked identity depth,
assignment/role batch sizes and datastore latency, preserving request-only
memoization. Run complete drift scans across all assignment sources and escalate
projection changes. These alerts stay active in legacy rollback mode; do not
relax credential ceilings or remove compatibility to quiet them.

The focused native Mongo proof uses its own Compose profile and mounts this
worktree read-only. It exercises request and navigation mismatch reopening,
repeated failures, fail/recover/fail, and a separate Node process recovering and
failing through navigation against Mongo and the same durable health file. It
does not lift Sails or replace the full deployment smoke matrix.

```bash
docker compose -p authorization-stabilization-proof --profile stabilization \
  -f support/integration-testing/docker-compose.authorization-stabilization.yml \
  up --abort-on-container-exit --exit-code-from proof
docker compose -p authorization-stabilization-proof --profile stabilization \
  -f support/integration-testing/docker-compose.authorization-stabilization.yml \
  down -v
```
