# Schema assistance PR 7: UI polish

Branch: `stack/schema-assist-07-ui-polish`, based on PR 6 commit
`aa645c5db`. This PR changes presentation only: markup, styles and four new
English strings. It does not change behaviour, API calls, data shapes,
persisted fields or security-relevant bindings. Report preview display cells
remain bound exactly as `[innerHTML]="cell.untrustedDisplayHtml"`, with no
trust bypass.

## Conventions followed

The reference screens are the email template admin (catalogue and editor), plus
the general admin layout (sidebar, `card panel-style panel-default` page cards).
The named query and report screens now share one set of rules:

| Convention | Source screen | Applied as |
| --- | --- | --- |
| One brand-coloured page card per screen, icon + `h1` title in the header | Email template catalogue and editor | NQ list, report list, both workspaces |
| Back navigation as an outlined header button, `← <list name>` | Email template editor | Both workspace headers (same handler as Cancel) |
| Intro lede under the header, secondary colour, max ~768px | Email template catalogue | NQ list (new string), report list (existing description) |
| Toolbar: search with leading icon (288px), segmented quick filters with counts, primary action at the right | Email template catalogue | NQ list (search + Create), report list (search + source filter + Manage/Create) |
| Plain table: uppercase 12px secondary headers, no fills, outlined `btn-sm` row actions with visually hidden row names | Email template catalogue | NQ list, report list |
| Neutral inner panes (`--bs-tertiary-bg` header, 6px radius) inside the brand card | Email template editor (Template / Preview panes) | Workspace panes, help panel, results, NQ parameter / related-filter cards |
| Underlined tabs | Email template editor | NQ workspace tabs |
| Sticky action footer: status at left; Cancel (outline-secondary), Preview (outline-primary), Save (primary) at right | Email template editor | Both workspaces |
| Diagnostics as tinted rows with icon + bold severity label (not colour alone) | Email template editor diagnostics | Field-level and aggregate diagnostics in both editors |
| Bootstrap 5.3 CSS variables and utilities, px sizes (theme root is 10px) | Theme / email editor | All new styles |

The shared frame is
`angular/projects/researchdatabox/portal-ng-common/src/lib/schema-assist/_admin-workspace.scss`
(`rb-ws-*` classes). Each app's global `styles.scss` includes it with `@use`, so
child components can use the classes.

## Changes by UI

### Shared workspace frame (`_admin-workspace.scss`)

- New partial: page card header, panes, sections, items, diagnostics,
  disclosures, JSON blocks, tables, tabs, counts and the sticky footer.
- Inner pane header and body rules are scoped under `.card.panel-style`. The
  theme colours every nested `.card.panel-style .card-header` with the brand
  colour (specificity 0,3,0), so without the scope the panes were red bars with
  dark titles.
- `.form-select`, `.form-select-sm` and `.form-control-sm` inside `.rb-ws` use
  px sizes that match the theme's 14px `.form-control`. Bootstrap's rem values
  against the 10px root gave 8.75px small selects and 16px selects with 42px
  right padding.
- Panes are spaced with `~`, not `+`, so the report datalists between panes do
  not collapse the gap.

### Named query editor

- List: one brand card ("Named queries") with a lede (new
  `named-query-list-intro`), search with the Create button projected beside it
  (`nqListActions`), success/error alerts inside the card (`nqListAlerts`), a
  plain table, and a footer with shown/total/collections counts
  (`nqListSummary`). Row Edit/Delete are outlined and carry the query name for
  screen readers. The table scroller is `position: relative`, so those
  absolutely positioned hidden labels no longer widen the page on phones.
- Workspace: brand header with title, Unsaved badge, Fields and help toggle and
  a `← Named queries` back button. Underlined tabs with count chips. Neutral
  help and results panes. The help pane has a close button (new
  `named-query-close-help`) and Guidance / Envelope / Metadata sections (new
  `named-query-guidance-heading`). Results split Diagnostics (with a "No
  problems found" state, new `named-query-diagnostics-heading` /
  `named-query-no-diagnostics`) from Preview. Test parameters are bordered
  tiles. Preview tables use the shared table style. Sticky footer actions.
- Sub-editors: condition, sort and mapping tables use fixed layout with classed
  column widths (`nq-col-path|key|choice|actions`), replacing inline widths, so
  type selects and Remove buttons are no longer squeezed. Add rows are dashed
  tiles. Parameter and related-filter cards have neutral headers. Every
  parameter field has a programmatic label (new `id`/`for` pairs), and the
  expand toggles expose `aria-expanded`.
- `nq-typed-value` lays out its control and Unset action as one flex row. The
  theme's Bootstrap 3 `.input-group` rules broke the previous Bootstrap 5 input
  group apart.

### Report editor

- List: the page header, three stat cards and the Bootstrap 3 panel
  (`btn-xs`, `btn-default`, `label`, `pull-*`) became one brand card
  ("Reports"). It has the description as lede, search, an All/Database/Solr
  segmented filter with counts (the former stat-card numbers, with
  `aria-pressed`), Manage named queries and Create report, a plain table with
  outlined row actions naming their report, and a "Showing x of y" footer. The
  report-key link, the Edit button order (`.report-actions button` first) and
  every handler are unchanged.
