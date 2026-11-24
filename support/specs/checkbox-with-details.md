# Checkbox group with per-option details

Proposed core form component for review. The first adopter is the UON RDMP digital-formats question. Each selected format needs its own estimate. “Other” also needs a description. A second supported use is a checklist where only “Other” has a follow-up.

## Interaction

Use a labelled fieldset containing one row per vocabulary option. Within each row render the native checkbox and its label, followed immediately in DOM order by the detail controls for that option. At desktop widths put the details alongside the choice. At narrow widths stack them underneath with an indent. Match normal portal inputs, required indicators, help and errors.

Checking a box reveals its controls and leaves focus on the checkbox. Tab reaches those controls before the next checkbox. Give each input a distinct accessible name, e.g. “Estimated volume — Image files”. A validation-summary link opens the right tab and focuses the actual input. Do not move focus on form load.

Working default: unchecking removes that row from the submitted answer and validation immediately. Keep its typed details in memory for undo while the editor stays open. Reloading or replacing the selection through the form model clears that undo history. A newly checked row can start with authored text defaults. Reloading a saved row preserves its answers, including missing details. A read-only or PDF view lists each selected label followed by its populated, labelled details. Honour the portal’s existing empty-field display convention.

## Authoring contract

Proposed names: `CheckboxWithDetailsComponent` and `CheckboxWithDetailsModel`. Reuse the checkbox option conventions for inline `options` or `vocabRef` with `inlineVocab`. Require stable, unique string option values. Translated labels and vocabulary order are presentation only.

- `detailFields` is an optional ordered list of standard child field definitions shared by every selected option.
- `detailFieldsByValue` is an optional mapping from option value to extra ordered child definitions for that choice. Shared fields render first. Specify only the mapping for an Other-only follow-up.
- Each child has a unique name within its option, a component, a model with the normal validators/groups, and the normal layout label/help. Fail configuration checks on duplicate field names in the effective row, duplicate options, or unsupported child types. Check that static option mappings use configured codes. For an external vocabulary, log a warning for mappings whose codes are missing after resolution and continue loading the form.
- First release supports `SimpleInputComponent` for text and `TextAreaComponent`. This covers the UON question without committing the first release to repeatable groups, arbitrary nested branching or async lookups. Reuse the existing child renderers, models and validator configuration.

Example proposed TypeScript form definition (literal labels below stand in for normal translation keys).

```ts
{
  name: "uon:digitalFormatEstimates",
  component: {
    class: "CheckboxWithDetailsComponent",
    config: {
      vocabRef: "rdmp-digital-formats",
      inlineVocab: true,
      detailFields: [{
        name: "volume",
        component: { class: "SimpleInputComponent", config: { type: "text" } },
        model: { class: "SimpleInputModel", config: { validators: [{ class: "required" }] } },
        layout: { class: "DefaultLayout", config: { label: "Estimated volume" } }
      }],
      detailFieldsByValue: {
        other: [{
          name: "description",
          component: { class: "TextAreaComponent", config: { rows: 2 } },
          model: { class: "TextAreaModel", config: { validators: [{ class: "required" }] } },
          layout: { class: "DefaultLayout", config: { label: "Describe the format" } }
        }]
      }
    }
  },
  model: { class: "CheckboxWithDetailsModel", config: { validators: [{ class: "required" }] } },
  layout: { class: "DefaultLayout", config: { label: "Digital formats and estimated volume" } }
}
```

## Saved answer and validation

Store one array entry for each checked value. An empty selection is `[]`. A selected row with no configured details can be represented as `{ "value": "open", "details": {} }`. Keep numbers with units, such as “3 TB” or “about 200 files”, as entered in a text field.

```json
{
  "uon:digitalFormatEstimates": [
    { "value": "tabulated", "details": { "volume": "About 200 CSV files" } },
    { "value": "other", "details": { "volume": "3 TB", "description": "Instrument export bundles" } }
  ]
}
```

Key rows by option value internally. Removing a middle row, reordering the vocabulary, or translating the label must leave each answer attached to its option. Preserve loaded selected rows while vocabulary options resolve. Apply existing historical-vocabulary policy to retired options and retain their detail on an unrelated save. Unknown historical values need a readable fallback; reject newly submitted unsupported options under the normal validation policy.

