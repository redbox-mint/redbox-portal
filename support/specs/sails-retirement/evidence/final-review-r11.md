4 class-(A) P1/P2 issues found

# Sails retirement final review — round 11

Review base `a49366803`, incoming HEAD `fecdbbe5b`; final runtime/test input
`2a534d75ff7052f966af5e8e48437b32e9cae5e9`. Work stayed in the shared
`stack/sails-retirement` checkout. No worktree, branch switch, push, publication,
tag or image build. The unrelated untracked GraphQL specification is untouched.
R1–R10 and the inherited backlog were read first. Applied the Code Review and
ReDBox Testing skills; independent Standards and Spec reviews covered the remaining
feature surfaces while the owning reviewer covered both state machines.

## Verified defects

| ID | Severity | Corrected boundary | Reproduction and correction | Commit |
|---|---|---|---|---|
| R11-01 | P2 | `assets/js/redbox-progress.js:23` | Delay the first grant request, close its transport, reconnect successfully with a second grant, then resolve the first request. An old token/401 disconnects the current socket; old 503/malformed JSON replaces it after an unnecessary retry. Bind every result and failure to its requesting transport generation, invalidated at Manager close, retry and explicit close. | `bee887404` |
| R11-02 | P2 | `packages/redbox-core/src/http/express/ExpressHost.ts:285` | With the production persistence owner supplied, fail application initialization or activation. Application rollback quiesces the HTTP resource, setting `stopRequested`; the host incorrectly skips listener and signal cleanup. Distinguish an actual host stop attempt from application-driven admission quiescence. Preserve the original failure and all explicit-stop deadline/retry behavior. | `94608f427` |
| R11-03 | P2 | `packages/redbox-core/src/application/portal/http.ts:187` | Enable AAF in hydrated default-brand AppConfig while startup defaults have no external provider. The production composition installs no AAF strategy and the signed callback fails; redirects also ignore selected-brand AppConfig. Prepare strategies and credential fields from hydrated default-brand auth after bootstrap, and read current selected-brand settings for each redirect. | `6e597a804` |
| R11-04 | P2 | `packages/redbox-core/src/http/express/login.ts:104` | A valid signed AAF assertion on the unbranded callback selects another brand through body/query with an empty session. Provisioning uses the default brand, then login rejects the new membership with 403. Pass the already-validated context to providers and audits through request parameters; provisioning, membership validation and redirect agree. | `2a534d75f` |

All four are feature-written code. No class-(A) P1 was reproduced. The executable's
outer startup catch explicitly retries host cleanup, limiting R11-02's production
impact; callers of the exported host still require the promised automatic cleanup.
Every fix has regression coverage and the required co-author trailer. Additional
server transition coverage is committed as `2c79f4c65`. No dependency changes.

## Progress state machines

The server has four owner states: unattached, accepting, quiescing, closed. Each
one-use grant is unused, consumed/authenticating, or absent; its 30-second lifetime
limits handshake admission, not an authenticated connection. Each live connection
owns a set of active rooms and a map of pending room intents. Concurrent joins
share one intent with a pending count. Unsubscribe invalidates that intent and
active membership synchronously, before its acknowledgement. Disconnection removes
the whole connection identity. These identities make late authorization harmless.

