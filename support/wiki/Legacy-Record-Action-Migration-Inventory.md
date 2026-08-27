# Legacy Record Action Migration Inventory

This page is the A01 baseline for migrating record lifecycle hooks to code-owned actions. It characterizes the current behavior only; it does not add a registry, change hook resolution, or make the proposed IDs executable.

Machine-readable evidence:

- [legacy-action-inventory.json](../specs/record-type-workflow-administration/legacy-action-inventory.json) records every shipped occurrence, behavior profile, proposed namespaced ID, owner, source location, exact source option presence and values, mutation/return behavior, failure boundary, and ordering assumption.
- [legacy-action-mappings.json](../specs/record-type-workflow-administration/legacy-action-mappings.json) records proposed contract versions and parameter transforms for later migration tasks.
- [representative-config.json](../../packages/redbox-core/test/fixtures/legacy-record-actions/representative-config.json) covers all lifecycle modes, direct mutation, replacement returns, detached side effects, `onNotifySuccess`, `runHooksSync`, and queued `triggerConfiguration` nesting.
- [representative-database.json](../../packages/redbox-core/test/fixtures/legacy-record-actions/representative-database.json) supplies brand-scoped `RecordType` and `WorkflowStep` rows for later database migration tests. Its default-brand rows are the persisted projection of `representative-config.json`; its secondary-brand hooks intentionally differ so migration tests cannot substitute default-brand configuration for persisted tenant state.
- [unknown-expression.json](../../packages/redbox-core/test/fixtures/legacy-record-actions/unknown-expression.json) is the required fail-closed fixture.

## Inventory result and scan boundary

The automated source scan finds 32 shipped executable occurrences: 26 top-level `RecordHookDefinition.function` values and 6 nested `options.onNotifySuccess[].function` values. They reduce to 11 unique legacy expressions. All 32 are in `packages/redbox-hook-dev/src/config/recordtype.ts`.

Core intentionally ships an empty `recordtype` configuration, and `sails-hook-redbox-storage-mongo` ships no record lifecycle action configuration. No pre-existing runtime/bootstrap RecordType fixture with executable hooks exists in this worktree. Those zero counts are part of the checked denominator rather than being silently omitted.

The scan excludes compiled/installed output, unit and integration test literals, documentation examples, and the new A01 test-only migration fixtures. Authentication `onCreate`/`onUpdate` hooks in `brandingConfigurationDefaults.config.ts` are also excluded because they are user-account hooks, not `RecordHookDefinition` values. The characterization test defines the shipped config roots and exclusions independently in test code, asserts that the inventory declares the same denominator, and then verifies the 32-entry machine inventory against those syntax trees. Each occurrence uses an explicit present/absent option discriminator and, when present, an exact source-derived JSON value; nested object values, array order, and array cardinality are therefore part of the comparison. This includes both shipped party create/update template rows and both `metadata.fullName` and `metadata.l_fullName` templates. Strict runtime schemas reject missing or unrecognized inventory, mapping, and fixture fields; complete-contract assertions also catch omitted array rows and operations that remain structurally optional. The tests derive every default-brand persisted record-type and workflow-stage row from configuration in both directions, then verify brand ownership, stage-name equality, form linkage, transition targets, the persisted representative record, and the deliberate secondary-brand divergence.

## Coordinator behavior

The record-hook coordinator resolves arrays in configured order. `pre` and `postSync` actions run sequentially and fail fast. Each `pre` action receives the record returned by the previous action. Each `postSync` action receives the current record plus its own clone of the accumulated response. A default/`record` return replaces the candidate; a non-record return can update only the legacy response whitelist. Mutated `workspaceOid` and `workspaceData` fields are copied from the isolated response clone.

Detached `post` actions are dispatched in configuration order and do not contribute returned values to persisted state. Malformed detached entries are logged and skipped while later valid entries continue. Save-owned detached dispatch is supervised and may be held until the save's awaited work has reached its final dispatch boundary.

`RecordsService.configuredHookFunction` evaluates each configured string and caches the resolved callable by hook object and expression. `TriggerService.runHooksSync`, `EmailService.onNotifySuccess`, and `RDMPService` queued `triggerConfiguration.function` are separate nested executable paths. `runHooksSync` and queued `triggerConfiguration` currently have no shipped RecordType occurrence but are represented in fixtures so migration design cannot overlook them.

The nested evaluators have deliberately recorded, path-specific failure boundaries:

- `onNotifySuccess` silently skips a missing, empty, or non-string `function`. Its unguarded expression evaluation and synchronous invocation can reject `sendRecordNotification`; only a callback result that has already become a Promise is given the detached log-and-continue handler ([EmailService.ts, lines 322–345](../../packages/redbox-core/src/services/EmailService.ts#L322-L345)).
- `runHooksSync` logs and skips missing/non-string functions and expressions that evaluate to non-callable values. Its `eval` is unguarded, so an invalid expression escapes synchronously; an invoked callback failure terminates the returned Observable ([TriggerService.ts, lines 103–132](../../packages/redbox-core/src/services/TriggerService.ts#L103-L132)).
- The queued consumer ignores a missing function and logs a non-callable evaluated value, but invalid expression evaluation and synchronous invocation escape. A returned Promise/Observable failure rejects the consumer Promise ([RDMPService.ts, lines 479–495](../../packages/redbox-core/src/services/RDMPService.ts#L479-L495)).

`RecordsService.updateNotificationLog` is `async` and therefore always returns a Promise. With `saveRecord=false`, it applies the notification log/flag to the live record and resolves to that same reference. With `saveRecord=true`, it applies the change to the internal mutation snapshot, leaves the caller's record untouched, requires confirmed persistence, reloads the record, and resolves to that replacement ([RecordsService.ts, lines 6159–6201](../../packages/redbox-core/src/services/RecordsService.ts#L6159-L6201)). Focused tests exercise both direct return/mutation paths.

## Lifecycle orchestration baseline

### Create

For a configured record type, create resolves the starting/target workflow and authoritative form before hooks. If an explicit target is requested, it applies target workflow metadata and runs `onTransitionWorkflow.pre` first. It then runs `onCreate.pre`, validates the complete candidate, persists primary metadata, and finalizes attachments. After confirmed persistence it runs `onCreate.postSync`, validates and performs a chained metadata write when that phase is configured, and schedules `onCreate.post`. An explicitly targeted create then runs `onTransitionWorkflow.postSync`, performs its optional chained write, and schedules `onTransitionWorkflow.post`.

Characterization covers both ordinary create ordering and the explicitly targeted create sequence. The A01 fixture's targeted-create path has a transition `postSync` action and therefore one chained postSync persistence boundary; separate coordinator tests cover create `postSync` writeback behavior.

A pre/configuration failure prevents primary persistence. A postSync failure leaves the primary commit authoritative and returns a persisted warning. Detached failures are logged and do not alter the save response.

### Update

Update loads the authoritative record, brand, record type, revision, and target before hooks. A transition is detected from the explicit save context or a non-empty `nextStep`; changing `record.workflow` alone does not set `transitionRequested`. For an explicit transition, target workflow metadata and `onTransitionWorkflow.pre` run before `onUpdate.pre`. The complete candidate is normalized and validated, primary metadata is persisted, and attachments are finalized.

Confirmed updates then run `onUpdate.postSync`, its optional validated chained write, and schedule `onUpdate.post`. Explicit transitions subsequently run `onTransitionWorkflow.postSync`, its optional validated chained write, and schedule `onTransitionWorkflow.post`. Characterization tests assert both the positive explicit-target path and the absence of transition hooks on an ordinary update.

The A01 lifecycle tests pass the persisted default-brand `RecordType` row without replacing its hook definitions. Test service stubs are attached to the exact `sails.services.*` expressions stored in those definitions, and each stub's received options are compared with the corresponding persisted definition. This keeps the runtime hook payload linked directly to the fixture while allowing persistence boundaries to be observed. Broader synthetic coordinator tests remain separate and are not used as evidence that the A01 fixture itself contains those definitions.

### Delete

Delete resolves the authoritative record, brand, record type, authorization, and revision before running `onDelete.pre`. It then writes the lifecycle tombstone intent, conditionally removes the active record, finalizes the tombstone (or completes purge handling), writes the deliberately partial delete audit, and removes the search document. Only after confirmed removal does it run `onDelete.postSync` and schedule `onDelete.post`.

A delete pre failure prevents the tombstone/removal sequence. A postSync failure produces a persisted warning. The audit is intentionally captured at the existing pre-post boundary and therefore does not claim detached completion. The A01 delete characterization passes the persisted representative record row as its delete input and the persisted default-brand record-type row as its hook payload; its configured pre and detached post definitions remain unchanged.

### Workflow transition

`onTransitionWorkflow` is an additional lifecycle mode around an explicitly requested create/update target; it is not inferred from the legacy `transitionWorkflow` action mutating a record. `transitionWorkflowStepMetadata` assigns `previousWorkflow`, target `workflow`, target form, and role defaults before transition pre hooks. Transition pre runs before the ordinary create/update pre phase. Transition postSync and post run after the corresponding create/update postSync path and primary persistence.

The future automatic-transition engine must make any intentional change from this detection and ordering baseline explicit.

## Migration constraints captured by A01

- Every one of the 11 shipped expressions has a proposed owner, namespaced migration identity, and parameter transform.
- Every mapping explicitly copies, drops, or transforms `forceRun`; tests require that disposition to match the corresponding parameter-transform operation.
- `transitionWorkflow` is mapped to a first-class automatic-transition migration target, not approved as a permanent mutating registry handler.
- `onNotifySuccess` children become ordinary bindings dependent on successful parent email completion.
- `runHooksSync` children flatten into adjacent bindings; malformed/unknown children fail migration rather than retaining legacy skip behavior.
- Queued nested functions become a queue-owned registered action reference rather than a persisted function string.
- Unknown expressions use the negative fixture and have no mapping entry.

Downstream tasks own final registry contracts, handlers, immutable result semantics, runtime replacement, and the database migration itself.