- Workspace: the same frame as the query editor. Brand header with title and
  report title, Unsaved badge, Fields and help and `← Reports`. Basics, Filters
  and Columns are neutral panes with counts. Filters and columns are item cards
  with headers and actions, plus empty states. The date binding is a tinted
  group. Column options use proper `form-check` labels. Template context help
  sits under each editor. The help pane has close, parameters and an output-field
  picker. Results and diagnostics split Diagnostics (with icons, matching the
  field-level diagnostics) from Preview. Sticky footer actions.

### Email template admin (shared components' host)

- Shared field tree, target selector, path autocomplete and template editor are
  unchanged.
- Catalogue: `.table-responsive` is now `position: relative`. This existing bug
  widened the page to ~843px at 390px, because the hidden template names in the
  row buttons escaped the scroller. Nothing else changed.

### Admin layout mobile rule (`assets/styles/default-theme.scss`)

Below 768px, the stacked layout keeps a 16px gutter on the main content and drops
the side-by-side dividers: no main-content left border, and no sidebar right
border or shadow. The sidebar gains a bottom rule and 16px space below. Admin
home and role management at 390px show the content below the sidebar without
the stray vertical lines (see `other-*` screenshots). The rule is otherwise as
PR 6 left it.

## Verification

Environment, as in PR 6: Node 24.22.1, serial commands under `timeout`,
`mongo:latest` (9.0.4), Compose project `sa07` with the ignored overrides in
`.tmp/schema-assist-07/`. Tailscale `Self.DNSName` was
`nam-oci-agent-2.tail4a7c3.ts.net` and Docker published port 1537.
`REDBOX_PORTAL_APP_URL` / `sails_appUrl` was
`http://nam-oci-agent-2.tail4a7c3.ts.net:1537`. T3 Browser loaded the login page
there, logged in as the development administrator (`Welcome Local Admin`),
opened the named query workspace (focus lands on the heading; landmarks and
labels are announced) and used the header back button to return to the list.

The served `.tmp/public` copy is not rebuilt by the portal. Its webpack step
fails in this worktree because the `redoc` dev dependency is not installed.
Freshly built Angular apps were therefore copied in with `rsync`, and the PR 6
mobile rule in the served `style.min.css` was patched to match the source. Both
are local test-environment steps only.

Final results, run serially, each under `timeout` (Angular specs with the
Docker stack stopped):

| Check | Passed | Failed | Skipped |
| --- | --- | --- | --- |
| `portal-ng-common` Karma specs | 132 | 0 | 0 |
| `email-templates` Karma specs | 232 | 0 | 0 |
| `named-query-editor` Karma specs | 190 | 0 | 0 |
| `report-config` Karma specs | 76 | 0 | 0 |
| Production builds: `portal-ng-common`, `email-templates`, `named-query-editor`, `report-config` | 4 | 0 | 0 |
| Playwright `schema-assisted-editors.spec.ts` | 3 | 0 | 0 |
| Playwright `email-templates.spec.ts` | 14 | 0 | 1 (opt-in screenshot test) |

Builds report only the warning types already present before this PR (initial
bundle budget, and `sails-ng-common` not being ESM). Moving the list layout
rules to the app's global styles keeps `nq-list.component.scss` under its 2 kB
component budget. Only one spec assertion changed: the workspace spec now finds
warning and blocking diagnostics by `.rb-ws-diagnostic-warning` /
`.nq-diagnostic-error` instead of the old `.text-warning` / `.text-danger`, with
the same text expectations. No Playwright selector changed.

## Screenshots

`/tmp/schema-assist-07-screenshots/` holds `before-*` (PR 6) and `after-*`
(this PR) at 1440px (`-desktop`) and 390px (`-narrow`): `nq-list`,
`nq-editor-guidance`, `nq-editor-diagnostics`, `nq-editor-preview`,
`report-list`, `report-editor`, `report-editor-preview`, `email-catalogue`,
`email-editor`, `other-admin-home` and `other-roles`. Captured with
`.tmp/schema-assist-07/capture/` (`CAPTURE_PREFIX=before|after`). Every `after`
narrow page has zero horizontal overflow. Full-page captures show each sticky
footer (and, for the email editor, its existing footer) at the viewport
position, mid-image. That is a capture artefact, not a layout fault. The
`before-other-roles` capture shows only the loader because `manage-roles` was
not built then.

## Deliberately unchanged

- Shared schema-assist components (field tree, target selector, autocomplete,
  template editor) were not restyled. They already follow the email editor,
  and email is their primary host.
- The email template screens, apart from the catalogue overflow fix.
- The report preview "People" cell shows `Ada,GraceAda,Grace` for the capture
  fixture's multivalue template. That is the fixture's template output, not a
  rendering issue.
- No new strings beyond the English defaults. Other languages fall back to
  English for the new keys, as for other recent additions.
- `report-stat-*` strings are still used, as tooltips on the source filter counts.
