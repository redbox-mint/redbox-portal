# Sails retirement final review — round 23

**Ten NEW class-(A) P2 findings; zero P1. All ten are fixed. R23 does not
pass the confirmation gate.** SR-055 remains unchecked: the gate requires a
round that discovers zero new A/P1/P2 issues. The task count remains **54/55**.

Verified incoming portal HEAD **`f22474ec44b337fa6e75bc186ac0c09380990bfa`** on
`stack/sails-retirement` and converted WSU HEAD
**`80b2b80c036cbfd286d36ac9140beee2421d42d5`** on `feature/v6-express` with
Git logs. Both AGENTS.md files, the retirement contracts, R18 through R22 and
WSU qualification evidence were read. Comparison with feature base
`a49366803164429f9d8bdd249dadcdf856c9d13e` distinguishes inherited mistakes
from guidance invalidated by retirement. Writing for Agents informed the bundled
skill edits. This review performed no further delegation.

All ten fixes and their sensitive documentation regressions are in portal
**`9a2d72bd3433c807f0edece68be6d0f0e8ee7e55`**
(`docs(retirement): correct v6 author and operator guidance`). The report/task
commit adds evidence and status only. WSU remains unchanged and clean.

## Findings and fixes

| ID | New class-(A) P2 failure and inheritance check | Fix in `9a2d72bd3` and regression |
| --- | --- | --- |
| R23-01 — implicit/removed configuration instructions | Configuration, form, workflow, lookup, email, record-schema and permissions guides still direct readers to discovered `config/*.js`, branded directories or removed aliases/registries. V6 neither discovers those files nor accepts `form.forms`/`formConfigRegistry`/`defaultForm` as startup data; schema booleans also no longer accept the documented string coercion. These inputs were supported before retirement. | Name the explicitly selected deployment/extension configuration and exact fragment placement; declare forms through extension `forms`, preserve explicit AppConfig bootstrap semantics and require actual booleans. The PDF README replaces the retired `sails_brandingConfigurationDefaults__pdfgen__token` alias. Tests load the AppConfig example through the real loader, compile/invoke form registration and reject retired file/alias guidance. |
| R23-02 — root quick start omits required session secret | Running its exact `npm run dev:run` block with no inherited secret fails Compose interpolation before startup. The retirement made `REDBOX_SESSION_SECRET` an explicit required input. | Add private-secret creation and persistence guidance. The actual documented block runs with an npm adapter invoking real offline Compose validation; incoming instructions fail, corrected instructions pass. |
| R23-03 — root diagnostics use deleted startup facilities | `STARTUP_TIMING`, `SHIM_VERBOSE`, `node app.js` and Sails-lift completion were real baseline facilities; following them on v6 either fails or supplies no claimed diagnostic. | Document `app.express.cjs`, `npm run debug`, `/healthz`, `/readyz` and the explicit development workflow. The regression rejects removed commands/flags and verifies the current executable/readiness guidance. |
| R23-04 — chronicle guide uses removed controller APIs | The published complete path extends `Controllers.Core.Controller` and calls `this.sendResp`/`recordBackgroundOperation`. Those controller exports and implicit service/global wiring were removed by retirement. | Compile a complete explicitly bound Express handler using the existing request chronicle and `sendApiErrors`; describe tracked asynchronous settlement. The test strictly compiles and invokes the example and verifies its safe API-v2 response. |
| R23-05 — Companion instructions describe retired wiring/auth/lifecycle | Setup/architecture pages teach discovered route/policy configuration, shared-secret attachment bypass, lazy initialization and ambient `UPPY_*` loading. V6 requires explicit configuration and a verified actor, brand/object permission, CSRF/bearer boundary and owned initialization. The instructions described the old host, not the current implementation. | Replace both guides with the actual explicit configuration, actor authorization, routes, provider setup and process-lifetime/drain limits. Load the exact Companion example offline and reject obsolete authorization/wiring assertions. Real provider OAuth remains an explicit prerequisite. |
| R23-06 — bundled agent guidance generates/reviews retired APIs | Planning/review/Angular/form/browser/test skills still prescribe shims, `_exportedMethods`, controller globals, `sendResp`, Sails readiness, global services, old route configuration and `CacheService` view helpers. These were invalidated by retirement. | Update both nested skill copies where present, use concrete handler/module inputs, `page.bundleHash`, current readiness and CSRF contracts; replace the review payload that instructed agents to restore `sendResp`. Scan all shipped skills and render the actual EJS sample with real PageArtifacts/page locals. Incorrect pre-feature generator spellings/test paths remain B-17. |
| R23-07 — dashboard upgrade depends on removed environment controls | `REDBOX_SKIP_MIGRATIONS` and `REDBOX_DASHBOARD_MIGRATION_RESOLUTIONS` are rejected v6 inputs. The old advice to start first and use HTTP preflight cannot unblock an initialization failure. These controls belonged to the former host. | Show pure offline `convertLegacyDashboardConfiguration` preview from a captured `LegacyCaptureInput`, then explicit `dashboardMigrationResolutions` data and single-runner initialization. Compile/execute the preview and reject both removed controls. |
| R23-08 — cache/provider guides prescribe retired registration/lifecycle | Cache/storage/PDF guides still describe `preLiftSetup`, `registerRedboxServices`/config registration, automatic shim removal, Sails `lower` and global audit fallback. V6 uses explicit registration and owned lifecycle. Their Node-24 operating advice is also obsolete for the qualified Node-26 runtime. | Document neutral registration/selected dependencies, manifest-based shim retirement and initialize/quiesce/drain/close. Correct PDF operation/audit guidance. Load actual storage registration and check these guides against the current contracts. |
| R23-09 — Figshare binding instructions require a removed global | The technical guide tells authors to reach vocabulary resolution through Sails and maintain `_exportedMethods`. The current binding factory instead requires the explicit crosswalk resolver. The old service-global mechanism existed at the feature base. | Show `createFigshareBindings({ crosswalk, log })` with a complete sample. Strictly compile it and execute the actual binding with a supplied resolver. |
| R23-10 — new CommonJS configuration example cannot parse | The feature's `configuration-v6.md` mixes `require()` and top-level `await`; a `.cjs` file fails Node's syntax check. This example did not exist at the feature base. | Export an async helper. Syntax-check and execute that exact helper with the guide's actual application example, real CJS/ESM selected files and a precedence assertion. |

