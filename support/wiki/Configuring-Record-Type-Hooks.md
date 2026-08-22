# Configuring Record Type Hooks

This document describes how to configure record-type hooks in ReDBox and explains the behaviour of the following hook modes: `onCreate`, `onUpdate`, `onDelete`, and `onTransitionWorkflow`.

The implementation details come from the `RecordsService` behaviour. Hooks are declared on the record type under `hooks.<mode>` and may be defined for three phases:

- `pre` — synchronous pre-save triggers (executed and awaited before saving). If a `pre` hook throws an error the save operation is aborted.
- `postSync` — synchronous post-save triggers (executed and awaited after saving; often used to call external services and/or modify storage responses). The hook may return either a modified record or a storage response depending on `options.returnType`.
- `post` — asynchronous post-save triggers (fired after the save but not awaited; errors are logged and do not block the caller).


## Hook configuration shape

Typical record-type hook configuration (JSON/YAML) looks like:

```json
"hooks": {
  "onCreate": {
    "pre": [],
    "postSync": [],
    "post": [] 
  }
}
```

- Each hook entry should include a `function` string. The string is should reference a Trigger Function in a service.
- `options` is a free-form object used by your hook code. For `postSync` hooks the `options.returnType` value controls what is expected from the function:
  - `returnType: "record"` (default) — the hook should return/resolve to the updated record object.
  - Any other value — the hook should return/resolve to a storage service response object and that response will be used by the caller.
- `id` is an optional stable identifier used in logs and audit summaries. For durable identity across hook reordering, configure it explicitly. If it is omitted, ReDBox derives a deterministic identifier from the mode, phase, array index, and a short digest of the function expression; moving the hook in the array changes that generated identity.
- `execution` is optional policy metadata. It is consumed by the runner and is never added to the legacy `options` object passed to hooks.

## Retry and timeout policy

The default policy is one attempt with no timeout. Policy values are validated before any selected hook phase starts:

```json
{
  "id": "mint-after-save",
  "function": "sails.services.mintservice.afterSave",
  "options": { "returnType": "response" },
  "execution": {
    "timeoutMs": 30000,
    "retry": {
      "maxAttempts": 3,
      "retryOn": ["transient"],
      "schedule": { "type": "exponential", "delayMs": 250, "maxDelayMs": 2000, "jitter": true },
      "idempotent": true
    }
  }
}
```

`maxAttempts` includes the first invocation and is limited to 5. `timeoutMs` is a
per-attempt timeout from 1 ms through 10 minutes. Retry is opt-in, requires the
literal `idempotent: true`, and defaults to the `transient` failure kind when
`retryOn` is omitted. Fixed or exponential delays are limited to 60 seconds;
values outside these limits are configuration errors rather than being clamped.
Retries receive the same live argument objects. They do not roll back partial
in-memory mutations, so only enable them for idempotent work.

Timeouts interrupt native Effect actions and unsubscribe Observables. An already
started legacy Promise cannot be cancelled; a timed-out Promise may continue its
side effect after the save response has returned. ReDBox therefore does not retry
non-cooperative timeout or interruption failures, even when `idempotent: true`,
because doing so could overlap the still-running legacy side effect.

## How hooks are executed (summary)

- RecordsService triggers pre-save hooks with `triggerPreSaveTriggers(oid, record, recordType, mode, user)`. This fetches `recordType.hooks.<mode>.pre` and runs each function synchronously (awaiting any Promise or Observable returned). If a pre-hook throws, the create/update/delete operation is stopped and an error is returned.
- After the storage operation succeeds, RecordsService runs `triggerPostSaveSyncTriggers(oid, record, recordType, mode, user, response)` for `hooks.<mode>.postSync` and awaits them. If a `postSync` hook throws, the service sets a `postSaveSyncWarning` marker in the response and may return an error depending on context.
- The service then fires `triggerPostSaveTriggers(oid, record, recordType, mode, user)` for `hooks.<mode>.post` — these are executed asynchronously and errors are logged but don't block the caller.
- For transition-specific behaviour, `triggerPreSaveTransitionWorkflowTriggers` and `triggerPostSaveTransitionWorkflowTriggers` use the same `onTransitionWorkflow` hooks.

