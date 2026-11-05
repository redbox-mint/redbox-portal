# Admin UI redesign

Implementation spec for the consistent ReDBox admin interface. The design came from an audit of every
`/admin` screen (5 Nov 2026). Mock sources are in `mocks/`. Each `*.dc.html` file is one screen. They are
HTML/CSS reference markup in a design-canvas format: read the markup and `mocks/admin.css`. Don't try to run them.

- `mocks/admin.css`: the pattern stylesheet every mock uses (tokens, layout, buttons, cards, tables, filters,
  badges, alerts, empty states, tabs, split layouts, form sections, sticky save bar).
- `mocks/Header.dc.html`, `mocks/Sidebar.dc.html`: the shared admin chrome.
- `mocks/Patterns.dc.html`: the pattern kit. `mocks/Audit.dc.html`: the audit findings.
- `DEFERRED.md`: mock features the backend doesn't support yet. Don't build these; list new ones there.

## Principles (apply to every screen)

1. **One page header.** Breadcrumb (`Admin / Section / Page`), left-aligned H1, a one-line description, and
   right-aligned actions with at most one primary button. No centred titles, no H1 repeated as an H2, no
   empty gap above the content.
2. **One container.** The existing red panel header (`card` + `card-h`) for primary lists. White section cards
   (`fsec`) for forms.
3. **One button scale.** Primary = theme `--rb-primary` (blue). Secondary = outline. Destructive = outline red;
   solid red only inside a confirmation dialog. No cyan/info buttons, no uppercase "SUBMIT", no legacy
   `#428bca` submit colour. Labels in sentence case.
4. **One table, one filter bar, one empty state, one pagination footer**, all from the pattern kit. Table
   headers are 12.5px+ and readable. Row actions are a small outline button plus a ⋯ overflow menu for the rest
   (delete always asks for confirmation).
5. **Config forms.** Short forms: section cards, a switch in the card header for `enabled` flags, and a
   sticky save bar that shows unsaved-change status. Long forms: a sticky section rail, collapsible sections
   that show a one-line summary when collapsed, secrets as password fields, arrays of scalars as chip inputs.
   An app-config with nothing to show uses the "Integration not set up" empty state, never a bare Submit.
6. **Regrouped sidebar** with a current-page highlight and every registered admin screen reachable:
   Overview · Records & reporting · People & access · Site & content · Lookups & vocabularies · Integrations ·
   Developer.
7. **Theme tokens only.** Every colour comes from existing `--rb-*` CSS variables (`theme.css`), so per-brand
   branding overrides keep working. Keep Titillium Web (body) and Roboto Condensed (main nav).
8. **Accessible.** Real `<button>`/`<a>`/`<label>` elements, `aria-label` on icon-only buttons, visible focus,
   text contrast ≥ 4.5:1. Layout works down to tablet width without horizontal page scroll; wide tables scroll
   inside their card.
9. **i18n.** All new UI text goes through translation keys added to `language-defaults/en/translation.json`.

## Screen → mock map

| Screen | Route | Mock |
|---|---|---|
| Admin home | `/admin` | `Main.dc.html` |
| Reports / report view | `/admin/reports`, `/admin/report/:name` | `Reports.dc.html`, `ReportView.dc.html` |
| Named queries | `/admin/named-query` | `NamedQueries.dc.html` |
| Harvest runs | `/admin/harvest-runs` | `HarvestRuns.dc.html` |
| Export | `/admin/export` | `Export.dc.html` |
| Deleted records | `/admin/deletedRecords` | `DeletedRecords.dc.html` |
| Users / Roles | `/admin/users`, `/admin/roles` | `Users.dc.html`, `Roles.dc.html` |
| Authorized domains | `/admin/appconfig/edit/authorizedDomainsEmails` | `AuthorizedDomains.dc.html` |
| Short app-configs (System messages, Web analytics) | `/admin/appconfig/edit/systemMessage`, `…/webAnalytics` | `SystemMessages.dc.html` |
| Navigation editors | `/admin/appconfig/edit/menu`, `…/homePanels`, `…/adminSidebar` | `MenuConfig.dc.html` |
| Long app-configs (Figshare, DOI, Oni, RAiD, Integration notification) | `/admin/appconfig/edit/…` | `IntegrationConfig.dc.html`, `RaidPublishing.dc.html` |
| Branding | `/admin/branding` | `Branding.dc.html` |
| Translations | `/admin/translation` | `Translations.dc.html` |
| Dashboards | `/admin/dashboard-config` | `DashboardConfig.dc.html` |
| Vocabularies | `/admin/vocabulary/manager` | `Vocabularies.dc.html` |
| Figshare vocabularies | `/admin/integrations/figshare/vocabularies` | `FigshareVocab.dc.html` |
| Parties | `/dashboard/party` (sidebar link) | `Parties.dc.html` |
| API docs | `/admin/api-docs` | `ApiDocs.dc.html` |

Notes in the mocks (dashed `note` boxes) and sample/`[placeholder]` content are explanations, not UI to ship.
