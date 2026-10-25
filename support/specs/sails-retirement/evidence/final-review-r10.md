4 class-(A) P1/P2 issues found

# Sails retirement final review — round 10

Four class-(A) P2 defects found and fixed; no P1 confirmed. No inherited defect was changed or added to the backlog. R9's compiled application asset priority is correct. R9's route normalization incorrectly conflated the root `/` with slash-only non-root declarations; R10-01 corrects that and the optional-alias collision bypass.

Review base `a49366803`, incoming HEAD `d8fbd8a0b`, final runtime/test input `d65e60b8f77c530729beff3724ac86f56046ebae`. Work stayed in the shared `stack/sails-retirement` checkout. No branch/worktree changes, dependency version updates, image builds, push, publication or tags. The unrelated untracked GraphQL specification was excluded. Every round commit carries the requested co-author trailer.

## Confirmed issues and fixes

| ID | Severity | Final location | Concrete failure and correction | Fix commit |
|---|---|---|---|---|
| R10-01 | P2 | `packages/redbox-core/src/extensions/resolution.ts:185` | Optional aliases and shared expanded alternatives bypass collision preflight. Expand the pinned Express matcher grammar, compare complete alternatives, and use a conservative structural identity for named replacements. Preserve the root and JavaScript regexp case semantics. | `8823651e1` |
| R10-02 | P2 | `packages/redbox-core/src/http/express/ExpressHost.ts:188` | Shutdown during asynchronous integration preparation completes application cleanup before preparation acquires its heartbeat/upgrade listener. Quiesce immediately and join host preparation before releasing modules; keep deadlines and retry ownership. | `30432850b` |
| R10-03 | P2 | `packages/redbox-core/src/http/express/progressSockets.ts:198` | An emission awaiting authorization delivers after unsubscribe has acknowledged success. Recheck the live connection and room membership immediately before delivery. | `3ae4ada44` |
| R10-04 | P2 | `assets/js/redbox-progress.js:19` | A transient token endpoint/network/response failure permanently disconnects the shipped progress helper. Retry with a fresh grant after a bounded delay, including namespace rejection; keep explicit close terminal. | `7dd36ea9f` |

These are feature-written runtime paths. Independent Standards/Spec reviews supplied the preparation race and two progress defects; duplicate observations are counted once. The code-review and Redbox Testing skills were used. R1–R9 evidence, inherited backlog, feature contracts, tracked wiki, AGENTS.md and contribution standards were read before review. The route follow-up independently reviewed the frozen structural correction and its controls.

## Complete asset precedence

The baseline cannot be represented correctly as a single ranking of “core versus hook versus Angular.” Build-time writes first produce application files, then runtime lookup compares path specificity before source roots. A compiled file may itself originate from a hook copy, generated CSS/JavaScript, Angular, a vendor package or an institution override.

At `a49366803`, `package.json:95` already ends `compile:all` with Webpack. The actual configuration is `packages/redbox-core/src/config/webpack.config.ts`: output `.tmp/public` at line 16; compiled client JS/CSS at lines 38–49; static/vendor copying at lines 50–88; font and icon emission in its module rules. Angular's normal output is under `assets/angular`; `support/development/compileDevAngular.sh` directs watch output into `.tmp/public/angular`. Core defaults, institution assets and generated client bundles converge into the same public tree.

The earlier Grunt pipeline was removed by `b8e57e0a8`. Its parent's `tasks/register/compileAssets.js` runs clean, JST, LESS, Sass, CSS minification, copy and CoffeeScript in that order; `syncAssets.js` replaces clean/copy with synchronization. The corresponding `tasks/config/{jst,less,sass,cssmin,copy,sync,coffee}.js` write compiled templates/styles/scripts, source assets and vendor files into `.tmp/public`. `copy:dev` copies source first, then explicitly listed vendor files; `sync:dev` overwrites changed public files from source. Later writes to the same destination win. The old task list names `cssmin:dev` while the inspected config defines `dist`; this historical task spelling is recorded rather than interpreted as an additional runtime source. There is no separate runtime “Grunt,” Angular or generated-file root.

