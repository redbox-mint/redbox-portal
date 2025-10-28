# Form Status & Events Management (Global NGRX + Signals Bridge)

## 1. Introduction
The existing Form application centralizes orchestration in `FormComponent` while each field component (e.g. `SimpleInputComponent`) maintains its own local state using Angular Signals. Current global status tracking via a `status` signal in `FormComponent` is insufficient for:
- Cross-cutting orchestration (loading, saving, resetting, workflow steps)
- Predictable event diffusion to isolated field components
- Debuggability, time-travel/state inspection, and side-effect isolation

This feature introduces a global, testable, NGRX-powered state + event layer while preserving the autonomy of field components. A Bridge (Facade) converts store changes and dispatched intents into signal-friendly streams without exposing NGRX primitives to leaf components.

## 2. Goals
1. Introduce a lightweight but extensible global form state slice.
2. Preserve local Signals for field logic (value, validity, touched).
3. Provide deterministic global events: load, submit, reset, status transitions.
4. Allow future expansion: step navigation, async field resolution, collaborative indicators.
5. Minimize refactor blast radius (only `FormComponent` + new infrastructure + optional opt‑in in fields).
6. Provide a decoupled intra-form publish/subscribe mechanism for component-to-component interaction without leaking NGRX primitives.

## 3. Out of Scope
- Rewriting individual field components to use the store for their internal value.
- Real-time collaborative editing.
- Server schema evolution handling.
- UI theming concerns.

## 4. Definitions
- FormStatus (canonical enum from existing codebase `status.model.ts`): `INIT | READY | SAVING | VALIDATION_ERROR | LOAD_ERROR | VALIDATION_PENDING`.
- Deprecated / superseded conceptual statuses from earlier draft (LOADING, SAVE_SUCCESS, SAVE_ERROR, RESETTING, DIRTY, CLEAN) are REPLACED by:
	- Initial loading phase: Represented by `status === INIT` combined with `initialDataLoaded === false`.
	- Save success / failure: `status` returns to `READY` after save; success/failure captured via `lastSavedAt` and `error` (for failure). Validation-related errors use `VALIDATION_ERROR`; load errors use `LOAD_ERROR`.
	- Resetting: Represented by `resetToken` increment (no dedicated status change) – state remains in its previous stable status (typically `READY`).
	- Dirty / Clean: Represented solely by `isDirty: boolean` (no enum states).
- Validation lifecycle (per existing lifecycle spec):
	- `VALIDATION_PENDING` indicates async validation running (and not during `SAVING`).
	- `VALIDATION_ERROR` indicates validation failed after pending completes.
	- Transition back to `READY` when validation passes (form becomes valid and not pending) or after saving completes if still valid.
- Global Form State: Aggregate metadata describing lifecycle + batch operations.
- Bridge / Facade: Injectable service exposing Signals and imperative methods to non-NGRX components.
- Field Component: Any atomic input component currently using Signals for local state.
- Component Event Bus: A lightweight, in-memory pub/sub abstraction (facade layer) exposing typed channels for field components to publish domain events (e.g., value derived changes, dependency triggers) and subscribe to them via Signals or callbacks without referencing the NGRX store directly.

## 5. Hierarchical Numbered Requirements

### 5.1 NGRX Setup
R1.1 The application SHALL register a `form` feature state using `provideState` (standalone APIs) or `StoreModule.forFeature` depending on current Angular/NGRX version.  

R1.2 The application SHALL register one effect class `FormEffects` via `provideEffects` (or `EffectsModule.forFeature`).  

R1.3 The feature key SHALL be `'form'`.  

### 5.2 State Model
R2.1 The form feature state SHALL define interface `FormFeatureState`.  

R2.2 The state SHALL include: `status: FormStatus`, `initialDataLoaded: boolean`, `isDirty: boolean`, `lastSavedAt?: string`, `error?: string | null`, `pendingActions: string[]`, `resetToken: number`, `submissionAttempt: number`, `meta?: Record<string, any>`, `modelSnapshot?: any`.  

