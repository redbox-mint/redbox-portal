# SR-037 — owned API closure and round qualification

## Sources and coverage

Starting source **a7d5ae36a**, shared `stack/sails-retirement` on **agentvm**.
Production/API sources qualified here are **54e20da556968857878d6b294a1651a162beaaa6**:

| Commit | Change |
| --- | --- |
| `9b5942aa6` | Existing record/save/lifecycle, harvest, storage and Solr algorithms extracted once. |
| `4f0cf84ad` | Owned branding, vocabulary, notification, SIEM and Figshare collaborators. |
| `3ce52f834` | Protected record/harvest/link and remaining administration/integration adapters. |
| `1e7045a0f` | Multipart, actor-bound tus, direct progress, native ownership and protocol tests. |
| `54e20da55` | API declaration closure, prebinding failure check and expanded compiled import guard. |

`apiManifest.ts` is an offline assertion surface, never a dispatcher or service
locator. **152/152 registered API contracts** have one explicit owned adapter
contract, with **0 missing/duplicates**. The route inventory has **333** effective
declarations, **282** implemented standalone, including browser/provider aliases:

| Task | Standalone | Total |
| --- | ---: | ---: |
| SR-029 | 2 | 2 |
| SR-032 | 63 | 63 |
| SR-033 | 25 | 25 |
| SR-034 | 21 | 21 |
| SR-035 | 23 | 23 |
| SR-036 | 117 | 117 |
| SR-038 | 9 | 9 |
| SR-039 | 1 | 1 |
| SR-040 | 0 | 51 |
| SR-041 | 13 | 13 |
| SR-042 | 2 | 2 |
| SR-043 | 6 | 6 |
| **Total** | **282** | **333** |

The single-record index API was previously assigned to SR-040 because its action
was named `index`; it is implemented in `integrationOperations` and corrected to
SR-036. All former 84 open independent administration declarations and linking
are implemented. The 51 remaining declarations are pages/static consumers in
SR-040, not API entries relabelled to hide unfinished work. Institution routes
remain subject to SR-005. No absent API entry is silently removed or retried through
Sails. SR-042's two standalone flags describe protected **tus callback aliases**;
they do not claim an owned Companion app or accepted remote-source transfers.
Likewise SR-043's six flags are progress endpoints, not proof of Companion coexistence.

## Dependencies, overrides and import closure

The route-group checklist is followed in the per-group records:
[records](p5-record-mutations.md), [identity/integration](p5-identity-integration.md),
[uploads](p6-uploads.md) and [realtime](p6-realtime.md). New adapters bind every
effective policy in a group before their first mount. The offline failure test
proves an unbound branding action policy leaves an empty router and executes no
domain/audit operation. Selected Users, configured lookup/action operations and
original alias policy overrides run in the real HTTP suites. Original schema,
validation, concurrency and projection modules are reused rather than reimplemented.

The compiled guard now imports all extracted record/storage/branding/vocabulary/
integration/progress modules, plus tus storage, and rejects Sails, CoreBase,
CoreService, compatibility code, controllers, source imports and the core barrel.
The actual standalone source guards also pass. Comparison service modules are
thin delegates with instances on their owning application; their obsolete
process-cache entries are bypassed. Remaining legacy controller/routes exist for
the explicitly separate comparison host and page consumers, not as HTTP fallback.
Deleting their last consumers belongs to final legacy-host retirement.

Existing HTTP suites retain Express 5 static-before-parameter precedence,
slash/wildcard decoding, HEAD/OPTIONS, v1/v2 errors, root/proxy behavior and parser
exclusions. New unsafe GET refresh has explicit CSRF and a side-effect-free HEAD
405. Tus raw methods bypass JSON parsing, use root-relative locations and do not
trust a forged callback header/forwarded authority. Direct progress uses a distinct
path and current session/record authorization. Full remote Companion coattachment
is the explicit upstream gate in SR-042/SR-043; it is not a hidden API save dependency.

## Exact environment

