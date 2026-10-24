# Final-gate round 3 — independent Standards review

## Result and source identity

**Three verified findings at initial HEAD `46351fc2d`: one P1 isolation/data-loss defect and two P2 credential-disclosure defects.** These are hard security/behavior violations, not Fowler-smell judgments. No additional smell-only finding meets the requested concrete-evidence threshold.

Review command: `git diff a49366803...HEAD`. The full feature inventory contains 1,408 changed files; the focused source inspection is enumerated below rather than claiming line-by-line coverage of every changed file. Work remained in `/home/andrew/src/github/redbox-portal`, branch `stack/sails-retirement`. No branches/worktrees were switched or created, no tracked files were edited by this reviewer, and no commits, pushes, Docker operations, or further delegation occurred. The unrelated untracked GraphQL specification was ignored.

The parent advanced the shared checkout to `4a2c0bf6e3cd72d9093b3c3da3368612e88d463e` during review (`0fbd7f74a` read-side ownership and `4a2c0bf6e` upload-completion guards). Neither committed change addresses the three findings below. During finalization, parent-owned uncommitted edits began adding ownership to cancelled-journal cleanup. Those edits are **not reviewer changes and are not declared qualified here**. All finding locations below refer to initial HEAD `46351fc2d`, so they remain reproducible despite concurrent edits.

Read round 1 and round 2 evidence first, then AGENTS.md, CONTRIBUTING.md, tracked wiki standards/architecture/configuration documentation, and all eight requested retirement specification/runbook files. Used the `code-review` skill's Standards checklist; the explicit instruction to remain an independent child and not delegate overrides its generic parallel-review workflow. The accepted SR-005/045/049/055 institution-designation gap is not a finding.

## R3-S01 — P1: a cancelled save can authorize deletion of another actor's staging

**Primary location:** `packages/redbox-core/src/records/Records.ts:6103`.

**Supporting locations:** same file `:3198` (journal preparation), `:5466` (prepare before primary CAS), `:5508` (certified non-application cancels the journal); `packages/redbox-core/src/persistence/storage/PrismaAttachments.ts:319` (expired cancelled rows become cleanup claims); `packages/redbox-core/src/storage/StandardDatastream.ts:952` (deletes by staging ID alone).

**Trigger:** an actor permitted to edit record A submits an attachment entry containing a known upload ID belonging to actor/brand/record B. Its metadata save loses a concurrent primary CAS after the journal is prepared. The request never reaches the R2 promotion ownership check: its journal becomes `cancelled`. After the configured staging expiry (seven days by default), cleanup sees no persisted reference or unresolved journal for the uncommitted foreign upload and deletes its bytes, tus parts and server ownership metadata.

The journal stores client-selected `fileId`, record, attachment and generation, but not the authenticated upload owner. `beginStagingCleanup`/`authorizeStagingCleanup` coordinate journal concurrency; they do not verify the tus owner. Reference scans only know the cancelled request's record and other journal records, so an upload that has not yet been included in a saved record is unprotected. R2's `addDatastream` ownership rejection therefore does not protect this destructive sibling operation. Knowing the foreign upload ID is a necessary precondition; the probe does not claim IDs are guessable.

**Verified behavior:** the source probe creates staging bytes and trusted tus metadata owned by B, verifies that an A-context promotion is rejected, constructs the real attachment plan, prepares/cancels its journal through the production helper methods, and calls the real Records cleanup and StandardDatastream deletion methods. It asserts `removed === 1` and disappearance of both the foreign bytes and `.tus/<id>/info.json`.

**Proof limits:** the journal is an injected collaborator that returns the cancelled claim; the probe does not run MongoDB, an HTTP race, or the real expiry scheduler. Source inspection verifies that the real Prisma journal selects exactly this persisted `cancelled` state and that the certified CAS-refusal branch produces it. This is a verified destructive domain boundary, not a claim of an executed end-to-end exploit.

**Contract:** `support/specs/sails-retirement/design.md:91` requires actor/brand/record ownership for tus resumptions; `:96` requires unbound v5 staging retention and forbids deriving ownership from client input. `support/specs/sails-retirement/maintenance-v6.md:119` requires legacy objects without trusted ownership to be retained for operator reconciliation. R2-07 explicitly establishes that selecting another actor/brand/record's staging by metadata ID is unauthorized.

**Correction:** persist the authoritative save actor/brand with a cleanup-eligible journal generation and require the destructive staging port to verify that context against trusted provider ownership before deleting. Missing/foreign/legacy ownership must retain staging for reconciliation. Preserve coordinator and reference-scan protections; a cancelled generation alone must not grant byte ownership.

