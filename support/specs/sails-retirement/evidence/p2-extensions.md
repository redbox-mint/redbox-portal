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
