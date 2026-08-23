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
  timeoutMs: 5000,
  shadowReportMaxSeries: 1000
}
```

`timeoutMs` covers blocking conditional expressions and blocking validators.
`shadowReportMaxSeries` bounds the number of process-local report rows to
10,000 or fewer. Invalid values fall back to the core defaults.

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
  shadowReportMaxSeries: 1000,
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
`(record type, operation)`. An omitted operation is the strict-all/default
unit and should be reviewed separately from named operations.

At startup, ReDBox normalizes the global and record-type mode layers, hashes
them, and reads audits under the synthetic OID `record-validation-rollout`.
The first baseline and each changed fingerprint are saved with action
`validation-mode-changed`. Startup fails if a changed snapshot cannot be
durably confirmed. Unchanged restarts do not create duplicate audit rows.

## Logs, telemetry, and the shadow report

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

Metric dimensions are record type, operation, form, mode, status, and outcome;
request IDs are deliberately excluded to control cardinality. Configure the
deployment's OpenTelemetry SDK/exporter to retain these instruments.

`RecordValidationService.getShadowReport()` returns a bounded process-local
aggregate by record type, operation, form, and code. Each row reports run and
would-reject counts, blocking/advisory errors, timeouts, configuration
diagnostics, and latency. A run with multiple codes contributes once to each
code row. `overflowRuns` must remain zero; increase the cap only after checking
that unexpected form/operation identifiers are not causing cardinality growth.
Use exported telemetry, rather than this process-local view, for multi-instance
or long-term reports.

## Historical-record repair

Enforcement validates the complete candidate. It does not grandfather invalid
fields that were written before server authority existed.

1. Collect representative shadow traffic for create, update, and transition.
2. Group the report by record type, operation, form, and diagnostic code.
3. Resolve configuration failures first: missing forms/groups, unsupported
   event-driven expressions, policy errors, and timeouts are not record repair.
4. Export and back up affected records through the installation's normal
   operational process.
5. Repair records through the ordinary `RecordsService` save boundary whenever
   the candidate can pass the current form.
6. If current validators make an incremental repair impossible, use the narrow
   audited `historical-record-repair` bypass once, then perform an ordinary
   validated read/update check.
7. Re-run the shadow report and retain evidence of the repaired population.

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

`RecordsService.createBatch` is the one documented v1 direct-storage bypass.
It writes a `batch-validation-bypassed` audit with `validationStatus:
'unvalidated'` before forwarding the batch. New integrations should use
validated per-record saves; do not describe a successful direct batch as
validated.

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
`validation-mode-changed` audit and monitor invalid, configuration-error,
timed-out, request-rejected, and post-save warning rates before expanding.

## Rollback

Rollback changes only the affected record-type/operation mode to `shadow`; it
does not remove validator definitions, operation names, or client intent.

1. Change the smallest affected mode override to `shadow`.
2. Restart/redeploy through the normal configuration process.
3. Confirm a new `validation-mode-changed` audit referencing the previous
   fingerprint.
4. Confirm saves are response-neutral while telemetry still records
   `would_block` candidates.
5. Investigate and repair the failure class before requesting new signoff.

Test this procedure before the first enforcement change. Never roll back by
adding an HTTP bypass or trusting client-supplied validation groups.
