# Independent Docker stage split review

Observed locally on 2026-10-31, using existing `linux/arm64` images. **The test images have different dependency resolution and behavior. This is not a behavior-preserving stage refactor.** The runtime pair has matching measured contracts, but retains a Companion/Express compatibility concern. There is no available baseline PDF image, so PDF equivalence is unverified.

## Images and measured results

All tags below have the repository prefix `redbox-pr2-contract:`. Image IDs, rather than mutable tags, identify the observations.

| Tag | Image ID | Reachable package nodes | Declared resolution edges |
| --- | --- | ---: | ---: |
| `baseline-runtime` | `sha256:949b31c894e9d86e5b0d232bc9d3fa320dcc6583455a8c490eabe93bacaf1056` | 1455 | 3208 |
| `runtime` | `sha256:d50ca32dac95f16752c7913c15028a1719c514f5fda0f878b2f9a7f83e415760` | 1455 | 3208 |
| `baseline-test` | `sha256:0543aa20100e1b0bdf2114998ca04e4d969834e89f61f3ea1901d851a86ba75f` | 3824 | 6917 |
| `final-test` | `sha256:a1b0ad21dcc7846d518f0655cb6db1af973f1eb1206292f1b86c1ec2e883b70a` | 3805 | 6823 |
| `pdf` | `sha256:cc640e024359950d7ec28adb6f22c462d086c98025a13a6aa2edf949da21f71f` | 1501 | 3295 |

Both comparable pairs have identical direct dependency contracts and identical application file hashes/link entries covered by the original contract. The runtime pair also has identical recursive resolution graphs. The test pair does not: 17 edges change on callers present in both graphs; 33 previously reachable package locations disappear and 14 new locations become reachable. Node and edge totals include explicit roots and their development dependencies for the test target, plus runtime/optional/peer dependencies recursively. They are not a count of every installed directory.

All five expanded image contracts passed, including Node `v26.12.1`, platform, user, workdir, application assets and the existing package-load checks. Candidate PDF Chromium generated a 9963-byte PDF. Passing an individual contract emits observations; comparison of the JSON is still required and a pass does not imply equality with another image.

## Companion and Express: an observable change

The portal's lazy Companion middleware in `packages/redbox-core/src/config/http.config.ts` requires Companion from core's resolution context. That context contains Companion **7.2.0** in both test images. Its declared Express requirement is `^5.2.1`, and its session requirement is `^1.19.0`.

| Core's Companion dependency | Baseline test | Candidate test |
| --- | --- | --- |
| `express` | `4.22.2`, nested under Companion | `5.3.0`, hoisted to core's `node_modules` |
| `express-session` | `1.18.2`, nested under Companion | `1.19.0`, hoisted to core's `node_modules` |
| `connect-redis` | `7.1.1`, nested under Companion | `7.1.1`, hoisted to core's `node_modules` |
| `connect-redis`'s session peer | `1.18.2` | `1.19.0` |

The root context separately contains Companion **7.0.2**. Its Express **4.22.2** and session **1.18.2** resolution stays unchanged in all five images. Core's Companion also retains those old versions in both runtime images and candidate PDF. Thus candidate test coverage exercises a different Companion framework/session combination from production.

The installed Companion source uses `/connect/:oauthProvider{/:override}` and explicitly sets `query parser` to `extended`. The offline behavioral probe registered this exact route syntax using Express resolved from each caller, then made loopback requests:

| Probe in core's Companion context | Baseline test | Candidate test |
| --- | --- | --- |
| `/connect/drive` on the isolated exact-syntax route | 404 | 200, `oauthProvider=drive` |
| `/connect/drive/custom` on the same route | 404 | 200, `oauthProvider=drive`, `override=custom` |
| Default Express query parsing of `metadata[key]=value` | Nested `metadata` object | Literal `metadata[key]` key |

The query-parser default changes across Express majors; Companion's explicit `extended` setting compensates for that particular difference. The route syntax difference is still meaningful: the baseline does not interpret the braces as Express 5 optional groups. A successful `require('@uppy/companion')` cannot establish route compatibility.

Constructing the actual Companion app with no providers and a constrained loopback upload/CORS configuration returned health 200 and `/connect/drive` 404 in all five images. That unconfigured-provider result does not distinguish the framework versions or establish successful OAuth; the isolated exact-syntax route above exposes the parsing difference. No provider credentials or external calls were used. The Express 4 overrides preserve a pre-existing incompatibility concern in runtime/PDF even though the measured runtime graphs match.

