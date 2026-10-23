# SR-034 — record reads, schemas and exports

Verified 2026-10-24 on `agentvm`, Linux 6.8.0-147-generic x86_64, shared
`stack/sails-retirement` checkout. Parent `e671ec1537bb665e575b0d30662ebf74be6269d2`;
shared operation extraction `ae794b01289984f79c40a6bb4616ae5f219abe64`.
The HTTP/evidence commit is the commit introducing this file. No dependencies
were added or upgraded, no branch/worktree was created, and nothing was pushed.

## Implemented contracts

`recordReadRoutes` contains all **21/21** SR-034 declarations: seven API record
reads, eight browser record/list/default/search/relationship reads, API and browser
exports, three schema URLs and the legacy workspace redirect. Literal list and
schema resolver URLs precede identifier routes. This remains partial application
composition; production promotion and page rendering are later tasks.

The existing list representations, form projection/default visitors, deleted
record lifecycle projection, relationship parsing/filtering and schema delivery
mappings moved once to `RecordLists`, `FormProjection`, `DeletedRecordReader`,
`relationships` and `schemaDelivery`. Comparison controllers/services delegate;
projection methods retain the comparison receiver so existing hook overrides and
stubs of nested methods still apply. The comparison API's older relationship
filter mode remains explicit; standalone uses the browser's brand/ACL/both-endpoint
checks. Storage traversal, paging, ACL filtering, artifacts/grants and export
formatting use the existing guarded Mongo storage extension.

Headers/envelopes retain browser versus API representations, v2 revision/lifecycle
metadata, record ETags, CSV BOM/content disposition, schema media types, canonical
and describedby links, Problem Details and authorized conditional 304 responses.
Immutable schemas reauthorize persisted grants against current roles/edit ACLs
before evaluating If-None-Match. Schema authentication/brand denials also retain
Problem Details rather than generic policy errors.

Every object root is checked for its stored brand and view ACL before metadata,
permissions, history or traversal. Exports and lists pass only brand-qualified
role memberships to storage. List filters now remain independent AND predicates:
a supplied `metaMetadata.brandId` filter cannot replace the mandatory brand.
Malformed structured/scalar fields, dates, paging and depths are rejected. The
filterFields typo correction and authorization changes/affected clients are
recorded deliberately in design section 1.3. Accepted SR-031 checkAuth behavior and
application-owned atomic PathRules refresh are unchanged.

## Export lifetime correction

New real-HTTP tests initially reproduced **three failures**: CSV and JSON aborts
released storage admission while a real Mongo page result was held unresolved;
JSON page errors escaped as an unhandled stream error. CSV's first pass previously
ran in a detached async closure, and JSON used a one-way pipe.

The provider now returns a Readable owning CSV column discovery and composes its
stream stages in both formats. Destruction propagates upstream, already admitted
page work remains owned until settlement, and cancelled exports stop paging.
The same three cases now pass: stop remains pending until the real page barrier
is released, one page is read, and a failing page terminates the response safely
without an uncaught error. A subsequent export succeeds. The barrier decorates
the actual provider page operation after real Mongo IO; it is not alternate
storage. JSON header recordType values are escaped using JSON.stringify.

