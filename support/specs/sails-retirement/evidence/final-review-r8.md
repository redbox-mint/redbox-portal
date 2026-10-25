# Final Sails-retirement review — round 8

Eight class-(A) P2 issues found and fixed with regression coverage; no P1 verified.
One unchanged inherited caching defect is added as B-05. R7 production rules remain correct; R8-08 closes a standalone-maintenance
integration gap in named core replacement support. No additional class-A P3 defect was verified at this round's severity bar.

Review base: `a49366803`; incoming HEAD: `170a5a3ea`. The final runtime/test tree is
`30f5d7865`. Work used the shared `stack/sails-retirement` checkout, without branch
switches, worktrees, publishing, pushes, tags, dependency updates or image builds.
The unrelated untracked GraphQL specification was excluded throughout.

## Findings and focused fixes

| ID | Severity | Final location | Verified defect and correction | Commit |
|---|---|---|---|---|
| R8-01 | P2 | `packages/redbox-core/src/application/portal/http.ts:60` | Default compiled core assets precede hook assets, silently serving core bytes and selecting the core Angular bundle hash. Keep explicit caller roots first, then resolved hook roots, compiled core, and source core fallback. Real artifact binding/static HTTP verifies priority and fallback. | `29a59edd5` |
| R8-02 | P2 | `packages/redbox-core/src/maintenance/indexes.ts:41` | Standalone maintenance spreads workflow declarations back into the narrow operational resolver, which rejects their injected `workflow` section. Project operational configuration/jobs and storage ownership; keep workflows/forms and executable business work offline. Test the actual maintenance boundary and packed fixture with workflows. | `25c7eae80` |
| R8-03 | P2 | `packages/redbox-core/src/extensions/resolution.ts:279` | GET implicitly handles HEAD, so a GET declared first bypasses an explicit HEAD handler/policy. Resolve explicit HEAD mounts first while retaining legitimate declarations. Actual HTTP covers both declaration orders in standalone and production composition. | `2549ae870`; readonly test typing `09c5e4a2e` |
| R8-04 | P2 | `packages/redbox-core/src/http/express/progressSockets.ts:62` | Disconnect during asynchronous handshake authentication retains a socket/session binding because the later connection event never installs cleanup. Weakly retain authenticated grants until a live connection event acquires the binding; also refuse a connection after quiesce. Real Engine.IO disconnect interleaving verifies zero live transports, namespace connections and bindings. | `b8b754ce3` |
| R8-05 | P2 | `packages/redbox-core/src/maintenance/indexes.ts:68` | Maintenance defaults omit the portal's 16 built-in jobs. With SQS selected by default, it omits indexes required by explicitly Mongo-bound Figshare/typeface jobs, and subsequent portal startup refuses admission. Reuse the offline portal job constants; test mixed defaults and an explicit exclusively SQS override, including the packed real-Mongo CLI. | `24ff6b0c7` |
| R8-06 | P2 | `support/wiki/Persistence-Index-Preparation.md:86` | The documented Compose npm entrypoint rejects the service's portal configuration selector/admin environment before inspection. Use `app.express.cjs --maintenance=indexes:inspect/ensure`, which consumes that configuration boundary. Regress executable file/environment selection and run the documented command against the actual resolved Compose environment with disposable datastore URLs. | `200a97170` |
| R8-07 | P2 | `assets/js/redbox-progress.js:6` | The shipped Socket.IO helper first requests browser polling without Origin, while the owned endpoint requires Origin. It cannot connect. Select WebSocket transport and replace the qualification's custom WebSocket client with the actual shipped helper, checking fresh token acquisition, subscribe/reconnect and progress delivery. | `1edf76cd6` |
| R8-08 | P2 | `packages/redbox-core/src/maintenance/indexes.ts:32` | Standalone maintenance resolves business declarations without core registrations, rejecting valid dependencies on core modules and named core module/route replacements before inspection. Validate discovery shapes, then resolve only storage ownership and operational configuration/jobs. Three fixtures prove the identical hooks compose in the portal and reach maintenance without executing factories; the packed probe also declares core dependencies/replacements. | `30f5d7865` |

