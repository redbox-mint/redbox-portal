# Operating Authoritative Server-Side Form Validation

ReDBox executes the validators declared by the exact form on every in-scope
metadata-changing save. The browser still provides immediate feedback, but the
server independently resolves the form, operation, validation groups, and
candidate. Deployments start in `shadow` mode so existing integrations and
historical records can be assessed before enforcement.

## Rollout configuration

The core default is:

```javascript
recordValidation: {
  mode: 'shadow',
  timeoutMs: 5000
}
```

`timeoutMs` is one wall-clock budget shared by blocking conditional expressions,
blocking validators, and any advisory pass. Advisory validation receives only
the time left after blocking work, so enabling advisory groups does not silently
double the configured budget. The deadline is anchored before blocking
expression/validator work. Elapsed time is checked around synchronous JSONata
and validator units as well as by a Promise timer, so event-loop-blocking work
is still classified as a timeout once control returns. The service cannot
cancel work that has already started. Late completion is ignored and late
rejection is absorbed, so validators and expressions must remain deterministic
and side-effect free.

Mode precedence, from least to most specific, is:

```text
global -> global operation -> record type -> record-type operation
```

For example:

```javascript
// config/recordValidation.js or an environment/hook override
module.exports.recordValidation = {
  mode: 'shadow',
  timeoutMs: 5000,
  operations: {
    publish: { mode: 'shadow' }
  }
};

// config/recordtype.js
recordValidation: {
  mode: 'shadow',
  operations: {
    submit: { mode: 'enforce' },
    publish: { mode: 'shadow' }
  }
}
```

Workflow-stage configuration may replace groups and restrict roles or target
steps, but it cannot set mode. This keeps the enforcement unit stable as
`(record type, operation)`. An omitted operation runs every blocking validator,
regardless of the form's conditional/default group subset. It is the
strict-all/default unit and should be reviewed separately from named operations.
A supplied named operation is always resolved and authorized, including on
authorization-only, non-form system-metadata, and no-change updates. Those
classifications remain exempt from conditional-group and form-validator
execution; only the named operation contract is enforced. If no operation is
supplied, exempt updates retain their validation skip, while metadata/form
changes retain the strict-all behavior above.
A named operation with `enabledValidationGroups: []` has the same all-groups
sentinel. In either strict-all case, validators that belong only to advisory
groups discovered from suggested summaries are omitted from the blocking pass
and run separately. Strict-all is not itself an advisory overlap; only an
explicit named group selected for both passes is a configuration error.
An advisory group must use `initialMembership: 'none'`. An advisory group with
`initialMembership: 'all'`—including the built-in `all` group—is rejected as
malformed and is not evidence that a validator is advisory-only or a reason to
exclude it from strict-all enforcement. Advisory validator findings, execution
failures, and timeouts remain nonblocking. Malformed advisory summaries and
unknown or invalid advisory groups are enforcement-configuration errors: they
remain observable in shadow mode and block the save in enforce mode.

Rich-text sanitation is a candidate transformation, not a blocking validator
failure. In the default `record.form.htmlSanitizationMode: 'sanitize'`,
`htmlSanitized` is reported with advisory issues and the cloned transformed
candidate is threaded through approval, persistence, and later hooks in both
shadow and enforce rollout modes. Caller-owned objects are not mutated. In
`reject` mode the value is not transformed and `htmlUnsafe` remains a blocking
finding, subject to the configured shadow/enforce rollout decision.
Each transformation carries its exact source value and schema-owned path. The
application boundary requires that path to resolve to the same string before it
replaces the value, and it applies transformations returned by the blocking and
advisory validator passes as well as the initial sanitation pass.
Sanitation runs before ordinary field and form validators, including for each
repeatable row, so required, length, and custom validators see the value that
can actually be persisted. Successful saves with sanitation advisories return
`saved-with-warnings` and include the safe advisory issues.
If a later blocking expression, validator, timeout, or unknown-group path makes
the result unresolved in shadow mode, the typed unresolved result retains the
successfully sanitized candidate and `RecordsService` persists that safe clone.
A stale, mismatched, non-string, or malformed transformation is never ignored: the save
fails closed in both modes rather than persisting the raw value.

## Authoritative expression context

Conditional group expressions receive one JSON-like object:

```typescript
{
  formData,
  operation,
  recordType,
  formName,
  brand,
  workflow: { currentStep, targetStep },
  requestParams,
  runtimeContext,
  actor: { authenticated, roles }
}
```

Browser and API routes use the same request-fact projector. The only facts the
transport can offer are bounded `recordType` and `targetStep` references plus
boolean `merge` and `datastreams`; `recordValidation.allowedRequestParameters`
must also allow a name before it appears in `requestParams`. Runtime write facts
are the normalized `routeFamily`, `writeKind`, and `saveOperation`. Only trusted
internal callers may add JSON-only runtime facts. Public facts are projected
only from the route family's explicit validated path/query inputs; body metadata
cannot override operation or browser transition intent. Raw request, response,
session, user, header, token, credential, and attachment objects are never
available to expressions.

## Logs and telemetry

Each resolution writes the structured `record_validation_completed` event with
safe identifiers and counts:

- request ID, record type, form version, validation operation, and mode;
- resolved/unresolved status, stable outcome, actual and would-block flags;
- blocking/advisory error counts, timeout kind, configuration-diagnostic
  count, stable diagnostic codes, and duration.

Record values, expression values, request parameters, runtime context, actor
identities, and exception text are not included.

The OpenTelemetry meter is `redbox.record-validation` and emits:

| Instrument | Type | Purpose |
|---|---|---|
| `redbox.record_validation.duration` | histogram, ms | End-to-end resolution latency |
| `redbox.record_validation.runs` | counter | Mode/outcome/status volume |
| `redbox.record_validation.blocking_errors` | counter | Blocking validator errors |
| `redbox.record_validation.advisory_errors` | counter | Advisory validator errors |
| `redbox.record_validation.timeouts` | counter | Blocking/advisory timeouts |
| `redbox.record_validation.configuration_diagnostics` | counter | Safe configuration/execution findings |
| `redbox.record_validation.diagnostics` | counter | Findings by stable code |

Metric dimensions include deployment-resolved record type, operation, form,
write kind, validation phase, mode, status, and outcome. Unresolved or
untrusted record type, form, and operation values are reduced to fixed
`unresolved`, `unknown`, or `malformed` buckets. Diagnostic counters add only a
stable diagnostic code and the fixed diagnostic scope; validator class/code,
field, pointer, lineage, and expression names are never metric attributes.
Request IDs, expressions, submitted values, and request parameters are also
excluded. Configure the deployment's OpenTelemetry SDK/exporter to retain these
bounded instruments.

Detailed safe expression and validator identities remain available in capped
diagnostic/log payloads, not in metric labels. Use exported telemetry for
multi-instance or long-term reports.

## Historical-record repair

Enforcement validates the complete candidate. It does not grandfather invalid
fields that were written before server authority existed.

1. Collect representative shadow traffic for create, update, and transition.
2. Group exported telemetry by record type, operation, form, and diagnostic code.
3. Resolve configuration failures first: missing forms/groups, unsupported
   event-driven expressions, policy errors, and timeouts are not record repair.
4. Export and back up affected records through the installation's normal
   operational process.
5. Repair records through the ordinary `RecordsService` save boundary whenever
   the candidate can pass the current form.
6. If current validators make an incremental repair impossible, use the narrow
   audited `historical-record-repair` bypass once, then perform an ordinary
   validated read/update check.
7. Re-run the shadow traffic sample and retain evidence of the repaired population.

Do not change the form to weaken a rule solely to hide historical failures, and
do not use direct storage updates as a repair mechanism.

## Internal bypass procedure

Bypass is not an HTTP parameter. Internal TypeScript callers construct a save
context with the runtime-checked capability:

```typescript
createRecordSaveContext({
  routeFamily: 'internal',
  operation: 'update',
  validationBypass: {
    mode: 'bypass',
    reason: 'historical-record-repair',
    actor: { kind: 'service', id: 'HistoricalRecordRepairService' }
  }
});
```

Approved reasons are `historical-record-repair`, `trusted-data-migration`, and
`configuration-recovery`. The actor ID must identify the responsible service.
The durable `validation-bypassed` audit includes the request ID, CRUD and
validation operations, phase, service/reason, and safe record/form/type/brand
context. It contains no metadata values. If the audit is absent, rejected, or
unconfirmed, the write is rejected.