The final ten regressions fail **0 pass/10 fail** against pinned incoming
documents in an isolated snapshot. The final root tooling run has **49 passes,
zero failures/skips**, including those ten and the previously settled executable
hook-author wiki. The ten findings aggregate repeated occurrences of the same
broken author/operator path; extracted token counts are not additional findings.
Minor terminology/path/anchor corrections accompany the fixes and add no P1/P2.

## Complete documentation settlement

The [page table](final-review-r23/page-settlement.md) enumerates **133 pages**:
77 wiki pages, the three root documents, five v6 guides, 20 shipped skills,
23 other active READMEs/templates and all five converted WSU Markdown files.
No `.claude/skills` or `.agents` tree exists in this portal checkout. Lowercase
agent-followed README files and nested skill copies are included.

The [incoming](final-review-r23/incoming-ledger.json.gz) and
[final](final-review-r23/final-ledger.json.gz) ledgers preserve every extracted
sample/reference, nested API/key/package/path/command token, source location,
page hash, disposition and verification source. There are **353 incoming /
346 final complete sample blocks** and **10,216 incoming / 10,177 final
extracted rows**, including their constituent references. Final dispositions are
9,982 current, 153 intentionally historical and 42 inherited-wrong rows. The
[classification totals](final-review-r23/classification-summary.json) separate
current, intentionally historical and wrong guidance. All final wrong rows
belong to inherited B-17; no unfixed new A/P1/P2 instruction is waived as
historical. The table is a documentary settlement, not a claim that every
fragment or external deployment command was executed.