Legacy hook initialization is another mutation phase: `packages/redbox-core/src/services/ConfigService.ts:207` copies each hook's `assets/` over both application `assets/` and `.tmp/public/`. Hooks merge low to high, so later higher-priority copies win. Those bytes become application artifacts. This is distinct from runtime packaged-hook lookup. Runtime hook roots come from `hooks/hookResources.ts:146` and `hooks/hookDiscovery.ts:139`: listed priority order first, then reverse lexical package name for unlisted hooks; lookup searches high to low.

The complete runtime order is derived from baseline `config/http.config.ts:406` (resolver), `:654` (branding rewrite), `:736` (middleware ordering), route/controller definitions and pinned Sails 1.5.17's `www`/`favicon` implementations. The exact registry tarball and integrity observation were retained locally.

| Phase/source | Pre-feature behavior, highest priority first | Standalone host and regression |
|---|---|---|
| Owned/generated HTTP delivery | Application router precedes static lookup: persisted/default/published themes, previews, stored logos/favicons/fonts, generated client configuration, templates and API documentation retain their route behavior. | Owned branding/dynamic handlers precede static; table plants static shadows and checks generated theme, published theme, preview, logo/favicon/font, client configuration and API docs. |
| Branded hook-eligible JS, CSS, images, fonts, Angular, icons | Candidate order: `brand/portal/resource`, `default/portal/resource`, `default/default/resource`, original direct path, deduplicated. **For each candidate:** `.tmp/public`, then packaged hooks high to low. A more-specific hook beats a less-specific compiled default. | Same candidate specificity; for each candidate, explicit application roots in supplied order (otherwise `.tmp/public`), resolved package roots high to low, then source fallback. The table removes every winner, exposing every lower source and candidate. |
| Direct hook-eligible files | Compiled public before high/low hooks. Eligibility includes the six folders above, `apple-touch-icon*`, `favicon-*` and `site.webmanifest`. | Same compiled/application-before-package order. Both default compiled root and two explicit application roots are exercised. |
| Core/application/generated/Angular artifacts | Once built or copied into public, all are ordinary compiled application files; no lower “core generated” or separate “Angular” precedence. | Actual `PortalHttp` artifacts and HTTP delivery use the same root order; Angular hash selection follows the first root supplying the bundle. |
| Other public files | Non-allowlisted files reach Sails `www` only: compiled `favicon.ico`, `robots.txt`, locales, vendor trees and any other public artifact. Hook-static lookup does not serve them directly. | Compiled/application artifacts still lead. General declared package files and raw source fallback are explicit v6 conveniences, tested after the application roots. |
| Raw application `assets/` | Build input only; absent from baseline runtime lookup. Explicit hook copies can mutate it before the next build. | Last fallback in the source checkout; packaged production pages materialize the public tree. This is an intentional v6 convenience. |
| Framework fallback | After `www`, a missing bare `/favicon.ico` can receive Sails' framework icon. | Sails framework icon retired; bundled application favicon is served through the ordinary artifact roots. No framework fallback retained. |

`PortalPageArtifacts.test.ts` now contains one table-driven test using actual `PortalHttp`, branding/dynamic handlers and static HTTP. It covers all six static families, root icons/manifest, robots, locales, vendor files, every source/specificity layer, Angular bundle hashes and generated/persisted delivery, with default and explicit application roots. Its source-order expectation agrees with baseline behavior; no runtime asset change was needed.

The committed portable probe extracts the actual baseline resolver and branding rewrite through TypeScript's AST, rather than copying their logic. From the repository root:

```sh
node support/specs/sails-retirement/evidence/final-review-r10/asset-baseline-probe.cjs
```