Express's own child graph changes along with its major version. For example, the Express selected by core's Companion moves from body-parser `1.20.9` to `2.3.0`, cookie-signature `1.0.7` to `1.2.2`, debug `2.6.9` to `4.4.3`, finalhandler `1.3.2` to `2.1.1`, send `0.19.2` to `1.2.1`, and serve-static `1.16.3` to `2.2.1`; Express 5 uses router `2.2.0` in place of Express 4's direct path-to-regexp `0.1.13` dependency. Routing, request parsing, error propagation, MIME/static responses and extension code therefore need compatibility coverage beyond module loading. The appendix records the complete graph location changes.

## express-session: observed differences and limits

Comparison of the installed session source found two runtime additions in `1.19.0`: a function-valued `cookie` option, evaluated for the request, and `sameSite: 'auto'` selection (`lax` for HTTP, `none` for a secure request). The `session/*.js` files compared (`cookie`, `session`, `store`, `memory`) are byte-identical. The eight resolved runtime dependency versions are also identical: cookie `0.7.2`, cookie-signature `1.0.7`, debug `2.6.9`, depd `2.0.0`, on-headers `1.1.0`, parseurl `1.3.3`, safe-buffer `5.2.1`, uid-safe `2.1.5`. Manifest ranges change for several dependencies; these observations concern the installed versions, not a future installation.

The probe independently exercised each version in a disposable process with an in-memory store:

- Ordinary `{ httpOnly: true, sameSite: 'lax' }` sessions persist `count=1` then `count=2` in both versions, with the same observed cookie attributes.
- A cookie factory persists the session under `1.19.0`; `1.18.2` rejects it with `argument options must be a object`.
- `sameSite: 'auto'` under `1.19.0` emits `SameSite=Lax` over HTTP, and `Secure; SameSite=None` for a trusted HTTPS proxy header; both round trips persist the session. Under `1.18.2`, the tested requests emit no session cookie and the next request starts again at `count=1` (serialization reports an invalid SameSite option).

The proxy setting and header are explicit test inputs, not a recommendation to trust arbitrary forwarded headers. These are session feature differences, not evidence of an observed ordinary-session regression. Redis persistence, OAuth redirects/cookies, browser SameSite enforcement, uploads and the full Sails-mounted Companion lifecycle were not tested. Equal connect-redis versions at a different location do not establish equal module identity or session-store behavior.

## Correctness assessment and scope

The candidate test image resolves versions compatible with core Companion's declared Express/session requirements and recognizes its Express 5 route syntax. That is a concrete improvement over the baseline's incompatible forced versions, but it changes behavior. The Dockerfile's old snapshot-copy approach overlays restored development trees onto an image already containing the production reinstall's dependency directories; retaining the builder graph directly avoids those residual nested overrides. The observations are consistent with that mechanism, rather than a change in direct manifests or application payload files.

**Do not approve this as dependency/behavior equivalence across every target.** If a stage-only refactor must preserve the old test graph, that requirement is currently unmet. If removal of the contaminated test graph is intentional, record it as an explicit behavior change and verify Companion's configured OAuth, session store, upload routes and Sails integration. Production's forced Express 4/session 1.18 combination warrants a separate compatibility correction or evidence that all enabled functionality supports it. The new test graph cannot certify that old production combination. No baseline PDF comparison or AMD64 verification was possible from the available images.

This implementation changes only the contract, its fixtures, the offline probe and this report. It does not change Dockerfile stages, dependencies/overrides, CI, published targets/tags, or publication behavior, and performs no commit, push or external network write.

## Contract format and reproduction

`dependencyGraph.roots` maps each explicitly checked package directory to a canonical manifest. `dependencyGraph.nodes` is keyed by real manifest path, relative to the application root. Each node records name/version and named edges with the original declaration kinds/specs, optional status, lookup manifest path, real target manifest path, installed version and immediate directory link target when present. All shared and cyclic edges remain present; each real node is expanded once. Traversal starts from a linked package's real directory, matching ordinary Node behavior without `--preserve-symlinks`.

Optional declarations override required declarations of the same name for absence handling. Absent optional dependencies and peers remain explicit `missing` edges; a missing required non-peer package fails. Required peers that are absent remain visible as unmet host contracts rather than being silently dropped. Root development dependencies are followed only for the test target; dependency packages' development declarations are not recursively treated as runtime dependencies. Builtin-name declarations record the bare builtin as well as an installed userland package, if present (subpath/trailing-slash imports can use that package). Hidden `package.json` exports do not prevent reading installed metadata.

