# Shared field assistance (PR 1)

This branch extracts the facilities needed by email and a second editor from
`feature/email-template-schema-assist`. It adds no query/report routes or editor
screens, and makes no changes to persisted query/report configuration.

## Server composition

`packages/redbox-core/src/services/FieldDescriptionsService.ts` is registered
with the normal service loader. Feature services can call:

- `schemaTargets(brand, caller)` for caller-authorized type/stage choices.
- `describeFields(brand, portal, caller, recordType, stage?)` for a metadata-relative
  `FieldDescription` (`fields`, `precision`, `completeness`, selected type/stage).
- `describeMetadata(...)` for internal composition that also needs the effective
  metadata schema. Its `metadataSchema` is separate from the browser DTO. Email
  uses this to build its existing curated context; it is not a public record
  contract document or schema identity.

Discovery uses brand-owned types, current workflow create/transition access,
`RecordSchemaService.describeStage`, and the caller-effective edit form builder.
Fallback still resolves reusable definitions, replacement names, groups,
repeatables and caller field visibility, without vocabulary hydration. Form
fields carry unknown leaf types and partial completeness. Bounded tree extraction
also reports partial completeness if its field/depth limit omits a subtree. Disabled/missing
schema services can use this fallback after authorization. A forbidden resolver
result, unexpected failure or unverifiable authorization never triggers a form
fallback. Such failures disable guidance, not manual editing. There is no cache.
Feature controllers retain their own policies; the service does not require the
email editor's Admin role.

## Browser contracts and adapters

`packages/sails-ng-common/src/schema-assist.model.ts` defines `FieldDescription`,
`ContextSchemaField`, precision/completeness, targets/selection and
`EditorDiagnostic`. Existing email DTO names remain compatible aliases or
extensions. Shared local-reference resolution, schema flattening and template
path parsing live beside these contracts. The email linter retains its bounded
AST traversal, email diagnostics, roots and helper policies.

`packages/sails-ng-common/src/query-report-context.ts` exports separate adapters:

- `storedRecordFields(metadataFields)` rebases schema fields to `metadata.*` and
  adds supported stored envelope fields. Presentation paths retain array and
  bracket-literal markers for the tree.
- `storedRecordPath(presentationPath)` converts a chosen field to an ordinary
  Mongo predicate/parameter/sort path, traversing arrays implicitly. It returns
  `null` for literal dotted/dollar keys that need Mongo expressions.
- `storedRecordPathFields(metadataFields)` supplies native dotted paths for
  plain path autocomplete, including namespaced hook keys.
- `namedQueryMappingFields(storedFields)` adds the `record` wrapper used by
  direct lookups and Handlebars mappings. Template insertion uses
  `fieldInsertion(node)` from the Angular shared library.
- `lookupPath(presentationPath)` converts a template/tree path to lodash syntax for
  a direct mapping or report column property. Literal dotted keys need quoted
  brackets here; Handlebars uses unquoted segment literals. Array item paths
  require template iteration and return `null` for direct lookup.
- `queryResultFields(collectionName, metadataFields, mapping?)` describes the
  fixed result envelope and `metadata.<alias>` output, retaining known direct
  source types and marking unknown direct expressions unknown. Handlebars
  output is a string. Non-record collections never inherit record metadata.
- `reportDisplayTemplateFields(rows, property, multivalue)` and
  `reportCsvTemplateFields(...)` describe their separate column contexts.

These adapters only describe paths; selecting guidance never changes a query
predicate or a saved definition. They do not perform query validation or output
execution. Later PRs should compose them with their feature's diagnostics,
parameter definitions and permissions rather than reuse email context roots.

## Angular controls

`angular/projects/researchdatabox/portal-ng-common/src/lib/schema-assist/` exports
standalone `FieldTreeComponent`, `SchemaTargetSelectorComponent`,
`AutocompleteComponent` and `CodeEditorComponent`, plus the existing pure tree,
completion and caret utilities. Use `rb-field-tree`, `rb-schema-target-selector`,
`rb-field-autocomplete` and `rb-template-editor`. Existing email component
selectors/imports remain compatible.

