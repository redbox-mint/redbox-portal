# Fastify migration tasks

Status: planned, 2026-11-04. No implementation task is complete.

Use with the [design](design.md) and [implementation plan](implementation_plan.md).
Task IDs are stable. Check a task only when its evidence exists and its dependencies
are satisfied; an implementation without required verification remains open.
All tasks are initially unassigned. Assign implementer/reviewer roles when work
starts, without inventing institution approval or deployment authority.

G0–G8 refer to the phase exits in the implementation plan. Where a task depends
on a gate, it depends on all required evidence for that gate, not just merged code.

## P0 — Baseline and qualification inputs

- [x] **FM-001 — Record implementation baseline.**
  - Dependencies: none.
  - Work: identify integrated retirement base SHA, tree state, toolchain, package
    graph, entrypoints, lockfiles and applicable existing evidence. Record any
    uncommitted/user work separately; do not overwrite it.
  - Acceptance: baseline record distinguishes historical proposal/retirement
    revisions from the actual source and artifact to be migrated.

- [x] **FM-002 — Inventory routes and identities.**
  - Dependencies: FM-001.
  - Work: collect API/browser/extension/assets/health/raw/upgrade routes; include
    stable names, method/path syntax, controller/action, provider, access policies,
    CSRF, validation, response metadata, HEAD behavior and replacements. Derive API
    entries from existing declarations; record deterministic missing core names.
  - Acceptance: every supported route and integration has one owner/task and test
    reference; stable extension names and explicit HEAD policies are preserved.

- [x] **FM-003 — Fix the HTTP compatibility matrix.**
  - Dependencies: FM-002.
  - Work: characterize case/trailing slash, root context, optional/wildcard captures,
    parameter precedence, HEAD/OPTIONS/unsupported methods, malformed encodings,
    duplicate/nested query/form values, content types/charsets, limits, cookies,
    conditional headers, redirects and error envelopes. Add only missing critical
    characterization checks. Record callers affected by any proposed break.
  - Acceptance: each matrix row has current observation, target rule and executable
    coverage; accidental behavior is not silently promoted to compatibility policy.

- [x] **FM-004 — Inventory owners and security ordering.**
  - Dependencies: FM-001, FM-002.
  - Work: map initialization/preparation/activation, request/session retained work,
    stream/socket/Companion ownership, signals, cleanup and retry. Record per-route
    policy/CSRF/domain-check/validation ordering and raw-response bypasses.
  - Acceptance: owner table identifies one acquire/drain/close owner per resource;
    ordering tests needed to prevent changed denial behavior are listed.

- [x] **FM-005 — Define final qualification environment.**
  - Dependencies: FM-001, FM-003, FM-004.
  - Work: map supported Mongo/database/proxy/process profiles to existing commands;
    identify real provider fixtures, package/artifact checks and explicit pending
    baseline tests. Fix representative workloads and performance run methodology.
  - Acceptance: bounded gate matrix covers supported deployments without claiming
    direct TLS/HTTP2 or new cross-replica continuity. Skips are classified honestly.

- [x] **FM-006 — Locate converted WSU source.**
  - Dependencies: FM-001.
  - Work: locate the converted hook/artifact referenced by retirement evidence,
    record exact SHA and rebuild inputs, and identify local rehearsal configuration.
    Distinguish it from the available legacy v5 checkout and synthetic fixtures.
  - Acceptance: reproducible institution source/artifact and local qualification
    procedure identified; actual production acceptance remains separately owned.

- [x] **FM-007 — Capture Express performance baseline and close G0.**
  - Dependencies: FM-003–FM-006.
  - Work: run representative read/mutation/page/stream workloads in repeated,
    controlled runs; save preceding artifact/configuration, raw samples, p95,
    throughput, memory/CPU/errors and variability. Reconcile all P0 inputs.
  - Acceptance: G0 record has a usable baseline and complete inventories; no
    Fastify performance claim is made yet.

