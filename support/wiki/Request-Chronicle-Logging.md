# Request Chronicle Logging

A request chronicle is one structured log event per HTTP request. It records what happened during the request, including the request and response, the outcome, the duration, errors, and details added by controllers. The event is logged once, when the request finishes. Use it as the first place to look when investigating a request, instead of relating many separate log lines.

The approach follows the "wide event" or "canonical log line" pattern.

## Where it is implemented

| Part | Location |
| --- | --- |
| Helper, sanitisation, and error normalisation | `packages/redbox-core/src/utilities/RequestChronicle.ts` |
| Retention settings and defaults | `packages/redbox-core/src/utilities/RequestChronicleSettings.ts` |
| HTTP middleware | `packages/redbox-core/src/middleware/requestChronicle.ts` (first in `sails.config.http.middleware.order`) |
| Controller helpers | `updateChronicle`, `recordBackgroundOperation`, and the `chronicle` option of `sendResp` in `packages/redbox-core/src/CoreController.ts` |
| 500 response | `packages/redbox-core/src/responses/serverError.ts` records the error in the event |

## Lifecycle

1. The `requestChronicle` middleware creates the helper, generates a request id, and records the request method, path, and host. The helper is stored on `req.options.requestChronicleHelper`. It is a class instance, so it survives the Sails route options merge; do not replace it with a plain object.
2. Controllers, policies, and responses add details and errors while the request is running.
3. The event is concluded exactly once, when the response finishes (`finish`), or when the connection closes first (`close`), which records an aborted request.
4. The event is classified, then logged at the level for its classification, or discarded.

Failures in the request chronicle are caught. They never fail the request or crash the process.

Requests that do not pass through the HTTP middleware, such as socket requests and `sails.request()`, have no request chronicle. For these requests, details are ignored without warnings, and errors are logged immediately.

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
| `sample` | A sampled successful request. | `info` |
| `discard` | A successful request that was not sampled. | not logged |

Classification checks the status before the abort state, so a request that sent a 4xx or 5xx status and was then aborted is classified by its status, with the outcome `aborted`.

## Retention settings

Configure retention in `sails.config.log.requestChronicle`, for example in `config/log.js` or using environment variables such as `sails_log__requestChronicle__successSampleRate=1`. Invalid values use the defaults.

| Setting | Default | Description |
| --- | --- | --- |
| `successSampleRate` | `0.1` | The fraction (0 to 1) of successful, fast requests that are logged. Failed, aborted, and slow requests are always logged. |
| `slowThresholdMs` | `2000` | Successful requests that take longer than this are classified as `slow`. |
| `successSampleExcludePattern` | static asset file extensions | A case-insensitive regular expression. Successful, fast requests with a matching path are never sampled. |

To log every request while diagnosing an incident, set `successSampleRate` to `1` and `successSampleExcludePattern` to `''`.

At startup, a warning is logged if `requestChronicle` is not first in `sails.config.http.middleware.order`.

## Event fields

The default log transport is `pino-logfmt`, which flattens nested objects into snake_case keys joined with `_`. Arrays are logged as objects keyed by index, so they remain readable (for example `errors_0_message`). Multi-line values such as stack traces are escaped onto one line. The table shows the emitted field names, followed by the field in the event object.

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
| `display_errors_<n>_...` | `displayErrors` | The status, code, title, and detail of the errors shown to the client by `sendResp`. |
| other keys | | Details added by controllers, such as `user_id` or `report_name`. |

Pino also adds `time`, `pid`, and `hostname`. These, along with `level`, `name`, `msg`, `err`, and the event fields above, are reserved and cannot be set by controller details.

## Adding details

In a controller that extends `Controllers.Core.Controller`:

```ts
// Add details while handling the request.
this.updateChronicle(req, { reportName: name, reportPagingRows: rows });

// Record an error without changing the response.
this.updateChronicle(req, {}, [error]);

// Add details and errors with the response.
return this.sendResp(req, res, {
  status: 500,
  displayErrors: [{ code: 'report-failed' }],
  errors: [error],
  chronicle: { reportName: name },
});
```

