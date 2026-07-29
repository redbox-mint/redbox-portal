# Integration Status Widget + Non-blocking DOI Triggers — Implementation Plan

## Context

Record save hooks (onCreate/onUpdate pre/post triggers) call third-party services — notably DataCite Fabrica DOI minting via `sails.services.doiservice.publishDoiTriggerSync` in [src/config/datapublication-recordtype.ts](src/config/datapublication-recordtype.ts). When DataCite is down or misconfigured, these **synchronous** triggers fail the user's save. Failures are recorded in the existing `IntegrationAuditService` (status `started`/`success`/`failed`, messages, trace grouping) but are only visible to brand admins via the `viewAudit` integration tab.

Agreed scope (user decisions):
1. **Reusable form component in core** (redbox-portal, developed via core-mount) showing per-integration status on the record form, with AJAX refresh + polling while in-flight. JCU hook just adds it to form config.
2. **DOI triggers become non-blocking** — queued via the existing Agenda `queueTriggerCall` pattern.
3. **New endpoint, edit-access, sanitized** — status/timestamps/message/key result only; no `errorDetail`/`requestSummary`/`responseSummary`/`httpStatusCode` (full detail stays admin-only on existing `viewAudit` endpoint, which is `isBrandAdmin`-gated).
4. **No retry button in v1.** Display-only.

## Verified mechanics (load-bearing)

- `RDMPService.queueTriggerCall` evaluates `options.triggerCondition` at queue time, enqueues `{oid, record, triggerConfiguration, user}` under `options.jobName`; `queuedTriggerSubscriptionHandler` calls `triggerConfiguration.function` as `fn(oid, record, triggerConfiguration.options, user)`.
- `CoreService.metTriggerCondition` returns `"false"` when `triggerCondition` is empty **unless `forceRun: true`** — so the inner `triggerConfiguration.options` MUST carry `forceRun: true` (condition was already evaluated at queue time).
- `DoiService.publishDoiTrigger` is the async mint variant: gates on condition, mints, `addDoiDataToRecord`, persists via `RecordsService.updateMeta`, writes start/complete/fail audits. Hardcodes `BrandingService.getBrand('default')` — fine for JCU (default brand); flag for future core fix.
- There is no async `updateDoiTrigger`; `updateDoiTriggerSync` is safe to queue (promise-returning, audited, no record writeback, extra `user` arg ignored).
- Form component config contracts live in `packages/sails-ng-common/src/config/component/` with concrete visitors in `packages/redbox-core/src/visitor/` — `save-status.{outline,model}.ts` + `SaveStatusComponent` is the canonical model-less template to mirror.

## Implementation phases

### Phase 1 — Core backend (redbox-portal)

**Location: redbox-portal repo (core-mount), requires rebuild + container restart**

1. **`packages/redbox-core/src/services/IntegrationAuditService.ts`** — add `getStatusSummary(params: IntegrationAuditParams)`: reuse the `getTraceAuditLog` internals (rows → group by traceId → `buildTraceRecord`), group traces by `integrationName`, pick latest per integration (`getRowSortTimestamp`), map by **explicit field copy** (never spread) to:
   ```ts
   { integrationName, status, integrationAction?, startedAt, completedAt?, durationMs?, message?, keyResult?, traceId }
   ```
   `keyResult` via hardcoded whitelist (e.g. `doi` from `responseSummary.doi` — verify actual shape in dev; omit gracefully if absent). Add to `_exportedMethods`.

2. **`packages/redbox-core/src/controllers/RecordAuditController.ts`** — add `getIntegrationStatusData(req, res)`: validate oid, `getRecordOrSendNotFound`, then **edit-access check** (add `hasEditAccess` helper mirroring RecordController.ts:521 — `recordsService.hasEditAccess(brand, user, user.roles, record)`), 403 `{code: 'view-error-no-permissions'}` otherwise. Optional `integrationName` query param. Respond `sendResp(req, res, {data: {integrations}})`. Add to `_exportedMethods` + extend the ambient `IntegrationAuditService` declaration.

3. **`packages/redbox-core/src/config/routes.config.ts`** (~line 230) — add route:
   ```ts
   'get /:branding/:portal/record/integrationStatus/:oid': 'RecordAuditController.getIntegrationStatusData'
   ```
   (deliberately outside the admin `viewAudit` namespace). No auth.config change needed — per-record authz is in-controller, matching convention.

### Phase 2 — sails-ng-common contract + visitors (mirror save-status)

**Location: redbox-portal repo, packages/sails-ng-common, requires rebuild + container restart**

