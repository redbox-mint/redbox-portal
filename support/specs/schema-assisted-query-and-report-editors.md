# Schema-assisted named query and report editors

Status: proposed implementation plan. This change plans the work; it does not implement the editors.

## Goal

Help administrators build working named queries and reports without having to know record field paths, query parameter names, or template context conventions from memory. Apply the field discovery, autocomplete, advisory diagnostics and preview approach introduced for email templates.

Deliver named-query assistance first, followed by report assistance built on the query's parameter and result definitions. Improve the existing applications rather than adding another administration application.

## Baseline and dependencies

- [PR #5120](https://github.com/redbox-mint/redbox-portal/pull/5120) adds the email administration application. [PR #5121](https://github.com/redbox-mint/redbox-portal/pull/5121) adds schema targets, field trees, autocomplete, schema lint and sample contexts. Both were open when this plan was written; neither implementation is present on this checkout's `develop` branch. Coordinate with that stack before extracting shared code.
- `named-query-editor` currently uses a modal with Basics, Mongo query, Parameters, Result mappings, and Sort/related-filter tabs. Most paths are free text. Mongo query editing supports structured entries and raw JSON. There is no draft-query preview endpoint in its Angular API service.
- `report-config` currently edits database reports in a modal. It selects a named query but leaves filter bindings, column properties and templates as free text. Preview already executes unsaved report configuration, capped at 100 rows server-side, but the UI only shows the total.
- Solr reports are currently read-only in the configuration service. Record schemas do not describe Solr index fields; retain that boundary in this iteration.
- `RecordSchemaService.describeStage` already exists for stage descriptions. Prefer the same authorized resolution and effective-form fallback used by the email schema work. Public create/update schema APIs describe record write operations and are not a substitute for an editor's stage-selection API.

Relevant sources:

- `angular/projects/researchdatabox/named-query-editor/src/app/`
- `angular/projects/researchdatabox/report-config/src/app/`
- `packages/redbox-core/src/services/NamedQueryService.ts`
- `packages/redbox-core/src/services/ReportsService.ts`
- `packages/redbox-core/src/services/RecordSchemaService.ts`
- `packages/redbox-core/src/controllers/webservice/NamedQueryController.ts`
- `packages/redbox-core/src/controllers/webservice/ReportController.ts`
- `packages/sails-ng-common/src/report.model.ts`
- Wiki: `Configuring-Named-Queries.md`, `Record-Schema-Contract-API.md`, `Record-Schema-Contract-Contributors.md`, `ReDBox-Automated-Tests.md`.

## User experience

Use a full-page editing workspace within each existing Angular application, retaining the list as the entry point. Provide a main editing area, a collapsible field/help panel and a results/diagnostics area. Stack these areas on narrow screens. Preserve recognizable existing sections, and provide Save, Cancel and Preview actions, unsaved-change protection and keyboard-accessible field insertion.

### Named queries

1. Choose the collection. For `record`, choose a record type and optional workflow stage to discover fields. Infer a type only from an unambiguous existing type constraint; otherwise ask the user to select a guidance context or work without one.
2. Search fields by label or path. Show type, array/object structure, optionality, source and schema completeness. Include supported record envelope fields such as `redboxOid`, `dateCreated`, `lastSaveDate` and `metaMetadata.type` separately from schema-derived metadata.
3. Insert fields into query conditions, parameter paths, sort fields and mappings with the correct path for that location. Offer enum values and compatible operators where known. Explain array operations rather than inserting an invalid scalar comparison.
4. Offer typed parameter/default controls, while preserving explicit type, format and template overrides. Suggestions must respect the actual named-query execution semantics, including date conversions.
5. Build result mappings with a field picker for direct lookups and an assisted Handlebars editor for expressions. Keep the output alias visible beside its source field.
6. Show diagnostics beside the relevant condition, parameter, mapping or template. Suggest corrections for likely field typos, incompatible known types/operators and invalid template references. Distinguish a syntax/configuration error from an advisory schema warning.
7. Preview the unsaved query with entered test parameters. Display a bounded result table and inspectable result JSON, including the output shape that reports will receive. Label real data explicitly; do not run a query automatically on every keystroke.

Schema selection is guidance only. Selecting a record type or stage must not silently add or change query predicates. Provide an explicit action to add a type constraint and show its effect. A workflow-stage schema describes that stage's known shape; it does not prove that every historical record returned by a query has that shape.

For the first iteration, keep guidance selection as editor state, optionally retained in scoped browser session state. Reopening a query infers only unambiguous query constraints and otherwise prompts for guidance. Do not add execution-affecting schema selectors to saved query definitions. Persisted authoring preferences can be a later additive change if needed.

For multi-type queries, show envelope fields and permit choosing a type for assistance with a visible scope notice. Do not claim that one selected type describes every result. Non-record collections keep their existing editable paths and templates, with only fields that can be safely described; a user collection must never inherit a record metadata tree. Related filters need their own foreign-collection context, separate from the local record context.

### Reports

1. Select a named query and immediately display its available parameters and output fields, with links to manage the query subject to existing permissions.
2. Offer an explicit action to add columns from selected output fields. Suggest labels while keeping labels, ordering, hidden fields, multivalue settings and templates editable.
3. Bind text filters to the selected query's parameter names. For a date-range filter, offer separate From parameter and To parameter selectors drawn from compatible query parameters. Suggest a pair only when compatible; require confirmation.
4. Give column display and export templates autocomplete and diagnostics for the actual report-row context, including `recordTableMeta.val` and supported additional context. Explain when a field is an array and offer appropriate multivalue handling.
5. Expand the existing preview into sample rows rendered with the configured columns, plus an export-value preview. Keep raw result inspection available. Preview must reflect unsaved columns, templates and filter values without saving the report.
6. On query changes, retain report edits and flag missing bindings or output fields. Do not silently delete columns, replace parameters or rewrite templates. Refresh assistance after a named query is edited elsewhere.

The report-running screen can display better filter labels/help from this work, but its execution and export semantics remain compatible. Redesigning that screen and adding editable Solr reports are separate work.

## Path and type semantics

These contexts must have separate adapters and regression fixtures:

- Record schema paths are relative to metadata, for example `title`.
- Record Mongo predicates, query parameter paths and sort paths address the stored record, for example `metadata.title`.
- Named-query mappings run with `{ record: storedRecord }`: a direct lookup is `record.metadata.title`, while a Handlebars expression is `{{record.metadata.title}}`.
- Named-query results wrap mapped values under `metadata`. Mapping alias `projectTitle` therefore produces report column path `metadata.projectTitle`. Without a mapping, a record query returns its metadata under that same result wrapper. Envelope result fields include `oid`, `title`, `dateCreated` and `lastSaveDate`.
- Report text filters pass their `paramName` as the query parameter key. Date filters store parameter keys in the legacy-named `database.fromProperty` and `database.toProperty` fields. Those fields are not record paths. Improve their labels without renaming the persisted fields.
- Report templates receive the result row and the runtime's column/value context, not the email template's curated record context. Verify display and CSV contexts separately before offering completions.

Derive query output descriptions from mapping aliases and the fixed result wrapper. A direct lookup may retain source type information; rendered Handlebars mappings generally produce strings. Complex expressions, hook data and dynamic output must be marked unknown rather than assigned a guessed type. Do not infer that a string date has a JSON Schema date format unless the source or execution contract establishes it.

## Shared implementation

Extract only the facilities needed by the second consumer from #5121:

- Shared Angular field tree, schema target selector, path input/autocomplete and template editing assistance in `portal-ng-common`, with feature-specific adapters.
- Browser-safe field descriptions, precision/completeness and diagnostic DTOs in `sails-ng-common`. Keep raw server schema documents and their identity separate from derived editor descriptions.
- A small core service for authorized type/stage discovery and effective field descriptions, reusing `RecordSchemaService` and the existing fallback. Email, query and report services compose their own context descriptions from it.
- Reuse template parsing/path resolution where applicable, with each feature's real roots and helper registry. Do not copy the email editor's orchestration, publishing lifecycle or preview-frame token machinery into query/report editing.

Return precision such as schema-derived, form-derived, partial or unavailable. A form field list can provide labels and paths without proving all types or validation rules. Authorization failures must not trigger a fallback that reveals otherwise inaccessible configuration. Keep caches private and scoped by brand, portal, caller permissions and selected context; reject stale responses when any context or edited item changes.

## Backend changes

Finalize route names against the existing API conventions during implementation. Required operations are:

1. Authorized schema target discovery and field description for the editor context, available to the roles already allowed to use each feature. Report users must not need the email editor's Admin-only policy merely to receive guidance.
2. Validate an unsaved named-query definition and return structured diagnostics without executing it.
3. Describe a named query's parameters and result shape, using the brand-effective saved definition for reports and an unsaved definition for query editing.
4. Explicitly preview an unsaved named-query definition through the existing execution service after validation.
5. Extend report validation and preview presentation to identify parameter/column/template issues and return enough bounded data to preview display and export values faithfully. Reuse the existing report preview operation where possible.

Schema-based unknown-field and type advice is nonblocking initially, including when invoked through create/update. Structural errors and invalid syntax are blocking where the current contract already requires valid configuration; characterize legacy behavior before tightening any additional rules. Never validate the Mongo query document itself against the record metadata schema: query operators are not stored record values.

Preview must inherit existing feature permissions, collection restrictions, brand scoping and record-access behavior. Inspect that behavior explicitly before exposing unsaved execution; an unsaved query must not broaden access beyond the equivalent authorized saved query. Enforce server-owned limits on input size, query complexity, time, result rows and response bytes, and report truncation clearly. Use CSRF protection for mutations and preview POSTs. Keep template rendering and diagnostics consistent with the real report/CSV path and existing sanitization; do not introduce arbitrary HTML execution in preview.

Keep existing configuration shapes, hook-defined fields, non-record queries, related filters, relation expansion, sort behavior, read-only reports and API clients working. A missing schema capability disables guidance, not editing. Preserve unsupported query operators and complex raw expressions without lossy conversion between structured and JSON editing.

## Delivery sequence

### 1. Shared field assistance and context contracts

- [ ] Reconcile #5121 with the target branch and identify the minimal extraction.
- [ ] Characterize stored-record, mapping, query-result, display-template and CSV-template contexts with representative fixtures.
- [ ] Extract shared components/types and authorized field discovery; keep email assistance working.
- [ ] Cover complete/partial schemas, namespaced hook fields, form fallback, disabled schemas, authorization and stale-response handling.

Exit: email and a query-editor integration can use the same field tree without sharing feature-specific roots or policies.

### 2. Named-query editor

- [ ] Introduce the editing workspace and explicit guidance/type-constraint distinction.
- [ ] Wire field assistance into conditions, parameters, mappings, sort and related-filter join fields.
- [ ] Add structured diagnostics and explicit bounded draft preview.
- [ ] Verify raw JSON round trips and legacy/non-record configuration compatibility.

Exit: an administrator can create and preview a record query, choose fields and create a mapping without manually typing record field paths.

### 3. Report editor

- [ ] Derive parameter and output descriptions from the selected query.
- [ ] Add column selection, parameter-bound text/date filters and assisted template editing.
- [ ] Render configured preview rows and export-value samples using the existing runtime semantics.
- [ ] Handle changed/deleted query parameters and mappings without losing report edits.

Exit: an authorized report author can select a query, add columns, bind filters and verify display/export values before saving.

### 4. Compatibility and release verification

- [ ] Run focused core tests and Angular specs for all affected apps, including email regression coverage after extraction.
- [ ] Add Mocha/Bruno coverage for new service/controller operations, brand isolation, permissions, CSRF, malformed drafts and execution limits.
- [ ] Verify desktop/narrow layouts, keyboard field selection, focus and unsaved-change protection in the browser.
- [ ] Exercise end-to-end query-to-report creation, partial schemas, a namespaced client hook, non-record queries, custom mappings, date ranges, multivalue columns and display/CSV parity.
- [ ] Update the named-query/report wiki documentation and generated API references if public routes change.

No application tests are required for this planning-only document. Implementation tests should target these behaviors rather than snapshotting the proposed component structure.

## Acceptance examples

- Choosing the record field Title inserts `metadata.title` in a predicate and `record.metadata.title` in a direct mapping. Mapping it as `projectTitle` offers `metadata.projectTitle` in report columns.
- A query parameter called `createdAfter` targeting `dateCreated` appears as a report date-filter binding named `createdAfter`; the editor does not save `dateCreated` as the parameter key.
- A typo produces a suggested correction without silently changing the user's expression. A hook field absent from a partial contract remains editable.
- Selecting a different schema stage changes suggestions and warnings while leaving the Mongo query untouched.
- An unsaved report previews its current column templates and CSV values. Changing the named query flags broken bindings while preserving the draft.
- Switching items or schema targets during a slow request cannot overwrite the new item's draft, suggestions or preview.

## Recommended scope decisions

Proceed with database reports, record-query assistance, advisory schema warnings and full-page editor workspaces. Preserve manual editing for custom and non-record collections. Defer multi-type schema unions, arbitrary Mongo query construction, Solr index introspection, stored authoring-context metadata, and draft/publish/history workflows. These can be added later without delaying useful field and parameter guidance.
