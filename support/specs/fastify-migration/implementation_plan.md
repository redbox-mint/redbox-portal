# Fastify migration implementation plan

Status: agreed scope; all implementation phases pending, 2026-11-04.

The [design](design.md) is authoritative for behavior. The [task list](tasks.md)
assigns work IDs and required evidence. This plan describes delivery order and
phase exits; it does not claim that a branch, test result, package or deployment
already exists.

## 1. Delivery rules

- Build a follow-on stack from the actual integrated Sails-retirement tip. Record
  the initial SHA and requalification required after any base change.
- Keep the current production entrypoint working while the new composition is
  developed. Compare hosts in separate runs with disposable state, never two
  competing application owners against the same live state.
- Freeze the factory/security pattern only after the pilot proves it. Controller
  conversion cannot run ahead of an unresolved session, provider, stream, upgrade
  or shutdown incompatibility.
- Use reviewable changes by concern/controller family. A phase may span several
  changes; it is not a requirement for one enormous PR per phase.
- Pin exact dependency versions and update relevant consumer lockfiles. Do not
  add a general Express bridge as a temporary shortcut that becomes public API.
- Adapt and reuse existing assertions. Add focused tests for new risks rather than
  maintaining a second full Express/Fastify parity suite indefinitely.
- Every phase exit records source/artifact identity, commands, service environment,
  results, skips and unresolved issues. A passing subset is not a passing phase.
- No production deployment, external publication, or institution-owned signoff is
  authorized merely by this implementation plan.

## 2. Dependency graph

```text
P0 Baseline, behavior inventory, performance baseline, WSU source
 └─ P1 Fastify host, explicit registration, lifecycle/close prototype
     └─ P2 Auth/session/CSRF + extension API2 + risky integration pilot
         ├─ P3 API controller families
         ├─ P4 Browser/pages/assets (after shared P3 helpers as needed)
         ├─ P5 Complete streaming/Companion/socket integration
         └─ P6 Generators, packed consumers, bundled hooks, WSU
             (finish after controller contracts used by consumers stabilize)
P3 + P4 + P5 + P6
 └─ P7 Cutover candidate, Express closure, final-artifact qualification
     └─ P8 Maintenance-window/rollback rehearsal and handoff
```

P1/P2 include genuine raw upload, socket and Companion work; P5 is completion and
full coverage, not the first feasibility experiment. P6 begins with the API2 pilot
and finishes after migrated controllers settle. The diagram permits independent
work once prerequisites pass; it is not a request to spawn parallel agents.

## 3. Phases and review boundaries

### P0 — Baseline and qualification inputs

Tasks: FM-001–FM-007.

Capture the actual repository/base/toolchain state. Inventory API, browser,
extension, static/dynamic asset, health, raw-stream and upgrade paths. Reconcile
method/path/name/controller/action/policies/CSRF/validation/response metadata and
replacement semantics. Assign every entry a migration task, existing assertion,
or focused characterization requirement.

Inspect routing/parser edge cases rather than assuming Fastify defaults match.
Record intentional deferred-listen and forced-login changes. Identify actual
supported proxy/database/process configurations and existing CI profiles. Locate
the converted WSU hook source and record how it will be rebuilt. Capture repeatable
Express performance samples before its removal, including raw results/artifact.

Suggested review boundaries: inventory and compatibility matrix; qualification
matrix and WSU inputs; performance harness/baseline if additional tooling is needed.

**Exit G0:** complete inventory with stable names, agreed compatibility rules,
bounded qualification matrix, identified WSU source, and valid performance baseline.
Unknown supported behavior is resolved by inspection/tests or recorded as a specific
blocked prerequisite, not silently invented during conversion.

### P1 — Host, registration, and lifecycle prototype

Tasks: FM-008–FM-013. Requires G0.

