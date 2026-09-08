# Authorization Migration and Rollout

This page documents how the configurable authorization model is delivered over
existing installations without breaking legacy integrations, and how operators
move between rollout modes.

## What the migration changes

The one-time migration is additive, idempotent, and resumable:

1. Existing roles gain an immutable `key` (equal to their legacy `name`), a
   server-computed `brand:<brandingId>:<key>` identity key, a display label,
   context, status, and optimistic version. Migrated key text is preserved
   byte-for-byte; no slugification.
2. Known default roles are attached to matching initial template revisions
   without changing their keys.
3. Each brand receives exactly one protected Guest role; existing Guest roles
   are marked protected. Guest is never assigned to users.
4. The single protected global system-administrator role is created and assigned
   to the canonical bootstrap parent administrator.
5. Existing user-role associations (except Guest) become `migration`-sourced
   assignments. Legacy associations are retained untouched.
6. Record ACL strings, Solr role fields, and configuration role references are
   unchanged because role keys preserve existing names.

## Dual-write and drift

During the compatibility window every supported role/assignment mutation
dual-writes the legacy user-role association and the new assignment state in the
same transaction. Direct database mutation of role associations is not a
supported API; drift reports expose it. Readiness checks projection in both
directions across every supported assignment source: `manual`, `external`, `onboarding`, `recovery`, and `migration`. Membership
is the union of active, source-present, unexpired assignments for an active role;
removing one source retains legacy membership while another effective source
exists. Removing the final effective source removes that membership. Unknown
sources block readiness (`assignment-source-unsupported`).

Migration provenance is source-specific. A migrated row has
`source: 'migration'`, `sourceKey: 'legacy-role:<originalUserId>:<roleId>'`,
`principalType: 'user'`, the canonical primary user as `principalId`, the exact
role ID, and that role's brand. The parser splits at the last colon, retaining
colons in the original user ID. Drift validates the role ID encoded in the key
and follows the original user's complete linked-account chain to the assignment's
canonical principal. Cycles, broken/overlong linkage, a disabled canonical user,
mismatched roles, malformed keys, and unreadable provenance cannot establish a valid migrated projection.
A retained membership on the original alias or the canonical primary can satisfy
the reverse check only after that migration linkage is validated.

