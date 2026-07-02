# Plan: View Record-Audit from the Form App (side button → modal)

## Context

Users editing/viewing a record in the form Angular app currently have no in-place
way to see the record's audit trail. The record-audit app already exists, but only
as a separate page at `/{branding}/{portal}/record/viewAudit/{oid}`, requiring users
to navigate away from the form.

We want a **side button** (mirroring the existing form "Debug" launch button) that
opens the **record-audit application inside a modal dialog**, without leaving the
form. The button should appear by default only for **Admin** and **Librarians**
roles (configurable), and only for **saved records** (an `oid` exists), in both edit
and view modes.

Per the user's decision, the record-audit UI is embedded **natively** (no iframe).
Because `RecordAuditComponent` is today a self-bootstrapping standalone app, the
cleanest way to share it with the form app is to relocate it into the shared
`portal-ng-common` library that both apps already depend on.

## Approach

### Phase 1 — Make `RecordAuditComponent` reusable (in `portal-ng-common`)

Move the component out of the standalone app into the shared library so both the
existing `/viewAudit` page and the form app can render it.

1. **Relocate component files** into the lib, e.g.
   `angular/projects/researchdatabox/portal-ng-common/src/lib/record-audit/`:
   - `record-audit.component.ts` / `.html` / `.scss` (moved from
     `angular/projects/researchdatabox/record-audit/src/app/`)
   - Move/adapt `record-audit.component.spec.ts` alongside it.
2. **Add a `RecordAuditModule`** in the lib that declares + **exports**
   `RecordAuditComponent`, importing only `CommonModule`, `FormsModule`, and the
   i18next module (mirror how other lib components pull in `| i18next`). Do **not**
   import `BrowserModule` or provide `APP_BASE_HREF` here, and do **not** set
   `bootstrap` — those belong only to the root app.
3. **Export** `RecordAuditComponent` / `RecordAuditModule` from the library
   public API (`portal-ng-common/src/public-api.ts` or equivalent index).
