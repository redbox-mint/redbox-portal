# SR-041/SR-042 — streaming multipart and resumable providers

## SR-041: owned streaming multipart

Implementation: `1e7045a0f`, with SR-035 storage extraction in `9b5942aa6`.
`http/express/multipart.ts` selects exact-pinned **@fastify/busboy 3.2.4** for
streaming field/file events and maintained count/byte limits. Random staging keys
are independent of submitted filenames. Both field orders work; repeated and
prototype fields, bad boundaries, count/size limits and unknown file fields are
refused. The parser streams to the existing selected staging disk and observes
backpressure. Finalization remains inside the admitted callback. Cancellation,
partial/unknown writes and failed cleanup are tracked: failed deletes remain owned
and make close fail observably until a successful retry.

`brandingUploads.ts`, `datastreamWrites.ts` and `datastreamReads.ts` replace the
13 inventoried upload declarations, using real branding inspection/sanitization,
Flydrive/GridFS, current record ACLs, stored concurrency/schema preconditions,
attachment journals and audit. API add-datastream finalization follows a successful
owned metadata save. Failure after that save reports its persisted partial outcome;
it does not claim rollback. Responses wait for staging cleanup. The browser and
Companion download aliases use current record view authorization. Static upload
mounts precede the raw tus ALL handlers; HEAD for those aliases falls through to
tus resume metadata. Legacy req.file transport code remains only in comparison
controllers until their last consumer retires; the standalone graph cannot load it.