Other sources project onto the canonical principal directly; they must not carry
or be judged by invented `legacy-role:` migration keys. External rows use the
provider/source identity described in the [hook contract](Authorization-Hook-Contract.md#assigning-roles-from-claims).
Source identity and history remain distinct even when multiple rows grant one role.

An inactive role grants nothing. Supported role inactivation removes its legacy
membership while retaining assignment/history rows; drift does not demand
membership for inactive roles or revoked, suppressed, expired, or source-absent
assignments. It still validates current migration-row provenance independently
of role activity. Thus a malformed migration key or canonical-link mismatch
remains a blocker even for an inactive role. Brandless system assignments have
no ordinary brand-role projection requirement; Guest is implicit and unassigned.
Missing roles, assignment/role brand mismatches, branded system rows, protected
role anomalies (including inactive protected roles), and incomplete scans remain
blockers. Readiness also reports unmapped path rules.

Repair through supported transactional administration, account-linking,
claim-synchronization or migration/reconciliation workflows, then rerun complete
paginated drift and readiness checks. Do not directly edit the database, legacy
junctions, source keys or canonical IDs to silence a finding; if no supported
repair covers it, obtain a reviewed migration/remediation change. A truncated or
failed scan is unresolved evidence, not a clean result.

## Rollout modes

| Mode      | Enforced decision                       | Additional behavior                                                         |
| --------- | --------------------------------------- | --------------------------------------------------------------------------- |
| `legacy`  | Legacy path rules                       | Declarations validated; new data maintained; configuration warnings logged. |
| `shadow`  | Legacy path rules except approved fixes | Both engines evaluated; bounded mismatch aggregates recorded.               |
| `enforce` | Scope engine                            | Legacy evidence optionally collected; it never overrides the scope result.  |

The mode is deployment-wide configuration changed through normal deployment
controls. Readiness is evidence, never an automatic mode switch.
Credential scope ceilings restrict scoped routes in **every** mode, independently
of legacy path grants. An explicit empty ceiling denies every scoped action;
an absent ceiling preserves the credential's normal grants. Public/pre-auth
declarations and existing credential, brand and resource checks keep their semantics.

### Navigation in each mode

`requiredRoles` configuration remains readable in every mode during the
compatibility window (legacy behavior unchanged). `requiredScope` on
navigation is evaluated in all modes but is authoritative only in `enforce`;
unknown scope keys fail closed there. Shadow differences for navigation are
recorded as bounded mismatch evidence.

### Protected system administrators in legacy/shadow

An effective protected system-administrator assignment maps to the active
brand's legacy Admin role while path rules evaluate. Arbitrary custom scopes
are never translated back into path rules: new custom-role scope effects are
staged and observable, but not authoritative until `enforce`.

## Enforce prerequisites

Enforce readiness requires all of:

- registry and route declarations valid (including installed hook routes);
- migration complete with no unclassified drift;
- every brand has at least one effective brand administrator;
- at least two active, unexpired, unsuppressed system administrators;
- datastore transactions verified (replica set or sharded cluster; a standalone
  MongoDB is not sufficient and authorization writes fail closed with `503`);
- mismatches either approved as intentional differences or repaired with audited, current verification closure; unverified defects remain blockers;
- release gates evidenced: navigation parity, approved security differences,
  performance within the approved budget, build/instance identity, a
  representative shadow window, a rollback rehearsal, and the
  product/security/operations/hook-owner/integrator approvals.

Collect direct serving-process readiness reports as described in
[Authorization Operations](Authorization-Operations.md#rollout-readiness).
`npm run authorization:readiness` is supplementary operator-process evidence only.

## Phase 14.4 rollback runbook

Status: **implementation and repository verification only**. Deployment rollback
execution, measured recovery time, fleet observations, temporary-role decisions,
and product/security/operations/hook-owner/integrator approvals remain **OPEN**.
Do not fill approval fields or `releaseEvidence.rollback` from unit-test results.
This procedure changes enforcement mode without reversing the additive migration.

### Prerequisites and responsibility

The incident commander owns the go/no-go decision and timing; the deployment
operator owns the mode change and fleet inventory; the security owner reviews
retained denials and any temporary role; hook owners and integrators verify their
own routes and credentials. Record named owners and the incident/change reference
in a durable evidence manifest before starting. Use a controlled rehearsal first.

- Have the reviewed build installed, a tested datastore backup/restore reference,
  completed migrations, working transactions, current role/assignment versions,
  registry generation, and a complete before-state inventory. Migration reversal,
  removal of new tables/assignments, ACL/Solr rewrites, and downgrading to a binary
  that predates the security fixes are outside this procedure.
- Verify one effective brand administrator per brand and two independent effective
  system administrators. Test the break-glass access path before changing mode.
  A system administrator must retain the protected mapping to the active brand's
  legacy Admin role. Ordinary custom scopes have no such mapping.
- Pause role/template/assignment administration and external synchronization for
  the evidence window; record any unavoidable writes and repeat drift/exposure
  scans afterward. No single multi-query scan is a transactional fleet snapshot.
- Review `rollbackExposure` using the procedure below. Missing/truncated exposure
  or drift is unresolved evidence, never a clean result. Escalate incomplete
  evidence to the incident/security owners; do not claim rehearsal success or
  re-enable enforce based on a partial scan.
- Prepare direct, authenticated readiness access to **every serving instance**,
  including hook variations, workers/background execution and WebSocket hosts as
  applicable. An API response must come from the named process, not an arbitrary
  load-balanced member. A CLI lift is supplementary evidence and cannot establish
  the serving process's loaded configuration.

Operational target for rehearsal planning: **15 minutes** from the authorized
rollback start to the last serving instance verified in `legacy`, followed by at
least **15 minutes** of representative observation. Operations must approve or
replace these targets before execution; approval and actual elapsed times remain
OPEN. Record UTC start, deployment completion, per-instance verification, service
restoration, and observation-end timestamps. At the target deadline, isolate or
drain nonconverged instances and escalate; never call a mixed fleet successful.

### Collect before-state and deploy the mode change

Run the following from the controlled operator shell with `bash`, Node and curl.
Supply the site-specific values through the deployment procedure: `EVIDENCE_DIR`
is a new absolute directory; `FLEET_FILE` has one `instance-id readiness-base-url`
per line, where the URL ends in `/api/authorization`; `AUTHZ_CURL_CONFIG` is a
protected curl config for an authorized operator; `AUTHZ_DEPLOY_COMMAND` is the
absolute path of the site's reviewed deployment executable accepting one mode
argument. Credentials stay outside the evidence directory and shell history.
These variables are runbook inputs, **not ReDBox configuration switches**.

```bash
set -euo pipefail
umask 077
: "${EVIDENCE_DIR:?}" "${FLEET_FILE:?}" "${AUTHZ_CURL_CONFIG:?}" "${AUTHZ_DEPLOY_COMMAND:?}"
test -x "$AUTHZ_DEPLOY_COMMAND"
mkdir "$EVIDENCE_DIR"
cp "$FLEET_FILE" "$EVIDENCE_DIR/fleet.txt"
collect_fleet() {
  local phase="$1" instance endpoint
  mkdir "$EVIDENCE_DIR/$phase"
  while read -r instance endpoint; do
    [[ "$instance" =~ ^[A-Za-z0-9_-]+$ ]] && test -n "$endpoint"
    curl --fail --silent --show-error --max-time 30 --config "$AUTHZ_CURL_CONFIG" \
      "$endpoint/rollout/readiness" > "$EVIDENCE_DIR/$phase/$instance.json"
  done < "$EVIDENCE_DIR/fleet.txt"
  date -u +%FT%TZ > "$EVIDENCE_DIR/$phase/collected-at.txt"
}
collect_fleet before
```

Review every before-report: observed mode/build/instance identity and registry;
`migration.completed`, `migration.driftTruncated === false`, zero migration
blockers; available transactions; administrator counts and bootstrap invariants;
complete exposure and the affected-user assessment. Save unresolved mismatch
pages (`npm run authorization:shadow-mismatches -- list --limit=200`, continuing
with every `nextCursor`) and relevant bounded `/audit` pages. Record active
session/bearer projections, representative legacy memberships and all assignment
sources/versions, route/navigation outcomes, record ACL/Solr parity evidence, and
hook/integrator baselines. Release-gate blockers may still be present: the raw
`readyForEnforce` boolean alone is not the rollback acceptance criterion.

The reviewed deployment config must set `authorization.mode` to `legacy` and
retain `authorization.collectLegacyEvidenceInEnforce` for the later enforce
period. For example, merge this value into the site's existing Sails environment
configuration and redeploy/restart every affected process through its usual
controls; do not edit generated `config/authorization.js` or replace unrelated
configuration:

```javascript
// Relevant value in the deployment-owned configuration:
Object.assign((module.exports.authorization ??= {}), {
  mode: 'legacy',
  collectLegacyEvidenceInEnforce: true,
});
```

After the named incident/deployment approval is recorded, execute:

```bash
date -u +%FT%TZ > "$EVIDENCE_DIR/rollback-started-at.txt"
"$AUTHZ_DEPLOY_COMMAND" legacy > "$EVIDENCE_DIR/deployment.log" 2>&1
date -u +%FT%TZ > "$EVIDENCE_DIR/deployment-completed-at.txt"
collect_fleet after
```

No HTTP/CLI readiness operation switches mode. Do not reverse migrations or
remove new assignment state. Rollback preserves supported transactional dual
writes. The deployment system's audit record is the mode-change evidence;
ReDBox does not fabricate an authorization mutation event for a config deployment.

### Verify convergence and legacy operation

This executable check requires unchanged build and registry for a mode-only
rollback and the exact reviewed fleet. A reviewed replacement build needs its
own before-state evidence and identity comparison; do not silently relax checks.

```bash
node - "$EVIDENCE_DIR" <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const dir = process.argv[2];
const fleet = fs.readFileSync(`${dir}/fleet.txt`, 'utf8').trim().split(/\n/).map(line => line.trim().split(/\s+/)[0]);
assert.ok(fleet.length > 0);
assert.equal(new Set(fleet).size, fleet.length);
const reports = fleet.map(instance => {
  const before = JSON.parse(fs.readFileSync(`${dir}/before/${instance}.json`, 'utf8'));
  const after = JSON.parse(fs.readFileSync(`${dir}/after/${instance}.json`, 'utf8'));
  assert.equal(after.mode, 'legacy');
  for (const report of [before, after]) {
    assert.equal(report.deploymentIdentity.complete, true);
    assert.equal(report.deploymentIdentity.instanceId, instance);
    assert.equal(report.migration.completed, true);
    assert.equal(report.migration.driftTruncated, false);
    assert.equal(report.migration.blockerCount, 0);
    assert.equal(report.transactions.available, true);
    assert.equal(report.routes.valid, true);
    assert.equal(report.registry.orphanedScopeCount, 0);
    assert.equal(report.administrators.brandsWithoutAdministratorCount, 0);
    assert.ok(report.administrators.systemAdministratorCount >= 2);
    assert.equal(report.rollbackExposure.complete, true);
    assert.ok(!report.blockers.some(finding => finding.code === 'authorization-readiness.bootstrap-invariants-blocked'));
  }
  assert.equal(after.deploymentIdentity.buildVersion, before.deploymentIdentity.buildVersion);
  assert.equal(after.registry.generation, before.registry.generation);
  return after;
});
assert.equal(new Set(reports.map(r => r.deploymentIdentity.buildVersion)).size, 1);
assert.equal(new Set(reports.map(r => r.registry.generation)).size, 1);
console.log(`Verified legacy mode and readiness invariants on ${fleet.length} instances`);
NODE
date -u +%FT%TZ > "$EVIDENCE_DIR/fleet-verified-at.txt"
```

Compare the recorded outcomes before/after using the same representative users,
brands, resources, hooks and integrations. Require the following observations,
with request/test references and expected versus actual results:

- Legacy path rules and `requiredRoles` navigation operate correctly. Valid
  manual/external/onboarding/recovery/migration grants retain legacy membership
  while **any** effective source remains; revoking the final source removes it.
  Inspect canonical/linked-user projections and preserve role keys, record ACL
  strings and Solr ACL fields. Existing provenance anomalies remain drift blockers.
- Anonymous and active sessions have the expected Guest/role projection. Valid
  legacy bearer integrations still work; restricted bearer tokens stay within
  their credential ceiling. Invalid/revoked/malformed bearer credentials return
  `401`, never Guest/session fallback. Test disabled users, linked identities,
  two-brand isolation and inaccessible/missing resource opacity.
- Brand admins and both system admins can perform their intended administration;
  validate the system-admin-to-active-brand-Admin projection, external-source
  lifecycle and at least one supported integrator workflow per owner.
- Retained security fixes pass in `legacy`: invalid credentials, inactive actors,
  unauthorized/unknown brands, cross-brand/resource gates, record ACL checks,
  CSRF for session mutations, token ceilings and protected quorum guards. A
  rollback never restores known insecure access or disables transaction/audit
  failure behavior. New custom scope effects are not translated into path rules.

For the controlled fixture's supported grant/revoke path, the existing opt-in
legacy smoke is executable after fixture provisioning described in its header:

```bash
PLAYWRIGHT_BASE_URL="$CONTROLLED_PORTAL_URL" npm run test:playwright:live-smoke
```

Capture its actual result, including skips; it covers only part of the matrix.
Other retained checks use the maintained authorization/Bruno/hook suites. Observe
representative traffic for the approved duration, check decision errors, denials,
latency and integration health against the recorded baseline, then collect a
fresh `after-observation` fleet report. Any drift, recurrence, unknown exposure,
nonconverged member or failed security probe keeps rehearsal acceptance OPEN.

### Temporary legacy roles and ownership-aware cleanup

`rollbackExposure.items` identifies candidates requiring assessment: user ID,
role ID/key, optional brand and effective scope keys. Scopes are capabilities to
probe, not guaranteed losses and not automatic legacy-role recommendations.
Custom and overridden/template-backed nonprotected roles may already have useful
path rules. For each candidate, record the affected routes/workflow, whether
existing legacy roles suffice, and either an accepted temporary loss or a
security/owner-approved least-privilege temporary legacy role. Never default to
Admin or broaden the bearer ceiling. Preserve the assessment and approval link
with the rehearsal evidence; no command here automatically grants roles.

For any approved temporary assignment or test fixture, preflight all source
assignments and legacy membership. Record run ownership, role/user/source tuple,
expiry, returned assignment ID/version, `changed` flag and audit event ID. Only
`changed === true` establishes cleanup ownership; an idempotent `changed === false`
result or a pre-existing grant must never be revoked by this run. A supported
`DELETE /assignments/:roleKey/users/:userId` targets the owned role/user and
supplies `{ "expectedVersion": <owned-version>, "reason": "<cleanup reference>" }`.
That HTTP route fixes `source=manual` and `sourceKey=manual` on the server; do not
send source fields or use it to clean another source. On conflict stop, reread
and reconcile ownership with the owner, never retry against a newer version
blindly. Do not remove other sources
or delete retained assignment rows. Verify the retained owned row is revoked at
the returned version, that other active sources retain their membership, and
that the final-source removal updates the legacy projection. Re-run drift and
readiness after **every** cleanup or remediation write. Failed/ambiguous cleanup
remains OPEN with owner and follow-up reference, including after a failed probe.

### Durable evidence and gated return

Keep original before/after/observation reports, deployment audit reference,
UTC timing and measured elapsed seconds, exact build/instance/registry identities,
mode transition record, probes and skips, mismatch fingerprints and classification,
remediation audit event/evidence fingerprints, temporary-role assessments,
ownership/versioned cleanup results, and named approvals in an access-controlled
immutable incident/release bundle. Hash the collected files, store the hash
manifest and deployment logs with the bundle, and reference it from the release
record. Do not copy credentials, raw sessions or sensitive fixture payloads into
this bundle. Mode, observation and mutation/audit evidence are separate required
artifacts; successful configuration deployment alone proves none of the others.

After completing observation and recording the review/cleanup artifacts:

```bash
collect_fleet after-observation
date -u +%FT%TZ > "$EVIDENCE_DIR/observation-completed-at.txt"
node - "$EVIDENCE_DIR" <<'NODE' > "$EVIDENCE_DIR/timing.json"
const fs = require('node:fs');
const dir = process.argv[2];
const read = file => Date.parse(fs.readFileSync(`${dir}/${file}`, 'utf8').trim());
const start = read('rollback-started-at.txt');
const restored = read('fleet-verified-at.txt');
const observed = read('observation-completed-at.txt');
if (![start, restored, observed].every(Number.isFinite) || restored < start || observed < restored) throw new Error('Invalid rollback timestamps');
console.log(JSON.stringify({ convergenceSeconds: (restored - start) / 1000, observationSeconds: (observed - restored) / 1000 }, null, 2));
NODE
rg --files --hidden "$EVIDENCE_DIR" -g '!SHA256SUMS' -0 | sort -z | xargs -0 sha256sum > "$EVIDENCE_DIR/SHA256SUMS"
```

Compare `timing.json` with the targets approved for this execution and record the
acceptance decision. Upload the bundle and hash manifest to the approved durable
evidence store; a local directory alone does not establish durable retention.

Return to `shadow` only after repairs and regressions pass, projections/drift and
exposure scans are complete, temporary-role cleanup is verified, and the incident,
security and operations owners approve the new observation window. Use the same
deployment controls and verify every process reports `shadow` with the reviewed
build/registry. Run the representative shadow matrix again. Classified defects
stay blockers until `close-remediated` records passed, current verification; a
new observation reopens closure and preserves prior audit history. See
[Authorization Operations](Authorization-Operations.md#verified-defect-remediation).

Return to `enforce` is a separate go/no-go: complete current per-instance
readiness with no blockers; representative shadow window; navigation/security
parity; performance within approved budgets; successful measured rollback
rehearsal; assessed custom-scope exposure; and product, security, operations,
hook-owner and integrator approvals with the durable release fingerprint.
Use the [Phase 15.1 isolated cutover](#phase-151-isolated-enforce-cutover) below
for both the initial handoff and any return to enforce. No readiness report or
remediation closure grants these approvals. Actual rehearsal, timing, observation and return-mode approvals remain
**OPEN** until executed and evidenced externally.

## Phase 15.1 isolated enforce cutover

Status: **repository validation only**. Deployment, traffic isolation, smoke
execution and human approval are external release gates and remain **OPEN** until
performed and recorded. Passing the deterministic verifier below checks supplied
reports; it neither proves traffic isolation nor supplies human approval.
Readiness does not stop a rolling deployment from serving mixed modes.

1. Complete all enforce prerequisites and obtain current, direct per-instance
   readiness with `readyForEnforce === true` and no blockers. The reviewed fleet
   must be in `shadow` on the approved build and registry generation; deploy any
   replacement build in shadow and repeat the observation/review first. Record
   the representative shadow matrix, navigation/security parity, performance
   budgets, measured rollback rehearsal and assessed custom-scope exposure.
   Product, security, operations, hook owners and integrators must approve the
   durable release fingerprint, exact fleet, cutover/observation deadlines and
   abort/rollback plan. Recheck readiness immediately before deployment; stale,
   incomplete or newly blocked evidence requires renewed review, not a waiver.
2. Use a **new** evidence directory and the before-state collection setup above
   (`fleet.txt`, `collect_fleet`, deployment executable and protected curl config).
   Freeze administration and external synchronization for this evidence window.
   Record the named operators, approvals and deployment-system audit references.
   Store `reviewed-cutover.json` with the approved `buildVersion`,
   `registryGeneration`, exact `instanceIds` array and positive integer
   `readinessMaxAgeSeconds` and `smokeMaxAgeSeconds` (the operations-approved
   readiness and smoke freshness budgets). Inventory the fixtures, brands,
   installed hook/integrator variants and their owners for every smoke row below.
   These are operator evidence inputs, not application configuration or an
   approval automatically inferred from `readyForEnforce`.
3. **Isolate traffic before changing any process to enforce.** Operations must
   remove all reviewed members from public/API ingress or hold the entire service
   in maintenance mode, drain in-flight requests and existing WebSocket sessions,
   and pause/drain applicable workers and background consumers. Verify alternate
   ingress paths cannot reach members. Keep direct authenticated readiness and
   controlled smoke access available. Record isolation completion and inventory
   every process; a load-balancer readiness probe or ordinary rolling restart is
   insufficient. Keep isolation in place through convergence, smoke verification
   and the explicit admission decision. Never serve legacy/shadow and enforce
   traffic concurrently during this handoff.

Save this verifier in the evidence directory from the controlled shell. It checks
the exact reviewed membership, report freshness and matching mode/build/registry
at each checkpoint, and fails on missing/unreachable reports. Direct endpoint
identity and the deployment inventory must also be verified by the operator.

```bash
cat > "$EVIDENCE_DIR/verify-cutover.cjs" <<'CUTOVER_NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const [dir, phase] = process.argv.slice(2);
assert.ok(['before', 'isolated', 'cutover-after', 'before-admission'].includes(phase));
const expectedMode = ['before', 'isolated'].includes(phase) ? 'shadow' : 'enforce';
const reviewed = JSON.parse(fs.readFileSync(`${dir}/reviewed-cutover.json`, 'utf8'));
for (const value of [reviewed.buildVersion, reviewed.registryGeneration]) {
  assert.ok(typeof value === 'string' && value.trim().length > 0);
}
assert.ok(Number.isSafeInteger(reviewed.readinessMaxAgeSeconds) && reviewed.readinessMaxAgeSeconds > 0);
assert.ok(Number.isSafeInteger(reviewed.smokeMaxAgeSeconds) && reviewed.smokeMaxAgeSeconds > 0);
assert.ok(Array.isArray(reviewed.instanceIds) && reviewed.instanceIds.length > 0);
assert.equal(new Set(reviewed.instanceIds).size, reviewed.instanceIds.length);
for (const instance of reviewed.instanceIds) assert.match(instance, /^[A-Za-z0-9_-]+$/);
const lines = fs.readFileSync(`${dir}/fleet.txt`, 'utf8').trim().split(/\n/);
const fleet = lines.map(line => {
  const fields = line.trim().split(/\s+/);
  assert.equal(fields.length, 2);
  assert.match(fields[0], /^[A-Za-z0-9_-]+$/);
  assert.ok(new URL(fields[1]).pathname.endsWith('/api/authorization'));
  return fields[0];
});
assert.equal(new Set(fleet).size, fleet.length);
assert.deepEqual([...fleet].sort(), [...reviewed.instanceIds].sort());
const now = Date.now();
for (const instance of fleet) {
  const report = JSON.parse(fs.readFileSync(`${dir}/${phase}/${instance}.json`, 'utf8'));
  const age = now - Date.parse(report.generatedAt);
  assert.ok(Number.isFinite(age) && age >= 0 && age <= reviewed.readinessMaxAgeSeconds * 1000, `${instance}: stale/invalid readiness`);
  assert.equal(report.mode, expectedMode, instance);
  assert.equal(report.deploymentIdentity.complete, true, instance);
  assert.equal(report.deploymentIdentity.instanceId, instance);
  assert.equal(report.deploymentIdentity.buildVersion, reviewed.buildVersion, instance);
  assert.equal(report.registry.generation, reviewed.registryGeneration, instance);
  assert.equal(report.readyForEnforce, true, instance);
  assert.deepEqual(report.blockers, [], instance);
  assert.equal(report.migration.completed, true, instance);
  assert.equal(report.migration.driftTruncated, false, instance);
  assert.equal(report.migration.blockerCount, 0, instance);
  assert.equal(report.transactions.available, true, instance);
  assert.equal(report.routes.valid, true, instance);
  assert.equal(report.registry.orphanedScopeCount, 0, instance);
  assert.equal(report.administrators.brandsWithoutAdministratorCount, 0, instance);
  assert.ok(report.administrators.systemAdministratorCount >= 2, instance);
  assert.equal(report.rollbackExposure.complete, true, instance);
}
if (phase === 'before-admission') {
  const smokeMatrix = {
    'guest-home': { http: 200, implicitGuest: true, persistedGuest: false },
    'guest-pre-auth': { login: true, callback: true, logout: true, csrfBootstrap: true, protectedAccess: false },
    'authenticated-guest': { home: 200, self: 200, implicitGuest: true, administration: 403 },
    'researcher-record': { create: true, read: true, update: true, search: true, unrelatedRecord: 403 },
    'librarian-custom-roles': { curation: true, customGrants: true, customDenied: 403, labelGrants: false },
    'brand-admin-role': {
      create: true,
      edit: true,
      grant: true,
      revoke: true,
      immediateRevocation: true,
      audited: true,
      escalation: 403,
      systemAdministration: 403,
    },
    'system-admin-two-brands': { firstAdminBothBrands: true, secondAdminBothBrands: true, implicitRecordBypass: false },
    'disabled-session': { http: 401, controllerExecuted: false, guestFallback: false },
    'linked-identities': { canonicalParity: true, disabledParent: 401, aliasGrants: false },
    'role-lifecycle': {
      singleRole: true,
      additiveUnion: true,
      foreignRoleGrants: false,
      inactiveRoleGrants: false,
      expiredGrants: false,
      revokedGrants: false,
      suppressedGrants: false,
      orphanGrants: false,
      staleGrants: false,
    },
    'bearer-absent-ceiling': { workflow: true, sessionCsrfRequired: false, missingScope: 403, aclDenied: 403 },
    'bearer-empty-ceiling': { scoped: 403, guestScoped: 403, publicPreAuth: true },
    'bearer-restricted-ceiling': { outsideCeiling: 403, missingActorScope: 403, aclDenied: 403 },
    'bearer-permitted-ceiling': { permitted: true },
    'bearer-invalid': { http: 401, fallback: false, controllerExecuted: false },
    'bearer-revoked': { http: 401, fallback: false, controllerExecuted: false },
    'bearer-malformed': { http: 401, fallback: false, controllerExecuted: false },
    'acl-direct-view': { read: true, update: 403 },
    'acl-direct-edit': { update: true, read: true },
    'acl-role-view': { read: true, update: 403, immutableKeyParity: true },
    'acl-role-edit': { update: true, read: true, foreignOrSystemKeyGrants: false },
    'acl-broad-read': { read: true, update: 403, crossBrand: 404 },
    'acl-broad-update': { update: true, missingBaseScope: 403, crossBrand: 404 },
    'acl-none': { read: 403, update: 403, missing: 404 },
    'record-search-export': {
      listParity: true,
      searchParity: true,
      exportParity: true,
      recordAclUnchanged: true,
      solrAclUnchanged: true,
    },
    'cross-brand-record': { sameBrand: true, crossBrand: 404, missing: 404, opaque: true },
    'cross-brand-vocabulary': { sameBrand: true, crossBrand: 404, missing: 404, opaque: true },
    'cross-brand-form': { sameBrand: true, crossBrand: 404, missing: 404, opaque: true },
    'cross-brand-config': { sameBrand: true, crossBrand: 404, missing: 404, opaque: true },
    'brand-boundary': { unknown: 404, unauthorized: 404, fallback: false },
    'navigation-route-service': { grantedParity: true, deniedParity: true, unknownScopeGrants: false },
    'session-csrf': { valid: true, missing: 403, invalid: 403, rejectedWrite: false },
    'protected-quorum': {
      protectedRoles: true,
      scopeFloors: true,
      finalBrandAdmin: true,
      finalSystemAdmin: true,
      atomic: true,
      twoSystemAdmins: true,
    },
    'transaction-failure': { http: 503, partialWrite: false, restored: true },
    'audit-failure': { mutationAccepted: false, partialWrite: false, restored: true },
    'assignment-manual': {
      grant: true,
      removal: true,
      audited: true,
      otherSourcesRetained: true,
      finalSourceRemoved: true,
      drift: false,
    },
    'assignment-external': {
      grant: true,
      removal: true,
      audited: true,
      otherSourcesRetained: true,
      finalSourceRemoved: true,
      drift: false,
    },
    'assignment-onboarding': {
      grant: true,
      removal: true,
      audited: true,
      otherSourcesRetained: true,
      finalSourceRemoved: true,
      drift: false,
    },
    'assignment-recovery': {
      grant: true,
      removal: true,
      audited: true,
      otherSourcesRetained: true,
      finalSourceRemoved: true,
      drift: false,
    },
    'assignment-migration': {
      grant: true,
      removal: true,
      audited: true,
      otherSourcesRetained: true,
      finalSourceRemoved: true,
      drift: false,
    },
    'onboarding-link-claim': {
      onboarding: true,
      linking: true,
      claimReplacement: true,
      unrelatedSourcesRetained: true,
      persistedGuest: false,
    },
    websocket: { workflow: true, gates: true, deniedDisclosure: false, deniedWrite: false },
    background: { workflow: true, gates: true, missingContextGrants: false, unauthorizedWrite: false },
    'hook-integrator': {
      workflows: true,
      scopedRoutes: true,
      resourceDenials: true,
      credentials: true,
      allVariants: true,
    },
  };
  const deployedAt = Date.parse(fs.readFileSync(`${dir}/cutover-deployment-completed-at.txt`, 'utf8').trim());
  assert.ok(Number.isFinite(deployedAt) && deployedAt <= now, 'Invalid cutover completion time');
  for (const instance of fleet) {
    const report = JSON.parse(fs.readFileSync(`${dir}/${phase}/${instance}.json`, 'utf8'));
    const smoke = JSON.parse(fs.readFileSync(`${dir}/smoke/${instance}.json`, 'utf8'));
    assert.equal(smoke.instanceId, instance, 'Smoke instance mismatch');
    assert.equal(smoke.mode, 'enforce', instance);
    assert.equal(smoke.buildVersion, reviewed.buildVersion, instance);
    assert.equal(smoke.registryGeneration, reviewed.registryGeneration, instance);
    assert.ok(Array.isArray(smoke.rows), `${instance}: missing smoke rows`);
    assert.deepEqual(
      smoke.rows.map(row => row.id).sort(),
      Object.keys(smokeMatrix).sort(),
      `${instance}: incomplete/duplicate smoke matrix`
    );
    for (const row of smoke.rows) {
      const label = `${instance}/${row.id}`;
      assert.equal(row.status, 'passed', `${label}: smoke did not pass`);
      assert.deepEqual(row.actual, smokeMatrix[row.id], `${label}: failed/incomplete outcomes`);
      const started = Date.parse(row.startedAt);
      const completed = Date.parse(row.completedAt);
      assert.ok(
        Number.isFinite(started) &&
          Number.isFinite(completed) &&
          started >= deployedAt &&
          completed >= started &&
          completed <= Date.parse(report.generatedAt) &&
          now - started <= reviewed.smokeMaxAgeSeconds * 1000,
        `${label}: stale/invalid smoke timing`
      );
      for (const field of ['fixtureRef', 'cleanupEvidenceRef']) {
        assert.ok(typeof row[field] === 'string' && row[field].trim().length > 0, `${label}: missing ${field}`);
      }
      assert.equal(row.cleanupStatus, 'passed', `${label}: cleanup incomplete`);
      assert.deepEqual(
        Object.keys(row.evidence).sort(),
        Object.keys(smokeMatrix[row.id]).sort(),
        `${label}: incomplete per-check evidence`
      );
      for (const reference of Object.values(row.evidence)) {
        assert.ok(
          typeof reference === 'string' && reference.trim().length > 0,
          `${label}: missing request/test evidence`
        );
      }
    }
  }
  console.log(`Verified all ${Object.keys(smokeMatrix).length} smoke rows and cleanup on every reviewed member`);
}
console.log(`Verified ${expectedMode} readiness on all ${fleet.length} reviewed instances (${phase})`);
CUTOVER_NODE
node "$EVIDENCE_DIR/verify-cutover.cjs" "$EVIDENCE_DIR" before
```

4. After external approval and **verified traffic isolation**, collect a fresh
   `isolated` report and run the verifier. Use the reviewed deployment executable
   to set `authorization.mode: 'enforce'` on every member, retaining
   `authorization.collectLegacyEvidenceInEnforce` for rollback evidence. Run in
   the same `set -euo pipefail` shell; any command failure stops the cutover and
   leaves traffic isolated. There is no automatic reopen/trap on failure.

```bash
collect_fleet isolated
node "$EVIDENCE_DIR/verify-cutover.cjs" "$EVIDENCE_DIR" isolated
date -u +%FT%TZ > "$EVIDENCE_DIR/cutover-started-at.txt"
"$AUTHZ_DEPLOY_COMMAND" enforce > "$EVIDENCE_DIR/cutover-deployment.log" 2>&1
date -u +%FT%TZ > "$EVIDENCE_DIR/cutover-deployment-completed-at.txt"
collect_fleet cutover-after
node "$EVIDENCE_DIR/verify-cutover.cjs" "$EVIDENCE_DIR" cutover-after
```

5. While still isolated, execute **every row of the mandatory smoke matrix below
   on every named member**, with all listed subcases and installed hook/integrator
   variants, using the same reviewed users, two brands and resources as the shadow
   evidence. Preserve per-member expected/actual outcomes and request/test,
   mutation/audit and ownership-aware cleanup evidence. Use the maintained
   authorization, Bruno and hook suites plus controlled browser probes; the
   legacy-only Playwright live smoke above cannot establish enforce acceptance.
   A skipped, missing, not-applicable, failed or incomplete row is an evidence gap
   and **blocks admission**. There is no aggregate pass or healthy-member waiver.
   Save the per-member manifests in `smoke/<instance-id>.json` as specified below.
6. Only after **every matrix row and its cleanup passes on every member**, collect
   `before-admission` readiness and rerun the verifier. This checkpoint requires
   the complete smoke manifests as well as readiness; readiness alone cannot pass.
   Confirm that the deployment system's exact serving
   inventory still matches the reviewed fleet (including replacements), isolation
   remains effective and all members report the same approved enforce/build/registry
   values. Record the named operations/security go decision before explicitly
   reopening ingress and resuming consumers through the site's reviewed controls.
   Open the separate [Phase 15.2 stabilization window](#phase-152-stabilization-closure)
   and observe all ten signals for its approved duration; admission readiness does
   not close that window. Compare error, denial, latency and integration baselines; preserve timestamps, direct fleet reports,
   deployment/isolation/admission audit references, approvals, smoke and cleanup
   results in the durable hashed release bundle described above.

```bash
collect_fleet before-admission
node "$EVIDENCE_DIR/verify-cutover.cjs" "$EVIDENCE_DIR" before-admission
```

**Abort/drain/rollback:** Any deployment failure, missing/stale/blocked report,
wrong identity/build/registry/mode, failed smoke or missed approved convergence
deadline aborts admission. Keep the whole fleet isolated, drain/stop failed or
nonconverged members and escalate to incident, operations and security owners.
Do not silently drop a failed member from `fleet.txt` to pass; a replacement or
revised fleet needs a new reviewed inventory, evidence and approval. If a failure
occurs after admission, immediately re-isolate ingress and drain sessions/consumers.
Either repair under isolation and repeat all checkpoints/smoke with current
approval, or execute the authorized [Phase 14.4 rollback](#phase-144-rollback-runbook)
to `legacy` using the retained secure build and additive data. Maintain isolation
until its complete fleet convergence, retained-security smoke and explicit
restoration approval; retain its timing, exposure, cleanup and observation steps.
Never reopen to a mixed fleet or relax token ceilings to recover service.

### Mandatory Phase 15.1 smoke matrix and evidence

This matrix makes the [Phase 15.1 task requirements](../specs/authorization/task_list.md#151-deploy-enforce),
[design resource-access matrix](../specs/authorization/design.md#123-resource-access-matrix)
and [representative shadow scenarios](Authorization-Operations.md#phase-142-shadow-mode-deployment-verification)
explicit. Every row is required on each reviewed member of the deployed profile.
Provision controlled fixtures before cutover; unavailable fixtures or unsupported
probe access keep admission OPEN. Exercise both brands and the reviewed core,
hook and integrator variants for each applicable subcase. For non-HTTP workers,
use the reviewed direct probe adapter tied to the named process and capture its
typed decision/error equivalent; do not substitute another process's result.

The expected outcomes below are the acceptance criteria. A successful workflow
means the reviewed successful HTTP response/redirect or service result **and**
the expected UI/data effect; retain exact status codes and observed effects in
the evidence. A denial includes no unauthorized read, write or resource/topology
disclosure. Normalize these checks into the verifier's `smokeMatrix` keys:
booleans attest the stated observed behavior, numeric values are exact HTTP
statuses. `false` is the required outcome for prohibited behavior. Every key
requires its own evidence reference, even when several refer to one test report.

| Row ID                      | Smoke scenario                                | Required expected outcomes                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guest-home`                | Guest home                                    | Anonymous home returns `200`; only the implicit active-brand Guest baseline is projected; no Guest assignment is persisted.                                                                                                                                                                                                                           |
| `guest-pre-auth`            | Guest pre-auth flows                          | Login initiation, authentication callback, logout and CSRF bootstrap complete with their reviewed successful responses/redirects; no unintended protected action becomes accessible.                                                                                                                                                                  |
| `authenticated-guest`       | Authenticated Guest baseline                  | An active session without other roles gets the same implicit Guest home/self scopes and no administrative access.                                                                                                                                                                                                                                     |
| `researcher-record`         | Researcher record workflow                    | Create, read, update and search a permitted record through the UI and matching API; an unrelated in-brand record is denied with `403`.                                                                                                                                                                                                                |
| `librarian-custom-roles`    | Librarians and custom roles                   | Exercise the reviewed curation workflow and every custom role: granted actions succeed, ungranted actions return `403`; labels alone grant no access.                                                                                                                                                                                                 |
| `brand-admin-role`          | Brand Admin role workflow                     | Create/edit a bounded brand role, grant/revoke an owned assignment, observe immediate revocation and audit events; scope escalation and system-role administration return `403`.                                                                                                                                                                      |
| `system-admin-two-brands`   | Both system Admins across two brands          | Each of the two independent system administrators switches between both brands and completes authorized administration; system identity alone never bypasses record ACLs.                                                                                                                                                                             |
| `disabled-session`          | Disabled session                              | A disabled session principal receives `401`, with no controller execution or Guest fallback.                                                                                                                                                                                                                                                          |
| `linked-identities`         | Canonical and linked identities               | Linked sessions resolve to the canonical parent with matching effective permissions; a disabled parent receives `401`; alias-only grants confer nothing.                                                                                                                                                                                              |
| `role-lifecycle`            | Role combinations and lifecycle               | One-role and multi-role additive scopes agree; roles in the other brand, inactive roles, expired/revoked/suppressed assignments and orphaned scopes grant nothing; no stale cached grant survives.                                                                                                                                                    |
| `bearer-absent-ceiling`     | Valid legacy bearer, absent ceiling           | The supported legacy bearer workflow succeeds with normal grants and no session CSRF token; missing scope and in-brand ACL denials remain `403`.                                                                                                                                                                                                      |
| `bearer-empty-ceiling`      | Valid bearer, empty ceiling                   | Every scoped action tested returns `403`, including Guest-scoped actions; public/pre-auth semantics are preserved.                                                                                                                                                                                                                                    |
| `bearer-restricted-ceiling` | Valid bearer, restricted ceiling              | An otherwise granted action outside the ceiling returns `403`; an action inside the ceiling still needs actor scope and resource permission.                                                                                                                                                                                                          |
| `bearer-permitted-ceiling`  | Valid bearer, permitted ceiling               | An action inside the ceiling with effective actor scope and resource permission succeeds.                                                                                                                                                                                                                                                             |
| `bearer-invalid`            | Invalid legacy bearer                         | Returns `401` on Guest/public/pre-auth and protected probes even with a valid session cookie; no Guest/session fallback or controller execution.                                                                                                                                                                                                      |
| `bearer-revoked`            | Revoked legacy bearer                         | Returns `401` on Guest/public/pre-auth and protected probes even with a valid session cookie; no Guest/session fallback or controller execution.                                                                                                                                                                                                      |
| `bearer-malformed`          | Malformed bearer credentials                  | Returns `401` on Guest/public/pre-auth and protected probes even with a valid session cookie; no Guest/session fallback or controller execution.                                                                                                                                                                                                      |
| `acl-direct-view`           | Direct-user view ACL                          | With base action scopes, the named user can read; view-only ACL does not permit update (`403`).                                                                                                                                                                                                                                                       |
| `acl-direct-edit`           | Direct-user edit ACL                          | With base action scopes, the named user can update and read (edit implies view).                                                                                                                                                                                                                                                                      |
| `acl-role-view`             | Role view ACL                                 | An effective same-brand immutable role key permits read; view-only ACL denies update (`403`); renamed display labels do not alter the ACL match.                                                                                                                                                                                                      |
| `acl-role-edit`             | Role edit ACL                                 | An effective same-brand immutable role key permits update and read (edit implies view); other-brand/system role keys do not match.                                                                                                                                                                                                                    |
| `acl-broad-read`            | Broad record read scope                       | Base read plus explicit `record.read.all` permits same-brand read without ACL; it does not permit update (`403`) or cross-brand lookup (`404`).                                                                                                                                                                                                       |
| `acl-broad-update`          | Broad record update scope                     | Base update plus explicit `record.update.all` permits same-brand update without ACL; missing base action scope still returns `403` and cross-brand lookup returns `404`.                                                                                                                                                                              |
| `acl-none`                  | No matching record ACL                        | With base scopes but no direct, role or broad grant, same-brand read/update return `403`; unknown record returns `404`.                                                                                                                                                                                                                               |
| `record-search-export`      | Record list/search/export and Solr parity     | For every direct/role/broad/no-ACL fixture, list/search/export IDs agree with direct fetch decisions and leak no denied record; stored record ACL strings and Solr ACL fields remain byte-for-byte unchanged.                                                                                                                                         |
| `cross-brand-record`        | Cross-brand record opacity                    | Using an actor with the action scope, an ID belonging only to the other brand and a missing ID both return indistinguishable `404` responses; same-brand permitted control succeeds.                                                                                                                                                                  |
| `cross-brand-vocabulary`    | Cross-brand vocabulary opacity                | Using an actor with the action scope, a vocabulary ID belonging only to the other brand and a missing ID both return indistinguishable `404` responses; same-brand permitted control succeeds.                                                                                                                                                        |
| `cross-brand-form`          | Cross-brand form opacity                      | Using an actor with the action scope, a form ID belonging only to the other brand and a missing ID both return indistinguishable `404` responses; same-brand permitted control succeeds.                                                                                                                                                              |
| `cross-brand-config`        | Cross-brand config opacity                    | Using an actor with the action scope, a config ID belonging only to the other brand and a missing ID both return indistinguishable `404` responses; same-brand permitted control succeeds.                                                                                                                                                            |
| `brand-boundary`            | Unknown and unauthorized brands               | Unknown or unauthorized brand context returns `404`, without existence disclosure or fallback to the default brand.                                                                                                                                                                                                                                   |
| `navigation-route-service`  | Navigation, UI, API and direct service parity | Granted core/hook scopes show the navigation and permit the matching UI/API/service action; hidden navigation has matching direct-route/service denial; unknown scopes fail closed.                                                                                                                                                                   |
| `session-csrf`              | Session mutation CSRF                         | The owned mutation succeeds with a valid session CSRF token; missing/invalid tokens return `403` with no write.                                                                                                                                                                                                                                       |
| `protected-quorum`          | Protected role and administrator guards       | Guest/system protection and brand/system scope floors reject changes; final effective brand/system administrator removal is rejected atomically; both independent system admins remain effective.                                                                                                                                                     |
| `transaction-failure`       | Transaction failure                           | A controlled required-transaction failure returns `503` with no partial role, assignment, legacy projection or audit write; restored transaction support is verified before admission.                                                                                                                                                                |
| `audit-failure`             | Audit failure                                 | A controlled audit failure rejects the mutation and rolls back role/assignment/legacy changes; audit and normal mutation success are reverified after recovery.                                                                                                                                                                                       |
| `assignment-manual`         | manual assignment lifecycle                   | For the manual source, verify its supported creation/grant path and revoke/expiry path with source provenance and audit evidence. Other effective sources retain membership; final-source removal removes the legacy projection immediately. Use controlled fixtures and the source's supported operation; never delete retained assignment rows.     |
| `assignment-external`       | external assignment lifecycle                 | For the external source, verify its supported creation/grant path and revoke/expiry path with source provenance and audit evidence. Other effective sources retain membership; final-source removal removes the legacy projection immediately. Use controlled fixtures and the source's supported operation; never delete retained assignment rows.   |
| `assignment-onboarding`     | onboarding assignment lifecycle               | For the onboarding source, verify its supported creation/grant path and revoke/expiry path with source provenance and audit evidence. Other effective sources retain membership; final-source removal removes the legacy projection immediately. Use controlled fixtures and the source's supported operation; never delete retained assignment rows. |
| `assignment-recovery`       | recovery assignment lifecycle                 | For the recovery source, verify its supported creation/grant path and revoke/expiry path with source provenance and audit evidence. Other effective sources retain membership; final-source removal removes the legacy projection immediately. Use controlled fixtures and the source's supported operation; never delete retained assignment rows.   |
| `assignment-migration`      | migration assignment lifecycle                | For the migration source, verify its supported creation/grant path and revoke/expiry path with source provenance and audit evidence. Other effective sources retain membership; final-source removal removes the legacy projection immediately. Use controlled fixtures and the source's supported operation; never delete retained assignment rows.  |
| `onboarding-link-claim`     | Onboarding, account linking and claim hooks   | Reviewed default onboarding and canonical linking produce the intended assignments; claim replacement affects only its owned external source; unrelated sources remain, and Guest is never persisted.                                                                                                                                                 |
| `websocket`                 | WebSocket events                              | The controlled WebSocket workflow enforces actor, brand, scope, ceiling where present and record ACL gates; denied events disclose no resource and perform no write.                                                                                                                                                                                  |
| `background`                | Background/internal jobs                      | The controlled internal job carries trusted explicit context and passes the same brand/scope/record gates; missing/untrusted context fails closed with no unauthorized write.                                                                                                                                                                         |
| `hook-integrator`           | Every installed hook/integrator variant       | Run at least one supported workflow for each reviewed hook/integrator owner, including its scoped route, resource denial and credential behavior. All installed variants pass; no owner or fixture is omitted.                                                                                                                                        |

Create `smoke/<instance-id>.json` for **each** reviewed fleet member, with its
`instanceId`, `mode: "enforce"`, approved `buildVersion`, approved
`registryGeneration` and a `rows` array containing exactly the row IDs above
once each. Each row must contain:

- `id`, `status: "passed"` and `actual`: all the named outcomes for that ID in
  the executable `smokeMatrix`, with exactly the expected values. Never derive
  `actual` from the expected map without executing and inspecting every probe.
- `startedAt` and `completedAt`: UTC timestamps covering that row's probes and
  cleanup. They must be after this cutover's deployment completion, ordered,
  within the approved `smokeMaxAgeSeconds` budget, and no later than the fresh
  member readiness report used for admission. Rerun stale or pre-cutover probes.
- `fixtureRef`: reference to the reviewed users/roles, both brands, resources,
  endpoint/process identity, scope/ceiling setup, hook/integrator variant and
  owner inventory used by this member. Retain all subcases, not one sample.
- `evidence`: an object with exactly the same keys as `actual`; each value is a
  nonempty durable artifact/request/test reference containing the expected versus
  actual status/decision and effect, member identity, UTC time, and all subcase/
  variant results. Include redacted audit IDs and assignment versions for writes.
- `cleanupStatus: "passed"` and `cleanupEvidenceRef`: evidence of completed
  ownership-aware cleanup and repeated drift/readiness checks after writes.
  Read-only probes still record verified absence of owned writes; they cannot
  omit cleanup evidence. Pre-existing/idempotent grants remain untouched.

For example, this deliberately incomplete fragment documents the shape and
**cannot pass**; populate every actual outcome and evidence reference from the
deployed run and include all 44 rows before requesting admission:

```json
{
  "instanceId": "portal-a",
  "mode": "enforce",
  "buildVersion": "<approved build>",
  "registryGeneration": "<approved registry>",
  "rows": [
    {
      "id": "guest-home",
      "status": "not-run",
      "actual": {},
      "startedAt": "<UTC probe start>",
      "completedAt": "<UTC cleanup completion>",
      "fixtureRef": "<reviewed fixture inventory reference>",
      "evidence": {},
      "cleanupStatus": "not-run",
      "cleanupEvidenceRef": "<cleanup evidence reference>"
    }
  ]
}
```

The `before-admission` verifier rejects missing/malformed member manifests,
wrong identity/mode/build/registry, missing/duplicate/unknown rows, any status
other than `passed`, missing or unexpected outcomes, missing per-check evidence,
invalid/stale timing and incomplete cleanup. Keep traffic isolated on any failure
and repeat all affected probes and current readiness before re-verification.
Store manifests and their referenced artifacts in the durable hashed release
bundle; operators must inspect those artifacts and confirm the complete variant
inventory. The deterministic check validates supplied evidence structure and
outcomes; it cannot certify that probes ran or replace the explicit external
operations/security admission decision.

## Solr ACL parity evidence

Record ACL strings and Solr role fields are unchanged by migration because
role keys preserve existing names. The byte-for-byte evidence is produced by
`test/integration/services/AuthorizationPhase3SolrAclParity.test.ts`
(P3-009) in the Docker integration profile (Mongo replica set + Solr from
`support/integration-testing/`): representative record docs (direct-user and
role ACLs, view/edit/empty variants) are persisted through the production
Record model, indexed through the production indexing path, the stored
`authorization_*` fields are read back raw (presence, type, order, and values
preserved with no normalization), the Phase 3 migration and protected
bootstrap run, the docs are refetched via a required successful
`Record.findOne` (no in-memory fallback), Mongo `authorization` fields are
snapshotted before/after, the docs are reindexed, the stored fields are read
back again raw, and the two reads are compared byte-for-byte.

Outside that profile the suite skips honestly: the Solr-dependent case stays
unexecuted and the blocker case records the exact missing dependency
(unreachable core, unconfigured cores, or unavailable search service). A skip
is never reported as a pass, and parity remains an open evidence item until
the integration profile executes it. Gate D CI sets
`AUTHORIZATION_GATE_D_STRICT=1` so a skip fails the gate instead of passing
silently.

## Compatibility retirement

Removal of path rules, legacy AJAX adapters, `requiredRoles` reading, and
emergency `legacy` mode happens only after documented integrator evidence —
never on calendar time alone. Keep supported transactional legacy projection
throughout the compatibility period. Before a later release removes it, require
completed production stabilization, documented usage/migration evidence for each
hook and integration, a viable credential replacement before bearer retirement,
and explicit product/security/operations/hook-owner/integrator approval. Bearer
integrations receive at least one full compatibility release after a viable
replacement exists, with telemetry, warnings, migration instructions and a dated
cutoff; the cutoff alone does not authorize removal. These external gates remain
OPEN until evidenced. See the [bearer migration guide](Legacy-Bearer-Token-Migration.md),
[rollback boundary](#phase-144-rollback-runbook), and
[Authorization Operations](Authorization-Operations.md) for operational tooling.

## Phase 15.2 stabilization closure

Admission and stabilization have separate evidence contracts. Neither
`readyForEnforce`, the shadow window, nor a passed enforce smoke matrix closes
stabilization. Run the read-only `verifyAuthorizationStabilization` probe in
`packages/redbox-core/src/authorization/stabilization.ts` against a separately
approved policy and measured fleet evidence. Its ten per-signal results and
`closed` result are machine checks on supplied evidence; they do not attest that
production probes were executed or authorize a mode change.

Before the window, operations and security approve the **exact** policy, including
start time, minimum duration, maximum sampling interval, minimum samples per
partition, collection/final-report freshness, baseline freshness, maximum series,
build/registry, serving process inventory, support feeds and **every** installed
integrator. Inventory all HTTP, websocket and background processes. Inventory
changes require new approval; a failed member cannot be omitted. Review all
bounded route/reason/category partitions for each signal, including hook traffic
in `other`, Guest, bearer and legacy adapters. Preserve approved baseline exports
from representative traffic with their start/end, sample count, completeness and
collection times. Baselines must precede approval; approval must precede the
window and follow collection recovery. Use the same partitions, denominators and
traffic mix for baseline and enforce observations.

The exported `StabilizationPolicy` and `StabilizationEvidence` types define the
complete version-1 JSON contracts. Unknown fields, unbounded labels, duplicate or
missing partitions, missing values and incomplete observations fail closed. The
policy includes `approvalRef` and `securityApprovalRef`; all evidence/owner refs
are SHA-256 references into the access-controlled durable release bundle, never
free text, credentials or ticket bodies. Hash the complete reviewed policy using
`stabilizationPolicyFingerprint(policy)` and bind that hash as
`evidence.policyFingerprint`. Changing duration, thresholds, inventory or baseline
requires a new approval and fingerprint. Verify the referenced approvals against
the site's signed release record; a hash alone is not an approval signature.

Each named member supplies contiguous, non-overlapping `samples` covering exactly
`policy.startsAt` through `evidence.endedAt`. Each sample:

- identifies the member, boot, enforce mode, reviewed build and registry;
- spans no more than `sampleIntervalSeconds`, with a complete collector/exporter
  acknowledgement and its durable `collectorRef`;
- contains every approved metric partition, all its required values, at least
  `minSamples`, a collection time after the interval and within `maxAgeSeconds`,
  and zero `unexplainedHighSeverity`;
- contains an explicit disposition for every support/integrator source, checked
  within that interval, with evidence, owner and security refs;
- contains the serving process's collection-health snapshot, checked after that
  interval within the collection freshness budget. A newly lifted CLI process's
  health cannot stand in for the serving process.

An explicit zero with complete, positive observation coverage is healthy zero.
An absent series, zero observations, missing histogram, truncated drift scan,
unsampled partition or failed exporter is **missing evidence**, never zero.
Earlier intervals remain valid historical evidence when they were collected on
time; do not replace their timestamps with the final report time. The end of the
window, final report, fleet inventory and rollback observation must also be fresh
at verification. Future approvals, observations or reports are invalid.

| Signal ID      | Required values                                       | Read-only observation and closure check                                                                                                                                                             |
| -------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `responses`    | `status401Rate`, `status403Rate`, `status404Rate`     | Counter deltas by approved route/reason/category, divided by matching independently observed HTTP request counts; include early credential denials and resource/contract/legacy helpers.            |
| `denials`      | `denyRate`                                            | Final `decisions` deny / (allow + deny) per partition; compare both absolute limit and baseline increase.                                                                                           |
| `transactions` | `status503Rate`                                       | `responses` with status `503` and transaction-unavailable reason / matching requests; keep audit/saga failures in their own reason partitions.                                                      |
| `cas`          | `status409Rate`                                       | `responses` with status `409` and version-conflict reason / matching requests; separate quorum/preview conflicts from CAS.                                                                          |
| `drift`        | `issueCount`                                          | Complete read-only assignment/projection drift scans via readiness/migration reporting, including all continuation pages; no truncation or dropped source.                                          |
| `context`      | `queriesPerResolution`, `p95Ms`, `p99Ms`, `errorRate` | Actual query-count histogram sum/count, duration histogram p95/p99 and failed/total resolutions. Histograms and resolution count must cover the whole interval; error observations remain included. |
| `orphans`      | `observationCount`                                    | Delta of `orphan_observations`, including inactive/missing scopes seen during role resolution and action gates; inspect registry/drift evidence to distinguish the two sources.                     |
| `quorum`       | `rejectionCount`                                      | Delta of `quorum_rejections` from the guard itself, including system-admin, brand-admin and bounded-query rejection; retain direct worker calls without HTTP.                                       |
| `reports`      | `openHighSeverity`                                    | Read-only support/integrator feed exports plus every required disposition; value must be zero.                                                                                                      |
| `secrets`      | `secretFindings`, `rejectedDimensions`, `seriesCount` | Secret scan of logs/exports and actual exporter series inventory, plus `telemetry_rejections`; first two must be zero and series count must fit the approved cap.                                   |

All values must meet both the approved absolute `max` and additive
`maxIncrease` above the matching baseline. Equality passes. Rates are fractions
between 0 and 1. A zero baseline still enforces the additive increase; there is no
divide-by-zero waiver. Compare p95 and p99 independently with the agreed latency
budgets, and query count with the agreed per-resolution query budget. Never
average per-member percentiles: retain each member's histogram distribution and
compare each approved partition. Document bucket precision when approving the
budget. An unexplained high-severity signal always blocks closure even below a
numeric threshold. Excessive cardinality and secret findings cannot be waived by
raising a threshold. Threshold breaches require investigation and a newly
approved observation window; do not rewrite earlier observations.

Support dispositions are `no-reports`, `resolved`, or `explained-approved`.
Each requires owner and security evidence, including explicit coverage when no
reports arrived. Open high-severity reports, unknown/missing integrators,
unreviewed explanations and missing disposition timestamps keep closure OPEN.
Preserve detailed triage and closure evidence in the protected bundle, not metric
labels. Continue monitoring throughout the compatibility period after closure.

Run the ten read-only probes from the repository after compiling the reviewed
core package. The command reads two bounded JSON files, performs no Sails lift,
network call, mutation or mode change, and prints all ten signal results. Exit
`0` means the supplied evidence satisfies closure; exit `2` keeps it OPEN,
including on missing, malformed, oversized or unavailable input.

```bash
node scripts/authorization-stabilization.js \
  "$EVIDENCE_DIR/stabilization-policy.json" \
  "$EVIDENCE_DIR/stabilization-evidence.json" \
  > "$EVIDENCE_DIR/stabilization-result.json"
```

Preserve the command result, input hashes, independent collector exports,
readiness/drift reports, support dispositions, approvals and security scan in the
durable release bundle. Operations/security record closure only after reviewing
those sources and a successful probe. A fabricated `complete: true` flag is not
evidence of a successful collector query.

### Collection failure, recovery, restart and rollback

Configure `AUTHORIZATION_COLLECTION_HEALTH_FILE` to a private persistent-volume
file unique to each serving process before shadow smoke. The parent directory
must already exist and survive process/container replacement. Collection-health
writes contain only boot/timestamps, state and counters; they use a private file,
atomic rename and file/directory fsync. Unconfigured, corrupt or unwritable
storage cannot establish continuous healthy evidence. Do not share a file among
concurrent processes or delete it to clear failures.

Read `AuthorizationRolloutService.getCollectionHealth()` through the site's
existing privileged in-process operator adapter. This read-only probe never
writes, clears a gap or fabricates a successful persistence attempt. Establish
collection with the controlled shadow mismatch smoke before approval; an empty
mismatch list alone cannot prove the writer works. Every failed persistence
attempt is counted. Each fail/recover/fail transition is logged with fixed fields
and counted, including synchronous adapter throws. Recovery requires an actual
successful mismatch persistence and successful durable health write; it does not
restore lost mismatch evidence. Readiness reports
`authorization-readiness.collection-evidence-gap` while health is unknown,
failed, non-durable, or telemetry failures/rejections have occurred.

A restart retains durable failure/recovery counters but starts a new boot in
`unknown` state and opens a gap. Stabilization cannot stitch different boots,
changed counters, a recovered in-window outage or missing exporter intervals into
a clean window. Investigate the incident, restore collection, re-run the relevant
isolated smoke/recovery checks, obtain current operations/security approval, then
start a fresh full window. Exporter failures/rejected dimensions are sticky for
the boot; after repair restart under the same recovery process. Never use a
restart, successful later write or evidence-file deletion to make an earlier gap
look healthy. Read-only readiness CLI instances are not serving-process probes.

During an incident after admission, follow the existing re-isolation, draining,
fleet-convergence and retained-security rules. Any rollback aborts the enforce
stabilization window, even if the fleet later returns to enforce. Record rollback
in the bundle; `rollback.occurred: true` fails this closure contract. Keep all ten
signals active in legacy mode during the Phase 14.4 rollback observation, together
with its timing, exposure and retained-security smoke. A subsequent enforce
attempt requires current readiness, the complete Phase 15.1 smoke matrix,
admission approval and a new stabilization policy/window. No closure removes
PathRules, transactional legacy projection, legacy AJAX/bearer support, credential
ceilings or the supported rollback boundary.
