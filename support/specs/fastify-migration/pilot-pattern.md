# Frozen P2 controller and integration pattern (FM-022)

The implementation pattern below is the P2 baseline for subsequent conversion.
The [FM-022 evidence](evidence/FM-022.md) determines whether G2 is authorized;
this document alone grants no gate. The executable continues to select Express.

## Public contracts and compiled examples

Use `@researchdatabox/redbox-core/http` for controller factories, concrete
bindings, action/route/hook/fallback types, immutable request context and language
resolution. Use `/extensions` for `RedboxExtensionV2` and `/portal` for the
production application/host factories and required production input contracts.
Extensions import Fastify request/reply **types**, never a Fastify instance.

The executable examples are
[`pilot-contracts.types.ts`](../../../packages/redbox-core/test/http/fastify/fixtures/pilot-contracts.types.ts)
and the installed
[`api2-pilot`](../../../packages/redbox-core/test/http/fastify/fixtures/api2-pilot/index.ts).
`installedPilot` compiles both with strict TypeScript against packed public
entrypoints, removes author source, then compiles an independent consumer. It
rejects input erasure casts and TypeScript suppressions. Missing concrete inputs
and omitted production policy/priority/module/proxy selections must fail compilation.
The examples cover typed actions, metadata/datastream subclasses, different
constructor inputs, all four hook stages, detached observations, literal fallback
context and production composition inputs. These are maintained source examples,
not uncompiled documentation snippets.

Each conversion must retain these rules:

1. Controllers borrow explicitly bound domain operations; constructors acquire no
   resources. Declare every exposed action, including inherited raw actions when
   replacing a complete selected controller. Replacement does not expose helpers.
2. Derive API routes from their executable declarations. Preserve stable names,
   exact policy chains (including effects before `false`), CSRF, validation,
   explicit HEAD behavior and normalized collision/precedence checks. Controller
   replacement changes implementation. Access changes require complete named route
   replacement. See [API2 replacement semantics](extension-api2.md).
3. Resolve the installed provider/module/controller/route/hook/fallback graph once
   through `createPortalFastifyApplication`. Pass the same frozen installation to
   `createPortalFastifyHost`. Supply configuration, priority, module names, proxy
   trust and namespace selections explicitly. Test production assembly; do not
   hand-assemble services, mount substitutes or create another listener.
4. Actions delegate to the same transport-neutral operation as the preceding
   Express action, retaining domain guards and safe failures. Serialize JSON inside
   the action guard, once, before handing bytes to Fastify. Response declarations
   remain documentation; do not enable coercion or field-stripping serializers.
5. Preserve admission → parsing/session/authentication → route-required context →
   afterAuthentication → ordered policies → CSRF/origin → domain prelude → declared
   validation → beforeAction → action. Raw multipart validates params/query/headers
   before reading bytes and complete body/files after staging, before hooks/action.
   A replacement subclass cannot bypass host-owned validation. Early replies use
   the shared submitted/deny boundary.
6. Context is immutable and brand-scoped, and may be unavailable before its route's
   resolver. Hooks do not grant authorization. Observers receive detached
   `HttpObservationRequest`/`SafeHttpError`, cannot change dispatch and retain
   asynchronous work. Use [the qualified hook/fallback contract](hooks.md).
7. Session stores borrow the runtime Mongo owner. Inspect TTL/indexes; only explicit
   maintenance creates them. Before raw publication, await required session writes.
   Request/accepted persistence work survives response completion and disconnect.
8. Select raw upload/progress/Companion through production configuration and the
   resolved `portal-raw-http` module. That module borrows domain dependencies and
   prepares the host's sole server before listen. Every dispatch entry, client
   script, polling request and upgrade enforces admission and security. Extension
   code receives no raw server or unqualified stream/callback capability.
9. Keep Express adaptation inside the private Companion boundary. No general
   Express authentication/session/policy bridge is permitted. The old first-party
   Express executable is a temporary development baseline until the planned cutover.

## Exact dependency baseline

Direct values are exact core pins. Round 1 reconciles root Engine.IO 6.6.9 to
the selected 6.6.11 core resolution and enforces it with root/core overrides.
No other locked package changes. `pilotPins.test.ts` checks both actual importer
graphs and all Socket.IO/Engine.IO lock entries; every packed consumer runs the
same resolved-version assertions against this entire table. The evidence records
the root/core lock SHA-256 identities.

