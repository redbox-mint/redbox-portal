# Record explorer

The Admin workspace at `/:branding/:portal/admin/data-grids` supports ad hoc visual
queries and a read-only GraphQL editor. The existing URL, app identifier and saved
Mongo model remain stable. AG Grid Community 36.3.0 renders one server result page;
filtering, sorting and pagination run on the server. Saving is optional.

## Workspace behavior

Choose a record type and optional workflow stage, add typed AND conditions and one
explicit sort, then Run query. Suitable title, OID and workflow columns are selected
from current discovery when choosing a new type. **+ Add columns** opens a searchable
schema field panel; selected chips remain visible above results. The panel provides
accessible move-up, move-down and remove controls, field types and capability reasons.
Changes apply on the next run. Record title/OID links use the actual OID and current
portal's existing record-view route.

Results are permanently below the query controls. The editor draft and last executed
query are separate snapshots. Edits invalidate cursors and mark earlier results stale;
late responses cannot replace newer state. Retained rows keep their executed page number;
even undoing an edit or reformatting variables leaves them stale until a new run. Loading marks retained rows as earlier
results, and failures clear them. Save does not run or refresh a query. No totals or
client-side filtering/sorting are implied.

Saved queries opens a searchable picker with bounded server pages and Load more.
Search covers loaded entries. Selecting a query reads its latest revision, refreshes
schema/discovery and opens results directly; Edit query expands its controls in place.
`#grid=<id>` opens the same saved query after a hard reload. New query and navigation
protect unsaved drafts. Saving uses a native keyboard-accessible name dialog; Save as
creates a separate query from a detached request. Failed saves preserve the opened
query ID, revision, name and URL. Deletion is confirmed and revision checked.

## Visual and GraphQL modes

Visual queries use stable discovered IDs, typed operands, AND-only conditions, one
sort and page sizes 25/50. Every run rediscovers the selected IDs and validates the
catalogue revision and filter/sort scalar bindings. Removed fields remain visible for
repair. Changed filter types require reset/re-entry; changed sort types require
explicit acceptance. Datetimes require a timezone, valid calendar/UTC bounds and at
most three fractional digits. Current limits include 30 columns, 10 filters, 20 IN
values and 256 UTF-8 bytes per operand; endpoint budgets can require less.

GraphQL mode has editable document and JSON-variable panes, live schema/variable
validation and a searchable type/field completion browser with documentation and
argument signatures. Ctrl+Space searches the word at the editor cursor; selecting a
completion inserts it there. This is a small schema-assisted editor, not a general
GraphiQL IDE. Its schema comes from the actual parent `describeReadSchema` service
through an Admin-only endpoint; public GraphQL introspection remains forbidden.

Generate GraphQL from visual performs fresh field discovery and uses the exact
server fragments, response paths, typed filters and sort. It copies those semantics
into an independent GraphQL draft. Raw edits never silently rewrite visual controls;
switching back restores the visual draft. Regenerating asks before replacing edited
GraphQL. New query discards both drafts after confirmation when needed.

GraphQL results offer JSON and a grid. Choose an explicit result-array path for nested
or ambiguous responses. The grid flattens scalar object leaves, uses at most 30
columns/100 rows, and preserves nested arrays as inspectable cells. Invalid mappings or wider arrays
retain the complete JSON response. Grid record links are provided only for recognized
record collections with a direct, unconditional, unaliased actual `oid` selection. Response aliases,
fragment-only identities and conditional OID selections cannot supply record links. Arbitrary response shapes do not
receive invented pagination. Automatic Next/Previous requires a single direct
`records` selection, explicit `first` and `after` variables, 25/50 page size, the
matching `nodes` result path and unaliased page-info fields. Other queries remain
usable as explicitly nonpaginated responses.

## Backend integration and persistence

Deploy with parent GraphQL implementation `570c34d28` on
`feature/graphql-record-metadata`; this source branch retains the admin-design base.
Parent setup requires `recordGraphql.enabled`, a shared cursor secret of at least
32 characters, structured Solr adapter, verified metadata index mappings and reindex.
Matching uses asynchronous index values; returned records use current storage values.

- `GET /:branding/:portal/api/recordtypes`: scope types.
- `GET /:branding/:portal/app/data-grids/scopes/:recordType`: lightweight configured
  stages, independent of the parent's full-field catalogue limit.
