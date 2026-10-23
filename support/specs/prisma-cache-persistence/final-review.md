# Prisma cache persistence final review

> **Current contract after C2 — user decision 2026-10-20.**
> Official v6 requires **driver-repository cache** under accepted
> [ADR0003](../waterline-retirement/adr/0003-orm-reevaluation.md).
> [C2 validation](../waterline-retirement/c2-validation.md) records qualification,
> the separate MongoDB default promotion and Prisma removal. Current `next`
> defaults to `mongodb`; explicit `waterline` remains a temporary transition
> choice. `prisma` is retired and fails with migration guidance. Prisma adapters,
> contracts, generator/freshness/config tooling and root/core dependencies are gone.
> **Prisma-specific P7.1 is superseded**, not satisfied by a GA upgrade. The release
> gate now requires the supported official driver and qualified Node/Mongo/FCV,
> package, Docker, lifecycle, operation and institution recovery matrix; final
> Waterline cache/model/selector retirement; and explicit official-v6 acceptance.
> **P7/G7 remain incomplete.** C2's bounded next evidence does not retire the
> remaining Waterline bridge or settle REL-01 scope/date, SEC-01 or INST-01.
> The Prisma maturity and pilot results below are historical evidence.

## Final review round 1

Reviewed **2026-10-19**, whole feature `0cfbd62b9..ad95590be`, followed by the
fixes recorded here. The design, implementation plan, tasks, P0 characterization,
all phase validation/status/deferred records, production and test/build diff,
and applicable wiki architecture, loader, service, coding, testing and cache
guides were reviewed. Standards and spec reviews ran independently in parallel;
production/runtime review and reproduction resolved their findings below.

**Outcome:** eight findings fixed. No newly identified feature defect remains
open. The existing source-loading timeout and official v6 release blockers remain
open; this is not a green full-core run or G7 acceptance.

### Findings and outcomes

Locations refer to the reviewed/fixed tree; paths start at the repository root.

| Axis / severity | Location | Finding and outcome |
| --- | --- | --- |
| Spec / P2 | `packages/redbox-core/src/persistence/cache/WaterlineCacheEntryRepository.ts:22` and `:50` | **Fixed.** The adapter assumed `row.id` and `{ id }` even when borrowing a hook model with another string primary key. Map the loaded model's primary key to the opaque repository ID and use it for deletion. A deliberately conflicting ordinary `id` unit fixture failed before the fix; the regression now passes. The real loaded Waterline model test uses `cacheKey` mapped to `_id`, another datastore/collection, and its callback. |
| Standards / P2 | `.circleci/config.yml:109` | **Fixed.** The Dependabot lock-refresh job omitted the npm setup used by other root/core jobs. Install npm **11.20.0** before refreshing locks so the image's bundled npm cannot rewrite the validated peer graph. YAML parsing and step ordering pass. |
| Standards / P2 | `support/spikes/prisma-cache-persistence/package-lock.json:1`, `package.json:19` | **Historical fix; spike source retired by C2.** The isolated spike's original npm 12 lock failed strict npm 11 `ci` with missing peers. Repair and normalize using npm 11.20.0, retain every original package-name/version pair and peer flag, and declare the package manager. A clean strict install and offline generation/build pass. See the retention decision below. |
| Spec / P2 | `support/specs/prisma-cache-persistence/p3-validation.md:3`, `p4-validation.md:3` | **Fixed records.** Missing historical `.tmp` runners/overlays/assertions made the recorded commands unreplayable. Mark those exact runs as historical observations whose harness was not retained; link tracked current package/runtime runners and the archived P5 portal harness. P1's temporary paths are generated outputs with tracked source; P5's inputs are archived. Clarifications distinguish those cases without inventing missing evidence. |
| Spec / P2 | `support/specs/prisma-cache-persistence/implementation_plan.md:243`, `support/wiki/ReDBox-Automated-Tests.md:46` | **Fixed.** Space-separated `RBPORTAL_MOCHA_TEST_PATHS` selects a single nonexistent path and can exit zero with zero tests, as P0 already observed. Publish the runner's actual newline-delimited syntax and two-path example. |
| Spec / P3 | `packages/redbox-core/test/fixtures/cache-persistence/PRISMA.md:20` | **Fixed.** Current fixture guidance incorrectly called Waterline the default and described P4/P5 as future work. State the Prisma `next` default, retained Waterline selection, completed validation links and blocked official-v6 gate. |
| Standards / P2 (pre-existing test defect) | `packages/sails-hook-redbox-storage-mongo/test/integration/MongoStorageConcurrency.integration.test.ts:37` and `:245` | **Fixed.** The extra driver-compatibility run exposed missing standalone model globals; after supplying them, an older tombstone case still omitted mandatory lifecycle ownership/state. The suite now installs/restores its own model globals and supplies valid lifecycle operations, expected states and removal ownership. Cleanup closes the client even if database removal fails. All nine existing assertions pass against the actual pinned storage driver; storage production code is unchanged. |
| Standards / P3 | `support/specs/prisma-cache-persistence/evidence/p5/mocha-prisma.log:2`, `multipart-diagnostic.log:14`, `core-focused-prisma.log:121`, `core-focused-waterline.log:121`, `transition.log:39` | **Fixed.** The final whole-feature whitespace check found terminal-generated trailing spaces and extra blank lines at EOF in archived output. Normalize only those spaces/blank lines; all non-whitespace content and test results are preserved. |

### Required concerns and retained limits

**a. Historical replay inputs / task evidence.** P3/P4 now expressly withdraw
exact replay claims for missing local helpers. The durable core Prisma,
Waterline-capture, transition and packed-package runners are tracked and were
rerun here. P5's archived harness provides later portal/backend assertions and
preparation instructions. P1's build/packing/probe/Docker inputs are tracked;
its `.tmp` paths are outputs. P5 links its archived input preparation prominently.
The historical gate observations remain bounded by those corrections; equivalent
retained later acceptance evidence supports the completed P0–P6 tasks. No P7
checkbox was advanced and no historical result was relabeled as a new run.

**b. P1 spike retention.** Keep the private standalone package, contract artifacts
and separate lock as P1 reproduction inputs. Root install/build/lint/format/test
and configured Dependabot paths do not include it; the Docker builder copies it
as source but never installs it, and the application runtime stages do not copy
the support tree. A scanner that deliberately inventories all manifests may
report this separate experimental graph. It is not a shipped runtime dependency.
The README records this distinction and points to the historical npm 12 lock in
Git. The npm 11 repair changes lock placement/peer metadata, **386 to 455 lock
entries**, with **32 newly represented package names**, zero lost original
name/version pairs, zero lost existing peer flags and unchanged direct pins.
All feature-touched manifests use exact dependency pins or permitted local paths.
Root/core locks were not changed by this review.

**c. Startup timeout — justified baseline, still open.**
`packages/redbox-core/test/unit/startup-module-loading.test.ts:34` retains its
original **12,000 ms** child limit and **15,000 ms** Mocha limit. Runtime Prisma
imports remain dynamic after explicit connection/index validation; an added
regression assertion rejects loading `@prisma/orm-mongo` during initial core
import. The tracked [measurement runner](evidence/final-review/measure-startup.cjs)
archives the exact base source and alternates base/current child processes using
the **same installed dependency graph**. Six runs after build/install work stopped
are retained in [startup.json](evidence/final-review/startup.json):

| Measurement (seconds) | Base median (range) | Current median (range) |
| --- | --- | --- |
| Initial core require | 10.428 (9.264–11.063) | 10.032 (9.629–11.673) |
| Core plus first sanitization, child wall time | 11.626 (10.555–12.580) | 11.108 (10.636–12.872) |

Every child reports **zero Prisma runtime modules** after core import. The
overlapping variation and lower current medians show no material source-loading
regression in this bounded comparison; neither snapshot reliably fits 12 seconds
on this host. This does not establish historical-lock timing or a startup SLA.
The diagnostic's 60-second bound only permits measurement; it does not replace
or relax the original test. The final unfiltered suite still fails that test.

