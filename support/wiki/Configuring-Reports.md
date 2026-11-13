# Configuring Reports

Manage database and GraphQL report definitions through **Admin → Reports**
(`/:branding/:portal/admin/reports`). Open a report or choose **Create** for the
full-page editor. Select a saved named query to discover its parameters and
output fields. Choose fields explicitly to add columns, then edit their labels,
order, hidden/multivalue options and templates. Query changes retain edits and
flag stale bindings/columns; use refresh after another author edits the query.
Solr reports remain read-only in this editor; saved Solr execution/export is
unchanged.

## Bindings and paths

See [Configuring Named Queries](Configuring-Named-Queries) for source contexts.
A mapping alias `projectTitle` becomes report column `metadata.projectTitle`.
Unmapped record metadata uses the same result wrapper. Column properties use
lodash lookup syntax, including brackets for literal dotted names.

Text filters send `paramName` as the named-query parameter key. Date ranges use
separate **From parameter** and **To parameter** selectors. The persisted legacy
fields `database.fromProperty` and `database.toProperty` contain parameter keys,
not record paths: bind `createdAfter`, whose query path may be `dateCreated`.
Date filters send ISO timestamps. Day-offset parameters (`type: date`,
`format: days` with an operator) are incompatible. A suggested pair requires
explicit confirmation. Keep custom parameters editable when types are unknown.

## Guidance and templates

Guidance is advisory: partial, form-derived, missing or denied schemas do not
prevent manual authoring. Unknown hook fields/mappings remain supported.
Selecting guidance never rewrites saved queries, filters or columns. Existing
save compatibility is preserved; advisory template/binding warnings do not
become new save blockers. Required report fields and a saved query are required.

Display and CSV templates use Handlebars with the actual result row plus
`recordTableMeta` context; they do not use the email or stored-record context.
For a scalar column, display `recordTableMeta.val` is undefined, while CSV `val`
is the selected value. Prefer `{{metadata.projectTitle}}` for scalar display and
`{{recordTableMeta.val}}` for scalar export. Multivalue rendering supplies each
item as `val`; use the column's multivalue option to render per item. CSV uses
`exportTemplate`, falling back to `template`. Without a template, CSV retains
runtime Date/boolean/array/object casts and spreadsheet-formula protection.

## Explicit preview and limits

Preview uses unsaved columns, templates and filter values with the brand-effective
saved query, without saving either definition. It shows real result rows,
configured display cells, export-value samples and inspectable raw JSON. Hidden
columns remain available for export. Export samples are CSV cell text after
runtime casting/formula protection and before CSV quoting/escaping.

`renderedRows[i].cells[j].untrustedDisplayHtml` is untrusted HTML. Angular clients
must use the normal `[innerHTML]` binding, as the live report does; do not bypass
trust or insert it as arbitrary DOM HTML. Render export/raw values as text.

The server owns a 100-row sample cap, 512 KiB response cap, 128 KiB input cap,
depth 24 / 4,000 nodes, 256 expressions per template and a 5-second native
query/render budget. `truncated` and `truncationReasons` disclose omitted rows
or bytes; `total` retains the query match count. Excessive/unsafe templates can
refuse preview without preventing legacy saves.

**`deadlineEnforced` describes database execution.** It is true for bounded native
record queries (count/find use remaining Mongo `maxTimeMS`). For saved user/custom
queries, related filters or relation expansion, compatibility preview follows the
existing saved execution path and returns false: its database read cannot be
cancelled by this preview budget. The UI displays this limitation. Row, response
and post-query rendering bounds still apply. A response timer is not database
cancellation. Draft named-query preview refuses these paths instead.

Legacy database report reads retain administrative query access, including brand
scoping and the existing lack of per-record read-ACL filtering. GraphQL reports,
including preview and CSV, execute as the authenticated viewer with current
brand/portal scope and per-record read ACLs. They never use a privileged service
identity. Existing report route permissions and CSRF protection still apply.

## API

Routes are relative to `/:branding/:portal/api/report-config`. Existing
brand-configured report roles apply (Admin by default); report authors do not
need named-query administration or email editor permission for assistance.

| Method | Suffix | Contract |
|---|---|---|
| GET | `/named-query/:name/description` | Saved parameters/result plus separate display/CSV `templateContexts`; optional `property`, `multivalue=true`, `recordType`, `stage` |
| POST | `/validate` | Unsaved report JSON; structured `valid`/`diagnostics`, no execution |
| POST | `/preview` | Unsaved report JSON and existing filter request parameters; raw `records`, `renderedRows`, `limits`, truncation and `deadlineEnforced` |

