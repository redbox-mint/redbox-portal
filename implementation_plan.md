# Custom Brand Typeface Implementation Plan

Status: ready for orchestration
Depends on: [design.md](design.md)
Executable work items: [tasklist.md](tasklist.md)

This plan describes implementation order, integration points, and verification strategy. Product decisions and contracts are defined once in `design.md`; if this plan appears to conflict with it, the design wins. Task IDs below map directly to `tasklist.md`.

## 1. Delivery strategy

Build the feature through narrow vertical foundations, then parallelise surfaces that no longer share files. Tests are written with the code they protect, not deferred to a final testing phase.

The longest delivery path is:

```text
T00 validator decision ----\
                             +-> T03 typeface service -> T04 theme CSS --\
T01 types/config -----------/                                        +-> T05 lifecycle
  \-> T02 migration ------------------------------------------------/

T05 -> T06 public delivery -> T07 HTTP surfaces -> T12 integration -> T13 browser -> T14 release
  \-> T08 Angular client -> T09 Angular UI --------------------------/
  \-> T10 reconciliation -------------------------> T12

T07 + T09 + T10 -> T11 documentation/translations -> T14
```

T00 and T01 can start in parallel; T02 follows T01, while T03 waits for both T00 and T01. After T05, public delivery/layout work (T06), Angular client work (T08), and cleanup scheduling (T10) can proceed in parallel because their primary file ownership is disjoint. T07 follows T06 so `routes.config.ts` has one owner at a time, while the component task T09 can follow T08 in parallel with T07. Documentation and translations (T11) begin after contracts and visible strings settle.

Do not assign two agents to the same task or let agents opportunistically edit files owned by a concurrent task. When a downstream task discovers a required upstream change, return it to the upstream owner or serialize the change.

## 2. Phase 0 — Resolve WOFF2 inspection

### T00: WOFF2 validator security and compatibility spike

Purpose: select the actual structural-validation implementation before committing persistence or public interfaces to unverified behaviour.

Work:

1. Assemble small distributable test fixtures: valid static WOFF2, valid variable WOFF2, truncated WOFF2, invalid bytes, and a descriptor-mismatch font. Record each fixture's licence/source.
2. Evaluate maintained Node-compatible candidates and, if necessary, a minimal internal WOFF2/OpenType directory inspector.
3. Prove Buffer-based parsing, WOFF2 structural failure, `fvar` detection, metadata extraction, and bounded failure behaviour on the repository's Node 24 CI and Node 26 runtime images.
4. Review package licence, transitive dependency footprint, active security reports, and crafted-input failure modes. Explicitly investigate the open `fontkit` denial-of-service report identified in the design.
5. Write a short decision record under `docs/adr/` or append a superseding implementation note to ADR 0001. Include why rejected candidates failed.
6. If a dependency is selected, pin its exact version in `package.json` and lockfile, following the repository's dependency-pinning policy. Do not use a semver range.

Exit criteria:

- one implementation passes every fixture and the security gate;
- static versus variable detection is demonstrated by an executable test;
- malformed input becomes a controlled error rather than a process failure;
- licence and Node compatibility are documented;
- or, if no candidate passes, implementation stops with a concrete blocker rather than weakening validation.

Verification:

```bash
npm run lint
npm run compile:core
```

Run the candidate-specific fixture test added by this task.

## 3. Phase 1 — Establish types, configuration, and persistence

T01 and T02 should be implemented serially because both touch the Waterline type definitions.

### T01: Shared typeface contracts and configuration

Primary files:

- `packages/redbox-core/src/waterline-models/BrandingConfig.ts`
- `packages/redbox-core/src/waterline-models/BrandingConfigHistory.ts`
- `packages/redbox-core/src/model/storage/BrandingModel.ts`
- a focused shared branding type module under `packages/redbox-core/src/model/`
- `packages/redbox-core/src/config/branding.config.ts`
- relevant config/type unit tests

Work:

1. Add the slot, inspection, face, and typeface state contracts from the design.
2. Add `typeface`, `draftTypeface`, and `draftRevision` to `BrandingConfig`; use `defaultsTo: 0` for the revision.
3. Add typeface and actor/restoration metadata to `BrandingConfigHistory`.
4. Update `BrandingModel` compatibility fields so cached and database branding values remain type-consistent.
5. Add the four configurable defaults and a single helper for reading validated positive integer values with logged fallback. Do not add a feature flag or decompressed-size setting.
6. Add normalisation helpers for legacy null/absent state and slot ordering. Keep them free of storage or controller dependencies.