Host **agentvm**, Linux x86_64. Node **26.11.1**, npm **11.20.0**, TypeScript
**5.9.3**, ts-node **10.9.2**, Mocha **11.7.6**, Express **5.2.1**, csrf-sync
**4.2.1**, Mongo driver **7.7.0**, Prisma ORM **8.0.0-rc.19** / CLI
**8.0.0-rc.24**, Bruno CLI **3.5.2**. Exact new package pins and consumer resolution
are recorded in p6-uploads; no pre-existing resolved version was upgraded.

Actual Docker providers:

- Mongo **8.0.34**, FCV **8.0**, `sr-p5-mongo8`, loopback **34903**,
  `nofile=64000:64000`, memory 768 MiB, WiredTiger 0.25 GiB. Image
  `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
- Solr **10.0.0**, `sr-p5-solr-round2`, loopback **34904**, heap 256 MiB.
  Image `sha256:c2a983cd9a5759c3b802b7b47f48b5cfae2b34d63a9444d62730fdbdb1b5308b`.
- Keycloak **26.5.6**, `sr-p6-auth-keycloak-1`, loopback **18080**,
  image `sha256:8d44614c74798322c4e07fbe0ecb15cfbb5879d69b484628555f58ade06f0d8c`.

Versions/FCV were checked inside those containers. Mongo databases are disposable
per-fixture databases and are dropped only after host/application drain. Actual
HTTP/SIEM/Figshare/vocabulary and SMTP fixtures listen locally; there is no claim
of institution, replica-set, production-provider or release-upgrade qualification.
The raised Mongo descriptor limit is retained from the earlier round's confirmed
TooManyFilesOpen crash correction; those interrupted runs are not passing evidence.

## Commands and results

At repository root, use this PATH even when changing directories:

```sh
export PATH="/home/andrew/src/github/redbox-portal/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm run lint
node support/specs/sails-retirement/evidence/route-inventory.cjs
node support/specs/sails-retirement/evidence/route-inventory.cjs --check
git diff --check
```

Clean build including actual Prisma contract generation/copy: **exit 0**
(`round-build7.log`). Strict application source/test typecheck: **exit 0**
(`round-types9.log`). Repository lint: **1045 files, 0 errors/warnings**, exit 0
(`round-lint4.log`). Inventory generation/check and whitespace checks exit 0.
The previous round's two prefer-const fixes remain accepted and clean.

In `packages/redbox-core`, with that same PATH:

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
  test/http/CompiledPilotMongo.test.ts \
  test/http/RecordCreateAuthorizationMongo.test.ts \
  test/http/IdentityAdministrationMongo.test.ts test/http/BrunoPilotMongo.test.ts \
  test/http/RecordMutationsMongo.test.ts \
  test/http/IntegrationAdministrationMongo.test.ts \
  test/http/ResumableUploadsMongo.test.ts test/http/ProgressSocketsMongo.test.ts \
  test/http/StreamingMultipart.test.ts test/http/ApiGroupClosure.test.ts
```

**146 passing / 0 failing/pending**, actual process exit **0**
(`round-integrated-http7.log`), about two minutes of test execution. All **34 Bruno
requests / 53 assertions** pass, zero skips/failures, including 8 original permission
mutation requests. Parser backpressure was added after that command loaded its
six parser cases and was run separately: **7/7 passing**, exit 0
(`multipart-final1.log`); the aggregate is not inflated. The final full core also
includes that seventh parser case. Companion's **1/1 diagnostic** proves a missing
upstream lifetime API, not acceptance. All new Mongo/HTTP cases actually execute.
Standalone Mongo suites remain separate from the legacy global test setup in
.mocharc; their explicit inclusion above is required and no ignored case is counted.

Agenda **6.2.6** leaves a referenced completed-job watchdog until approximately
half its default 10-minute lock lifetime. The integrated process exited naturally
after that timer; no `--exit`, timer monkeypatch or artificial lock-lifetime change
was used to hide it. Hosts, application resources and borrowed pools had already
closed. This upstream idle timer delay is distinct from an accepted job/transfer
still running and is not Companion's missing owner.

