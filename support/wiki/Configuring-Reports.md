# Configuring Reports

Manage database report definitions through **Admin → Reports**
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

Report record reads retain existing administrative query access, including brand
scoping and the existing lack of per-record read-ACL filtering. Preview does not
add an independent record access model.

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
