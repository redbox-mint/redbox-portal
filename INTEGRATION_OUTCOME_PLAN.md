# Researcher-Facing Outcome View for IntegrationStatusComponent

## Context

The existing IntegrationStatusComponent (see INTEGRATION_STATUS_PLAN.md) is admin/librarian-oriented: it exposes implementation details ("DOI (DataCite)", "Success", timestamps, execution time). Researchers ask outcome questions — "Do I have a DOI yet? Is it active? Has my data been deposited to Figshare?" This change adds a researcher-facing "External services" outcome summary as the default view, while Admin/Librarian users additionally get the existing technical detail rows behind an expandable "Technical details" toggle.

**Agreed decisions (do not relitigate):**

- Single component; the authenticated user's roles determine what they see.
- Technical details: **Admin/Librarian only** (config-driven role list, default `['Admin', 'Librarians']`), gated client-side via `UserService.getInfo()` — the payload is already sanitized so this is UX gating, not security. Server-side `constraints.authorization.allowRoles` strips whole components only, which would force duplicate pollers; deployments can still use it as belt-and-braces in form config without code change.
- **Backend computes outcomes** from audit data + current record state (controller already loads the record).
- v1 scope: **DOI + Figshare** outcomes — but the outcome model must be **open-ended**, since other integrations (e.g. research storage/compute provisioning) will have states that don't fit a DOI/Figshare-shaped enum. Hence: structured `{ state, severity, labelKey, helpKey }` outcomes with per-integration backend mappers; the frontend renders generically from severity + i18n keys.

**Verified facts (load-bearing):**

- The DataCite `event` ('draft'|'publish') is stored in audit `requestSummary` (`DoiService.publishV2Doi`, packages/redbox-core/src/services/DoiService.ts:289-296) — NOT exposed by the current sanitized summary. `extractKeyResult` runs at read time on stored rows, so whitelisting `event` works retroactively, no migration.
- Figshare audits: `syncRecordWithFigshare` writes `responseSummary.{articleId, publishResult, ...}` (FigshareService.ts:413-426); `publishAfterUploadFilesJob` writes `{articleId, correlationId, publishResult}`; a "rescheduled" success path has NO `publishResult`.
- `RecordAuditController.getIntegrationStatusData` (RecordAuditController.ts:503-541) loads the record but doesn't use it in the response; it declares a local `IntegrationAuditService` interface at line ~57.
- `UserService` is provided by `RedboxPortalCoreModule`, which form.module.ts already imports (line 135). **Critical:** `UserController.info` returns `{ user: {...} }` (UserController.ts:150-154) despite `getInfo(): Promise<User>` typing — the component must unwrap `(res as any)?.user ?? res`.
- Only `construct.visitor.ts` enumerates config props for this component (lines ~810-814); other visitors handle it generically.
- Default DOI writeback path is `metadata.citation_doi` (`DEFAULT_DOI_CITATION_DOI_PATH`, brandingConfigurationDefaults.config.ts:425) but is brand-configurable — v1 hardcodes the default (known limitation).

## Phase 1 — Backend: IntegrationAuditService

File: `packages/redbox-core/src/services/IntegrationAuditService.ts`

1. **Types** (near the existing `IntegrationStatusSummary` at ~line 68). The outcome is a **structured, open-ended object** — not a closed enum — so future integrations (e.g. research storage/compute provisioning) can define their own states without touching the contract or the frontend:

   ```ts
   // Severity is the small fixed set that drives badge colour/icon generically.
   export type IntegrationOutcomeSeverity = 'none' | 'pending' | 'in-progress' | 'success' | 'warning' | 'error';

   export type IntegrationOutcome = {
     state: string; // machine-readable, integration-specific: 'draft-assigned', 'published', 'deposited', later 'provisioned', 'allocated'…
     severity: IntegrationOutcomeSeverity; // drives presentation only
     labelKey: string; // i18n key, convention: @integration-status-outcome-<integrationName>-<state>
     helpKey?: string; // optional helper-text i18n key
   };

   export type IntegrationStatusRecordContext = { citationDoi?: string; workflowStage?: string };
   // IntegrationStatusSummary gains: outcome?: IntegrationOutcome; synthesized?: boolean;  (additive)
   ```

2. **Extend `extractKeyResult`** (~lines 681-704), keeping the explicit-field-copy convention (never spread):
   - From `requestSummary`: copy `event` only if value is exactly `'draft'` or `'publish'`.
   - From `responseSummary`: if `publishResult` is a non-empty plain object, set `keyResult['figsharePublished'] = true` (and `figsharePublishStatus` if `publishResult.status` is a non-empty string). Do NOT copy the `publishResult` object itself (it has an index signature).
   - Existing `doi` / `data.id` / `articleId` extraction unchanged.