## P1 — Fastify host and registration

- [x] **FM-008 — Select and pin native host dependencies.**
  - Dependencies: G0.
  - Work: choose a supported Fastify release and compatible native plugin candidates;
    document runtime compatibility, exact versions and affected lockfiles.
  - Acceptance: clean install/build succeeds with exact pins; no general Express
    compatibility package or unsolicited dependency upgrade is introduced.

- [x] **FM-009 — Implement typed controller registration.**
  - Dependencies: FM-008.
  - Work: implement factory descriptors/typed helpers, explicit action allowlists,
    concrete offline bindings, instance/action resolution and bound `this`. Export
    selected core controller input interfaces; keep erasure at one boundary.
  - Acceptance: type fixtures cover different inputs, typed Fastify actions and
    inherited actions; missing/forbidden/non-callable/unlisted actions and bindings
    fail composition. Losing replacement factories never run.

- [ ] **FM-010 — Normalize routes and collision identities.**
  - Dependencies: FM-009, FM-003.
  - Work: translate concrete Express patterns, derive API registration view, preserve
    stable names and effective access metadata, configure path matching, and check
    method/HEAD/structural overlap against the actual Fastify router.
  - Acceptance: registration order cannot bypass explicit HEAD policies; ambiguous
    collisions and missing replacement targets fail; source metadata cannot drift
    from runtime declarations. Real-router tests confirm identity rules.

- [ ] **FM-011 — Add late-listening host and admission gates.**
  - Dependencies: FM-008, FM-009.
  - Work: compose one application/server, initialize before readiness/listen,
    prepare complete plugin graph, then activate and open ingress. Port health/
    readiness/status contracts and executable-owned signals.
  - Acceptance: no startup listener before preparation; once listening, ordinary
    traffic remains gated through activation; failure and stop close admission.

- [ ] **FM-012 — Prove close, ownership and retry.**
  - Dependencies: FM-011, FM-004.
  - Work: coordinate one tracked transport close with retryable application cleanup;
    exercise preparation/activation races, disconnects, after-response work,
    session-operation lifetime, deadlines, failed cleanup and concurrent stop.
  - Acceptance: real sockets and focused failure controls show retained ownership,
    no premature borrowed-resource close, no circular close hook, successful
    cleanup retry and idempotent success. Irrecoverable transport-close errors
    remain visible rather than being silently ignored.

- [ ] **FM-013 — Close G1 with a minimal controller.**
  - Dependencies: FM-010–FM-012.
  - Work: exercise a declared controller action on the new internal composition,
    port relevant host/lifetime assertions and record actual selected Fastify
    ready/close semantics.
  - Acceptance: G1 evidence links real-listener lifecycle and registration proof;
    the existing production entrypoint still works.

## P2 — Security, extensions and risky pilot

- [ ] **FM-014 — Implement native session/store boundary.**
  - Dependencies: G1.
  - Work: bind native cookies/sessions to application-owned Mongo; retain explicit
    index/TTL maintenance, cookie/proxy behavior and save/touch/destroy ownership.
    Select forced-login version/namespace/secret behavior deliberately.
  - Acceptance: real Mongo session lookup/write/failure/disconnect tests show no
    second pool, auto-index creation, borrowed-client close or untracked operation.

- [ ] **FM-015 — Prove all authentication providers.**
  - Dependencies: FM-014.
  - Work: qualify native Passport or direct local/bearer/OIDC/AAF bindings; retain
    mapped profiles, linked/disabled users, fresh credentials, version checks,
    bearer precedence, login rotation/logout, provider failures and security events.
  - Acceptance: success/denial/callback-disconnect cases pass for every provider;
    state is application-local; no Express emulation/bridge or provider skip.

