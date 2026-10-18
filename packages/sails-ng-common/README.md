# sails-ng-common
Common models shared between Sails API endpoints and client-side Angular code

## Installation
`npm install @researchdatabox/sails-ng-common`

## Node and browser builds

`npm run compile` emits the original CommonJS API to `dist/src` and native ESM
to `dist/esm`. Node `require` and Node ESM imports keep using the CommonJS API,
including `handlebarsInstance().compile`, `handlebarsCompile`, and
`handlebarsPrecompile`. Historical `dist/src/...` imports remain supported.

Browser bundlers resolve the ESM entry through the `browser` export condition
(with `module` and `browser` fields for older bundlers). The public named exports
remain available. The browser `handlebarsInstance()` exposes the Handlebars
runtime for helper/partial registration and precompiled template execution;
it does not expose a compiler. Browser code that explicitly needs compilation
must import `handlebarsCompile` or `handlebarsPrecompile`. These exports retain
the compiler only when used, and share the runtime's custom helper, partial,
and decorator registries. Compilation still requires CSP permission for dynamic
code generation; production templates should remain server-precompiled.

Focused subpaths are available for `handlebars-runtime`, `runtime`,
`record-save.model`, `record-concurrency.model`, `record-diff`, `jsonata-helpers`,
`html-helpers`, and `date-format-helpers`. The `runtime` entry preserves the
shared API except for Handlebars compile/precompile exports. Prefer the focused
subpaths for new consumers that only need one contract or helper.

The ESM build uses the same pinned Lodash functions through `lodash-es`.
The build finalizer rewrites only TypeScript-parsed module specifiers and adds
explicit relative `.js` extensions; configuration/template strings are unchanged.
CommonJS imports still use Lodash. The Angular workspace's `luxon` and
`lodash-es` paths select workspace declarations and one browser implementation
even when the shared package has its own `node_modules`. Its `browser` custom
condition also selects the matching browser declarations for TypeScript.
Keep these settings
when integrating with changes owned by other Angular workstreams. Custom hook
workspaces can use equivalent aliases if their local dependency layout also
produces duplicate copies.

The side-effect policy is intentionally selective. CommonJS remains conservative,
and both ESM package manifests preserve `config/dictionary.model.js`, whose
module evaluation populates the default/class dictionaries. Helper registration
occurs on the first explicit instance/template request and preserves later hook
overrides. There is no blanket `sideEffects: false` declaration.

## Markdown loading and integration

Importing the package, registering helpers, and rendering HTML or empty Markdown
does not load Marked. The first non-empty Markdown helper call starts one cached
dynamic import. The synchronous `markdownToHtml` helper returns its input until
the parser is ready, and also falls back to the input if the chunk fails to load.
Its return type and sanitization responsibilities are unchanged.

For HTML on the first Markdown render, the rendering owner must await the loader
after detecting Markdown content, before executing its precompiled template:

```ts
import { loadMarkdownParser } from '@researchdatabox/sails-ng-common/handlebars-runtime';

if (outputFormat === 'markdown' && content) {
  await loadMarkdownParser();
}
// Execute the template using the existing runtime and sanitize its output.
```

This is an integration requirement for the form/content workstream: moving
loading off module evaluation removes the old incidental preload. The package
cannot make synchronous Handlebars rendering await a chunk. This change does not
edit form components or the template service; callers that do not await can
display raw Markdown on their first render. Do not preload Marked globally.

## Verification and measured effect

From this package, run `npm ci --ignore-scripts`, `npm run compile`, and
`npm run test:full`. Tests cover CommonJS behavior, browser ESM resolution,
runtime execution without dynamic code generation, custom helper/partial
registration, focused exports, and Markdown demand/loading/failure behavior.
The browser build check inspects retained output bytes rather than every parsed
input, so an unused compatibility compiler import does not produce a false
failure. `npm pack --dry-run` verifies both output trees are included.

Production measurements against `57c12dcee` used Angular 22.2.0, esbuild 0.28.2,
the existing production configuration, and unchanged application/library sources.
Build `portal-ng-common` and `portal-ng-form-custom` first, then run
`ng build @researchdatabox/<app> --configuration production --stats-json`.
Sum the main entry and its static JavaScript imports from `browser-stats.json`;
exclude CSS and dynamic imports. Compare compressed sizes by gzipping each
initial JavaScript asset separately with Node's `gzipSync` defaults.

- Local-auth initial JavaScript: 1,098,837 to 536,026 bytes (51.2% smaller);
  gzip: 320,400 to 161,855 bytes. All JavaScript: 1,142,599 to 579,530 bytes.
- Form initial JavaScript: 2,928,202 to 2,524,209 bytes (13.8% smaller);
  gzip: 835,927 to 726,304 bytes. All JavaScript: 3,619,539 to 3,215,327 bytes.
- Both builds retained two Luxon implementations before and one ESM
  implementation after. Full `lodash/lodash.js` disappeared, and retained
  Handlebars compiler/source-map modules fell from 20 to zero.
- All 410 package tests and the 8 Angular Handlebars template-service tests passed.
  The package coverage run reported 90.26% lines, above its unchanged threshold.

Remaining application bundle warnings include JSONata, the Handlebars runtime,
and other existing CommonJS dependencies. The broad root API can still make
Angular's diagnostic report a parsed compiler import even though production
output retains zero compiler bytes. Explicit compiler imports will retain it as
intended. These measurements cover two representative apps, not every embedded
app or external hook. EJS hosting, CSP policy, persistence code, and locale/date
algorithms are unchanged; date helper tests exercise the shared behavior.

Build verification adds pinned development dependencies `esbuild` 0.28.2,
`sinon` 22.0.0, and `@types/sinon` 21.0.1. The latter two make the existing logger
tests self-contained. The package lock also repairs missing glob/minimatch
transitives that prevented a clean install at the baseline. Runtime dependency
versions are unchanged.