These are distinct incoming defects in feature-owned code or documentation. The
HEAD typing follow-up is part of R8-03, not another finding. All commits carry the
requested co-author trailer. No inherited production implementation was changed.

## Negative controls and concrete checks

Local files are under `.tmp/sails-retirement/final-review-r8/`. Expected failures
are retained separately from accepted final qualification.

| Probe | Observation |
|---|---|
| `asset-precedence-red.log` | Incoming artifact binding serves core bytes instead of the high-priority hook; the corrected artifact/static checks pass. |
| `maintenance-workflows-red.log` | Maintenance rejects `workflow` before reaching index preparation; corrected offline-boundary corpus passes 27 tests. |
| `head-routes-red.log` | 2 passing / 2 failing: HEAD declared after GET returns 200 rather than its policy's 403, in both hosts. Corrected focused composition corpus passes 22 tests. |
| `progress-handshake-red.log` | No live engine/namespace connection remains, but one retained binding survives. Corrected disconnect interleaving passes. |
| `maintenance-business-graph-red.log` | Three valid portal fixtures fail before maintenance: missing core prerequisite, missing core module replacement target, missing named core route replacement target. Corrected focused corpus passes 15 tests. |
| `maintenance-jobs-red.log` | Both Mongo/SQS cases omit all portal default jobs. Corrected configuration/executable corpus passes 12 tests. |
| `maintenance-compose-regression.json` | Original documented entrypoint exits 1; replacement inspect exits 2 on missing indexes, ensure exits 0, following inspect exits 0. All 103 scopes ready; resources, operations, pools and Prisma clients close. |
| `progress-helper-red-final.log` | Actual shipped browser helper times out waiting to subscribe. Corrected same browser case passes with real multipart/tus/Companion prerequisites and delivered progress. |

An initial maintenance-job assertion incorrectly parsed the entire strict portal
object using a picked schema; `maintenance-jobs-test-setup-failure.log` retains
that rejected test setup. The corrected control parses only the Agenda section
before observing the real missing-job failure. The exploratory core-graph probe initially omitted the required concrete custom-module binding; after supplying it, portal composition succeeded and maintenance alone rejected the hook. Permanent regression fixtures include the binding and verify all three scenarios. An initial progress browser driver
ran before Keycloak was ready and failed OIDC discovery; it supplies no product
finding or accepted gate. The valid negative-control browser screenshot/trace are
retained locally under `progress-helper-negative-control/`.

## R7 re-review and independent axes

R1–R7 evidence and the inherited backlog were read before the spec/code review.
The code-review skill's independent Standards and Spec reviews were read-only.
Standards verified the two progress socket defects; Spec verified HEAD ordering,
job defaults and the Compose maintenance command. The completion review verified
asset priority, workflow filtering and the partial-graph maintenance failure. Exploratory child probes used local Node 24.18.0; accepted regressions and final qualification use the Node 26 container/browser workflow below. Duplicate candidates are counted once.

R7's equivalent-path collision checks and owned-core route inventory preserve
named `replaces: true` GET replacements and policy revisions. Replacement method
and canonical path must be retained, as required by the documented contract;
intentional overrides remain mountable. Explicit HEAD is also legitimate: R8-03
preserves it and makes its execution deterministic. That defect existed in the
feature's original route mounting, rather than making R7's rejection rule wrong.

R7's final page fallback correctly yields OPTIONS to Express's accumulated API
methods; unknown paths retain 404. The baseline `packages/redbox-core/src/config/routes.config.ts` declares API
methods explicitly and has no all-method page fallback route consuming them.
Yielding the new fallback restores the router's OPTIONS method enumeration before
404 handling; no CORS allowance is added. R7's earlier-disconnect multipart guard, bounded parser error
statuses/privacy, generated multiple routes sharing one action, deferred upload
length forwarding, canonical path aliases and deliberate owned-route replacement
remain correct. Full regression/production/browser qualification rechecks them.
No R7 production rule was reverted or demonstrated incorrect. R7-07 named core route replacement support was incomplete at the standalone-maintenance boundary: its partial graph rejected valid replacement names. R8-08 fixes that integration gap, alongside the same pre-existing feature failure for core module dependencies/replacements.