| Dependency                    | Pin    | P2 role                                              |
| ----------------------------- | ------ | ---------------------------------------------------- |
| fastify                       | 5.12.8 | Host/readiness, routing and pinned close semantics   |
| find-my-way                   | 9.10.0 | Effective route identity/precedence                  |
| @fastify/cookie               | 11.1.5 | Native cookie parser/signing                         |
| @fastify/session              | 11.1.6 | Qualified native Session and borrowed store          |
| @fastify/proxy-addr           | 5.1.2  | Express-compatible explicit proxy trust              |
| qs                            | 6.16.1 | Qualified bounded nested query/form parsing          |
| @fastify/busboy               | 3.2.4  | Owned multipart parser                               |
| socket.io                     | 4.8.4  | Owned progress grants/polling/upgrades               |
| engine.io (locked transitive) | 6.6.11 | Every-request origin gate                            |
| @uppy/companion               | 7.1.1  | Isolated provider app/socket/emitter integration     |
| express                       | 5.3.0  | Companion prototypes/app and preceding host baseline |
| openid-client                 | 6.8.8  | Direct OIDC provider binding                         |
| jsonwebtoken                  | 9.0.3  | Direct AAF verification                              |
| mongodb                       | 7.7.0  | Runtime-owned pool and native session collection     |
| pino                          | 10.4.0 | Core diagnostic destination boundary                 |

Installed native plugin candidates `@fastify/formbody 9.0.1`, `@fastify/view 12.0.1`,
`@fastify/static 10.1.10`, and `@fastify/compress 9.3.0` are pinned but are **not**
qualified page/asset/compression implementations by G2. Native bounded parsers
supply P2 bodies. Later page/asset work must qualify the selected plugins against
the existing compatibility matrix. Node 26.12.1/npm 11.20.0 and TypeScript 5.9.3
are the qualification toolchain. Changing pins invalidates affected evidence.

## Stop, retry and restart

The host closes admission/readiness immediately and joins concurrent stop calls.
One absolute caller deadline bounds waiting; it does not cancel accepted work or
release borrowed dependencies. Preparation/activation settles before cleanup can
release resources it might use. Native transport closes once; application/module
cleanup drains and closes consumers before dependencies. A failed consumer retains
its dependency frontier; independent branches may close. Retry only after the
preceding attempt settles. Successful stop is idempotent.

Fastify 5.12.8 consumes rejecting onClose hooks and ignores native close callback
errors on its own. The host retains the one close attempt and observes native
failure: settled transport failure stays visible on every retry, while remaining
application cleanup can progress. Never retry native close to relabel failure as
success. A timed-out pending close remains the same tracked operation. Host tests
pin ready/plugin/onListen/close behavior and real socket interleavings.

Companion stops accepting callbacks/upgrades, retains transfers/session/provider
requests, and terminates adapter-owned sockets/grants at its deadline. Executing
provider work stays owned until settlement; socket termination does not prove
remote I/O cancellation. Cleanup retry remains required within shutdown. Full stop
requires a **fresh process**, because provider globals/cron/clients have no complete
public disposal API. Progress/transfer grants retain process affinity. No
cross-replica continuity or stopped-instance reuse is supported.

Logging failures latch degradation until operator restart. Readiness stays live;
status/health expose fixed degradation counters. There is no automatic recovery,
reopen, replacement logger or replay queue. Async sink work drains, but shutdown
never closes or waits for closure of a borrowed destination. See [logging](logging.md).

## Deliberate changes and qualification limits

- FM-014 `ACCEPTED-AUTO-PERSIST-FAILURE`: safe complete native 500 without success
  cookies/state replaces the preceding Express response abort on automatic
  save/touch failure. Namespace `redbox-fastify-v1:`, document version/generation
  and derived signing keys force login. Cutover **and rollback** require fresh
  random roots with no preceding-host verifier retained. In-deployment key
  rotation is distinct from rollback revocation.
- FM-016 `ACCEPTED-NESTED-INPUT-SAFE-RESPONSE`: nested version `toString` inputs
  return the intended sanitized status (including parser 400/CSRF 403), replacing
  the characterized Express abort. `ACCEPTED-LOGGER-DESTINATION-FAILURE` contains
  characterized destination/worker crashes; `ACCEPTED-LOGGING-HEALTH-SIGNAL` adds
  fixed fault-only logging health/status data. Round 9 supersedes recovery behavior
  in rounds 7–8. Pino's independent failed-open process-exit flush hook is not fixed.