| Server state/event | Required transition and observable result | Permanent transition-table controls |
|---|---|---|
| Unattached → attach | Own one Socket.IO namespace/server attachment and its upgrade listener; accept only configured origins. | `connect`, `origin`; existing duplicate-attachment Mongo controls |
| Accepting → issue grant | Copy actor/brand/credential, issue random one-use grant; expired entries cannot authorize. | `connect`, `expired-grant`, `one-use-grant`, `missing-grant` |
| Grant → pending authentication | Consume before awaiting authentication; require current actor ID and brand membership. Denial/errors reject namespace admission. | `handshake-denial/error/actor/brand` |
| Pending authentication → connected | Only a live namespace connection acquires a strong session binding; disconnect/quiesce during authentication cannot retain one. | `handshake-disconnect`, `handshake-quiesce`; existing Engine.IO ownership regression |
| Connected → subscribe pending | Validate room shape and union of active/pending rooms, bounded at 100. Reauthenticate and resolve persisted record/task relations and current view grant. | `subscribe`, `subscribe-malformed/denial/error/brand/record`, `room-limit`, `pending-limit` |
| Pending join → active | Require current connection and room intent after authorization. Duplicate joins share intent; each callback acknowledges its own authorization result. | `duplicate-authorization`; existing independently gated duplicate test |
| Pending/active → unsubscribe | Delete intent and membership before acknowledging; unknown/already-left room is idempotent. Older authorization cannot rejoin or displace a later intent. | `unsubscribe-pending`, `unsubscribe-resubscribe`, `subscribe`; existing independently gated later-join regression |
| Pending join → disconnect/quiesce | Discard the join after authorization; retain the actual Promise for drain. | `subscribe-disconnect`, `subscribe-quiesce`, `shutdown-pending` |
| Active → deliver | Match progress brand and one subscribed record/progress/task room. Reauthenticate/reauthorize and recheck live connection/membership immediately before emission. Deliver once even with multiple matching room candidates. | `delivery`, `delivery-denial`, `delivery-brand`; existing real-Mongo record/task/ACL controls |
| Pending delivery → unsubscribe/disconnect | No event after acknowledged leave or connection removal. | `delivery-unsubscribe`, `delivery-disconnect`; existing R10 gated emission regression |
| Connected → grant expiry | Connection continues; every join/delivery still requires current authentication and ACL. Expiry does not revive or replay a consumed grant. | `grant-expiry-connected`, `one-use-grant` |
| Disconnect → reconnect | Old connection and rooms are gone; a fresh grant creates a fresh binding and requires rejoining. | `disconnect-reconnect`; client table and dedicated browser |
| Accepting → quiescing | Clear unused grants; refuse new grants/joins and unscoped emission. A live accepted HTTP/job scope may report completion. | `quiesce`, `accepted-completion`, `handshake-quiesce`, `subscribe-quiesce` |
| Quiescing → closed | Join every tracked handshake/join/emission, close transports, detach owned upgrade listener and clear connections. Repeated close is harmless; closed emission fails. | `shutdown-pending`, `close`; existing host preparation/drain tests |

The client states are grant-pending, namespace-connected, transport-disconnected,
retry-waiting, authentication-denied and explicitly-closed. A monotonically
increasing connection generation owns each asynchronous grant request. The desired
room set survives transport reconnect; Socket.IO handles wire buffering, while the
connect callback rejoins the current set. Duplicate buffered/connect joins are
intentional and accepted by the server's shared room intent. A subscription's
original acknowledgement is not replayed on reconnect. Explicit close is terminal.

| Client state/event | Required transition and observable result | Permanent controls |
|---|---|---|
| Construct/connect → grant-pending | Select WebSocket, fetch a fresh grant using same-origin credentials, current CSRF and API-version headers. | Existing dedicated shipped-helper browser; recovery tests |
| Grant success → namespace authentication | Pass only the current generation's nonempty token to Socket.IO. | Recovery table; `initial-intent`; stale-response table |
| Current HTTP 401/403 | Disconnect without a retry loop. A new authenticated helper is needed after login. | Client table `401`, `403` |
| Current 5xx/network/malformed response | Disconnect and schedule one one-second retry; fetch a new grant. | Existing recovery table `503`, `network`, `json` |
| Namespace rejection | Socket.IO does not automatically retry this case; schedule fresh-grant recovery. | Existing recovery table `handshake` |
| Grant pending → transport close/reconnect | Invalidate its generation even before namespace connection. A later token, denial, backend failure or JSON error has no effect on the current transport. | Four stale-response table rows, all failing before R11-01 |
| Subscribe/unsubscribe before connect | Retain desired intent and ordered buffered events; cancellation leaves no membership once the wire is fenced. | `initial-intent`, `cancel-initial-intent` |
| Connected → subscribe/unsubscribe | Forward subscribe acknowledgement once; unsubscribe clears desired intent and wire membership. | Client table membership/acknowledgement assertions |
| Connected → start/update/stop | Forward each event and payload to the consumer. | `delivery`; dedicated browser delivered-progress assertions |
| Connected → transport disconnect → reconnect | Obtain a different grant and rejoin desired rooms; do not repeat the original subscribe callback. | `reconnect`; dedicated browser transport reconnect |
| Retry wait or grant/JSON pending → close | Cancel retry, invalidate generation, clear rooms and disconnect; late results cannot invoke auth or schedule reconnect. | `close-retry`, `close-json`, existing pending-fetch close regression |