## Mode-specific details

### onCreate

- When a new record is created, the service runs `hooks.onCreate.pre` (if present) before persisting the record. These pre hooks can modify the record and may throw validation errors to abort creation.
- After the storage service returns a successful create response, `hooks.onCreate.postSync` are executed and awaited. Use `postSync` if you need to synchronously update storage metadata or depend on a modified storage response.
- `hooks.onCreate.post` are then fired asynchronously.

Common use-cases:
- Validate or populate computed fields before saving (pre).
- Notify external indexing or metadata services and optionally update storage metadata (postSync).
- Fire non-critical notifications and analytics (post).

Example (pseudo-config):

```json
"hooks": {
  "onCreate": {
    "pre": [
      
    ],
    "postSync": [
      
    ],
    "post": [

    ]
  }
}
```

### onUpdate

- `hooks.onUpdate.pre` run before updating metadata. They can validate fields and modify the record; throwing an error stops the update.
- The service commits primary metadata first, then executes the attachment mutation plan (`prepared` → `pending` → `applied`) and runs `hooks.onUpdate.postSync`, which are awaited. Attachment or hook problems are reported as a persisted save warning with item-level completion facts; the journal is replayed on the next manual save. If `postSync` hooks indicate changes that should be persisted, RecordsService will call `storageService.updateMeta` again (see code path: when `hasPostSaveSyncHooks(...)` is true).
- `hooks.onUpdate.post` are executed asynchronously.

Common use-cases:
- Enforce or recalculate derived fields before save (pre).
- Update external registries, mirror metadata, or perform synchronous workflow-related tasks (postSync).
- Send asynchronous notifications, logging, or analytics (post).

### onDelete

- `hooks.onDelete.pre` are run before deletion; they can abort deletion by throwing.
- After the storage deletion succeeds, `hooks.onDelete.postSync` are executed and awaited. `hooks.onDelete.post` are executed asynchronously.

Common use-cases:
- Validate that related resources can be removed (pre).
- Synchronously notify downstream services to remove references (postSync).
- Fire asynchronous cleanup jobs (post).

### onTransitionWorkflow

- Workflow transitions use the same pre/post hook pattern under the special mode `onTransitionWorkflow`.
- Before transitioning a record workflow step, RecordsService calls `triggerPreSaveTransitionWorkflowTriggers` which executes `hooks.onTransitionWorkflow.pre`.
- After the transition and storage updates, RecordsService calls `triggerPostSaveTransitionWorkflowTriggers` which invokes `hooks.onTransitionWorkflow.postSync` (awaited) and then `hooks.onTransitionWorkflow.post` (async).
- The service also runs `transitionWorkflowStepMetadata` which updates `record.previousWorkflow`, `record.workflow`, `record.metaMetadata.form`, and reassigns authorization arrays (`editRoles`, `viewRoles`) from the target step config. 

Common use-cases:
- Apply workflow-specific permission changes and add workflow-related metadata (transition pre or transition metadata step).
- Notify approval systems or external workflow trackers synchronously (postSync).

## Hook return values and shapes

- Pre-hooks: generally return the (possibly modified) `record`. They may also throw an error (including a custom RBValidationError) to stop the operation.
- postSync hooks: depending on `options.returnType` either return a `record` (default) or a storage-like response object. The calling code will use whichever is returned.
- post hooks: return values are ignored by RecordsService; treat these as fire-and-forget

The app supports hooks that return Observables, Promises, or plain values. Observables are converted to Promises internally.

Every awaited phase is executed through a normalized Effect runner. Reports remain
internal: they are not added to HTTP save responses. A phase report can contain
`succeeded`, `failed`, `timed_out`, `interrupted`, or `skipped` actions. Detached
`post` actions are reported as `dispatched` at the save boundary and complete or
fail later under the same correlation ID.