4. New files:
   - `packages/sails-ng-common/src/config/component/integration-status.outline.ts` 
   - `packages/sails-ng-common/src/config/component/integration-status.model.ts`
   
   `IntegrationStatusComponentName = "IntegrationStatusComponent"`, config frame:
   ```ts
   { integrationNames?: string[];  // filter; undefined = all
     pollIntervalMs?: number;      // default 5000
     maxPollAttempts?: number;     // default 60
     heading?: string }            // i18n key
   ```
   model-less (`model?: never`), structural copy of `save-status.{outline,model}.ts` including `accept(visitor)` methods.

5. Register in:
   - `packages/sails-ng-common/src/config/dictionary.outline.ts` (`AllTypes`)
   - `packages/sails-ng-common/src/config/dictionary.model.ts` (`AllDefs`, `RawDefaults`)
   - `packages/sails-ng-common/src/index.ts` exports
   - `visitor/base.outline.ts` + `visitor/base.model.ts` declarations

6. Concrete visitors in `packages/redbox-core/src/visitor/` — `construct`, `client`, `template`, `data-value`, `json-type-def`, `validator`, `migrate-config-v4-v5`, `context-variables` — mostly pass-through stubs mirroring SaveStatus; compiler errors after step 5 enumerate them.

### Phase 3 — Angular (core)

**Location: redbox-portal repo, angular projects, form and portal-ng-common. Form changes only need recompile, no container restart.**

7. **`angular/projects/researchdatabox/portal-ng-common/src/lib/record.service.ts`** — add method and interfaces:
   ```ts
   public async getRecordIntegrationStatus(oid: string, opts: { integrationName?: string } = {}): Promise<IntegrationStatusResponse>
   ```
   Copy the `getRecordIntegrationAuditTab` pattern (line 320).

8. **New `angular/projects/researchdatabox/form/src/app/component/integration-status.component.ts`** — `extends FormFieldBaseComponent<undefined>`, signal-based:
   - oid from `this.formComponent?.oid()`; config from `this.componentDefinition?.config`.
   - Initial fetch on `FORM_DEFINITION_READY` (one-shot) when oid non-empty; refresh on `FORM_SAVE_SUCCESS` with ~1.5s delay (audit writes are agenda-queued).
   - Poll at `pollIntervalMs` while any item is `started` (or during post-save grace window), stop on all-terminal or `maxPollAttempts`; clear timer in `ngOnDestroy`.
   - Render per-integration bootstrap badge rows, i18next keys, `keyResult.doi` as link, `aria-live="polite"`.
   - Register in `form.module.ts` declarations + `static-comp-field.dictionary.ts` component map (no model map entry).

9. **`language-defaults/en/translation.json`** — add i18n keys:
   - `@integration-status-heading`
   - `@integration-status-started`
   - `@integration-status-success`
   - `@integration-status-failed`
   - `@integration-status-empty`
   - `@integration-status-name-doi`
   - `@integration-status-name-figshare`

### Phase 4 — JCU hook (this repo)

**Location: redbox-hook-jcu, no rebuilds needed if form-config is used (just restart app)**

10. **`src/config/agendaQueue.ts`** — add job definitions (mirror `PDFService-CreatePDF`):
    ```ts
    { name: 'DoiService-PublishDoi', fnName: 'rdmpservice.queuedTriggerSubscriptionHandler',
      options: { lockLifetime: 120000, lockLimit: 1, concurrency: 1 } },
    { name: 'DoiService-UpdateDoi', fnName: 'rdmpservice.queuedTriggerSubscriptionHandler',
      options: { lockLifetime: 120000, lockLimit: 1, concurrency: 1 } }
    ```