3. **New method `getStatusSummaryWithOutcomes(params, recordContext)`** — do NOT change `getStatusSummary`'s signature (admin viewAudit + existing tests use it). The new method:
   - Calls `getStatusSummary`, then sets `summary.outcome` via a **per-integration mapper registry** and backfills `keyResult.doi` from `ctx.citationDoi` for doi rows in draft-assigned/published states with no doi yet.
   - **Synthesis rule:** every integration name explicitly requested via `params.integrationName` that has zero audit rows gets a synthesized row (so the researcher always gets an answer, incl. legacy records): `{ integrationName, status: 'none', startedAt: '', traceId: 'synthetic:<name>', synthesized: true }` — `status: 'none'` never triggers polling. For doi with `ctx.citationDoi` present: `keyResult = { doi }` and state `published` (stage published/embargoed) or `draft-assigned`; otherwise state `none`. Only synthesize for names with a registered mapper. No `integrationName` filter ⇒ behaviour unchanged.
   - Add to `_exportedMethods`.

4. **Outcome mapper registry** — extensibility is the point (future provisioning integrations like research storage/compute define their own states):

   ```ts
   type OutcomeMapper = (summary: IntegrationStatusSummary, ctx: IntegrationStatusRecordContext) => IntegrationOutcome | undefined;
   private readonly outcomeMappers: Record<string, OutcomeMapper> = {
     doi: (s, ctx) => this.mapDoiOutcome(s, ctx),
     figshare: (s, ctx) => this.mapFigshareOutcome(s, ctx),
   };
   ```

   A helper builds the outcome object so mappers stay one-liners per state:
   `makeOutcome(name, state, severity, withHelp?)` → `{ state, severity, labelKey: '@integration-status-outcome-<name>-<state>', helpKey: withHelp ? '@integration-status-outcome-<name>-<state>-help' : undefined }`.
   Adding a new integration later = one mapper entry + i18n keys; **no contract or frontend change**. Unknown integration names: `outcome` undefined (frontend falls back to the existing status badge row).

   **DOI mapper** (first match wins) — inputs: audit status, `keyResult.event`, doi known (`keyResult.doi` or `ctx.citationDoi`), `ctx.workflowStage`:
   | audit status | event | doi known | stage | state | severity |
   |---|---|---|---|---|---|
   | started | any | any | any | in-progress | in-progress |
   | failed | any | any | any | error | error (helpKey: generic error help) |
   | success | publish | any | any | published | success |
   | success | draft | any | any | draft-assigned | pending (helpKey: draft help) |
   | success | missing | yes | published/embargoed | published | success |
   | success | missing | yes | other | draft-assigned | pending |
   | success | missing | no | any | none | none |

   **Figshare mapper** — started→`in-progress`/in-progress; failed→`error`/error; success + `figsharePublished===true`→`published`/success; success otherwise (incl. rescheduled/metadata-only)→`deposited`/success.

   Helper `isPublishedStage(stage)` = lowercase stage in `['published','embargoed']`; unknown stages with a DOI degrade safely to draft-assigned (comment this).

Sanitization guarantees preserved: outcomes are derived; keyResult additions are strict value whitelists; no `errorDetail`/`requestSummary`/`responseSummary`/`httpStatusCode` exposure.

## Phase 2 — Backend: RecordAuditController

File: `packages/redbox-core/src/controllers/RecordAuditController.ts`

- Extend the local ambient `IntegrationAuditService` interface (~line 57) with `getStatusSummaryWithOutcomes`.
- In `getIntegrationStatusData` (~503-541), after the edit-access check, build context by explicit field copy and swap the call:
  ```ts
  const recordContext: IntegrationStatusRecordContext = {
    citationDoi: <trimmed string or undefined>(_.get(record, 'metadata.citation_doi')),
    workflowStage: <trimmed string or undefined>(_.get(record, 'workflow.stage')),
  };
  const integrations = await IntegrationAuditService.getStatusSummaryWithOutcomes(params, recordContext);
  ```
- Code comment: brands overriding `doiPublishing.writeBack.citationDoiPath` need the path resolved from brand config (follow-up).
- Response envelope `{ data: { integrations } }` unchanged — purely additive fields. No role logic server-side.

## Phase 3 — sails-ng-common config contract

Minimal new prop: **only `technicalDetailRoles?: string[]`** (no `displayMode` — view is role-driven; `heading` already exists).

