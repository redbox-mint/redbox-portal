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