Select supported Fastify and compatible exact dependencies. Add an internal
Fastify composition with a minimal controller and explicit route binding. Resolve
factory/route/policy errors before acquisition. Preserve one application, server,
persistence owner and signal owner. Implement late listen, readiness/admission,
activation, initialization failure cleanup, and partial-preparation ownership.

Prototype close early against real sockets. Establish Fastify's actual close-hook,
connection, rejected-close and repeated-close behavior. Separate the caller's
deadline from the tracked close operation and retryable application cleanup.
Port relevant host/requestLifetime assertions, retaining after-response work,
disconnects and pending session-operation lifetime cases. A mock-only close proof
does not pass this phase.

Suggested review boundaries: host/admission; typed controller binding; lifecycle
interleavings and cleanup failure proof.

**Exit G1:** explicit registration works; missing bindings/policies/actions fail;
late-listen lifecycle and real-network stop/deadline/retry behavior are demonstrated.
No library convenience hook can release borrowed resources prematurely.

### P2 — Security, extension API2, and integration feasibility

Tasks: FM-014–FM-022. Requires G1. This is the mass-conversion gate.

Prove native cookie/session integration with application-owned Mongo and explicit
TTL/index maintenance. Choose native Passport or direct provider bindings by
working evidence for local, bearer, OIDC and AAF, including denial and disconnect
cases. Implement policy/context/CSRF ordering and one-time session invalidation,
including safe rollback behavior. Complete one authenticated read and mutation.

Implement API2 declarations, explicit factory inputs, subclass replacement,
stable route replacement and the hook/fallback model. Include a new controller
and a core subclass in a real installed extension fixture. Reject API1 clearly.
Verify generated type examples against selected Fastify types and freeze the
tested API2 surface for later migrations.

In the same phase, prove one raw upload, authorized/denied socket upgrade and
Companion tracked transfer on the single server. Test retained work through
response/disconnect/stop and preparation before listening. Document any unavoidable
Express dependency only inside Companion. Do not defer these experiments to P5.

Suggested review boundaries: session store/lifetimes; authentication providers;
policies/context/CSRF; API2 binding/resolution; hooks/fallback; raw/upgrade/Companion
pilot. Integrate all before declaring the phase complete.

**Exit G2:** all Q12 pilot cases pass over actual listeners where required; every
provider is qualified; API2 compiles and runs as an installed consumer; no Express
bridge is required outside Companion. Any failure blocks mass conversion.

### P3 — API controllers

Tasks: FM-023–FM-028. Requires G2.

Migrate in increasing behavioral complexity:

1. Configuration/reference and record-type reads.
2. Record/query/search reads and schema delivery, including conditional behavior.
3. Identity/administration, account linking and audit operations.
4. Record mutations, workflows, version/concurrency-sensitive operations.
5. Remaining integration/API actions and error paths.

Replace `route.action` branch dispatch with named methods. Keep existing domain
operations and authorization. Derive runtime bindings from API declarations;
preserve Zod extractors, API versioning and envelopes without field-stripping
serialization. Reconcile each family before moving on. Split large controllers
only by demonstrated dependency/responsibility boundaries, documenting identities.

Suggested review boundary: one controller family with its declarations, tests and
inventory reconciliation. Avoid a PR that only adds classes without removing the
corresponding branch dispatcher from the new composition.

**Exit G3:** every API inventory entry is bound exactly once or explicitly replaced/
retired; relevant API, security, error and conditional-response checks pass.

### P4 — Browser controllers, pages, and assets

Tasks: FM-029–FM-032. Requires G2 and any needed shared P3 response helpers.

Migrate pages, login/logout redirects, branded forms, EJS locals, view and asset
overrides, dynamic bundles and embedded Angular initialization. Preserve cookies,
cache/security headers, CSP, compression, canonical-origin policy, root context
and language resolution. Exercise cross-brand and unauthorized paths as well as
rendering success. Existing Playwright assertions remain the browser acceptance
contract; fixture adaptation is not permission to reduce them.