Tests written in this task:

- type/state normalisation and invariant unit tests;
- Waterline definition assertions for defaults and JSON fields;
- invalid operator config falls back to defaults;
- no custom state normalises to Default Typography.

Exit criteria:

- one shared type definition is imported by services/controllers rather than re-declared;
- the project compiles with existing branding behaviour unchanged;
- configuration values are runtime-readable and validated.

### T02: Idempotent data migration and model integration

Primary files:

- new timestamped migration in `api/migrations/`
- `packages/redbox-core/test` model/migration tests or the repository's nearest migration-test location
- `test/integration/models/BrandingConfig.test.ts`

Work:

1. Implement the backfill, legacy rollback repair, active snapshot preservation, and newest-three pruning algorithm in section 6 of the design.
2. Export one loader-compatible JavaScript migration object and read the configured retention count at execution, with the same safe default.
3. Make every write conditional/idempotent so rerunning the migration produces no additional history versions. Use the unique brand/version index to arbitrate concurrent runners and verify any duplicate row before accepting it.
4. Handle brands with no history, missing matching history, active version below the historical maximum, and active CSS/variables differing from their matching row.
5. Omit an unsafe `down`; explain that history pruning is irreversible.
6. Ensure the migration does not depend on bootstrap services or in-memory brand cache.

Tests written in this task:

- fresh brand with no history;
- normal existing brand;
- brand previously rolled back to an older version;
- active version without a matching history row;
- active snapshot differing from same-number history;
- more than three history rows;
- repeated execution produces an identical database result.

Exit criteria:

- current active colour state is never discarded during upgrade;
- old history normalises to Default Typography;
- only the configured newest history rows remain;
- test fixture execution proves rerun safety.

## 4. Phase 2 — Build the font-specific deep module

### T03: `BrandingTypefaceService`

Primary files:

- new `packages/redbox-core/src/services/BrandingTypefaceService.ts`
- `packages/redbox-core/src/services/index.ts`
- parser dependency/module chosen by T00
- new `packages/redbox-core/test/services/BrandingTypefaceService.test.ts`
- focused Flydrive integration test beside existing logo/favicon service tests

Work:

1. Export the new service through the core service index so redbox-loader generates the conventional service shim.
2. Implement fixed slot descriptor lookup and canonical key/URL derivation.
3. Implement upload inspection, repeated compressed-size enforcement, variable rejection, metadata extraction, mismatch warnings, SHA-256 calculation, and family distinct-byte calculation.
4. Write immutable bytes to `branding-fonts/<branding-id>/<sha256>.woff2`; verify and reuse an existing same-brand object with the same hash.
5. Implement `readFace` with key derivation, exact byte retrieval, and full SHA-256 verification.
6. Implement `assertTypefaceAvailable` for all faces in a candidate snapshot.
7. Implement reference collection and reconciliation logic as callable service methods, but leave Agenda registration to T10.
8. Keep parser-specific and disk-specific mechanics private to the service. Do not create a generic asset service or separate font model.
9. Regenerate/smoke-check the loader shim and confirm `api/services/BrandingTypefaceService.js` resolves to the exported service; do not hand-edit the generated shim.

Unit tests written first/alongside:

- canonical key and root-context-aware public URL;
- each slot's descriptor;
- valid static inspection;
- malformed/truncated/variable rejection;
- descriptor warning without rejection;
- per-face and distinct-family compressed limit enforcement;
- same hash dedupe in one brand and separate key in another;
- missing/corrupt stored object;
- all-snapshot integrity checking;
- exact reconciliation key parsing, age/grace logic, reference recheck, already-missing handling, and bounded result counts.

Integration tests:

- round-trip against the configured primary disk used by the integration profile;
- existing-object verification and reuse;
- storage failure propagation without a typeface state mutation.

Exit criteria:

- services outside this module do not parse WOFF2 or construct disk keys;
- every returned face has canonical metadata and no internal storage key;
- all untrusted-input failures are controlled and typed/mappable.

## 5. Phase 3 — Generate typeface-aware theme CSS

### T04: Theme CSS and base typography roles

Primary files:

- `packages/redbox-core/src/services/BrandingThemeCssService.ts`
- `packages/redbox-core/test/services/BrandingThemeCssService.test.ts`
- the shared SCSS typography entry points discovered by the audit
- generated/static CSS build inputs only, not compiled artefacts unless the repository tracks them

