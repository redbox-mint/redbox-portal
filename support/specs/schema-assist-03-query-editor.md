# Named-query editor workspace (PR 3)

Base: `stack/schema-assist-02-query-backend`, `4f176495b`.
Implementation branch: `stack/schema-assist-03-query-editor`.

## Workspace and components

The existing named-query list remains the entry point. Selecting a query or
creating one opens a full-page workspace in the existing Angular application.
The main area keeps Basics, Mongo query, Parameters, Result mappings and
Sort/related filters. The collapsible field/help panel sits beside it above
1000px and stacks below it on narrower screens. Diagnostics, test parameters,
bounded preview rows and JSON inspection sit below both areas. Save, Cancel
and explicit Preview actions remain available in the workspace header.

`QueryAssistanceModule` contains four small editor-specific controls:

- `nq-path-input` composes the shared field tree and path autocomplete. Stored
  predicate/parameter/sort/join paths use `storedRecordPath`; direct mapping
  paths use `lookupPath`. It exposes known enums, types, compatible Mongo
  operators and explanatory array guidance without creating comparisons.
- `nq-mapping-value` keeps the output alias beside its source. Direct lookup
  and Handlebars modes preserve the expression when switched. Handlebars uses
  the shared template editor, autocomplete, `record` root and `fieldInsertion`
  scaffolds, including iteration for array items. Mapping fields come from the
  backend's PR 1 mapping adapter.
- `nq-typed-value` supplies number, boolean, object/array JSON and date controls
  for defaults and test parameters. Loading a value never coerces it. Explicit
  parameter types, formats, templates and hook properties survive path edits.
  Date help describes `days` offsets and ISO timestamp pass-through; selecting
  a source field never guesses a date format or changes a parameter override.
- `nq-diagnostics` filters backend diagnostic locations at each condition,
  parameter, mapping/template, sort and related filter. Errors and warnings
  have explicit text and distinct styles. Suggested corrections are displayed
  for manual application; the editor never rewrites an expression from advice.

Field selection uses native details/summary controls and shared tree buttons;
paths can also be completed from the keyboard in their input. The sidebar
separates stored envelope fields from metadata and displays schema precision,
completeness and a visible type/stage scope notice. Expandable parameter and
related-filter cards now have keyboard-operable buttons. Entering the workspace
focuses its heading; cancelling restores an available list action.

## State and persistence boundaries

The persisted `draft` contains only the named-query definition. Record type,
optional stage, related-filter guidance, discovered fields, diagnostics, test
parameters and preview state live separately in the editor. No authoring
selection is written into a saved query, and no sessionStorage is used.

On opening, guidance is inferred only from a conservative, exact, unparameterized
top-level `metaMetadata.type` constraint. Dynamic, multi-type, nested/complex or
conflicting expressions prompt for guidance or permit editing without it.
Selecting guidance changes suggestions only. The explicit **Add type constraint**
action shows the condition and ANDs it with the complete existing query instead
of replacing any existing predicate. Stage guidance is explicitly scoped and
does not claim every historical or multi-type result has that shape.

Non-record collections retain editable paths/templates, including legacy
collections absent from the collection dropdown. They never request or inherit
a record metadata tree. The runtime `record` mapping wrapper remains available
without claiming it has record metadata. Related filters resolve their own
foreign collection/type/stage; local joins use the local query's field context.
Changing filter structure clears index-scoped foreign guidance and guards late
responses before rebuilding descriptions.

A draft baseline plus pending text tracks unsaved work. Cancel, opening another
query, starting a new query and portal links ask before abandoning edits;
`beforeunload` protects full-page navigation. Saving also validates the draft,
preserves unknown configuration properties (including `brandIdFieldPath`), and
retains edits if the draft changes during a request. Preview-only refusals do
not become save blockers. Missing guidance/validation capabilities leave manual
editing and legacy save operations available.

Tab switches hide rather than destroy subeditors, preserving unapplied JSON and
invalid typed values. A different draft recreates the subeditors so the previous
item's pending text cannot appear in it. Switching Mongo raw JSON back to the
structured view applies valid JSON first; invalid text stays visible and blocks
Save/Preview. Unsupported operators and complex expressions remain object/array
JSON entries and survive unrelated structured edits. Invalid structured JSON
never replaces an expression with an empty object. Parameter control identities
survive additions, retaining pending default text.

## Requests, diagnostics and preview

The Angular API service extends the existing `HttpClientService` and uses its
CSRF context for all new POSTs. Assistance methods accept both API v1 DTOs and
API v2 data envelopes. It wires `/editor/schema-targets`, `/editor/fields`,
`/editor/validate`, `/editor/describe` and `/editor/preview` from PR 2.

Validation is debounced by 400ms and never executes the query. Preview runs only
from the explicit action with a snapshot of the unsaved definition, ephemeral
guidance and test values keyed by parameter name. The UI labels real data,
shows server-bounded rows and truncation reasons, preserves inspectable response
JSON and displays the report-facing result description from `describe`.

Each request stream uses PR 1's `LatestRequest` guard: item loads, target discovery,
local fields, foreign fields, validation and preview. Item/guidance changes,
draft edits and teardown invalidate appropriate generations. Stale successes,
failures and busy-state updates cannot replace the new item's state. Preview
also cancels pending validation timers so advice cannot hide its refusal.

PR 2 intentionally refuses user/custom collections, related-filter joins and
relation expansion in draft preview. Those structured refusals and their
locations appear clearly in the workspace while editing/saving remains
available. No backend changes or additional backend gaps were required here.

## Validation

All installs, compilation, Angular tests and builds ran sequentially under
external `timeout` limits. Angular used `NG_BUILD_MAX_WORKERS=1`; tests used
`CHROME_BIN=/snap/bin/chromium` and `ChromeHeadlessNoSandbox`. No Docker stack,
server, push or pull request was created.

- Root and sails-ng-common installs: `timeout 600 npm install --include=dev
  --no-save --ignore-scripts --strict-peer-deps`.
- Angular install added `--include=optional` for esbuild's platform binaries.
- Shared DTO compilation: `timeout 180 npm run compile` in sails-ng-common.
- Shared Angular library: `timeout 240 env NG_BUILD_MAX_WORKERS=1
  ./node_modules/.bin/ng build @researchdatabox/portal-ng-common
  --configuration development`.
- Named-query editor: **167 passing** Angular specs, including 39 new workspace
  and API behaviour cases, with `timeout 300 env NG_BUILD_MAX_WORKERS=1
  CHROME_BIN=/snap/bin/chromium ./node_modules/.bin/ng test
  @researchdatabox/named-query-editor --watch=false
  --browsers=ChromeHeadlessNoSandbox`.
- Portal-ng-common schema assistance: **4 passing** specs with the same test
  flags and `--include='**/schema-assist/*.spec.ts'`.
- Production app build: `timeout 300 env NG_BUILD_MAX_WORKERS=1
  ./node_modules/.bin/ng build @researchdatabox/named-query-editor
  --configuration production`.
- Focused oxlint and `git diff --check` passed.

The production build reports an initial bundle budget warning (approximately
1.20 MB against the 500 kB warning budget) and a CommonJS optimization warning
for sails-ng-common. These are warnings; the production build completes.

Browser layout/end-to-end verification remains in PR 6 as planned. This PR does
not add a Playwright test, report-editor changes, persisted authoring preferences,
new dependencies or backend execution support. No open implementation questions
remain for delivery section 2.
