# Form Component Creation Plan: Cancel and TabNav Buttons

The goal is to create new `CancelButtonComponent` and `TabNavButtonComponent` in the new form framework (`angular/projects/researchdatabox/form`), following the "ReDBox Form Components" skill and using `SaveButtonComponent` as a reference. This plan also includes migration logic from the legacy v4 configuration.

## User Review Required

> [!NOTE]
> I am following the "ReDBox Form Components" skill to create these as full-fledged form components.
>
> **Tab Navigation Logic:**
> `TabNavButtonComponent` will find its target `TabComponent` by name using `FormComponent.getComponentDefByName()`. It will then locate the `TabComponent` instance from the definition and call `selectTab()` on it. This avoids needing a new global event type.

## Proposed Changes

### 1. Define Component Contracts (`packages/sails-ng-common`)

#### [NEW] [cancel-button.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/component/cancel-button.outline.ts)

- Define `CancelButtonFieldComponentConfigFrame`, `CancelButtonFieldComponentDefinitionFrame`, `CancelButtonFormComponentDefinitionFrame` and their outlines.
- Define `CancelButtonTypes` union.

#### [NEW] [cancel-button.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/component/cancel-button.model.ts)

- Implement `CancelButtonFieldComponentConfig`, `CancelButtonFieldComponentDefinition`, `CancelButtonFormComponentDefinition` classes.
- Implement `accept` methods for visitors.
- Export `CancelButtonMap` and `CancelButtonDefaults`.

#### [NEW] [tab-nav-button.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/component/tab-nav-button.outline.ts)

- Define config for `prevLabel`, `nextLabel`, `targetTabContainerId`, `endDisplayMode`.

#### [NEW] [tab-nav-button.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/component/tab-nav-button.model.ts)

- Implement model classes and visitor acceptance.

### 2. Register Dictionary and Exports (`packages/sails-ng-common`)

#### [MODIFY] [index.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/index.ts)

- Export new component files.

#### [MODIFY] [dictionary.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/dictionary.outline.ts)

- Add `CancelButtonTypes` and `TabNavButtonTypes` to `AllTypes`.

#### [MODIFY] [dictionary.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/dictionary.model.ts)

- Add maps and defaults to `AllDefs` and `RawDefaults`.

### 3. Wire Visitor Infrastructure (`packages/sails-ng-common`)

#### [MODIFY] [base.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/base.outline.ts)

- Add visit methods for `CancelButton` and `TabNavButton` definitions.

#### [MODIFY] [base.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/base.model.ts)

- Add default empty implementations for new visit methods.

#### [MODIFY] [migrate-config-v4-v5.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/migrate-config-v4-v5.visitor.ts)

- Add `CancelButton` and `TabNavButton` to `formConfigV4ToV5Mapping`.
  - `CancelButton` -> `CancelButtonComponent`
  - `TabNavButton` -> `TabNavButtonComponent`
- Implement `visitCancelButtonFieldComponentDefinition` to populate config from v4 definition (label).
- Implement `visitTabNavButtonFieldComponentDefinition` to populate config (prevLabel, nextLabel, targetTabContainerId).

### 4. Implement Angular Form Components (`angular/projects/researchdatabox/form`)

#### [NEW] [cancel-button.component.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/form/src/app/component/cancel-button.component.ts)

- Create `CancelButtonComponent` extending `FormFieldBaseComponent`.
- Implement `cancel()` method to navigate back (e.g. using `Location.back()`).
- Support `disabled` state similar to `SaveButtonComponent`.

#### [NEW] [tab-nav-button.component.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/form/src/app/component/tab-nav-button.component.ts)

- Create `TabNavButtonComponent`.
- In `next()` and `prev()` methods:
  - Use `this.formComponent.getComponentDefByName(this.componentDefinition.config.targetTabContainerId)` to find the target tab component definition.
  - Access the `TabComponent` instance from the definition.
  - Call `tabComponent.selectTab(tabId)`.
  - Handle logic to determine _which_ tab ID to select (next or previous based on current selection).

### 5. Register Angular Wiring

#### [MODIFY] [form.module.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/form/src/app/form.module.ts)

- Register new components.

#### [MODIFY] [static-comp-field.dictionary.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts)

- Map definitions to Angular components/models.

## Verification Plan

### Automated Tests

- Create spec files for new components:
  - `cancel-button.component.spec.ts`
  - `tab-nav-button.component.spec.ts`
- Verify rendering and basic interaction logic.
- Verify migration visitor correctly maps v4 config to v5 config for these components.

### Manual Verification

- Requires integrating into a running app and configuring a form to use these new components.