Work:

1. Extend `generate` to accept branding identity and a normalised typeface snapshot in addition to colour variables.
2. Emit fixed alias `@font-face` rules in canonical slot order with `font-display: swap` and the relative URL specified in design section 9.
3. Emit `--rb-brand-font-family` only for a valid custom snapshot and in both `:root` and `:host` contexts.
4. Include all CSS output in the existing hash, so ordered face hashes affect idempotency.
5. Preserve the colour allow-list and rejection of arbitrary/legacy font-family variables.
6. Update base SCSS typography roles to consume the internal variable while retaining each role's existing family as its fallback.
7. Explicitly exclude icon fonts and monospace elements and cover browser print rules.

Tests written in this task:

- Default Typography produces no font-face or brand-family variable;
- all four slot mappings, missing optional face behaviour, URL encoding, and resolution under empty/non-empty root context;
- fixed alias and no interpolation of filename or embedded family;
- `swap` on every face;
- hash changes when a face hash changes and remains stable for equivalent snapshots;
- `:host` works for Shadow DOM preview;
- attempted editable font-family token remains rejected;
- compiled CSS/selector assertions for text roles, icons, monospace, and print.

Exit criteria:

- custom CSS is deterministic and contains no user-supplied CSS identifier;
- no-custom CSS preserves current typography;
- hook override ordering is not changed.

## 6. Phase 4 — Replace lifecycle internals safely

### T05: Draft, publish, preview, history, and restoration

Primary files:

- `packages/redbox-core/src/services/BrandingService.ts`
- `packages/redbox-core/test/services/BrandingService.test.ts`
- `test/integration/services/BrandingService.test.ts`
- `packages/redbox-core/src/utilities/TransactionUtils.ts` only if a narrow reusable correction is required

Work:

1. Add canonical `getAdminState` and `listVersions` service methods.
2. Change colour draft saving to require `expectedDraftRevision` and perform a conditional incrementing update.
3. Add draft face upload orchestration, face deletion, Use Default Typography, and typeface-only revert. Stage/store uploaded bytes before the conditional state update.
4. Generate preview CSS from an exact expected draft revision and store that revision in the preview cache entry.
5. Add historical preview without draft mutation.
6. Refactor publish to enforce both counters, snapshot validity, face integrity, composite idempotency, actor attribution, optional transaction behaviour, aligned active/draft state, monotonic allocation, pruning, and post-commit cache refresh.
7. Replace rollback internals with canonical restore semantics, explicit same-brand history lookup, re-generation/integrity checks, new-version history, aligned drafts, revision increment, pruning, and post-commit cache refresh.
8. Keep `rollback` as a temporary method alias to `restore` for the controller compatibility route.
9. Surface active face health as warnings in Admin state without failing config retrieval.

Concurrency implementation detail:

- use `BrandingConfig.updateOne` or the closest Waterline operation that can prove a single match on `{ id, draftRevision, version? }`;
- treat zero matched rows as conflict and re-read current counters;
- never perform an unconditional follow-up active update;
- allocate the next version from both active and retained maximums inside the transaction where supported.

Tests written in this task:

- every mutation increments revision once and stale requests do not mutate;
- typeface revert leaves colours unchanged and colour save leaves typeface unchanged;
- incomplete custom draft is durable but unpublishable;
- Default Typography publishes without faces;
- preview exact-revision conflict and historical non-mutation;
- publish integrity failure leaves active/history unchanged;
- idempotent publish creates no version;
- non-idempotent publish creates a complete actor-attributed snapshot;
- restore rejects cross-brand version ID and stale counters;
- restore rechecks bytes, regenerates CSS, increments version/revision, and aligns draft;
- restoration of current snapshot still creates an audited version;
- newest-configured-count pruning;
- transactional and non-transactional failure paths do not expose partial active state;
- cache refresh occurs only after successful active update.

Exit criteria:

- no service mutation can overwrite a newer draft or active version;
- all active transitions are one-row externally atomic;
- the old rewind behaviour no longer exists.

## 7. Phase 5 — Parallel delivery surfaces

Once T05 lands, T06, T08, and T10 can run concurrently. Endpoint names and payloads are fixed in the design, so T08 does not need to wait for controller implementation. T07 starts after T06 is merged because both extend `routes.config.ts`; T09 can follow T08 and run beside T07.

