# Request Chronicle Logging

A request chronicle is one structured log event per HTTP request. It records what happened during the request, including the request and response, the outcome, the duration, errors, and details added by controllers and services. The event is logged once, when the request finishes. Use it as the first place to look when investigating a request, instead of relating many separate log lines.

The approach follows the "wide event" or "canonical log line" pattern.

## Where it is implemented

| Part | Location |
| --- | --- |
| Helper, sanitisation, and error normalisation | `packages/redbox-core/src/utilities/RequestChronicle.ts` |
| Retention settings and defaults | `packages/redbox-core/src/utilities/RequestChronicleSettings.ts` |
| HTTP middleware and sanitized errors | `packages/redbox-core/src/http/express/middleware.ts` |
| Service summaries | `packages/redbox-core/src/utilities/serviceChronicle.ts` |
| Async request context | `packages/redbox-core/src/utilities/RequestChronicleContext.ts` |

## Lifecycle

The host creates the chronicle before downstream parsing and policy execution.
An AsyncLocalStorage scope retains it through admitted asynchronous work.
Handlers and services record safe details through the supplied context. The event
concludes once on response finish or connection close; close before finish records
an abort. Late service work uses the injected logger without mutating a completed
event. Error handling excludes raw bodies, parser excerpts, credentials and causes.
Startup, queue jobs and direct socket work use their own explicit logging context.
Chronicle failures do not fail a request.

## Outcome, classification, and log level

The **outcome** describes what happened to the request:

| Outcome | Meaning |
| --- | --- |
| `success` | The response was sent with a status below 400, and no errors were recorded. |
| `failure` | The response was sent with a 4xx or 5xx status, or errors were recorded. |
| `aborted` | The connection closed before the response was completely sent. |

The **classification** describes why the event was kept, and sets the log level (the **severity**):

| Classification | When | Log level |
| --- | --- | --- |
| `error` | Status 5xx, or errors recorded with a status below 400 or an aborted request. | `error` |
| `client-error` | Status 4xx. Expected client failures, such as not found or validation failures. | `info`, or `warn` if errors were recorded |
| `aborted` | The connection closed before the response finished, with no status or errors that classify it otherwise. | `info` |
| `slow` | A successful request that took longer than `slowThresholdMs`. | `warn` |
| `warning` | A successful, fast request with a service warning. Always retained, even when success sampling is disabled or the path is excluded. | `warn` |
| `sample` | A sampled successful request. | `info` |
| `discard` | A successful request that was not sampled. | not logged |

Classification checks the status before the abort state, so a request that sent a 4xx or 5xx status and was then aborted is classified by its status, with the outcome `aborted`.
Service warnings raise `client-error` and `aborted` events to `warn` without changing their classification or outcome. Errors retain their existing precedence.

## Retention settings

Pass retention settings through the `requestLogging` option of `createPortalHost`:

```typescript
const portal = await createPortalHost({
  appPath,
  log,
  requestLogging: {
    successSampleRate: 1,
    slowThresholdMs: 2000,
    successSampleExcludePattern: '',
  },
});
```

These are host options, separate from the validated startup configuration loaded from application files and extensions. The startup `log` section accepts `level` and `format`; `log.requestChronicle` is rejected as an unknown field. Invalid retention values supplied through `requestLogging` use the documented defaults.

| Setting | Default | Description |
| --- | --- | --- |
| `successSampleRate` | `0.1` | The fraction (0 to 1) of successful, fast requests that are logged. Failed, aborted, slow, and warning requests are always logged. |
| `slowThresholdMs` | `2000` | Successful requests that take longer than this are classified as `slow`. |
| `successSampleExcludePattern` | static asset file extensions | A case-insensitive regular expression. Successful, fast requests with a matching path are never sampled. |

To log every request while diagnosing an incident, set `successSampleRate` to `1` and `successSampleExcludePattern` to `''`.

The owned host fixes middleware ordering; extensions do not configure a framework middleware-order array.

## Event fields

The default logfmt transport (`packages/redbox-core/logfmt-transport.cjs`) flattens nested objects into snake_case keys joined with `_`. Arrays are logged as objects keyed by index, so they remain readable (for example `errors_0_message`). Multi-line values such as stack traces are escaped once onto one line, so logfmt readers recover the original line breaks. Calls to `logger.blank()` emit nothing. The table shows the emitted field names, followed by the field in the event object.