**Proposed regression:** with real persisted journal rows and the real tus byte store, allow two authorized saves to read the same revision, let the ordinary save win CAS, and make the losing save select a different actor/brand/record's staged upload. Advance cleanup time beyond expiry and assert retention of bytes, offset and ownership metadata. Cover an unbound v5 object, mismatched actor/brand/record individually, and an owned expired cancelled upload that still cleans successfully.

## R3-S02 — P2: the attachment-journal fallback still logs the raw provider Error

**Location:** `packages/redbox-core/src/records/Records.ts:3347` (raw argument at `:3349`).

**Trigger:** attachment promotion/deletion fails, then marking that journal generation `unknown` also rejects with a provider Error containing request configuration, credentials or sensitive messages. This nested catch passes the original Error to `logger.error`. The adjacent applied-state, cancellation and outer attachment catches were sanitized by R2, but this catch was missed.

**Verified behavior:** fault-injection through the real `executeAttachmentPlan` returns the intended attachment `unknown` result and captures the exact original Error at the logger. An additional assertion passes that Error through the actual `log.createPinoLogger` factory and proves a synthetic `config.headers.Authorization` value reaches its serialized destination. This is not merely a permissive test logger: `src/config/log.config.ts:85` swaps string/Error arguments, and `:77` uses the ordinary Pino Error serializer outside its narrowly recognized cache-error case.

**Contract:** `support/wiki/Request-Chronicle-Logging.md:151` permits identifiers/counts/codes but `:155` forbids credentials/provider authentication details; `:159`–`:163` require redaction and bounds. `support/wiki/Services-Architecture.md:73`–`:75` requires privacy preservation and bounded, value-safe chronicle summaries. This is the same class of hard logging violation addressed by R2-01 and R2-02.

**Correction:** emit the bounded attachment/journal identity and failure code only, or route the Error through the existing safe chronicle error serializer. Preserve the `unknown` completion result and recovery state.

**Proposed regression:** make attachment work fail and the subsequent `markMutation(..., 'unknown', ...)` throw an Error whose message, cause and provider request config contain synthetic secrets. Assert bounded diagnostics and absence of those values in actual serialized logger output while the save response still reports the unchanged unknown attachment outcome.

## R3-S03 — P2: PDF's owned URL diagnostics bypass R2's credential protection

**Primary location:** `packages/sails-hook-redbox-pdfgen/src/api/services/PDF.ts:268`–`:269` (warning on duplicate suppression).

**Sibling locations:** same file `:393`–`:397` (configured bases and navigation URL), `:475`–`:476` (ready URL). `src/api/configmodels/PDFGenConfig.ts:158` and `:164` accept string `appUrlOverride`/`sourceUrlBase` values without forbidding URL userinfo.

**Trigger:** configure a valid HTTP URL containing userinfo, for example `https://pdf-user:<synthetic-password>@portal.invalid`, through `appUrlOverride`. Generating a PDF interpolates that URL into the verbose/debug diagnostics. A second request for the same URL hits duplicate suppression and logs it at **warn**, through both the injected logger and Effect's warning logger. The leak therefore persists without enabling Chrome diagnostics or verbose application logging.

**Verified behavior:** the real source PDF class runs against a stubbed browser/page and in-memory disks (no Chromium launch or network). A normal attempt exposes the synthetic URL password in verbose diagnostics; inserting the URL into `processMap` then executing another attempt exposes it at warn. The preserved log also shows the Effect warning containing the synthetic password. R2's existing test covers native page console/errors/response/request URLs with a safe default configured URL, so it does not exercise these owned messages.

**Contract:** `support/specs/sails-retirement/design.md:470`–`:471` requires configuration diagnostics to redact secrets, credentials and tokens. `support/wiki/Request-Chronicle-Logging.md:155` forbids credentials and `:160` explicitly requires URI-credential redaction. R2-03's browser/provider credential protection is incomplete at these sibling diagnostics.

**Correction:** log bounded operation/record/attempt summaries, or apply the shared safe URL/value serializer before either logger sees a configured URL. Include configured base strings as well as the final URL; removing native callbacks alone cannot fix this leak.

**Proposed regression:** exercise both success and duplicate suppression with secret-bearing configured URLs. Assert absence of URL userinfo and sensitive query values from every injected logger level and the Effect logger, while PDF generation and `duplicateSuppressed` outcomes remain unchanged.

## Evidence and verification

Artifacts in this directory:

- `standards-probes.cjs`: three deterministic domain/source reproductions. Loads tracked repository TypeScript from **git object `46351fc2d`** using a local require loader, so parent edits cannot silently change the reviewed source. Node modules remain the already-installed toolchain; no dependencies were installed and no build ran.
- `standards-probes.log`: successful pinned run, exit 0; all three assertions plus the actual production Pino serialization assertion passed.
- `standards-probes-concurrent-edit-attempt.log`: rejected rerun evidence. The parent added required cleanup owner arguments while the original live-source probe was running, causing a fixture arity failure. This is not counted as a passing reproduction or a new product defect. The pinned run above resolves the ambiguity.
- `standards-retirement-closure.json`: read-only committed-source closure at `4a2c0bf6e3cd72d9093b3c3da3368612e88d463e`; **1,056 selected source/manifest candidates, zero executable violations, zero forbidden dependency entries**. This is a structural source audit, not proof that all documentation prose is current or that an artifact/runtime matrix was rerun.
- `standards-dependency-pins.json`: 23 tracked package manifests; **zero prohibited dependency/devDependency ranges**. Eighteen local references are allowed, including the root's two `./packages/...` dependencies. No installed/immutable artifact qualification is claimed.

Reproduction command, from the repository root:

```sh
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json \
  .tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node \
  --no-experimental-strip-types -r ts-node/register/transpile-only \
  .tmp/sails-retirement/final-review-r3/standards-probes.cjs
```

No full suite, browser, external service, Docker or real datastore test was started by this reviewer. Prior-round qualification remains prior-round evidence.

## Reviewed modules and disposition

### R2 logging sweep — all 28 owned source boundaries

Reviewed `c2e29ae36`, its nearby control flow and logger-call corrections, including `3227b7de9`/`c8a99ecff`/`24a364371` where relevant:

1. `branding/BrandingLogo`
2. `branding/BrandingTypeface`
3. `configuration/AppConfigs`
4. `dashboards/DashboardConfig`
5. `dashboards/DashboardTypes`
6. `forms/DomSanitizer`
7. `forms/FormPayloadPrehydrate`
8. `forms/Forms`
9. `integrations/Oni`
10. `integrations/doi/runtime`
11. `integrations/figshare/assets`
12. `integrations/figshare/worker`
13. `navigation/Navigation`
14. `pages/Templates`
15. `queries/NamedQueries`
16. `queries/Reports`
17. `queries/Solr`
18. `records/HarvestRuns`
19. `records/RecordLists`
20. `records/Records` — R3-S02
21. `storage/StandardDatastream` — destructive cleanup reviewed with Records, R3-S01
22. `storage/StorageManager`
23. `storage/TusStorageManagerDataStore`
24. `translations/Translation`
25. `vocabulary/FigshareVocabulary`
26. `vocabulary/RvaImport`
27. `vocabulary/Vocabulary`
28. `workflows/WorkflowSteps`

Except for R3-S02, the inspected R2 logging hunks remove raw provider/payload arguments or replace them with bounded operation/count/status details without altering the surrounding returned values, throws, callbacks or Observable control flow. No independently verified logging-induced business-result regression was found.

### Critical modules and whole-feature security boundaries

| Reviewed area | Modules / boundaries | Disposition |
|---|---|---|
| R2 extension logging | Mongo hook `StorageProtocol` (`95905c1d8`); PDF `PDF`/configuration/audit tests (`ad8cc9ba7`, `24a364371`) | No additional storage outcome regression; PDF R3-S03 |
| Account chronicle | `application/portal/data`, `authentication/Accounts`, `utilities/serviceChronicle`, RequestChronicle sanitizer and production `config/log.config` | Shared serializer preserves capture semantics and protects account errors; no new defect verified |
| Branded authorization | `http/express/policies`, `identity`, `recordMutations`, `authorization/PathRules`, default `auth.config`, production `application/portal/http` wiring | R2 role scoping reaches browser, bearer and lazy authorization contexts; no additional verified cross-brand grant |
| Host/session/authentication | `ExpressHost`, `middleware`, `session`, `authentication`, `identity`, `login`, authentication providers | Readiness/admission, fresh identity, session version/rotation, callback ownership, invalid bearer/session fallback, redirect and logout-origin handling inspected |
| CSRF and dispatch | `csrf`, policy composition, configured actions, configuration/query writes, identity links | Canonical origins, acquisition persistence/no-store, verified bearer exemptions and browser-write dispatch inspected |
| Upload/read/delete | `StandardDatastream`, datastream reads/writes, resumable upload/tus provider wiring, Records journal preparation/execution/cleanup, Prisma attachment state/claims | R3-S01; parent read-side and incomplete-upload fixes inspected separately |
| Response and browser security | `responses`, page/assets/CSP handling, stream-based datastream and record reads, page error handling | Headers-sent/destroy behavior, streaming aborts, encoded paths, trusted roots/assets and error-body redaction inspected; no additional concrete regression |
| Accepted async work | Records hook completion/audit grace changes, request-lifetime and application ownership interfaces | No further reproducible drain escape; see candidate dispositions below |
| Retirement/docs/packages | Tracked architecture/configuration/development/installation and compatibility pages, retirement source checker, tracked package manifests | No forbidden runtime Sails dependency or version-range violation; finite compatibility names intentionally retained |