- `GET /:branding/:portal/app/data-grids/schema`: bounded actual read-schema SDL.
- `POST /:branding/:portal/api/graphql`: actual parent execution for both modes.
- `GET /:branding/:portal/app/data-grids`: `{grids,next}`, at most 100 entries;
  `?after=<next>` retrieves the next page.
- `POST /:branding/:portal/app/data-grids`: create from `{definition}`.
- `GET /:branding/:portal/app/data-grids/:gridId`: current definition/revision.
- `PUT /:branding/:portal/app/data-grids/:gridId`: `{definition,revision}`.
- `DELETE /:branding/:portal/app/data-grids/:gridId`: `{revision}`.

All configuration actions require a route-brand Admin browser session; mutations
require CSRF. Mongo rows are scoped by route brand ID and portal. Native Mongo
revision predicates protect updates/deletes against concurrent editors. Conflicts
retain edits and require reopening the current version. No browser storage is used.
Loader model/controller/service registrations remain in the normal indexes; regenerate
cached shims after upgrading core.

Existing database translation bundles preserve their stored values when defaults
change. Deployments upgrading the earlier grid interface should review/import changed
`data-grids-*` English entries through the existing translation tooling, retaining
institution-specific wording. Merely copying defaults does not overwrite those values.

Legacy structured definitions (no mode) and explicit `mode: "visual"` remain supported,
including existing saved IDs. GraphQL definitions use `mode: "graphql"`, version,
name, document, JSON variables and resultPath. Each variable value has a maximum
nesting depth of 30 (object/array edges, with the value root at depth zero), enforced
before persistence and by both the editor and transport parser. Strict validation rejects extra
properties and definitions above 64 KiB. Raw saves validate by executing a bounded
read through the same parent executor/caller; results are not persisted. Non-null
`after` arguments cannot be saved. A save can therefore fail for the same permission,
validation, collection or work-budget reason as Run query.

The parent is authoritative for exactly one read-only operation, no introspection,
2,000 tokens, 200 fields, depth 12, at most one collection/catalogue, 64 KiB request,
256 KiB response and execution/work budgets. GraphQL saves and execution use those
rules directly, not a replacement parser or bypass. SDL assistance is refreshed on
GraphQL entry/reopen; execution always validates against the parent's current schema.
The exact pinned MIT `graphql` 16.14.2 dependency supplies parsing/schema validation;
there are no Enterprise editor/grid dependencies.

`SavedGridService` has canonical global typing derived from the parent's execute
signature. This base lacks that implementation; `services/RecordGraphqlService.d.ts`
is a type-only public-contract bridge. Combining branches resolves the actual `.ts`
class, verified by building the combined runtime.

## Checks

From `angular/`:

```sh
CHROME_BIN=/usr/bin/chromium CI=true ./node_modules/.bin/ng test @researchdatabox/data-grids --watch=false --browsers=ChromeHeadlessNoSandbox
./node_modules/.bin/ng build @researchdatabox/data-grids --configuration production
```

From `packages/redbox-core/`:

```sh
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts test/services/SavedGridService.test.ts test/unit/admin-foundation.test.ts
```

The focused backend suite uses an atomic Mongo fake. The actual HTTP/Mongo suite is
`test/integration/services/SavedGridService.test.ts`, covering session/CSRF enforcement,
brand/portal isolation, CRUD serialization/registration, pages beyond 500, revision
races, schema assistance and raw persistence/read-only rejection. For a disposable
Docker test stack with the parent enabled, set `RBPORTAL_TEST_CSRF=true` inside the
test container through a Compose override, then select it with
`RBPORTAL_MOCHA_TEST_PATHS="test/integration/services/SavedGridService.test.ts" npm run test:mocha:mount`.

For the existing isolated runtime, use the same suite without destructive bootstrap:

```sh
sudo -n docker exec redbox-grid-verify-rbportal-mount-1 node support/integration-testing/run-saved-grid-runtime.cjs
```

The runner uses the existing Node inspector (`RBPORTAL_INSPECTOR_URL`, default
`http://127.0.0.1:9876`), exits nonzero on failures/skips/no tests and writes
`.tmp/saved-grid-integration-result.json`. It creates uniquely named disposable
fixtures and removes only those fixtures. Default isolated Admin credentials can
be overridden with `RBPORTAL_TEST_ADMIN_USER`/`RBPORTAL_TEST_ADMIN_PASSWORD`.

