# Feature: Form Lifecycle

## Overview
Enhance the form lifecycle management by introducing a new status, `VALIDATION_PENDING`, to the existing `FormStatus` enum (see `status.model.ts`). This status represents the period when the form’s asynchronous validators are running. The Save button should be disabled during this state to prevent premature submission.

## Requirements

### 1. Enum Enhancement
- Add `VALIDATION_PENDING` to the `FormStatus` enum in `status.model.ts`.

### 2. FormComponent Logic
- When the `form` (FormGroup) in `FormComponent` has pending asynchronous validation, set the status to `FormStatus.VALIDATION_PENDING`.
- Revert to the appropriate status (e.g., `READY`) once validation completes.
- Use Angular’s `statusChanges` observable to detect changes in validation state.

### 3. SaveButtonComponent Enhancement
- The SaveButtonComponent must be disabled if the form is not ready (including when status is `VALIDATION_PENDING`).

## Acceptance Criteria

- [ ] `FormStatus` enum includes `VALIDATION_PENDING`.
- [ ] When the form’s async validators are running, the status is set to `VALIDATION_PENDING` in `FormComponent`.
- [ ] The Save button is disabled when the form is not ready, including during async validation.
- [ ] The Save button is enabled only when the form is valid and ready.

## Dependencies

- `FormStatus` enum in `status.model.ts`
- `FormComponent` (with a `form: FormGroup` property)
- `SaveButtonComponent`