R2.3 The state SHALL be serializable (no functions / classes).  

R2.4 The state design SHALL allow adding `steps` and `validationSummary` later without breaking changes.  

R2.5 The initial data load phase SHALL be represented by `status === INIT` with `initialDataLoaded === false` (no separate LOADING status).  

R2.6 A load failure SHALL set `status = LOAD_ERROR` and populate `error`.  

R2.7 A full page reload from `LOAD_ERROR` SHALL reinitialize state and transition status back to `INIT` (per normal application bootstrap); programmatic retry (if implemented) MAY dispatch `loadInitialData` again to retry without page reload.  

R2.8 Save success SHALL leave `status = READY` and update `lastSavedAt`; save failure SHALL leave `status = READY` and set `error` (no SAVE_SUCCESS / SAVE_ERROR statuses).  

R2.9 Dirty tracking SHALL rely exclusively on `isDirty` (no DIRTY / CLEAN statuses).  

R2.10 Reset operations SHALL increment `resetToken` while preserving the prior stable status; if status is currently `SAVING`, the reducer SHALL ignore the reset action without modifying state.  

R2.11 Validation lifecycle SHALL use `VALIDATION_PENDING` when async validation is active (and not `SAVING`), and `VALIDATION_ERROR` when validation fails after pending resolves.  

R2.12 Transition from `VALIDATION_ERROR` back to `READY` SHALL occur when the form becomes valid and not pending.  

R2.13 The system SHALL introduce actions to reflect validation transitions: `formValidationPending`, `formValidationSuccess`, `formValidationFailure`.  

R2.14 The reducer SHALL ignore validation transition actions while `status === SAVING` (validation and saving are mutually exclusive; UI controls prevent concurrent validation during save, but suppression handles any programmatic edge cases).  

### 5.3 Actions
R3.1 Actions SHALL follow `[Form] <Event>` naming pattern.  

R3.2 Mandatory actions:

- Load: `loadInitialData`, `loadInitialDataSuccess`, `loadInitialDataFailure`
- Submit: `submitForm`, `submitFormSuccess`, `submitFormFailure`
- Reset: `resetAllFields`, `resetAllFieldsComplete`
- Status: `markDirty`, `markPristine`
- Utility: `ackError`, `syncModelSnapshot`
R3.3 Each async flow SHALL have start/success/failure triplet.  

R3.4 `resetAllFields` SHALL increment `resetToken` in state when reducer runs.  

### 5.4 Reducer
R4.1 Reducer SHALL be pure and handle all defined actions.  

R4.2 Reducer SHALL maintain `pendingActions` as a stack/array for async in-flight operations.  

R4.3 Reducer SHALL compute `isDirty` from explicit `markDirty` / `markPristine` actions (not implicit diffing).  

R4.4 Reducer SHALL transition `status` among the canonical set:

- INIT → READY | LOAD_ERROR
- LOAD_ERROR → INIT (on explicit retry) → READY | LOAD_ERROR
- READY → SAVING → READY
- READY → VALIDATION_PENDING → READY | VALIDATION_ERROR
- VALIDATION_ERROR → VALIDATION_PENDING | READY
R4.5 Reducer SHALL increment `submissionAttempt` on `submitForm`.  

R4.6 Reducer SHALL ignore validation transition actions while `status === SAVING`.  

### 5.5 Effects
R5.1 Effects SHALL isolate side-effects for loading, saving, and resetting.  

R5.2 `loadInitialData` effect SHALL invoke existing `FormService.getModelData`.  

R5.3 `submitForm` effect SHALL reuse logic from existing `saveForm` (moved/abstracted).  

R5.4 Effects SHALL dispatch failure actions with sanitized error messages.  

R5.5 Effects SHALL NOT directly manipulate form field instances.  

