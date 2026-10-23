# P2 extension implementation evidence

Started from `cdd058941` on `stack/sails-retirement`, in the shared root checkout.
Commands run from the repository root with the following PATH prefix unless stated:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
```

Node 26.11.1 / npm 11.20.0, TypeScript 5.9.3, ts-node 10.9.2 and Mocha 11.7.6.
P1 runtime/domain/host are reused; P3 orchestration is outside this phase.

## SR-012 — Installed async discovery

`src/extensions/loading.ts` separates direct installed dependency discovery,
public-export resolution, native awaited import and ESM/CommonJS normalization
from the legacy shim loader. Production discovery excludes devDependencies by
 default; development tooling can opt in. Hidden package manifests are read from
Node's installed dependency search paths, including linked installations; source
folders are never substituted. Entrypoints use Node import conditions, including
ESM-only exports, rather than `require.resolve`'s require conditions. Declarations
are marked with `redbox.extension` (`.` or an exported subpath). No global cache.

Dependency addition: **import-meta-resolve 4.2.0**, exact, to resolve public import
conditions against the installation's URL without Node's experimental parent-URL
flag, writing helper files into installed packages, or inventing an exports
resolver. It has no runtime dependencies. The lock update preserves unrelated
entries; npm's initial reclassification/pruning of unrelated optional packages was
excluded from the committed lock delta.

Commands actually run:

```sh
npm view import-meta-resolve version
npm --prefix packages/redbox-core install import-meta-resolve@4.2.0 --save-exact --ignore-scripts --no-audit --no-fund
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --timeout 5000 test/extensions/loading.test.ts
```

Build **exit 0**. Loader cases **4 passing, 0 failing, 0 pending**: hidden manifest,
import/require condition divergence, top-level await, named/default/CJS exports,
missing/broken entrypoints, sanitized error, invalid/ambiguous contract and explicit
dev-dependency inclusion. Early fixtures lack ESM main metadata and emit Node's
DEP0151 warning; these fixtures are corrected in the next slice. Actual `npm pack`
production-artifact proof follows in SR-017; this slice's cases install temporary
package directories, and are not counted as packed-artifact evidence.

## SR-013 — Neutral declarations and offline resolution

`contract.ts`, `resolution.ts`, and the narrow `extensions/index.ts` implement
apiVersion 1. The implemented interface is documented in `../extensions-v6.md`.
Config/forms/workflows/jobs/contributors/work declarations and installed resource
roots remain inspectable without constructing modules. Selection is per call,
without a second process registry. Routes require explicit access and named
replacement; collisions also normalize path parameter names. Priority matches P0:
listed hooks win, first listed is highest, unlisted lookup is descending name;
contributions reverse lookup. Migration declarations are sorted lexically.

Executed the SR-012 command with both `test/extensions/loading.test.ts` and
`test/extensions/resolution.test.ts`: **8 passing, 0 failing, 0 pending**.
`npm --prefix packages/redbox-core run typecheck:application`: **exit 0**, including
new strict extension test checks. No module factory/work runs during resolution.
A test-local variable named `module` initially conflicted with the CommonJS wrapper
and Mocha retried it as ESM (`exports is not defined`); renamed to `makeModule`.
No production module-format change or assertion removal. ESM main fixture warnings
from SR-012 are resolved by explicit main metadata.

Follow-up validation during SR-017 review: route collision keys now match the
partial Express host's default case-insensitive/non-strict router, including
parameter-name aliases, and config models require object definitions. Existing
resolution cases cover these failures. Qualified Node 26 focused extension suite
**11 passing, 0 failing/pending**; incremental core TypeScript build **exit 0**.
One earlier local focused rerun accidentally selected system Node 24.18.0 because
its PATH was relative to the package working directory; it also passed, but the
subsequent explicit absolute Node 26 PATH run is the qualification result.

## SR-014 — Selected factories and owned host integrations

`composition.ts` binds only winning factories to their own concrete inputs,
then hands the resulting closures to P1 `ApplicationRuntime`. It does not expose
a universal container or create a second registry. Each composition owns its
handler/integration instances. Native integrations are registered as application
resources before initialization/preparation, receive the host's single server,
and activate only through the runtime. Explicit middleware stages and policy
execution precede routes. Missing policy bindings fail before acquisition.

Focused extension command: **11 passing, 0 failing, 0 pending**. Real loopback
Express tests cover inactive admission, policy/middleware order, one integration,
preparation failure cleanup and retained/retried close failure. Two applications
prove separate selected instances; discarded core factories are never invoked.
Strict `typecheck:application` **exit 0** after adding explicit Request/Response
types to the SR-013 test handler. Correction to SR-013's intermediate record: its
first typecheck actually failed on those two implicit parameters (the asynchronous
command had not completed when that evidence sentence was written). The final
strict typecheck includes both slices and passes; no compiler option was weakened.

## SR-015 — Storage registration and readiness

Neutral public entry `@researchdatabox/sails-hook-redbox-storage-mongo/extension`
declares its existing config, `storage` factory and unchanged lexical revision
backfill migration name. The existing StorageProtocol/Prisma/GridFS implementation
now takes structural ownership plus explicit log, form, record-type, disk,
translation and export-limit operations. The legacy constructor/events live only
in `compat`/the legacy PrismaStorage entry. No storage data or repository interface
was changed. There was no storage-provided schema contributor to port; the generic
contract records contributor module prerequisites without inventing one.

Core adds public `extensions`, `extensions/storage`, `application`, `record-types`
and `http/express` package entries with existing deep-entry compatibility retained.
The narrow storage surface re-exports existing implementations only. One trigger
expression helper moved out of CoreService and both old/new callers delegate to
it, avoiding a second implementation. CoreBase and the legacy barrel are absent
from the standalone storage import graph. Configuration merging and executing
migrations via the ledger remain P3.

Real Mongo setup/observations:

```sh
docker run -d --name sr-p2-mongo8 --memory=768m -p 127.0.0.1::27017 mongo:8.0.34 --bind_ip_all --wiredTigerCacheSizeGB 0.25
docker port sr-p2-mongo8 27017/tcp
docker exec sr-p2-mongo8 mongosh --quiet --eval 'JSON.stringify({version:db.version(),fcv:db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion})'
```

Port **34901**, live **MongoDB 8.0.34 / FCV 8.0**, unauthenticated standalone.
Same P1 image `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
The new fixture checks a disposable `sr_p2_extensions` URL, creates separate logical
core/storage databases and drops only those databases at teardown.

