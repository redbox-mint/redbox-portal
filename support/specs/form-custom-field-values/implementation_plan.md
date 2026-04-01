# Injecting Data into New Forms based on Server Attributes

The user has requested the ability to inject server-side data (like request attributes, user info) into new forms, similar to the legacy `customFields` functionality found in [record.config.ts](../../../packages/redbox-core/src/config/record.config.ts).

## User Review Required

Please review the proposed architectural approach:


Does this backend substitution mechanism align with your vision for the v5 forms?
## Security & Guardrails

- **XSS & Injection Mitigation:**
  - Do NOT perform contextual escaping during custom-field evaluation. `CustomFieldsFormConfigVisitor` MUST store canonical, raw values in the `customFieldsMap` (do not apply `lodash.escape` or other encodings at evaluation time). Encoding/escaping must be applied at the render/serialization boundary according to the sink: HTML/input attribute -> `lodash.escape`, URL -> `encodeURIComponent`, JSON -> `JSON.stringify`.
  - `CustomFieldsFormConfigVisitor` will only substitute values in explicitly allowed locations (`defaultValue`, `content`, `value`) and will not recurse into arbitrary nested objects or arrays.
  - On evaluation failure for a field, implementations MUST omit the mapping or set it to `""`, and log a non-fatal warning that includes only the `fieldKey` and `errorType` (for example: `sails.log.warn('Failed to evaluate custom field', { fieldKey, errorType })`). Warning messages MUST NOT include any resolved or extracted values.
- **Error Handling Strategy:** If a custom field evaluation fails (e.g. missing `req` property, malformed path), it will gracefully omit the mapping for that key (or fall back to `""`), rather than failing the entire request. Partial evaluation results will be passed to the client; callers should handle missing keys gracefully.
- **Privacy & PII Exposure:**
  - `meta.customFields` is client-visible and may contain PII; therefore the server MUST construct `meta.customFields` from an explicit allowlist of keys. Only keys on this allowlist will be included in the `meta.customFields` returned to clients.
  - Values originating from disallowed or sensitive sources (Authorization headers, cookies, session tokens, MFA/password fields, request body fields marked sensitive) MUST be stripped or replaced with a redaction marker (e.g. `"[REDACTED]"`) before inclusion in `meta.customFields`.
  - Attempts to map authentication, cookie, or token values into `customFields` MUST be rejected and recorded as a configuration/validation error.
  - Logging and diagnostic outputs MUST avoid including full `meta` contents; follow existing logging guidelines to avoid PII leakage.
- **String Replacement Ordering:** To prevent overlapping key conflicts (e.g., substituting `@user_id` when the value of `@user_name` contains that substring, or replacing `@user` inside `@user_email`), the mapping algorithm will replace all matched tokens simultaneously (using a dynamic regex generated from escaped keys), or sequentially by sorting the keys by length descending.
  - Documentation will clearly state that `meta.customFields` is returned over the REST API and is client-visible.
  - System logging mechanisms should establish guidelines to avoid dumping the full `meta` contents into plain text request/response caches. Sensitive tokens (like passwords/MFA tokens) should never be mapped via custom fields.
- **String Replacement Ordering:** To prevent overlapping key conflicts (e.g., substituting `@user_id` when the value of `@user_name` contains that substring, or replacing `@user` inside `@user_email`), the mapping algorithm will replace all matched tokens simultaneously (using a dynamic regex generated from escaped keys), or sequentially by sorting the keys by length descending.

## Proposed Changes

### `packages/redbox-core/src/utilities/CustomFieldUtils.ts` [NEW]

- Create a new utility class with static method `evaluateCustomFields(req: Sails.Req, recordData: RecordModel | null)` to process `sails.config.record.customFields`.
- Map `source: 'request'` fields (type: `user`, `session`, `param`, `header`) into a dictionary of resolved payload values.
-- **Note on Sources**: For this first release, ONLY `source: 'request'` is supported. Request-scoped mappings (types `user`, `session`, `param`, `header`) are deny-by-default:
   - Implement a server-side allowlist for permitted `header` and `param` keys; entries not on the allowlist must be rejected or skipped with a logged warning.
   - `user` and `session` mappings must also be constrained by an allowlist of permitted properties.
   - `metadata` and `record` sources remain ignored for this release (log a warning if configured).

  Additional behaviour:
  - `CustomFieldUtils.evaluateCustomFields` MUST build `customFieldsMap` from the allowlisted keys only, and must redact or omit values from disallowed or sensitive sources.
  - The visitor (`CustomFieldsFormConfigVisitor`) MUST consult the allowlist when resolving request-sourced keys and refuse substitutions for disallowed keys (return a validation error or skip with a warning).

### [packages/redbox-core/src/controllers/RecordController.ts](../../../packages/redbox-core/src/controllers/RecordController.ts)

- In [getForm](../../../packages/redbox-core/src/controllers/RecordController.ts#334-457), compute the `customFieldsMap` using `CustomFieldUtils.evaluateCustomFields(req, currentRec)`.
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

### [packages/sails-ng-common/src/config/form-config.outline.ts](../../../packages/sails-ng-common/src/config/form-config.outline.ts)

- Add `customFields?: Record<string, unknown>;` to [FormConfigOutline](../../../packages/sails-ng-common/src/config/form-config.outline.ts#92-96) so the frontend knows that custom fields might be present.

### [packages/redbox-core/src/services/FormsService.ts](../../../packages/redbox-core/src/services/FormsService.ts)

- Update [buildClientFormConfig](../../../packages/redbox-core/src/services/FormsService.ts#586-618) signature to accept `customFieldsMap` as an **optional** parameter defaulting to `{}`. This ensures that callers outside of `RecordController`—such as `FormRecordConsistencyService` and core test suites—are fully compatible and will not experience compilation errors or regressions.
- During form config generation, invoke the `CustomFieldsFormConfigVisitor` before sending to [ClientFormConfigVisitor](../../../packages/redbox-core/src/visitor/client.visitor.ts#149-1000).
- Add `customFields: customFieldsMap` to the returned `mergedForm` returned from [buildClientFormConfig](../../../packages/redbox-core/src/services/FormsService.ts#586-618).

### `packages/sails-ng-common/src/models/CustomFieldsFormConfigVisitor.ts`

- [NEW] Implement `CustomFieldsFormConfigVisitor` that implements [FormConfigVisitor](../../../packages/sails-ng-common/src/config/visitor/base.model.ts#124-474).
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

-- **Security Tests:**
  - Inject XSS attempts (e.g., `<script>alert('xss')</script>`) into mocked user payloads and verify that server-side evaluation stores raw values in internal maps, but the values surfaced in `meta.customFields` are either redacted per allowlist rules or encoded at the appropriate rendering boundary.
  - Inject HTML special characters (`<`, `>`, `&`, `"`, `'`) and SQL injection patterns to verify safety and redaction/encoding behaviour.
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