The accepted SR-041 HTTP matrix executes real GridFS upload/download, SVG sanitization,
valid WOFF2 inspection, stale branding revision, unauthorized upload and cleanup.
The focused parser command in `packages/redbox-core` is:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --timeout 10000 test/http/StreamingMultipart.test.ts
```

**7 passing / 0 failing/pending**, exit **0** (`multipart-final1.log`). The
backpressure case stalls the real staging disk and observes that HTTP input stops
before the full 2 MiB upload is consumed. Other cases execute limit validation,
field order, cancelled streams, unknown writes, downstream failure, cleanup
failure/retry and admitted finalization during shutdown. That round's integrated command
executed the original six cases before the added backpressure case was loaded;
its aggregate is not inflated to include that seventh case. The current follow-up
matrix below includes all seven parser cases.

## SR-042: owned tus slice

`resumableUploads.ts` owns one **@tus/server 2.4.5** and the existing
`TusStorageManagerDataStore` per application, with raw parser exclusions. Upload
state remains on the selected disk; no session migration silently deletes it.
Configured total-size limits and bounded 32 MiB PATCH collection apply. Every
resume rechecks the current record edit ACL and persisted actor/brand/record
binding. Pending-record creation requires an explicit authorization operation.
A Companion callback secret alone grants nothing: its alias still needs actor
authentication and browser CSRF or a separately verified API bearer credential.
Session clients supply their CSRF header on raw tus requests, including HEAD
resume-state requests; verified bearer clients use the independent exemption.
Locations use the configured root-relative prefix, ignoring hostile forwarded
host/protocol. New transfers fence at quiesce and admitted handlers/audits drain.

The accepted local-tus command runs **4 tus cases**, no failures/pending:
two-chunk resume, offset conflict, provider reconstruction against persisted state,
current object/actor binding, authentication/CSRF/size checks, termination,
protected callback aliases and held post-response auditing during shutdown.
These prove the tus provider/callback surface, **not** a running Companion transfer.

## Companion public-API adapter decision and implementation

The orchestrator accepted a single-instance adapter for exact-pinned
**@uppy/companion 7.1.1**, superseding the earlier upstream/fork prerequisite.
`companion.ts` constructs its only `app()` during awaited host preparation, not
module load or first request. Metrics must be explicitly configured. The
process-wide guard is shared between source/built modules and is never reset;
starting another provider/application requires a fresh process. The provider's
cleanup cron starts at initialize and has process lifetime, which is an accepted
limitation. Redis and periodic pings are refused rather than acquiring more
undisposable provider resources.

`socket()` receives one application-owned, unlistened HTTP server. Its unused
ordinary HTTP connection parser is removed using Node's public listener API so
that already-upgraded sockets are treated as events, not parsed as HTTP again.
Only the canonical Companion socket paths are forwarded from the real listener.
The bridge's public connection/close events track raw sockets. Portal Socket.IO
retains its own path and ordinary unrelated-upgrade handling. No Companion/ws
constructor, method, scheduler or internal handle is patched or captured.

`mountCompanionRoutes` preserves the unbranded provider mount with a trusted
session/deployment brand/portal resolver, then binds the existing owned actor,
brand membership, checkAuth, CSRF/bearer and audit chain. Its bounded JSON/form
parsers follow the host parser exclusion; ordinary raw tus callbacks remain in
the existing owner. Non-string URL request bodies receive 400 before provider
effects. Explicit upload destination allowlists, canonical Origins and external
server path/proxy prefix are required. Callback writes still need an independent
actor credential/current record edit grant; callback secrets grant no bypass.

Returned public transfer tokens retain the existing HTTP request completion scope.
Public terminal emitter events or socket-connect expiry release it; one shared
upload-start listener manages active transfers. Quiesce refuses new HTTP/upgrades.
The application's absolute stop deadline now reaches resource drains through an
optional parameter on the existing `PersistenceResource.drain`. Companion waits
for admitted HTTP work/connections until that deadline, then destroys remaining
transports, releases retained transfer scopes, removes its forwarding listener
and closes the dedicated server. Ordinary Mongo operations remain owned by their
existing scopes; a deadline race can require the established stop retry.

### Accepted residual limits and released-v5 comparison

Provider-internal remote download/upload callbacks can outlive the drain deadline
and fail after the HTTP listener closes. They have no complete public cancel/join
API; process exit is the final boundary, and their completion is not guaranteed.
Keep the temporary directory for that process lifetime. Cancellation without a
terminal provider event can retain a scope until the stop deadline. Released v5
had no transfer drain at all. Bounded admission/drain/transport termination is the
accepted improvement, not a claim of complete upstream cancellation.

In-process active tokens support reconnect and tus pause/resume. Without Redis,
terminal-event replay and cross-process Companion transfer recovery are not
promised. Existing tus offsets/actor bindings remain persisted independently.
Cloud-provider OAuth credentials were not available or required for this decision;
the actual URL provider and protected tus callback are the executable transfer
qualification. No broad institution/provider or SR-044 browser/PDF combination is
claimed. See [design limitations](../design.md#companion-711-ownership-and-residual-limitations)
and [joint realtime verification](p6-realtime.md).

## Exact dependency changes and graph

New direct pins: production **@fastify/busboy 3.2.4**, production **socket.io 4.8.4**
(portal progress), development **socket.io-client 4.8.4** (real protocol tests).
Core/root locks were synchronized by npm **11.20.0**; no pre-existing resolved
package version changed compared with `a7d5ae36a`. Root gained 9 resolved packages,
core 11; remaining lock churn is deduplication/dev flags and ordering. No generic
multipart framework, Sails upload shim or global Express override was introduced.

Actual resolution on Node **26.11.1**: root Express **4.22.2** / Companion **7.0.2**;
core Express **5.2.1** / Companion **7.1.1**; core Companion resolves Express
**5.2.1** and ws **8.21.1**. Portal uses Socket.IO **4.8.4**, not Companion's ws
protocol. Graph differences are preserved intentionally; the initial graph audit
did not qualify remote transfers. The follow-up below exercises the URL provider
and its actual Express consumer, without claiming every cloud-provider integration.
Full environment and aggregate commands/results are in [API closure](p5-api-closure.md).

Additional exact development pins are **ws 8.21.1** and **@types/ws 8.18.2** for
real Companion protocol tests with configurable Origin and typed binary frames.
The ws runtime was already resolved at 8.21.1; no production runtime was upgraded.
Root's ws type declarations move from 8.18.1 to 8.18.2 to match the explicit core
test pin. Core/root locks retain the separate Express/Companion consumers.

## Round sources, provider graph and executed commands

Starting point: `a0fead94a`. Implementation **ab01644165c2186f85acc815cfdb427f0cdfab46**,
startup investigation **b6eefc1fc368053d022ad7614579993b2ec56758**, and final
late-response fence **3551a298549512d5b787e2e10ae450da46c6bb77**. The fence prevents
provider callbacks returning after transport termination from acquiring another
request scope or connect timer. Source/built/public protocol paths remain shared.

Actual host **agentvm**, Linux x86_64; Node **26.11.1**, npm **11.20.0**, TS
**5.9.3**, ts-node **10.9.2**, Mocha **11.7.6**. Core resolves Express **5.2.1**,
Companion **7.1.1**, Socket.IO **4.8.4**, ws **8.21.1**; Companion itself resolves
Express **5.2.1** and ws **8.21.1**. Root comparison resolution retains Express
**4.22.2**, Companion **7.0.2**, Socket.IO **4.8.1**. Both ws type graphs now use
**8.18.2**. The exact install used `--ignore-scripts --strict-peer-deps`; dependency
locks contain only the two explicit development declarations and root type patch,
with no production runtime version changes. Installed resolution is in
`companion-versions.log`.

Disposable providers were recreated with the accepted limits:

```sh
docker run -d --name sr-p5-mongo8 --memory=768m \
  --ulimit nofile=64000:64000 -p 127.0.0.1:34903:27017 \
  mongo:8.0.34 --bind_ip_all --wiredTigerCacheSizeGB 0.25