Commands actually run:

```sh
npm --prefix packages/sails-hook-redbox-storage-mongo ci --ignore-scripts --strict-peer-deps --no-audit --no-fund
npm --prefix packages/redbox-core run build
# Subsequent core incremental compile, from packages/redbox-core:
./node_modules/.bin/tsc
npm --prefix packages/sails-hook-redbox-storage-mongo run build
EXTENSIONS_TEST_MONGO_URL=mongodb://127.0.0.1:34901/sr_p2_extensions node --test packages/redbox-core/test/extensions/storage-mongo.cjs
MONGO_TEST_URL=mongodb://127.0.0.1:34901/sr_p2_storage MONGO_CONCURRENCY_TEST_URL=mongodb://127.0.0.1:34901/sr_p2_concurrency npm run test:storage-mongo
npm run lint
git diff --check
```

New standalone/Mongo: **3 passing, 0 failing, 0 skipped** (~4 seconds); missing
indexes reject startup/clean resources, storage capability is ready before strict
RecordTypes bootstrap, real record and GridFS read/write pass, stale handles fail,
a fresh owner reopens data, and an accepted GridFS upload retains clients/pools
through a failed deadline, rejects unrelated work, finishes and closes on retry.
No global/loaded Sails, CoreBase, core barrel or compat module. This tests native
byte ownership; HTTP uploads/Companion remain P6.

Existing storage suite: **304 passing, 0 failing, 0 pending**, ~1 minute, including
real concurrency/lifecycle/intent/backfill/pagination cases. No integration skip.
Repo lint **exit 0**, **860 files, zero warnings/errors**. Diff check **exit 0**.