Passing `errors` to `sendResp` affects the response: if there are no `displayErrors`, a generic `server-error` display error is added and the status becomes 500. To keep an existing response, such as a 200 `{status: false, message}` response, record the error with `updateChronicle` instead.

Keys are top-level and a later value replaces an earlier one. Use a prefix for the controller or feature, for example `userLoginSuccess` or `emailProcessStepFailed`.

### Safe capture rules

Capture identifiers, counts, codes, flags, statuses, revisions, hashes, and timings. Do not capture:

- whole request bodies, results, records, reports, action results, or view locals: record identifiers and counts instead (`summarizeChronicleValue` describes a value's type, length, or key count without its content);
- message content, such as email bodies and subjects, translation values, or user-entered text;
- tokens, preview URLs, credentials, or provider authentication details.

As a safeguard, every value is sanitised and bounded:

- keys containing `token`, `authorization`, `secret`, `apikey`, `api_key`, `password`, `credential`, or `cookie` are redacted;
- JWTs, bearer tokens, URI credentials, preview stylesheet tokens, and token-like query parameters are redacted from strings;
- strings are truncated to 500 characters, arrays to 20 items, objects to 30 keys, nesting to 4 levels, and each value to 4 KB of JSON;
- at most 100 detail keys (100 characters each) and 20 errors are recorded; sensitive keys and bounds also apply to details logged after completion;
- errors are limited to 3 levels of causes, 10 nested errors per level, 1000-character messages, and stacks capped at 4000 characters and 12 lines. Each normalized error is capped at 8 KB of JSON. Stacks are only recorded for unexpected errors at the top level, not for validation errors. Cycles are detected.

These limits are a safeguard, not a replacement for choosing safe, concise details.

## Work that outlives the response

Some work is started but not awaited before the response is sent, such as user audit events. Use `recordBackgroundOperation`:

```ts
this.recordBackgroundOperation(req, 'userAuditEventLogin', UsersService.addUserAuditEvent(user, 'login', requestDetails));
```

- If the work settles while the request is running, the result is added to the event (`user_audit_event_login=success` or `failure`, plus the error).
- If the work fails after the request finished, a separate `error` log is written with the `requestId`, the `operation`, `outcome=failure`, and the normalised error.
- If the work succeeds after the request finished, a `debug` log is written.

The response is never delayed to wait for the work.

Any error recorded after the request finished is logged separately at `error` level with the `requestId`, and late details are logged at `debug` level, so they are never silently discarded.

## Migrating more controllers and services

Controllers migrated so far: Action, BrandingApp, DynamicAsset, Email, FormVocabulary, Report, Translation, User, Vocabulary, and the webservice IntegrationAudit and Report controllers. When migrating another controller:

1. Replace scattered `sails.log` calls for the request with `updateChronicle` details, keeping the safe capture rules.
2. Keep the existing response contract. Check every `errors` added to `sendResp`.
3. Use `recordBackgroundOperation` for work that is not awaited.
4. Add tests for the response and the captured details.

Services do not yet add details to the request chronicle; they continue to use their namespace loggers. Propagating request context to services (for example with `AsyncLocalStorage`), and migrating to OpenTelemetry logging once it is stable for JavaScript, are future work.

## Namespace loggers

Services and controllers use `this.logger`, a pino child logger named after the class (for example `RecordsService` or `UserController`). Levels for each namespace are configured in `sails.config.lognamespace`. Namespace loggers without a configured level follow the application log level. If a namespace logger cannot be created, the class uses `sails.log`.

The shared `ILogger` interface (`@researchdatabox/sails-ng-common`) has the sails log levels: `silent`, `blank`, `fatal`, `crit`, `error`, `warn`, `info`, `log`, `debug`, `verbose`, `trace`, and `silly`. Use `logAtLevel(logger, level, ...args)` to log at a level from config.