## R7 connection-reset diagnosis

The R7 trace records the successful create request at 01:21:06.313–06.403 UTC,
then the failing metadata GET at 01:21:12.404: 6.001 seconds idle. It has status -1
and no response timings. The same cleanup GET succeeds about 90 ms later; the
host continues serving. R7's ten F17 repetitions and full rerun passed unchanged.

Node 26 uses `keepAliveTimeout=5000` plus `keepAliveTimeoutBuffer=1000`. The
[separate-process probe](final-review-r8/keepalive-probe.cjs) compares bare Node
HTTP with the actual compiled ExpressHost, without shutdown during requests:

- 4.8 seconds idle: both return 200 on the reused socket.
- 6.2 seconds idle with normal close-event delivery: both return 200 on a fresh socket.
- 5.9 seconds idle followed by 250 ms of delayed client event processing: both
  return ECONNRESET on a reused expired socket. Server closure occurs at about
  6000–6010 ms in both implementations.

Playwright's request client uses a keep-alive Agent and defaults to zero retries.
The historical timing is consistent with the reproduced stale client socket race,
which also occurs without Express/ReDBox. No host defect was demonstrated; classify
this as test-client transport timing noise. The historical trace lacks TCP capture,
so this is a supported causal diagnosis, not packet-level certainty. No timeout,
shutdown or retry workaround was added. The final runtime tree passed all 124
browser cases in 7.7 minutes, including F17, with one worker, zero retries and no
connection reset. The superseded prefix also passed all 124 cases, but supplies
no final qualification gate.

To reproduce after rebuilding core, inside the qualification container rooted at
`/opt/redbox-portal`:

```sh
node support/specs/sails-retirement/evidence/final-review-r8/keepalive-probe.cjs
```

## Remaining audit and inherited behavior

No additional concrete class-A defect was verified in session rotation and
credential-safe deserialization, Mongo session ownership/TTL preflight, cookie
configuration, CSRF token/session lifecycle and bearer exemptions, per-brand
socket authorization/revocation, EJS rendering, i18n isolation, branding cache keys,
asset containment/static headers, configuration layer/env precedence and value
redaction, or maintenance failure/cleanup exit codes. The fresh review also
checked the operator/configuration and hook migration guidance against owned
startup boundaries. These are reviewed areas, not an exhaustive-proof claim.
Exact dependency pins remain unchanged and qualified.

B-05 records the unchanged immutable-cache matcher accepting long unversioned
basenames. The [baseline/current comparison](final-review-r8/cache-inheritance-probe.cjs)
uses only the two matcher functions from `a49366803` and the compiled current
implementation; unversioned checklist/progress paths and a fingerprinted Angular
control all match both. No source correction is made under the class-B rule.
Existing B-01–B-04 remain unchanged. No further class-A P3 issue was verified.

The host root filesystem had less than 0.5 GiB free while Docker storage had over
150 GiB. Completed browser diagnostics were moved through an owned temporary bind
mount; a pre-existing compiled-page cache was temporarily relocated with 429 file
hashes recorded. Live requests and assertions continued without interruption.
The cache is restored with identical hashes, and the temporary mount/backing
directory is removed during closing cleanup; its witness is listed below.

The first qualification prefix on `09c5e4a2e` passed builds/static/docs, core/root/storage/dev-tools, all 124 browser cases, production/generated qualifiers and general/OIDC/S3/PDF APIs before R8-08 was found. Its active real-service child was allowed to finish naturally while the parent was held at the next gate. These superseded results remain archived separately; all gates are rerun after the last runtime fix.

## Full final-tree qualification