### Bypass and unvalidated-write inventory

| Path | Validation/audit behavior |
|---|---|
| Public/browser `RecordsService.create`, `updateMeta`, and transition | Final candidate is authoritatively validated and object edit authorization is enforced; target-step and transition-role checks are retained/repeated after hooks; hook trigger flags do not disable validation |
| Context-free internal `RecordsService.create`/`updateMeta` calls | Authoritatively validated with the strict-all omitted-operation policy |
| Approved internal save context | Validation is bypassed only after a durable, payload-free `validation-bypassed` audit |
| `RecordsService.bootstrapData` | Uses the approved `trusted-data-migration` bypass and therefore requires durable audit storage |
| `RecordsService.createBatch` | V1 direct-storage path; writes `batch-validation-bypassed` with `validationStatus: 'unvalidated'` before forwarding the batch |
| Calling a storage hook directly | Outside the authoritative service boundary, unsupported, and not represented as a validated write |

This is the complete supported inventory. New integrations should use validated
per-record saves; do not describe a successful direct batch or storage-hook
write as validated.

`StorageService.createRecordAudit` remains optional in the TypeScript interface
so existing out-of-tree storage hooks continue to compile. It is a runtime
requirement for explicit validation bypasses, bootstrap-data bypasses, and
`createBatch`; each of those paths fails closed before its record
write when the method is absent or durable success is not confirmed. A custom
storage hook that supports these paths must implement idempotent audit lookup
and durable `createRecordAudit` semantics matching its normal persistence
guarantees.

## Workflow and hook authority

Browser step transitions enter the same authoritative `RecordsService`
transition path as API saves. They do not pre-mutate workflow metadata and then
perform a context-free update. Create and transition candidates are bound to the
canonical target step resolved by `WorkflowStepsService` and its form; a
same-name caller-supplied step object cannot replace its authorization or hook
context. An explicit target that is missing,
malformed, or unresolved is rejected before hooks or persistence. Missing,
malformed, or conflicting final candidate form references are normalized to
that authoritative form before persistence, while explicit
brand/type/workflow divergence is rejected. Update hooks are selected from the
stored authoritative record type only. `redboxOid` is the public record UUID
and is the only identity bound to the update route OID; a conflicting
`redboxOid` is rejected before hooks or persistence. Waterline `id` and Mongo
`_id` are distinct storage primary keys, remain distinct in authoritative
snapshots and hook candidates, and are stripped only from adapter-bound create
and update payloads. They are never overwritten with the route UUID. The route
OID is also rebound onto the update response passed to postSync hooks and is
used directly for detached hooks, secondary metadata writes, attachments,
indexing, audit, reload, and the public save response; an adapter response OID
cannot redirect update side effects. Configured creates select their public OID
before pre-save hooks: hook replacements that omit it are rebound to that OID,
while conflicting replacements are rejected before validation, attachment
journaling, or persistence. The same preselected OID is authoritative for all
configured-create hooks and downstream effects. Ordinary
object-edit, target-step, and transition-role authorization
is checked independently of validation operation policy and checked again
after authoritative hook output. If a public update cannot load a usable
original snapshot, it fails closed as a system pre-save error rather than
reporting an edit-authorization denial that was never decided.

## Signoff and enforcement

For every `(record type, operation)` unit, retain a signoff record containing:

- owner and reviewer;
- forms and workflow targets covered;
- representative traffic dates and volume;
- failure codes and their dispositions;
- historical repair or approved bypass procedure;
- p50/p95/p99 latency and timeout rate;
- rejection and postSync-warning alert thresholds;
- confirmation that logs contain no values or request parameters;
- the configuration change and rollback operator.

Enable one unit at a time. After deployment, confirm the
deployment configuration and monitor invalid, configuration-error,
timed-out, request-rejected, and post-save warning rates before expanding.

## Rollback

Rollback changes only the affected record-type/operation mode to `shadow`; it
does not remove validator definitions, operation names, or client intent.

1. Change the smallest affected mode override to `shadow`.
2. Restart/redeploy through the normal configuration process.
3. Confirm saves are response-neutral while telemetry still records
   `would_block` candidates.
4. Investigate and repair the failure class before requesting new signoff.

Test this procedure before the first enforcement change. Never roll back by
adding an HTTP bypass or trusting client-supplied validation groups.
