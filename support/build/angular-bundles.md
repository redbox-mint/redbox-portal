# Angular production bundle checks

`angular/angular.json` sets an initial bundle budget for each of the 20 embedded
apps. Angular enforces these in every production build, including Docker image
builds. Budgets count raw initial JavaScript and CSS, with statically imported
chunks counted once; lazy features do not count toward the initial budget.
Component style budgets remain unchanged.

[`angular-bundle-baseline.json`](angular-bundle-baseline.json) retains three distinct measurements:

- `baseInitialBytes` / `baseLazyBytes`: original `57c12dcee` production builds,
  before the six script optimisation fixes, module split, browser ESM runtime
  and deferred form editor/upload work.
- `isolatedInitialBytes` / `isolatedLazyBytes`: the module/script change built
  separately against the original CommonJS shared package and form source.
- `initialBytes`, `initialJsBytes`, `initialCssBytes`, `lazyBytes`: final combined
  production builds, with the form importing core services and record providers.

All sizes are bytes. Original JS/CSS splits are available for form and login;
other original measurements record the combined JS+CSS total only. Final
`initialGzipBytes` is a reproducible compressed-size estimate: the sum of Node's
`gzipSync` default level 6 applied separately to each initial emitted file,
including empty CSS files. It excludes HTTP headers, server configuration and
network effects. Original compressed sizes were not remeasured, so this is not a
before/after transfer comparison. Angular's build-log transfer column uses a
different compression method (Brotli).

The final combined form and login measurements are:

| App | Original initial JS + CSS | Final initial JS + CSS | Final local gzip estimate |
| --- | ---: | ---: | ---: |
| form | 2,928,202 + 105,552 = 3,033,754 | 1,564,161 + 105,552 = 1,669,713 | 445,004 |
| local-auth (login) | 1,098,837 + 0 = 1,098,837 | 486,260 + 0 = 486,260 | 148,584 |

Error thresholds allow approximately 10% growth from the final initial total,
rounded up to 10 kB. Warning thresholds allow approximately 5%, with the same
rounding, capped at the **original** warning target. Existing 500 kB targets are
preserved even when the final app still exceeds them: the JSON records `warning`
and the validation log lists those outstanding warnings. Do not increase a
budget solely to silence a regression.

To inspect a specific app after compiling `sails-ng-common` and the Angular
libraries:

```bash
cd angular
node_modules/.bin/ng build @researchdatabox/local-auth --configuration production --stats-json --delete-output-path=true
cd ..
node support/build/angular-bundle-stats.cjs local-auth
```

Pass multiple app names to report several fresh builds. Angular 22 writes
`assets/angular/<app>/browser-stats.json`; the checker also accepts `stats.json`
from earlier application builders. Finding both files fails with a request to
clean and rebuild. The checker follows static JS/CSS imports and extracted CSS,
deduplicates shared chunks, excludes intermediate component CSS already embedded
in JavaScript, and verifies all emitted JS/CSS sizes against the stats. It
recognises opaque URL-safe hashes and configured injected bundle names; bundles
with `inject: false` count as lazy unless statically imported by initial code.
Missing configured entry points or incomplete outputs fail the check.

The checker enforces production script optimisation and every initial error
budget. Initial budgets must supply absolute maximum warning/error limits
without a relative baseline; Angular itself continues to enforce component-style
and other configured budget types. JSON reports include raw initial JS/CSS,
lazy bytes, files, budget limits and warning state. A standalone check proves
consistency between stats and emitted files, not freshness against current source.

`support/build/compileProductionAngular.sh` always builds apps with fresh output
and stats and runs the checker before continuing. CircleCI tests the stats
checker and builds the Docker image through this script, so the gate runs for
all apps in the CI image build. Diagnostic metafiles are removed after a
successful check unless requested:

```bash
ANGULAR_BUILD_STATS=true support/build/compileProductionAngular.sh
```

Run the accounting regression tests with:

```bash
node --test support/build/angular-bundle-stats.test.cjs
```

Remeasure **all** apps and update recorded sizes and limits together after changes
to shared imports, dependency locks or deferred form features. Review initial and
lazy sizes and exercise affected features before accepting a decrease. The
[committed validation log](angular-bundle-validation.txt) records the combined
build commands, module tests, stats tests, final sizes and remaining concerns for
independent review. All 20 final error limits pass. The original 500 kB warning
targets remain exceeded by manage-users, record-audit, dashboard-config-editor
and manage-roles.