### T06: Public font delivery and page typography integration

Primary files:

- `packages/redbox-core/src/controllers/BrandingController.ts`
- public font additions to `packages/redbox-core/src/config/routes.config.ts`
- `packages/redbox-core/src/config/http.config.ts` or session middleware tests only if needed
- `views/default/default/layout.ejs`
- `views/default/default/record/layout.ejs`
- `views/layout.ejs`
- all other views found by the Google-font audit
- controller/rendering tests

Work:

1. Add public GET and HEAD routes and exported controller method(s).
2. Validate brand/hash, call `BrandingTypefaceService.readFace`, and emit canonical immutable headers.
3. Add `BrandingService` rendering helpers for active custom-state detection and Regular preload URL.
4. Audit `fonts.googleapis.com`, `fonts.gstatic.com`, `@import`, and existing font preloads across views/styles.
5. Suppress current Google font requests only for active custom brands.
6. Add one Regular preload for a custom brand.
7. Preserve theme-before-hook stylesheet ordering.
8. Stop `renderCss` from mutating the publication hash during a GET; compute any response ETag independently from served bytes.

Tests written in this task:

- GET bytes and HEAD headers/no body;
- invalid hash, unknown brand, absent object, and corrupt object all avoid unrelated content;
- `font/woff2`, ETag, cache, immutable, length, and nosniff headers;
- `rootContext` URL;
- public route does not acquire a session and remains permitted by CSP;
- each affected layout includes existing Google links for default and omits them for custom;
- custom includes Regular preload only;
- hook CSS remains later than generated theme CSS.
- theme GET does not write `BrandingConfig.hash`.

Exit criteria:

- a content-hashed font is cacheable across a brand's portals;
- all brand-resolved page families adopt the custom face through the shared theme;
- no custom brand behaviour regresses.

### T07: REST and AJAX management controllers/contracts

Depends on T05 and the T06 route-table handoff.

Primary files:

- `packages/redbox-core/src/controllers/BrandingAppController.ts`
- `packages/redbox-core/src/controllers/webservice/BrandingController.ts`
- `packages/redbox-core/src/config/routes.config.ts`
- `packages/redbox-core/src/config/auth.config.ts`
- `packages/redbox-core/src/api-routes/groups/branding.ts`
- API route contract support/validator utility if required
- controller/route contract tests

Work:

1. Add the endpoint set in design section 10 and update `_exportedMethods`.
2. Keep REST and AJAX actions thin: resolve authenticated brand/actor, parse request, call `BrandingService`, and map typed errors.
3. Handle multipart upload with Skipper's runtime configured maximum, then rely on service validation as the second boundary.
4. Require expected counters exactly as designed.
5. Move touched JSON actions to the standard `sendResp` response mechanism.
6. Enforce Admin policy on all management, preview, and history routes.
7. Implement canonical restore and the one-major-release rollback alias with a deprecation header and identical semantics.
8. Add a REST GET config action to reach parity with the existing AJAX client.
9. Update route/OpenAPI contracts, including multipart fields, status responses, and the configurable-limit extension.
10. Delete every Skipper temporary file in a `finally` path on success, validation failure, conflict, and unexpected error.

Tests written in this task:

- route registration and `_exportedMethods` exposure;
- Admin accepted/non-Admin rejected for both surfaces;
- actor body ignored in favour of authenticated session;
- multipart happy path and transport limit;
- all agreed status mappings and conflict payload counters;
- REST/AJAX response parity;
- restore brand scoping;
- rollback alias calls restore and returns deprecation metadata;
- generated contract validation accepts every route.

Exit criteria:

- controllers contain no WOFF2 parsing, storage keys, or lifecycle sequencing;
- both surfaces provide equivalent state transitions;
- route contract validation and core compilation pass.

### T10: Daily reconciliation registration

Primary files:

- `packages/redbox-core/src/config/agendaQueue.config.ts`
- service/job scheduling tests
- `BrandingTypefaceService.ts` only through serialized follow-up if T03's public reconciliation method is insufficient

Work:

1. Register the named Mongo-backed daily job with skip-immediate and single-worker locking.
2. Call the already-tested service reconciliation method.
3. Log bounded start/end counts and failures using existing scheduling conventions.
4. Verify repeated jobs, partial deletion failure, and large paginated listings remain safe.

Exit criteria:

- the job is registered once with the required backend/schedule/locks;
- live active/draft/history objects cannot be deleted;
- one failed object does not terminate future daily attempts.

## 8. Phase 6 — Angular client and Administrator experience

### T08: Angular service and state model

Primary files:

- `angular/projects/researchdatabox/branding/src/app/branding-admin.service.ts`
- a new or existing branding interface/model file under `src/app/`
- new `branding-admin.service.spec.ts`

Work:

1. Define the Angular representation of canonical Admin state, face slots, versions, warnings, limits, and counters.
2. Add methods for face multipart upload, removal, default, revert, draft/history preview, versions, publish, restore, and the updated colour draft.
3. Send the latest revision/version from one state source and replace local canonical state from mutation responses.
4. Normalise `409` into a conflict result the component can present without losing unsaved sample text.
5. Do not call the deprecated rollback alias from new UI code.

Tests written in this task:

- exact URL/method/body/form-data for each call;
- revision and version propagation;
- state replacement after response;
- status/error normalisation, especially 409 and 413;
- no trust in filename/MIME beyond form transport.

Exit criteria:

- components do not construct API URLs or hand-merge canonical server state;
- REST contract names and Angular fields agree.

### T09: Typography editor, preview, and history UI

Primary files:

- `angular/projects/researchdatabox/branding/src/app/branding-admin.component.ts`
- `angular/projects/researchdatabox/branding/src/app/branding-admin.component.html`
- `angular/projects/researchdatabox/branding/src/app/branding-admin.component.scss`
- `angular/projects/researchdatabox/branding/src/app/branding-admin.component.spec.ts`
- `angular/projects/researchdatabox/branding/src/app/branding-preview.component.ts`
- `angular/projects/researchdatabox/branding/src/app/branding-preview.component.html`
- `angular/projects/researchdatabox/branding/src/app/branding-preview.component.spec.ts`
- existing shared modal/notification components only where already used by this app

Work:

1. Add four accessible slot cards and their metadata/warning states.
2. Add Use Default Typography and typeface-only Revert actions.
3. Disable only the controls affected by an in-flight mutation while preventing duplicate submission.
4. Add incomplete-Regular, per-face/family limit, parser, conflict, and storage messages.
5. Expand the representative preview and keep custom sample text local to the component.
6. Add retained history with active marker, actor, typeface summary, historical preview, and confirmed immediate restore.
7. Refresh the complete canonical state after publish/restore.
8. Keep current logo/favicon and colour flows working.

Tests written in this task:

- default/custom/incomplete/healthy/warning render states;
- upload/replace/remove/default/revert events;
- filename escaping through interpolation and no unsafe HTML binding;
- controls/progress/accessibility while requests run;
- conflict reload prompt;
- preview representative roles/faces and local sample persistence;
- history order/actor/active marker and confirmation;
- restore replaces state;
- existing colour/logo/favicon regression cases.

Exit criteria:

- an Administrator can complete every lifecycle operation from the existing page;
- all server warnings/errors have understandable UI states;
- no new Angular route or application shell is introduced.

## 9. Phase 7 — Documentation, translations, and generated contracts

### T11: User/operator/developer documentation and language keys

Primary files:

- `language-defaults/en/translation.json`
- `language-defaults/meta.json`
- `support/wiki/Theme-Customization-Guide.md`
- `support/wiki/Configuration-Guide.md`
- `support/wiki/Services-Architecture.md`
- `support/wiki/Controllers-Architecture.md`
- API contract sources and generated reference output

Work:

1. Add every visible Angular string through the existing translation mechanism and update metadata.
2. Document supported formats/faces, size defaults/config overrides, draft/publish/restore semantics, three-version retention, browser scope, fallback behaviour, public caching, and the deprecated rollback alias.
3. Document `BrandingTypefaceService` as the font validation/storage boundary and controllers as thin transport adapters.
4. Generate API schemas/references after T07 lands; do not hand-edit generated output.
5. Record operational expectations for primary disk persistence, daily Agenda execution, health warnings, and orphan grace.

Verification:

```bash
npm run test:translations
npm run docs:generate
npm run docs:audit
npm run docs:test
```

Exit criteria:

- user-facing text has no hard-coded untranslated additions;
- operator config and deprecation are discoverable in the authoritative wiki;
- generated REST reference matches the implemented routes.

## 10. Phase 8 — Cross-layer integration and acceptance

### T12: Integration and Bruno coverage