All gates passed after the last runtime fix, on
`30f5d78658e4dd53d97791f37a933d3c28ccde3c`. The earlier `09c5e4a2e` prefix is excluded
from these accepted results. Existing images were reused with current compiled
package overlays and the exact pinned route-matcher dependency; no image was
built and no replacement immutable-image/topology-matrix qualification is claimed.

| Gate | Final result |
|---|---|
| Builds and types | All five package builds; six container typechecks and generated Prisma/config checks; six exact host typechecks and root typecheck passed. |
| Core default | 4,637 passed; 7 existing pending. |
| Core real-service | 213 passed; process exited naturally. |
| Root | 422 passed; 10 existing pending. Owner teardown reports no retained resources, operations, pools or Prisma clients. |
| Storage / dev-tools / PDF unit | 306 / 53 / 79 passed. |
| Full Playwright | 124 passed; one worker, zero retries, no resets, including F17. Harness: 19 passed. |
| Dedicated retirement browser | 4 passed, including the actual shipped progress helper, fresh grants, reconnect, subscription and delivery. |
| Production / generated institution | 1 / 1 passed, including restart and drainage. |
| Persisted extension qualifiers | 5 passed. |
| Companion lifecycle / uploads | 2 / 6 passed. |
| General Bruno | 309/309 requests; 554/554 tests; 3/3 assertions. |
| OIDC Bruno | 13/13 requests; 17/17 tests. |
| S3 Bruno | 7/7 requests; 12/12 tests. |
| PDF Bruno | 4/4 requests; 10/10 tests. |
| Packed standalone maintenance | 10 real-Mongo commands passed across 102 scopes, including 3 Agenda scopes, workflows, core dependencies/replacements and Mongo-bound built-in jobs with an SQS default. No pending/failure/pool remains; explicit backfill changes one then zero entries. |
| Lint / docs | 937 linted files, no warnings/errors; API reference, docs generation/audit and 4 documentation tests passed. 43 published surfaces; 524 advisory findings. |
| Retirement closure | 8 tooling regressions passed; 1,088 committed-source and 6,149 installed-tree files checked with no executable/dependency violations. All 1,261/1,261 original inventory files reconciled. |
| Dependency pins / lock roots | 23 manifests, 377 declarations, 20 allowed local references and 6 changed lock roots checked; no violations. |

No final JUnit suite has a failure, error or skip. Existing Mocha pending tests
remain explicitly reported above. The final host/container input audit matches
all 1,329 selected authored runtime/test/configuration files with
no differences. Qualification used Node v26.11.1, npm
11.20.0 and MongoDB 9.0.4; image identities,
exact dependency overlay and individual suite totals are recorded in
[qualification.json](final-review-r8/qualification.json).

That manifest records 205 SHA-256 witnesses for local logs, inputs,
drivers, negative controls and archived diagnostics under
`.tmp/sails-retirement/final-review-r8/`. Failed exploratory fixture/driver
attempts and expected pre-fix controls are separately identified above; they
provide no accepted final gate.

## Cleanup and accepted gap

Every Compose profile removed its disposable containers and volumes. Closing
cleanup removed the six main round-owned containers, their captured anonymous
volumes, the round network and all three labelled firewall rules. Remaining
round-owned containers, networks, volumes and firewall rules are zero. No new
dangling image was created; the pre-existing dangling image was left untouched.

The pre-existing compiled-page cache was restored with all 429 file hashes
unchanged. The temporary artifact bind mount and backing directory were removed;
completed diagnostics remain archived locally. The generated Bruno environment
and lock-file changes were preserved as a local patch and restored exactly.
Cleanup and hash witnesses are included in `qualification.json`. The only
remaining tracked changes at evidence commit are this review and its backlog/
portable-probe/qualification records.

SR-005/045/049/055 remain unchecked solely because no representative institution
is designated. Generated fixtures do not close that accepted gap. The closing
commit changes only review evidence/backlog; the final report supplies its HEAD.
