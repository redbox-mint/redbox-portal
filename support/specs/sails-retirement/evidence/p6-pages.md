# SR-040 — Owned EJS pages and installed artifacts

Implementation base **3ec8e47cfb986802b3eedfae6c78e9fe63d88e72**, branch
`stack/sails-retirement`, shared checkout, host **agentvm**, 2026-10-24 Adelaide.
This round changes no dependency versions or lockfiles. SR-005 institution
designation and P7 packaging/release qualification are outside this round.

Implementation commits: **2c75aec74** (shared page operations) and
**b75b69f9c** (owned pages, artifact assembly/delivery and route qualification).
**706134318** adds themed operation errors and the final branded 404 with direct
HTML/JSON/failure assertions. The browser harness also verifies the visible 404.

## Surface and selected collaborators

`http/express/pages.ts` owns **34 HTML route declarations** and the development
root redirect. `pageAssets.ts` owns branding delivery, fonts, dynamic configuration
and compiled expressions, followed by guarded static delivery. The regenerated
inventory has **333 declarations**, all assigned standalone implementations;
**51 declarations** belong to SR-040 (50 distinct mounts: the legacy plain and
constrained preview declarations describe one handler). The inventory source SHA
identifies the implementation base. Historical P5 inventory counts are historical.

Protected pages bind owned browser authentication, current brand membership,
`checkAuth`, no-cache and brand/portal policies, plus session CSRF on legacy ALL
unsafe methods. Record pages also check current record brand and view/edit ACLs;
create pages resolve create authorization and the starting workflow form. Login
and homepage remain public, with current actor/brand checks when authenticated.
The root redirect is public and validates its configured local target.

Page operation errors render installed 403/404/500 EJS in the chosen layout for
HTML requests. The final branded 404 handler is mounted after every owned route
and static delivery and binds the same brand/actor/checkAuth/CSRF policies. JSON
error negotiation retains the empty JSON response; a failed error template/layout
terminates with a status-labelled text response rather than recursively rendering.
Policy denials retain their own empty/JSON/redirect responses.

The page adapter receives initialized forms/types, reports, dashboards,
translations, branding, current settings and record access explicitly. The shared
`navigation/Navigation`, `pages/Templates`, `pages/csp` and branding-delivery
implementations contain the extracted algorithms; comparison services/controllers
delegate to them. `Forms.extractRawTemplates` owns the existing visitor operation.
There is no second evaluator or per-request Sails fallback. Existing comparison
tests retain their behavioral assertions, with explicit bindings for the extracted
operations in their fixtures.

Templates use the request's `page` API for configuration, URLs, role checks,
translation and Angular bundle hashes. They contain no Sails/global-service
discovery or `req.param` dependency. The comparison adapter supplies these same
locals before its existing render call. Standalone rendering uses EJS directly,
including layouts, partials and cross-package includes; no `res.view()` is needed.
`functions.ejs` is inert. CSP logic retains analytics sources, API-doc exceptions,
fresh request nonces, report-only behavior and HTTP development handling. The
comparison policy retains sanitized logging and branding-resolution fallbacks.

`PageArtifacts` accepts ordered installed view/asset roots. Its initialized EJS
overlay preserves hook/core includes and precedence; close removes the overlay.
`package-pages.cjs` assembles explicit separate source roots into `views`/`assets`.
A child-process test removes both source directories, changes working directory
and renders the installed result with no Sails module/global. Traversal, dotfiles
and symlinks escaping a declared root are refused. The browser host uses only the
assembled artifact for page/asset resolution, including all 20 current Angular
apps. `npm run package:pages` is build-time assembly, not a new application host.

Webpack's script public path comes from `data-redbox-root`, including record
pages' duplicate bundle declaration. CSS font URLs and the Angular loading image
also retain the deployment prefix. These fixes were necessary for the real
`/portal` browser workflow, rather than just successful HTML shell responses.

## Qualification and commands

Qualified PATH at the repository root:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
```

Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**, ts-node **10.9.2**,
Mocha **11.7.6**, Express **5.2.1**, EJS **7.0.1** (core consumer), Angular
**22.2.0**, webpack **5.111.1**, Playwright **1.64.0**. Real provider image IDs,
ports and browser commands are in [the integrated evidence](p6-browser-lifetime.md).

```sh
npm --prefix packages/redbox-core run build
./node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json
npm --prefix packages/redbox-core run typecheck:application
./node_modules/.bin/tsc --noEmit
npm --prefix packages/sails-hook-redbox-pdfgen run compile
(cd angular && node node_modules/@angular/cli/bin/ng.js build form --configuration production)
(cd angular && node node_modules/@angular/cli/bin/ng.js build local-auth --configuration production)
npm run webpack
npm run lint
npm --prefix packages/redbox-core run lint
node support/specs/sails-retirement/evidence/route-inventory.cjs
node support/specs/sails-retirement/evidence/route-inventory.cjs --check
git diff --check
```

Clean core build (actual Prisma generation/copy), subsequent production compile,
strict application source/test typecheck, root typecheck and PDF hook compile
passed. Both Angular production builds passed (form **41.417 s**, local-auth
**6.624 s**) with dependency optimization/budget warnings; webpack passed in
**212.952 s**, **9 warnings**. Lint: **1056 files, zero errors/warnings**.
Package lint (including scripts), inventory generation/check and diff check
passed. Local logs are
`.tmp/sails-retirement/pages-{build-final,compile-final4,types-final2,root-types,
angular-form3,angular-local3,webpack3,lint-final}.log`.
After the final error-page fix, production compile, strict application typecheck,
1056-file zero-warning/error lint and inventory check passed again
(`pages-errors-{compile,types,lint}.log`). The final full Mongo core repeat also
passed **4420 / 68 existing pending / zero failing**, exit **0**
(`pages-core-final3.log`).

Focused compatibility/artifact regressions, from `packages/redbox-core`:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 10000 \
  test/http/PageArtifacts.test.ts test/controllers/BrandingFontDelivery.test.ts \
  test/controllers/CoreController.test.ts test/controllers/CoreControllerViewResolution.test.ts \
  test/services/NavigationService.test.ts test/services/FormRecordConsistencyService.test.ts \
  test/policies/contentSecurityPolicy.test.ts test/policies/RequestChroniclePolicies.test.ts
```

