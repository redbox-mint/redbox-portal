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
| Vocabularies | "Last synced" column | Sync timestamp isn't returned by the vocabulary list API |
| Parties | "Import CSV" and "Add party" actions | No party create/import endpoints in the admin context |
| Long app-configs (Figshare, DOI, RAiD, Oni) | "Test connection" button and "Connection OK" status | Needs a per-integration connectivity check endpoint |
| Oni publishing | Fields inside the six nested sections | The config schema omits the nested properties; dictionary fields need a new editor type |
