# Effect-Based Ingestion and Integration Audit Revision

## Summary

The ingestion framework should use Effect throughout its integration runtime, following the newer RAiD/ONI integration patterns.

Harvest and integration audit serve different purposes and both are required:

- `HarvestRun`, `HarvestRunChunk`, and `HarvestRecordEvent` answer: “What records were processed, created, updated, skipped, or failed?”
- `IntegrationAudit` answers: “Which external API operations occurred, how many HTTP attempts were made, how long they took, what status was returned, and which trace/run caused them?”
- OpenTelemetry spans, structured Effect logs, and metrics provide detailed runtime diagnosis without turning persistent audit storage into a raw request log.

The revised design will create one correlated trace per ingest run:

```text
Ingest run trace
├── Provider page request
│   ├── HTTP attempt 1
│   └── HTTP attempt 2
├── Crosswalk and validation
├── Harvest chunk persistence
├── Provider page request
│   └── HTTP attempt 1
└── Reconciliation
```

The root run and each logical provider API request will be persisted in `IntegrationAudit`. Individual retry attempts will be recorded as child OpenTelemetry spans and as a bounded attempt summary on the logical request’s terminal audit entry.

This gives administrators enough information to distinguish:

- Provider outage or timeout.
- Authentication failure.
- Rate limiting.
- Retries that eventually succeeded.
- Provider schema/response failure.
- Mapping failure.
- Identity conflict.
- ReDBox persistence/indexing failure.

## 1. Data Model (Waterline Models)

Retain the proposed ingestion models:

- `RecordIngestSource`
- `RecordIngestSourceRevision`
- `RecordIngestIdentity`
- `RecordCanonicalIdentifier`

Add these observability fields to `RecordIngestSource`:

- `lastRunTraceId`
- `lastProviderStatusCode`
- `lastProviderRequestAt`
- `consecutiveProviderFailures`
- `providerCircuitState`: `closed | open | half-open`
- `providerCircuitOpenedAt`

Store the root integration trace ID in `HarvestRun.metadata.integrationTraceId`. Store `recordIngestSourceId`, `providerKey`, configuration revision, and checkpoint summary in the same metadata object.

### Integration audit generalisation

The current integration audit implementation is record-centric: its queries require `redboxOid`. Ingestion needs audit records before any ReDBox record OID exists, so extend:

- `packages/redbox-core/src/model/storage/IntegrationAuditModel.ts`
- `packages/redbox-core/src/IntegrationAuditParams.ts`
- `packages/sails-hook-redbox-storage-mongo/src/models/IntegrationAudit.ts`
- `packages/sails-hook-redbox-storage-mongo/src/services/MongoStorageService.ts`

Add optional fields:

- `subjectType`: `record | recordIngestSource | harvestRun | recordIngestOperation`.
- `subjectId`
- `recordIngestSourceId`
- `harvestRunId`
- `providerKey`
- `operationId`
- `notificationEligible`: defaults to `true` for existing integrations.
- `attemptCount`

Make `redboxOid` optional. Validation must require either:

- A non-empty `redboxOid`; or
- A non-empty `subjectType` and `subjectId`.

Existing record integrations automatically use `subjectType: "record"` and `subjectId: redboxOid`.

Add storage indexes for:

- `{ redboxOid, startedAt: -1 }`
- `{ brandId, subjectType, subjectId, startedAt: -1 }`
- `{ brandId, recordIngestSourceId, startedAt: -1 }`
- `{ brandId, harvestRunId, startedAt: -1 }`
- `{ traceId, spanId, startedAt: 1 }`
- `{ providerKey, status, startedAt: -1 }`

Existing integration audit records remain valid and existing record-audit endpoints remain compatible.

## 2. Services Layer (Business Logic)

### Effect integration runtime

Add:

`packages/redbox-core/src/services/record-ingest-v2/`

Files:

- `types.ts`
- `errors.ts`
- `tags.ts`
- `http.ts`
- `audit.ts`
- `observability.ts`
- `runtime.ts`
- `providers/ror.ts`
- `providers/crossref-funders.ts`
- `providers/ardc-activities.ts`

Use the shared `runEffectProgram()` bridge from `services/integration-v2/runtime.ts` at the imperative service boundary.

### Effect context tags

Define typed context tags for:

- `RecordIngestConfigTag`
- `RecordIngestRunContextTag`
- `RecordIngestProviderTag`
- `RecordIngestHttpClientTag`
- `RecordIngestAuditTag`
- `RecordIngestHarvestRepositoryTag`
- `RecordIngestRecordRepositoryTag`
- `RecordIngestIdentityRepositoryTag`
- `RecordIngestCrosswalkTag`
- `RecordIngestClockTag`

The run context contains:

- Brand ID and name.
- Source ID and name.
- Provider key.
- Harvest run ID.
- Trace ID.
- Trigger source: `schedule | manual | preview | connectionTest`.
- Configuration revision.
- Actor, when initiated manually.
- Current durable-run attempt.

Provider adapters must return Effects or use Effect-backed collaborators. They must not implement independent Axios retry loops.

### Tagged errors

Define typed errors with safe diagnostic fields:

- `RecordIngestConfigurationError`
- `RecordIngestAuthenticationError`
- `RecordIngestRateLimitError`
- `RecordIngestTimeoutError`
- `RecordIngestHttpError`
- `RecordIngestProviderSchemaError`
- `RecordIngestMappingError`
- `RecordIngestIdentityConflictError`
- `RecordIngestPersistenceError`
- `RecordIngestLeaseError`
- `RecordIngestInterruptedError`

HTTP-related errors include:

- `providerKey`
- Sanitised method/path.
- HTTP status.
- Provider request ID where available.
- `retryable`.
- Optional `retryAfterMs`.
- Redacted, capped response summary.
- Cause.

### Retry and timeout policy

Use Effect `Schedule` and `Effect.timeoutFail`:

- Retry network failures, timeouts, HTTP 429, and configured 5xx statuses.
- Do not retry authentication, invalid configuration, schema, mapping, or identity failures.
- Default maximum: three attempts per logical request.
- Exponential delay bounded by configured maximum.
- Apply jitter.
- Honour `Retry-After` when supplied, capped by configured maximum delay.
- Make requests interruptible with `AbortController`.
- Propagate Agenda cancellation or shutdown as Effect interruption.
- Record interruption separately from provider failure.
- Advance provider checkpoints only after the associated harvest chunk commits.

Durable job retry remains separate from short HTTP retry:

- Effect retries individual API calls.
- Agenda retries/requeues an interrupted or failed ingest run according to durable policy.
- The durable attempt retains the same correlation/root trace when resuming the same logical run.
- A newly requested run receives a new trace.

### OpenTelemetry and structured logs

Add `record-ingest-v2/observability.ts` following existing Figshare observability conventions.

Root span:

- `record-ingest.run`

Child spans:

- `record-ingest.provider.fetch-page`
- `record-ingest.http.request`
- `record-ingest.http.attempt`
- `record-ingest.crosswalk`
- `record-ingest.identity.resolve`
- `record-ingest.harvest.persist-chunk`
- `record-ingest.reconcile`

Safe span attributes:

- `record_ingest.brand_id`
- `record_ingest.source_id`
- `record_ingest.provider`
- `record_ingest.harvest_run_id`
- `record_ingest.config_revision`
- `record_ingest.trigger`
- `record_ingest.page_number`
- `record_ingest.record_count`
- `http.request.method`
- Sanitised route template, not a secret-bearing URL.
- `http.response.status_code`
- `http.request.resend_count`
- `error.type`
- `retryable`

Do not attach:

- API keys or authorisation headers.
- Full URLs containing query values.
- Full request/response payloads.
- Record metadata.
- Researcher/personally identifiable data.
- High-cardinality external record identifiers as metric labels.

Structured Effect logs use `Effect.annotateLogs` with the run correlation fields and the existing redaction utilities.

### Metrics

Add low-cardinality Effect/OpenTelemetry metrics:

- Provider requests by provider and outcome.
- Provider request latency.
- Retry attempts.
- Rate-limit responses.
- Timeouts.
- Provider records received.
- Records created, updated, unchanged, inactive, or failed.
- Mapping failures.
- Identity conflicts.
- Run duration.
- Circuit state transitions.

Brand/source/run IDs may appear in traces and logs but not metric dimensions.

### Persistent integration audit

Extend `IntegrationAuditName` with:

- `recordIngest`

Extend `IntegrationAuditAction` with:

- `recordIngestRun`
- `recordIngestConnectionTest`
- `recordIngestPreview`
- `recordIngestFetchPage`
- `recordIngestReconciliation`

For a normal run:

1. Start a root `recordIngestRun` audit entry.
2. Store its trace ID in `HarvestRun.metadata.integrationTraceId`.
3. For every logical provider page request, start a child `recordIngestFetchPage` audit sharing the root trace and using the root span as parent.
4. Complete or fail the page audit after all immediate Effect retries finish.
5. Complete or fail the root run audit when the harvest run reaches its terminal state.

Each logical request’s audit summary contains:

Request summary:

- Provider key.
- Source ID.
- Harvest run ID.
- HTTP method.
- Sanitised host and route template.
- Safe filter summary.
- Page/offset or checkpoint digest.
- Configured timeout and maximum attempts.

Response summary:

- Final HTTP status.
- Result count.
- Response byte count when available.
- Provider request/correlation ID.
- Rate-limit remaining/reset values.
- Total attempt count.
- Bounded attempt array containing attempt number, status/outcome, duration, and retry delay.
- Next-checkpoint digest.
- Whether another page is available.

No body content, credentials, or raw headers are persisted.

Connection tests and previews also receive an operation ID and trace. Saved sources use `subjectType: "recordIngestSource"`; unsaved previews use `subjectType: "recordIngestOperation"`.

### Audit versus harvest ownership

Use `IntegrationAudit` for:

- External connection tests.
- Preview API calls.
- Provider page requests.
- HTTP statuses.
- Timings and retries.
- Rate limits.
- Provider request IDs.
- Transport and provider-schema failures.
- Overall integration trace hierarchy.

Use `HarvestRun` for:

- Overall ingest progress and counts.
- Source, target record type, checkpoints, and chunks.
- Completed, completed-with-errors, or failed state.

Use `HarvestRecordEvent` for:

- Individual external record ID.
- Resulting ReDBox OID.
- Create/update/unchanged/inactive/failure outcome.
- Mapping validation errors.
- Identity conflicts.
- Persistence failures.
- Capped, sanitised record-specific diagnostic detail.

Do not write one integration audit entry per imported record. That would duplicate harvest events and produce excessive audit volume.

### Notification behaviour

Page-request audit entries set `notificationEligible: false`.

Only the root run failure is notification-eligible. Extend integration notification handling so a record-ingest notification can link to:

`/:branding/:portal/admin/harvest-runs?run=<harvestRunId>`

Recovery notification is emitted only after a later scheduled run for the same source succeeds. Existing record integration notification behaviour remains unchanged.

### Circuit breaking

Maintain a lightweight source-level circuit state:

- Open after the configured number of consecutive transport/authentication failures.
- Do not open for mapping, identity, or ReDBox persistence failures.
- While open, scheduled runs are skipped and recorded without making a provider call.
- After the cooldown, allow one half-open connection request.
- Close on success.
- Manual Admin connection tests may probe an open circuit but must display that they are doing so.

Every circuit transition is logged and added to the root integration audit summary.