Intermediate failures are not acceptance results: the initial installed storage
Mongo driver was **6.21.0**, inconsistent with its existing **7.7.0** exact lock.
First clean install failed EACCES on old root-owned files; a Node 26 Docker run
restored node_modules ownership to uid/gid 1000, and locked install succeeded
(**559 packages**). Initial builds exposed missing narrow exports and a legacy
base-method seam; corrected explicitly. Two dependent builds ran before core's
new declarations finished emitting and failed on missing exports; final sequential
build supersedes them. One mistaken `npm --prefix ... exec -- tsc` ran in the root;
the recorded core incremental compile uses its actual working directory. Initial
Mongo fixture errors were a non-hex brand, wrong existing create signature and an
over-specific stale-error regexp, corrected to the real contracts. Initial storage
suite **303 passing / 1 failing** needed the existing overridable metTriggerCondition
method preserved; the final 304-case rerun passes unchanged assertions.

## SR-016 — PDF lifecycle and declarations

`pdfgen/extension` is a neutral public subpath: offline PDF config, typed config
model descriptor, existing `PDFService-CreatePDF` job and owned PDF module requiring
storage. `PDF.ts` is the single generation implementation, extracted from the old
PDFService entry with explicit brand/config/log/datastream/staging/audit inputs.
The old entry is a constructor/export adapter only. Audit helpers use injected
operations, with the previous optional-audit behavior retained by its compatibility
wrapper. No global Sails, service base, event readiness or lower patch participates
in neutral generation. Legacy PDF shutdown now registers with P1's shared Sails
persistence adapter; its custom lower patch and swallowed shutdown errors are gone.

Initialization does not execute jobs. Explicit activation enables generation;
drain refuses new submissions and interrupts/awaits generation and retry fibers.
Accepted staging/datastream writes are uninterruptible until their actual promises
settle. Browser/page/temp-directory cleanup failures stay owned for stop/retry
rather than being logged as successful closure. Backend queue activation remains
SR-023; real portal browser/progress/upload integration remains P6.

Commands/results (Node 26 PATH as above):

```sh
npm --prefix packages/redbox-dev-tools ci --ignore-scripts --strict-peer-deps --no-audit --no-fund
npm --prefix packages/sails-hook-redbox-pdfgen run compile
node --test packages/redbox-core/test/extensions/pdf-lifecycle.cjs
npm --prefix packages/sails-hook-redbox-pdfgen run test:unit
npm run lint
```

PDF strict production compile **exit 0**. Neutral lifecycle **4 passing, 0 failing,
0 skipped**, ~1 second: offline/activation gate, real generation control flow with
a fixture browser, accepted write deadline/drain/retry, canceled delayed retry and
retained/retried failed browser close. The test executes the existing renderer and
Effect fibers; it stubs Chromium and byte-store operations, not the PDF lifecycle.
No Sails/barrel/compat import is loaded. Existing PDF/audit/config suite **75 passing,
0 failing, 0 pending**, ~1 second. Includes navigation/token restrictions, retries,
readiness options, duplicate suppression, audit parent/child linkage and cleanup.
Repo lint **exit 0**, **867 files, 0 warnings/errors**.

Intermediate issues fixed: strict compile rejected an optional legacy datastream
service name; it now fails with an explicit missing-configuration error. The
initial PDF test harness lacked dev-tools test types (old root-owned node_modules);
locked dev-tools reinstall succeeded after the same uid/gid repair (**172 packages**).
Node's native TS stripping conflicted with ts-node, as P0 characterized; PDF's
Mocha config now disables it. Test scripts also collided as global TS scripts and
used an unresolved sinon namespace: test moduleDetection is now `force` and the
audit stub uses an explicit type import. Strictness remains enabled. The legacy
lower test now verifies cleanup before the shared adapter's wrapped callback and
completion of the original caller callback; no assertion was deleted. No npm
version or dependency pin changed in SR-016. Browser binaries, public HTTP and
real queue backends were not qualified by these fixture tests.

## SR-017 — Packed production and offline loading

`test/extensions/run-packed.cjs` runs real `npm pack --ignore-scripts --json`
for core, storage, PDF, four internal runtime dependencies and three format
fixtures. Artifacts use the previously validated compiled/Prisma output; skipping
pack lifecycle scripts avoids rebuilding dependent packages out of order. Builds
are verified separately. The consumer is a fresh `/tmp/redbox-p2-packed-*`
directory outside this checkout, with `NODE_PATH` empty and internal file
references overridden to their actual direct tarballs. No source symlinks.