- [ ] **FM-016 — Port context, policies, CSRF and safe errors.**
  - Dependencies: FM-015, FM-010.
  - Work: implement immutable brand/portal/actor context, brand-scoped roles,
    language resolver, default-deny effective policy binding, canonical origin,
    route-specific ordering, safe parser/provider/domain error translation/logging.
  - Acceptance: cross-brand and invalid-credential denials, explicit public,
    policy ordering, CSRF, observation-failure isolation and secret-redaction tests
    pass. Unbranded/early requests do not receive fabricated context.

- [ ] **FM-017 — Version extension loading and replacement.**
  - Dependencies: FM-009, FM-010.
  - Work: implement API2 controller/route declarations and actionable API1 rejection;
    retain offline CommonJS/ESM inspection, dependency/provider precedence and
    explicit named replacements. Preserve non-HTTP contribution fields.
  - Acceptance: no resource acquisition during inspection; subclass replacement
    preserves policies/validation/CSRF; access changes require route replacement.

- [ ] **FM-018 — Implement scoped hooks and fallback.**
  - Dependencies: FM-016, FM-017.
  - Work: bind documented stages, explicit route/application scope, stable ordering,
    hook dependency checks, safe observations and named unmatched-path fallback.
  - Acceptance: cycles/missing targets fail offline; early reply terminates safely;
    observation cannot alter dispatch; fallback cannot intercept protected host
    behavior or bypass access. `afterRoutes` is not treated as response observation.

- [ ] **FM-019 — Run authenticated read/write and installed API2 pilot.**
  - Dependencies: FM-016–FM-018.
  - Work: exercise a real read and mutation plus an installed extension containing
    a new controller and a core subclass with explicit different dependency inputs.
    Verify forced-login and rollback invalidation semantics.
  - Acceptance: production composition, native sessions and all required policy/
    validation paths work; public types compile without consumer-side erasure casts.

- [ ] **FM-020 — Prove raw upload and socket upgrade.**
  - Dependencies: FM-016, FM-012.
  - Work: register scoped raw parsers and one real upload/socket path on the owned
    server; exercise success, origin/auth denial, cancellation and shutdown.
  - Acceptance: no pre-consumed body, second listener or abandoned accepted work;
    prepare succeeds before listening and real-network backpressure/drain works.

- [ ] **FM-021 — Prove isolated Companion adapter.**
  - Dependencies: FM-016, FM-012.
  - Work: attach Companion to the single owned server, adapting only its required
    Express boundary; preserve tracked authorization, upgrades and retained transfers.
  - Acceptance: tracked/unauthorized upgrade and disconnect/stop tests pass;
    optional disabled mode works; remaining Express dependencies and process-
    restart limitation are documented with ownership proof.

- [ ] **FM-022 — Freeze the proven pattern and close G2.**
  - Dependencies: FM-019–FM-021.
  - Work: integrate security/extension/raw/Companion pilots, compile target public
    contracts and examples, record exact plugin pins and retry semantics.
  - Acceptance: all Q12 cases pass; no unresolved provider/security/lifecycle
    incompatibility remains. Only then authorize mass conversion within the plan.

## P3 — API controller families

- [ ] **FM-023 — Migrate configuration/reference reads.**
  - Dependencies: G2.
  - Work: extract named actions for configuration, record types and other reference
    reads using selected domain inputs and declaration-derived bindings.
  - Acceptance: existing version/envelope/validation/security tests pass; route
    inventory records exactly one binding per migrated route.

- [ ] **FM-024 — Migrate records, queries and schema reads.**
  - Dependencies: FM-023.
  - Work: port read/query/search/schema actions and conditional/cache behavior.
  - Acceptance: brand/object authorization, strong ETags/preconditions, schema
    errors, HEAD/GET headers and search contracts pass without serialization loss.

- [ ] **FM-025 — Migrate identity and administration.**
  - Dependencies: FM-023.
  - Work: port user/account linking, management, disable/enable, audits and related
    administration actions, keeping browser/API identities distinct.
  - Acceptance: linked/disabled-account and cross-brand success/denial coverage,
    CSRF-backed AJAX/API behavior and audit/security events remain intact.

