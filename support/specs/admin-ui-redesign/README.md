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

## Implementation notes

Phase 1 provides the shared foundation and overview. Later phases should use these patterns when
replacing each Angular app's existing markup; the shell alone does not add a header to those apps.

### Build and scope

`assets/styles/admin.scss` is imported last by `assets/styles/style.scss`. The portal Webpack asset
entry builds it into `.tmp/public/default/default/styles/style.min.css` (`npm run webpack`). No separate
Angular stylesheet import is needed: global CSS reaches templates using Angular's emulated encapsulation.
All component rules live under `.rb-admin`; `.rb-admin.admin-layout` supplies the two-column shell.
The one outer selector, `.maincontent-body:has(> .rb-admin)`, removes the legacy portal's 80px/130px
vertical padding on admin pages only. Other portal pages retain their styling. The shell stacks at
widths below 992px; navigation groups use two columns on tablets and one below 576px.

Colours derive from existing published `--rb-*` theme variables, with fallbacks for older brands.
Internal `--admin-*` aliases and `color-mix()` derive neutral surfaces and semantic tints without adding
new branding configuration. Body and nav fonts continue to inherit the portal fonts (Titillium Web and
Roboto Condensed by default). Brand typeface overrides still apply.

### EJS shell and header

Every admin view except the standalone `api-docs.ejs` uses the paired shell partials. Keep Angular
bootstrap scripts/styles outside the shell, after `end.ejs`. For nested views, adjust relative include
paths (Figshare vocabularies uses `../../layout/start.ejs`). Export (`views/default/default/export/index.ejs`)
and the admin-only branch of `views/default/rdmp/dashboard.ejs` also use this shell, since they share
the navigation. The dashboard's ordinary non-admin branch is unchanged. Do not add another Bootstrap sidebar grid
or full-page container inside the wrapper; `.rb-admin-wrap` already limits content to 1180px.

```ejs
<%- include('layout/start.ejs') %>
<%- include('layout/page-header.ejs', {
  breadcrumbs: [
    { labelKey: 'menu-admin', href: BrandingService.getBrandAndPortalPath(req) + '/admin' },
    { labelKey: 'admin-nav-reports' }
  ],
  titleKey: 'reports-heading',
  descriptionKey: 'reports-description',
  actions: [{ labelKey: 'report-create', href: createUrl, primary: true }]
}) %>
<!-- Page content -->
<%- include('layout/end.ejs') %>
```

`breadcrumbs` is an ordered array of `{labelKey, href?}`. Omit `href` on the current page.
`titleKey` is required; `descriptionKey` and `actions` are optional. Actions are link descriptors
`{labelKey, href, primary?}`; use at most one primary. Labels are translated and escaped, and URLs are
escaped. For interactive Angular actions, use the equivalent markup below instead of passing raw HTML.
Only one layer owns the page header: do not render both an EJS header and an Angular header.

### Angular header

The EJS view already supplies `.rb-admin`, `<main>` and `.rb-admin-wrap`. Use the same header classes
inside the Angular component, and use its existing i18next pipe. Buttons retain Angular event bindings.
Add new labels to `language-defaults/en/translation.json` and run `npm run test:translations`.

```html
<nav class="rb-admin-crumbs" [attr.aria-label]="'admin-breadcrumb-label' | i18next">
  <ol>
    <li><a [href]="brandingAndPortalUrl + '/admin'">{{ 'menu-admin' | i18next }}</a></li>
    <li><span aria-current="page">{{ 'admin-nav-reports' | i18next }}</span></li>
  </ol>
</nav>
<header class="rb-admin-page-header">
  <div>
    <h1>{{ 'reports-heading' | i18next }}</h1>
    <p>{{ 'reports-description' | i18next }}</p>
  </div>
  <div class="rb-admin-page-actions">
    <button class="btn btn-primary" type="button" (click)="createReport()">
      {{ 'report-create' | i18next }}
    </button>
  </div>
</header>
```

### Pattern kit

Use Bootstrap 5 structure for the standard components. Do not copy the mocks' `.row`, `.card-h`,
`.tabs`, `.switch` or bare `.badge.ok` classes; those are reference notation, not the shipped API.

