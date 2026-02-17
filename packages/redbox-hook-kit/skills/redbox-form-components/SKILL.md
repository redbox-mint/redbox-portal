---
name: "Redbox Form Components"
description: "Build or update ReDBox form field components end-to-end across Angular form rendering and sails-ng-common config typing/visitor infrastructure. Use when creating a new form component class/model, adding component config properties, wiring component dictionaries, handling config migration/template extraction, or adding form-component tests."
---

# Skill: Redbox Form Components

Use this workflow to add a new form component that is actually usable in form config, construct/migrate/template visitors, and Angular runtime.

## Start With Generator
- First run the hook-kit scaffold command:
- `redbox-hook-kit generate form-component <name> --app form`
- Optional companion service scaffold:
- `redbox-hook-kit generate form-component <name> --app form --with-service`
- Treat the generated files as the baseline, then implement component-specific config properties, rendering logic, and visitor custom behavior.

## Canonical Example
- Treat `CheckboxTreeComponent` as the reference implementation:
- `angular/projects/researchdatabox/form/src/app/component/checkbox-tree.component.ts`
- `packages/sails-ng-common/src/config/component/checkbox-tree.outline.ts`
- `packages/sails-ng-common/src/config/component/checkbox-tree.model.ts`

## Implementation Workflow
1. Define component and model contracts in `sails-ng-common`.
2. Register those contracts in dictionary/type unions.
3. Add visitor methods everywhere (`base.*` plus concrete visitors).
4. Implement Angular component/model and register them in the form app.
5. Add/update supporting services only if the component needs API data.
6. Add tests for runtime behavior and visitor behavior.

## 1) Define the component contract (`sails-ng-common`)
- Create `packages/sails-ng-common/src/config/component/<component>.outline.ts`.
- Export component/model name constants (`<ComponentName>`, `<ModelName>`).
- Define config frames/outlines for both field component and field model.
- Define form component frame/outline and final `<Component>Types` union.
- Create `packages/sails-ng-common/src/config/component/<component>.model.ts`.
- Implement config/definition/model classes with `accept(visitor)` methods.
- Export `<Component>Map` and `<Component>Defaults`.

## 2) Register dictionary and exports
- Add `<Component>Types` to `AllTypes` in `packages/sails-ng-common/src/config/dictionary.outline.ts`.
- Add `<Component>Map` into `AllDefs` and `<Component>Defaults` into `RawDefaults` in `packages/sails-ng-common/src/config/dictionary.model.ts`.
- Export the new outline/model files in `packages/sails-ng-common/src/index.ts`.

## 3) Wire visitor infrastructure
- Add methods to `packages/sails-ng-common/src/config/visitor/base.outline.ts`:
- `visit<Component>FieldComponentDefinition`
- `visit<Component>FieldModelDefinition`
- `visit<Component>FormComponentDefinition`
- Add default stubs in `packages/sails-ng-common/src/config/visitor/base.model.ts`.
- Add pass-through/validation methods in:
- `construct.visitor.ts` (usually includes config property overrides)
- `client.visitor.ts`
- `data-value.visitor.ts`
- `json-type-def.visitor.ts`
- `validator.visitor.ts`
- `template.visitor.ts` (extract template-capable fields, if any)
- `migrate-config-v4-v5.visitor.ts` (legacy class mapping + coercion/defaults/warnings as needed)

If the component uses `inlineVocab`, update `packages/redbox-core-types/src/visitor/vocab-inline.visitor.ts` to resolve vocab data into the component config shape.

## 4) Implement Angular form component
- Create `angular/projects/researchdatabox/form/src/app/component/<component>.component.ts`.
- Create `<Component>Model` extending `FormFieldModel<T>`.
- Create `<Component>Component` extending `FormFieldBaseComponent<T>`.
- Read component config in `setPropertiesFromComponentMapEntry`.
- Do async bootstrapping in `initData` for remote data.
- Keep model sync explicit (`formControl.setValue`, dirty/touched updates).
- Include accessibility semantics for interactive components (`role`, `aria-*`, keyboard behavior).

Register Angular wiring:
- Add component to `declarations` in `angular/projects/researchdatabox/form/src/app/form.module.ts`.
- Add component/model class maps in `angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts`.

## 5) Add supporting service (if needed)
- If component makes API calls, create `angular/projects/researchdatabox/form/src/app/service/<service>.service.ts`.
- Prefer extending `HttpClientService`.
- Enable CSRF context in `waitForInit()`.
- Normalize old/new response shapes if backend compatibility is required.

If new backend endpoints are needed, update `redbox-core-types` controller/service/routes and add tests there.

## 6) Testing gates
- Add component spec:
- `angular/projects/researchdatabox/form/src/app/component/<component>.component.spec.ts`
- Cover at least:
- render/create
- config-driven behavior
- model update correctness
- keyboard/accessibility behavior for interactive components
- loading/error states for async branches
- Add Angular service spec when service is introduced:
- `angular/projects/researchdatabox/form/src/app/service/<service>.service.spec.ts`
- Add visitor tests for:
- construct visitor mapping
- migration visitor mapping/coercion
- template visitor extraction (if template fields exist)
- vocab-inline behavior (if inline vocab is supported)

## Quality Rules
- Keep type safety strict; do not use `as any` to bypass type issues.
- Keep selection/model semantics explicit; do not hide side effects.
- Prefer deterministic config defaults and migration coercions with warnings for malformed legacy input.