Baseline comparison uses `a49366803:packages/redbox-core/src/controllers/AsynchController.ts:121–281`
and the removed Sails virtual-HTTP consumer. The old subscribe checked socket
transport, session brand, related record and view access, then called
`sails.sockets.join`; unsubscribe called `leave`; broadcast addressed record,
progress and task rooms. The new host preserves those room/event capabilities
with the documented coordinated protocol change (design §1.3/§9.4): virtual HTTP
returns 410, browser grants are CSRF-protected and single-use, reconnect rejoins,
and current authentication/brand/ACL is checked at delivery too. Legacy Sails room
membership alone did not express the new accepted-work drain contract. No replay,
event history or guaranteed delivery across disconnect is promised by either
implementation. Clients query persisted progress after reconnect as needed.

The server's shared intent/pending count is necessary for independent concurrent
authorizations; replacing it with last-request-wins reintroduces R9's shipped-client
failure. The implementation remains unchanged after this round's 35-row real-wire
server table. The client needed one generation invariant rather than another
retry branch or a separate state framework. Existing R8/R9/R10 controls stay intact.

## Express host lifecycle state machine

Host phases below are derived from its existing promises/status flags; no duplicate
lifecycle enum or second resource registry was added. Application state remains
authoritative for module readiness. `initializing`/`activating` join their in-flight
operations; host stop owns listener/signals, application stop owns dependencies.
The raw startup-stage Promise is joined, rather than its failure handler, avoiding
a shutdown/failure-handler cycle.

| Host phase/event | Transition, ownership and failure behavior | Controls |
|---|---|---|
| Constructed → activate | Reject until initialization/preparation has completed. | Both owner variants in every table row; existing host tests |
| Constructed → initialize/bind | Join concurrent initialize; install closed admission before listen. A bind failure starts no modules and closes the host. | `normal`, `stop-before-bind`; existing occupied-port regression |
| Bound → initialize application | Health/readiness/ordinary routes reflect closed admission; wait required application stages. | `stop-stage initialize`, `deadline-stage initialize`, `failure-stage initialize` |
| Initialized → prepare HTTP | Bind middleware/native integrations while ordinary admission stays closed. Cleanup cannot overtake late acquisition. | `stop-stage prepare`, `deadline-stage prepare`, `failure-stage prepare`; R10 real heartbeat/upgrade controls |
| Prepared → activate | Join concurrent activate; open readiness only after application activation completes. Failure preserves its original exception and closes host resources. | `normal`, `stop-stage activate`, `deadline-stage activate`, `failure-stage activate` |
| Any phase → stop | Quiesce immediately; admission becomes terminal. Concurrent stop calls return the same attempt. Do not enter another startup stage. | All stop rows with and without owner; existing preparation tests |
| Constructed/just-started → stop | Stop without acquiring modules or leaking a late listener; initialization cannot restart. | `stop-constructed`, `stop-before-bind`; existing bound-in-flight control |
| Startup in flight → stop deadline | Fail observably and retain ownership. Releasing acquisition does not silently certify stop or start an automatic late cleanup retry. Explicit retry joins prior work, then cleans. | `deadline-stage initialize/prepare/activate`; existing expired-retry controls |
| Active → drain | Close listener and await accepted HTTP work; owner-backed application drain may run concurrently because it owns tracked request work. Nonpersistent hosts wait transport/request completion before releasing modules. | `normal`, `drain-deadline`; existing gated HTTP response test |
| Application rollback → host failure | Application-driven HTTP quiescence is not a host stop. Host still closes its listener and signal registrations after initialize/activate failures. | Both `failure-stage` rows reproduce R11-02 with owner supplied |
| Stop → drain/close/quiesce failure | Set `stopFailed`, never report host stopped, retain failed cleanup for retry. A transient first quiesce failure may already be successfully retried by application stop; host still reports that attempt's failure. | `drain-deadline`, `close-failure`, `quiesce-failure`, both owner variants |
| Stop attempt deadline → retry | Join the prior application stop before a new attempt; an already expired retry must not schedule later cleanup. | Existing two application-stop race controls |
| Successful stop → stopped | Listener absent, no retained integration, application cleanup complete, signals removed. Repeated stop succeeds; initialize/activate reject and require a fresh host. | Every successful table row; existing actual compiled SIGTERM subprocess |

All 30 lifecycle table rows pass. The valid reviewed-head control substitutes only
`ExpressHost.ts` in memory and fails precisely the owner-backed initialize and
activate failure rows (28 pass, 2 fail). R10's preparation join is correct and
retained. The new guard closes an older startup-rollback entrance; it does not
change R10's ordering. No new host state framework, global task registry or
lifecycle refactor was needed.