| Pattern | Shipped markup/classes |
|---|---|
| Shell | `.rb-admin.admin-layout`, `.rb-admin-sidebar`, `.rb-admin-main`, `.rb-admin-wrap` (partials own these) |
| Header | `.rb-admin-crumbs > ol > li`, `.rb-admin-page-header`, `.rb-admin-page-actions` |
| Buttons | `.btn.btn-primary` (theme blue), `.btn.btn-outline-secondary`, `.btn.btn-outline-danger`; `.btn-sm` for row actions |
| Confirmation delete | `.modal .btn.rb-admin-danger-confirm`; solid red is opt-in only inside confirmation dialogs |
| Primary list panel | Bootstrap `.card`, `.card-header` (brand red), `.card-body`, `.card-footer` (pagination/count row) |
| Tables | `.table-responsive > table.table.table-hover`; use `.text-end` for numbers/actions; contain wide-table overflow here |
| Badge | `.badge.rb-admin-badge-primary`, `-success`, `-warning`, `-danger`, `-info` |
| Alert | Bootstrap `.alert.alert-danger`, `-warning`, `-info`, `-success`; retain `role="alert"` for errors |
| Tabs / pagination | Bootstrap `.nav.nav-tabs > .nav-item > .nav-link.active`, `.pagination > .page-item > .page-link` |
| Statistics | `.rb-admin-stats > .rb-admin-stat` with `<b>` value and `<span>` label |
| Filter bar | `.rb-admin-filter-bar`, `.rb-admin-field`, optional `.rb-admin-field-grow`; labelled `.form-control` / `.form-select` inputs |
| Empty state | `.rb-admin-empty` with icon, `h3`, explanation and real action buttons |
| Split layout | `.rb-admin-split`, `.rb-admin-section-rail`, `.rb-admin-split-main`, optional `.rb-admin-split-side`; rail links use `aria-current` |
| Form section | `.rb-admin-form-section`, `.rb-admin-form-section-header`, `.rb-admin-form-section-body`, `.rb-admin-form-grid`, `.rb-admin-hint` |
| Collapsible section | Native `details.rb-admin-form-section > summary.rb-admin-form-section-header`; include the collapsed summary as translated text |
| Switch in header | Bootstrap `.form-check.form-switch` with labelled `.form-check-input` in `.rb-admin-form-section-header` |
| Sticky save bar | `.rb-admin-save-bar`, `.rb-admin-save-state`, `.rb-admin-page-actions`; app owns dirty state, discard and save logic |
| Chips / segments | `.rb-admin-chip`, `.rb-admin-segmented` with real buttons and `aria-pressed` |
| Overview tiles | `.rb-admin-tile-grid`, `.rb-admin-tile`, `.rb-admin-tile-header`, `.rb-admin-tile-icon`; headings and list links |

Legacy `.btn-info`, `.btn-default` and `.btn-secondary` become neutral outlines within admin. Submit
buttons lose the portal's uppercase transform and use the primary token; use sentence-case labels in
translations. Existing app-specific CSS can still override global rules: later phases should remove
conflicting local styles while adopting the kit. A temporary tablet compatibility rule resets the
legacy Users toolbar's vertical flex basis to avoid a 320px blank gap; remove it when that app adopts
`.rb-admin-filter-bar`. Body-appended modals need a `.rb-admin` scope on their
content wrapper to inherit the kit; use `.admin-layout` only on the actual shell. Give icon-only actions
translated accessible names, keep visible focus, and use real inputs for switches (not the mock's
purely decorative `<i>`).

### Navigation and overview data

`DEFAULT_ADMIN_SIDEBAR_CONFIG` in `AdminSidebarConfig.ts` is the single default used by both
`brandingConfigurationDefaults.config.ts` and the app-config editor fallback. The existing schema
supports the six sections and all new routes without changes; role rules and custom external/footer
links remain supported. The sidebar renders all visible sections expanded; `defaultExpanded` is
retained in storage for compatibility. Legacy header title/icon values also remain in the editor
schema and storage; the live navigation now begins with Overview. Its nonce-bearing filter hides unmatched links and empty
sections, matching translated labels and section names. It announces an empty result and restores
all links when cleared. `NavigationService` resolves active links, including individual app-configs
and the Reports link on report-detail pages.

Home tiles use the **same resolved, role-filtered sections and links** as the sidebar, rather than
maintaining another navigation list. The default section IDs select translated descriptions and icons
in `home.ejs`; custom section IDs get a generic icon and their configured title. Saved footer links
also remain accessible from the overview. Brands with a saved `adminSidebar` override **keep that
saved layout**; there is no automatic migration or reset. No count queries were added: the admin-home
request has no aggregate counts, so the overview uses the supported navigation data only. Attention
lists, integration state and sidebar status tags remain in `DEFERRED.md`.

### Verification

Run core compilation (`npm run compile:core`), global asset compilation (`npm run webpack`), translation
validation (`npm run test:translations`) and core unit tests (`npm run test:core`) sequentially. EJS-only
changes need a portal restart; this phase changes core and global styles too. Restart the mounted
portal after rebuilding and wait until healthy. No Angular app source changes are required for the
foundation. Focused core tests cover route highlighting, role visibility, saved layout preservation,
schema storage compatibility, translated filtering, tile/link parity and safe header rendering.

On memory-constrained development hosts, use `REDBOX_ASSET_MODE=development` with Webpack,
limit minimizer workers, and allow a 3 GB Node heap. The default production asset mode can exceed
a 2 GB heap. Screenshot tooling should use the running container's configured `appUrl` origin
(`REDBOX_BASE` for the shared capture script); an origin mismatch causes existing Angular API calls
to fail under `connect-src 'self'`. The translation app currently renders the full bundle in one table,
so its full-page screenshots can be very tall; use an additional viewport capture for review.