## Executed environment and commands

Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**, Mocha **11.7.6**,
ts-node **10.9.2**, Express **5.2.1**, Bruno **3.5.2**, Mongo driver **7.7.0**,
Prisma ORM **8.0.0-rc.19** / CLI **8.0.0-rc.24**. Qualified toolchain:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
```

Actual Mongo: owned `sr-p5-mongo8`, **8.0.34**, FCV **8.0**, localhost:34903,
image `mongo@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
Solr: owned `sr-p5-solr`, **10.0.0**, localhost:34904,
image `sha256:c2a983cd9a5759c3b802b7b47f48b5cfae2b34d63a9444d62730fdbdb1b5308b`.
The HTTP fixture requires its environment, uses unique databases and drops them;
there are no missing-environment skip paths.

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/sails-hook-redbox-storage-mongo run build
npm --prefix packages/redbox-core run typecheck:application
npm --prefix packages/redbox-core run lint
npm --prefix packages/sails-hook-redbox-storage-mongo run lint
npm run test:storage-mongo
node support/specs/sails-retirement/evidence/route-inventory.cjs
node support/specs/sails-retirement/evidence/route-inventory.cjs --check
```

Builds, application source/tests typecheck and inventory pass. The complete core
build regenerates/copies both Prisma contracts. Core lint has zero errors and one
existing deferred-reference prefer-const warning in the comparison integration
audit constructor. Storage lint has zero errors and one deferred-reference
prefer-const warning for the CSV stream's cancellation closure.
Storage comparison suite: **266 passing, 38 existing pending, zero failures**;
the pending conditional-mutation/provider cases do not count as read acceptance.
The two existing query-shape assertions now check the independent filter predicate
and retain the mandatory-brand assertion.

In `packages/redbox-core`, with the qualified toolchain:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/services/FormRecordConsistencyService.test.ts \
  test/controllers/RecordController.test.ts \
  test/controllers/webservice/RecordController.test.ts \
  test/controllers/webservice/RecordSchemaController.test.ts

HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http \
HTTP_READ_SOLR_PORT=34904 TS_NODE_PROJECT=test/tsconfig.json \
  node --no-experimental-strip-types -r ts-node/register/transpile-only \
  node_modules/mocha/bin/mocha.js --no-config --timeout 45000 \
  test/http/RecordReadsMongo.test.ts test/http/QueryReadsMongo.test.ts \
  test/http/CompiledPilotMongo.test.ts
```

Comparison regressions: **250 passing, zero failing/pending**. Final combined
HTTP run: **38 passing, zero failing/pending** (22 record/schema/export, 15 query,
one compiled-host). The actual Bruno record collection runs **2/2 requests,
2/2 tests**; the query collection also runs **2/2 requests, 2/2 tests**.
The compiled guard imports the new graph plus the actual storage extension without
source, Sails, comparison modules, controllers, the root barrel or signal listeners.

Tests exercise representative API/browser/deleted/default/projected records,
role-only ACLs and their revocation, missing/anonymous/private/foreign objects,
browser Solr OR-injection scope, inbound relationship edge filtering, persisted
schema grants and conditional reauthorization, malformed queries/headers, scoped
JSON and BOM CSV, backend failure/recovery and transport-abort/shutdown drain.
Offline inventory is **333 declarations, 121 standalone, 212 remaining**;
all SR-034 entries are marked standalone. Other groups keep their owners.

Logs under ignored `.tmp/sails-retirement/`: `p5-record-build-final2.log`,
`p5-record-storage-build-final.log`, `p5-record-types-final.log`,
`p5-record-lint-final2.log`, `p5-record-storage-{tests2,lint}.log`,
`p5-record-regression-final.log`, `p5-record-http-final3.log` and
`p5-record-lifetime-{before,after}.log`. Logs are summarized here rather than
committed in bulk.

## Failures and qualification limits

Initial extraction needed comparison receiver delegation to retain nested hook
method overrides (final 250 regressions pass). Early fixture typing, the initial
record revision expectation (0, not 1), optional state normalization, incomplete
native role-record seeding and path-level versus object-level denial setup were
corrected; the final fixture seeds role records through the real provider and
allows its reader at the path level to exercise the independent domain gates.
An attempted static stream.compose call failed the installed Node declaration
build; the supported instance compose API builds and passes the lifetime tests.

An intermediate combined run had **35 passing / 3 failing**: two fixture issues
above, plus a real MongoDB server crash during the compiled fixture. The owned
Mongo **8.0.34** process exited with **signal 11, Segmentation fault**, diagnostic
`Invalid access at address: 0`, without an OOM/restart. Its full diagnostic log is
`p5-record-mongo-server.log`. Restarted only that owned container with
`docker start sr-p5-mongo8`; the next two complete combined runs passed **38/38**.
No timeout/skip/assertion was relaxed. This server failure remains a runtime-matrix
qualification limitation; it is not described as application success.