## Authentication and independent review

The Spec review independently reproduced R11-03/R11-04 with production composition,
real Passport strategies, signed AAF assertions and actual Accounts provisioning.
The retained source probe is `.tmp/sails-retirement/final-review-r11/spec/composition-auth.cjs`.
The pre-feature `UsersService.ts:1035/1309` prepared providers from hydrated
default-brand auth, `UserController.ts:118` read selected-brand redirects, and
`BrandingService.ts:230` honored request body branding. These are regressions,
not inherited defects. Design §6 requires brand-specific settings to remain
dynamic, and §9 preserves local and supported OIDC/AAF callbacks.

`PortalAuthentication.test.ts` contributes six permanent tests. Two bind the actual
production HTTP composition and provider installer, covering hydrated strategies,
custom credential fields, current selected-brand redirects/cache changes and absent
hydrated-auth fallback. Four exercise real HTTP callbacks with signed AAF assertions,
actual Accounts provisioning and resulting membership for body, query, session and
invalid inputs. Invalid context creates no account. OIDC retains its validated
session-bound callback handling. The pre-fix config control fails the hydrated
provider test; the pre-fix context control returns 403 instead of 302 for both
body and query, while session and invalid controls pass. All six pass after fixes.
The complete provider/API/browser suites passed again on the final tree below.

Standards: no documented standards violation or further class-(A) P1/P2 confirmed.
Exact pins remain unchanged. Spec: the two auth defects above are corrected; no
additional verified spec gap beyond the accepted institution qualification gap.

## Remaining review and disposition

R10's optional-route alternatives/root handling, room delivery recheck, preparation
join, transient-grant recovery and complete asset precedence remain correct.
R11-01 adds stale-generation handling to the recovery protocol, and R11-02 covers
application rollback independently of the preparation race. **No R10 fix was
shown wrong or reverted.** The Standards route probe tested 8,320 valid generated
declarations, 3,280 structural-identity pairs and 475 paths per pair without a
false equivalence; this is bounded sampling, not a mathematical equivalence proof.
The actual baseline asset probe passes 19 rows/105 checks. Existing route and
asset tables passed again in the full suites. The fresh general pass also judged
configuration precedence/redaction, extension ownership/replacements, session
rotation/logout, request admission, record/attachment boundaries, maintenance
ownership and runtime/dependency retirement clean of further confirmed class-(A)
P1/P2 defects. These bounded review conclusions are backed by the full qualification
below; they do not assert absence of all possible defects.

