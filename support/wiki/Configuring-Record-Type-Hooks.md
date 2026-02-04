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
- The service updates datastreams (attachments) then persists metadata and runs `hooks.onUpdate.postSync` which are awaited. If `postSync` hooks indicate changes that should be persisted, RecordsService will call `storageService.updateMeta` again (see code path: when `hasPostSaveSyncHooks(...)` is true).
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

## Error handling

- If a pre-hook throws an error, the operation (create/update/delete/transition) is aborted and the error is propagated. If the thrown error has `name === 'RBValidationError'` RecordsService treats it as a validation error and surfaces the message.
- If a postSync hook throws, RecordsService sets a `postSaveSyncWarning` marker on the response and may mark the operation as unsuccessful, depending on the context where the hook runs.
- post (async) hooks have their errors caught and logged; they won't block the user operation.

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
