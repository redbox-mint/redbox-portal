# Named query usage

Delivered on `admin-deferred/02-named-query-usage`.

The existing admin-only, brand-scoped named-query list and detail APIs include
`usedBy: [{ type, name, path }]`. Paths are relative to the current brand and portal.
The list builds one index for all queries, with a fixed number of model reads;
it does not resolve usage once per query. No models or migrations are added.

References include database reports, query vocabulary configuration, form typeaheads
through vocabulary aliases, and explicit named-query references in effective brand AppConfigs
(including defaults, with superseded duplicate rows excluded and secrets masked)
(including Figshare workflow transition jobs). Dashboard workflow stages, view
steps, dashboard types and the aggregate settings document are scanned for explicit
named-query data-source references. Core dashboard retrieval currently uses record
queries rather than resolving a named query; those dashboards correctly have no
named-query dependency. Explicit reference fields in hook-supplied dashboard config
are included. Query bodies, parameters, result mappings, labels and template text
are not searched for incidental name mentions. Vocabulary and dashboard-view config
are process-wide and apply to each brand; persisted consumers are brand-filtered.

Deletion rechecks usage server-side and returns HTTP 409 with `meta.usedBy` (API v2) and a
clear error when references exist. There is deliberately no force override: admins
must remove references first. The UI lists consumers and disables the destructive
action. The check and delete are not a cross-model transaction; concurrent config
writers can still create a new reference after the check. Usage describes configured
references, not external clients calling the query execution API dynamically.

Links open supported consumer pages. Form and vocabulary links open their existing
read endpoints because the portal has no dedicated editor for those configurations.
Dashboard types link to the dashboard configuration overview: type management is
still deferred and has no dedicated editor route.