### 5.6 Selectors
R6.1 Provide base selectors: `selectFormState`, `selectStatus`, `selectIsDirty`, `selectError`, `selectResetToken`, `selectSubmissionAttempt`, `selectPending`, `selectIsSaving`, `selectIsValidationPending`, `selectHasValidationError`, `selectHasLoadError`, `selectIsInitializing` (derived: status===INIT && !initialDataLoaded).  

R6.2 Derived selectors SHALL be pure and memoized.  

R6.3 Bridge SHALL consume selectors only (never store snapshot manually).  

### 5.7 Bridge / Facade
R7.1 A `FormStateFacade` service SHALL wrap Store dispatches and expose:

- Signals: `status()`, `isDirty()`, `resetToken()`, `error()`, `isSaving()`, `isValidationPending()`, `hasValidationError()`, `hasLoadError()`, `isInitializing()`.
- Methods: `load()`, `reload()`, `submit(force?: boolean)`, `markDirty()`, `markPristine()`, `resetAllFields()`, `ackError()`.
R7.2 Facade SHALL internally convert selector Observables into Signals (using `toSignal`).  

R7.3 Field components SHALL inject (optionally) a lightweight `FormEventsBridge` (or receive via DI) to subscribe to reset events.  

R7.4 `FormEventsBridge` SHALL emit a simple signal `resetSequence()` derived from `resetToken`.  

R7.5 No field component SHALL import NGRX store, actions, or selectors directly.  

### 5.8 Integration with FormComponent
R8.1 `FormComponent` SHALL replace its `status` signal with facade `status()` read-only signal.  

R8.2 `FormComponent` SHALL dispatch `loadInitialData` on initialization with parameters derived from existing initialization logic (oid, recordType, formName).  

R8.3 The Save pathway SHALL be initiated from UI components (e.g., `SaveButtonComponent`) by publishing `form.save.requested` via the `FormComponentEventBus`. The `FormEventBusAdapterEffects` SHALL promote `form.save.requested` events to the `[Form] submitForm` action. The `FormEffects.publishSaveExecuteOnSubmit$` effect SHALL respond to `submitForm` by publishing a `form.save.execute` command event back to the EventBus. `FormComponent` SHALL subscribe to `form.save.execute` and invoke its existing `saveForm(force, targetStep, skipValidation)` method. This orchestration introduces no new state fields; `saveForm` remains public and callable programmatically for backward compatibility with integrations outside the EventBus flow.  

R8.4 `FormComponent` SHALL call `facade.resetAllFields()` on reset button click.  

R8.5 Existing debug / logging code SHALL adapt to use selectors via facade.  

R8.6 `FormComponent` SHALL monitor its `FormGroup.dirty` property and dispatch `markDirty` when dirty becomes true and `markPristine` when dirty becomes false, synchronizing Angular's built-in dirty tracking with the global store state.  

### 5.9 Field Component Interaction
R9.1 Field components SHALL listen to `FormEventsBridge.resetSequence()`; when it changes, they reset their local value Signal to default.  

R9.2 Field components SHALL update their bound `FormControl` values; dirty tracking is implicitly managed by Angular's FormGroup mechanism and synchronized to the store by `FormComponent` (per R8.6).  

R9.3 Field components SHALL NOT block UI while global status is `SAVING` or `VALIDATION_PENDING`; UI disable states SHALL consider `hasValidationError()` and `isValidationPending()`.  

### 5.10 Performance & Optimization
R10.1 Bridge SHALL minimize recomputation by grouping derived selectors if frequently consumed together.  

R10.2 Field components SHALL avoid triggering reset logic if `resetToken` value has not changed from the previous value.  

R10.3 Effects SHALL debounce rapid consecutive submit attempts (configurable).  

R10.4 Validation-related actions SHALL avoid redundant dispatches if status already reflects the desired validation state.  