Primary files:

- `test/integration/services/BrandingService.test.ts`
- new/updated service integration tests for typeface storage
- `test/bruno/1 - REST API/10 - Branding/`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/App Branding...`
- public general Bruno collection for font delivery
- integration Docker fixtures/volumes only if necessary

Work:

1. Exercise one complete REST flow and one complete AJAX flow against mounted services: config, upload, preview, publish, public fetch, edit, history preview, restore, and default publication.
2. Prove cross-request and cross-session draft conflicts.
3. Prove retained-history pruning and continued public availability of referenced objects.
4. Exercise legacy rollback alias and deprecation response.
5. Exercise non-Admin policy denial and public font access without Admin/session.
6. Run the migration against representative legacy data before the flow.

Fixtures must be small, licence-compatible, checked into a test-fixture directory, and never fetched from the network during tests.

Verification:

```bash
npm run test:core
npm run test:mocha:mount
npm run test:bruno:general:mount
npm run test:bruno
```

Use the exact mounted Bruno scripts supported by the local profile if `test:bruno` requires an already-running environment.

Exit criteria:

- the happy path and destructive/conflict/error paths cross real controller, service, database, and disk boundaries;
- REST and AJAX results are demonstrably equivalent.

### T13: Browser verification

Run after the mounted application contains T09 and T12 data support.

Work:

1. Log into the development portal as Admin using the repository's established development login workflow.
2. Verify keyboard-accessible upload, replace, remove, default, revert, preview, publish, historical preview, and restore.
3. Reload and use a second Admin session to demonstrate durable shared draft and conflict UX.
4. Visit representative public, login, researcher, Admin, record, error, and print views.
5. Inspect network requests: active custom brand has no current Google font request, Regular is preloaded once, WOFF2 is same-origin and immutable, and another portal under the brand reuses it.
6. Check headings/body/nav/forms/buttons, bold/italic synthesis, icons, code, hook overrides, and fallback after a controlled missing-object fixture.
7. Record screenshots and a concise natural-language verification report with exact environment/build identifier.

Exit criteria:

- all acceptance behaviour is visible in a real browser at desktop and narrow viewport;
- accessibility basics and network/rendering assertions pass;
- any failure becomes a linked remediation task, not an undocumented exception.

## 11. Phase 9 — Final validation and rollout readiness

### T14: Full repository checks and release review

Run formatting before checks if implementation files need it, but do not bulk-format unrelated user files.

```bash
npm run compile:core
npm run compile:ng
npm run lint
npm run format:check
npm run test:core
npm run test:angular
npm run test:translations
npm run validate:api-routes
npm run docs:audit
npm run docs:test
```

Then run the mounted integration/Bruno/browser checks from T12 and T13.

Review against every numbered criterion in `design.md` section 17. Also verify:

- package dependencies use exact versions;
- no untracked generated font binaries or captured uploads remain;
- no internal storage keys or actor request fields appear in public contracts;
- no feature flag or decompressed-size option was introduced;
- logo/favicon behaviour remains immediate and unversioned;
- all changed/new controllers and services have automated coverage;
- the migration backup/rollout note calls out irreversible history pruning;
- the rollback alias removal target is recorded for the next major release.

## 12. Deployment sequence

1. Confirm primary disk persistence and Agenda Mongo backend in the target environment.
2. Back up `BrandingConfig` and `BrandingConfigHistory` collections because rollout prunes history.
3. Deploy the application package and migration together; do not deploy the Angular client against old concurrency contracts.
4. Run the idempotent migration before lift/bootstrap.
5. Lift one instance, check migration output, route registration, Agenda definition, and default-brand rendering.
6. Lift remaining instances.
7. Confirm existing brands still load current Google fonts and current CSS.
8. In a non-production Branding Scope, upload/publish/fetch/restore a test font and observe logs/storage.
9. Confirm the next daily reconciliation completes without deleting referenced objects.

Rollback of application code is possible only after accounting for schema/contract compatibility. Pruned history cannot be restored by a migration `down`; recovery uses the pre-deployment database backup. Font objects are not eagerly deleted and remain recoverable until the grace-period reconciliation runs.

## 13. Definition of done

The feature is done when T00–T14 are complete, the full validation set is green, all design acceptance criteria have evidence, authoritative docs are updated, and a deployed test demonstrates custom publication plus restoration without changing logo/favicon semantics or Default Typography behaviour.