POSTs require CSRF. Session-backed CRUD mutations require CSRF; sessionless
bearer CRUD remains compatible. Responses are no-store. API v1 returns DTOs;
v2 wraps them in `data`/`meta`. Structured validation/refusals return 200 with
`valid: false` (preview also `success: false`); input/complexity overflow 413,
timeout 408, denied access 403, missing description 404. Existing invalid report
preview configuration retains its 400/403 response with a safe code.

## GraphQL reports

Publish a saved explorer query as a GraphQL named query, then choose **Create
report from this query**. The report query picker includes GraphQL badges and
saved-source provenance. Choose friendly output fields to add columns; raw
properties are available under **Advanced**. Caller-owned parameters offer filter
buttons and plain-language labels. The first page previews automatically when a
GraphQL query is selected. Links return to the named query and saved explorer;
the named query's **Used by** section lists the report.

Reports require a paged `records` collection with variable `first` and `after`
arguments, selected `hasNextPage`/`endCursor`, and a two-part result path to its
nodes. General explorer publications need no lookup search binding. Other query
shapes can remain valid named queries while being unavailable for reports.
GraphQL schema and mappings must still validate for the caller.

The query description API supplies a `v2:` canonical execution-shape hash as
`queryVersion`. It covers the query name, branding, GraphQL document, operation,
variable bindings/defaults, result path, mappings and lookup controls; descriptions,
provenance and source links do not change it. Persist it in
`databaseQuery.queryVersion`. An unprefixed legacy full-definition hash is accepted
only while it exactly matches the current full definition; saving with the current
version adopts `v2:`. Preview, save, run and export reject missing or changed
GraphQL bindings. Refresh the editor, review fields/filters, explicitly
accept the current version and save. Source changes (including source type) cannot
silently change the meaning of an existing report. CSV rechecks the effective
query between pages and before returning its file.

The viewer shows **Showing 1–25**, **Previous** and **Next** in live regions,
without numbered pages or a fabricated total. Each request executes one page of
at most 25 rows. Server-issued encrypted/authenticated continuation tokens bind
the report definition, effective query version, viewer identity and roles, brand,
portal, filters and page size. They expire using the existing record-grid cursor
age. Tampered, foreign or stale tokens return a safe error. Configure a shared
`recordGraphql.cursorSecret` (at least 32 characters) on all instances. A raw
engine cursor is never accepted from a report client. GraphQL report sorting uses
the published query order; database/Solr sorting is unchanged.

CSV starts at the beginning, traverses cursor pages server-side, and sends an
attachment only after successful completion. The button explains the configured
row limit, announces a wait state, and reports failures in plain language. No
silently partial file is returned. `recordGraphql.reportExport` defaults are:

| Setting | Default | Valid range |
| --- | ---: | ---: |
| `maxRows` | 10000 | 1–100000 |
| `maxPages` | 400 | 1–4000 |
| `timeoutMs` | 30000 | 1–120000 |
| `maxBytes` | 16777216 | 1–67108864 |

All values must be safe integers; invalid configuration fails closed. Traversal
uses fixed 25-row pages, so the page ceiling can constrain the effective row
limit. Raw accumulated rows and the rendered CSV both obey the byte ceiling.
The export budget also bounds pending schema/query/version reads. Existing
GraphQL per-query work/response limits still apply. Exceeding row/page/bytes
returns HTTP 413, expiry of the export deadline 408, changed query 409, and an
invalid report cursor 400. None returns an attachment. Narrow the query or ask
an administrator to adjust valid limits. Display sanitization and CSV formula
protection remain in force.

Record traversal is a **live read**, not a snapshot. Current stored ACLs are
checked on every page; deletions and revoked access disappear from later pages.
Concurrent inserts, edits and index changes may affect order, omit/repeat rows or
invalidate a continuation. An invalid/nonadvancing continuation aborts export.
No exact total or snapshot consistency is promised. Query-definition drift is
separately detected by the version checks above.

Viewer routes remain `admin/getReport`, `admin/getReportResults` and
`admin/downloadReportCSV`. Metadata adds `querySource` and GraphQL
`exportMaxRows`; result `total` is null with `pagination: {mode: "cursor", start,
hasNextPage, nextCursor}`. Results accept `cursor` with `start=0`; CSV rejects client cursors and always
starts fresh. The viewer’s page or offset never selects export scope. Responses are no-store. GraphQL
preview is capped at 25 rows in addition to the existing preview response/render
bounds; its exact total is null.