### 5.11 Error Handling & Observability
R11.1 Failures SHALL populate `error` in state with a user-safe message.  

R11.2 An `ackError` action SHALL clear `error`.  

R11.3 Logging (via existing LoggerService) SHALL run inside effects only.  

R11.4 A debug selector SHALL expose consolidated diagnostic info for dev tooling.  

### 5.12 Testing
R12.1 Reducer unit tests SHALL cover all state transitions.  

R12.2 Effects tests SHALL mock `FormService`.  

R12.3 Facade tests SHALL verify signal derivations (using `fakeAsync` or Jest timers).  

R12.4 Field integration test SHALL assert reset propagation via `resetToken` change.  

R12.5 A minimal harness SHALL simulate submit success and failure.  

### 5.13 Documentation & Developer Experience
R13.1 README snippet SHALL describe how to consume the facade in a new field component.  

R13.2 JSDoc SHALL annotate public facade API.  

R13.3 Architecture diagram (Mermaid) SHALL be included in design phase.  

### 5.14 Non-Functional
R14.1 All new code SHALL be tree-shakeable and avoid side-effect imports.  

R14.2 The solution SHALL support SSR compatibility (no direct window usage).  

R14.3 The solution SHALL avoid cyclic imports (enforce layering: Actions -> Reducer -> Selectors -> Effects -> Facade -> Components).  

R14.4 The bridge SHALL tolerate absence of some optional field components (no runtime errors).  

### 5.15 Component Publish/Subscribe Event Bus
R15.1 The system SHALL provide a `FormComponentEventBus` (or similarly named) injectable service/facade separate from `FormStateFacade` dedicated to intra-form pub/sub.  

R15.2 The event bus SHALL allow components to publish events using a method signature like `publish<T extends FormComponentEvent>(event: T)`.  

R15.3 The event bus SHALL allow subscription by event type (discriminated union key) via `select$(type)` returning an Observable and optionally `selectSignal(type)` returning a Signal.  

R15.4 Event types SHALL be defined as a discriminated union interface collection `FormComponentEvent` with a required `type` string (e.g., `'field.value.changed'`, `'field.request.focus'`, `'field.validation.request'`).  

R15.5 The event bus SHALL maintain no retained history (fire-and-forget) except optionally the last event per channel when explicitly requested via a replay selector.  

R15.6 The event bus SHALL be implemented using RxJS Subjects or signal-based channels isolated from NGRX store to avoid unnecessary reducer churn.  

R15.7 The event bus SHALL NOT dispatch NGRX actions directly; translation to store actions (if needed) SHALL occur only inside a dedicated adapter layer or effect.  

R15.8 Subscriptions SHALL auto-complete on form destroy (e.g., leveraging `takeUntilDestroyed` or a provided destroy token) to prevent memory leaks.  

R15.9 The bus API SHALL be framework-agnostic enough to be reused in other modules (keep minimal Angular dependencies).  

R15.10 The bus SHALL expose a typed helper for scoped channels (e.g., per field id) to reduce broad event fan-out.  

R15.11 Publishing an event SHALL be O(1) relative to number of subscribers on other channels (no global fan-out scanning).  

R15.12 The design SHALL prevent accidental infinite loops (e.g., by documenting pattern: field updates => publish => other field reacts without re-publishing same event).  

R15.13 The bus SHALL provide a development-only diagnostic hook (e.g., optional logger) toggled via environment flag.  

R15.14 The bus SHALL NOT be required for resets handled via `resetToken`; it is complementary for domain-specific interactions.  

R15.15 The facade SHALL re-export minimal event type helpers to keep component import surfaces small.  

R15.16 The system SHALL document canonical event naming scheme: `namespace.domain.action` (dot-delimited, lower-case).  

R15.17 The bus SHALL support at least these initial event types: `field.value.changed`, `field.meta.changed`, `field.dependency.trigger`, `field.request.focus`, `form.validation.broadcast`.  
R15.17.1 Additionally, the bus SHALL support `form.save.requested` (published by UI) and `form.save.execute` (published by effects to command the component to run save).  