Suggested review boundaries: response/view helpers; page families; assets/forms
and complete browser reconciliation.

**Exit G4:** browser/asset inventory reconciles and the existing full Playwright
acceptance suite passes on Fastify with relevant real-service dependencies.

### P5 — Complete streaming integrations

Tasks: FM-033–FM-036. Requires G2; coordinate with relevant P3/P4 routes.

Finish datastream downloads, multipart staging, TUS, progress sockets and Companion
outside the minimal pilot. Preserve limits, optimistic-concurrency multipart
fields on either side of file parts, backpressure, cancellation, origin checks,
authorization, staged cleanup, headers and retained work. Audit every raw/hijacked
reply for bypassed hooks/session persistence. Qualify optional Companion enabled
and disabled; isolate process-lifetime provider tests from owned cleanup proof.

Suggested review boundaries: datastreams; multipart/TUS; sockets; Companion adapter
and real-network shutdown matrix.

**Exit G5:** real-network integration success/denial/failure/disconnect/drain cases
pass; no pre-consumed raw body, second listener, abandoned work or pool owner.

### P6 — Tooling, consumers, and WSU

Tasks: FM-037–FM-041. Starts after API2 stabilizes in G2; completes after consumed
controller identities/contracts settle in P3–P5.

Update controller/method generators, v6 scaffold, extension route wiring, public
exports and generated references. Convert bundled hooks and actual packed consumer
fixtures. Prove a newly generated controller compiles, binds policies, executes a
route and drains on the production composition after clean pack/install.

Convert the identified WSU source to controller/API2 contracts with explicit
bindings. Fresh local qualification must record its portal, hook, configuration,
database/provider inputs, artifact identity and results. Do not modify an unrelated
institution branch or describe a legacy v5 checkout as already converted.

Suggested review boundaries: generator/scaffold contract; bundled hook conversion;
packed/generated consumers; WSU conversion and qualification evidence.

**Exit G6:** clean installed consumers work without repository-private imports;
bundled hooks and WSU pass fresh local qualification; reference generation/audit
describes API2. Production WSU acceptance remains separately tracked.

### P7 — Cutover candidate and final qualification

Tasks: FM-042–FM-048. Requires G3–G6.

Switch the sole default executable and package startup to Fastify. Update Docker,
CI, maintenance/test runners and probes. Remove the old first-party Express
composition and obsolete dependencies/exports. Audit import/dependency paths,
fixtures and generated artifacts; permit Express only through the justified
Companion boundary. A renamed directory is not sufficient closure evidence.

Build the release candidate from a clean tree and exact lockfiles. Run relevant
core/root/API/browser/real-service/consumer/database/profile gates against the
final source and immutable runtime artifact. Rerun performance comparisons against
the saved baseline. Update the wiki only now to describe the selected runtime;
keep historical retirement reports as historical evidence.

Any runtime/dependency/package change after qualification invalidates affected
gates and the artifact identity. Documentation-only corrections need link/status
checks rather than indiscriminate suite reruns. Record the scope of any rerun.

Suggested review boundaries: executable/build/probe cutover; Express removal and
auditor; final qualification fixes; runtime wiki/migration guide.

**Exit G7:** the exact candidate satisfies the route/Express closure audit, fresh
functional/artifact gates and performance threshold. No required provider is
qualified only by a skip, and no historical result is relabeled current.

### P8 — Rehearsal and handoff

Tasks: FM-049–FM-051. Requires G7.

Rehearse a maintenance-window upgrade from the preceding v6 build with disposable
representative state. Verify quiesce/drain, deployment, intentional forced login,
late-listen startup/readiness, real auth/upload/browser smoke checks, restart and
stop. Rehearse rollback including session revocation/login behavior and external-
effect reconciliation. Preserve the preceding artifact/configuration and tested
performance baseline in the handoff.