Source core check: `./node_modules/.bin/tsc --noEmit -p packages/redbox-core/tsconfig.json`.
Current results and browser limits are in [VERIFICATION.md](VERIFICATION.md).
The same-origin Quartz WOFF2 asset and its upstream licence must be refreshed when
upgrading the pinned AG Grid package; the portal CSP does not permit its data-URL font.

## Complex values: one row per record

The visual column picker includes discovered single-object scalar children (with their
storage paths), complete declared scalar lists and repeated object groups. Each list
stays inside one record cell. Scalar lists preview two values and explicitly indicate
additional/clipped values; groups show an item total and open a small detail table.
Nested lists remain inside their owning group cell, preserving name/email pairing.
Null, missing, empty text, empty lists, false and zero remain distinguishable. Text is
inserted using text nodes, never HTML. Numbers and booleans use their actual value
kinds; timestamp formatting is restricted to the discovered DATETIME contract.

The labelled native detail dialog supports keyboard focus containment, Escape, Close
and focus return. With a grid cell focused, Enter/Space opens its details; Tab enters
the detail button and Shift+Tab returns to the cell. Long scalar text also has full
value inspection. The inspector labels use the existing translation service.

Raw result mapping keeps arrays/groups intact as cells while continuing to discover
scalar children of single objects. Arbitrary shapes retain the complete JSON response
and existing explicit result-path mapping. Unsupported shapes never cause row expansion.
No page-local filtering/sorting or repeated-group filter semantics were added.

The parent already exposes stable IDs and executable selections for single-object
children. Its repeated catalogue entries previously had no usable complete group
selection and were unselectable. The narrow parent addition is retained in
[backend-patches/record-graphql-complex-fields.patch](backend-patches/record-graphql-complex-fields.patch):
`record-graphql/catalogue.ts` projects declared repeating parents with complete typed
children and `grid.test.ts` verifies projection, pairing, nested lists, private-field
exclusion and rejection of repeated scalar operations. Apply it to the GraphQL parent
`570c34d28` when combining this feature; these parent files are absent from this base.
It is separate from the earlier UON compatibility patch and introduces no API fields.
`SavedGridService.ts` in this worktree now accepts authoritative selectable repeated
columns while keeping scalar filter/sort validation unchanged. Saved IDs are resolved
to fresh discovered fragments on each run/reopen, never reconstructed from pointers.

Only a repeating parent with a fully declared readable shape is selectable. Descendants
below a repetition remain disabled as independent columns; selecting their parent
preserves grouping through nested repetitions. Opaque/incompatible JSON stays unavailable
in visual collection mode. In actual UON discovery, `contributor_ci` is opaque JSON;
its name/email children cannot be invented. UON contributors and supervisors do have
declared repeated name/email/institution/jobTitle/orcid shapes. The live catalogue has
17 selectable repeated RDMP fields. Existing GraphQL selection, depth, work, response,
page and permission limits are unchanged; select fewer columns if a group exceeds them.

For the live UON environment, focused checks and evidence are under
`/home/andrew/.t3/redbox-uon-explorer/`:

```sh
# Primary Angular workspace (9876 belongs to the live inspector).
cd angular
KARMA_PORT=9877 CHROME_BIN=/usr/bin/chromium CI=true ./node_modules/.bin/ng test @researchdatabox/data-grids --watch=false --browsers=ChromeHeadlessNoSandbox
./node_modules/.bin/ng build @researchdatabox/data-grids --configuration production
# Combined parent runtime, with no install step.
cd /home/andrew/.t3/redbox-grid-verify-runtime/packages/redbox-core
npm run test:record-graphql
../../node_modules/.bin/tsc -p tsconfig.json
# Live registered HTTP/Mongo actions, with fixture cleanup.
sudo -n docker exec redbox-uon-explorer-rbportal-1 node support/integration-testing/run-saved-grid-runtime.cjs
python3 /home/andrew/.t3/redbox-uon-explorer/verify-complex.py
python3 /home/andrew/.t3/redbox-uon-explorer/verify-form-assets.py
```