- [ ] **FM-026 — Migrate mutations and concurrency-sensitive actions.**
  - Dependencies: FM-024, FM-025.
  - Work: port records/workflows/versions and remaining write actions; preserve
    domain checks, optimistic concurrency, Zod extraction and error precedence.
  - Acceptance: existing mutation/conflict/validation/authorization assertions pass;
    accepted work and external side effects retain application ownership.

- [ ] **FM-027 — Migrate remaining integration APIs.**
  - Dependencies: FM-023; relevant FM-024–FM-026 collaborators.
  - Work: close all other API inventory entries, including provider-specific error
    paths, without new branch-based controller dispatch.
  - Acceptance: no unsupported silent omission, copied handwritten API table or
    unreviewed response-field/status change; relevant Bruno profiles pass.

- [ ] **FM-028 — Reconcile APIs and close G3.**
  - Dependencies: FM-024–FM-027.
  - Work: reconcile declaration/runtime/docs coverage and intentional overrides;
    inspect controller dependency/class-size boundaries and remove replaced
    dispatch code from the Fastify composition.
  - Acceptance: API inventory closure and relevant complete API/security suites pass.

## P4 — Browser, pages and assets

- [ ] **FM-029 — Implement page and response helpers.**
  - Dependencies: G2; relevant P3 response helpers.
  - Work: bind EJS, language, redirects, cookies, CSP/cache/compression/security
    headers and view/asset override precedence without Express transport types.
  - Acceptance: representative branded page and error rendering, canonical-origin
    behavior, redirect destinations and locals match the compatibility matrix.

- [ ] **FM-030 — Migrate browser controller families.**
  - Dependencies: FM-029.
  - Work: port login/logout, branded pages, dashboards, forms and browser operations
    with explicit actions and existing access/CSRF rules.
  - Acceptance: browser route inventory reconciles; unauthorized/cross-brand cases
    and session/redirect transitions retain expected behavior.

- [ ] **FM-031 — Migrate static and dynamic assets.**
  - Dependencies: FM-029.
  - Work: port asset roots, extension overrides, dynamic bundles/form delivery and
    embedded Angular initialization, including root-context behavior.
  - Acceptance: assets/forms initialize in the production composition; cache/HEAD/
    content-type/security-header tests pass with no public implementation leakage.

- [ ] **FM-032 — Run browser acceptance and close G4.**
  - Dependencies: FM-030, FM-031.
  - Work: adapt fixtures and run the full existing Playwright collection and coverage
    checks against Fastify in tested-image mode.
  - Acceptance: all required assertions remain, browser/asset inventory is closed,
    and relevant failures/skips are resolved rather than hidden by retries.

## P5 — Complete streams and integrations

- [ ] **FM-033 — Complete datastream delivery.**
  - Dependencies: G2, FM-024.
  - Work: port authorized downloads/ranges/conditional stream behavior as supported,
    backpressure, cancellation, storage errors and completion ownership.
  - Acceptance: real-network stream/header/denial/disconnect tests pass; resources
    remain live until retained work drains.

- [ ] **FM-034 — Complete multipart and TUS.**
  - Dependencies: G2, FM-026.
  - Work: port full upload paths, limits, staging/finalization, concurrency fields,
    TUS state and parser scopes; audit session persistence on raw replies.
  - Acceptance: real multipart fields before/after files, partial/oversized uploads,
    backpressure, cancellation, low-space refusal, failure cleanup and stop pass.

- [ ] **FM-035 — Complete sockets and Companion.**
  - Dependencies: FM-020, FM-021; relevant P3/P4 integration routes.
  - Work: finish progress grants/reconnect/origin behavior and full Companion paths/
    transfers/upgrades; document process affinity and full-stop restart requirements.
  - Acceptance: cross-brand/invalid grant denials, retained transfer work and optional
    Companion modes pass without introducing cross-replica continuity claims.