R15.18 The bus SHALL allow synchronous consumption in components (Signals) and asynchronous (Observable) in effects for flexibility.  

R15.19 The bus SHALL avoid causing change detection storms by batching microtask emissions where possible (e.g., `queueMicrotask` or `scheduled` strategy) — optional optimization flagged in design.  

R15.20 The system SHALL define explicit promotion criteria for when a bus event is escalated into a NGRX action: (a) affects persistent global state, (b) triggers a side-effect, or (c) requires replay in debugging.  

R15.21 Promotion logic SHALL reside in a dedicated adapter effect (`FormEventBusAdapterEffects`) that subscribes to selected bus events and dispatches corresponding `[Form]` actions.  

R15.22 The adapter effect SHALL implement guard logic to prevent duplicate dispatches for identical idempotent events within a throttling window (configurable, default 250ms).  

R15.23 Promoted events SHALL be mapped to clearly named actions (e.g., `[Form] Dependency Evaluated`) rather than reusing ephemeral event type strings.  

R15.30 Publishing `form.save.requested` SHALL be promoted by the adapter to `[Form] submitForm`. The `submitForm` effect SHALL publish `form.save.execute` back to the EventBus to trigger `FormComponent.saveForm` without introducing new state fields.  

R15.24 Non-promoted events SHALL never reach the global store to avoid action noise.  

R15.25 The promotion criteria SHALL be documented in developer docs (README snippet).  

R15.26 A diagnostic mode SHALL log each promotion decision including rationale (matched criterion).  

R15.27 The adapter SHALL be optional; if not provided, the bus operates without promotion capability.  

R15.28 The promotion process SHALL not materially degrade performance (no more than +1ms median per promoted event in local benchmarks).  

R15.29 Unit tests SHALL cover at least one example of each promotion criterion.  

### 5.16 Integration With Existing Components (Non-Contrived)
R16.1 The design/examples SHALL reference the existing `FormComponent` (at `angular/projects/researchdatabox/form/src/app/form.component.ts`) instead of introducing a contrived placeholder component.

R16.2 The existing `FormComponent` SHALL be adapted to delegate global lifecycle responsibilities to the new `FormStateFacade` (load, submit, reset) while preserving its current responsibilities (dynamic component loading, validation monitoring) until migrated incrementally.

R16.3 The existing validation monitoring logic inside `FormComponent` SHALL be refactored to dispatch validation lifecycle actions (`formValidationPending`, `formValidationSuccess`, `formValidationFailure`) instead of directly mutating its local `status` signal once the facade is integrated.

R16.4 The existing `status` signal in `FormComponent` SHALL be preserved and sourced from (or mirrored by) the store via the facade through a permanent adapter layer.

R16.5 The existing `SimpleInputComponent` (in `component/simpleinput.component.ts`) SHALL remain unchanged in its internal value handling but MAY optionally inject the facade or event bus in a later phase—no mandatory modifications in the first integration iteration.

R16.6 No existing public inputs/outputs of `SimpleInputComponent` SHALL be broken by the introduction of the global state slice.

R16.7 A permanent adapter service (`FormStatusAdapter` or `FormStatusSignalBridge`) SHALL expose Signals bridging the store-driven status to component-friendly signals, allowing field components to remain decoupled from NGRX and rely on Angular Signals to read FormComponent status.

R16.8 The first integration milestone SHALL wire only load + submit flows through NgRx, leaving advanced behaviors (e.g., dependency evaluation) untouched until subsequent tasks.

R16.9 The design SHALL document how `saveForm` in `FormComponent` maps to `submitForm` action dispatch and how `saveResponse` is reconciled with store state (`lastSavedAt`, `error`).

