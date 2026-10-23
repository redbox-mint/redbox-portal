# P4 authenticated standalone HTTP pilot

Starting source: `29c29f326` on `stack/sails-retirement`, shared checkout.
P0–P3 implementations are reused. Commands run from the repository root unless
specified. All checks prepend the absolute local toolchain directory
`.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin` to PATH:
Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**, ts-node **10.9.2**,
Mocha **11.7.6**. Logs are summarized here and retained locally in ignored
`.tmp/sails-retirement/p4-*.log`. No dependency changes.

## SR-026 — Contract inputs and injected resolution

Shared extraction/validation now consumes `ApiRequestInput`: params, query, headers,
body and files, with optional route metadata for legacy resolution. No Sails request
type or helper is required. `getMergedApiRoutes(configuration)` accepts explicit
providers/runtime routes; `createApiRouteResolver(routes)` owns its selected route
snapshot. Existing no-argument comparison conveniences and their cache remain
legacy consumers for later retirement. Role metadata is documentation, not execution.
Public URLs, declared fallback order and Zod/OpenAPI contracts are retained.

Commands actually run:

```sh
npm --prefix packages/redbox-core run build
# In packages/redbox-core, with the absolute qualified PATH:
./node_modules/.bin/tsc
# Root:
npm --prefix packages/redbox-core run typecheck:application
npm run validate:api-routes
# In packages/redbox-core:
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 10000 test/http/Contracts.test.ts test/bootstrap.test.ts test/unit/generate-openapi.test.ts
# Root:
npm run lint
```

Final production compilation and strict application typecheck **exit 0**.
Existing contract validation **49 passing / 0 failing/pending**. Focused contract,
bootstrap and actual OpenAPI/Blueprint generation **19 passing / 0 failing/pending**.
New cases cover minimal requests, missing/repeated query, query/path/body fallback
precedence, registry isolation and compiled imports with Sails loading forbidden.
Repository lint **888 files / 0 errors/warnings**, exit 0. No prior tests removed.

Initial clean build/typecheck failed because the new optional method needed an
explicit absent-value default; corrected. Initial new compiled-import case hit
Mocha's default 2-second limit while parallel compilers were running (**18 pass /
1 fail**); its subprocess allowance is explicitly 10 seconds and the final complete
focused command passes. Existing timeouts/assertions remain unchanged. The initial
build's Prisma generation/copy inputs passed; final phase clean build follows below.

## SR-027 — Authenticated actor, brand and effective policies

`http/express/identity.ts` binds only credential-safe identity repository operations.
It hashes bearer credentials using the existing SHA-256/base64 representation,
verifies local passwords through the repository, resolves linked primary accounts,
and rereads disabled state and memberships. Cycles/orphan aliases fail closed.
Only ID, username and brand-qualified role IDs reach the authenticated context.
Brand/portal comes from matched path parameters and a current branding repository
read; query/body/session snapshots cannot supply actor or tenant authority.

`policies.ts` resolves ordered route policies followed by the most specific
controller/action/global mapping, including boolean allow/deny, normalized targets,
explicit overrides and missing-binding failure before serving. Pilot execution is
no-cache → brand/portal → authentication → brand-specific role/path authorization →
contract validation (the latter is bound in SR-029). An absent grant denies access.

Focused commands (qualified Node 26 PATH):

```sh
# In packages/redbox-core:
./node_modules/.bin/tsc
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --timeout 10000 test/http/Policies.test.ts
# Root:
npm --prefix packages/redbox-core run typecheck:application
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http npm --prefix packages/redbox-core run test:http-pilot:mongo
npm run lint
```

Production compile and strict application typecheck **exit 0**. Unit/real-loopback
HTTP **3 passing / 0 failures/pending**: policy overrides/order/booleans; linked,
disabled/orphan/cyclic actors and repository failures; unauthenticated/wrong-role/
wrong-brand/invalid-portal/spoofed-query denial and sanitized authentication errors.
Actual Prisma/Mongo identity **2 passing / 0 failures/pending**: credential hashing,
password verification, populated memberships, primary/alias resolution, immediate
membership/disable changes and deleted primary rejection. Required URL is asserted;
no conditional skip. Lint **890 files / 0 errors/warnings**, exit 0.