[Verification and limits](final-review-r23/verification.md) records each execution,
fragment/placeholder classification and prerequisite. Fresh shell/CommonJS syntax
survey: **105 checks, 102 successes**. Two failures are declared replacement
placeholders (`<shell>` and `<portal-host>`); the third is an inherited combined
module/object fragment. Real main author/operator tests execute the relevant
blocks and compile TypeScript samples in temporary directories. No registry
publication, production migration, provider OAuth or new image build is claimed.

## Inherited findings and remaining delta

New backlog group **B-17** records pre-feature documentation defects: unscoped
migration CLI, nonexistent translation executable, testing selectors/profile
claims and paths, old generator names, absolute/missing source links, nonexistent
Figshare migration test links and the combined server-validation fragment.
[Exact baseline/current excerpts](final-review-r23/inherited-comparison.json)
establish inheritance. These remain open outside the feature gate. The cumulative
inherited backlog now has **17 groups**. No new inherited severe access-control
exception was found.

Final inspection revisited explicit composition/extension ownership, config
validation, auth/CSRF/response/page adapters, uploads, persistence/queue cleanup,
WSU registration/migrations and entrypoints. No additional concrete new P1/P2
runtime fault was verified. Fresh structural checks at `9a2d72bd3` report:

| Check | Result |
| --- | --- |
| Full root tooling | **49 passing**, zero failures/skips |
| Full dev-tools build/test | **60 passing**, includes its ordinary 1,271-case resolver regression |
| Generated documentation tests | **4 passing** |
| `npm run docs:audit` | **Exit 0**, 43 published surfaces / 524 advisory findings |
| Core `tsc --noEmit` after documented dependency preparation | **Exit 0** |
| Exact initial-migration and Services-guide shell flows | **Both exit 0**; isolated/offline generation, build/check/pack where specified |
| Source AST/dependency closure | **1,227 files**, zero executable violations/forbidden entries |
| Source inventory | **1,198 matched files**, zero unclassified |
| Baseline reconciliation | **All 1,261 baseline files and 444 added candidates accounted for** |

Core runtime source, host executable and dependency contracts have no
non-Markdown changes since R20 `5786b7e77`. R23 changes documentation and its
regressions only; WSU remains at `80b2b80`. Consequently the condition to repeat
full runtime suites is not met. R20's full core/root, Mongo 8/9, installed
cutover/restoration and differential results remain **historical R20 evidence**.
R21 HTTP and R22 clean-clone/CI/development tables retain their stated scope;
no settled finding was reopened without a concrete failing case.

## Provenance, cleanup and ticks

[machine accounting](final-review-r23/review-accounting.json) pins revisions,
commands, outcomes and raw-log hashes. Node **26.11.1** / npm **11.20.0** were
used. Early failed test-fixture/dependency-preparation/command attempts remain
in raw evidence and are distinguished from accepted runs in verification.md.
No dependency manifest/lock changed and no pin/range was added.

All disposable test/author/compiler/config/syntax directories and early candidate
scratch files were removed. No Docker resource was created; Compose was used
only offline. All **13 checkout snapshots** exactly match their initial tracked
diffs/statuses/untracked hashes, including the 12 protected originals/siblings
and clean converted WSU. The original WSU and GraphQL specification were not
modified. No push, publication or tag occurred. Hashed raw evidence is retained
under `.tmp/sails-retirement/final-review-r23/`.

| Task | Final tick and qualification |
| --- | --- |
| SR-005 | **[x]** Existing WSU designation, released-source fallback and authorized local scope stand; production-only gaps remain explicit. |
| SR-045 | **[x]** Existing R20 Mongo 8/9 and earlier generic replica-set evidence stand; no fresh topology qualification claimed. |
| SR-049 | **[x]** Existing local cutover/restart/partial-failure/checkpoint restoration stands; no fresh recovery rehearsal claimed. |
| SR-055 | **[ ]** Ten new A/P2 findings fixed. A subsequent round with zero new A/P1/P2 is still required. |

Remediation leaves **54/55 tasks checked**. It does not make R23 a zero-finding
confirmation round or expand institution production acceptance.