Result: **19 rows, 105 checks passed**. It checks all hook-static families, root icons/manifest, candidate ordering, compiled sentinels, high/low hooks, non-allowlisted paths and the separate legacy copy operation. Commit `627e1d2fe` records this derivation and the full new-host test. R8's attempt to give hooks global priority was wrong; R9's compiled-first correction remains right.

## Express route matching and collision policy

The host actually uses default Express 5 child routers: case insensitive, non-strict and end matching. Application routing settings do not change the default child router. The pinned `path-to-regexp@8.4.2` validates the same declaration Express compiles, including the 256-alternative bound. All callers were reviewed: extension-versus-extension resolution, owned-route composition and named replacements. Explicit HEAD ordering/policies remain intact.

R10-01 replaces single-regexp identity with expanded complete matcher alternatives. Capture names do not matter; URL literals remain encoded. Case folding follows JavaScript non-Unicode `i` behavior, avoiding Kelvin/ASCII conflation. Express preserves the exact root `/`, but loosens other declarations by removing all terminal raw slashes. Interior repeated slashes remain significant.

An accidental same-method collision is rejected when declarations share a complete expanded alternative. Named owned replacement additionally requires the same method and structural identity, the owned route's name and `replaces: true`. Identity discards alternatives covered by an unrestricted final capture with the same structural prefix; the capture must be first in its segment, and a terminal wildcard cannot have an earlier wildcard. Parameter coverage cannot cross a slash or consume a wildcard. Constrained captures remain distinct.

The table below is generated from the permanent native HTTP corpus in `test/extensions/route-equivalence.test.ts`. “Same matching language” describes the exercised native controls. An accidental collision can be rejected for a shared branch even when the complete languages differ.

| Native HTTP case | Declaration A | Declaration B | Same matching language in controls | Accidental collision rejected | Named owned replacement accepted |
|---|---|---|---|---|---|
| case and parameter names | `/items/:id` | `/ITEMS/:other` | yes | yes | yes |
| all trailing declaration slashes are loosened | `/items/:id` | `/items/:other///` | yes | yes | yes |
| repeated interior slashes remain significant | `/items/:id` | `/items//:other` | no | no (intentional overlap/distinction) | no |
| quoted and Unicode parameter names | `/items/:"first-name"` | `/items/:α` | yes | yes | yes |
| literal encodings are not decoded | `/items/a` | `/items/%61` | no | no (intentional overlap/distinction) | no |
| encoded literal spelling is case insensitive | `/items/%2f` | `/ITEMS/%2F` | yes | yes | yes |
| double encoding remains distinct | `/items/%2F` | `/items/%252F` | no | no (intentional overlap/distinction) | no |
| parameters decode after matching | `/items/:id` | `/items/:other` | yes | yes | yes |
| literal percent and captured percent have different decoding | `/items/%ZZ` | `/items/:id` | no | no (intentional overlap/distinction) | no |
| escaped literal in an optional group | `/items/\:id` | `/items/{\:id}` | no | yes | no |
| empty optional groups | `/items/:id` | `/items{}/:other` | yes | yes | yes |
| optional aliases | `/items{/:id}` | `/ITEMS{/:other}` | yes | yes | yes |
| redundant optional groups | `/items{/:id}` | `/items{/:other{}}` | yes | yes | yes |
| nested and reordered alternatives | `/items{/:id}{/:child}` | `/items{/:other{/:nested}}` | yes | yes | yes |
| a shared optional alternative is a collision | `/items/:id` | `/items{/:other}` | no | yes | no |
| named wildcard aliases | `/files/*path` | `/FILES/*"other-name"/` | yes | yes | yes |
| optional wildcard aliases | `/files/{*path}` | `/FILES/{*other}` | yes | yes | yes |
| redundant optional wildcard suffix | `/files/*path` | `/files/*other{.:extension}` | yes | yes | yes |
| redundant optional wildcard prefix | `/files/*path` | `/files/{:base.}*other` | yes | yes | yes |
| redundant optional parameter suffix | `/items/:id` | `/items/:other{.:extension}` | yes | yes | yes |
| absorbed alternatives remain collision candidates | `/items/:id.:ext` | `/items/:other{.:extension}` | no | yes | no |
| required and optional wildcards differ | `/files/*path` | `/files/{*other}` | no | yes | no |
| wildcards and parameters intentionally overlap | `/files/:path` | `/files/*other` | no | no (intentional overlap/distinction) | no |
| static and parameter routes intentionally overlap | `/items/value` | `/items/:id` | no | no (intentional overlap/distinction) | no |
| required suffix and wildcard routes intentionally overlap | `/files/*path` | `/files/*other.:ext` | no | no (intentional overlap/distinction) | no |
| optional slash permits an additional request slash | `/items` | `/items{/}` | no | yes | no |
| root is preserved before declaration loosening | `/` | `///` | no | no (intentional overlap/distinction) | no |
| non-root slash-only declarations are loosened to empty | `//` | `///` | yes | yes | yes |
| non-ASCII literals are not decoded from encoded HTTP paths | `/é` | `/É` | yes | yes | yes |
| Kelvin does not fold into ASCII | `/k` | `/K` | no | no (intentional overlap/distinction) | no |
| complex equivalent tails retain their structural distinction | `/items/:a-:b` | `/items/:a-:b{-:c}` | yes | yes | no |

