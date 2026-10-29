# ReDBox Portal Angular Projects

Main monorepo for Angular projects.

The embedded applications use Angular 22 with zoneless change detection. Use the
Node version in the repository's `.nvmrc` and the pinned TypeScript version in
`package.json` when building them.

## Rendering without Zone.js

Application bundles and their EJS views do not load Zone.js. Angular schedules
renders when a template signal changes, an Angular event listener runs, an
`AsyncPipe` receives a value, or `ChangeDetectorRef.markForCheck()` is called.
Asynchronous callbacks that update ordinary properties must notify Angular;
`NgZone.run()` alone does not schedule a render in a zoneless application.

Components use `ChangeDetectionStrategy.OnPush` so unchanged component subtrees
can be skipped. Use signals for template state and replace input objects/arrays
when updating a child from its parent. Angular template events and the shared
`BaseComponent` asynchronous method helper notify the affected view.
State read through a shared data source must also notify its consumers. Report
and deleted-record results use signal-backed accessors so `record-table` updates
even when its data-source input keeps the same object reference.

Dynamic form fields observe their control's `events` stream to render value,
validity, touched, and pristine changes, with subscriptions disposed when the
field is destroyed. Field configuration changes go through `setProperty()`.
Silent control writes (`emitEvent: false`) must explicitly synchronize their
display with `syncComponentDisplayFromModel()`; expression consumers do this
automatically. This also refreshes nested fields and their validation layouts.
Tabs, accordions, and rendered content use signals so dependent views update
without checking every field after unrelated events. See the
[Angular zoneless guide](https://angular.dev/guide/zoneless) and
[OnPush guide](https://angular.dev/best-practices/skipping-subtrees).

## Build 

To build all projects: execute `support/<development/build>/compile<Dev/Production>Angular.sh`

To build one project: execute `support/<development/build>/compile<Dev/Production>Angular.sh <project name>`

## Running unit tests

From the repository root, run `npm run test:angular`, or add an application name
to run one project, for example `npm run test:angular -- form`.

Zone.js is a development-only dependency for the existing Jasmine `fakeAsync`
and `waitForAsync` helpers. Only Karma test targets load it. The legacy Karma
builder opts into zone-based checking when it sees this dependency, so tests
of asynchronous rendering explicitly provide `provideZonelessChangeDetection()`.
The Playwright suite exercises the actual zoneless application bundles.

## Running end-to-end tests

From the repository root:

```sh
npm run test:playwright:up
npm run test:playwright:run
npm run test:playwright:scenarios
```

The startup regressions cover every embedded application, including delayed
configuration, and assert Angular 22 is running without a global `Zone` object.
The persistent stack also supports manual browser verification. Set
`RBPORTAL_PLAYWRIGHT_PORT` consistently for the setup and run commands when using
a port other than 1500. See the [testing guide](../support/wiki/ReDBox-Automated-Tests.md).


## Production bundle cache contract

`angular.json` configures browser applications with the
`@angular-devkit/build-angular:application` builder and production
`outputHashing: all`. With the pinned build-angular 22.2.0 / esbuild 0.28.2,
this emits eight-character uppercase base32 suffixes, for example
`main-IJTXDIZ5.js`, `polyfills-5CFQRCPP.js`, `chunk-WEQAUKNS.js` and
`styles-5INURTSO.css`. The HTTP immutable matcher in
`packages/redbox-core/src/config/http.config.ts` deliberately recognizes only
`main`, `polyfills`, `scripts`, `chunk` JS bundles and `styles` CSS bundles under
`/angular/<app>/browser/`, optionally prefixed by branding and portal. This is
a naming convention, not verification of file contents. Other filenames
revalidate in the recognized static namespaces.

When upgrading the builder, changing output hashing or adding bundle entrypoints,
check actual production output against the HTTP policy. From the repository root,
with dependencies installed and sails-ng-common compiled:

```bash
cd angular
./node_modules/.bin/ng build @researchdatabox/portal-ng-common --configuration production
./node_modules/.bin/ng build @researchdatabox/local-auth --configuration production
cd ../packages/redbox-core
REDBOX_ANGULAR_BROWSER_OUTPUT="$PWD/../../assets/angular/local-auth/browser" \
  TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config \
  --require ts-node/register --require test/setup.ts test/config/httpStaticAssetCache.test.ts
```

The opt-in test reads emitted entrypoints from `index.html`, includes shared/lazy
JS chunks and CSS from the output directory, and serves their actual bytes through
the production cache and static middleware over HTTP. Without the environment
variable, only that build-dependent test is skipped.

Static routing recognizes `js`, `styles`, `images`, `fonts`, `angular` and `icons`
at the root or after branding/portal, plus root icon/metadata files and direct
`/locales/` files. Installed hook assets use the same namespace gate, with core
files taking precedence and branded/default fallback. Branded locale URLs are
TranslationController routes and retain their existing dynamic cache policy.
Webpack copies arbitrary directories under `assets` into `.tmp/public`, but no
custom static-directory registry exists: those directories are served by Sails'
`www` middleware and do not automatically enter the cache classifier or installed
hook resolver. Custom routes/middleware must set their own cache headers, or use
`custom.cacheControl.noCache` suffixes for explicit `no-cache, no-store` handling.
Do not classify all file extensions as static: controller URLs can have them too.
