# Injecting Data into New Forms based on Server Attributes

The user has requested the ability to inject server-side data (like request attributes, user info) into new forms, similar to the legacy `customFields` functionality found in [record.config.ts](../../..//packages/redbox-core/src/config/record.config.ts).

## User Review Required

Please review the proposed architectural approach:

- We will evaluate variables (from `sails.config.record.customFields`) inside `RecordController.getForm` where the `req` object (with `user`, `headers`, `session`, `params`) is available.
- We will pass the evaluated map of variables (e.g. `{ "@user_name": "Bob", "@user_email": "bob@example.com" }`) into `FormsService.buildClientFormConfig`.
- A new form visitor, `CustomFieldsFormConfigVisitor`, will be created in `@researchdatabox/sails-ng-common` to traverse the form definition components. If it finds any String value (like `content` or `defaultValue`) containing a key from the evaluated map, it will replace it (e.g., swapping `@user_name` with `Bob`).
- This means the frontend won't need any new modification, as the custom fields natively substitute inside the form config exactly like standard default values.

Does this backend substitution mechanism align with your vision for the v5 forms?

## Security & Guardrails

- **XSS & Injection Mitigation:**
  - All resolved string values extracted from `req` (especially headers and parameters) MUST be sanitized.
  - Because custom fields may be substituted into different contexts, we must apply context-aware escaping: `lodash.escape` is used for safe HTML content contexts and input attribute values. If values might be used as URLs or inside JavaScript/JSON strings, they require URL encoding or strict JSON stringification, respectively. We will explicitly document that `CustomFieldsFormConfigVisitor` should only replace values in recognized, safe HTML/input contexts (`defaultValue`, `content`, `value`).
- **Error Handling Strategy:** If a custom field evaluation fails (e.g. missing `req` property, malformed path), it will gracefully omit the mapping for that key (or fall back to `""`), rather than failing the entire request. Individual field evaluation errors will write a non-fatal warning to the application log. **CRITICAL:** These warning messages MUST NOT include the resolved or extracted values to prevent PII leakage. The log should only contain the field key and error type (e.g., `sails.log.warn(\`Failed to evaluate custom field: ${fieldKey}. Error: ${errorType}\`);`). Partial evaluation results will be seamlessly passed to the client.
- **Privacy & PII Exposure:**
  - Standard user fields (like `@user_email`, `@user_name`) contain PII.
  - Documentation will clearly state that `meta.customFields` is returned over the REST API and is client-visible.
  - System logging mechanisms should establish guidelines to avoid dumping the full `meta` contents into plain text request/response caches. Sensitive tokens (like passwords/MFA tokens) should never be mapped via custom fields.
- **String Replacement Ordering:** To prevent overlapping key conflicts (e.g., substituting `@user_id` when the value of `@user_name` contains that substring, or replacing `@user` inside `@user_email`), the mapping algorithm will replace all matched tokens simultaneously (using a dynamic regex generated from escaped keys), or sequentially by sorting the keys by length descending.

## Proposed Changes

### `packages/redbox-core/src/utilities/CustomFieldUtils.ts` [NEW]

- Create a new utility class with static method `evaluateCustomFields(req: Sails.Req, recordData: RecordModel | null)` to process `sails.config.record.customFields`.
- Map `source: 'request'` fields (type: `user`, `session`, `param`, `header`) into a dictionary of resolved payload values.
- **Note on Sources**: For this first release, ONLY `source: 'request'` is supported. Any custom fields configured with `source: 'metadata'` or `source: 'record'` will be ignored, but a warning will be logged to indicate they are explicitly not supported in this pass.

### [packages/redbox-core/src/controllers/RecordController.ts](../../..//packages/redbox-core/src/controllers/RecordController.ts)

- In [getForm](../../..//packages/redbox-core/src/controllers/RecordController.ts#334-457), compute the `customFieldsMap` using `CustomFieldUtils.evaluateCustomFields(req, currentRec)`.
- Pass `customFieldsMap` to `FormsService.buildClientFormConfig`.
- Append `customFields: customFieldsMap` inside the `meta` object of the returned response. An example of the payload:
  ```json
  {
    "data": {
      "name": "dataPublication"
      // ... form components etc
    },
    "meta": {
      "formName": "dataPublication",
      "oid": null,
      "recordType": "dataPublication",
      "customFields": {
        "@user_name": "John Doe",
        "@user_email": "john.doe@example.com"
      }
    }
  }
  ```

### [packages/sails-ng-common/src/config/form-config.outline.ts](../../..//packages/sails-ng-common/src/config/form-config.outline.ts)

- Add `customFields?: Record<string, unknown>;` to [FormConfigOutline](../../..//packages/sails-ng-common/src/config/form-config.outline.ts#92-96) so the frontend knows that custom fields might be present.

### [packages/redbox-core/src/services/FormsService.ts](../../..//packages/redbox-core/src/services/FormsService.ts)

- Update [buildClientFormConfig](../../..//packages/redbox-core/src/services/FormsService.ts#586-618) signature to accept `customFieldsMap` as an **optional** parameter defaulting to `{}`. This ensures that callers outside of `RecordController`—such as `FormRecordConsistencyService` and core test suites—are fully compatible and will not experience compilation errors or regressions.
- During form config generation, invoke the `CustomFieldsFormConfigVisitor` before sending to [ClientFormConfigVisitor](../../..//packages/redbox-core/src/visitor/client.visitor.ts#149-1000).
- Add `customFields: customFieldsMap` to the returned `mergedForm` returned from [buildClientFormConfig](../../..//packages/redbox-core/src/services/FormsService.ts#586-618).

### `packages/sails-ng-common/src/models/CustomFieldsFormConfigVisitor.ts`

- [NEW] Implement `CustomFieldsFormConfigVisitor` that implements [FormConfigVisitor](../../..//packages/sails-ng-common/src/config/visitor/base.model.ts#124-474).
- Define an explicit allowlist of properties to substitute based on exactly targeted visitor methods:
  - `visitContentFieldComponentDefinition`: Evaluate and string replace ONLY inside `item.config.content`.
  - Ensure string replacements on inputs ONLY target `.model.config.defaultValue`. E.g., implement `visitSimpleInputFieldModelDefinition`, `visitTextAreaFieldModelDefinition`, `visitCheckboxInputFieldModelDefinition`, `visitRadioInputFieldModelDefinition`, `visitDropdownInputFieldModelDefinition`, `visitTypeaheadInputFieldModelDefinition`, `visitDateInputFieldModelDefinition`, `visitRichTextEditorFieldModelDefinition`, and evaluate/replace `item.config.defaultValue`.
  - We will NOT recurse blindly into arbitrary nested arrays or objects. This explicit scoping prevents unpredictable mutations to `expressions`, `validation` configurations, `URLs`, or `templates`.

## Verification Plan

### Automated Tests

- **Unit Tests:** Verify `CustomFieldsFormConfigVisitor` replacement logic ONLY targets scoped fields (`defaultValue`, `content`, `value`) and ignores `expressions` or `templates`.
- **Integration Tests:** New test in `packages/redbox-core/test/controllers/RecordController.test.ts` to mock request attributes and check the API response.
- **Regression/Compatibility:** Add coverage for `FormRecordConsistencyService` to ensure forms compile safely without the optional `customFieldsMap` argument.

### Security, Error Handling, and Edge Case Testing

- **Security Tests:**
  - Inject XSS attempts (e.g., `<script>alert('xss')</script>`) into mocked user payloads to verify they are correctly HTML-escaped in the returned `.meta.customFields` and form config.
  - Inject HTML special characters (`<`, `>`, `&`, `"`, `'`) and SQL injection patterns to verify safety.
- **Error Handling Tests:**
  - Test missing/undefined properties on the `req` object.
  - Test null/undefined returned payload values for customFields.
  - Test malformed `sails.config.record.customFields` settings.
- **Edge Case Tests:**
  - Empty strings, whitespace-only values.
  - Unicode/Special character replacement.
  - Case sensitivity of keys.
  - Overlapping key names (e.g., substituting `@user` and `@user_name` simultaneously).
- **Performance Tests:**
  - Verify visitor runtime performance with a `customFieldsMap` containing 100+ entries on a complex nested form structure to ensure acceptable performance implications.