The broader HTTP suite accepts anonymous denial as either 403 or an exact login
redirect with no data (UON uses the latter); signed-in Researcher denial and missing or
incorrect CSRF remain strict 403 checks. See VERIFICATION.md for results/deployment.

### Structured-cell review fixes

Number rendering uses JavaScript's shortest round-trip representation, including
scientific notation for tiny values, so full inspection never rounds a nonzero value
to zero or drops significant digits. Duplicate field labels are qualified with their
actual discovered paths throughout the picker, selected columns, chips, result headers
and accessible inspector names. The picker also displays the discovered storage path;
it does not construct GraphQL names or executable syntax from it.

Raw heterogeneous rows distinguish absent properties (Missing) from explicit null
(No value). A null repeated item retains its index and has a separate spanning-cell
marker, distinct from an object whose children are all null. Supported repeated
parents are described as display/inspection fields; unavailable independent children
have separate guidance. These fixes change presentation only, with no stored query,
record, server capability or parent backend patch changes.

### Arbitrary JSON property paths

Raw scalar-object grid mapping accepts only GraphQL-name property segments. A JSON
scalar can contain literal dots, slashes, spaces or other names that could be confused
with flattened column paths. Such a name in a flattened object rejects the complete
mapping and opens the existing full JSON response instead of overwriting or merging
values. The check applies across every row. Objects inside repeated cells are retained
without flattening, so their arbitrary keys and nested arrays remain fully inspectable.
Ordinary GraphQL field names and scalar-object columns keep their existing display.

### Missing, null and empty values in linked/structured cells

Visual title/OID links first preserve shared scalar presentation: missing, null and
empty text render explicit markers without blank anchors. Populated values retain
safe text and encoded record URLs. The existing title-link eligibility is unchanged.
Raw empty objects are retained as inspectable cells, including nested empty objects,
and display an explicit Empty object marker in full details. This keeps `{}`, missing,
null, empty lists, false and zero distinct. A column-path identity check also rejects
an ambiguous synthetic root `value` column versus a real `value` property, using the
existing complete JSON fallback rather than merging unrelated root shapes.

### Declared single-person objects (UON chief investigator)

Fully declared single objects can now be selected as an inspectable group, alongside
individual discovered child columns. This uses the server's actual selection fragments
and stable IDs; selecting a group and its children together keeps their response aliases
separate. Structured objects always keep their inspector, including labels containing title.
Object groups have no scalar filter/sort capabilities. Opaque or conflicting
shapes remain unavailable, and write-only/undeclared children remain excluded.

UON's `contributor_ci` was not an unknown person component: its reusable GroupComponent
already declared `name`, `email`, `institution`, `jobTitle` and `orcid`, with the label key
`@dmpt-people-tab-ci`. In all three effective RDMP stages it collided with a redundant
hidden scalar edit carrier and a view-only input explicitly transformed to Content.
`replaceName` was working. The compiler excludes explicit **view-only Content** projections only when another
authoritative declaration owns the same resolved storage path **and** the projection
contribution carries no write-only restriction. Every final-pass projection invokes its
contributor; privacy-bearing nodes remain in the normal deny-wins merge, including
nested restrictions and conservative closure of incompatible private shapes. Standalone view-only
fields retain their source storage contracts. Ownership uses the existing compiler to
resolve reusable definitions, transparent containers and name overrides, without
examining stored record data. Genuine scalar/object
conflicts, including hidden edit fields, still close the shape.

The configuration correction is separate: `backend-patches/uon-chief-investigator-carrier.patch`
removes only the redundant `editValueCarrier("contributor_ci")` call in the UON hook.
The hook checkout is unchanged. The live harness mounts an equivalent single-file compiled
overlay and removes that carrier from the three backed-up persisted forms. This overlay is
required until the hook patch is adopted; merely updating the persisted forms is insufficient
because UON startup regenerates them. No record metadata is inferred or rewritten.

Parent-only compiler/catalogue changes and their regression tests are retained in
`backend-patches/record-graphql-single-object-fields.patch`. Apply it **after** the existing
`record-graphql-complex-fields.patch` to the combined GraphQL parent runtime; do not replace
that earlier patch. The primary frontend protocol and SavedGridService accept discovered
selectable OBJECT columns, while continuing to validate persistence against discovery.