docker run -d --name sr-p5-solr-round2 --memory=768m -e SOLR_HEAP=256m \
  -p 127.0.0.1:34904:8983 solr:10.0.0 solr-precreate redbox
docker compose -p sr-p6-auth \
  -f support/integration-testing/docker-compose.bruno.oidc.yml \
  -f .tmp/sails-retirement/keycloak-ports.yml up -d keycloak
```

All exit **0**. Actual Mongo **8.0.34**, FCV **8.0**, nofile **64000:64000**;
Solr **10.0.0**; Keycloak **26.5.6**. Image IDs, respectively:

- `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`
- `sha256:c2a983cd9a5759c3b802b7b47f48b5cfae2b34d63a9444d62730fdbdb1b5308b`
- `sha256:8d44614c74798322c4e07fbe0ecb15cfbb5879d69b484628555f58ade06f0d8c`

Build, strict types and repository lint were run at root with the qualified PATH:

```sh
export PATH="/home/andrew/src/github/redbox-portal/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm run lint
node support/specs/sails-retirement/evidence/route-inventory.cjs --check
git diff --check
```

Each exits **0** (`companion-{build,types,lint}-guard.log`). Build includes actual
Prisma contract generation/copy; lint checks **1046 files**, **0 warnings/errors**.
Inventory remains **333 declarations**, **282 standalone**, **152/152 API
contracts**; the remaining 51 are SR-040. Targeted lint with a temporary copy of
the same configuration and its test ignore patterns removed checks all **4 new
test/diagnostic files**, **0 warnings/errors** (`companion-test-lint3.log`). The
first targeted attempts found no files because the project intentionally ignores
tests/CJS; those attempts are not counted. Prettier checks all five new or
rewritten source/test/diagnostic files successfully (`companion-format-check2.log`).

The executable Docker transfer/protocol command is:

```sh
docker run --rm --name sr-p6-companion-guard --network host \
  -v /home/andrew/src/github/redbox-portal:/home/andrew/src/github/redbox-portal \
  -w /home/andrew/src/github/redbox-portal/packages/redbox-core \
  -e HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http \
  -e HTTP_READ_SOLR_PORT=34904 redbox-portal:playwright-node26 /bin/bash -c \
  'TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js --no-config --timeout 45000 test/http/CompanionLifecycleProbe.test.ts test/http/CompanionUploadsMongo.test.ts'
```

The Node **26.11.1** test image is
`sha256:bf21fe175f5d79664f9a68a4069e0b3d876d4aa923ae3be9b669668ab2ab124f`.
The production child proves construction is inert, cleanup cron starts at
initialize and survives stop, initialization attaches once, and another app is
refused both before and after stop. It exits explicitly at the process boundary;
it never cancels internal cron handles. The real Mongo/HTTP suite runs a complete
URL-provider → authenticated tus callback → staged-byte path, including browser
CSRF, role/brand/object denials, malformed/disallowed input, 512 KiB pause/resume,
proxy-root paths, Socket.IO coexistence, admitted HTTP drain and deadline-forced
termination during a held remote-body transfer. The temporary directory survives
until process exit so intentionally late provider callbacks can finish/fail
without a test-induced missing-directory error.

Final guarded Docker result: **6 passing / 0 failing/pending**, actual natural
process exit **0** (`companion-docker-guard.log`), about eight seconds of assertions
after source loading. The container exits after Agenda's idle watchdog, with no
`--exit`, lock-lifetime change or timer patch. An earlier run before the final
late-response fence also passes 6/6 with exit 0 (`companion-docker-final.log`);
the guarded run is the final qualification.

### Intermediate failures and corrections

Initial protocol attempts exposed the unused HTTP parser on the bridge; ws frames
were being parsed twice. Removing only that owned bridge parser fixed it. A test
waiting for a first progress message after it had already arrived timed out; the
final check uses a held remote body and completed handshake. The first malformed
URL-object request hit an upstream validator exception; owned shape validation
now returns 400 before effects. One build/test overlap removed `dist` during
import and failed with MODULE_NOT_FOUND; all final builds precede dependent tests.
An expectation that Socket.IO removes every listener was corrected to its public
close behavior: its listener remains inert on the closed host; the Companion
forwarder is removed and both transports close. No library internals were patched.

Expected provider logs include refused 403/404 callback transfers and
ECONNREFUSED when the deliberately unfinished remote transfer resumes after host
stop. These exercise the documented failure/deadline limit and are not assertion
failures. Earlier test cleanup removed its temporary directory too soon and
produced ENOENT; retaining it until process exit corrected the fixture. Logs are
summarized here rather than reproducing upstream request/credential details.
No provider quota or usage limit occurred.

## Integrated HTTP and Bruno follow-up

After the final guarded build, from `packages/redbox-core` with the qualified PATH:

```sh
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http \
HTTP_READ_SOLR_PORT=34904 \
OIDC_TEST_ISSUER=http://127.0.0.1:18080/realms/redbox \
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --timeout 45000 \
  test/http/ConfigurationMongo.test.ts test/http/AuthenticationMongo.test.ts \
  test/http/OidcMongo.test.ts test/http/CsrfMongo.test.ts \
  test/http/RecordReadsMongo.test.ts test/http/QueryReadsMongo.test.ts \
  test/http/CompiledPilotMongo.test.ts test/http/RecordCreateAuthorizationMongo.test.ts \
  test/http/IdentityAdministrationMongo.test.ts test/http/BrunoPilotMongo.test.ts \
  test/http/RecordMutationsMongo.test.ts test/http/IntegrationAdministrationMongo.test.ts \
  test/http/ResumableUploadsMongo.test.ts test/http/ProgressSocketsMongo.test.ts \
  test/http/StreamingMultipart.test.ts test/http/ApiGroupClosure.test.ts \
  test/http/CompanionLifecycleProbe.test.ts test/http/CompanionUploadsMongo.test.ts
