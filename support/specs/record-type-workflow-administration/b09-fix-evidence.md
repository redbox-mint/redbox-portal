# B09 final independent re-review correction

Starting commit: `2f7681ae3eeb18b5c89371cb09062c38e0ea32e4`, clean existing worktree.
This evidence supersedes the earlier follow-up's gate, mock and test-count claims.
Prior production fixes and commits are retained. This correction changes test
harnesses, test placement, CI runner wiring and documentation; no runtime source changes.

## Mandatory generated production/native gate

[Gate documentation](../../integration-testing/B09-native.md) describes prerequisites,
normal integration/CI wiring and direct invocation. `run-mocha-redbox.sh` invokes
`run-b09-native.sh` unconditionally in a separate Sails process before normal tests,
including when custom test paths are requested. Both Compose profiles use that runner;
CircleCI's backend `test:mocha:ci` step explicitly names the required gate. `set -e`
propagates failures. The later application pass excludes only the generated HTTP test
already executed by the mandatory subprocess. There is no `B09_HTTP_MOUNT` skip.
Running the generated test without its bootstrap fails an assertion.

Missing database URL and unavailable Mongo were tested: both return nonzero with
specific prerequisite diagnostics. Mongo selection has a five-second limit. The gate
requires installed dependencies, built packages and a disposable database, uses
`migrate: drop`, generates loader shims in a temporary app and lifts production
routes, discovered controllers/services, policy mappings, brand/path rules, sessions,
CSRF and body parsing. Authentication identity and the registered action descriptor
are fixtures. Brands, roles, forms, all secret/draft/lifecycle writes, and publication's
default authority use native Mongo. The normal integration CSRF-disable environment
variable is explicitly removed in the isolated gate; production CSRF remains enabled.

## Native coverage

The generated HTTP test includes discovery/private-action exclusion, Admin and brand
policy denials, missing CSRF, malformed and oversized parser inputs in development
and production response modes, redaction, encryption, provider/Admin version
interoperability, tombstone clears and legacy counters.

Its controlled matrix has **12 lifecycle race scenarios**: PUT/DELETE versus
save/discard/publication, with lifecycle first and secret first. Barriers pause the
actual HTTP service's initial draft read or the native slot write. The tests compare
persisted slot data, exact counters, identity/fence, draft, revisions and history.
Successful encrypted writes are decrypted with the slot AAD and checked against the
input; clear persists a null-ciphertext tombstone with exactly one counter increment.

Publication leaves the draft version unchanged. A secret write resumed after completed
publication succeeds while the persisted publication snapshot stays unchanged.
Save/discard advance the draft version and cause the resumed request to return 409
without changing the slot. While the secret writer holds the fence, every competing
lifecycle mutation rejects without changing the captured persisted state.

There are **14 native fault scenarios**: each PUT/DELETE experiences acquisition
throw after commit, unacknowledged acquisition after commit, release throw before
commit, release throw after commit, unacknowledged slot update after commit, uncertain
slot update completing later, and a stale owner's attempt to release another token.
The wrappers call the actual native `updateOne`; Mongo evaluates filters and produces
matched counts. Slot updates are compared byte-for-byte with the intended update,
including the exact counter. The delayed operation is held with a latch, reports
failure first, proves provider and lifecycle competitors cannot mutate, then completes;
its original fence remains. The foreign-owner release really returns `matchedCount: 0`
and preserves the other token. A committed release whose acknowledgement is lost
leaves the fence null; failed-before-commit release leaves it held. Draft/publication
snapshots remain exact throughout. Test-only recovery runs after every writer settles.

These 26 scenarios are loops inside **one** Mocha test, not 26 additional test counts.
All run in the required gate. No sleeps establish interleavings.

## Unit/stub coverage correction

The provider mock in `packages/redbox-core/test/services/ActionSecretService.test.ts`
unconditionally replaces a map entry in its slot `updateOne`. It is **not** evidence
of Mongo null/missing filter matching, native CAS or driver acknowledgement semantics.
Its acknowledgement-loss tests exercise provider control flow in memory only. The
native scenarios above provide the storage evidence; the earlier contrary claim is
withdrawn, not carried forward.

The standalone suite moved to `test/unit/controllers.RecordDefinitionAdmin.test.ts`.
It installs function handlers and stubs branding/draft/publication services. Its real
HTTP/session/parser/CSRF middleware checks and optional Bruno invocation are adapter
unit/contract coverage, **not generated production E2E**. Bruno's counts below apply
only to that unit harness and are not evidence of native Mongo or generated discovery.

## Commands and results from this correction

Logs are `.tmp/b09-rereview-*.log`. Commands run from the worktree root:

```sh
docker run -d --name redbox-b09-rereview-mongo -p 27190:27017 mongo:7
RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:27190/redbox_b09_native bash support/integration-testing/run-b09-native.sh
# Final runtime-image run also exercises normal integration environment flags:
docker run --rm --network host -v "$PWD:/opt/redbox-portal" -w /opt/redbox-portal -e NODE_ENV=integrationtest -e sails_security__csrf=false -e LOAD_DEFAULT_FORMS=true -e RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:27190/redbox_b09_native_ci --entrypoint bash qcifengineering/redbox-portal:develop support/integration-testing/run-b09-native.sh
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config --require ts-node/register/transpile-only --require chai --require ./packages/redbox-core/test/setup.ts packages/redbox-core/test/controllers/RecordDefinitionAdminController.test.ts packages/redbox-core/test/services/ActionSecretService.test.ts packages/redbox-core/test/services/RecordDefinitionDraftService.test.ts packages/redbox-core/test/services/RecordDefinitionPublicationService.test.ts packages/redbox-core/test/model/RecordDefinitionModels.test.ts
npm --prefix packages/redbox-core test -- --timeout 15000 --reporter dot --require ../../.tmp/b07-fix-mocha-timeout.cjs
npm --prefix packages/redbox-core run build
npm --prefix packages/sails-hook-redbox-storage-mongo run build
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsc packages/redbox-core/test/record-definition-contracts.type-test.ts --noEmit --skipLibCheck --strict --target es2022 --module nodenext --moduleResolution nodenext --esModuleInterop --experimentalDecorators
node .tmp/b09-compare-strict.cjs
npm run lint
B09_BRUNO_CLI=/tmp/redbox-b09-bruno/node_modules/.bin/bru NODE_OPTIONS=--no-experimental-strip-types TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node_modules/.bin/mocha --no-config --require ts-node/register/transpile-only --require chai test/unit/controllers.RecordDefinitionAdmin.test.ts
env -u RECORD_DEFINITION_TEST_MONGO_URL bash support/integration-testing/run-b09-native.sh
RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:1/redbox_b09_native bash support/integration-testing/run-b09-native.sh
bash -n support/integration-testing/run-b09-native.sh support/integration-testing/run-mocha-redbox.sh
docker compose --profile mount -f support/integration-testing/docker-compose.mocha.yml config --quiet
git diff --check
git diff --name-only 2f7681ae3eeb18b5c89371cb09062c38e0ea32e4 -- '**/package.json' '**/*lock*' package.json package-lock.json angular
git merge-base --is-ancestor 2f7681ae3eeb18b5c89371cb09062c38e0ea32e4 HEAD
```

The inherited timeout helper raises only the hook-contributed API-doc test timeout
to 30 seconds. The strict comparator uses read-only compiler-host overlays of
`git show 74b803a0:<path>` and compares file/code/message multisets; it never switches
or rewrites the checkout. Existing external Bruno CLI installation was reused.

| Check | Observed result |
| --- | --- |
| Focused controller/secret/draft/publication/model units | 100 passing |
| Full core regression | 3,096 passing; 14 existing pending |
| Mandatory generated HTTP/native lifecycle/draft gate | 34 passing, zero pending |
| Runtime-image mandatory gate with integration flags | 34 passing, zero pending |
| Standalone stubbed HTTP adapter unit suite including Bruno | 19 passing |
| Bruno against stubbed unit harness | 27 requests passed; 54/54 test-script assertions |
| Core and storage builds/declarations | Passed |
| Root typecheck and strict public consumer | Passed |
| Strict diagnostic comparison with `74b803a0` | 749 baseline / 749 current; zero added or removed |
| Root lint/security checks | Passed; zero lint warnings/errors; 23 unsafe-expression tests |
| Explicit-type checks | Passed; 7 tests; 5,409 frozen source / 1,781 frozen declaration nodes |
| Missing URL / unavailable Mongo probes | Both failed as required |
| Shell syntax / Compose configuration | Passed |
| Whitespace and manifest/lockfile/Angular preservation | Passed; 633 tracked manifest/lock-named/Angular files byte-identical to starting commit |

An initial new race assertion incorrectly assumed publication advanced the draft
version; inspection of the production lifecycle corrected the assertion to its actual
contract. It now verifies successful ordered mutation plus immutable publication state.
The first full core run overlapped the core build's removal/re-emission of `dist`:
3,085 passed, 14 were pending and 11 failed, including missing emitted modules and
worker failures. The full regression was rerun after builds completed with output
stable; the table reports that final run. No assertions were weakened or tests skipped.
No production behavior was changed to satisfy the harness. The full normal Compose
application suite and CircleCI job were not executed here; the actual dedicated gate
was executed directly and in the runtime image, and its normal runner wiring was checked.

## Non-expiring fence limitation and preservation

The fence deliberately has no TTL. A crashed process, lost acquisition/release
acknowledgement or uncertain slot write can leave an identity unavailable indefinitely.
Recovery requires quiescing **all** writers, checking the authoritative slot and
counter, and clearing only the abandoned token. Never reset the slot/counter or expire
a fence while a writer can resume. Automatic reconciliation is not implemented.

The existing branch/worktree and all prior commits are retained. Dependency manifests,
lockfiles (including the prior Angular lockfile change), Angular sources and unrelated
files are unchanged against the starting commit. No new runtime/source `any`/`unknown`
or emitted declaration nodes were introduced. B10 and later slices remain unchanged.