This is a graph of declared installed-package resolution, not execution tracing. It does not prove every import/export condition or subpath works, find undeclared dynamic imports, hash dependency implementation files, compare native ABI behavior, or traverse unreachable/extraneous package directories. Entry-point module loads, payload hashes and the focused behavioral probe supply separate evidence. In particular, recording an installed version does not assert that it satisfies the declared range: deliberate overrides must remain visible for review.

```sh
node --test support/build/docker-image-contract.test.cjs
node support/build/docker-image-contract.cjs redbox-pr2-contract:baseline-runtime runtime linux/arm64 > /tmp/baseline-runtime.json
node support/build/docker-image-contract.cjs redbox-pr2-contract:runtime runtime linux/arm64 > /tmp/candidate-runtime.json
node support/build/docker-image-contract.cjs redbox-pr2-contract:baseline-test test linux/arm64 > /tmp/baseline-test.json
node support/build/docker-image-contract.cjs redbox-pr2-contract:final-test test linux/arm64 > /tmp/candidate-test.json
node support/build/docker-image-contract.cjs redbox-pr2-contract:pdf runtime_pdfgen linux/arm64 > /tmp/candidate-pdf.json
diff -u /tmp/baseline-runtime.json /tmp/candidate-runtime.json
diff -u /tmp/baseline-test.json /tmp/candidate-test.json
docker run --rm -i --network=none --entrypoint node redbox-pr2-contract:baseline-test - < support/build/docker-image-contract.behavior.cjs
docker run --rm -i --network=none --entrypoint node redbox-pr2-contract:final-test - < support/build/docker-image-contract.behavior.cjs
# Optional: probe the root Companion independently, in a fresh container.
docker run --rm -i --network=none --entrypoint node redbox-pr2-contract:final-test - node_modules/@uppy/companion < support/build/docker-image-contract.behavior.cjs
```

The regression fixture reproduces the exact hidden version change while the direct contract stays identical. Additional fixtures cover equal-version hoisting, linked callers, cycles, missing required transitive dependencies, present/missing optionals, peers, builtin names, deterministic output and root-only development dependencies. All 13 targeted tests passed. Full contracts and focused probes were rerun independently on all five image IDs above with external networking disabled. Probe JSON is observational, including expected unsupported-option errors; its exit status alone is not a compatibility gate.

## Complete test graph delta

All paths in this appendix are relative to `/opt/redbox-portal`, omit the final `/package.json`, and use `C` for `packages/redbox-core/node_modules`. Only that subtree changes. Edges on callers present in both graphs are listed first. Added/removed nodes describe graph reachability at a location, not a claim that those files are physically absent from the image. No other common node metadata or edges change.

| Caller | Dependency | Baseline target (version) | Candidate target (version) |
| --- | --- | --- | --- |
| `C/@uppy/companion` | `connect-redis` | `C/@uppy/companion/node_modules/connect-redis` (7.1.1) | `C/connect-redis` (7.1.1) |
| `C/@uppy/companion` | `express` | `C/@uppy/companion/node_modules/express` (4.22.2) | `C/express` (5.3.0) |
| `C/@uppy/companion` | `express-session` | `C/@uppy/companion/node_modules/express-session` (1.18.2) | `C/express-session` (1.19.0) |
| `C/css-loader` | `semver` | `C/css-loader/node_modules/semver` (7.8.5) | `C/semver` (7.8.5) |
| `C/express/node_modules/body-parser` | `qs` | `C/express/node_modules/qs` (6.16.1) | `C/qs` (6.16.1) |
| `C/express` | `qs` | `C/express/node_modules/qs` (6.16.1) | `C/qs` (6.16.1) |
| `C/handlebars` | `minimist` | `C/handlebars/node_modules/minimist` (1.2.8) | `C/minimist` (1.2.8) |
| `C/sails/node_modules/compression` | `negotiator` | `C/sails/node_modules/compression/node_modules/negotiator` (0.6.4) | `C/sails/node_modules/negotiator` (0.6.4) |
| `C/sails/node_modules/debug` | `ms` | `C/sails/node_modules/debug/node_modules/ms` (2.0.0) | `C/sails/node_modules/ms` (2.0.0) |
| `C/sails/node_modules/express` | `accepts` | `C/sails/node_modules/accepts` (1.3.8) | `C/accepts` (1.3.8) |
| `C/sails/node_modules/express` | `body-parser` | `C/sails/node_modules/body-parser` (1.20.5) | `C/body-parser` (1.20.5) |
| `C/sails/node_modules/express` | `finalhandler` | `C/sails/node_modules/finalhandler` (1.3.2) | `C/finalhandler` (1.3.2) |
| `C/sails/node_modules/express` | `fresh` | `C/sails/node_modules/fresh` (0.5.2) | `C/fresh` (0.5.2) |
| `C/sails/node_modules/express` | `merge-descriptors` | `C/sails/node_modules/merge-descriptors` (1.0.3) | `C/merge-descriptors` (1.0.3) |
| `C/sails/node_modules/send` | `fresh` | `C/sails/node_modules/fresh` (0.5.2) | `C/fresh` (0.5.2) |
| `C/sails/node_modules/serve-static/node_modules/send` | `fresh` | `C/sails/node_modules/fresh` (0.5.2) | `C/fresh` (0.5.2) |
| `C/skipper` | `body-parser` | `C/skipper/node_modules/body-parser` (1.20.5) | `C/body-parser` (1.20.5) |