R16.10 The dynamic component loading sequence SHALL remain synchronous w.r.t the existing initialization order; store initialization SHALL NOT delay component instantiation.

R16.11 Logging currently performed in `FormComponent` around load/save SHALL be moved (or duplicated initially) into effects to avoid divergence.

R16.12 Unit tests SHALL include at least one integration test bootstrapping the real `FormComponent` with the new facade ensuring no runtime errors and verifying initial `INIT -> READY` transition.

R16.13 The requirements SHALL avoid prescribing modifications to field components beyond optional facade/event bus injection (future opt-in tasks).

R16.14 The facade SHALL provide an `observeStatus()` helper returning a Signal/Observable for components that prefer signal-based reactive access to form status.

R16.15 The local `status` signal usage in `FormComponent` SHALL be documented as the canonical signal-based interface for child components to observe form status.

R16.16 The integration SHALL not alter existing form template bindings except replacing direct `status()` access with facade-driven signal when available.

R16.17 Any direct mutation of `FormComponent.status` after integration (except within the adapter) SHALL be considered a lint violation (future enforcement). 

## 6. User Stories

US1 As a form user, I want the form to load initial data reliably so that I can edit existing records.  

US2 As a form user, I want to submit the form and see a saving indicator so that I know my data is being processed.  

US3 As a form user, I want to reset the form so that I can discard unsaved edits.  

US4 As a developer, I want predictable global state transitions so that debugging is simpler.  

US5 As a developer, I want field components decoupled from NGRX so that they remain reusable in non-store contexts.  

US6 As a developer, I want a bridge service exposing Signals so that components can react without store boilerplate.  

US7 As a QA engineer, I want deterministic reset events so that automation can assert fresh state.  

US8 As a maintainer, I want explicit dirty tracking so that accidental persistence is avoided.  

US9 As a developer, I want a simple publish/subscribe bus so that field components can react to each other’s domain events without coupling to NGRX or each other.

## 7. Acceptance Criteria (EARS Format)

AC1 (Ubiquitous) The system shall register a form feature state with the specified interface at app bootstrap. (R1.1, R2.1)  

AC2 (Event-driven) When the `loadInitialData` action is dispatched while in INIT, the system shall remain in INIT until success or failure. (R2.5)  

AC3 (Event-driven) When `loadInitialDataSuccess` occurs, the system shall set status to READY and mark `initialDataLoaded = true`. (R2.5)  

AC4 (Event-driven) When `loadInitialDataFailure` occurs, the system shall set status to LOAD_ERROR and populate error. (R2.6)  

AC5 (Event-driven) When `submitForm` is dispatched, the system shall set status to SAVING and add the action to pendingActions. (R3.2, R4.2, R4.4)  

AC6 (Event-driven) When `submitFormSuccess` occurs, the system shall set status to READY, update `lastSavedAt`, clear `pendingActions` for that action, and set `isDirty = false`. (R2.8, R4.4)  

AC7 (Event-driven) When `submitFormFailure` occurs, the system shall set status to READY, record error, retain `isDirty = true`. (R2.8, R11.1)  

AC8 (Event-driven) When `resetAllFields` is dispatched while status is not SAVING, the system shall increment `resetToken` without changing status. (R2.10)  

AC8b (Unwanted) When `resetAllFields` is dispatched while status is SAVING, the system shall ignore the action and leave state unchanged. (R2.10)  

AC9 (Event-driven) Field components reacting to `resetToken` change shall reset their local values. (R7.4, R9.1)  

AC10 (State-driven) While status is SAVING, the system shall expose `isSaving` selector as true. (R6.1)  

AC11 (State-driven) While there are entries in pendingActions, the system shall expose a non-empty array via selector. (R4.2)  

AC12 (Event-driven) When `markDirty` is dispatched, the system shall set `isDirty = true` (status unaffected). (R2.9, R4.3)  