## Intermediate failures and corrections

The first broad core attempt produced **4412 passing / 68 existing pending /
7 failing**. Corrections: remove an invalid exported `super` method; invoke new
standalone suites separately from legacy globals; restore the retained security
follow-up diagnostic. The unchanged 12-second offline startup subprocess also
timed out. The focused compatibility rerun passed **139/139**.

An early write test expected explicit stale tags to be accepted under last-write-
wins; the existing policy correctly rejects them. The test was corrected, followed
by the real writer rerun. A strict typecheck caught a nonexistent datastream
response field; it was removed. No production precondition behavior was weakened.

`round-integrated-http6.log` had **142 passing / 3 failing**. An older read fixture
added single-valued workflow_stage after writer tests had indexed it via the
configured multivalued wildcard. Lucene correctly refused that doc-values type
change. `seedReadSearch` now uses configured field definitions and the matching
multivalued wildcard shape. Only the disposable Solr container/volume was
recreated (same exact image); the corrected complete HTTP run above passes all
146 cases. One recreation command raced an unfinished container removal and
returned a name conflict; the fresh owned `sr-p5-solr-round2` started successfully.

The next full core run was **4416 passing / 68 existing pending / 1 failing**
(`round-full-core2.log`): only the same offline source-import timing assertion.
A standalone diagnostic measured core source import at **9.86 s**, first actual
JSDOM sanitization at **10.60 s** (`startup-timing2.log`), with no eager DOM,
Prisma implementation or full Effect-barrel load. The test's 12-second subprocess
limit and 15-second Mocha limit remain unchanged. The final sequential full-core
result is recorded below rather than treating a focused pass as a complete run.

The released-v5 evidence remains representative, not a broad mutation replay.
Original service/controller regressions and current intermediate-source writes
supply the additional write comparisons. Existing pending tests establish no
new standalone/provider acceptance. No provider quota/usage limit occurred.

## Final full Mongo core and task closeout

At repository root with the qualified PATH above, after build/type/lint and active
HTTP execution had finished (only Agenda's idle watchdog remained):

```sh
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34903/redbox_prisma_p5 \
  npm run test:core
git diff --check
```

**4417 passing / 68 existing pending / 0 failing**, actual process exit **0**,
about two minutes (`round-full-core3.log`). The unchanged startup subprocess test
passes in **11.875 s**; its tight 12-second threshold remains sensitive to host
load, as the preceding failure documents. No timeout, assertion, lock lifetime
or environment skip was weakened. The 68 pending cases are existing suite cases;
all explicitly invoked new standalone Mongo/provider cases ran without pending.
The standalone suites cannot share the legacy global setup and were executed
separately by the complete HTTP command, not silently skipped for acceptance.

SR-035, SR-036, SR-037 and SR-041 meet their scoped acceptance and are ticked.
The concrete direct-progress and local multipart/tus dependencies of API saves
are verified. SR-042 remains unchecked for remote Companion transfer ownership;
SR-043 remains unchecked for its explicit joint Companion socket acceptance.
Their public API deficiency is external to the owned implementations; a supported
upstream lifecycle artifact or maintained fork is the remaining decision.
SR-040 and SR-044 onward are not started. The tasks header reflects this state.
The requested wiki redbox-core.md is absent in the checkout; the other requested
architecture/service/API/form/test/standards pages and all supplied specs were read.
No push was made. Unrelated GraphQL specification files are untouched.

The disposable test resources were then removed successfully:

```sh
docker rm -fv sr-p5-mongo8 sr-p5-solr-round2
docker compose -p sr-p6-auth \
  -f support/integration-testing/docker-compose.bruno.oidc.yml \
  -f .tmp/sails-retirement/keycloak-ports.yml down --volumes
```

Both commands exit **0**. Only the round's containers, their disposable volumes
and the owned OIDC network were removed; unrelated workspace resources were left
alone. Summarized logs remain in `.tmp/sails-retirement/` for local inspection.