SR-035 owns record mutations/workflow saves, SR-041/042 uploads/transfers, and
SR-043 progress sockets. None is implemented or mounted here. Read adapters do
not start indexers, producer jobs, record mutation paths or socket work. The real
Solr fixture covers the configured fuzzy search provider; custom institutional
search/storage providers and deployment proxy/topology matrices remain outside
this slice. General page composition is SR-040. Released-v5 baseline evidence in
`p0-released-v5.md` remains the HTTP comparison reference; current comparison
regressions additionally preserve the integrated revision/schema contracts.

## Integrated auth, CSRF and metadata verification

The integrated core run first finished **4392 passing, 68 pending, 16 failing**
(`p5-final-core.log`). The failures exposed translation/Passport chronicle and
callback regressions plus stale service-boundary/actor/owner fixtures. Correction
`947608e16` restores those contracts, as described in `p5-metadata-write.md` and
`p6-auth-csrf.md`. Its expanded comparison regression is **177 passing, zero
failing/pending** (`p5-final-regression-fixes2.log`). Production compile, Prisma
copy, application typecheck and lint pass (`p5-final-source-{compile,types,lint}.log`).
The startup subprocess retains its original limits and offline-import assertions;
it now supplies the required comparison application owner for later global DOM
use and verifies cleanup. New standalone code does not resolve comparison globals.

After those corrections, in `packages/redbox-core`:

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
  test/http/CompiledPilotMongo.test.ts
```

**85 passing, zero failures/pending**, approximately one minute
(`p5-final-integrated-http.log`). This re-executes all requested groups against
real Mongo, Solr and the existing Keycloak Docker profile. Actual Bruno executions
total **22/22 requests, 29/29 tests**, across metadata reads/writes, OIDC protocol,
CSRF/browser writes, record reads/exports and query/audit collections. No skip
is counted as acceptance. Keycloak/provider versions, signed AAF fixtures and
institution/provider limits remain those in `p6-auth-csrf.md`. No provider quota or
usage limit was encountered.

## Final full-core closeout

Final implementation source **`585aa7300`** (after extraction `ae794b012` and
comparison correction `947608e16`):

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34903/redbox_prisma_p5 \
  npm run test:core
```

**4408 passing / 68 existing pending / zero failing**, exit **0**, approximately
**2 minutes** (`p5-final-core2.log`). This invocation actually runs the Prisma/Mongo
persistence regression contracts against the configured server. Pending groups
are unchanged from P4: Figshare durable worker/provider **51**, SIEM receiver/
delivery **7**, isolated standalone driver foundation **3**, Raid **2**, Trigger
**2**, Workspace **3**. None counts as acceptance of the standalone read/auth/CSRF
routes; their separate integrated HTTP suite ran all **85** cases with no skips.
Previously failing translation, actor, Passport and startup assertions pass in
the complete run. Startup's subprocess completed in **11158ms**, within the
unchanged 12000ms child/15000ms test limits.

Final production emission plus Prisma artifact copy passed (`p5-final-compile.log`).
A compiled JSON-export smoke probe additionally passed **3/3** cases: ordinary,
quoted and legacy omitted record types retain valid JSON and the original string
representation (`p5-export-json-smoke.log`). Focused changed-source formatting
passed (`p5-final-format-check2.log`); its first check requested one line wrap in
the transformer, which was applied. `git diff --check` and regenerated offline
inventory/check passed, with source manifest `585aa7300` and **121/333** standalone
routes. SR-032 **63/63**, SR-033 **25/25**, SR-034 **21/21**, SR-038 **9/9** and
SR-039 **1/1** are complete within the specified slices. The new POST logout is
also recorded separately as a successor declaration in inventory additions.

Owned test resources were cleaned after verification with:

```sh
docker compose -p sr-p6-auth \
  -f support/integration-testing/docker-compose.bruno.oidc.yml \
  -f .tmp/sails-retirement/keycloak-ports.yml down
docker rm -f sr-p5-mongo8 sr-p5-solr
```

No unrelated containers, checkout changes or GraphQL specification files were
removed. Diagnostic logs and the qualified toolchain remain ignored locally.
No SR-035/036/037 or SR-040+ implementation was started. The recorded server crash,
live-federation/institution IdP and custom-provider limits remain release-matrix
work; no new institution designation or approval is required to close these tasks.
