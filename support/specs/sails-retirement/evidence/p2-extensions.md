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