AC13 (Event-driven) When `markPristine` is dispatched, the system shall set `isDirty = false` (status unaffected). (R2.9, R4.3)  

AC14 (Event-driven) When ackError is dispatched, the system shall clear error. (R3.2, R11.2)  

AC15 (Event-driven) When resetToken increments, field components shall reset their local value Signals. (R7.4, R9.1)  

AC16 (Unwanted) If a submitFormFailure occurs, the system shall retain isDirty = true. (R4.3)  

AC17 (Unwanted) If an effect throws unexpectedly, the system shall dispatch a failure action with sanitized error. (R5.4, R11.1)  

AC18 (Ubiquitous) The facade shall expose read-only Signals for core selectors. (R7.1)  

AC19 (Event-driven) When facade.resetAllFields() is invoked, it shall dispatch resetAllFields. (R7.1, R8.4)  

AC20 (Ubiquitous) The reducer shall remain pure (no side effects or service calls). (R4.1)  

AC21 (State-driven) While status is INIT and `initialDataLoaded` is false, the UI shall be able to show loading skeletons via `isInitializing()` Signal. (R6.1, R2.5)  

AC22 (Unwanted) If unknown actions are received, the reducer shall return the current state unchanged. (R4.1)  

AC23 (Ubiquitous) All selectors shall be memoized. (R6.2)  

AC24 (Ubiquitous) Tests shall cover at least one success and one failure path per effect. (R12.2)  

AC25 (Ubiquitous) A field component test shall confirm it does not import Store directly. (R12.4)  

AC25b (Event-driven) When FormComponent's FormGroup dirty state changes from false to true, FormComponent shall dispatch markDirty. (R8.6)  

AC25c (Event-driven) When FormComponent's FormGroup dirty state changes from true to false, FormComponent shall dispatch markPristine. (R8.6)  

AC26 (Ubiquitous) The system shall expose a FormComponentEventBus service with `publish` and `select$` methods. (R15.1, R15.2, R15.3)  

AC27 (Event-driven) When a component publishes `field.value.changed`, subscribers registered for that event type shall receive the payload in-order. (R15.2, R15.3, R15.17)  

AC28 (State-driven) While no subscribers exist for an event, publishing shall complete without error and no memory retained. (R15.5, R15.11)  

AC29 (Unwanted) If a component publishes an unknown event type, the system shall log (dev mode) and ignore it without throwing. (R15.13)  

AC30 (Unwanted) If a subscriber throws, the bus shall isolate the error and continue delivering to remaining subscribers. (R15.6, R15.13)  

AC31 (Event-driven) When a component is destroyed, its active event subscriptions shall terminate automatically. (R15.8)  

AC32 (Ubiquitous) Event type names shall conform to documented naming scheme. (R15.16)  

AC33 (Ubiquitous) A test shall verify publish/subscribe roundtrip time within acceptable bounds (< 5ms local). (R15.11)  

AC34 (Event-driven) When `form.validation.broadcast` is published, each subscribed field shall invoke its local validation refresh logic once. (R15.17)  

AC35 (Unwanted) Publishing `resetAllFields` shall not route through the event bus (handled by store / resetToken). (R15.14)  

AC36 (Ubiquitous) The bus shall offer both Observable and Signal interfaces for at least one event type in tests. (R15.18)

AC37 (Ubiquitous) An adapter effect shall promote qualifying bus events into NGRX actions when criteria are met. (R15.21, R15.22)  

AC38 (Event-driven) When a bus event meeting promotion criterion (a) occurs, the corresponding action shall be dispatched exactly once. (R15.21, R15.22)  

AC39 (Unwanted) If an event does not meet any promotion criteria, no action shall be dispatched. (R15.20, R15.24)  

AC40 (Ubiquitous) Promotion decisions shall be logged in diagnostic mode with matched criterion code. (R15.26)  

AC41 (Performance) Median added latency per promoted event shall not exceed +1ms under local dev conditions. (R15.28)  

