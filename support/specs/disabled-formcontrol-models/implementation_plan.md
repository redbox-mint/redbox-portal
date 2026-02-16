# Implementation Plan - Migrate ButtonBarContainerComponent to GroupComponent

The goal is to migrate the legacy `ButtonBarContainerComponent` functionality to the new form framework. This component is essentially a container for buttons (like Save, Cancel) that are layout-specific and should not affect the form's data model.

We will achieve this by enhancing the base `FormFieldModel` to support the `disabled` configuration property. This ensures that any component (including `GroupComponent`) can be configured to have its underlying `FormControl`/`FormGroup` disabled, excluding it from the parent form's value.

> [!NOTE]
> `CancelButtonComponent`, `TabNavButtonComponent`, and `SaveButtonComponent` are already implemented in the new framework. This plan focuses on enabling the container capability and handling layout.

## User Review Required

> [!IMPORTANT]
> **Spacer Component**: The legacy `Spacer` component will be replaced by CSS classes on the container or items. This requires updating the migration logic to apply appropriate classes (e.g., `d-flex gap-3`) and removing `Spacer` items.

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

#### [MODIFY] [migrate-config-v4-v5.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/migrate-config-v4-v5.visitor.ts)

- Update `visitGroupFieldComponentDefinition`:
  - Check if `field.class` or `field.compClass` is `ButtonBarContainer`.
  - If so, set `item.config.hostCssClasses = 'd-flex gap-3'`.
  - Filter `field.definition.fields` to remove items with `class: 'Spacer'`.
- Update `visitGroupFieldModelDefinition`:
  - Check if `field.class` or `field.compClass` is `ButtonBarContainer`.
  - If so, set `item.config.disabled = true`.

### Angular Project (`researchdatabox`)

#### [MODIFY] [base.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/portal-ng-common/src/lib/form/base.model.ts)

- Update `FormFieldModel.postCreate()` to check for `this.fieldConfig.config.disabled`.
- If `disabled` is true, call `this.formControl.disable()` to ensure the control is excluded from the parent form's value.

#### [Documentation] Migration Strategy

- **ButtonBarContainer**: Map to `GroupComponent` with `config.disabled = true`.
- **Layout**: Apply `hostCssClasses: 'd-flex gap-3'` (or similar utility classes) to the `GroupComponent` config to arrange buttons horizontally and utilize gap for spacing.
- **Spacer**: Remove `Spacer` items during migration, relying on the container's CSS gap.

## Verification Plan

### Automated Tests

- **Migration Visitor Test**:
  - Add a test case to `packages/sails-ng-common/test/unit/migrate-config-v4-v5.visitor.test.ts` to verify `ButtonBarContainer` migration:
    - Input: A `ButtonBarContainer` with `SaveButton` and `Spacer`.
    - Output: A `GroupComponent` with `hostCssClasses: 'd-flex gap-3'`, `disabled: true` model config, and `Spacer` removed.

- **Component Test**:
  - Run existing tests for `GroupComponent`:
    ```bash
    npx ng test researchdatabox --include "projects/researchdatabox/form/src/app/component/group.component.spec.ts"
    ```
  - Add a test case to `group.component.spec.ts` to verify `disabled` configuration works as expected (control is disabled).

### Manual Verification

- Since this is a framework capability change, unit tests are the primary verification method.