```

**153 passing / 0 failing/pending**, actual natural process exit **0**
(`companion-integrated-guard.log`), about two minutes of test execution. This
includes all seven parser cases, the production Companion process qualification,
five real URL-provider cases and the existing direct portal socket cases. Real
Mongo, Solr and Keycloak were used; no environment/provider test was skipped.
Bruno executes **34/34 requests and 53/53 scripted checks**, zero failures/skips.
Its separate declarative `Assertions` field is **0/0**; the 53 checks are the
CLI's `Tests` field. The standalone suites are explicitly included because they
cannot share the legacy global test setup.

After assertions finished, the process waited for Agenda's existing completed-job
watchdog (approximately half its default ten-minute lock lifetime), then exited
naturally. No `--exit`, timer patch, altered lock lifetime or signal was used.
This idle watchdog is distinct from Companion's accepted beyond-deadline provider
I/O. Expected late provider failures are summarized above.

## Final full Mongo core regression

At repository root with the qualified PATH, after active HTTP/provider assertions
had completed (only their idle watchdogs remained):

```sh
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34903/redbox_prisma_p5 \
  npm run test:core
```

**4417 passing / 68 existing pending / 0 failing**, actual process exit **0**,
about two minutes (`companion-full-core-final.log`). The 68 pending cases are
pre-existing suite cases and establish no new acceptance. New standalone Mongo
and Companion cases actually execute in the explicit HTTP/Docker commands above.
The source-import/sanitize assertion passes in **11.717 s**. Its measured source
transpilation cost and justified test-only timeout change are recorded in
[startup-profile.md](startup-profile.md); the compiled host's ten-second startup
bound remains unchanged. No assertion or persistence/queue policy was weakened.

## Task closeout

SR-042 and SR-043 meet their acceptance criteria under the orchestrator's explicit
single-instance/deadline decision and are ticked. The existing owned tus parser
exclusions/callback authorization and direct-progress implementation are reused;
there is no per-request Sails fallback, copied provider implementation, private
patch or upstream/fork prerequisite. The residual limits above and in the design
are part of this accepted implementation. SR-040/SR-044 were not started. The
accepted SR-035/SR-036/SR-037/SR-041 behavior remains covered by the full regression.

All final qualification processes exited naturally before disposable providers
were removed:

```sh
docker rm -fv sr-p5-mongo8 sr-p5-solr-round2
docker compose -p sr-p6-auth \
  -f support/integration-testing/docker-compose.bruno.oidc.yml \
  -f .tmp/sails-retirement/keycloak-ports.yml down --volumes
```

Both commands exit **0**; the Docker protocol container had already removed itself.
Only owned containers/volumes/network were removed. A stale failed read-run
process from the previously recorded Mongo crash (`p5-record-http-final.log`,
not the passing `final3` run) was terminated separately; no signalled process is
counted as final acceptance. Unrelated GraphQL specification files are untouched.
No push was made. Summarized logs remain under `.tmp/sails-retirement/`.
