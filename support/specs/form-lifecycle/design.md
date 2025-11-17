
# Design: Form Lifecycle Enhancement

## 1. `FormStatus` Enum

- Canonical values: `INIT`, `READY`, `SAVING`, `VALIDATION_PENDING`, `VALIDATION_ERROR`, `LOAD_ERROR`.
- The NgRx reducer is the source of truth for status transitions; components do not set status directly.
- Mapping notes:
  - Angular control `PENDING` corresponds to `VALIDATION_PENDING` (when not `SAVING`).
  - Validation failure after pending resolves corresponds to `VALIDATION_ERROR`.

## 2. FormComponent Status Management

- `FormComponent` observes the `FormGroup` and dispatches validation lifecycle actions instead of mutating status.
- Dispatch rules (simplified):
  - When validation starts (pending becomes true and not saving): dispatch `formValidationPending`.
  - When validation completes valid: dispatch `formValidationSuccess`.
  - When validation completes invalid (and not saving): dispatch `formValidationFailure`.
- StatusChanges are mirrored into `formGroupStatus` signal for comparison with previous snapshot.

## 3. SaveButtonComponent Enhancement

- The Save button publishes `form.save.requested` on the `FormComponentEventBus` instead of calling `FormComponent.saveForm()`.
- Disable/enable state is derived from facade signals (e.g., `status()`, `isValidationPending()`, `isSaving()`), not from a bespoke `formReady` input.
- The event is promoted to `[Form] submitForm` by adapter effects; a non-dispatching effect publishes `form.save.execute`, which `FormComponent` listens to and then calls `saveForm(force, targetStep, enabledValidationGroups)`.

## 4. Component Interaction

- `FormComponent` consumes the `FormStateFacade` signals for status and dirty tracking; it dispatches actions for load, validation, reset, and submit intents.
- `SaveButtonComponent` emits `form.save.requested` to the EventBus; `FormComponent` executes save upon receiving `form.save.execute`.

