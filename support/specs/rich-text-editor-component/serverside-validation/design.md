# Rich Text HTML/Markdown Sanitization in ValidatorFormConfigVisitor

Server-side sanitization of rich text editor content to prevent stored XSS using DOMPurify's `html` profile already configured in `DomSanitizerService`.

## Proposed Changes

### 1. Move Visitor to redbox-core-types

#### [NEW] [validator.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/redbox-core-types/src/visitor/validator.visitor.ts)

Move the existing `ValidatorFormConfigVisitor` from `sails-ng-common` → here. All outline-type imports come from `@researchdatabox/sails-ng-common` (already a dependency). Then implement `visitRichTextEditorFieldModelDefinition`:

```typescript
visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): void {
    const value = item?.config?.value;
    if (!value || typeof value !== 'string') return;

    const sanitized = DomSanitizerService.sanitizeWithProfile(value, 'html');
    if (sanitized === value) return; // clean, nothing to do

    const mode = _.get(sails.config, 'record.form.htmlSanitizationMode', 'sanitize');

    if (mode === 'reject') {
        // Report validation error, do NOT mutate
        this.validationErrors.push({
            id: /* component id */,
            message: "Rich text content",
            errors: [{ class: "htmlUnsafe", message: "@validator-error-html-unsafe", params: {} }],
            lineagePaths: buildLineagePaths(this.formPathHelper.formPath)
        });
    } else {
        // Default: sanitize in-place, report as warning
        item.config.value = sanitized;
        this.validationErrors.push({
            id: /* component id */,
            message: "Rich text content",
            errors: [{ class: "htmlSanitized", message: "@validator-warning-html-sanitized", params: {} }],
            lineagePaths: buildLineagePaths(this.formPathHelper.formPath)
        });
    }
}
```

---

### 2. Config Flag

A `sails.config.record.form.htmlSanitizationMode` setting (follows existing pattern like `svgMaxBytes`):

| Value | Behaviour |
|-------|-----------|
| `'sanitize'` (default) | Mutate model value in-place, report info warning |
| `'reject'` | Do **not** mutate, report validation error (blocks save) |

---

### 3. Remove Old File & Update Exports/Imports

#### [DELETE] [validator.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/config/visitor/validator.visitor.ts)

#### [MODIFY] [index.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-ng-common/src/index.ts)

```diff
-export * from "./config/visitor/validator.visitor";
```

#### [MODIFY] [FormRecordConsistencyService.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/redbox-core-types/src/services/FormRecordConsistencyService.ts)

```diff
-import { ... ValidatorFormConfigVisitor ... } from "@researchdatabox/sails-ng-common";
+import { ValidatorFormConfigVisitor } from "../visitor/validator.visitor";
```

---

### 4. Tests

Move `sails-ng-common/test/unit/validator.visitor.test.ts` → `redbox-core-types/test/unit/validator.visitor.test.ts` with updated imports. Add:

1. **"should sanitize dangerous HTML in rich text value"** — dirty input → mutated + warning
2. **"should reject dirty HTML when mode is 'reject'"** — dirty input → validation error, value unchanged
3. **"should not report when content is clean"** — no warnings
4. **"should skip when value is empty"** — no errors

## Verification Plan

```bash
cd packages/sails-ng-common && npm test       # no regressions from removed export
cd packages/redbox-core-types && npm test      # moved + new tests pass
```
