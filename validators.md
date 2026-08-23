# Authoritative Server-Side Form Validation

Status: implemented; enforcement remains opt-in per record type and operation.

This document records the resolved decisions from the original server-side
validators planning brief. The operational runbook is
[`support/wiki/Server-Side-Form-Validation-Operations.md`](support/wiki/Server-Side-Form-Validation-Operations.md),
and form-author guidance is in
[`support/wiki/Configuring-Record-Forms.md`](support/wiki/Configuring-Record-Forms.md).

## Resolved decisions

1. The authoritative initial group state is the exact resolved form's
   `enabledValidationGroups`, folded through its declared conditional group
   expressions. A trusted validation operation supplies an exact group set
   last. Omitting the operation retains strict form-derived behavior.
2. Angular and Sails use the shared `calculateValidationGroups()` helper from
   `sails-ng-common`. An empty enabled-group array still means all validators;
   the declared `none` group means none.
3. The server evaluates only deterministic form-ready JSONata rules against a
   sanitized context. It does not replay browser events. JSONPointer event
   routes, `value.changed`, and browser-only bindings are configuration
   diagnostics.
4. The expression context contains only candidate `formData`, operation,
   record type, form, brand, current/target workflow steps, allowlisted request
   parameters, explicit runtime context, authentication state, and normalized
   roles. Raw requests, sessions, user identities, credentials, and arbitrary
   parameters are absent.
5. Save intent is the optional, case-sensitive `operation` query/config value.
   It maps to `RecordSaveContext.validationOperation` and remains separate from
   CRUD operation and workflow `targetStep`.
6. Suggested-summary validation groups are executed in a separate advisory
   pass. Advisory failures, exceptions, and timeouts never block or alter save
   responses.
7. Validation runs after transition and pre-save hooks have produced the final
   candidate, but before attachment preparation or primary persistence.
8. Create uses the starting or requested target-step form. Update uses the
   complete merged candidate form. Transition uses the target-step form.
   postSync replacement candidates are validated before secondary persistence.
9. `RecordValidationService` reuses `ConstructFormConfigVisitor`,
   `ValidatorFormConfigVisitor`, validator definitions, and shared JSONata
   helpers. It does not define a parallel validator framework.
10. Blocking validator failures map to safe, field-addressable
    `RecordSaveIssue` values. Form, expression, configuration, execution, and
    timeout failures map to stable system codes without raw exception text.
11. Internal writes validate by default. Bypass is an internal-only typed
    capability with an approved reason and service identity; it is accepted
    only after a synchronous durable audit. HTTP callers cannot request it.
12. The direct v1 `createBatch` storage path remains unvalidated and writes a
    durable `batch-validation-bypassed` audit before storage.
13. Rollout precedence is global mode, global operation, record type, then
    record-type operation. The default is shadow, and workflow stages cannot
    change rollout mode.
14. A startup audit fingerprints normalized rollout mode configuration. The
    first baseline and every subsequent change are durably recorded; startup
    fails if a changed snapshot cannot be confirmed.
15. Every validation resolution emits bounded OpenTelemetry duration, run,
    blocking/advisory error, timeout, configuration-diagnostic, and diagnostic
    code instruments plus one safe structured log.
16. A bounded process-local shadow report aggregates by record type,
    validation operation, form version, and safe diagnostic code. Production
    dashboards should consume exported telemetry for cross-process history.
17. Form definitions, compiled expressions, and validator maps use bounded,
    fingerprinted caches. Candidate results and user/request data are never
    cached.
18. Enforcement requires representative shadow evidence, classified
    historical/configuration failures, a repair or bypass path, record-type
    owner signoff, and a tested configuration-only rollback to shadow.
19. Parity is locked by shared-package validation-group/JSONata tests, existing
    visitor tests, service resolution tests, RecordsService write-boundary
    tests, REST v1/v2 contract tests, and Angular save/operation tests. The
    security cases include direct API calls, misleading client groups, and
    operation authorization independently of the browser.
20. `FormRecordConsistencyService.validateRecordValuesForFormConfig()` remains
    a useful consistency helper, but it is not the authoritative write
    boundary. `RecordValidationService` owns exact form/operation/context
    resolution and `RecordsService` invokes it after candidate-building hooks
    and before persistence, including validation of postSync replacements.

## Authoritative flow

```text
request or internal caller
  -> complete candidate and pre-hooks
  -> exact form and operation policy
  -> sanitized context and effective groups
  -> blocking/advisory validator visitors
  -> shadow observation or enforcement decision
  -> attachments and persistence
  -> validated postSync secondary candidate
```

Client-supplied validation groups remain interactive UX only and are never an
authority input to this flow.
