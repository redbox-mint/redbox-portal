# Bounded P5 rehearsal inputs

These are archived inputs, not a maintained benchmark product. The reusable
transition contracts live under `packages/redbox-core/test/fixtures/cache-persistence`.
All datasets are synthetic and all database containers are disposable. The guarded
URL prefix is `redbox_cache_p5`; the P2 replay preserves its existing guard
`redbox_cache_p0_p5_promotion` on its own newly created server. Never substitute
an institution/development DB.

Restore these files into `.tmp/prisma-cache-p5/` before using the recorded commands.
The Compose overrides record this worktree's absolute path; substitute your own
checkout root. Build the repository runtime image as in P4, or substitute another
qualified runtime with the same Node version in the overlays. Root and core must
already be compiled. The normal Docker Mocha runner installs its transient build
dependencies; do not run concurrent root dependency maintenance.

For the exact previous release:

```bash
mkdir -p .tmp/prisma-cache-p5/rollback-source
git archive 0cfbd62b93260b63ad907d7c01ed9f33a2af619e | \
  tar -x -C .tmp/prisma-cache-p5/rollback-source
cp support/specs/prisma-cache-persistence/evidence/p5/harness/Dockerfile.rollback \
  .tmp/prisma-cache-p5/rollback-source/Dockerfile.p5
docker build --progress plain -f .tmp/prisma-cache-p5/rollback-source/Dockerfile.p5 \
  -t redbox-cache-p5:rollback-build-0cfbd62b9 .tmp/prisma-cache-p5/rollback-source
mkdir -p .tmp/prisma-cache-p5/rollback-runtime
cp support/specs/prisma-cache-persistence/evidence/p5/harness/Dockerfile.rollback-runtime \
  .tmp/prisma-cache-p5/rollback-runtime/Dockerfile
docker build --progress plain -t redbox-cache-p5:rollback-0cfbd62b9 \
  .tmp/prisma-cache-p5/rollback-runtime
P5_TRACE_STARTUP=true bash .tmp/prisma-cache-p5/run-rollback.sh
```

The second layer restores the exact root dependency graph after the standalone
core build; removing its standalone node_modules without this step would also
remove required root-lock nested dependencies. The offline version probe checks
both original lock hashes, root MongoDB driver 7.2.0, nested core driver 7.7.0,
and absence of the new persistence runtime before the old application runs.

The old image contains only its archived source, its own locked dependencies and
compiled output. The full-portal run mounts deployment configuration, synthetic
bootstrap data from that same snapshot, and an observer that loads the untouched
old app entrypoint. The separate ORM probe mounts current transition fixtures,
which explicitly detect/use the old direct Waterline API. It never mounts current
core code or node_modules into the old application.

`run-compare.sh` owns/removes its new Mongo container/volume. Run it after builds
and other test stacks finish. `compare.cjs` records six independent processes in
W/P/P/W/W/P order, identical warmup, primary workload and two further fixed
retention workloads. Forced GC snapshots compare retained memory; completion
polling and connection sampling are observational overhead shared by both.
Brand metadata is fixed in this minimal application; actual BrandingService CSS
generation, preview persistence and consumption use the selected live adapter.
Full portal/API/browser correctness is independently checked by the other runs.

HTTP setup copies the existing REST branding requests into `bruno-rest/`, the
existing admin Login plus `App Branding*.bru` into `bruno/`, and the collection
metadata, exact package/lock and upload fixtures from `test/bruno/`. Each uses a
minimal `environments/int-test.bru` with `host: http://redboxportal:1500`; REST also
uses the synthetic integration default token. `run-bruno.sh` selects these local
copies without changing assertions. The AJAX files' helper path is made relative
to collection root (`./bruno-helpers.js`). Browser execution uses the repository's
unmodified A17 case, Chromium and pinned matching Playwright container.

Browser runs use trustworthy `http://localhost:1500` in the portal network
namespace and the same Sails `appUrl`, with CSRF enabled. This keeps strict COOP
and CSP diagnostics meaningful. `P5_HTTP_SKIP_BRUNO=true` starts directly in this
mode when replaying only the already-independent browser stage. Preserve each
backend's `.tmp/playwright/logs/run-metadata.json`, diagnostic JSON and JUnit
report before the next browser run overwrites them. Freeze the shell scripts
and shared Compose/JavaScript inputs for the duration of any run. The recorded
`run-http-waterline-final.sh` and `run-http-prisma-browser-final.sh` commands
are frozen copies of `run-http.sh`; recreate those filenames with `cp` if
replaying the exact recorded commands.

The observer control starts no application and runs for 22 seconds, long enough
to include the driver's heartbeat/monitoring transition. The first four-second
probe was too short; the archived final control reproduces two initial and then
three observer-only connections.

The startup-timeout baseline uses `git archive 6f50def34` for the complete
`packages/redbox-core`, `packages/redbox-dev-tools/config`, root `package.json`
and `tsconfig.json` under `.tmp/prisma-cache-p5/g4-startup-baseline`. Symlink that
archive's root/core node_modules to the unchanged installed root/core trees.
Run its unchanged `test/unit/startup-module-loading.test.ts` with the root Mocha
executable, `--no-config -r ts-node/register/transpile-only`, Node's
`--no-experimental-strip-types`, and TS_NODE_PROJECT pointing at the archive's
core test/tsconfig.json. Both archived and current isolated tests retain the
original 12-second child deadline; the final full-suite retries are independent.

Post-promotion verification uses `promotion-config.cjs` to render both hook
Compose templates, materialize the index helper, validate all profiles/default
Prisma and explicit Waterline selection, and assert all three CI Mocha matrices.
`promotion-waterline-model.sh` replays the original P2 loaded-model test in its
own server with the original URL guard; it does not weaken that guard.
Rollback image tags were removed after qualification; rebuild them using the
commands above. Their tested image/lock identities remain in rollback-image.json.