## 3. Webservice Controllers (REST API)

Retain the record-ingest configuration and execution API from the original plan.

Extend `IntegrationAuditController` with:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/integration-audit/subjects/:subjectType/:subjectId` | Audit traces for a source, run, or operation |
| GET | `/api/integration-audit/traces/:traceId` | One complete correlated trace |
| GET | `/api/integration-audit/:oid` | Existing record-centric endpoint, unchanged |

Scoped endpoints require Admin and enforce brand ownership.

Supported filters:

- `status`
- `integrationName`
- `integrationAction`
- `providerKey`
- `dateFrom`
- `dateTo`
- `page`
- `pageSize`

Queries must always contain an OID, subject pair, or trace ID; unbounded integration-audit queries are rejected.

Extend the harvest-run response to expose:

- `integrationTraceId`
- Provider call counts.
- Retry count.
- Last provider HTTP status.
- Provider request failures.
- Rate-limit events.

These are derived summaries; detailed events remain in integration audit.

## 4. Ajax Controllers (Controllers)

No new AJAX controller is required.

The Angular applications use CSRF-protected webservice APIs. Existing typeahead lookup routes remain unchanged.

## 5. Angular App(s)

Retain the planned `record-ingest` administration app.

Add an Observability section to source details showing:

- Current circuit state.
- Last successful provider call.
- Last provider status.
- Consecutive provider failures.
- Recent integration traces.
- Connection-test and preview traces.
- Link to the associated harvest run.

Extend the existing `harvest-runs` Angular app with an `API calls` tab:

- Load the trace identified by `HarvestRun.metadata.integrationTraceId`.
- Display the trace hierarchy.
- Show provider action, status, duration, attempts, HTTP status, result count, and rate-limit summary.
- Visually distinguish a provider failure from a mapping or persistence failure.
- Never render raw credentials, headers, payloads, or stack traces.
- Allow Admin users to copy the trace ID for support tickets.

The summary screen should answer without opening raw logs:

- Did ReDBox reach the provider?
- Did the provider authenticate the request?
- How many requests and retries occurred?
- Which request failed?
- Was ReDBox rate limited?
- Did the provider return records?
- Did ingestion subsequently fail during mapping or persistence?

## 6. Additional Views

No additional EJS page beyond the previously planned `admin/record-ingest.ejs` is required.

Update the existing harvest-runs embedded app rather than creating a separate observability page.

The existing record-level integration audit view remains unchanged for DOI, Figshare, RAiD, and ONI.

## 7. Navigation Configuration

Retain the planned Admin navigation entry for `Record ingestion`.

Do not add a separate top-level integration-audit menu item. Audit information should be reached from:

- A record’s audit page.
- A record-ingest source.
- A harvest run.
- A copied trace URL.

Add translation keys for provider calls, retries, rate limits, circuit states, trace IDs, connection failures, mapping failures, and persistence failures.

# Consistency Analysis

- Effect becomes the single orchestration model for provider requests, retry scheduling, timeouts, interruption, typed failures, and observability.
- Provider adapters do not maintain separate retry implementations.
- Integration audit must be generalised because its current storage query refuses empty record OIDs.
- Harvest records are not sufficient for API diagnostics: they lack HTTP status, duration, retry, rate-limit, and trace hierarchy.
- Integration audit alone is not sufficient for ingestion diagnostics: it does not describe each mapped record outcome.
- Correlation is provided by the same trace ID stored in `HarvestRun.metadata` and every integration audit entry.
- Root and logical-request audits are persisted; retry attempts remain child spans plus a bounded terminal summary.
- Page failures are not independently notification-eligible, preventing alert floods.
- Existing record integrations and record-centric audit routes remain backward compatible.
- Existing audit redaction is reused and expanded with provider-specific sensitive-field tests.
- The design records enough operational information for support without storing research metadata or external response bodies.

# Implementation Plan

1. Generalise the integration audit model and Mongo storage queries from OID-only scope to OID-or-subject scope while preserving existing APIs.
2. Add record-ingest integration names/actions, correlation fields, safe attempt summaries, indexes, and notification eligibility.
3. Build the ingestion runtime under `record-ingest-v2` using Effect contexts, layers, tagged errors, interruption, timeouts, retry schedules, structured logging, spans, and metrics.
4. Implement provider HTTP clients as interruptible Effect services; remove retry responsibility from provider adapters.
5. Wrap every ingest run and logical external request with correlated integration audit contexts.
6. Store the root trace ID in harvest-run metadata and expose derived API-call counters in harvest-run details.
7. Add circuit state and provider health summaries to source configuration/runtime state.
8. Add scoped integration-audit APIs and trace lookup.
9. Extend the record-ingest and harvest-runs Angular apps with the correlated operational views.
10. Verify persistence volume, redaction, backwards compatibility, notification suppression, retry behaviour, and end-to-end trace correlation.

# Task List (With Tests and Skill Usage)

## 1. Data Model (Waterline Models)

- [ ] Add the ingestion-source observability and circuit fields. Use Redbox Services.
- [ ] Add unit tests for defaults, circuit transitions, and operational-field protection. Use Redbox Testing.
- [ ] Extend `IntegrationAuditModel`, `IntegrationAuditParams`, and the Mongo `IntegrationAudit` model with subject and correlation fields. Use Redbox Services.
- [ ] Add unit tests requiring either record OID or subject scope and preserving legacy record entries. Use Redbox Testing.
- [ ] Add compound integration-audit indexes and verify existing collections migrate additively. Use Redbox Testing.

## 2. Services Layer (Business Logic)

- [ ] Create `record-ingest-v2` Effect types, tags, layers, and tagged error classes. Use Redbox Services.
- [ ] Add tests for layer composition, missing services, typed error causes, and Effect-to-Promise bridging. Use Redbox Testing.
- [ ] Implement interruptible provider HTTP requests, timeout failures, `Retry-After`, exponential backoff, jitter, and retry classification. Use Redbox Services.
- [ ] Add fake-clock tests for retry timing, maximum attempts, interruption, timeout, 429, 5xx, authentication failure, and schema failure. Use Redbox Testing.
- [ ] Implement OpenTelemetry spans, Effect log annotations, metrics, and redaction. Use Redbox Services.
- [ ] Add observability tests confirming correlation attributes exist and secrets/high-cardinality metadata do not. Use Redbox Testing.
- [ ] Generalise `IntegrationAuditService` and Mongo storage queries for scoped subjects and traces. Use Redbox Services.
- [ ] Add tests for OID, source, run, operation, and trace queries; reject unbounded queries. Use Redbox Testing.
- [ ] Add `recordIngest` audit names/actions and root/child audit helpers. Use Redbox Services.
- [ ] Add tests confirming started/terminal pairs, parent spans, attempt summaries, status codes, durations, provider request IDs, and rate-limit summaries. Use Redbox Testing.
- [ ] Integrate Effect and audit layers into ROR, Crossref, and ARDC adapters. Use Redbox Services and the proposed Record Ingest Provider Adapters skill.
- [ ] Add provider fixture tests for retry success, exhausted retry, authentication failure, rate limiting, malformed responses, and redaction. Use Redbox Testing.
- [ ] Correlate the root trace with harvest-run metadata and record outcomes. Use Redbox Services.
- [ ] Add end-to-end service tests proving one run can be followed across integration audit, harvest chunks, and record events. Use Redbox Testing.
- [ ] Implement notification eligibility and source-level recovery semantics. Use Redbox Services.
- [ ] Add tests proving page failures do not send notifications and terminal run failure/recovery sends at most one notification. Use Redbox Testing.
- [ ] Implement the source-level circuit breaker. Use Redbox Services.
- [ ] Add tests for open, skipped, half-open, successful recovery, manual probe, and failures that must not open the circuit. Use Redbox Testing.
- [ ] Run a code review using Redbox Feature Implementation Review. If issues are found, write them to `issues.json`, fix every issue, delete the file, and rerun the review.
- [ ] Run the targeted Mocha integration suite and do not proceed until it passes. Use Redbox Testing.

## 3. Webservice Controllers (REST API)

- [ ] Add subject-scoped and trace-scoped integration-audit endpoints with Admin and brand enforcement. Use Redbox Controllers.
- [ ] Add controller tests for source/run/operation scopes, trace lookup, cross-brand denial, invalid filters, and unbounded-query rejection. Use Redbox Testing.
- [ ] Extend harvest-run responses with trace IDs and derived provider-call summaries. Use Redbox Controllers.
- [ ] Add API tests confirming summary counts match persisted integration-audit entries. Use Redbox Testing.
- [ ] Add Bruno scenarios for source audit, run audit, trace detail, provider failure, retry success, and legacy OID audit. Use Redbox Testing.
- [ ] Run a code review using Redbox Feature Implementation Review. If issues are found, write them to `issues.json`, fix every issue, delete the file, and rerun the review.
- [ ] Run the targeted Bruno suite and do not proceed until it passes. Use Redbox Testing.

## 4. Ajax Controllers (Controllers)

- [ ] Confirm no duplicate AJAX audit surface is introduced. Use Redbox Controllers.
- [ ] Add regression coverage for existing record-audit and form-lookup AJAX routes. Use Redbox Testing.

## 5. Angular App(s)

- [ ] Add source health, circuit state, and recent-trace panels to the record-ingest app. Use Redbox Angular Apps and Redbox Angular Services.
- [ ] Add component tests for healthy, retrying, rate-limited, open-circuit, failed, and recovered states. Use Redbox Testing.
- [ ] Add the `API calls` trace tab to the harvest-runs app. Use Redbox Angular Apps and Redbox Angular Services.
- [ ] Add component tests for trace hierarchy, retries, HTTP statuses, durations, provider failures, mapping failures, and persistence failures. Use Redbox Testing.
- [ ] Add tests confirming credential values and response bodies are never rendered. Use Redbox Testing.
- [ ] Run the targeted Angular suites. Use Redbox Testing.

## 6. Additional Views

- [ ] Verify existing EJS hosts load the extended Angular bundles and preserve CSP nonce handling. Use Redbox Angular Apps.
- [ ] Perform browser verification of source-to-run-to-trace navigation and support-ticket trace copying. Use Web Interface Verification.
- [ ] Simulate a provider outage and verify the UI clearly attributes the failure to the provider while local typeahead remains operational. Use Web Interface Verification.

## 7. Navigation Configuration

- [ ] Add observability translations without adding another top-level navigation entry. Use Redbox Angular Apps.
- [ ] Update wiki documentation with the audit/harvest distinction, trace hierarchy, retry layers, circuit behaviour, retained fields, and troubleshooting workflow. Use Redbox Services and Redbox Testing.
- [ ] Run a final Redbox Feature Implementation Review. If issues are found, write them to `issues.json`, fix every issue, delete the file, and rerun the review.
- [ ] Run full Mocha, Bruno, Angular, package, compilation, lint, route-contract, and browser verification suites. Use Redbox Testing and Web Interface Verification.

### Skill Gaps

The previously proposed `Record Ingest Provider Adapters` skill should additionally cover:

- Effect context/layer conventions.
- Tagged retryable errors.
- Interruptible HTTP clients.
- Timeout and `Retry-After` schedules.
- OpenTelemetry span hierarchy.
- Low-cardinality metrics.
- Integration-audit correlation.
- Harvest/audit ownership boundaries.
- Persistent attempt summaries.
- Circuit-breaker semantics.
- Secret and response-body redaction.
