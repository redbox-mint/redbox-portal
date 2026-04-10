# Figshare V2 Service Rewrite Plan

## Summary

Implement a new `FigshareV2Service` in `packages/redbox-core/src/services/` as the canonical Figshare integration engine, with the same callable public entry points currently exposed by `FigshareService` (`createUpdateFigshareArticle`, `uploadFilesToFigshareArticle`, `deleteFilesFromRedboxTrigger`, `publishAfterUploadFilesJob`, `deleteFilesFromRedbox`, `queuePublishAfterUploadFiles`, `transitionRecordWorkflowFromFigshareArticlePropertiesJob`, and related helpers).

This first pass is full-scope: all current Figshare behaviors are reimplemented behind the new service, but using a clean v2 architecture built around Effect programs, branded `figsharePublishing` AppConfig, explicit lifecycle phases, typed error/outcome models, resumable sync state, and OpenTelemetry-backed tracing plus structured logs. During development, `FigshareV2Service` runs side by side with the existing `FigshareService` so that functional parity can be verified. Once parity is confirmed, `FigshareService` is removed entirely and `FigshareV2Service` takes over all hook and Agenda job wiring.

## Implementation Changes

### Service and helper module layout

- Add `packages/redbox-core/src/services/FigshareV2Service.ts` as the Sails-facing adapter.
- Add `packages/redbox-core/src/services/figshare-v2/types.ts` for shared domain types:
  - run context
  - sync state
  - publication plan
  - typed error categories
  - typed results for metadata sync, asset sync, embargo sync, publish, and write-back
- Add `packages/redbox-core/src/services/figshare-v2/config.ts` for:
  - brand-aware `figsharePublishing` resolution
  - secret/token resolution
  - validation/normalization of config used by runtime
  - derivation of record paths, retry config, and timeout config
- Add `packages/redbox-core/src/services/figshare-v2/context.ts` for constructing the per-run context:
  - `recordOid`
  - `brandId` or brand name
  - `articleId`
  - `jobId`
  - `correlationId`
  - trigger source
- Add `packages/redbox-core/src/services/figshare-v2/bindings.ts` for all binding evaluation:
  - path
  - Handlebars
  - JSONata
  - allowed helper validation
  - value coercion/default handling
- Add `packages/redbox-core/src/services/figshare-v2/plan.ts` for create/update/republish/skip planning and concurrency guard logic.
- Add `packages/redbox-core/src/services/figshare-v2/metadata.ts` for metadata payload construction and article create/update/lookup behavior.
- Add `packages/redbox-core/src/services/figshare-v2/assets.ts` for:
  - selected asset filtering
  - hosted file upload orchestration
  - link-only URL syncing
  - dedupe checks
  - upload resumption state
  - staged file cleanup rules
- Add `packages/redbox-core/src/services/figshare-v2/embargo.ts` for embargo payload construction and set/clear/force-sync rules.
- Add `packages/redbox-core/src/services/figshare-v2/publish.ts` for publish and republish/version lifecycle behavior.
- Add `packages/redbox-core/src/services/figshare-v2/writeback.ts` for record mutation, sync-state persistence payloads, and legacy-compatible field write-back.
- Add `packages/redbox-core/src/services/figshare-v2/workflow.ts` for `transitionRecordWorkflowFromFigshareArticlePropertiesJob` polling and record workflow transition logic.
- Add `packages/redbox-core/src/services/figshare-v2/queue.ts` for Agenda payload shapes, enqueue helpers, duplicate-key rules, and continuation job coordination.
- Add `packages/redbox-core/src/services/figshare-v2/http.ts` for the Figshare client abstraction:
  - request building
  - retry
  - timeout
  - redaction
  - request/response span instrumentation
- Add `packages/redbox-core/src/services/figshare-v2/observability.ts` for:
  - root and child span helpers
  - event names
  - structured log helpers
  - redaction helpers
  - span attribute conventions
- Add `packages/redbox-core/src/services/figshare-v2/runtime.ts` for assembling the Effect runtime/layers and exposing the top-level program runners the service methods call.

### Effect and runtime design

- `FigshareV2Service.ts` should stay thin:
  - parse Sails/job inputs
  - resolve brand/record basics
  - call a top-level Effect program from `runtime.ts`
  - convert failures into existing service-facing behavior
- Use Effect as the core orchestration model, not just for retries.
- Build the runtime from small services/layers:
  - `FigshareConfig`
  - `FigshareClient`
  - `FigshareFixtures`
  - `FigshareObservability`
  - `FigshareStorage`
  - `FigshareQueue`
  - `FigshareRecordGateway`
  - `Clock/Random` where needed for retry/jitter/testing
- Top-level programs should map one-to-one with the public entry points, with shared lower-level programs for lifecycle phases.

### Fixture/testing mode