### Locations reachable only in baseline test

| Package location | Version |
| --- | --- |
| `C/@uppy/companion/node_modules/accepts/node_modules/mime-types` | 2.1.35 |
| `C/@uppy/companion/node_modules/accepts` | 1.3.8 |
| `C/@uppy/companion/node_modules/body-parser/node_modules/qs` | 6.16.2 |
| `C/@uppy/companion/node_modules/body-parser` | 1.20.9 |
| `C/@uppy/companion/node_modules/connect-redis` | 7.1.1 |
| `C/@uppy/companion/node_modules/cookie-signature` | 1.0.7 |
| `C/@uppy/companion/node_modules/debug/node_modules/ms` | 2.0.0 |
| `C/@uppy/companion/node_modules/debug` | 2.6.9 |
| `C/@uppy/companion/node_modules/express-session` | 1.18.2 |
| `C/@uppy/companion/node_modules/express/node_modules/content-disposition` | 0.5.4 |
| `C/@uppy/companion/node_modules/express` | 4.22.2 |
| `C/@uppy/companion/node_modules/finalhandler` | 1.3.2 |
| `C/@uppy/companion/node_modules/fresh` | 0.5.2 |
| `C/@uppy/companion/node_modules/merge-descriptors` | 1.0.3 |
| `C/@uppy/companion/node_modules/mime-db` | 1.52.0 |
| `C/@uppy/companion/node_modules/negotiator` | 0.6.3 |
| `C/@uppy/companion/node_modules/send` | 0.19.2 |
| `C/@uppy/companion/node_modules/serve-static` | 1.16.3 |
| `C/css-loader/node_modules/semver` | 7.8.5 |
| `C/express/node_modules/qs` | 6.16.1 |
| `C/handlebars/node_modules/minimist` | 1.2.8 |
| `C/sails/node_modules/accepts` | 1.3.8 |
| `C/sails/node_modules/body-parser` | 1.20.5 |
| `C/sails/node_modules/compression/node_modules/negotiator` | 0.6.4 |
| `C/sails/node_modules/debug/node_modules/ms` | 2.0.0 |
| `C/sails/node_modules/finalhandler/node_modules/parseurl` | 1.3.3 |
| `C/sails/node_modules/finalhandler` | 1.3.2 |
| `C/sails/node_modules/fresh` | 0.5.2 |
| `C/sails/node_modules/merge-descriptors` | 1.0.3 |
| `C/sails/node_modules/mime-db` | 1.52.0 |
| `C/sails/node_modules/mime-types` | 2.1.35 |
| `C/skipper/node_modules/body-parser/node_modules/debug` | 2.6.9 |
| `C/skipper/node_modules/body-parser` | 1.20.5 |

### Locations reachable only in candidate test

| Package location | Version |
| --- | --- |
| `C/accepts/node_modules/mime-db` | 1.52.0 |
| `C/accepts/node_modules/mime-types` | 2.1.35 |
| `C/accepts` | 1.3.8 |
| `C/body-parser/node_modules/debug` | 2.6.9 |
| `C/body-parser/node_modules/ms` | 2.0.0 |
| `C/body-parser/node_modules/qs` | 6.15.2 |
| `C/body-parser` | 1.20.5 |
| `C/connect-redis` | 7.1.1 |
| `C/finalhandler/node_modules/debug` | 2.6.9 |
| `C/finalhandler/node_modules/ms` | 2.0.0 |
| `C/finalhandler` | 1.3.2 |
| `C/merge-descriptors` | 1.0.3 |
| `C/negotiator` | 0.6.3 |
| `C/sails/node_modules/ms` | 2.0.0 |