The tree accepts fields, optional roots, initial expansion, alias ranking and
an insertion function. The generic insertion is a path; email supplies
Handlebars insertion and its own roots, expansion and alias choices. The
selector emits an explicit selection and has no default guidance inference.
Autocomplete attaches to a native input/textarea, in `path` or `template` mode;
its source provides the relevant fields, roots, registered helpers and optional
feature-owned helper scaffolds. Email's placeholders, sample data, Context JSON,
preview frames, publishing and orchestration remain in the email app.

`LatestRequest` is a per-instance generation guard. Start a new generation for a
request/context change and invalidate it on item, brand, portal, caller changes
or teardown. Apply success, failure and busy-state updates only for the current
generation. It stores no schemas or caller data. The email editor uses it for
both target discovery and field descriptions; editors are keyed by template ID.

## Runtime evidence

The representative fixture is
`packages/redbox-core/test/fixtures/schema-assist/contexts.json`. Tests execute
`NamedQueryService` and `ReportsService`, and exercise the Angular
`RecordTableComponent` display path.

- Named-query mappings receive `{ record: storedRecord }`; results place mapped
  values under `metadata`, with `oid`, `title`, `dateCreated`, `lastSaveDate` at
  the root. Without mappings, record metadata is wrapped at the same location.
- Mapping aliases containing dots are literal keys: the runtime clones the
  mapping before using `lodash.set`, which recognizes existing literal keys.
  Template completions therefore use bracket literals for these aliases.
- Display templates merge the result row with `recordTableMeta.col`,
  `recordTableMeta.val`, and `optTemplateData`. Display scalar `val` is undefined;
  multivalue `val` is each item. CSV always supplies the scalar/item value.
- CSV prefers `exportTemplate`, then `template`, renders with `noEscape`, and
  retains its existing spreadsheet-formula protection. Display continues through
  the existing template service and DOM handling.
- Neither report context has email's curated `record`, `imports`, `portal`, or
  `sailsConfig` roots. Both support `optTemplateData.brandingAndPortalUrl`.

Tests cover complete/partial schemas, namespaced hook fields, real effective
form construction, disabled schemas, caller isolation, authorization failures,
late responses and a query integration using the same tree with stored paths.
A lifted integration test is included at
`test/integration/services/FieldDescriptionsService.test.ts` for the normal
Docker test harness.

## Validation on the PR 1 branch

All memory-heavy commands ran sequentially under external wall-clock timeouts;
Angular builds/tests used `NG_BUILD_MAX_WORKERS=1`.

- PASS: `tsc -p packages/sails-ng-common/tsconfig.prod.json`.
- PASS: `tsc --noEmit -p packages/redbox-core/tsconfig.json`.
- PASS: strict type checking of the new service, context and lifted integration
  tests against the current core source.
- PASS: focused core Mocha run of `test/services/Email*.test.ts`,
  `FieldDescriptionsService.test.ts`, `QueryReportContext.test.ts`,
  `NamedQueryService.test.ts`, `ReportsService.test.ts` and
  `test/controllers/EmailTemplateAdminController.test.ts`: 484 passing.
  One existing SCU compatibility case is pending because its optional external
  hook checkout/fixture is unavailable; the bundled namespaced form fixtures
  and real effective-form builder tests pass.
- PASS: final `QueryReportContext.test.ts` rerun: 5 passing, including literal
  alias lookup and rejection of guessed types for malformed direct paths.
- PASS: `ng build @researchdatabox/portal-ng-common --configuration development`.
- PASS: `ng test @researchdatabox/portal-ng-common --watch=false
  --browsers=ChromeHeadlessNoSandbox
  --include='**/schema-assist/shared-assistance.spec.ts'`: 3 passing.
- PASS: `ng test @researchdatabox/email-templates --watch=false
  --browsers=ChromeHeadlessNoSandbox`: all 231 passing.
- PASS: focused source lint (zero warnings/errors) and `git diff --check`.

The new lifted integration case was type checked but not executed. No Docker
stack was started on this shared worker. Browser layout/end-to-end checks,
Bruno additions and wiki/release verification remain in delivery sequence §4.

The intentional change from #5121 is fail-closed discovery: authorization is
required before type/stage disclosure and form fallback, and unexpected resolver
failures no longer fall back to forms. Missing guidance still leaves editing
available. The display/CSV scalar-value difference is characterized and
preserved for the later report editor. No unresolved implementation questions
remain for §1.