Supplemental controls cover all four strict/case-sensitive router combinations, isolation from application options, non-Unicode folding, invalid grammar, alternative bounds, constrained captures, HEAD and production owned replacements. Native controls also establish that matching identity does not promise identical extracted parameters or decoding errors: a changed capture boundary can turn `/files/a%2Fb` from 200 into 400 even when the matching languages agree.

This is deliberately a structural collision policy, not arbitrary regular-language equivalence or intersection detection. Static/parameter, parameter/wildcard and other general overlaps remain permitted. For example, `/items/:a-:b` and `/items/:a-:b{-:c}` retain different replacement identities, although their shared complete alternative rejects accidental duplication. A named replacement using an unsupported equivalent spelling must use the owned inventory's target spelling. Assets/page fallback remain outside the owned-route inventory. These limits are explicit in source and regression tests; no claim of complete mathematical matcher equivalence is made.

The incoming-revision control has **23 passes and 17 expected failures**. The final route/resolution/production corpus has **63 passes, zero failures**: 40 route tests, 12 resolution tests and 11 production collision tests, including 31 native HTTP table rows. An initial draft's Latin-1 raw-request assumption was rejected and corrected; it supplies no accepted gate.

## Runtime controls, R9 re-review and general pass

- Preparation race: deterministic gates reproduce two failing shutdown interleavings before the correction. Final controls acquire real integration heartbeat/upgrade resources after the stop request, verify cleanup waits, and verify timeout/retry ownership.
- Emission race: a real Socket.IO client subscribes, authorization blocks an emission, unsubscribe acknowledges, then authorization resumes. The incoming code delivers the update; corrected code does not. A later live subscription still receives progress. R9's pending-join cancellation, concurrent subscription sharing and disconnected-handshake regressions remain green.
- Shipped progress helper: the incoming source fails all five new controls. Final controls recover after transient HTTP, network, malformed response and namespace authentication failure with a fresh grant, and keep explicit close terminal while acquisition is pending. HTTP 401/403 still ends the unauthenticated connection. The combined final asset/lifecycle/progress focused corpus passes 12 tests. An initial asset fixture expected the unminified word `blue`; the actual CSS minifier correctly produces `#00f`. That rejected assertion was corrected before the accepted corpus.
- An initial application typecheck exposed a test-only use of Node's `events.once` with Socket.IO's client emitter. Commit `d65e60b8f` uses the client's own typed `.once`. The `8823651e1` qualification prefix is superseded; every final gate was restarted against `d65e60b8f`. No product finding is counted for this test typing correction. The host VM was subsequently OOM-killed by a conflicting VM and rebooted at 17:56 ACDT. All in-progress qualification output is void and archived separately; the isolated daemon, mounts and services were restored, authored bytes rechecked, and every final qualification gate restarted on the same final tree. A second VM restart was later observed with a new boot ID; its interrupted sequence is also void, including completed intermediate suites. Its clean build separately reported an Angular NVM selection failure. Direct and npm-environment NVM controls pass after restoration; no source defect was reproduced. The accepted attempt runs the full clean build before the full qualification driver, with a 6 GiB compiler limit.
- R9's empty/default/custom logout destination behavior, matching-core scaffold guidance, installation session-secret controls, six consumer lock snapshots, pending subscription intent handling and disconnected handshake ownership were independently rechecked and judged correct. R9's non-root repeated trailing slash correction remains correct; only its root special-case expectation was wrong.
- The fresh general pass found no further concrete class-(A) P1/P2 in configuration layering/redaction, selected Agenda backend preflight, maintenance storage projection/ownership, lifecycle activation/drain/retry outside the corrected preparation interleaving, explicit HEAD dispatch/policies, session rotation/logout, grant admission, artifact containment or changed browser/client integration. Full production/generated-institution, storage, maintenance, browser and API suites exercise these boundaries again.