4. **Convert inputs to bindings with attribute fallback.** Replace the
   `ElementRef.getAttribute(...)` reads in the constructor with `model<string>('')`
   (oid/branding/portal) and `model<boolean>(false)` (isAdmin), then in init fall
   back to `elementRef.nativeElement.getAttribute(...)` when the input is empty —
   exactly the pattern already used in
   [form.component.ts:345-364](angular/projects/researchdatabox/form/src/app/form.component.ts#L345-L364).
   This keeps the standalone app (which sets HTML attributes) working unchanged
   while letting the form app pass `[oid]`, `[isAdmin]`, etc.

### Phase 2 — Keep the standalone record-audit app working

The existing `/viewAudit` route and its bundle must keep functioning.

1. In `angular/projects/researchdatabox/record-audit/src/app/record-audit.module.ts`,
   replace the local component declaration with an **import of the lib's
   `RecordAuditModule`**, keep `BrowserModule`, `BrowserAnimationsModule`, the
   `APP_BASE_HREF` provider, and `bootstrap: [RecordAuditComponent]`.
2. `main.ts` (`platformBrowserDynamic().bootstrapModule(...)`) and
   [viewAudit.ejs](views/default/default/record/viewAudit.ejs) stay unchanged —
   attributes (`oid`, `branding`, `portal`, `is-admin`) still flow via the fallback.

### Phase 3 — Form app: launcher button + modal

Create a self-contained launcher in the form app (mirrors the debug button pattern

- the `ConfirmationDialog` modal pattern). New folder:
  `angular/projects/researchdatabox/form/src/app/record-audit/`.

1. **`record-audit-launcher.component.ts`** — single component that renders:
   - A **fixed side button** reusing the debug launch styling
     (`.rb-form-debug-launch` / `--side` in
     [form-debug-panel.component.scss:35-51](angular/projects/researchdatabox/form/src/app/form-debug/form-debug-panel.component.scss#L35-L51));
     give it its own class (e.g. `rb-form-audit-launch`) positioned offset from the
     debug button so they don't overlap, with a z-index just below the debug shell.
   - A **Bootstrap modal** hosting `<record-audit [oid] [branding] [portal]
[isAdmin]>`, copying the modal markup + `cdkTrapFocus` from
     [confirmation-dialog.component.ts](angular/projects/researchdatabox/form/src/app/component/confirmation-dialog.component.ts)
     (use a large modal, e.g. `modal-dialog modal-xl modal-dialog-scrollable`).
   - Internal `open` signal toggled by the button / close button / Esc.
2. **Role + visibility gating** via `UserService.getInfo()`, copying the resolution
   pattern in
   [integration-status.component.ts:227-296](angular/projects/researchdatabox/form/src/app/component/integration-status.component.ts#L227-L296):
   - `canView` signal = user has any of the allowed roles.
   - Allowed roles input defaults to `['Admin','Librarians']`, overridable via form
     config (see Phase 4). Use exact role names `Admin` and `Librarians` (from
     [auth.config.ts](packages/redbox-core/src/config/auth.config.ts)).
   - Compute `isAdmin` from roles (Admin only) to pass through — librarians then see
     only the audit-history tab, matching the backend's admin-only gating on the
     permissions / integration-audit endpoints.
   - Button only renders when `canView()` **and** the form `oid` is non-empty.
3. **Register** the new component (and lib `RecordAuditModule`) in
   [form.module.ts](angular/projects/researchdatabox/form/src/app/form.module.ts)
   (declarations + imports).
4. **Add to the form shell** in
   [form.component.html](angular/projects/researchdatabox/form/src/app/form.component.html)
   next to the debug panel / confirmation dialog (around line 13-17), passing the
   form's `oid`, `branding`, `portal` signals and the configured roles.

### Phase 4 — Configurability

- The launcher's allowed-roles input defaults to `['Admin','Librarians']`.
- Source an override from the form config (e.g. a top-level `viewAuditRoles` on the
  form's config frame) read in `form.component.ts` and bound into the launcher;
  default applied when absent. Mirrors the `technicalDetailRoles` convention in
  integration-status.

## Critical files

| File                                                           | Change                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| `portal-ng-common/src/lib/record-audit/*`                      | New home for component + new `RecordAuditModule` (exported) |
| `portal-ng-common` public API index                            | Export component/module                                     |
| `record-audit/src/app/record-audit.module.ts`                  | Import lib module; keep Browser/bootstrap/APP_BASE_HREF     |
| `form/src/app/record-audit/record-audit-launcher.component.ts` | New: side button + modal + role gating                      |
| `form/src/app/form.module.ts`                                  | Declare launcher, import lib `RecordAuditModule`            |
| `form/src/app/form.component.html`                             | Render `<record-audit-launcher>`                            |
| `form/src/app/form.component.ts`                               | Pass oid/branding/portal + roles from form config           |

## Reuse notes

- Role resolution: copy from `integration-status.component.ts` (UserService pattern).
- Modal markup + focus trap: copy from `confirmation-dialog.component.ts`.
- Side button styling: copy from `form-debug-panel.component.scss`.
- Audit data fetching is unchanged — handled inside `RecordAuditComponent` via
  `RecordService.getRecordAuditTab/...` (already in portal-ng-common).

## Risks / verify during implementation

- **i18n keys**: `RecordAuditComponent` uses `| i18next` keys. Confirm those keys
  resolve in the form app's translation context (both use the shared
  `TranslationService` hitting the same locale backend — verify in-browser the modal
  shows translated labels, not raw keys).
- **Style bleed**: component SCSS is view-encapsulated, but confirm Bootstrap-based
  layout inside the modal renders correctly (form app already ships Bootstrap).
- **Button overlap**: ensure the audit side button and debug side button don't sit
  on top of each other when debug mode is enabled (offset vertical position / z-index).

## Verification

1. **Build**: `cd angular && npm run build` (or the project-specific build) for the
   library, `record-audit`, and `form` projects — all compile.
2. **Standalone regression**: load `/{branding}/{portal}/record/viewAudit/{oid}` and
   confirm the audit page still works (attribute fallback intact).
3. **Form embed (Admin)**: log in as Admin (use redbox-dev-login-browser), open a
   saved record's edit form, confirm the side "Audit" button appears, click it, and
   the modal shows the record-audit app with all tabs; close via button + Esc.
4. **Form embed (Librarian)**: confirm button appears; modal shows audit history tab
   (admin-only tabs hidden / 403-gated as expected).
5. **Researcher / standard user**: confirm the button does **not** appear.
6. **New record**: confirm the button is hidden when there is no `oid`.
7. **Unit tests**: update/move `record-audit.component.spec.ts`; add a spec for the
   launcher covering role gating (Admin/Librarian show, Researcher hide) and
   open/close. Run the form app's test suite.