- `packages/sails-ng-common/src/config/component/integration-status.outline.ts` — add `technicalDetailRoles?: string[];` to the config frame.
- `packages/sails-ng-common/src/config/component/integration-status.model.ts` — `technicalDetailRoles: string[] = ['Admin', 'Librarians'];`.
- `packages/redbox-core/src/visitor/construct.visitor.ts` (~line 813) — add `this.sharedProps.setPropOverride('technicalDetailRoles', item.config, config);`. No other visitor changes needed (verified generic handling).

## Phase 4 — portal-ng-common types

File: `angular/projects/researchdatabox/portal-ng-common/src/lib/record.service.ts` (~lines 170-185): add `IntegrationOutcomeSeverity` and `IntegrationOutcome` (`{ state: string; severity: ...; labelKey: string; helpKey?: string }`) mirroring the backend types; `IntegrationStatusItem` gains `outcome?: IntegrationOutcome; synthesized?: boolean;`. No method changes.

## Phase 5 — Angular component

File: `angular/projects/researchdatabox/form/src/app/component/integration-status.component.ts`

1. **Role resolution**: inject `UserService`; new signals `canSeeTechnicalDetails = signal(false)`, `technicalOpen = signal(false)`. Resolve once (fire-and-forget from constructor): `await userService.waitForInit()`, then `getInfo()`, unwrap `(res as any)?.user ?? res`, match `roles[].name` against config getter `technicalDetailRoles` (default `['Admin','Librarians']`). Any failure ⇒ `false` (fail closed to researcher view, no error state).

2. **Template — single card, two zones**:
   - **Outcome summary (always rendered, replaces technical rows as default body)**. The rendering is **integration-agnostic**: per item it uses only the structured outcome — badge class/icon from `outcome.severity` (`severityBadgeClass`: none→secondary, pending→warning, in-progress→info, success→success, warning→warning, error→danger), label `{{ item.outcome.labelKey | i18next }}`, helper text `@if (item.outcome.helpKey)`. Identifier rendering stays generic via `keyResult`: `keyResult.doi` as `https://doi.org/...` link (when severity is not error/none), `keyResult.articleId` as text. Researchers see only the helper text on error — the raw `message` moves into the technical section. Items with `outcome === undefined` fall back to the existing status badge row. New integrations need zero changes here.
   - **Technical details (gated)**: `@if (canSeeTechnicalDetails())` renders a toggle button (signal-based, no Bootstrap JS; `[attr.aria-expanded]`, `aria-controls`) revealing the existing technical rows verbatim (badge/timestamps/durationMs/keyResult/message). Exclude `synthesized` rows (no audit behind them). `track item.traceId` still works (`synthetic:doi`).
   - **Keep untouched**: polling/grace logic, FORM_SAVE_SUCCESS effect, `timestampText`, `aria-live` semantics, empty state.

3. Register nothing new — component is already wired in form.module.ts and static-comp-field.dictionary.ts.

## Phase 6 — i18n keys

File: `language-defaults/en/translation.json` (additive):

```
"@external-services-heading": "External services",
"@integration-status-technical-toggle": "Technical details",
"@integration-status-outcome-doi-none": "No DOI yet",
"@integration-status-outcome-doi-in-progress": "DOI being created",
"@integration-status-outcome-doi-draft-assigned": "Draft DOI assigned",
"@integration-status-outcome-doi-draft-assigned-help": "Your draft DOI will become active when the record is published.",
"@integration-status-outcome-doi-published": "DOI active",
"@integration-status-outcome-doi-error": "DOI request had a problem",
"@integration-status-outcome-figshare-none": "Not yet sent to Figshare",
"@integration-status-outcome-figshare-in-progress": "Depositing to Figshare",
"@integration-status-outcome-figshare-deposited": "Deposited to Figshare",
"@integration-status-outcome-figshare-published": "Published on Figshare",
"@integration-status-outcome-figshare-error": "Figshare deposit had a problem",
"@integration-status-outcome-doi-error-help": "The system will retry, or your data librarian has been notified. No action is needed from you.",
"@integration-status-outcome-figshare-error-help": "The system will retry, or your data librarian has been notified. No action is needed from you."
```

Keys follow the `@integration-status-outcome-<integrationName>-<state>[-help]` convention generated by `makeOutcome` — future integrations just add their own keys. Default heading key stays `@integration-status-heading`; deployments opt into `@external-services-heading` via the `heading` config prop.

## Phase 7 — Tests

**Mocha** `test/integration/services/IntegrationAuditService.test.ts` (follow existing seed conventions, ~lines 278-350):

