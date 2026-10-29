# ReDBox Portal Angular Projects

Main monorepo for Angular projects.

## Build 

To build all projects: execute `support/<development/build>/compile<Dev/Production>Angular.sh`

To build one project: execute `support/<development/build>/compile<Dev/Production>Angular.sh <project name>`

## Running unit tests


## Running end-to-end tests


## Production bundle cache contract

`angular.json` configures browser applications with the
`@angular-devkit/build-angular:application` builder and production
`outputHashing: all`. With the pinned build-angular 20.3.41 / esbuild 0.28.1,
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