**117 passing, zero failures/pending**, `pages-regression-final2.log`. This includes
installed-artifact execution, hook precedence, escaped includes, CSP, existing
branding/font behavior, navigation/form regressions and sanitized policy logging.
The standalone page suite intentionally runs without legacy `test/setup.ts`;
it has its own explicit `test:http-pages:mongo` command and participates in the
[final integrated matrix](p6-browser-lifetime.md#integrated-http-bruno-and-core-regression).
The initial matrix completed **169 passing / zero failures/pending**, including
the original **8 page cases**. After the themed-error follow-up, the final matrix
completed **171 passing / zero failures/pending**, including all **10 page cases**,
and **34 Bruno requests / 53 scripted checks**. Full Mongo core:
**4420 passing / 68 pre-existing pending / zero failures**, exit 0. Pending cases
do not establish new acceptance.

## Browser and HTTP behavior

The real Docker browser runs each passed **4/4 cases, zero skips/failures**.
The final run includes the visible themed 404. Angular local login, visible
create, save, edit and reload
persisted both title changes in Mongo. The browser asserted no page errors and
loaded the copied artifacts under `/portal`. The same host also completed real
Keycloak login and the multipart/tus/Companion/progress/lifetime cases.

`PagesMongo.test.ts` exercises every protected HTML declaration anonymously
(login redirect), every declaration with a foreign-brand actor (403), all admin
shells with a wrong-role actor (403), denied create, malformed query shapes,
missing records/config/dashboard definitions and a sanitized backend failure.
It renders the installed shells, tests request-scoped CSP, French translation,
legacy redirect, real trusted reverse-proxy HTTPS/host headers, canonical
deployment paths and session-bound missing/invalid/valid CSRF on ALL `/home`.
Asset cases cover CSS validators/304 and max-age, JS MIME/HEAD, private paths,
persisted logo/favicon bytes, immutable content-addressed fonts, cross-brand font
denial and one-use no-store preview CSS. Dynamic settings/compiled expressions
use the same domain operations as the existing client consumers.

## Failure history and bounded parity claims

Early builds/typechecks found missing explicit collaborator types and narrow
adapter casts; those were corrected. Early standalone HTTP invocation wrongly
included the legacy global setup; the isolated invocation fixes the host boundary.
Browser failures exposed root-relative chunks/fonts/spinner, then the session
callback and detached PDF scopes documented in the integrated evidence. Assertions
were corrected to the existing recordmeta and socket-token wire shapes; readonly
PDF readiness now requires actual record content, not an error shell.

The first full core run found comparison CSP fallback/logging regressions and
fixtures missing the newly extracted bindings. The fixes preserve the original
behavioral assertions. An EJS optional head-extra fallback was also corrected and
is actually rendered in its regression test. No acceptance timeout was raised.

Final review identified missing themed HTML error responses despite the original
eight page tests passing. Added actual 403/404/500 HTML, JSON negotiation and
failed-error-artifact assertions, plus a visible browser 404 check. The first
expanded run had **8 passing / 2 failures** because the fixture mounted its final
404 before the later record-write routes. Moving static/404 delivery after all
owned routes restored create behavior; **10 passing / zero failures/pending**
followed (`pages-http-errors2.log`). The page adapter shares one locals/rendering
operation for these responses; it does not emulate the Sails view hook.

Released v5.0.4 provenance: commit
`c1dda53999f3b026347008731f33dba834e06c27`, amd64 image
`sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9`,
index `sha256:30471ce55d64db63fa90abad29496cb291ed750846164a3bcf1229760d8cba0f`.
This round inspected that artifact and reused P0 released-v5 observations; it did
not execute a new exhaustive v5 browser comparison. Later branding/dashboard
features are compared with the integrated source, not claimed as v5.0.4 features.

Two pre-existing artifact gaps are preserved and are not functional acceptance
claims: `/record/view-orig/:oid` has no template in either current source or the
inspected released image (the standalone authorized-record response is 500, tested);
profile renders its shell but references old userProfile bundles for which no
current Angular project exists. SR-040 does not invent replacement product UIs.
Institution themes/hooks and production topology remain SR-005/P7 qualification.
