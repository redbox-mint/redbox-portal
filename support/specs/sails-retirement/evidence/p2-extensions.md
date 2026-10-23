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