| Emitted field | Event field | Description |
| --- | --- | --- |
| `msg` | | Always `Request chronicle`. |
| `level` | | The log level for the classification. |
| `request_id` | `requestId` | A UUID generated for the request. It is also included in separate logs related to the request. |
| `trace_id` | `traceId` | The OpenTelemetry trace id, when there is an active trace. |
| `result_timestamp` | `result.timestamp` | When the request started (ISO 8601). |
| `result_duration_ms` | `result.durationMs` | The elapsed time, from a monotonic clock. |
| `result_outcome` | `result.outcome` | `success`, `failure`, or `aborted`. |
| `result_classification` | `result.classification` | See above. |
| `result_severity` | `result.severity` | The log level used, or `none`. |
| `req_method`, `req_path`, `req_hostname` | `req.*` | The request. Token-bearing paths, such as branding preview stylesheets, are redacted. Query strings are not recorded. |
| `req_upstream_request_id` | `req.upstreamRequestId` | A valid `X-Request-Id` header (up to 128 letters, digits, and `._:-`). |
| `res_status_code` | `res.statusCode` | The response status, if headers were sent. |
| `res_completed` | `res.completed` | Whether the response was completely sent. |
| `errors_<n>_name`, `errors_<n>_message`, `errors_<n>_code`, `errors_<n>_stack`, `errors_<n>_details_<m>_...` | `errors` | Recorded errors, including causes and aggregated errors. |
| `errors_omitted` | `errorsOmitted` | The number of errors beyond the limit. |
| `display_errors_<n>_...` | `displayErrors` | The status, code, title, and detail of the errors selected by the response adapter. |
| other keys | | Details added by controllers, such as `user_id` or `report_name`. |

Pino also adds `time`, `pid`, and `hostname`. These, along with `level`, `name`, `msg`, `err`, and the event fields above, are reserved and cannot be set by controller details.

## Adding details

In an explicitly bound Express handler, use the request's existing helper and the
owned response functions. This complete TypeScript example can be compiled in a
hook with the qualified core installed:

```ts
import type { RequestHandler } from '@researchdatabox/redbox-core/extensions';
import { sendApiErrors } from '@researchdatabox/redbox-core/http/express';
import { RequestChronicleHelper } from '@researchdatabox/redbox-core/dist/utilities/RequestChronicle';

export const reportFailure: RequestHandler = (req, res) => {
  const chronicle = RequestChronicleHelper.existing(req);
  chronicle?.addInfo({ reportName: 'institution-report', reportPagingRows: 0 });
  chronicle?.addError(new Error('Report operation failed'));
  sendApiErrors(req, res, 500, [{ code: 'report-failed', title: 'Report failed' }]);
};
```

`addError` records an error without sending or changing the response. Choose the
response status and safe display errors explicitly with `sendApiErrors`, or use
`sendApiData` for the existing success contract. Never expose the original error
as response data. The host completes the chronicle; handlers do not create a
second request event.

Keys are top-level and a later value replaces an earlier one. Use a prefix for the controller or feature, for example `userLoginSuccess` or `emailProcessStepFailed`.

### Service details

In a service that extends `Services.Core.Service`, use the inherited helper:

```ts
this.updateChronicle({ namedQueryCollection: collectionName, namedQueryRows: rows });
this.updateChronicle({ emailSendOutcome: 'failed' }, [error]);

// Retain HTTP warnings; use warn for this summary outside an HTTP request too.
this.updateChronicle({ solrJobExecution: 'inline' }, [], 'warn');
```

During HTTP processing, the details join the same event as controller details. Concurrent requests have isolated contexts even though they call the same service instance. Promises, timers, callbacks created in that context, and RxJS work subscribed within it retain the request context. A deferred Observable belongs to the context in which it is subscribed; creating it during a request does not bind later subscriptions to that request. A shared event emitter or queue worker running in a separate async context does not inherit the originating HTTP request.

Outside HTTP processing, summaries are bounded and redacted, then logged at `debug` by default; the optional third argument selects `info` or `warn`. Errors are normalized and logged at `error`, with their sanitized operation details in the same record so the context survives when debug logging is disabled. During HTTP processing, `warn` retains the event and raises its severity to at least `warn`. The helper never changes the service return value or error propagation. An error object recorded by a service and then rethrown to a controller is captured once while the request runs.

Service work started within a request retains that request's helper after the response finishes. Late details use the supplied level (`debug` by default), and late errors use `error` with sanitized operation details in the same record. Both include the original request ID. This does not delay the response or attach late work to another request.

The migrated service summaries include:

- Records: save operation, phase, outcome and problem count; audit action and outcome; datastream count and outcome.
- RDMP: record IDs, template counts and outcomes, contributor counts, queue phases and job names, attachment counts, and workspace outcomes. Template failures use a generic error and the failing template index, excluding template source and exception excerpts that may contain private values.
- Users: authentication provider and outcome, email access outcome, hook counts and outcomes, audit action and user ID.
- Email: template reference, message format, send/notification outcome and hook outcome.
- Named queries: collection, branding ID, pagination, parameter/result counts and completion/limit outcome.
- Solr: core, record ID, operation, pagination, result/index-field counts and job outcome.
- Triggers: record ID, hook/template counts, transition condition flag and validation failure count. Related-template failures retain their validation error class and display errors, with safe record IDs, the operation phase (`lookup`, `template`, `brand`, or `save`), error class, and save outcome instead of template configuration or exception excerpts. A template index is recorded only when rendering fails, so a later lookup, branding, or save failure does not blame a successful template.

Full records, user profiles, login claims, email content, query criteria, parameter values, and hook options are excluded.

For passport authentication, services record outcomes and email access warnings; the controller records errors passed to `done`. This keeps string rejections such as `authorized-email-denied` and `No user found` in the event once, while preserving the callback arguments. A direct email access check that returns `false` retains a warning without adding a separate error.

### Safe capture rules

Capture identifiers, counts, codes, flags, statuses, revisions, hashes, and timings. Do not capture:

- whole request bodies, results, records, reports, action results, or view locals: record identifiers and counts instead (`summarizeChronicleValue` describes a value's type, length, or key count without its content);
- message content, such as email bodies and subjects, translation values, or user-entered text;
- tokens, stored token/password hashes, preview URLs, credentials, or provider authentication details.

As a safeguard, every value is sanitised and bounded:

- keys containing `token`, `authorization`, `secret`, `apikey`, `api_key`, `password`, `credential`, or `cookie` are redacted;
- JWTs, bearer tokens, URI credentials, preview stylesheet tokens, and token-like query parameters are redacted from strings;
- strings are truncated to 500 characters, arrays to 20 items, objects to 30 keys, nesting to 4 levels, and each value to 4 KB of JSON;
- at most 100 detail keys (100 characters each) and 20 errors are recorded; sensitive keys and bounds also apply to details logged after completion;
- errors are limited to 3 levels of causes, 10 nested errors per level, 1000-character messages, and stacks capped at 4000 characters and 12 lines. Each normalized error is capped at 8 KB of JSON. Stacks are only recorded for unexpected errors at the top level, not for validation errors. Cycles are detected.

These limits are a safeguard, not a replacement for choosing safe, concise details.

## Work that outlives the response

Work that can outlive the response, such as an audit, must remain tracked by the
application's admitted-work owner. Capture the existing chronicle before starting
that work; report its settlement through `addOperationResult`:

```ts
// Inside an already admitted and application-tracked async operation:
chronicle?.addOperationResult('userAuditEventLogin');
// On failure, pass the error as the second argument instead.
```

- If the work settles while the request is running, the result is added to the event (`user_audit_event_login=success` or `failure`, plus the error).
- If the work fails after the request finished, a separate `error` log is written with the `requestId`, the `operation`, `outcome=failure`, and the normalised error.
- If the work succeeds after the request finished, a `debug` log is written.

The response is never delayed to wait for the work.

Any error recorded after the request finished is logged separately at `error` level with the `requestId`, and late details are logged at `debug` level, so they are never silently discarded.

## Migrating more handlers and services

When adding or converting a handler:

1. Replace scattered logger calls for the request with the existing helper's `addInfo`/`addError`, keeping the safe capture rules.
2. Keep the existing response contract and select safe status/display errors explicitly.
3. Track accepted asynchronous work through the application owner and record its settlement with `addOperationResult`.
4. Add tests for the response and the captured details.

The request-facing legacy payload logging in Records, RDMP, Users, Email, NamedQuery, SolrSearch, and Trigger services now uses service summaries. Existing structured audit, validation, concurrency, and lifecycle events remain separate. Other service logging can migrate incrementally using the inherited `updateChronicle(info, errors, level)` helper and the same safe capture rules. Keep startup and independently scheduled job diagnostics useful through the namespace fallback, and test both HTTP and background execution.

## Namespace loggers

Services and handlers receive their logger from the composition root. Bind namespace
levels explicitly through `createNamespaceLogger`; no global logger lookup or
fallback is available. Keep error redaction and bounded summaries at this boundary.