Save-time validation rejects malformed `pre` configuration before any primary
mutation. `postSync` configuration is validated at its awaited post-persistence
phase boundary, while malformed `post` entries retain the legacy per-entry
behaviour: they are logged and skipped while later valid entries continue to
dispatch. This keeps detached-post configuration from blocking persistence.

The application logger emits concise events such as
`record_hook_action_completed`, `record_hook_action_retry_scheduled`,
`record_hook_action_timed_out`, `record_hook_detached_action_failed`,
`record_hook_operation_dispatched`, and `record_hook_operation_completed`.
The save-boundary `record_hook_operation_dispatched` event is emitted when
detached work is launched; exactly one
`record_hook_operation_completed` event follows when the audit reaches its
finalization state. Filter on `execution_id` to reconstruct one record
operation. Record bodies, hook options, users, function expressions, returned
payloads, and raw errors are excluded from production-level events.

For record create/update endpoints, callers should inspect the typed save
`outcome` rather than the legacy boolean `success`: `saved-with-warnings`
means primary metadata committed but an awaited hook or attachment phase needs
reconciliation. See [ReDBox Portal API](ReDBox-Portal-API.md#record-save-outcomes-api-v2)
for the response and request-correlation contract.

## Error handling

- If a pre-hook throws an error, the operation (create/update/delete/transition) is aborted and the error is propagated. If the thrown error has `name === 'RBValidationError'` RecordsService treats it as a validation error and surfaces the message.
- If a postSync hook throws, the primary metadata commit remains authoritative and the typed result is `saved-with-warnings`; indexing and persistence audit are still submitted. A pre-save hook failure or invalid hook configuration returns `not-saved` and no attachment work is started.
- post (async) hooks have their errors caught and logged; they won't block the user operation.

Create and update audits include a versioned, bounded `executionSummary` with
aggregate counts and at most the first 100 action entries. Delete audits are
truthfully marked `partial` at the existing audit-before-post boundary. Create
and update audit submission gives detached actions a bounded asynchronous grace
period. Actions that finish within it are persisted with terminal outcomes
(`succeeded`, `failed`, `timed_out`, or `interrupted`); if the grace period
expires, the audit is still written with completed results plus truthful
`dispatched` entries, `detachedPending`, and `detachedFinalization:
"grace-expired"`. A late detached completion only emits its structured action
logs and never creates a second audit. The summary is audit metadata and is
never embedded in the business-record snapshot.

Create/update summaries also expose `completedThrough` (`pre`, `persistence`,
`postSync`, or `post-dispatch`) so early exits are distinguishable from a fully
dispatched operation.

The current observability surface is structured correlation logging rather than
native Effect spans. Operation, phase, action, and attempt identifiers are
available for log aggregation; Effect/OpenTelemetry span integration remains a
follow-up.

### Service extension boundary

A custom service that subclasses the core `RecordsService` inherits the
Effect-backed hook coordinator and its lifecycle guarantees. A full replacement
service registered in place of the core service does not automatically receive
these guarantees; it must call the coordinator or implement equivalent
execution, logging, supervision, and audit integration itself.

## Security and best practices

- Keep heavy or slow operations in `post` (async) hooks where possible to avoid blocking user operations.
- Use `postSync` only when you must synchronously modify storage metadata or the response, or when the calling flow depends on the result.
- Prefer returning `record` from `postSync` hooks (or set `options.returnType` appropriately) to keep the flow simple.

## Troubleshooting

- If a create/update/delete operation fails and logs show a hook error, inspect the stack trace and the hook function defined in the record-type configuration.
- To detect validation-style errors from hooks, check for `RBValidationError` (the service will treat this specially and pass on the message to the client to allow the form framwork to render a message).
- To debug async post hooks, add logging inside the hook function and check the server logs — post hooks errors are recorded there.

## Example: adding a pre-create validation hook

```json
"hooks": {
  "onCreate": {
    "post": [
  {
    "function": "sails.services.rdmpservice.queueTriggerCall",
    "options": {
      "hookName": "sails.services.backgroundService.processTask",
      "hookOptions": {
        // Task-specific options
      }
    }
  }
]
  }
}
```
