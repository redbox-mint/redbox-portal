# Angular production bundle checks

`angular/angular.json` sets an initial bundle budget for each embedded app.
Angular checks these during every production build, including the Docker image
build. Budgets count raw initial JavaScript and CSS, including statically imported
chunks; lazy features do not count toward the initial budget.

The measured Angular 22 baseline in `angular-bundle-baseline.json` records the
unchanged `57c12dcee` builds and this change's isolated results. Warning thresholds
allow approximately 5% growth and error thresholds approximately 10%, rounded up
to 10 kB. Component style budgets are separate and unchanged.

To inspect a specific app after compiling `sails-ng-common` and the Angular libraries:

```bash
cd angular
node_modules/.bin/ng build @researchdatabox/local-auth --configuration production --stats-json
cd ..
node support/build/angular-bundle-stats.cjs local-auth
```

Pass multiple app names to report several fresh builds. Angular 22 writes
`assets/angular/<app>/browser-stats.json`; the checker also accepts `stats.json`
from earlier application builders. It follows static imports, deduplicates shared
chunks, checks the stats against emitted file sizes and enforces the production
script optimisation setting and initial error budget. It prints JSON containing
initial bytes, lazy bytes, individual files and warning/error limits. Missing or
incomplete stats fail the check. Angular's intermediate component CSS entries
are excluded because those styles are already embedded in the JavaScript.

For diagnostic stats and checks throughout the production build script:

```bash
ANGULAR_BUILD_STATS=true support/build/compileProductionAngular.sh
```

Stats generation is opt in so normal runtime images do not contain the diagnostic
metafiles. The normal Angular build still enforces all configured budgets.

Run the stats-accounting regression tests with:

```bash
node --test support/build/angular-bundle-stats.test.cjs
```

After merging the adjacent shared-package ESM and form performance changes,
rebuild **all** apps from the final lockfile and update the recorded sizes and
budgets together. The isolated measurements still include the base commit's
CommonJS shared package; successful ESM tree shaking and form lazy loading should
permit lower budgets. Check initial and lazy sizes and exercise the affected
features before accepting a decrease. Do not increase a budget solely to silence
a regression.