- [ ] **FM-036 — Audit raw boundaries and close G5.**
  - Dependencies: FM-033–FM-035.
  - Work: inventory hijacked/raw paths and bypassed Fastify hooks; verify explicit
    session writes, response/error observation, accepted-work/drain and upgrade
    dispatch. Run full real-network shutdown/integration matrix.
  - Acceptance: no abandoned work/second owner/listener, staged files are cleaned,
    and owned cleanup is proven before any process-force-exit harness behavior.

## P6 — Tooling, consumers and WSU

- [ ] **FM-037 — Update generators and v6 scaffold.**
  - Dependencies: G2.
  - Work: generate typed classes/actions, factory inputs, explicit route/policy
    declarations and API2 wiring; update method generator and migration examples.
  - Acceptance: a fresh generated extension compiles without manual transport fixes
    and runs its declared protected/public actions through production composition.

- [ ] **FM-038 — Convert bundled hooks and public exports.**
  - Dependencies: FM-037; consumed P3–P5 contracts.
  - Work: convert all bundled controller/handler/middleware contributions, retire
    Express exports, keep non-HTTP configuration/work/assets behavior unchanged.
  - Acceptance: hooks compile and run with concrete application bindings; consumers
    use public entrypoints; API1 receives actionable migration failure.

- [ ] **FM-039 — Qualify clean packed consumers.**
  - Dependencies: FM-038.
  - Work: update packed/generated fixtures and run clean pack/install/start/route/
    restart/drain tests outside source-linked node_modules assumptions.
  - Acceptance: installed package graph, required peers/types and generated hook
    work on Fastify without repository-private imports or stale Express declarations.

- [ ] **FM-040 — Convert and locally qualify WSU.**
  - Dependencies: FM-006, G3–G5, FM-038.
  - Work: port the identified converted WSU hook to API2, bind controllers and run
    its existing suite plus representative production-composition local rehearsal.
  - Acceptance: fresh portal/hook/configuration/artifact evidence exists; legacy v5
    checkout and archived 565 passes are not relabeled new qualification. Actual
    institutional production acceptance stays separately pending unless performed.

- [ ] **FM-041 — Generate references and close G6.**
  - Dependencies: FM-039, FM-040.
  - Work: update extension/controller docs, API reference examples and migration
    guide; run existing generation/audit/test tooling.
  - Acceptance: generated/public contracts agree, installed/generated consumers
    and local WSU pass, and no documented first-party Express path remains current.

## P7 — Cutover candidate and qualification

- [ ] **FM-042 — Switch the sole default executable.**
  - Dependencies: G3–G6.
  - Work: select Fastify in startup/package scripts, Docker and CI; update maintenance/
    test runners, startup/readiness/liveness probes and timeouts.
  - Acceptance: default source and production runtime image start/restart/stop with
    Fastify; no hidden test/default path still qualifies Express instead.

- [ ] **FM-043 — Remove first-party Express and enforce closure.**
  - Dependencies: FM-042.
  - Work: delete obsolete host/routing/middleware/exports/dependencies, update
    lockfiles, and add focused AST/dependency audit using the retirement pattern.
    Inventory each remaining Companion-specific Express requirement.
  - Acceptance: source, public declarations, generated/packed output and installed
    dependency paths contain no first-party Express usage outside justified Companion
    integration. No runtime host toggle or generic compatibility layer survives.

- [ ] **FM-044 — Build and identify the immutable candidate.**
  - Dependencies: FM-043.
  - Work: clean-build exact packages/runtime image; record SHA/tree state, locks,
    package hashes, image digest, toolchain and provider/configuration inputs.
  - Acceptance: release runtime uses intended production graph/user and includes
    required assets/configuration, rather than depending on mounted build tooling.

