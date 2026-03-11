# Form UI Polish Fixes

Fix three visual/behavioural bugs in the next-gen Angular form app at `/default/rdmp/record/rdmp/edit`:

1. Repeatable add/remove buttons are oversized and remove appears with only one row
2. Dropdown option labels miss `i18next` translation and select appears oversized
3. Loading SVG disappears before the form is fully rendered

---

## Proposed Changes

### 1. Repeatable – button sizing and remove visibility

#### [MODIFY] [angular/projects/researchdatabox/form/src/app/component/repeatable.component.ts](../../../angular/projects/researchdatabox/form/src/app/component/repeatable.component.ts)

**Remove-button visibility** – The [RepeatableElementLayoutComponent](../../../angular/projects/researchdatabox/form/src/app/component/repeatable.component.ts) template currently shows the remove button whenever [isVisible](../../../angular/projects/researchdatabox/portal-ng-common/src/lib/form/form-field-base.component.ts) is true. Add a `canRemove` boolean that the parent [RepeatableComponent](../../../angular/projects/researchdatabox/form/src/app/component/repeatable.component.ts) controls based on `compDefMapEntries.length > 1`. A repeatable always requires at least one item (this is already enforced in `initData` in [repeatable.component.ts](../../../angular/projects/researchdatabox/form/src/app/component/repeatable.component.ts)); no new config property is introduced.

Implementation approach:
- Add a `canRemove` boolean to [RepeatableElementLayoutComponent](../../../angular/projects/researchdatabox/form/src/app/component/repeatable.component.ts), defaulting to `false`.
- In `createElement` in [repeatable.component.ts](../../../angular/projects/researchdatabox/form/src/app/component/repeatable.component.ts), set `layoutInstance.canRemove` based on current item count after push.
- After every add or remove, call a helper `updateCanRemoveFlags()` that iterates all entries and sets `canRemove = compDefMapEntries.length > 1`.
- Bind the remove button to `isVisible && canRemove` instead of just [isVisible](../../../angular/projects/researchdatabox/portal-ng-common/src/lib/form/form-field-base.component.ts).

#### [MODIFY] [angular/projects/researchdatabox/form/src/app/form.component.scss](../../../angular/projects/researchdatabox/form/src/app/form.component.scss)

Reduce `.rb-form-repeatable-item__remove` sizing from `min-height:3.2rem / min-width:3.1rem` to `min-height:2.375rem / min-width:2.375rem` to match standard Bootstrap `btn-sm` scale. Similarly tighten `.rb-form-repeatable__add` with `font-size:0.875rem; padding:0.375rem 0.75rem`.

#### [MODIFY] [angular/projects/researchdatabox/form/src/app/component/repeatable.component.spec.ts](../../../angular/projects/researchdatabox/form/src/app/component/repeatable.component.spec.ts)

Add three tests:
- Remove button **hidden** when only one item exists
- Remove button **visible** when count > 1
- After removing back to one item, remove button hidden again

---

### 2. Dropdown – translation and sizing

#### [MODIFY] [angular/projects/researchdatabox/form/src/app/component/dropdown-input.component.ts](../../../angular/projects/researchdatabox/form/src/app/component/dropdown-input.component.ts)

- Pipe option labels through `i18next`: `{{ opt.label | i18next }}` (currently just `{{ opt.label }}`).
- Pipe placeholder the same way: `{{ placeholder | i18next }}`.

#### [MODIFY] [angular/projects/researchdatabox/form/src/app/form.component.scss](../../../angular/projects/researchdatabox/form/src/app/form.component.scss)

Add a rule to normalize `select.form-select` height to match text inputs (if the browser default is inflated by legacy CSS on the page). Exact rule: `.rb-form-edit select.form-select { height: auto; }`.

#### [MODIFY] [angular/projects/researchdatabox/form/src/app/component/dropdown-input.component.spec.ts](../../../angular/projects/researchdatabox/form/src/app/component/dropdown-input.component.spec.ts)

Add a translation-focused test using `@…` language keys (same pattern used in [checkbox-input.component.spec.ts](../../../angular/projects/researchdatabox/form/src/app/component/checkbox-input.component.spec.ts) and [radio-input.component.spec.ts](../../../angular/projects/researchdatabox/form/src/app/component/radio-input.component.spec.ts)).

---

### 3. Loading SVG – keep visible until form is ready

#### [MODIFY] [angular/projects/researchdatabox/form/src/app/form.component.html](../../../angular/projects/researchdatabox/form/src/app/form.component.html)

Currently the Angular component replaces any content inside `<redbox-form>...</redbox-form>` as soon as it bootstraps — this removes the server-rendered loading SVG before any components are created. Add an Angular-managed loading state before the `componentsContainer`:

```html
@if (!componentsLoaded()) {
  <div class="rb-form-loading">
    <div class="rb-form-loading__spinner" role="status">
      <span class="visually-hidden">{{ 'loading-alt-text' | i18next }}</span>
    </div>
  </div>
}
```

#### [MODIFY] [angular/projects/researchdatabox/form/src/app/form.component.scss](../../../angular/projects/researchdatabox/form/src/app/form.component.scss)

Add `.rb-form-loading` styles — centered flex container with CSS-only spinner animation.

#### [MODIFY] [angular/projects/researchdatabox/form/src/app/form.component.spec.ts](../../../angular/projects/researchdatabox/form/src/app/form.component.spec.ts)

Add tests:
- Loading element visible before `downloadAndCreateFormComponents` completes
- Loading element hidden after `componentsLoaded` becomes `true`

---

## Verification Plan

### Automated Tests

1. **Full suite sanity check** — run the complete Angular test suite to catch regressions in unchanged components (including radio/checkbox specs that are not modified here):

```bash
npm run test:angular
```

2. **Targeted runs** for the three changed spec files to confirm new tests pass:

```bash
npm run test:angular -- --include=**/repeatable.component.spec.ts
npm run test:angular -- --include=**/dropdown-input.component.spec.ts
npm run test:angular -- --include=**/form.component.spec.ts
```

### Browser Verification

Navigate to `/default/rdmp/record/rdmp/edit` using the browser and visually confirm:

1. Loading spinner is visible until form fully renders
2. Repeatable fields with one row have no remove button; add a row and both get remove buttons
3. Dropdown options display translated labels and sizing matches text inputs