P3: no additional product defect confirmed. A first host-table draft incorrectly
required retained application resources after a transient quiesce error even
when its immediately following application stop had retried quiescence and
completed cleanup; that assertion was corrected before the accepted negative
control. A preliminary typecheck used a wrong local matcher overlay (host root's
old 0.1.13 rather than core's pinned 8.4.2); the correct bytes were restored before
all accepted qualification. A first auth probe omitted Mocha's required Chai preloading and hung during source import; it was terminated and supplies no gate. The initial page-byte audit detected the old compiled
helper before its current source was copied; the closing audits verified both match.
These are rejected fixture attempts, not product findings.

Backlog addition: **B-06**, REST `includeDisabled=true` is coerced to a boolean but
compared with a string. Actual baseline/current probes reproduce unchanged output
under Node 26.11.1. No inherited implementation is modified and no severe
ordinary-user access-control exception is invoked. B-01–B-05 remain unchanged.
SR-005/045/049/055 remain unchecked solely because no representative institution
is designated.

The initial dedicated browser attempt passed 3/4 controls but the real Keycloak
check stopped at the provider error page before login. Its trace, screenshot and
provider log identify `invalid_redirect_uri` for
`http://127.0.0.1:1500/portal/user/login_oidc`: the scratch provider allowlist had
been augmented for a different port. That rejected attempt is archived in
`.tmp/sails-retirement/final-review-r11/browser-provider-fixture-rejected/` and
supplies no accepted browser gate. The exact actual callback was added to the
scratch import and the disposable provider recreated. All four dedicated browser
controls and the remaining post/maintenance gates were rerun successfully. Repository runtime and test inputs remained unchanged,
so completed final-tree gates remain valid.

## Final-tree qualification

Every final gate passed on runtime/test input
`2a534d75ff7052f966af5e8e48437b32e9cae5e9`. The stopped `2c79f4c65` build prefix
supplies no accepted gate. The rejected provider fixture attempt supplies no accepted
browser gate; all four controls were rerun after correcting the allowlist, without
changing repository inputs. No host restart occurred during accepted qualification.

| Gate | Accepted final result |
|---|---|
| Clean install / full build / pages | Literal pinned `npm ci --ignore-scripts --strict-peer-deps`, complete backend/22 Angular apps/Webpack `npm run compile:all`, and `npm run package:pages` passed; Webpack reports nine advisory warnings. |
| Package builds / types / configuration | All five package builds, six container typechecks, six host typechecks, root typecheck, generated Prisma and portal-configuration checks passed. |
| Core default | **4,777 passed**, 7 existing pending. Includes all new server/client/host/auth controls. |
| Core real-service | **216 passed**, natural process exit without instrumentation or forced exit. Like R10, exit followed a several-minute idle interval after test completion. |
| Root | **422 passed**, 10 existing pending. |
| Storage / dev-tools / PDF unit | **306 / 53 / 79 passed**. |
| Full Playwright / harness | **124 passed in 7.2 minutes**, one worker, zero retries; **19 harness checks passed**. |
| Dedicated retirement browser | **4 passed**, including shipped progress helper subscriptions/reconnect/delivery, actual multipart/tus/Companion bytes, real Keycloak login, durable completion and deadline/stop retry. Closing pools, Prisma clients and upgrade listeners: zero. |
| Production / generated institution | **1 / 1 passed**, including persisted work, restart and drain. |
| Persisted extension qualifiers | **5 passed**. |
| Companion lifecycle / uploads | **2 / 6 passed**. |
| General Bruno | **309/309 requests, 554/554 tests, 3/3 assertions**. |
| OIDC / S3 / PDF Bruno | **13 requests / 17 tests; 7 / 12; 4 / 10**, all passed. |
| Packed standalone maintenance | **10 commands across 102 scopes**, including 3 Agenda scopes, online install, offline `npm ci`, workflow maintenance, replacements and Mongo-bound built-ins with SQS selected by default. Pending/failures/pools: zero; explicit backfill changes one entry, then zero. |
| Lint / documentation | **937 files**, zero lint warnings/errors; API reference, generation, audit and all **4 documentation tests** passed. 43 published surfaces; 524 advisory findings. |
| Retirement closure | **14 tooling regressions passed**; **1,098 source / 6,161 installed-tree files** checked with zero executable/dependency violations; **1,261/1,261** baseline inventory files reconciled. |
| Exact pins / lock roots | **23 manifests, 377 declarations, 20 allowed local references and six lock roots** checked; zero violations. No dependency changes. |

Every accepted JUnit suite has zero failures, errors and skips. Existing Mocha
pending tests are reported separately above. Closing builder and clean-source
audits each match **all 1,335** selected authored runtime/test/configuration inputs;
**all 48** changed root assets/views/TypeScript/entrypoints match. Raw and compiled
progress helpers are byte-identical. Both runtime matcher consumers and the actual
clean-source installation use the verified pinned `path-to-regexp@8.4.2` bytes.

Qualification uses Node 26.11.1, npm 11.20.0 and MongoDB 9.0.4. Existing historical
toolchain/native images with current compiled overlays were reused; no replacement
immutable-image or topology-matrix qualification is claimed. The full stage records,
input revisions, suite counts, provider correction, review dispositions and retained
local evidence hashes are recorded in
[qualification.json](final-review-r11/qualification.json).

Cleanup removed all seven main/compile containers, all Compose profile containers,
all three captured anonymous volumes and all round-labelled Compose volumes, the
owned profile network, all three firewall rules and all round hosts aliases.
Remaining owned containers, networks, volumes and firewall rules: **zero**. The
restored isolated dockerd/containerd were stopped. Their runtime directory and
residual namespace reference were removed; mount detection required sudo before
removing the namespace file and empty owned parent directories. The host's
pre-existing Docker service and durable isolated engine images/data are preserved.
No image was built or new dangling image created; pre-existing dangling image
`9bf944d09e37` remains untouched.

Round compiled overlays were removed after final audits. No original artifact
cache was relocated and no temporary artifact backing directory was created.
Bruno-generated environment and lock changes are archived, and both tracked files
are restored byte for byte. Diagnostic logs remain locally. The qualification
collector accepted every stage record, suite output, input revision, closing audit
and cleanup witness; all **263 retained evidence hashes** were verified against
the actual files.

This evidence-only commit follows the tested runtime commit. No application code,
test or dependency change follows the accepted final qualification.