AC42 (Event-driven) Two identical idempotent events within the throttling window shall result in one action dispatch. (R15.22)  

AC43 (Ubiquitous) Tests shall demonstrate promotion for each criterion category (a–c). (R15.29)  

AC44 (Unwanted) Disabling the adapter effect shall result in zero promotions while bus functionality remains intact. (R15.27)  

AC45 (Event-driven) When async validation starts (form pending), the system shall set status to VALIDATION_PENDING (unless SAVING). (R2.11, R2.14)  

AC46 (Event-driven) When `formValidationSuccess` is dispatched, the system shall set status to READY. (R2.11, R2.13)  

AC47 (Event-driven) When `formValidationFailure` is dispatched, the system shall set status to VALIDATION_ERROR (unless SAVING). (R2.11, R2.13)  

AC48 (Event-driven) When in VALIDATION_ERROR and validation restarts (pending becomes true), the system shall set status to VALIDATION_PENDING. (R2.11)  

AC49 (Event-driven) When in VALIDATION_ERROR and form becomes valid (not pending), the system shall set status to READY. (R2.12)  

AC50 (Event-driven) A reload from LOAD_ERROR shall dispatch loadInitialData and set status to INIT until completion. (R2.7)  

AC51 (Unwanted) While status is SAVING, validation transition actions shall not change status. (R2.14, R4.6)  

AC52 (Ubiquitous) The existing FormComponent shall initialize without runtime errors when the form feature state and facade are registered. (R16.1, R16.12)

AC53 (Event-driven) When FormComponent completes dynamic component loading, the facade-backed status shall become READY. (R16.2, R16.12)

AC54 (Event-driven) Invoking the legacy save method (`saveForm`) shall dispatch `submitForm` via the facade. (R16.9)

AC55 (Unwanted) No public API (inputs/outputs) of SimpleInputComponent shall change after integration. (R16.5, R16.6)

AC56 (Event-driven) When async validation transitions occur, FormComponent shall dispatch validation lifecycle actions (`formValidationPending`, `formValidationSuccess`, `formValidationFailure`) rather than mutate local status directly (post-migration). (R16.3, R2.13)

AC57 (Ubiquitous) The adapter service shall expose Signals reflecting store status, enabling field components to observe form status without NGRX dependencies. (R16.7, R16.14)

AC58 (Unwanted) Direct writes to `FormComponent.status` after migration (excluding adapter) shall be absent in code search. (R16.17)

AC59 (Ubiquitous) An integration test shall assert INIT -> READY transition using the real FormComponent and facade. (R16.12)

## 8. Open Questions (To Revisit in future iterations)
Q1 Should SAVE_SUCCESS remain visible (ephemeral) for a short toast window?  
Q2 Should multiple parallel submits be debounced or ignored?  
Q3 Should we persist partial progress locally (draft mode)?  

## 9. Assumptions
A1 Existing services (`FormService`, `RecordService`) remain unchanged.  
A2 `FormStatus` enum already exists and can be safely extended with DIRTY, CLEAN, RESETTING if not present.  
A3 Field components can accept a new optional injection token/service without breaking.  

## 10. Risks & Mitigations
- Risk: Over-coupling future steps to current state model → Mitigation: use additive fields & version-neutral interface.  
- Risk: Excess re-renders on rapid status changes → Memoized selectors + Signals.  
- Risk: Field resets racing with save → Sequence gating: save effect checks status not RESETTING.  

## 11. Traceability Matrix (Summary)
| Req Group | Key Actions/Artifacts |
|-----------|-----------------------|
| R1–R6 | NGRX infrastructure (actions, reducer, effects, selectors) |
| R7–R9 | Facade + Bridge + Component integration |
| R10–R11 | Performance & error handling strategies |
| R12 | Test coverage |
| R13–R14 | Documentation + Non-functional constraints |
| R15 | Component-level pub/sub event bus |

---