**d. BSON `ts_added` double versus int — justified.**
`packages/redbox-core/src/persistence/prisma/contract.ts:12` deliberately uses
the proven numeric codec. Production consumers in CacheService and BrandingService
subtract numeric epoch seconds; validation requires a finite JavaScript number.
Repository queries and cache indexes use `name`/`_id`. Searches across production
code/configuration/index scripts found no integer-subtype validator, `$type`
condition or integer-only timestamp index/query. Real Waterline↔Prisma physical
interoperability and transition tests cover both representations and future epoch
values. No document rewrite or subtype coercion is needed for these consumers;
private institution queries/validators still require their activation review.

**e. Nested storage MongoDB driver — justified and verified.**
The root lock's storage-hook `mongodb` **6.21.0 → 7.2.0** restores that package's
already exact **7.2.0** manifest requirement; its manifest and production code
were not changed by the feature. The lock delta and reason were already recorded
in [P4](p4-validation.md#npm-toolchain-and-lock-repair). Existing P4/P6 shared-client
evidence includes storage/GridFS. This review additionally asserts the actual
storage-resolved driver version, verifies server **8.0.34**, and runs all nine
native storage concurrency/backfill cases. The tracked
[isolated runner](evidence/final-review/check-storage-driver.cjs) creates its own
digest-pinned container and random loopback port;
[output](evidence/final-review/storage.txt) records **9 passing**. This is bounded
compatibility evidence, not a record-storage
migration or production topology certification.

### Verification

Host: Linux x86_64, **Node 24.18.0**, TypeScript **5.9.3**. Host npm **12.0.2**
only invoked existing build/test scripts; it did not regenerate locks. All lock
normalization/strict-install checks use **npm 11.20.0**. Packed/spike clean builds
use **Node 26.11.1**. Isolated database suites use digest-pinned **MongoDB 8.0.34**;
the Prisma suite includes authentication. Commands start at the repository root.

| Check | Result |
| --- | --- |
| `npm --prefix packages/redbox-core run build` | Pass after the adapter fix; generation, TypeScript and runtime artifact copy succeed. |
| `npm run test:core` | **Exit 1: 4,099 passing, 88 pending, 1 failing (2 minutes).** Sole failure is the unchanged startup child `ETIMEDOUT`, discussed above. The initial review run had 4,098 passing and the same sole failure; the extra passing test is the hook-primary-key regression. |
| `npm --prefix packages/redbox-core run check:cache-contract` | Pass before build and after final changes; committed JSON/declarations are fresh. No generated contract diff. |
| Focused repository/runtime unit tests | **36 passing** after the adapter fix. |
| `bash packages/redbox-core/test/fixtures/cache-persistence/run-waterline-capture.sh` | **1 physical fixture + 1 loaded hook-model test passing**, including alternate primary key, collection/datastore and callback. |
| `P3_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-prisma` | **13 passing (4 seconds)**: physical data, authentication, preflight, failure and ownership/lifecycle cases. |
| `P5_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-transition` | **8 passing (49 seconds)**: both explicit backends, default, shared/mixed writers, restart persistence, notifications and callbacks. |
| `npm --prefix packages/redbox-core run test:cache-package` | Pass: clean npm 11 strict production install, consumer types, offline installed imports/shims, prune/slim runtime and live installed CRUD/raw BSON. No contract sources or Prisma CLI in the consumer. |
| `node support/specs/prisma-cache-persistence/evidence/final-review/check-storage-driver.cjs` | **9 passing**, actual storage driver 7.2.0/server 8.0.34; current lifecycle fixtures. |
| `node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.cache-persistence.json` | Pass. |
| `npm --prefix packages/sails-hook-redbox-storage-mongo run test:compile` | Pass, including the repaired integration test. |
| Standalone TypeScript check of `startup-module-loading.test.ts` with NodeNext/Node+Mocha types | Pass. |
| Scoped Oxlint / Prettier | Pass, zero lint errors/warnings on covered production TypeScript modules; changed TypeScript/CJS formatting passes. Repository lint configuration excludes tests and CJS, which are covered by type checks/formatting and executed checks as applicable. |
| Compiled import/service/shim smoke | Pass, **zero socket attempts**. |
| Tracked `evidence/p5/harness/promotion-config.cjs` | Pass: **24 selector checks**, 12 Compose configurations including generated hook templates, and three both-backend CI matrices. |
| CircleCI YAML + npm-step order; exact manifest pins | Pass. |
| Root/core npm 11 `ci --dry-run --ignore-scripts --strict-peer-deps` in a read-only mounted checkout | Pass. These are lock-consistency dry runs, not new clean root/core installs. |
| Spike npm 11 strict clean `ci --ignore-scripts --strict-peer-deps --no-audit --no-fund` | Pass: **353 packages** installed in a separate writable temporary copy; lock unchanged. |
| Separate spike `DO_NOT_TRACK=1 npm run build` with Docker `--network none` | Pass; generated source/dist JSON and declarations byte-match tracked artifacts (JSON SHA256 `1cca2cc02a0c6a833ed835618cb4e8f49b4bc36224c1e91fa55be37ae89aa993`, declarations `3be17d603d4cc61aac3cd71128467a9348891665b525b410d18c9b836d3e60be`). |
| Changed Markdown file targets; `git diff --check` | Pass. Pre-existing extensionless wiki aliases/router references are not new feature links. |

The current review reran the affected standalone Docker suites and audited the
retained full-portal evidence; it did not repeat the complete Angular/full-portal
image build, Bruno, browser, rollback or institution-recovery campaign. Those
remain the separately bounded P4–P6 records. No new API/UI behavior is introduced
by these fixes. Raw portal logs that may contain generated credentials remain
untracked; the retained startup/storage evidence is synthetic and credential-free.
All review-created containers, networks, images and temporary installs were
removed by their owning runners. Existing development containers/data were not
modified.

### Open items and release decision

1. **Existing baseline issue:** the 12-second source-module-loading timeout is
   still load-sensitive and fails the final full-core run. There is no measured
   feature regression in the bounded source comparison. It was not hidden,
   skipped or given a longer production test deadline.
2. **Required official-v6 blockers:** P7.1 stable CLI/MongoDB-runtime qualification
   remains unsatisfied; **P7.2–P7.6/G7 remain BLOCKED** as recorded in
   [p7-status.md](p7-status.md). Retain both the Waterline adapter and selector.
3. The already recorded Solr-before-ready bootstrap errors and independently
   deferred cache TTL/falsy/durability/race/preview changes remain outside this
   pilot's authorized behavior changes; see [deferred work](deferred-work.md)
   and P5/P7. This review makes no claim that those earlier limits are resolved.

No additional review finding remains open. Local review-fix commits carry the
required Codex co-author trailer; no push or release acceptance is performed.

## Final review round 2

Reviewed **2026-10-19**, whole feature `git diff 0cfbd62b9..123336121`, then
the fixes below. This was a fresh production/runtime review with independent
standards and spec checks, covering the contract, implementation plan/tasks,
P0 characterization, phase evidence and corrections, deferred/release records,
all changed production/test/build/package files and applicable wiki guidance.
The router's missing `redbox-core.md` target was resolved to the actual
`support/wiki/Redbox-Core-Types.md` page. No accepted release blocker was waived.

**Outcome: five findings fixed.** No newly identified issue remains open.
Locations below refer to the fixed tree, with paths relative to the repository.
The independent standards review reported no actionable standards findings.
The independent spec review found the diagnostic, timestamp and database bugs;
follow-up runtime checks found the scalar and credential configuration bugs.

### Findings and outcomes

| Severity | Location | Finding and outcome |
| --- | --- | --- |
| P1 | `packages/redbox-core/src/persistence/cache/PrismaCacheEntryRepository.ts:17`; `packages/redbox-core/src/services/CacheService.ts:123` | **Fixed.** A legacy JSON object containing BSON Date caused Prisma to attach the cached payload to `details.wirePreview`; best-effort cache writes logged that full error after the failed lookup. Native MongoDB validation failures similarly expose rejected payloads in `errInfo`. Normalize decode failures to an application-authored `InvalidCacheEntryError` message, retain the native cause internally, and log only error name/message rather than native diagnostic objects or cause chains. A live regression verifies both decode and server-validation failure logging, retained causes, and the surviving memory write. |
| P2 | `packages/redbox-core/src/persistence/cache/PrismaCacheEntryRepository.ts:34` | **Fixed.** The selected Prisma string decoder passes through BSON Date, objects and numbers. Optional `createdAt`/`updatedAt` were trusted and could escape the repository as non-string/BSON values. Validate both before projection, matching the Waterline adapter. Real raw-document cases now reject every invalid timestamp without rewriting the stored row. |
| P2 | `packages/redbox-core/src/persistence/cache/configuration.ts:168` | **Fixed.** Percent-escaped split database configuration could select a different database: Waterline used `institution%cache` while Prisma used `institution%25cache`. Resolve the database from the already loaded MongoDB manager before URI serialization. A focused regression failed with that exact mismatch; the authenticated live suite now uses an escaped database name and compares both drivers' actual database selection. The borrowed Waterline connection is neither created nor closed by this lookup. |
| P2 | `packages/redbox-core/src/persistence/cache/configuration.ts:74` | **Fixed.** Registered Sails config can precede sails-mongo's scalar normalization. Previously accepted string ports and numeric database/user/host settings were rejected on Prisma startup. Preserve those existing scalar conversions before validation, retaining invalid-port rejection. A focused regression failed before the fix; the live suite additionally uses a string port on its actual loaded datastore. |
| P2 | `packages/redbox-core/src/persistence/cache/configuration.ts:112` | **Fixed.** Percent-encoded split usernames/passwords were passed literally to the cache driver, while Waterline decoded them through its assembled connection URL. Decode split credentials exactly once. The focused test fails before the fix and covers ordinary and double-encoded values; the live suite uses encoded split credentials to authenticate as the same fixture user through both drivers. |

The read/diagnostic tests first failed **13 passing / 2 failing**, and each
configuration regression separately failed before its production fix, including
the final encoded-credential regression. The tracked regression tests,
rather than temporary probe scripts, are the durable
replay inputs. Current architecture/hook/fixture documentation describes the
effective database resolution and sensitive native causes.

Cache error logging intentionally keeps its two calls while replacing the full
error object with a safe summary. Observable/void APIs, local-first writes,
expiry/falsy behavior, persistence races and preview behavior remain unchanged.
No dependency, generated contract, backend default or selector was changed.

### Prior fixes and justified limits

- The round-1 primary-key fix is complete: reads map `model.primaryKey`, and
  deletes use that key. The conflicting ordinary `id` unit fixture and real
  loaded `cacheKey`/alternate datastore/collection/callback test pass. Remaining
  direct `id` fixtures use the standard model or designated original release.
  Prisma preflight intentionally requires the standard mapping; accepting a
  customized Waterline primary key there would violate the Prisma contract.
- CI npm setup, exact manifest pins, lock deltas, generation/freshness ordering,
  Docker/package copying, spike retention, Markdown targets and P0–P6 task
  evidence were rechecked. The round-1 historical replay corrections remain
  accurate; no unsupported gate or task was advanced.
- Initial full core verification reproduced only the already accepted startup
  child timeout: **4,099 passing, 88 pending, 1 failing**. An intermediate run
  passed **4,102 / 90 / 0** with the original deadlines. After the final
  credential fix/regression, the full run reports **4,102 / 90 / 1**: only the
  same original startup child timeout fails. The existing load-sensitive
  timeout was neither repaired nor relaxed.

### Verification

Host **Node 24.18.0 / npm 12.0.2** ran installed build/test scripts without
changing locks. Clean package and lock checks use **Node 26.11.1 / npm 11.20.0**.
Live source/storage suites own isolated digest-pinned **MongoDB 8.0.34** containers
and random loopback ports; the packed consumer uses its own Docker network.
The Prisma suite authenticates with synthetic fixture credentials.
Commands start at the checkout root unless explicitly stated.

| Check | Result |
| --- | --- |
| `npm --prefix packages/redbox-core run build` | Pass: generation, compilation and installed-artifact copying. |
| `npm run test:core` | **Exit 1: 4,102 passing, 90 pending, 1 failing (2 minutes).** Sole failure: unchanged startup child `ETIMEDOUT`. All three configuration regressions pass; two added opt-in live cases account for the additional pending tests. The earlier run before the final credential fix/regression passed 4,102 / 90 / 0. |
| `npm --prefix packages/redbox-core run check:cache-contract` | Pass; committed artifacts remain fresh and unchanged. |
| Focused repository/runtime/cache/preview suites | **59 passing** with actual service implementations and repository doubles at their dependency seam. |
| `P3_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-prisma` | **15 passing (6 seconds)**, including escaped database and credentials, string port, invalid timestamps, safe logs, failure/cleanup, index and raw-mapping coverage. |
| `P5_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-transition` | **8 passing (1 minute)** on the final implementation: both backends, default Prisma, mixed processes, restart/rollback and hook-model overrides. |
| `npm --prefix packages/redbox-core run test:cache-package` | **Exit 0.** Clean strict npm 11 production install; consumer types; offline installed imports/shims with zero socket attempts; pruned slim runtime; installed Prisma CRUD/raw BSON against isolated MongoDB 8.0.34. No core sources or Prisma CLI in the consumer. |
| `bash packages/redbox-core/test/fixtures/cache-persistence/run-waterline-capture.sh` | **1 physical fixture + 1 loaded hook-model test passing.** Archive not overwritten. |
| `node support/specs/prisma-cache-persistence/evidence/final-review/check-storage-driver.cjs` | **9 passing**, actual storage driver 7.2.0 against MongoDB 8.0.34; round-1 lifecycle/global fixture fixes verified. |
| `node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.cache-persistence.json` | Pass after all code changes. |
| Scoped Oxlint / Prettier | Pass; production persistence, CacheService and Sails typing lint with zero warnings/errors; all changed TypeScript formatting passes. |
| `node packages/redbox-core/test/fixtures/cache-persistence/repository-import-smoke.cjs` | Pass: core/service exports and shim generation/loading, zero socket attempts. |
| Exact-pin / CircleCI YAML audit | Pass: 20 tracked manifests have exact pins or permitted local references, no dependency version ranges; YAML parses and retains Prisma default/both-backend matrices. |
| Root and core `npm ci --dry-run --ignore-scripts --strict-peer-deps --no-audit --no-fund` in Node 26.11.1 / npm 11.20.0 | Both pass against read-only checkout mounts; consistency check, not clean root/core installs. |
| Changed Markdown targets / `git diff --check` | Pass: all 15 local link targets in changed Markdown files exist; no whitespace errors. |

The focused run uses the tracked files with Mocha's default discovery disabled:

```sh
cd packages/redbox-core
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  ../../node_modules/mocha/bin/mocha.js --no-config \
  -r ts-node/register/transpile-only -r chai -r ./test/setup.ts --timeout 30000 \
  test/unit/cache-entry-repository.test.ts test/unit/cache-persistence-runtime.test.ts \
  test/services/CacheServiceCharacterization.test.ts test/services/BrandingPreviewCharacterization.test.ts
```

An initial storage check overlapped the build's `dist` cleanup and failed module
loading; rerunning after build completion produced the nine passing tests above.
The similarly incomplete initial package snapshot was identified by comparing
its contents with final `dist`, cancelled, and discarded. A later final package
run was interrupted before completion and discarded; the tracked runner was
replayed to exit 0. Only completed runs are counted as package/runtime evidence.

Portal/Angular image, Bruno/browser and institution-recovery coverage is limited
to the audited P4–P6 evidence. These fixes introduce no new API/UI behavior.
Review-created containers, networks, tagged package images and temporary package
installs were removed by their runners or targeted interruption cleanup. Existing
development containers and their data were not modified.

### Open items and release decision

**New review issues open: none.** The known startup timeout remains load-sensitive
and fails the final full-core execution. P7.1 remains unsatisfied and
**P7.2–P7.6/G7 remain BLOCKED** by the accepted stable CLI/MongoDB-runtime gate.
Retain the Waterline adapter and explicit selector. The documented Solr bootstrap
issue and deferred behavior/domain work remain the existing separate items;
this review does not claim to resolve them or accept official v6.

## Final review round 3

Reviewed **2026-10-19**, whole feature `0cfbd62b9..02e1053e8` and the fixes
recorded below. Rechecked AGENTS.md, the design/plan/tasks, characterization,
phase evidence/validation, previous review outcomes and applicable coding,
service, loader, core, testing and cache wiki guidance. The audit included the
production persistence and service paths, lifecycle/cleanup, configuration,
exports, test helpers, manifests/locks, CI/Docker wiring, documentation links
and task evidence. No P7 task or release gate was advanced.

**Outcome:** five findings fixed. The earlier CacheService logging fix needed
further hardening; configuration support also needed to follow the loaded
sails-mongo connection for additional accepted forms.

### Findings and outcomes

Locations refer to the fixed tree; paths start at the repository root.

| Severity | Location | Finding and outcome |
| --- | --- | --- |
| P1 | `packages/redbox-core/src/services/CacheService.ts:123` | **Fixed.** Logging arbitrary native/hook error names and messages still exposed payloads embedded in those strings, despite omitting diagnostic fields and causes. Log controlled ReDBox cache diagnostics, otherwise a fixed summary with only safe integer driver codes or Waterline's `E_UNIQUE`. A regression with payload-bearing name/message/cause failed before the fix. The original read error, local-first write, two log calls and cache-name context remain intact. |
| P1 | `packages/redbox-core/src/loader/bootstrapShimRuntime.ts:114`, `packages/redbox-core/src/persistence/cache/errors.ts:25` | **Fixed.** Generated bootstrap logged complete normalized cache errors, including payload-bearing native causes, directly or inside another startup error. Share a small internal cache diagnostic summarizer; recognize cache failures along cause chains, including retained repository errors across Sails module-cache invalidation, without printing the native cause. Cleanup still completes before the callback receives the original error. A focused direct/wrapped startup regression passes. |
| P2 | `packages/redbox-core/src/persistence/cache/configuration.ts:88` | **Fixed.** The resolver rejected protocol-less and `://` URLs that sails-mongo accepts. Apply the same protocol completion before parsing. Both forms have offline regressions, and the authenticated live fixture exercises a protocol-less URL. The regressions failed on the prior resolver. |
| P2 | `packages/redbox-core/src/persistence/cache/configuration.ts:77` | **Fixed.** sails-mongo bypasses split overrides whenever a URL contains a comma, including query values; the Prisma resolver instead reapplied those overrides or rejected multiple hosts. Follow the existing URL precedence, retaining host lists, credentials, options and the loaded database. Unit cases cover multi-host replica-set URLs, comma-bearing query values and SRV; an authenticated live fixture supplies intentionally conflicting split settings and verifies the same effective connection. The regressions failed before the fix. |
| P2 | `packages/redbox-core/src/persistence/cache/configuration.ts:116`, `packages/redbox-core/src/sails.ts:107` | **Fixed.** URL-only credentials can change through sails-mongo's normalization (for example a double-escaped password); reparsing the original URL selected different credentials. Borrow the loaded client's resolved credential halves while preserving explicit split override decoding. Do not acquire or close its connection. A regression failed on the prior resolver; a real authenticated URL credential case and partially overridden unit cases now pass. Certificate authentication with no explicit username remains supported. |

The error helper is internal, introduces no new public error contract, and keeps
the detailed cause available to awaited/internal callers. Controlled validation
and preflight messages remain useful; untrusted native/hook messages are withheld
because even their first line can contain data. Branding preview operations do
not add cache-error logs and retain their existing rejection behavior.
`safePersistenceFailure` and configuration/preflight wrappers continue to remove
unsafe connection diagnostics. Test doubles remain at the repository seam.

### Prior fixes and retained boundaries

- Rechecked all round-1/2 fixes, including loaded Waterline primary keys,
  stored timestamp validation, escaped database selection, scalar split config,
  one-time split credential decoding, strict npm 11 lock compatibility and
  reproducible evidence limits. The new URI credential case is separate from
  the already correct split-credential case. Both are covered.
- Prisma remains the `next` default; explicit Waterline selection and the
  adapter remain. Expiry/falsy-value behavior, best-effort writes, persistence
  races, notification resets and preview delete-after-read semantics remain as
  characterized. No dependency, lock, contract artifact or backend default was
  changed by this review.
- Checked exact pins across all tracked manifests, root/core manifest-to-lock
  declarations, npm 11.20.0 CI setup, generation/copy order and both-backend
  matrices. All 192 explicit Markdown file targets resolve; pre-existing
  extensionless wiki routes are retained. This file-target check does not
  establish their published HTTP availability. Existing P0–P6 evidence remains
  subject to the prior review's historical replay qualifications.

### Verification

Host **Node 24.18.0 / npm 12.0.2** ran installed scripts without changing locks.
Clean lock/package checks use **Node 26.11.1 / npm 11.20.0**. Runtime suites own
isolated digest-pinned **MongoDB 8.0.34** containers with random loopback ports
or a dedicated package-test network. Authentication uses synthetic credentials.

| Check | Result |
| --- | --- |
| `npm --prefix packages/redbox-core run build` | Pass on final production code: generation, compilation and artifact copying. |
| `npm run test:core` | **Exit 1: 4,108 passing, 91 pending, 1 failing (2 minutes).** Sole failure is the unchanged startup child `ETIMEDOUT` at `test/unit/startup-module-loading.test.ts:37`. All six new service/runtime regressions pass; the added opt-in live case accounts for one more pending test. |
| `npm --prefix packages/redbox-core run check:cache-contract` | Pass; committed contract artifacts remain unchanged and fresh. |
| Focused repository/runtime/CacheService/Branding preview suites | **65 passing**, including safe native-message and direct/wrapped bootstrap logging regressions. Uses the explicit four-file command above with `--no-config`. |
| `P3_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-prisma` | **16 passing (5 seconds)** on final build; authenticated normalized URL/comma precedence, raw mapping, preflight, failures and cleanup. |
| `P5_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-transition` | **8 passing (50 seconds)** on final build; both backends, mixed processes, restart/rollback and loaded hook-model overrides. |
| `npm --prefix packages/redbox-core run test:cache-package` | **Exit 0.** Final build: clean strict npm 11.20.0 production install, consumer types, offline imports/shims with zero sockets, pruned slim runtime, installed Prisma CRUD/raw BSON on isolated MongoDB 8.0.34. |
| `bash packages/redbox-core/test/fixtures/cache-persistence/run-waterline-capture.sh` | **1 physical fixture + 1 loaded hook-model test passing.** Archive unchanged. |
| `node support/specs/prisma-cache-persistence/evidence/final-review/check-storage-driver.cjs` | **9 passing** against actual storage-resolved mongodb 7.2.0 and isolated MongoDB 8.0.34. |
| `node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.cache-persistence.json` | Pass after final code/test changes. |
| Scoped Oxlint / Prettier | Pass: zero lint warnings/errors; all changed TypeScript formatting checks pass. |
| `node packages/redbox-core/test/fixtures/cache-persistence/repository-import-smoke.cjs` | Pass on final build: core/service exports, generated shims and loading with zero socket attempts. |
| `node support/specs/prisma-cache-persistence/evidence/p5/harness/promotion-config.cjs` | Pass: 24 selector checks, 12 Compose configurations and 3 both-backend CI matrices. |
| Root/core `npm ci --dry-run --ignore-scripts --strict-peer-deps --no-audit --no-fund` under npm 11.20.0 | Both pass using read-only checkout mounts; consistency checks, not clean full root/core installs. |
| Exact manifest pins / Markdown file targets / `git diff --check` | Pass: 22 manifests use exact pins/local references; 192 explicit Markdown file targets resolve; no whitespace errors. |

An earlier full-core run reported **4,102 passing, 90 pending, 1 failing**, only
the accepted startup child `ETIMEDOUT`. Deadlines were not relaxed. The first
attempt at the new live connection fixture failed model identity setup; explicit
fixture identities corrected it, and the completed live runs above pass. That
fixture setup failure is not counted as a production regression. Temporary run
logs are not durable evidence; the tracked tests and runners are the replay
inputs. No full portal image, Bruno/browser or institution recovery campaign was
rerun this round; those remain bounded by the audited P4–P6 evidence.
Review-created containers, package images, networks and temporary installs were
removed by their runners. Existing development containers and data were not
modified.

### Open items and release decision

**New review issues open: none.** The accepted load-sensitive startup timeout,
documented Solr bootstrap issue and deferred work remain separate items.
**P7.1 remains unsatisfied; P7.2–P7.6/G7 remain BLOCKED** by RC/early-access
tooling and the MongoDB runtime maturity gate. Retain Waterline and its explicit
selector. This round does not qualify official v6.

## Final review round 4

Reviewed **2026-10-19**, the entire feature `git diff 0cfbd62b9..0bea4e97a`
and this round's fixes. Read AGENTS.md, the behavioral contract, implementation
plan/tasks, P0 characterization, phase evidence/validation, prior reviews and
the applicable coding, services, core, loader, testing and cache wiki guides.
The router's absent `redbox-core.md` was resolved to `Redbox-Core-Types.md`.
Independent standards and spec reviews supplemented the production review of
configuration, safe diagnostics, adapters, lifecycle, services, exports,
build/CI/Docker/package locks, test quality and evidence claims.

**Outcome:** two findings fixed. Standards review found no additional violation;
spec/runtime review reproduced the startup logging leak, and the requested
diagnostic review identified the unnecessarily opaque native-error fallback.

### Findings and outcomes

| Severity | Location | Finding and outcome |
| --- | --- | --- |
| P1 | `packages/redbox-core/src/config/log.config.ts:76` | **Fixed.** Summarizing the generated bootstrap log did not protect Sails' subsequent default lift-failure log. Sails receives the original error as required, and Pino's default serializer appends native cause messages/stacks, exposing cached payloads again. Apply the existing controlled cache summary in Pino's `err` serializer, retaining its standard serializer for unrelated errors. A regression using the actual generated bootstrap, Captain's Log, configured Pino logger and installed Sails lift/default callback failed before the fix; direct/wrapped validation and duplicate errors now produce two safe log records. The original callback error and native cause retain their identity. |
| P2 | `packages/redbox-core/src/persistence/cache/errors.ts:57`, `packages/redbox-core/src/services/CacheService.ts:124` | **Fixed.** Unexpected failures lost even their error class and useful network codes/labels. Move the fallback to a small internal operation-summary function. Allow known built-in/MongoDB error names, safe integer driver codes, known Node system codes/`E_UNIQUE` and documented MongoDB error labels; continue omitting arbitrary name/code/label strings, native messages, stacks and payload fields. Derive catalogs from the installed public MongoDB/Node APIs. Reuse the existing cycle-safe cause traversal to find the nearest allowed code: real `MongoNetworkError` retains `ECONNREFUSED` in its native cause. The network regression failed on the prior fallback; its final fixture follows that real driver shape. Existing read-error identity and memory-first void-write behavior remain intact. |

The logging regression suite also verifies that unrelated errors retain their
message, stack and cause diagnostics. The service regressions reject synthetic
payloads in names/messages/codes/labels and exercise cyclic causes. Add the
logger suite to the scoped cache typecheck, and update the hook guide to describe
the actual safe fields and Sails/Pino startup path. No dependency, contract,
backend default or selector changes are needed.

### Proportionality and prior-fix review

**Cause traversal is justified.** Migration/startup wrappers retain cache errors
inside `cause`; Sails can reload modules while retaining an earlier repository
and error instances. The controlled-code fallback handles that actual module
boundary. The existing cycle guard remains appropriate for arbitrary hook
errors. Extracting its iteration for both recognized-cache summaries and native
network-code selection avoids a second walker. Replacing native messages with
pattern redaction cannot reliably remove embedded payloads or credentials.
An `inspect.custom` alternative was tested and rejected: the configured
`inspect: false` Pino path serializes causes directly. No general error framework,
retry policy or additional adapter wrappers were introduced.

**Keep datastore resolution.** The registered Sails datastore exposes the
configuration preceding sails-mongo's separate scalar/URL normalization. The
loaded manager provides its resolved database and credentials, which the resolver
already reuses. Reusing the adapter's complete normalized URL requires private
ORM/adapter state or the MongoDB client's internal URL; transplanting the older
driver's resolved options into the new driver is not an equivalent public
configuration interface. No alternative clearly reduced both coupling and
behavioral risk. Keep the verified protocol completion, comma-URL precedence,
split scalar/credential handling, escaped database selection, TLS/SRV/options
and explicit rejection of coercing settings. Offline and authenticated live
regressions verify those earlier fixes without a rewrite.

**Rounds 1–3 remain sound within their documented limits.** Rechecked loaded
Waterline primary-key mapping/deletion, strict stored JSON/timestamps, safe
application diagnostics, connection normalization, ownership/cleanup, npm 11
CI setup, exact pins, lock deltas, deterministic generation/package artifacts
and both-backend infrastructure. The real loaded-hook and storage fixtures
remain effective regressions. Independent audit found no broken explicit wiki/
spec links or unsupported advancement of P0–P6 tasks. Earlier missing-harness
qualifications remain explicit; no historical run was relabeled as new evidence.
P7 stays blocked, with Waterline and its selector retained.

### Verification

Host **Node 24.18.0**, TypeScript **5.9.3** and npm **12.0.2** run installed
build/test scripts without lock maintenance. The read-only lock checks and clean
package fixture use **Node 26.11.1 / npm 11.20.0**. Database runners own disposable,
digest-pinned **MongoDB 8.0.34** containers with random ports or a private network;
the Prisma suite uses synthetic authentication. Commands start at the checkout
root, except the explicitly scoped Mocha command.

| Check | Result |
| --- | --- |
| `npm --prefix packages/redbox-core run build` | Pass on final production code: generation, compilation and runtime artifact copying. |
| `npm run test:core` | **Exit 1: 4,112 passing, 91 pending, 1 failing (2 minutes).** Sole failure: the accepted unchanged 12-second startup child `ETIMEDOUT` at `test/unit/startup-module-loading.test.ts:37`. All new logging regressions pass. |
| `npm --prefix packages/redbox-core run check:cache-contract` | Pass before build and after final code; committed artifacts remain unchanged and fresh. |
| Focused repository/runtime/CacheService/Branding preview and logger suites | **77 passing** on final source. Includes actual Sails/Pino failure logging, preserved unrelated diagnostics, realistic network causes, arbitrary payload strings and cyclic causes. |
| `npm --prefix packages/redbox-core run test:cache-package` | **Exit 0.** Clean strict npm 11.20.0 production install; consumer types; offline installed imports/artifacts/shims with zero sockets; pruning and slim runtime; installed Prisma CRUD/raw BSON on isolated MongoDB 8.0.34. No core sources or Prisma generation CLI in the consumer. |
| `P3_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-prisma` | **16 passing (11 seconds)**: authenticated connection normalization, raw mapping, validation/redaction, preflight, startup failure and ownership/cleanup. |
| `P5_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-transition` | **8 passing (1 minute)**: both explicit adapters, default Prisma, mixed processes, restart/rollback and loaded hook overrides. |
| `bash packages/redbox-core/test/fixtures/cache-persistence/run-waterline-capture.sh` | **1 physical fixture + 1 loaded hook-model test passing.** Tracked archive unchanged. |
| `node support/specs/prisma-cache-persistence/evidence/final-review/check-storage-driver.cjs` | **9 passing**, actual storage driver 7.2.0 against isolated MongoDB 8.0.34. |
| `node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.cache-persistence.json` | Pass, including the newly included logger regressions. |
| Scoped Oxlint / Prettier | Pass: zero production lint warnings/errors; all changed TypeScript and scoped test configuration formatting passes. |
| `node packages/redbox-core/test/fixtures/cache-persistence/repository-import-smoke.cjs` | Pass on final build: imports, service exports and generated shims/loading make zero socket attempts. |
| `node support/specs/prisma-cache-persistence/evidence/p5/harness/promotion-config.cjs` | Pass: 24 selector checks, 12 Compose configurations and 3 both-backend CI matrices. |
| Root/core `npm ci --dry-run --ignore-scripts --strict-peer-deps --no-audit --no-fund` in Node 26.11.1 / npm 11.20.0 | Both pass with read-only checkout mounts; lock-consistency checks, not new clean root/core installations. |
| Manifest pins / Markdown targets / `git diff 0cfbd62b9 --check` | Pass: exact dependency pins/local references and recorded lock deltas verified; explicit wiki/spec links resolve; no whitespace errors. |

Focused source regression command, from `packages/redbox-core`:

```bash
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  ../../node_modules/mocha/bin/mocha.js --no-config \
  -r ts-node/register/transpile-only -r chai -r ./test/setup.ts --timeout 30000 \
  test/unit/cache-entry-repository.test.ts test/unit/cache-persistence-runtime.test.ts \
  test/services/CacheServiceCharacterization.test.ts test/services/BrandingPreviewCharacterization.test.ts \
  test/config/logConfig.test.ts
```

The first full-core run, before the final cause-code regression/refinement,
reported **4,111 passing, 91 pending, 1 failing**, with the same accepted startup
timeout. The final run above uses frozen production/test code and unchanged
deadlines. No additional full-portal/Angular image, Bruno/browser or institution
restore campaign was repeated; those remain the audited, bounded P4–P6 evidence.
Temporary output logs are not replay inputs; the tracked tests/runners and
commands above are. All review-created containers, networks, tagged package
images and temporary installs were removed by their owning runners; existing
development containers/data were not modified.

### Open items and release decision

**New review issues open: none.** The full-core suite remains red solely on the
accepted load-sensitive startup-module timeout. The documented Solr bootstrap
issue and deferred-work items remain open independently. **P7.1 remains
unsatisfied; P7.2–P7.6/G7 remain BLOCKED** by the RC/early-access CLI and MongoDB
runtime gate. Waterline and the explicit selector remain intact. This round
does not qualify official v6. The review-fix commit includes the required Codex
co-author trailer and is local only; no push is performed.

## Final review round 5

Reviewed **2026-10-19**, the entire feature `git diff 0cfbd62b9..dbca1f675`
and this round's fixes. Read AGENTS.md, the behavioral contract, implementation
plan/tasks, P0 characterization, previous reviews and relevant wiki guidance.
Independent standards and spec reviews covered production, tests, lifecycle,
configuration, exports, build/CI/Docker, dependency pins/locks and documentation
evidence. They found no additional feature defect and also checked this round's
changes. Waterline and the explicit selector remain intact.

**Outcome:** two findings fixed: simplify diagnostic classification and repair
a reproduced Prisma test-fixture failure/cleanup path. No new issue remains open.

### Findings and outcomes

| Severity | Location | Finding and outcome |
| --- | --- | --- |
| P2 / simplification | `packages/redbox-core/src/persistence/cache/errors.ts` | **Fixed.** Building diagnostic allowlists from the entire MongoDB export surface, `MongoErrorLabel` and Node's system-error map adds an eager driver import to logger configuration and suppresses useful institution diagnostics. Replace the catalogs with identifier-shaped error names/constructor names and labels, safe integer codes and uppercase `E*` codes. Continue omitting native messages, stacks, details and causes. Production code shrinks by eight lines and no longer needs either catalog import. A direct before/after probe confirms that `InstitutionCacheError`, `E_CACHE_TEMPORARY` and `RetryAfterReconnect` were discarded before and are retained now. |
| P2 / test reliability | `packages/redbox-core/test/integration/CacheEntryPrisma.test.ts` | **Fixed.** The initial live run failed its successful Sails datastore connection with `Server selection timed out after 500 ms`, before any test ran. Its unconditional final preflight then threw before teardown, retaining native/Sails resources and leaving Mocha alive. Terminating that review-owned process allowed the runner's container trap to run. Give successful fixture connections five seconds, retain 500 ms for the deliberately unreachable target, and guarantee teardown after failed setup or final preflight. Preserve successful graceful-shutdown/repository assertions. The final live suite passes all 16 tests; injected rejection at the actual Sails load callback now produces only the expected setup failure and exits naturally. No production timeout changes. |

### Logging design and safety assessment

Error class names, codes and labels are diagnostic metadata. Their syntax can
be checked without importing the driver or maintaining driver-specific catalogs;
hook diagnostics should not depend on the installed driver's export list.
Messages, payload-bearing fields and nested causes remain internal. Existing
tests still check malformed metadata, cached-payload omission, realistic network
causes/codes, cyclic causes, original read errors and memory-first void writes.
The new hook regression covers both explicit error names and constructor fallback,
unknown valid metadata, a credential-bearing URL label and non-string labels.

The global Pino `err` serializer remains appropriately scoped: it replaces only
recognized cache failures, including those inside startup wrappers, and delegates
unrelated errors to Pino's standard serializer. Keep its cycle-safe cause traversal
and module-reload recognition. The meaningful existing regression exercises the
real generated bootstrap, Captain's Log, Pino and installed Sails callback-less
lift failure, including Sails' second log; unrelated errors retain messages,
stacks and causes. No serializer rewrite is needed.

Before the change, importing the error helper loaded MongoDB but did not load
Prisma. Removing that dependency avoids unnecessary logger import work; no
startup-speed claim is inferred from one measurement. The extended offline smoke
asserts that importing logger configuration loads neither MongoDB nor Prisma,
then verifies core/service exports and generated shims with zero socket attempts.
Core still legitimately imports the MongoDB driver elsewhere, and Prisma runtime
initialization remains lazy. The accepted baseline startup timeout is unchanged.
The hook guide now describes the actual metadata policy rather than the retired
catalogs.

### Verification

Host **Node 24.18.0**, TypeScript **5.9.3**, npm **12.0.2** for installed build/test
scripts only; no lock maintenance. Read-only root/core lock checks and the clean
packed Docker consumer use **Node 26.11.1 / npm 11.20.0**. Database runners own
digest-pinned **MongoDB 8.0.34** containers and random ports/private networks;
the Prisma fixture uses synthetic authentication.

| Check | Result |
| --- | --- |
| `npm --prefix packages/redbox-core run build` | Pass: deterministic generation, compilation and runtime artifact copying. |
| `npm run test:core` | **Exit 1: 4,113 passing, 91 pending, 1 failing (2 minutes).** Sole failure: the accepted unchanged startup child `ETIMEDOUT` at `test/unit/startup-module-loading.test.ts:37`. Run on final production code; the later opt-in fixture-only adjustment is covered by the final live suite and scoped typecheck below. |
| `npm --prefix packages/redbox-core run check:cache-contract` | Pass; generated JSON/declarations remain unchanged and fresh. |
| Focused five-file regression command from round 4 | **78 passing (9 seconds)**, including scoped Sails/Pino logging, hook metadata, network causes, payload omission and characterization. |
| `P3_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-prisma` | **16 passing (7 seconds)** after the fixture repair: authenticated normalization, raw mapping, validation/log safety, preflight, startup failures and cleanup. |
| Setup-failure injection below | **Expected exit 1**, one synthetic before-hook failure, no after-hook failure; natural process exit, not the 60-second timeout. Mocha reports 767 ms. |
| `P5_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-transition` | **8 passing (1 minute)**: both adapters, mixed processes, restart/rollback, default Prisma and loaded hook overrides. |
| `bash packages/redbox-core/test/fixtures/cache-persistence/run-waterline-capture.sh` | **1 physical fixture + 1 loaded hook-model test passing**; tracked archive unchanged. |
| `npm --prefix packages/redbox-core run test:cache-package` | **Exit 0.** Clean strict npm 11.20.0 production installation, consumer types, offline installed artifacts/shims with zero sockets, dependency pruning, slim Docker runtime and installed Prisma CRUD/raw BSON on isolated MongoDB 8.0.34. |
| `node packages/redbox-core/test/fixtures/cache-persistence/repository-import-smoke.cjs` | Pass: logger import loads neither MongoDB nor Prisma; core/service/shim operations attempt zero sockets. |
| `node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.cache-persistence.json` | Pass, rerun after the fixture changes. |
| Scoped Oxlint / Prettier / `git diff 0cfbd62b9 --check` | Pass: zero production lint warnings/errors, all four touched code/test files formatted, no whitespace errors. |
| `node support/specs/prisma-cache-persistence/evidence/p5/harness/promotion-config.cjs` | Pass: 24 selector checks, 12 Compose configurations, three both-backend CI matrices. |
| Root/core `npm ci --dry-run --ignore-scripts --strict-peer-deps --no-audit --no-fund` | Both pass with read-only checkout mounts under npm 11.20.0; lock-consistency checks, not clean full root/core installs. |
| Dependency pins, documentation links, task/evidence audit | No additional defect or unsupported advancement of P0–P6/G7 found. |

Replay the fixture setup failure from the checkout root after building core.
This preloader changes only in-memory test code; the ordinary runner still owns
its isolated MongoDB container. Expect the synthetic before-hook failure, exit 1
and no lingering handles/after-hook failure:

```bash
fixture_probe=$(mktemp /tmp/redbox-r5-fixture-XXXXXX.cjs)
cat > "$fixture_probe" <<'NODE'
const assert = require('node:assert/strict');
const Module = require('node:module');
const compile = Module.prototype._compile;
Module.prototype._compile = function (source, filename) {
  if (filename.endsWith('/test/integration/CacheEntryPrisma.test.ts')) {
    const callback = '(error) => (error ? reject(error) : resolve())';
    assert(source.includes(callback), 'Sails load callback must be instrumented');
    source = source.replace(callback,
      '(error) => reject(error ?? new Error("synthetic failed Sails setup"))');
    process.stderr.write('[fixture-fault] Rejecting setup after the real Sails load callback\n');
  }
  return compile.call(this, source, filename);
};
NODE
fixture_status=0
NODE_OPTIONS="--require=$fixture_probe" P3_SKIP_BUILD=true timeout 60s \
  npm --prefix packages/redbox-core run test:cache-prisma || fixture_status=$?
rm "$fixture_probe"
test "$fixture_status" -eq 1
```

All review-created containers, networks, tagged package images and temporary
installs were removed by their runners. The initial failed fixture's empty
temporary app directory and the fault-injection preloader were removed explicitly.
Existing development containers/data were not modified. No full portal/Angular
image, Bruno/browser, native storage or institution restore campaign was repeated;
those retain their audited P4–P6/prior-review evidence. Temporary logs are not
durable replay inputs; the tracked tests/runners and commands above are.

### Open items and release decision

**New review issues open: none.** The accepted startup timeout, Solr bootstrap
issue and deferred-work items remain separate. **P7.1 is unsatisfied;
P7.2–P7.6/G7 remain BLOCKED** by RC/early-access tooling and the MongoDB runtime
maturity gate. Prisma remains the next default, with Waterline and its explicit
selector retained. This round does not qualify official v6. The local review-fix
commit includes the required Codex co-author trailer; no push is performed.

## Final review round 6

Reviewed **2026-10-19**, the entire feature `git diff 0cfbd62b9..11113b0e6`
and this round's fix. Read AGENTS.md, the design/plan/tasks, P0 characterization,
prior reviews and applicable wiki guidance. Independent standards and spec
reviews supplemented the runtime review of persistence, services, lifecycle,
configuration/logging, exports, tests, CI/Docker, packages/locks and evidence.
Previously justified decisions and accepted open items were retained.

**Outcome:** one confirmed CI/test-discovery defect fixed. No additional
production, behavioral-contract or documentation defect was found.

### Finding and outcome

**P1 — clean-checkout core test discovery required unbuilt artifacts.**
`packages/redbox-core/test/integration/CacheEntryPrisma.test.ts` required core
`dist` modules at file scope, before its opt-in check. The standalone
`test-redbox-core` CI job installs dependencies with scripts disabled and checks
contract freshness, then runs source Mocha tests **before** building core in the
later transition step. `dist` is untracked, so even the skipped Prisma suite
failed discovery with `MODULE_NOT_FOUND` on a clean checkout. Earlier local
review runs had built core first and therefore did not expose this defect.

Move the built-module imports into the activated suite's `before` hook, keeping
typed module handles and the existing dynamic core handle. A skipped suite now
registers without built files; an activated suite still exercises the compiled
runtime and artifacts. `describe.skip` executes its registration callback, so
placing imports only inside that callback would not fix the issue. No CI build
prerequisite, production code, adapter/selector, dependency, lock or contract
artifact changes are needed.

Independent reproduction in a temporary package tree with dependencies present
and `dist` absent failed before the fix with
`Cannot find module '../../dist/persistence/cache/runtime'`; afterward Mocha
exited zero with **16 pending**. The full source suite was then run with the
checkout's actual `dist` temporarily moved aside and restored by an EXIT trap:
**4,114 passing, 91 pending, zero failures**. This also exercises the existing
CI discovery path as the regression check.

### Round-5 verification and retained limits

The metadata-only diagnostic helper, scoped Pino serializer and offline import
guard remain correct. The import smoke confirms logger configuration loads
neither MongoDB nor Prisma and core/service/shim operations attempt zero sockets.
The live Prisma suite passes all 16 cases after the lazy-import change. Replaying
round 5's Sails-load callback fault injection yields exactly one synthetic
before-hook failure, no after-hook failure and natural exit status 1, confirming
that setup failure still reaches teardown. Successful connection budgets remain
five seconds; the deliberate unreachable connection retains its 500 ms budget.

The whole-feature audit found no additional actionable issue in npm 11 lock
semantics, exact dependency pins, generation/copy ordering, Docker/Compose,
explicit Markdown targets or task evidence. P0–P6 retain their recorded evidence
and historical replay qualifications. No task or release gate was advanced.

### Verification

Host **Node 24.18.0 / npm 12.0.2**, TypeScript **5.9.3**, for installed scripts
only; no lock maintenance. Read-only lock checks use **Node 26.11.1 / npm
11.20.0**. Live Prisma and fault-injection runners each own a separate
digest-pinned **MongoDB 8.0.34** container, random loopback port and synthetic
credentials. Commands start at the checkout root.

| Check | Result |
| --- | --- |
| `npm --prefix packages/redbox-core run build` | Pass before and after the fixture fix: generation, TypeScript and runtime artifact copying. |
| `npm --prefix packages/redbox-core run check:cache-contract` | Pass, including after the final build; generated artifacts remain unchanged. |
| `npm run test:core` | **Exit 0: 4,114 passing, 91 pending** initially; final source run with core `dist` absent also passes **4,114 / 91 / 0**. The original startup deadlines are unchanged. |
| `P3_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-prisma` | **16 passing (6 seconds)**: authenticated datastore normalization, raw mapping, validation/log safety, index preflight, failures, ownership and shutdown. |
| Round-5 setup-failure injection command | **Expected exit 1**, one synthetic before-hook failure, zero after-hook failures; natural exit, Mocha reports 2 seconds, below the unchanged 60-second probe bound. |
| `node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.cache-persistence.json` | Pass on the final fixture. |
| Scoped Oxlint / Prettier / `git diff 0cfbd62b9 --check` | Pass: zero covered production lint warnings/errors, changed test formatted, no whitespace errors. Tests are excluded by repository lint configuration and covered by scoped typechecking/execution. |
| `node packages/redbox-core/test/fixtures/cache-persistence/repository-import-smoke.cjs` | Pass on final build; logger imports neither driver nor Prisma, imports/exports/shims attempt zero sockets. |
| `node support/specs/prisma-cache-persistence/evidence/p5/harness/promotion-config.cjs` | Pass: 24 selector checks across 12 Compose configurations, including generated hooks, and three both-backend CI matrices. |
| Root/core `npm ci --dry-run --ignore-scripts --strict-peer-deps --no-audit --no-fund` | Both pass in Node 26.11.1 / npm 11.20.0 with a read-only checkout mount; consistency checks, not new clean installations. |
| Manifest pins / explicit Markdown targets / task evidence | No additional defect; 22 tracked manifests and 191 explicit changed-Markdown file targets checked. |

The source-suite absence check used a temporary directory for the existing
`dist`, ran the ordinary `npm run test:core`, then restored the saved build
unchanged on shell exit. The round-5 recorded
fault-injection recipe remains applicable. Temporary logs are observations,
not additional replay inputs; tracked tests/runners and these commands are the
replay inputs. The final type-only annotation adjustment does not change the
JavaScript exercised by the source/live runs.

Both live runners removed their containers/anonymous volumes, and the
fault-injection preloader was removed automatically with its temporary-file
context. No review-owned container remains. Existing development containers
and data were not modified. This fixture-only fix does not
require another full portal/Angular build, packed-runtime, Bruno/browser,
transition, native-storage or institution-restore campaign; their prior bounded
evidence remains unchanged.

### Open items and release decision

**New review issues open: none.** Both full-core executions pass this round;
that does not resolve the accepted load-sensitive startup timeout established
by prior baseline measurements. The Solr bootstrap issue and deferred work
remain separate. **P7.1 is unsatisfied; P7.2–P7.6/G7 remain BLOCKED** by the
RC/early-access tooling and MongoDB runtime maturity gate. Prisma remains the
`next` default, with Waterline and its explicit selector retained. This round
does not qualify official v6. The fix and review record are committed locally
with the required Codex co-author trailer; no push is performed.

## Final review round 7

Reviewed **2026-10-19**, the entire feature `git diff 0cfbd62b9..f9708f40a`,
including round 6's deferred fixture imports. Read AGENTS.md, the design,
implementation plan/tasks, P0 characterization, prior reviews and applicable
wiki guidance. Independent standards/build/CI and spec reviews supplemented
the runtime review of persistence, services, startup/cleanup, configuration,
logging, exports, tests, packages/locks, Docker and documentation/evidence.

**Outcome: NO ISSUES FOUND.** No code, test or documentation correction was
required. This section is the only tracked change for round 7. Standards and
spec reviews both reported zero actionable findings. Previously justified
decisions and accepted open items were retained; no task or gate was advanced.

### Test discovery and prior-fix review

Round 6's built-module imports execute in the activated Prisma suite's `before`
hook, after the runner builds core. Skipped discovery executes neither those
imports nor setup. An independent module-resolution guard rejecting core `dist`
paths discovers all four opt-in cache suites with **26 pending, zero failures**.
The complete ordinary source suite also passes with the checkout's actual core
`dist` temporarily moved aside and restored by an EXIT trap: **4,114 passing,
91 pending, zero failures**. No deadline or discovery setting was changed.

`CacheEntryTransition` imports only Node helpers through `transition-client`
until `start()` forks its compiled worker. `CacheEntryRepositoryWaterline` and
`CacheEntryWaterline` use source imports. `MongoSharedClients` runs in the built
portal test image; storage CI explicitly compiles core before discovering storage
tests. These paths do not repeat the round-6 clean-checkout defect. The activated
Prisma suite and both-adapter transition suite pass on the final build.

The production audit found no new behavioral, lifecycle/ownership or diagnostic
defect. Strict JSON/plain record mapping, effective application datastore
selection, explicit index establishment, startup failure cleanup, safe logging
and P0 service semantics remain consistent with the design. Package generation,
artifact copying/pruning, npm 11 lock semantics, exact dependency pins and CI
ordering remain sound. Operator/hook documentation and completed P0–P6 evidence
retain their recorded scope and historical replay qualifications.

### Verification

Host **Node 24.18.0 / npm 12.0.2**, TypeScript **5.9.3**, ran installed scripts
without lock maintenance. Read-only root/core lock checks use **Node 26.11.1 /
npm 11.20.0**. Live runners own separate digest-pinned **MongoDB 8.0.34**
containers with random loopback ports; Prisma uses synthetic authentication.
Commands start at the checkout root.

| Check | Result |
| --- | --- |
| `npm run test:core`, with core `dist` absent | **Exit 0: 4,114 passing, 91 pending, zero failures.** Saved build restored on shell exit. |
| `npm --prefix packages/redbox-core run build` | Pass: generation, TypeScript compilation and runtime artifact copying. |
| `npm --prefix packages/redbox-core run check:cache-contract` | Pass before and after build; committed artifacts unchanged. |
| `P3_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-prisma` | **16 passing (15 seconds)**: activated compiled fixture, authenticated datastore normalization, raw mapping, logging, preflight, failures and cleanup. |
| `P5_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-transition` | **8 passing (1 minute)**: both adapters, default Prisma, mixed processes, restart/rollback and loaded hook overrides. |
| `bash packages/redbox-core/test/fixtures/cache-persistence/run-waterline-capture.sh` | **1 physical fixture + 1 loaded hook-model test passing**; archive unchanged. |
| `node support/specs/prisma-cache-persistence/evidence/final-review/check-storage-driver.cjs` | **9 passing**, actual storage driver 7.2.0 on MongoDB 8.0.34. |
| `node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.cache-persistence.json` | Pass. |
| Scoped Oxlint of persistence, CacheService, logging/config, bootstrap shim and Sails typing | Pass: zero warnings/errors. |
| `node packages/redbox-core/test/fixtures/cache-persistence/repository-import-smoke.cjs` | Pass: logger loads neither MongoDB nor Prisma; core/service/shim operations attempt zero sockets. |
| `node support/specs/prisma-cache-persistence/evidence/p5/harness/promotion-config.cjs` | Pass: 24 selector checks across 12 Compose configurations and three both-backend CI matrices. |
| Root/core `npm ci --dry-run --ignore-scripts --strict-peer-deps --no-audit --no-fund` | Both pass under npm 11.20.0 with read-only checkout mounts; consistency checks, not clean installations. |
| Manifest pins / explicit Markdown file targets / `git diff 0cfbd62b9 --check` | Pass: 20 tracked `package.json` files have no version ranges, all 191 explicit file targets resolve, no whitespace errors. |

The initial root lock dry-run used an empty temporary npm cache with networking
disabled; npm requested registry metadata for an existing override. That attempt
was stopped and its owned container removed. Repeating with network access
passed; the core dry-run passed without networking. No manifest/lock was edited.
Temporary logs are observations; tracked tests/runners and the commands above
are the replay inputs. The promotion audit generated only ignored fixtures.
No full portal/Angular image, packed-runtime, Bruno/browser or institution restore
campaign was repeated; their prior bounded evidence remains unchanged.

All review-created containers and anonymous volumes were removed by their
owning runners. No review-owned container remains. Existing development
containers and data were not modified.

### Open items and release decision

**New review issues open: none.** This passing core run does not resolve the
accepted load-sensitive startup timeout established on the base. The Solr
bootstrap issue and deferred work remain separate. **P7.1 is unsatisfied;
P7.2–P7.6/G7 remain BLOCKED** by RC/early-access tooling and the MongoDB runtime
maturity gate. Prisma remains the `next` default, with the Waterline adapter and
explicit selector retained. This round does not qualify official v6. The review
record is committed locally with the required Codex co-author trailer; no push
is performed.