11. **`src/config/datapublication-recordtype.ts`** — replace the **four** sync DOI entries (onCreate.pre lines 84–90, onUpdate.pre lines 184–190, 192–199, 201–208) with queued `rdmpservice.queueTriggerCall` entries in the corresponding **post** arrays (oid guaranteed, user save already succeeded). Keep each existing `triggerCondition` at the queue level; inner config:
    ```ts
    // Mint (onCreate.post and onUpdate.post when no DOI yet and queued):
    { function: 'sails.services.rdmpservice.queueTriggerCall',
      options: {
        jobName: 'DoiService-PublishDoi',
        triggerCondition: "<%= (record.metadata.citation_doi == null || record.metadata.citation_doi == '') && (record.metadata.requestIdentifier != null && record.metadata.requestIdentifier.indexOf('request') != -1) && (_.isEqual(record.workflow.stage, 'queued')) %>",
        triggerConfiguration: {
          function: 'sails.services.doiservice.publishDoiTrigger',
          options: { forceRun: true, event: 'draft' }
        }
      }
    },
    
    // Update while queued (onUpdate.post):
    { function: 'sails.services.rdmpservice.queueTriggerCall',
      options: {
        jobName: 'DoiService-UpdateDoi',
        triggerCondition: "<%= (record.metadata.citation_doi != null && record.metadata.citation_doi != '') && (record.metadata.requestIdentifier != null && record.metadata.requestIdentifier.indexOf('request') != -1) && (_.isEqual(record.workflow.stage, 'queued')) %>",
        triggerConfiguration: {
          function: 'sails.services.doiservice.updateDoiTriggerSync',
          options: { forceRun: true, event: 'draft' }
        }
      }
    },
    
    // Update + publish (onUpdate.post when DOI exists and published):
    { function: 'sails.services.rdmpservice.queueTriggerCall',
      options: {
        jobName: 'DoiService-UpdateDoi',
        triggerCondition: "<%= (record.metadata.citation_doi != null && record.metadata.citation_doi != '') && (record.metadata.requestIdentifier != null && record.metadata.requestIdentifier.indexOf('request') != -1) && (_.isEqual(record.workflow.stage, 'published')) %>",
        triggerConfiguration: {
          function: 'sails.services.doiservice.updateDoiTriggerSync',
          options: { forceRun: true, event: 'publish' }
        }
      }
    }
    ```

12. **`src/form-config/dataPublication-1.0-common.ts`** — add next to the `save_status` entry (~line 4119):
    ```ts
    { name: "integration_status",
      component: { class: "IntegrationStatusComponent",
        config: { integrationNames: ["doi"], pollIntervalMs: 5000, maxPollAttempts: 60 } } }
    ```

### Phase 5 — Tests

13. **Mocha (core)** `test/integration/services/IntegrationAuditService.test.ts` — seed doi+figshare rows, assert `getStatusSummary` returns latest status per integration and **no** `errorDetail`/`requestSummary`/`responseSummary` properties.

14. **Bruno (core)** — new request under `test/bruno/2 - AJAX calls/` — 200 + `integrations` array for edit user; 403 variant for unauthorized.

15. **Angular spec** `angular/projects/researchdatabox/form/src/app/component/integration-status.component.spec.ts` using `createTestbedModule`/`createFormAndWaitForReady` helpers (cf. `save-status.component.spec.ts`), mocked `RecordService`; cover status rendering, refresh on save-success event, `fakeAsync` polling start/stop, no fetch without oid.

16. **Hook unit test** under `test/unit/config/` asserting `datapublication-recordtype` no longer references `*DoiTriggerSync` directly as a trigger function and `agendaQueue` defines both new jobs.

### Phase 6 — End-to-end verification (JCU dev env)

- **Backend**: `npm run dev:run:core` (core-mount points at the portal checkout). Rebuild `packages/sails-ng-common` then `packages/redbox-core` (`npm run build`) + container restart.
- **Form app only**: `<portal>/support/development/compileDevAngular.sh form` — output is mounted, page reload only.
- **Translations** are baked into the image — patch container copies (`/opt/redbox-portal/.tmp/public/locales/en/translation.json` + `assets/locales/...`) for live verification.
- **Flow test**: Login admin/rbadmin at `/default/rdmp/user/login`. Create a Data Publication, set `requestIdentifier` to a request value, transition to `queued`, save → save returns immediately; widget shows DOI `started` → `success`; `citation_doi` populated after the async writeback (and citation regenerated, replacing `{ID_WILL_BE_HERE}`).
- **Failure path**: set invalid DataCite credentials in the brand's doiPublishing config → save still succeeds; widget shows `failed` with human message; confirm network payload contains no `errorDetail`; full detail still on admin `viewAudit` tab.
- **Curl checks**: `GET /default/rdmp/record/integrationStatus/<oid>` — edit user 200, anonymous 403/redirect.

## Known v1 limitations & risks

1. **Queued-but-not-started gap**: no audit row exists until the agenda job starts; widget bridges with a post-save grace poll. Accepted for v1.
2. **DOI writeback re-fires onUpdate triggers** (`updateMeta` defaults `triggerPreSaveTriggers/PostSaveTriggers = true`): (a) `runTemplates` regenerates the citation with the DOI — desirable; (b) the queued update-DOI condition becomes true on the writeback save → one extra idempotent DataCite update per mint. Acceptable; optionally tighten conditions later.
3. `publishDoiTrigger` hardcodes the `default` brand — fine for JCU, note for core.
4. `keyResult.doi` depends on the actual `responseSummary` shape written by `completeDoiAudit` — verify in dev, degrade by omitting.