Disposable database host `sr-p4-mongo8`: **MongoDB 8.0.34 / FCV 8.0**, unauthenticated
standalone at **127.0.0.1:34903**, image
`sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
Commands: `docker run -d --name sr-p4-mongo8 --memory=768m -p 127.0.0.1::27017 mongo:8.0.34 --bind_ip_all --wiredTigerCacheSizeGB 0.25`,
`docker port sr-p4-mongo8 27017/tcp`, and live `mongosh` build/version, FCV and hello
queries. Fixture databases have checked unique `sr_p4_http_` prefixes and teardown
drops only those databases. No institution/topology qualification is claimed.

Initial strict check required an explicit linked-ID string annotation. First Mongo
setup attempted index maintenance before persistence initialization; fixed ordering.
Next **0 pass / 2 fail** exposed raw test tokens where the existing repository expects
already hashed tokens. Corrected the fixture to existing storage semantics; final
same tests pass. No production assertion, timeout or skip condition was weakened.

Deliberate security changes versus the legacy chain: absent/invalid authentication
returns **401** with a Bearer challenge, rather than a login redirect or a path-rule
403; operational auth errors return sanitized **500**. Missing path rules and
orphan aliases deny instead of recovering permissive legacy behavior. Authenticated
wrong-role/wrong-brand requests retain **403**. Consumers must authenticate and
configure explicit brand grants; there is no anonymous pilot access.

## SR-028 — Per-application middleware and accepted request completion

The explicit standalone order is admission/accepted persistence scope → request
Chronicle/log context → JSON/urlencoded parsers (1 MiB, extended query parser,
explicit raw-path exclusions) → session load → per-app Passport initialization and
fresh session deserialization → route policies → adapter → sanitized error mapping.
Policy promises and returned action work share the host's existing accepted-work
lifetime. Ordinary endpoint Observables require exactly one emission and completion;
a late error or extra emission cannot become a successful first-value response.
There is no process-wide Passport/parser/session cache or fallback dispatch.

The existing session implementation moved into `http/express/session.ts`; the
Sails module is a thin lifecycle adapter over that same code. Host and session now
join one request lifetime. Session-store lookup/save/touch/destroy callbacks and
Passport deserialization retain ownership after disconnect. A failed standalone
session save destroys a potentially partial response instead of completing a clean
200. Headers already sent are never followed by a second JSON response.
Mongo sessions borrow the runtime client, with a close facade preserving pool
ownership. Standalone preparation awaits store readiness and **inspects** the TTL
index; explicit maintenance prepares it. See `maintenance-v6.md` for selected
session database/collection and index behavior. Default cookies remain secure,
HttpOnly and SameSite=Lax. Plain-HTTP fixtures explicitly set secure=false.
Explicit trust-proxy/root-context options do not promote this host to production.
Browser/provider flows, CSRF, logout routes and upgrade cookie invalidation remain
P6; the login endpoints in these tests are fixture-only `/__test/*`/`/login` routes.

Actual commands (same qualified PATH and MongoDB 8.0.34/FCV 8.0 host as above):

```sh
# In packages/redbox-core:
./node_modules/.bin/tsc
# Root:
npm --prefix packages/redbox-core run typecheck:application
npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 10000 test/http/Middleware.test.ts test/http/Policies.test.ts test/middleware/redboxSession.test.ts test/middleware/requestLifetime.test.ts test/http/ExpressHost.test.ts
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http npm --prefix packages/redbox-core run test:http-pilot:mongo
npm run lint
```

Middleware/policy/legacy-session/lifetime/host regression: **61 passing, zero
failures/pending**. Real Prisma/Mongo identity/session suite: **7 passing, zero
failures/pending**. Delayed real writes run through both normal response and client
abort: stop hits its explicit deadline while native pools and Prisma clients remain
owned, then retry closes them after persisted completion. A separate aborted
Passport deserialize case delays the real identity read until retry. Failed saves
leave no stored session and the HTTP response cannot complete successfully.
Two applications prove independent Passport/cookies/stores; one parser, session
read and request log run per supported request. Context survives Promise/Observable
work. Existing session/lifetime assertions are preserved.

During development, a late-installed store stub missed the captured method and
stalled an early fixture run; that owned test process was terminated (143), and
the stub now installs before middleware construction. Two fixture assertions
initially failed: Passport deliberately saves during rotation and again at response
completion, and the login body must be consumed before resetting the log spy.
Both fixtures were corrected to measure real per-request reads/logs, without
weakening production behavior. A duplicate test variable briefly failed strict
compilation and was removed. Final checks and source IDs are recorded below.

Final production compile and strict application typecheck **exit 0**. Repository
lint: **895 files, 0 warnings/errors**, exit 0. No dependency or lockfile changes.

## SR-029 — Both standalone record-type endpoints

`mountRecordTypeRoutes` installs only the existing GET list/get contracts, selected
from explicit resolved inputs (or the core pair). It rejects missing/duplicate or
unsupported dispatch targets before router mutation; it resolves all ordered policy
bindings first. Validation follows the effective policy chain. The adapter passes
only a resolved brand and validated name into the existing `RecordTypes` instance,
awaits its single completed result, and owns the response. No legacy controller,
core barrel, global service or Express request reaches the domain implementation.

List preserves `summary: { numFound, page: 1, start: 0 }` and `records`. Get preserves
the complete persisted definition. V2 wraps successful data with `meta: {}`; query/
header version negotiation, conflict/unknown fallback, JSON content type and
no-cache headers retain CoreController semantics. The current and released HTTP
controllers expose no `fields` contract and ignore unknown query fields. That
behavior is retained, while direct domain projection remains available and tested.
Schema discovery is additive only when enabled, using authenticated path scope and
root context, as in the intermediate schema-enabled source. Missing definitions
keep the existing generic **500** `{ errors: [{ detail: 'Check server logs.' }],
meta: {} }` response. The explicit null check also avoids the intermediate
schema-enabled controller's null dereference/error disclosure. Missing definitions
are not silently converted to a new 404 contract.

Partial-host route inventory for this composition:

| Group | Standalone coverage |
| --- | --- |
| Record-type API | `GET /:branding/:portal/api/recordtypes`, `GET /:branding/:portal/api/recordtypes/get?name=...` |
| Readiness | existing `/readyz`, outside optional root context |
| Records/forms/workflows/schema resolver/admin/search/vocab/etc. | Unmounted, 404; P5/P6 |
| Legacy record-type AJAX and browser/provider/login/upload/socket routes | Unmounted, 404; P5/P6 |

Returned schema discovery URLs describe the existing contract; resolver endpoints
are still part of the unmounted schema API group. This is a deliberately partial
test host, not a promoted portal or a request-level legacy split router.

Executed on the same Node 26/Express 5/Mongo 8 host:

```sh
# In packages/redbox-core:
./node_modules/.bin/tsc
# Root:
npm --prefix packages/redbox-core run typecheck:application
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http npm --prefix packages/redbox-core run test:http-pilot:mongo
npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 10000 test/http/Contracts.test.ts test/controllers/webservice/RecordTypeController.test.ts
npm run lint
```

Focused contract/legacy schema-controller regression: **8 passing, zero failures/
pending**. The real-Mongo pilot includes both exact URLs, persisted get/list,
empty/missing outcomes, v2, ignored HTTP field selection plus retained direct domain
projection, additive discovery/root scope and explicit absent-route 404s.
Initial strict compilation exposed incomplete legacy model declarations (`name`
not declared on RecordTypeModel; optional brand name). The adapter now validates
runtime public names through typed narrowing; no casts suppress these errors.
Final check counts/source IDs are recorded below.

Final real-Mongo pilot **10 passing, zero failures/pending**. Production compile
and strict application typecheck **exit 0**. Lint **896 files, zero errors/warnings**,
exit 0. No dependency changes.

## SR-030 — Authenticated parity, failures and final regression

### Released reference versus intermediate source

The SR-003 released fixture is retained unchanged. Its two REST requests labelled
record types actually call forms; its real record-type requests are AJAX routes.
To close that pilot-specific gap, this round also ran the exact REST URLs against
the **same released v5.0.4 image**, in an isolated Sails/Waterline process/database,
not the current Prisma comparison adapter. Synthetic-only local configuration and
credentials were the existing SR-003 fixture inputs. No institution data was used.

Commands actually executed (the probe is now committed beside this evidence):

```sh
docker network create sr-p4-reference
docker run -d --name sr-p4-v5-mongo7 --network sr-p4-reference --network-alias mongodb --memory=768m mongo:7.0.43-jammy --bind_ip_all --wiredTigerCacheSizeGB 0.25
docker run -d --name sr-p4-v5-solr --network sr-p4-reference --network-alias solr --memory=768m solr:10.0.0 solr-precreate redbox /opt/solr/server/solr/configsets/_default
docker run -d --name sr-p4-v5 --network sr-p4-reference --memory=1536m -p 127.0.0.1:18544:1500 -v "$PWD/support/specs/sails-retirement/evidence/v5-local.cjs:/opt/redbox-portal/config/local.js:ro" -e NODE_ENV=integrationtest -e PORT=1500 -e LOAD_DEFAULT_FORMS=true -e sails_security__csrf=false -e sails_brandingConfigurationDefaults__auth__local__default__token=d077835a-696b-4728-85cf-3ffd57152b1e qcifengineering/redbox-portal@sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9
docker exec sr-p4-v5 node -p 'process.version'
docker exec sr-p4-v5-mongo7 mongosh --quiet --eval 'db.version()'
python3 .tmp/sails-retirement/p4-reference-probe.py
# Same probe copied unchanged to evidence/probe-released-v5-p4.py.
docker rm -f -v sr-p4-v5 sr-p4-v5-solr sr-p4-v5-mongo7
docker network rm sr-p4-reference
```

Released artifact digest remains
`sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9`,
tag source `c1dda53999f3b026347008731f33dba834e06c27`, actual Node **24.16.0**,
Mongo **7.0.43**, Solr **10.0.0**. `released-v5-p4-results.json` records **13 actual
API responses** after successful local admin login: list/get v1/v2, ignored field
selection, missing v1/v2, invalid v1/v2, repeated names, conflicting success and
validation versions, unknown-version fallback. No cookies/credential hashes,
physical row IDs or request authorization headers are in the result artifact.
The initial readiness curl saw a connection reset before lift. The first login
probe omitted the existing branding/portal and AJAX headers, followed an HTML
redirect and failed JSON decoding; corrected to the released login contract.
Startup logged existing unexecuted Waterline-query warnings. These are reference
run limitations, not standalone regressions.

The standalone replay seeds the five **logical name/packageType/searchable fields**
from SR-003's sanitized record-type definitions with fresh physical IDs and the
current authenticated fixture brand, then compares all 13 observed statuses,
cache headers, list summaries/names, selected definition fields, version envelopes
and complete error bodies. It does not claim byte-identical physical IDs,
timestamps or storage serialization. The broader persisted-domain/legacy comparison
from P1 remains `evidence/p1-runtime.md`; schema discovery is intermediate source
behavior, introduced after the released artifact, and is tested separately.

The released probe confirms two intentionally different existing negotiation paths:
success responses fall back to v1 on conflicting header/query versions, while
contract-validation failures prefer a nonempty header. SR-030 preserves the latter
explicitly instead of normalizing it away. Missing definitions really return 500
with the same generic errors/meta envelope in both released versions. This is
retained, not inferred from the broken Bruno labels. Repository/authentication
failures are deliberately sanitized rather than exposing legacy exception text.
The SR-027 authentication/grant security changes remain explicit above.

### Standalone failure and lifetime coverage

`PilotFailuresMongo.test.ts` runs real HTTP over actual Prisma identity, branding,
reference and native session repositories. It covers unauthenticated/invalid bearer,
wrong brand/portal/role, spoofed query authority, malformed/missing/repeated/object
names, current grants/memberships/disabled state, real session identity and explicit
invalid bearer with a valid cookie. Same-named cross-brand definitions stay isolated
and persisted definition changes are read immediately. Denials precede domain
reads; auth/brand/grant/record repository failures produce sanitized 500s with
versioned envelopes. Route policy order and action/global overrides are exercised,
and unbound policies/unsupported dispatch targets fail during composition.

Final-adapter cases repeat stop deadlines during late repository work and delayed
or failed session saves after client abort. Pools/Prisma clients remain owned until
work settles, retry closes them, and only successful saves persist. Ordinary GET
responses do not mutate tenant authority into the session. Session readiness cases
refuse a missing TTL index without creating a collection and preserve conflicting
TTL definitions during ensure. HEAD/OPTIONS/trailing slash behavior, invalid encoded
paths, malformed JSON and oversize bodies are exercised explicitly. Proxy testing
proves spoofed forwarded HTTPS cannot produce a secure cookie without explicit
host proxy trust; secure/HttpOnly/SameSite defaults remain covered by legacy tests.

`CompiledPilotMongo.test.ts` forks the **built** public application/record-type/HTTP
entrypoints, binds a real loopback server, serves both exact authenticated URLs on
Mongo and denies unauthenticated calls. A module-load guard rejects core source,
Sails, legacy controllers, compatibility adapters and the core barrel throughout
startup/requests/stop. No source TypeScript loader is enabled in the child. Imports
install no signal handlers; final native pools and Prisma clients are zero.
This proves the compiled development artifact, not a clean production image or
packed-package institution qualification (P7/P8).

Broader checks found and corrected a real host/application deadline race: an
immediate host retry could join the still-expiring application attempt. The host
now waits for that attempt within the new deadline before retrying. It must not
start cleanup later after the retry itself expires; deterministic regressions cover
both edges. An existing connect-mongo fake lacked its real `collectionP` promise;
wrapping readiness in `Promise.resolve` preserves that existing ownership test
while still awaiting the real store. No existing assertions/timeouts were weakened.

### Commands, counts and source manifest

All final commands use the qualified Node **26.11.1**/npm **11.20.0** PATH described
above. Express **5.2.1**, Passport **0.7.0**, express-session **1.19.0**,
connect-mongo **6.0.0**, Mongo driver **7.7.0**, Prisma ORM **8.0.0-rc.19** and
Prisma CLI **8.0.0-rc.24** are the existing exact package pins. No dependency or
lockfile changes were made; `package.json` only gains the required pilot test script.
The actual disposable standalone server/database are identified in SR-027.

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm run lint
# Focused changed-source formatting check (p4-final-format.log):
./node_modules/.bin/prettier --check packages/redbox-core/src/http/express/{ExpressHost,authentication,identity,index,middleware,policies,recordTypes,responses,session}.ts packages/redbox-core/src/{api-routes/{types,validation,request-extraction,helpers,route-resolution,route-registry},maintenance/indexes,middleware/redboxSession,middleware/requestLifetime,persistence/maintenance,persistence/sessions/indexes}.ts packages/redbox-core/test/http/*.ts packages/redbox-core/test/http/fixtures/compiled-pilot.cjs
npm --prefix packages/redbox-core test -- --no-config --node-option no-experimental-strip-types --require ts-node/register/transpile-only --require chai --require test/setup.ts --timeout 10000 test/http/Middleware.test.ts test/http/ExpressHost.test.ts test/middleware/redboxSession.test.ts test/middleware/requestLifetime.test.ts test/http/Policies.test.ts test/http/Contracts.test.ts
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http npm --prefix packages/redbox-core run test:http-pilot:mongo
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34903/redbox_prisma_p4 npm run test:core
```

Final **clean build** includes Prisma generation, TypeScript emission and copied
Prisma contract inputs: **exit 0** (`p4-final-build.log`). The existing Prisma skill
sync advisory is a warning, not a missing generated artifact. Strict application
source/tests typecheck **exit 0**. Lint **896 files, zero errors/warnings**; changed
source formatting and `git diff --check` **exit 0**. Focused HTTP/contracts/policy/
session/lifetime/host regression **67 passing, zero failures/pending**
(`p4-final-unit.log`). Real-Mongo/HTTP pilot **24 passing in 19s, zero failures/
pending** (`p4-final-pilot.log`); its environment is mandatory, with no skip branch.
The compiled child uses the same Mongo server with isolated fixture databases.

Earlier combined pilot result: **18 passing / 4 failing**. Two failures revealed
the real deadline race fixed above. A raw-GET test erroneously used `http.get`
(which already ends a request) before sending its body; changed to `http.request`.
The compiled fixture omitted BrandingRepository's required `redboxStorage`
datastore, so it waited on an unintended default address; fixed to explicitly bind
both fixture datastores, and bounded startup/request diagnostics ensure a failure
cannot leave a child indefinitely running. Temporary stage diagnostics were removed.
An initial fixture process was terminated (143) after the missing bound exposed a
hung child. Final same cases pass without increased production/test deadlines.

First broad core run: **4401 passing / 68 pending / 2 failing**. One exposed the
existing store fake readiness issue corrected above. The unchanged 12-second
startup-module subprocess test also timed out during overlapping compilation/
other suites; isolated startup plus ownership/host regression passed **22/22**
(startup 10.6s), with its timeout/assertions unchanged. Final broad result follows.

Source manifest:

| Slice | Commit |
| --- | --- |
| SR-026 contracts | `77171234936d763927d5fe6ceae5140c5bfd6111` |
| SR-027 actor/policies | `ffe878b1dacdd2baa94e8118913a0ffe5ee9c184` |
| SR-028 middleware/session lifetime | `6591c77123d7d1844c6ecddab3f033b3db867126` |
| SR-029 record-type adapters | `0a5c3369a94ee565733b354efbc491b3c2144ebf` |
| SR-030 deadline/fixture compatibility correction | `4cc297b2339db5143b0e7effbec2b3d616eb1200` |

The SR-030 parity commit contains the final version-validation compatibility
correction, test fixtures and results documented here; its SHA is in the final
closeout below. Checks ran against those exact source/test contents before commit.
No source, assertions or package pins change after the final checks.


Final Mongo-backed full `npm run test:core`: **4406 passing / 68 pending / zero
failures**, exit **0**, approximately **2 minutes** (`p4-core-final.log`). Pending
counts are unchanged from P3: Figshare durable-worker/provider cases **51**,
SIEM receiver/delivery **7**, isolated standalone driver foundation **3**, explicit
Raid **2**, Trigger **2**, Workspace **3**. Those optional provider/foundation
fixtures remain unqualified by this core invocation; none is relabelled as pilot
coverage. The required new real-Mongo/HTTP suite separately ran all **24** cases
without skips. Expected negative-fixture logs (for example a deliberately missing
inline vocabulary) occur beside passing assertions; they are not hidden failures.

All SR-026–SR-030 acceptance criteria for this partial authenticated HTTP pilot are
met. No P5/P6 work or production entrypoint promotion was started. There are no
new P4 decisions blocked on the orchestrator. Existing SR-005 institution/topology
qualification and broader P5–P8 coverage remain outside this result. Browser/provider
flows, production session invalidation/CSRF, missing groups and returned-but-unmounted
schema resolver URLs remain explicitly outside the pilot, as described above.

Cleanup: the final fixture databases were dropped by teardown. Two prefixed fixture
databases from terminated early diagnostic processes remained on the owned disposable
server; `docker rm -f -v sr-p4-mongo8` discarded that entire test-only container and
its anonymous data volume. Released comparison containers/volumes and network were
already removed with the commands above. No unrelated Docker resources or the
untracked `support/specs/graphql-record-metadata/` directory were changed. No pushes.