- [ ] **FM-045 — Run final functional and consumer gates.**
  - Dependencies: FM-044.
  - Work: execute mapped core/root/API/Playwright/real-service/upload/socket/
    Companion/generated/packed/WSU gates; reconcile all routes and policies.
  - Acceptance: final-source and artifact identities are explicit; required cases
    pass with pending/skips accounted for; inherited Express results are baseline only.

- [ ] **FM-046 — Run final deployment/database/maintenance gates.**
  - Dependencies: FM-044.
  - Work: run supported database/process/proxy profiles, fresh/restart/stop,
    maintenance/index commands and initialization/stop failure controls.
  - Acceptance: final runtime artifact passes the agreed matrix; no new direct
    TLS/HTTP2, multi-replica or untested topology support is implied.

- [ ] **FM-047 — Verify performance threshold.**
  - Dependencies: FM-044, FM-007.
  - Work: repeat the P0 workloads under equivalent conditions, retain raw samples,
    variability, errors, p95, throughput and memory observations.
  - Acceptance: no repeatable >10% p95/throughput deterioration remains without
    investigation and explicit acceptance. Error/dropped-work differences cannot
    manufacture an apparent improvement.

- [ ] **FM-048 — Update current wiki and close G7.**
  - Dependencies: FM-045–FM-047.
  - Work: update architecture/controllers/services/configuration/development/
    installation/testing/generated-reference/client-compatibility pages, probes,
    API2 conversion and Companion restrictions. Reconcile audit/evidence/deviations.
  - Acceptance: exact final candidate passes all required gates; any intervening
    runtime/package change has affected gates rerun. Historical reports remain
    historical; no Fastify completion claim precedes evidence.

## P8 — Rehearsal and handoff

- [ ] **FM-049 — Rehearse maintenance-window upgrade.**
  - Dependencies: G7.
  - Work: use preceding known-good v6 build and disposable representative state;
    quiesce/drain, checkpoint, deploy image/hooks/configuration, invalidate sessions,
    verify late startup/readiness and auth/API/browser/upload smoke checks.
  - Acceptance: ordered runbook with measured timings and artifact identities
    succeeds; traffic is not restored before readiness and smoke gates.

- [ ] **FM-050 — Rehearse rollback and recovery.**
  - Dependencies: FM-049.
  - Work: restore the preceding build/configuration and verify login/revocation,
    restart/stop, persistent-state compatibility and external-effect reconciliation.
    Distinguish existing v6 data migrations from transport-only changes.
  - Acceptance: tested rollback runbook exists; no claim of automatic v6-to-v5
    rollback or safe reversal of unrelated database migrations.

- [ ] **FM-051 — Close G8 and hand off production acceptance.**
  - Dependencies: FM-050.
  - Work: produce final implementation report and separate institution/operator
    acceptance checklist with responsible roles: deployed source DB/image/hook/
    configuration, real federation/topology, identity/search/workload/availability,
    client approval, operator cutover and reconciliation.
  - Acceptance: local implementation/WSU rehearsal and production-only pending
    items are distinct. No required local gate remains open; no production signoff
    or deployment is invented from local tests.

## Completion record

Populate only after execution:

| Claim | Required identity/evidence | Status |
| --- | --- | --- |
| Agreed design | Interview decisions Q1–Q26 and design document | Agreed |
| Implemented source | Final SHA, tree status, route/Express closure audit | Pending |
| Qualified packages | Pack hashes and clean installed consumer results | Pending |
| Qualified runtime | Immutable image digest and complete final gate results | Pending |
| Performance | Baseline/candidate raw results and threshold evaluation | Pending |
| Local institution | WSU hook/configuration/artifact identities and fresh results | Pending |
| Upgrade/rollback | Rehearsal logs and runbooks | Pending |
| Production institution acceptance | Institution/operator-owned evidence | Pending; separate from implementation completion |

No runtime tests or Fastify qualification were performed to write these documents.