The post-reboot PDF attempt also exposed a local qualification-fixture error: the replacement rehearsal manifest omitted `redbox-hook-dev` from production dependencies, unlike the Dockerfile's rehearsal stage and R9's fixture. The fresh portal correctly booted without institution workflows, so its API-created record had `metaMetadata.form: null` and native PDF rendering returned 500. That failed attempt is archived under `pdf-fixture-manifest-rejected/` and supplies no accepted PDF gate. The untracked manifest was corrected to include the exact local file dependency, then native PDF and all remaining gates were run again. No repository or compiled runtime inputs changed; completed gates on the same runtime revision remain valid.

The first post-reboot real-service run had 213 passes and three OIDC failures because the restored Keycloak import directory omitted the tracked companion `redbox-users-0.json` file. Its provider log confirms `user_not_found` for `test-exception`. That attempt is archived under `oidc-provider-fixture-rejected/` and supplies no accepted real-service gate. The exact companion file was restored, the disposable Keycloak instance recreated, and all 216 real-service tests rerun with natural process exit. The augmented redirect URI needed by the dedicated browser fixture remains available. This corrects the local provider setup and changes no repository inputs.

R9's operator/integrator walkthrough evidence was reviewed. This round repeats clean-source installation/compilation/page packaging and the complete final qualification below; it does not claim to have repeated R9's separate populated recovery, offline archive or topology walkthroughs.

## P3 and inherited disposition

No additional P3 product defect confirmed. The retired Grunt task spelling and conservative route-identity boundary above are recorded as review notes. The obsolete Sails framework favicon is intentionally retired.

Backlog additions: **none**. B-01–B-05 remain unchanged; no severe inherited ordinary-user access-control exception was invoked. SR-005/045/049/055 remain unchecked solely because no representative institution is designated.

## Final-tree qualification and cleanup

Every final gate passed against runtime/test input `d65e60b8f77c530729beff3724ac86f56046ebae` after the host restarts. Interrupted prefixes and the rejected PDF/provider fixture attempts above supply no final gate. The collector verifies stage records, fresh suite output, compiled/test revisions and authored-input hashes.