```sh
node packages/redbox-core/test/extensions/run-packed.cjs
# Inside its isolated consumer:
npm install --omit=dev --ignore-scripts --no-audit --no-fund
# Remove consumer node_modules completely, then:
npm ci --offline --omit=dev --ignore-scripts --no-audit --no-fund
node verify.cjs
```

Full runner **exit 0**, Node **26.11.1**, npm **11.20.0**. Both installations
**1,334 packages**; cached offline reinstall **exit 0**. Consumer **12 assertion
groups**, **0 failures/skips**: import-only ESM dependency and both top-level awaits,
hidden manifests/public exports, bundled storage/PDF declarations, no Sails/barrel
imports, no socket connect/listen during inspection, no require-cache path outside
the consumer, CommonJS override wins without ESM factory construction, two isolated
application instances, real Express inactive/active response and owned stop.
Named/default normalization and sanitized missing-entry diagnostics additionally
pass the installed loader fixtures (SR-012). Successful sandbox removed.

First consumer attempt failed because its regexp expected different Node package
export error wording; corrected to `ERR_PACKAGE_PATH_NOT_EXPORTED`. The corrected
consumer passed against that installation, followed by the complete passing runner.
Existing dependency warnings include deprecated packages and the pre-existing
ro-crate-modes git dependency whose integrity npm does not check. This proves an
offline reinstall from a populated cache, not a first-ever air-gapped install.
It neither activates PDF queue processors nor installs browser binaries.

First passing artifacts (compiled source through `c3d1cbbb1`; final phase artifact
rerun below includes subsequent validation and development changes):

| Artifact | Files | SHA-256 |
| --- | ---: | --- |
| `researchdatabox-sails-ng-common-0.2.1.tgz` | 568 | `6d23632ef3a9f4c59637fc9e8ca44e480e7c87d6218132bf3ca81289c9442a72` |
| `researchdatabox-agenda-sqs-backend-0.0.1-beta.9472.tgz` | 20 | `76d426e7ab5d9c71af1fff96e528bf800970132eb5ea4431eb7d9a87c2a3720f` |
| `researchdatabox-raido-openapi-generated-node-0.0.3.tgz` | 12 | `d40363198433495e887285046e26e5a7067917b7e690540e2ccb57ec48d30adf` |
| `researchdatabox-rva-registry-openapi-generated-node-0.0.1.tgz` | 11 | `31131336308eb0fdf0ecb2d59e2bc455a8b64597ebb3cafcfb75923d7c03b82d` |
| `researchdatabox-redbox-core-0.0.1-beta.9022.tgz` | 1803 | `86403f981248129fa5f37d548644f6377f7f45a5be5372d1d17d8d051ae402e1` |
| `researchdatabox-sails-hook-redbox-storage-mongo-1.5.3.tgz` | 48 | `ed18399bae6c328f65cd84493299ee29efb4fea66de7abe812318f261c715f71` |
| `researchdatabox-sails-hook-redbox-pdfgen-1.0.0.tgz` | 45 | `6489a7d8427f69c11e752fce84fde1381991a9735bf89e2e855f4a25156455a9` |
| `sr-esm-only-1.0.0.tgz` | 2 | `e5a6e1e9187afde18781788d9c6c39a9862497e92c4ad60a14d318dfd05f2b89` |
| `sr-esm-hook-1.0.0.tgz` | 2 | `89025988a1495236d6a36e21e7c1a9a197d6f332c2ee2ad8bfe3b91fe0b73c21` |
| `sr-commonjs-hook-1.0.0.tgz` | 2 | `60241f39f9d9485118c478fab03c2b2d9991c52563d92ab1e352c9a78f4d4c9e` |

## SR-018 — Development registrations and initial v6 scaffold

The development hook now exposes `./extension` with neutral config/forms/workflows
and retains the legacy entry as a comparison adapter. Both delegate to
`getDevelopmentRegistration`; demo/Playwright definitions are reused, not copied.
The existing pure DOI binding helper has a narrow `extensions/config` public
entry, avoiding the core barrel in this import graph. The development-only
scenario flag and environment gate remain in use. Existing Sails function-name
strings, redirect and view settings are declared configuration data; their later
execution/conversion remains inventoried P3/P5 work, not claimed portal parity.