- Treat `testing.mode` as a runtime dependency choice, not scattered inline branching across all business logic.
- Implement a `FigshareClient` interface in `http.ts` with two concrete layers:
  - live client layer for real HTTP calls
  - fixture client layer backed by `config.testing.fixtures`
- `runtime.ts` chooses which layer to provide based on `figsharePublishing.testing.mode`.
- Keep conditional branching only at runtime assembly boundaries and for a small number of side-effect adapters, not inside all business logic methods.
- The fixture layer should return typed responses for:
  - article create/update/fetch
  - file list
  - upload init/part/complete
  - embargo set/clear
  - publish
  - workflow-related article property lookups
- Asset staging and record write-back should still execute normally in fixture mode unless explicitly unsafe; only external Figshare API behavior is swapped for fixtures.
- Queue behavior in fixture mode should remain real enough to exercise continuation flow, but use fixture client responses so jobs are deterministic.
- Unit tests should be able to inject the fixture layer directly without going through AppConfig resolution, while integration tests should exercise the normal `testing.mode: 'fixture'` config path.

### Behavior and state model

- Preserve the current public workflow semantics, but reimplement them around explicit lifecycle phases:
  - `preparePublication`
  - `syncMetadata`
  - `syncAssets`
  - `syncEmbargo`
  - `publishIfNeeded`
  - `writeBack`
- Treat create/update/republish as separate plan outcomes, with republish respecting the Figshare versioned publish lifecycle instead of assuming plain update plus publish is always sufficient.
- Persist sync state at `config.record.syncStatePath` with:
  - status
  - lock owner/job id
  - correlation id
  - last sync time
  - last error summary
  - partial progress
- Enforce per-record/article concurrency guards so overlapping runs are skipped unless they are the same continuation job.
- Reimplement hosted file uploads and link-only URL assets through storage/datastream abstractions rather than hard-coded temp-path logic.
- Preserve cleanup, retry-safe partial progress, selected-only semantics, existing record compatibility, and write-back to legacy field names by default.

### Public interfaces and compatibility

- Public service methods stay named the same as legacy entry points, but live on `FigshareV2Service`.
- `FigshareService` remains fully operational and unchanged during the parity-verification stage. It is removed entirely once parity is confirmed.
- Register `FigshareV2Service` in `packages/redbox-core/src/services/index.ts` alongside `FigshareService` under its own key during the parity-verification stage.
- Register parallel Agenda job definitions in `packages/redbox-core/src/config/agendaQueue.config.ts` under `figsharev2service.*` names during the parity-verification stage.
- Once parity is confirmed and `FigshareService` is removed, re-register `FigshareV2Service` under the original `FigshareService` key and `figshareservice.*` job names so existing hook wiring requires no changes.
- Keep `FigsharePublishing` as the source of brand-aware config and continue using its existing binding model, selection rules, sync-state paths, retry config, testing mode, and write-back paths.
- No record data migration is required; existing `metadata.figshare_article_id` and `metadata.figshare_article_location` remain supported defaults.

## Test Plan

- Add unit coverage in `packages/redbox-core/test/services/` for `FigshareV2Service` and helper modules covering:
  - service exports and shim wiring
  - config resolution by brand
  - runtime assembly choosing live versus fixture client layer
  - duplicate-run suppression and lock semantics
  - create/update/republish planning
  - selected-only asset filtering
  - hosted file upload lifecycle including partial retry state
  - link-only URL handling
  - embargo set/clear/force-sync behavior
  - publish-after-uploads queue flow
  - delete/cleanup/write-back flow
  - workflow transition polling logic
  - telemetry event/span metadata emission and redaction
- Add focused tests for fixture mode proving:
  - `testing.mode: 'fixture'` selects the fixture client layer
  - business logic still executes normal orchestration
  - queue continuation paths remain deterministic
  - no live HTTP adapter is invoked
- Update/add Agenda/job tests to confirm queue definitions invoke `figsharev2service.*`.
- Add Mocha integration coverage for end-to-end service behavior with branded AppConfig and fixture mode.
- Add Bruno coverage only if any externally callable AJAX/REST routes or job-triggered APIs change as part of the wiring.
- Run `cd packages/redbox-core && npm test` and the relevant Mocha integration suite after compile.

## Assumptions and adoption notes

- `FigshareV2Service` becomes the canonical implementation immediately; hooks and Agenda jobs move to it now.
- Full behavior parity is in scope for this first pass, including uploads, cleanup, publish jobs, delete flow, and workflow transition jobs.
- Effect 3.x is used for the core engine and orchestration; Sails service methods remain thin async wrappers only.
- Effect’s built-in HTTP client is the transport for all new Figshare V2 API calls.
- Fixture mode is implemented primarily as Effect layer substitution for the Figshare client and related external adapters, not as ad hoc inline branching throughout orchestration.
- Existing Pino-based logging remains the log transport; tracing is layered on top, not a replacement.
- Secrets stay in AppConfig and must always be redacted from logs, span attributes, and persisted error summaries.