| Gate | Accepted final result |
|---|---|
| Builds/types/configuration | All five package builds, six container typechecks, six host typechecks, root typecheck, generated Prisma and portal-configuration checks passed. |
| Clean-source installation/build | Actual pinned `npm ci --ignore-scripts --strict-peer-deps`, complete backend/Angular/Webpack `npm run compile:all`, and `npm run package:pages` passed. Webpack reports nine advisory warnings. Clean compilation finished before the final test driver started. |
| Core default | 4,694 passed; 7 existing pending. |
| Core real-service | 216 passed; natural process exit, without instrumentation or forced exit. |
| Root | 422 passed; 10 existing pending. Owner teardown reports zero retained resources, operations, pools and Prisma clients. |
| Storage / dev-tools / PDF unit | 306 / 53 / 79 passed. |
| Full Playwright / harness | 124 passed in 7.6 minutes, including F17; one worker, zero retries. Harness: 19 passed. |
| Dedicated retirement browser | 4 passed, including shipped-helper subscriptions, fresh grants/reconnect, delivered progress, actual multipart/tus/Companion bytes, real Keycloak login, durable completion and stop retry. |
| Production / generated institution | 1 / 1 passed, including persisted work, restart and drain. |
| Persisted extension qualifiers | 5 passed. |
| Companion lifecycle / uploads | 2 / 6 passed. |
| General Bruno | 309/309 requests, 554/554 tests, 3/3 assertions. |
| OIDC / S3 / PDF Bruno | 13 requests / 17 tests; 7 / 12; 4 / 10, all passed. |
| Packed standalone maintenance | 10 real-Mongo commands across 102 scopes, including 3 Agenda scopes, workflow maintenance, core dependencies/replacements and Mongo-bound built-ins with SQS selected by default. Pending/failures/pools: zero. Explicit backfill changes one entry, then zero. Online installation and offline `npm ci` passed. |
| Lint/documentation | 937 linted files, zero warnings/errors; API reference, generation/audit and all 4 documentation tests passed. 43 published surfaces; 524 advisory findings. |
| Retirement closure | 14 tooling regressions passed. 1,095 committed-source and 6,158 installed-tree files checked with zero executable/dependency violations; all 1,261/1,261 original inventory files reconciled. |
| Exact pins / lock roots | 23 manifests, 377 declarations, 20 allowed local references and six selected lock roots checked; zero violations. No dependency version changes. |

No accepted final JUnit suite has a failure, error or skip. Existing Mocha pending tests are reported above. Closing builder and clean-source audits each match all 1,332 selected authored runtime/test/configuration files; all 48 changed root asset/view/TypeScript/entrypoint inputs also match. Raw and compiled shipped progress helpers are byte-identical. Both runtime matcher consumers and the clean-source installation use the exact `path-to-regexp@8.4.2` bytes.

Qualification uses Node v26.11.1, npm 11.20.0 and MongoDB 9.0.4. [qualification.json](final-review-r10/qualification.json) records exact image identities, final input revisions, suite totals, clean-build and setup-correction witnesses, dependency overlays, review disposition and 303 SHA-256 witnesses for retained local logs/drivers/controls/diagnostics. All recorded hashes were checked against the retained files. Existing images with current compiled overlays were reused; no replacement immutable-image or topology-matrix qualification is claimed.

All Compose profile containers and volumes were removed. Closing cleanup removed the six main containers, compiler container, three captured anonymous volumes, the owned profile network and all three owned firewall rules. Remaining owned containers, networks, volumes, firewall rules and hosts aliases are zero. The restored isolated dockerd/containerd were stopped; their temporary runtime directory and residual namespace reference were removed. Pre-existing engine data/images are preserved. No image was built or new dangling image created; pre-existing dangling image `9bf944d09e37` remains untouched.

The original compiled-page cache is restored with all 429 file hashes unchanged. The temporary artifact bind mount/backing directory and round scratch/compiled overlays are removed; diagnostic logs remain locally. Bruno-generated environment/lock changes are archived and both original tracked files restored byte-for-byte. The collector accepts all cleanup witnesses.

The closing evidence-only commit adds this report and its qualification manifest after the tested runtime commit. No application code or dependency changes follow the accepted final suite run.
