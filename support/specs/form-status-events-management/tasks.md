# Tasks: Form Status & Events Management

1. [X] Scaffold `form-state` module plumbing under `angular/projects/researchdatabox/form/src/app/form-state/`, exporting `provideFormFeature()` that registers the `'form'` reducer and `FormEffects` via standalone providers; cover with a provider wiring unit test. (R1.1, R1.2, R1.3, R14.1)
2. [X] Define `FormFeatureState`, initial state, and action creators in `form-state/state/`, implement a pure reducer handling load/submit/reset/validation transitions, and add reducer tests for default state, each transition, and unknown actions. (R2.1–R2.14, R3.1, R4.1, AC1–AC17, AC22)
3. [X] Implement memoized selectors (`selectStatus`, `selectIsInitializing`, `selectBridgeSnapshot`, etc.) in `form-state/state/` and verify memoization/derivations with selector tests. (R6.1, R6.2, R10.1, AC10, AC11, AC21, AC23)
4. [X] Build NgRx effects (`loadInitialData$`, `submitForm$`, `resetAllFields$`, validation lifecycle flows) in `form-state/effects/` with error sanitisation and diagnostics logging, plus marble tests covering success, failure, gating, and error channels. (R4.2–R4.7, R5.1–R5.4, R10.3, R11.1–R11.4, AC2–AC17, AC41)
5. [X] Implement `FormEventBus` service in `form-state/events/` providing publish/Observable/Signal APIs, scoped channels, and auto teardown, alongside unit tests for ordering, fan-out, performance guard, and naming helpers. (R15.1–R15.19, AC26–AC36)
6. [X] Create `FormEventBusAdapterEffects` to promote qualifying events into actions with throttling, diagnostics toggles, and optional registration, including tests for each promotion criterion and disablement. (R15.20–R15.29, AC37–AC44)
7. [X] Deliver `FormStateFacade` and `FormStatusSignalBridge` in `form-state/facade/`, exposing signals, imperative APIs, snapshot helpers, and preventing direct status mutation, with facade/bridge unit tests validating signal outputs and dirty diff behaviour. (R7.1–R7.7, R8.1–R8.7, R16.4, R16.7–R16.17, AC18–AC21, AC57–AC58)
8. [X] Refactor `FormComponent` to consume the facade/bridge for load, submit, reset, and validation workflows, dispatch dirty/pristine actions, and remove direct status mutations while keeping existing templates intact; extend component tests to assert new dispatch paths. (R16.1–R16.16, AC52–AC56)
9. [X] Add an Angular TestBed integration spec bootstrapping `FormComponent` with the new providers to verify INIT→READY, reset propagation, and facade observability without runtime errors. (R12.4, R12.5, R16.12, AC52, AC59)
10. [X] Update developer docs (e.g., form README snippet) describing facade/event bus consumption and event naming diagnostics to satisfy documentation requirements. (R11.4, R13.1–R13.3, R15.26)


## Delta Tasks: Save via EventBus → NgRx Effect

11. [X] Add save events and helpers in EventBus (R15.2–R15.5)
	- Add new typed events: `form.save.requested` (publish from UI) and `form.save.execute` (command back to component).
	- Extend the `FormComponentEvent` discriminated union and export factory helpers:
	  - `createFormSaveRequestedEvent({ force?, skipValidation?, targetStep?, sourceId? })`
	  - `createFormSaveExecuteEvent({ force?, skipValidation?, targetStep?, sourceId? })`
	- Acceptance: TypeScript compiles; event factories are unit-tested (happy path + payload passthrough); no state shape changes; no state additions.

12. [X] SaveButton publishes save-request instead of calling component (R7.1, R15.2)
	- Update `SaveButtonComponent.save()` to publish `form.save.requested` via `FormComponentEventBus`.
	- Preserve existing guard conditions (disabled, status gating) and logging.
	- Acceptance: Component spec asserts bus.publish is called with the expected event; remove/adjust any tests that mocked `FormComponent.saveForm` directly from the button.

13. [X] Promote save-request event to NgRx action (R15.20–R15.23)
	- In `FormEventBusAdapterEffects`, add a promotion stream mapping `form.save.requested` → `[Form] submitForm` (payload: `{ force, skipValidation, targetStep }`).
	- Include diagnostics logging behind the existing toggle and keep `catchError(() => EMPTY)`.
	- Acceptance: Adapter effects spec verifies a single `submitForm` dispatch for a published event and throttling/no duplication if applicable.

14. [X] Emit execute command on submitForm (no dispatch) (R5.1, R15.3)
	- In `FormEffects`, add a non-dispatching effect that listens to `submitForm` and publishes `form.save.execute` back to the EventBus carrying `{ force, skipValidation, targetStep }`.
	- Acceptance: Effects spec spies on EventBus.publish and asserts it’s called on `submitForm`.

15. [X] FormComponent invokes saveForm on execute command (R16.1, R16.12)
	- Subscribe to `form.save.execute` in `FormComponent` and call `this.saveForm(force, targetStep, skipValidation)`.
	- Ensure proper teardown in `ngOnDestroy` and avoid duplicate subscriptions.
	- Acceptance: Component unit test spies on `saveForm` and verifies it’s invoked when the execute event is published; no changes to the NgRx state model.

16. [X] Integration test: end-to-end button → event → action → execute (R12.5, R16.12)
	- Boot real `FormComponent` in TestBed; trigger SaveButton.save(); assert:
	  - `form.save.requested` was published,
	  - `submitForm` action observed (via spy/mock store), and
	  - `FormComponent.saveForm` was called via `form.save.execute`.
	- Keep assertions synchronous where possible; avoid timers.

17. [X] Backward-compatibility shim (optional)
	- Confirm `FormComponent.saveForm` remains callable programmatically; document that buttons should no longer call it directly.
	- Acceptance: No public API break for existing consumers beyond SaveButton behavior change.

18. [X] Requirements update (wording only; no new state)
	- Amend requirements to clarify: SaveButton publishes `form.save.requested`; adapter promotes to `submitForm`; effects publish `form.save.execute`; `FormComponent.saveForm` is called in response to the execute event.
	- Reference: R8.3 updated to detail full EventBus → NgRx → EventBus orchestration; R15.30 already present; R2.2–R2.8 confirm no new state fields introduced.

19. [X] Design update (runtime flow simplification)
	- Update the sequence in the design doc to reflect: SaveButton → EventBus(`form.save.requested`) → Adapter → `submitForm` → Effect → EventBus(`form.save.execute`) → `FormComponent.saveForm`.
	- Acceptance: Section 3.3 now explicitly describes `publishSaveExecuteOnSubmit$` effect and adapter promotion of `form.save.requested`; section 3.7 already correctly documents the full flow; section 2.1 diagram already shows complete event routing.

Notes
- Constraint: Do not introduce new form state—only events, promotion, and effects wiring change.
- Security/observability: Keep logging inside effects; sanitize payloads if logged.
- Performance: No additional reducer churn; bus remains O(1) per channel; effects use `catchError(() => EMPTY)` to avoid stream termination.