Mark an option historical in the vocabulary to retain its label. In Edit, obsolete saved details appear read-only beside the surviving inputs. Hidden details stay hidden. If an option is deleted outright, an existing record that holds the code can still open and save its archived answers. View and PDF show the code and any configured detail labels, with field names as the fallback for older details. Validated writes require every detail on a retained deleted choice to match the stored row, including keys no longer declared in the form. Users can remove the entire selection. A stale external vocabulary mapping does not block unrelated records or make that code available for new selections. A missing static option is a configuration error unless the mapping belongs to an archived selection in the record.

Reordering or removing repeatable rows preserves archival selections on a row that matches a stored row. Exact row matches come first. A moved row with other edits can match on unchanged archival selections at the same checkbox field paths if that evidence uniquely identifies one remaining stored row and one submitted row. Each stored row can be matched once within its repeatable field. For ambiguous rows, save the move and the edit separately.

Group-level required means at least one selected row. Child validators run for selected rows in the enabled validation groups. Draft can therefore save a selected row with missing detail, and the same row can block activation. Use the same rules for editor validation and validated server writes. Report a specific option and field in each error. An unresolved editor lookup blocks full validation and any enabled rules that depend on its options or details. A draft with those rules disabled can preserve the selected rows as loaded. In an editable field, users can remove an existing selection while the lookup is pending or failed. Unverified answers are read-only, and additions and rechecks wait for the vocabulary. Retry loads the choices and reinstates normal child validation without restoring removed rows.

If a server lookup fails, a named save without a workflow transition can still save an empty selection, remove choices or preserve previously stored choices with identical details. This applies when the effective groups do not require checkbox validation. Other enabled validators still run. An existing record with authoritative prior metadata can use that same preservation rule after its vocabulary is deleted. The server records a missing-vocabulary diagnostic. Authorized existing-record Edit, View and PDF keep showing stored selections when lookup fails. Visible details use their configured labels when available, and unavailable choices use their stored codes. New and contract forms retain their normal lookup requirements. New choices and changed details still block the save until the vocabulary is available. A missing reference on create, a malformed definition, or a validated transition still requires a valid vocabulary.

The record contract JSON Schema checks the array and row shape and the types of declared detail fields. The `x-redbox-checkbox-details` annotation describes the shared and per-option fields. Server validation applies current option availability, rejects duplicate codes and out-of-scope details, checks retained deleted rows against stored metadata, and applies the operation's validation groups. Store codes and user answers in metadata and resolve translated labels for Edit, View and PDF.

## Delivery sequence

1. **Core contract and working example.** Add the typed definition in `packages/sails-ng-common`, model defaults, visitor interfaces and registry entries. Add a small demo in `packages/redbox-hook-dev` with two shared-estimate options and an Other row. Prove typed construction, serialisation, vocabulary resolution and stable row identity.
2. **Editor and validation.** Implement/register the Angular field and model in the form library. Use the normal form-control, event, validation-group and child-layout mechanisms. Scope option changes to their row. Add a test that checks keyboard/DOM order, error focus and same-session undo.
3. **Read and write paths.** Wire construct/client visitors, storage schema/record contract, validated writes, generated view and PDF. Test inline and vocabulary options, optional/required children, partial drafts, removed historical options, punctuation in option codes, repeated instances and an unrelated save. Visually verify desktop, narrow viewport and a PDF with multiple answers.
4. **Adopt in UON.** Once the mounted/released portal supports the component, replace the digital-formats checklist, ten sibling estimates, special Other textarea and per-option CSS. Keep the separate general narrative. Update UON’s activation-group and server questionnaire checks to descend into selected rows. Point the production migration directly from legacy formats prose into the new answer where aliases are unambiguous. Preserve the original prose and leave any missing estimates for the owner. The current v5 flat keys are unreleased. Provide a one-off conversion for UAT data only if those records are to be kept.

The first acceptance record selects Tabulated files and Other, enters separate estimates and an Other description, then saves and reopens. Remove Tabulated files and confirm that Other retains both answers. Try an incomplete draft, a validated activation with a missing estimate, an unrelated amendment, read-only View and a PDF. Completion means the same option/detail pairs are visible and stored throughout, and UON needs no markup-dependent CSS to position them.