Produce separate implementation-completion and institution-production-acceptance
records. Actual production acceptance requires institution/operator input and
is not implied by passing the local WSU rehearsal.

**Exit G8:** local implementation gates and upgrade/rollback rehearsal pass, all
required evidence is identified, and production-only acceptance has named roles
and explicit pending/completed status. No deployment happens as an incidental
effect of declaring the implementation complete.

## 4. Verification command mapping

These commands exist at design time. Adapt their fixtures/scripts to the Fastify
composition while retaining assertions. Verify package scripts when implementing;
the names below are not a promise that today's scripts already test Fastify.

| Gate | Current command or tooling | Execution requirement |
| --- | --- | --- |
| Core and build/types | Core `npm test`; root `npm run compile:core` / `compile:all`; existing typecheck scripts | Build core before dependents; installed consumers use built/packed output. |
| Host/application | Core `test:http-host`, `test:application`, `test:application:mongo` | Update Express-specific host fixture; add real-listener close/interleaving cases. |
| Mongo lifecycle/pilot | Core `test:lifecycle:mongo`, `test:http-pilot:mongo` | Disposable real Mongo, explicit indexes, retained ownership. |
| Auth/CSRF | Core `test:http-auth:mongo`, `test:http-csrf:mongo` | Real provider fixtures, all providers and denial paths; add Fastify-specific session proof. |
| Root integration | Root `npm run test:mocha:ci` | Final application composition, image mode and real services. |
| APIs/providers/storage | Root `test:bruno:general:ci`, `test:bruno:oidc:ci`, `test:bruno:s3:ci`; existing applicable core/PDF profiles | No missing-provider skip accepted as provider evidence. |
| Browser | Root `npm run test:playwright:ci`, `test:playwright:check-coverage` | Full existing assertions against tested image. |
| Upload/socket/stream | Existing real-HTTP multipart/TUS/datastream/socket/Companion suites | Actual listeners, raw sockets and process isolation where required. |
| Packages/generated consumers | `support/integration-testing/qualify-sails-retirement-packages.sh` and generated-institution fixture | Adapt existing tooling to Fastify; inspect that imports/executable are final. |
| Database/runtime artifacts | Existing `qualify-sails-retirement-databases.sh` / `qualify-sails-retirement-artifact.sh` | Adapt and rerun supported matrix on immutable candidate, not historical images. |
| References | Existing generated-reference generate/audit/tests and API docs scripts | Public exports, controller examples, API2 and route docs agree. |
| WSU | Located converted hook's existing suite plus production-composition rehearsal | Fresh local institution evidence tied to final portal/hook artifacts. |
| Performance | P0 saved harness/baseline and P7 identical workload runs | Repeatable p95/throughput comparison; record memory/errors. |
| Express closure | Extend existing retirement AST/dependency audit pattern | First-party source/public contracts/packaged graph exclude Express except Companion. |

Read [automated testing](../../wiki/ReDBox-Automated-Tests.md) and existing fixture
safety requirements before execution. Use disposable database names/volumes and
adequate staging disk. Real Mongo topology/index constraints remain in effect;
Fastify does not remove them. Do not run production-provider or institution-owned
operations as part of an ordinary local test run.

## 5. Required phase evidence format

Create phase evidence when work is executed, rather than pre-populating passes:

```text
Phase / task IDs:
Source SHA and tree status:
Base SHA / changes since preceding evidence:
Toolchain, exact dependencies and lockfile identities:
Packages / image digest / hook + configuration identities:
Services, database topology, proxy and process configuration:
Commands, timestamps and raw result locations:
Passing / failing / pending / skipped (with reasons):
Inventory, security, ownership and negative controls exercised:
Intentional deviations and explicit acceptance, if any:
Remaining blockers / next gate:
```

At final handoff distinguish archived baseline, current source qualification,
immutable artifact qualification, local institution rehearsal and actual production
acceptance. They are different evidence claims and must remain separately visible.
