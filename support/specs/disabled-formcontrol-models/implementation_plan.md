# Implementation Plan - Migrate ButtonBarContainerComponent to GroupComponent

The goal is to migrate the legacy `ButtonBarContainerComponent` functionality to the new form framework. This component is essentially a container for buttons (like Save, Cancel) that are layout-specific and should not affect the form's data model.
We will achieve this by enhancing the base `FormFieldModel` to support the `disabled` configuration property. This ensures that any component (including `GroupComponent`) can be configured to have its underlying `FormControl`/`FormGroup` disabled, excluding it from the parent form's value.

## User Review Required

> [!IMPORTANT]
> **Missing Button Components**: While `SaveButtonComponent` exists in the new framework, other components used in the example (`CancelButton`, `Spacer`, `TabNavButton`) were not found in `angular/projects/researchdatabox/form`. This plan focuses on enabling the container capability. You may need separate tasks to port these specific button components if they are not yet available.

## Proposed Changes

### Configuration Package (`sails-ng-common`)

#### [MODIFY] [field-model.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/field-model.outline.ts)

- Add `disabled?: boolean;` property to `FieldModelConfigFrame` interface.

#### [MODIFY] [field-model.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/field-model.model.ts)

- Add `disabled?: boolean;` property to `FieldModelConfig` class.

### Angular Project (`researchdatabox`)

#### [MODIFY] [base.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/portal-ng-common/src/lib/form/base.model.ts)

- Update `FormFieldModel.postCreate()` to check for `this.fieldConfig.config.disabled`.
- If `disabled` is true, call `this.formControl.disable()` to ensure the control is excluded from the parent form's value.

## Verification Plan

### Automated Tests

- Run existing tests for `GroupComponent` to ensure no regression:
  ```bash
  npx ng test researchdatabox --include "projects/researchdatabox/form/src/app/component/group.component.spec.ts"
  ```
- **New Test Case**: Add a test case to `group.component.spec.ts` (or creating a new spec if needed) to verify that a `GroupComponent` configured with `disabled: true`:
  1.  Initializes successfully.
  2.  Creates a `FormGroup` that is `disabled`.
  3.  When added to a parent form, does not contribute to the parent's value.

### Manual Verification

- Since this is a framework capability change, unit tests are the primary verification method.