- FM-018 intentionally narrows observer arguments from the illustrative design's
  live FastifyRequest to detached snapshots. Fallbacks fail closed for ambiguous/
  encoded unmatched paths and exclude HEAD, OPTIONS, unsupported methods and all
  core namespaces, including missing generated assets. This changes no matched
  route contract. Version/host constraints remain unqualified.
- FM-020 intentionally fixes the pre-existing Express polling-origin bypass on
  **both hosts**: every Engine.IO request, including existing sid polling and
  upgrades, checks canonical Origin before private progress dispatch.
- FM-021 Companion is process-local and requires fresh-process restart. Redis and
  periodic pings are rejected for missing public cleanup handles. Direct Grant
  entry under a nonempty implicit root has the retained baseline 404; native outer
  fallback is JSON versus the preceding empty page 404. External institutional
  OAuth, remaining provider paths, portal TUS callbacks and full streaming/provider
  matrices still require FM-035/FM-036. The P2 URL transfer uses a real external
  disposable TUS sink, not the unconverted portal TUS callback.
- FM-015 qualifies all portal identity providers using actual local credentials,
  bearer lookup, signed AAF assertions and a real local OIDC protocol server.
  External federation/institution deployment remains separate. Authentication
  version 6 plus fresh account/role lookup is preserved; no per-user version field
  is invented. HTTP behind an explicit proxy is qualified, not direct TLS/HTTP2.
- FM-017 preserves non-HTTP contributions and rejects API1 offline with guidance;
  bundled API1 hooks remain on the preceding production path until FM-038. FM-019
  scopes the pilot to selected declarations; both unresolved TUS overlaps still
  fail full-inventory composition. Full page/asset/browser, generator, packed
  release graph, WSU, performance, immutable image and deployment/rollback rehearsal
  gates remain later work. No earlier passing result substitutes for those gates.

These inherited decisions are bounded, named exceptions/limits, not permission
to normalize another differential failure. The FM-022 evidence maps each Q12
requirement and its failure/disconnect/retry controls to freshly executed tests.

FM-019's production configuration exclusions remain explicit:

| Configuration/behavior outside the pilot                                                           | Required later owner                                                                       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Optional `redboxSession.stringify` encoding                                                        | FM-042 must reconcile or reject it; native JSON namespace only is qualified                |
| Session proxy/rolling/resave/saveUninitialized deployment knobs                                    | Direct session API is tested, but the strict production schema does not admit new knobs    |
| Per-brand login redirect, provider failure templates/pages and failure-event username presentation | FM-029/FM-030                                                                              |
| Global page cache/Expires/COOP, CSP, complete EJS locals, translation/typeface/language rendering  | FM-029/FM-030                                                                              |
| Landing/view/asset roots and extension overrides/static_assets                                     | FM-029/FM-030/FM-031                                                                       |
| Form/contextVariables/reusable definitions and browser save returnMetadataOnSave                   | FM-024/FM-027/FM-032                                                                       |
| Remaining schema/browser/mutation route groups                                                     | FM-023/FM-024/FM-027                                                                       |
| API list/search limits and projections                                                             | FM-024/FM-027                                                                              |
| hiddenRoles/hiddenUsers/configured actions                                                         | FM-025/FM-028                                                                              |
| Branding logos/typeface limits and delivery                                                        | FM-028/FM-031                                                                              |
| Complete download/resumable/TUS upload matrix, disk threshold and staging behavior                 | FM-033/FM-034; only the real multipart pilot is qualified here                             |
| Complete progress/reconnect and Companion provider/portal-TUS matrix                               | FM-035/FM-036; optional modes and core grants are qualified pilots                         |
| RequestChronicle logging selection, sampling and correlation parity                                | FM-042; page response logging FM-029                                                       |
| Page/static outgoing compression and response helpers                                              | FM-029/FM-031; incoming bounded parsing is already qualified                               |
| Framework/Node request/header/keep-alive timeout defaults                                          | FM-042/FM-045 operational reconciliation; only stopDeadlineMs is a selected assembly input |

Default session qualification uses the deterministic pairwise subset, not the
optional 4,682-case full expansion. The existing 103 core pending cases retain
separate profile/prerequisite reasons; none can qualify a required pilot/provider.
A referenced provider timer can delay the dedicated Companion test process after
owned stop; prior evidence did not attribute its callback. Dedicated raw/installed
pilot commands retain their bounded exit harnesses only after owned stop, zero
pools and listener cleanup assertions. Process exit is never transfer-drain proof.