## Rejected or separately dispositioned candidates

1. **R2 role filtering as duplicated authorization/overengineering:** rejected. Centralizing the scoped actor in `policies.ts` prevents sibling branded routes from receiving global roles; `checkAuth` still needs its independent path-rule check. The identity snapshot's separate global scope is intentional. No verified behavior regression from removing the recordMutation-specific filter.
2. **Raw logs reintroduced by error-binding cleanup:** rejected after inspecting the cleanup corrections. The necessary `log.error`/`log.warn` methods are retained; unused local exception names do not change emitted errors or business outcomes. R3-S02 is the separate missed nested catch, not a hypothetical cleanup regression.
3. **Account chronicle serializer loses login failures or changes provider errors:** rejected. The injected event port is void, the shared helper captures normalized errors and avoids throwing from observability; provider callback outcomes remain controlled by the account/login code. Request-context association is deliberate.
4. **Detached audit-completion early return leaks a new Promise:** held then rejected as a finding. No reachable second `finishSave` invocation sharing the same completion object was established. The existing detached completion/fiber ownership changes cannot be called defective merely from a hypothetical reentry.
5. **Read-side lazy staging promotion bypass:** not independently established as an HTTP exploit by this reviewer. The initial read-list prerequisite made reachability uncertain; this is not evidence of safety. The parent committed `0fbd7f74a` while review was in progress, explicitly carrying actor/brand into the read call and authorizing before in-flight promotion. Do not count it as an additional independently verified finding here.
6. **Completed staging requirement:** parent `4a2c0bf6e` adds size/offset completion checks. No extra finding is claimed for the same issue. Neither that check nor read promotion ownership covers cancelled-journal cleanup.
7. **Primary-object idempotent repair skips staging ownership:** rejected. An existing object at the owning record's primary key is repaired without reading/replacing foreign staging; no foreign-copy trigger was verified in that path.
8. **CSRF rejects same-site sibling origins:** rejected. Requiring canonical origins and refusing sibling-site browser writes matches the documented contract. The bearer exemption independently verifies its credential and is restricted to the API mount.
9. **Configuration/query writes appear to lack local role checks:** rejected as a concrete default-host bypass. Effective policies and default PathRules supply `/api(/*)` Admin, appconfig Admin and translation Librarian restrictions. No request that bypasses those configured gates was demonstrated.
10. **Provider username collision or local-login active-provider behavior:** not reported; no introduced, reproducible failure relative to the feature baseline was established.
11. **Historical `sails-*` package names / finite conversion strings / Node 24 compiler base:** rejected. Current docs explicitly classify retained published names and finite v5 migration keys. The conservative compilation target does not choose the executing Node version. Structural closure confirms no forbidden executable dependency.
12. **Stale documentation fragments:** inspected, not elevated to a release-blocking code finding. The PDF README still mentions raising the “Sails log level” and seeing raw Chromium console output (`:346`), and Coding Standards retains the older backend-directory shorthand. Current architecture, configuration and migration pages identify the standalone owner and the logging behavior is directly reviewed above. These are editorial inconsistencies; no additional executed application failure was verified. No institution-designation acceptance gap is invented.

## Smell judgments, distinct from hard violations

- **Mysterious Name / Primitive Obsession / Data Clumps:** IDs, status codes and small operation contexts are consistent with existing typed domain/provider boundaries. The missing authoritative cleanup context has a concrete security effect and is reported as R3-S01, rather than demanding a speculative domain-type redesign.
- **Duplicated Code / Shotgun Surgery:** the 28-file logging correction is broad because those modules own distinct operations. Removing unsafe arguments does not justify inserting a generic logging abstraction into every service. PDF's mirrored injected/Effect logging has a real disclosure, reported as R3-S03; no separate abstraction finding is needed.
- **Feature Envy / Message Chains:** explicit collaborator calls are the documented architecture. No newly introduced navigation chain with a verified correctness or maintenance failure warrants moving unrelated domain responsibilities.
- **Repeated Switches:** policy names and journal states are finite transport/persistence contracts. No duplicated new dispatch cascade requiring a polymorphic hierarchy was established.
- **Divergent Change:** Records is large and touches validation, attachment completion and audit, but these are the documented save pipeline's related invariants and much of the size is inherited. A broad module split would be speculative in this security review.
- **Speculative Generality / Middle Man:** explicit production adapters and lifecycle/authorization ports implement requirements called out by the retirement design. No unused extension point or forwarding layer with a verified removable contract was found in the reviewed changes.
- **Refused Bequest:** inherited service helpers are explicitly optional logging/Observable utilities in the current architecture. The reviewed code does not establish a new subclass refusing its behavioral contract.

The three findings above are the complete actionable result of this Standards review. Concurrent parent remediation must be verified by the owning round before these initial-HEAD findings are marked fixed.