Dev-tools provides `init --template v6` alongside the unchanged default comparison
archetype. Its generated module owns a real native file handle through explicit
initialize/activate/drain/close; handler input is just the required operation.
It declares config, an intentionally public named route, awaited migration and
bootstrap functions, and packed view/asset directories. The migration/bootstrap
operations are injected and not executed on import. No v6 framework/container,
listener, process handlers, Sails shim or alternate implementation is generated.
The sample's migration name must be chosen before an institution's first release.

[Before/after conversion examples](../hook-migration-v6.md) cover services,
controllers/routes/policies, config, forms/contributors, bootstrap/migrations,
views/assets and native resources. They distinguish CommonJS format from Sails
source compatibility and describe remaining orchestration/host/tooling work.
All scaffold source is inside this repository; no external repo changes needed.

Commands (qualified Node PATH):

```sh
npm --prefix packages/redbox-hook-dev run build
npm --prefix packages/redbox-dev-tools run build
./node_modules/.bin/tsc --noEmit -p packages/redbox-dev-tools/test/tsconfig.json
NODE_OPTIONS=--no-experimental-strip-types npm --prefix packages/redbox-dev-tools test
```

Builds and strict test typecheck **exit 0**. Complete dev-tools suite **50 passing,
0 failing/pending**, ~25 seconds, including legacy archetype/generators, actual
CLI v6 init, generated output strict compilation against public declarations,
exact generated pins, and actual file admission/drain/cleanup. A numeric/hyphenated
hook name exercises generated identifiers/config keys. No assertions removed.

Initial suite stopped before execution on two existing implicit-any callbacks;
annotated the needed `{ name?: string }` shape without weakening strictness.
Next run **49 passing / 1 failing** caught mixed Express 4/5 ambient typings in
this shared checkout. The contract now exports the host's native Express 5
`RequestHandler` type and the scaffold uses that public type, avoiding an extra
Express types dependency. Subsequent complete 50-case run passes. The first
format check caught the expanded CJS consumer's formatting; formatted and the
subsequent focused check passes. No installed dependency pin changed in SR-018;
generated TypeScript 5.9.3 / Node types 24.12.4 reuse repository pins and core's
exact installed version. Complete generated-app packaging remains SR-047/SR-053.

## Legacy package-export compatibility follow-up

First phase-wide Mongo-backed core run: **4,351 passing, 68 pending, 4 failing**
(~2 minutes). Two migration beforeEach hooks could not resolve the existing
`@researchdatabox/redbox-core/dist/persistence/branding/runtime` path; their two
afterEach restores consequently failed too. This was a P2 regression: a package
exports wildcard does not perform CommonJS extension/directory fallback. The
compiled runtime.js existed. A fresh Node process deterministically reproduced
it, excluding missing build output and an old resolver cache. This small manifest
failure needed no instrumentation or broader bisection.

Minimal red/green loop actually run (Node 26):

```sh
node -e 'const assert = require("node:assert/strict"); const core = require("node:module").createRequire(require.resolve("@researchdatabox/redbox-core/package.json")); assert.equal(core.resolve("@researchdatabox/redbox-core/dist/persistence/branding/runtime"), core.resolve("@researchdatabox/redbox-core/dist/persistence/branding/runtime.js"));'
npm --prefix packages/redbox-core test -- --grep 'Admin sidebar text colour migration|Branding typeface backfill migration'
```

The resolver command changed from **MODULE_NOT_FOUND / exit 1** to **exit 0**.
Focused existing suites: **26 passing, 0 failing/pending** (85 ms test execution).
No migration/test implementation changed. The manifest now maps extensionless
compiled modules and each existing compiled index directory explicitly, preserving
explicit .js/.json/.d.ts/.map and other package paths. Packed verification also
asserts the extensionless runtime and recordTypes directory resolve to the same
files as their explicit .js entries, without importing the legacy barrel. No new
dependency, no runtime shim, and no debug instrumentation left behind.
