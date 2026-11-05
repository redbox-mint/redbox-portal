# Deferred: mock features without backend support

These features appear in the mocks but need backend work (new data, endpoints or services). They're
**not** built in the redesign. Implementers add to this list when they find a feature the backend can't
support. Note the screen, the feature and what the backend would need.

Pure front-end features built from data the screen already receives (client-side filtering, previews,
colour-contrast checks, collapse/expand, chip inputs) are **not** deferred. Build them.

| Screen | Feature | Why deferred / backend needed |
|---|---|---|
| Admin home | "Needs attention" list (e.g. Oni empty sections, banner off) | Needs a service that evaluates config health across app-configs |
| Admin home | Integration on/off badges and the "n of 5 integrations enabled" stat | Needs an endpoint that summarises each integration app-config's enabled state |
| Sidebar | Status tags (On / Check / Error) next to items | Same integration/config status summary as above |
| Named queries | "Used by" column (which reports/dashboards use a query) | Needs a reverse-reference lookup across report and dashboard config |
| Deleted records | Bulk select with Restore / Delete permanently | Needs bulk restore/destroy endpoints |
| Deleted records | "Deleted by" column and "Deleted within" filter | Deletion audit (who/when) isn't exposed for filtering |
| Users | "Last login" field; filter by sign-in method | Needs last-login tracking and a sign-in-type filter in the user query |
| Roles | Role descriptions | Roles have no description field |
| Authorized domains | "Test an address" checker | Should call the server's actual matching logic via a new endpoint, not reimplement it client-side |
| System messages | "Style" option (information/warning/critical) | Not in the SystemMessage config model |
| Navigation editors | "Reset to default" button | Needs an endpoint to clear the saved brand override back to defaults |
| Translations | "Missing" / "Changed" filters, "New default" badge, translated-count column | Needs per-key provenance (default vs override vs missing) from the translation service |
| Translations | Import / Export buttons | Needs bundle import/export endpoints |
| Translations | Display-name-only rename update | The existing rename posts and resynchronizes the whole bundle. It is slow and can prune parent labels that also have dotted child keys (for example `@dataPublication-dc:accessRights`). Needs a metadata-only display-name endpoint that preserves every translation entry. |
| Vocabularies | "Last synced" column | Sync timestamp isn't returned by the vocabulary list API |
| Parties | "Import CSV" and "Add party" actions | No party create/import endpoints in the admin context |
| Long app-configs (Figshare, DOI, RAiD, Oni) | "Test connection" button and "Connection OK" status | Needs a per-integration connectivity check endpoint |
| Oni publishing | Fields inside the six nested sections | The config schema omits the nested properties; dictionary fields need a new editor type |
| Report view | Sorting across all result pages | Result endpoints apply fixed Solr / named-query ordering and accept no sort parameter. Headers sort the currently loaded page; global sorting needs validated sort parameters for both sources. |
| Report view | Source and named-query metadata in the description | The report-view DTO strips `reportSource` and `databaseQuery`; expose these existing config fields to report viewers. The view renders them when available and otherwise shows a general description. |
| Harvest runs | Global statistics (runs / failed in last 7 days, running now, last successful run) | The list API returns a filtered, paginated page and its count. Accurate cross-page statistics need an aggregate summary endpoint. |
| Export | Cancel a preparing export | The job API only removes terminal jobs; cancellation needs a worker cancellation API and job-state handling. |
| Deleted records | Record-type column | The deleted-record list response must expose each record’s type; the current response contains only title, identifiers, lifecycle and dates. |
| Roles | Remove a user’s only role | `UsersService.updateUserRoles` rejects an empty role set. Assign another role first; allowing users with no roles requires a backend policy change. |
| Roles | Default role for new users | The role list, user list and client configuration do not expose the brand’s auth default role. Expose that setting in an existing admin response before displaying it. |
| RAiD publishing | Dictionary-based types and field mappings | The schema exposes opaque dictionaries without editable properties; these need a dictionary editor and a schema for mapping entries. Existing values are preserved. Connection, OAuth, retries and durable retry fields use the existing supported config shape. |
| Integration notifications | Per-integration dictionary overrides | The schema uses `patternProperties`, which the generic Formly converter does not render. A dictionary editor is needed to add and edit named integration overrides; existing values are preserved. |
| Branding | Draft / publish lifecycle for logo and favicon | Existing upload routes update live assets immediately; version history covers colours and typography only. Draft image storage and versioned publish/restore support are needed before these assets can join the draft lifecycle. The UI explains the immediate effect. |
| Branding | Reset the entire saved draft to published branding | Existing Reset draft only reloads saved colours into the editor. Revert typeface draft is supported separately; an atomic reset endpoint would be needed for one action covering all saved draft state. |
| Dashboards | Dashboard types group and “Add dashboard type” form | The current target catalogue and DashboardConfigController expose only existing workflow-stage and view-step targets. Legacy profile rows are used for migration, with no supported list/create/edit API for dashboard types. Needs a dashboard-type management API before showing these controls. |
| Dashboards | Rows per page | The current editor settings and dashboard configuration validation expose no persisted per-target page-size setting. Needs a supported field and runtime consumption before adding this mock control. |