1. doi success + requestSummary `{event:'publish'}` → `outcome.state === 'published'`, `severity === 'success'`, `labelKey === '@integration-status-outcome-doi-published'`, `keyResult.event === 'publish'`.
2. doi success + `{event:'draft'}` → state `draft-assigned`, severity `pending`, helpKey set.
3. doi success, no event, ctx `{citationDoi, workflowStage:'published'}` → state `published`; stage `draft` → `draft-assigned`.
4. figshare success with `publishResult:{id,status}` → state `published`, `keyResult.figsharePublished === true`.
5. figshare success without publishResult (rescheduled shape) → state `deposited`.
6. Legacy: zero rows + `integrationName='doi,figshare'` + ctx `{citationDoi, workflowStage:'queued'}` → synthesized doi row (`synthesized:true`, state `draft-assigned`, `keyResult.doi`, `traceId:'synthetic:doi'`, status never `'started'`) and figshare row state `none`.
7. Sanitization: extend existing case — no `errorDetail`/`requestSummary`/`responseSummary`; keyResult keys ⊆ `['doi','articleId','event','figsharePublished','figsharePublishStatus']` even when requestSummary holds `requestBody`/`profile`.

**Angular spec** `integration-status.component.spec.ts`: add mock `UserService` (spy with `getInfo`, `waitForInit`) to providers; all existing cases must still pass with researcher roles. New cases: outcome badge + helper per state; DOI link for draft-assigned/published; technical toggle hidden for `['Researcher']`, shown for both `{user:{roles:[{name:'Admin'}]}}` wrapper and bare shapes; custom `technicalDetailRoles` respected; collapse toggle sets `aria-expanded` and reveals rows; `getInfo` rejection → researcher view, no error; synthesized row excluded from technical rows; synthesized `status:'none'` does not start polling.

**Bruno** `test/bruno/2 - AJAX calls/1 - Admin User Tests/Get record integration status data.bru`: extend assertions for the additive `outcome` field; Unauthorised test unchanged.

## Phase 8 — Sample form-config snippet (JCU hook repo, separate)

```ts
{ name: "integration_status",
  component: { class: "IntegrationStatusComponent",
    config: { heading: "@external-services-heading",
      integrationNames: ["doi", "figshare"],
      pollIntervalMs: 5000, maxPollAttempts: 60,
      technicalDetailRoles: ["Admin", "Librarians"] } } }
```

## Verification (dev env, per INTEGRATION_STATUS_PLAN.md Phase 6 conventions)

1. Rebuild `packages/sails-ng-common` then `packages/redbox-core` (`npm run build`) + container restart.
2. Frontend: `<portal>/support/development/compileDevAngular.sh form` (portal-ng-common type change is picked up by the same compile; page reload only).
3. Patch baked translations in container: `/opt/redbox-portal/.tmp/public/locales/en/translation.json` + `assets/locales/...`.
4. Flow tests: researcher user — create Data Publication → queued → save → "DOI being created" → "Draft DOI assigned" + helper, no Technical details toggle. Admin — same record shows toggle revealing timestamps/duration. Legacy record with `citation_doi` set and no audits → synthesized outcomes. Failure path (bad DataCite creds) → researcher sees generic error help; raw message only in technical section; payload has no `errorDetail`.
5. Curl: `GET /default/rdmp/record/integrationStatus/<oid>?integrationName=doi,figshare` — `outcome`/`synthesized`/`keyResult.event` present; nothing from `requestBody` leaks.

## Risks / known limitations

1. **Audit-vs-writeback timing**: audit `event` gives the correct outcome immediately; each poll reloads the record so record-derived fallbacks converge; synthesized rows appear only with zero audit rows — no source flicker.
2. **Workflow stage variance**: only `published`/`embargoed` count as active; unknown stages with a DOI degrade to draft-assigned.
3. **`citationDoiPath` is brand-configurable**; v1 hardcodes `metadata.citation_doi` — custom-path brands get `none` synthesis for legacy records (documented follow-up).
4. **`getInfo()` wrapper shape** handled defensively; anonymous/failure ⇒ researcher view.
5. All additions are optional fields / new method — no breaking change to `getStatusSummary`, the response envelope, Bruno tests, or the admin viewAudit path.
6. **Extensibility check**: a future "research storage provisioning" integration needs only (a) its audit rows, (b) one entry in `outcomeMappers` producing e.g. `{ state: 'provisioned', severity: 'success', labelKey: '@integration-status-outcome-storage-provisioned' }`, (c) i18n keys, (d) optionally a label in `integrationLabel` and a keyResult whitelist entry. No contract, dictionary, visitor, or component changes.
