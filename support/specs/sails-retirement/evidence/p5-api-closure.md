# SR-037 — route and dependency closure audit

## Status and implementation sources

**Partial. SR-037 remains unchecked.** The API manifest is accounted for, but it
is not complete standalone coverage. SR-035 and SR-036 remain partial. There are
no intentional removals hiding unfinished API entries and no per-request Sails
fallback. Unconverted registrations must remain for their comparison consumers.
SR-040 onward was not started.

This round starts at `fca67fe15`. Shared create/workflow authorization is
`87fd597f8`; its lazy comparison binding correction is `183d75d8f`.
Owned identity/role/RVA operations are `92d013c4d`, the attachment import-boundary
correction is `86b6af990`, and the protected HTTP slices/tests are `7f49cbe79`.
[Record mutations](p5-record-mutations.md) and
[identity/integration mutations](p5-identity-integration.md) record the operation
boundaries, exact implemented slices, policy behavior and partial-effect limits.
All changes are in the shared `stack/sails-retirement` checkout; nothing is pushed.

## Exact route inventory

After the clean core build, on Node **26.11.1**:

```sh
node support/specs/sails-retirement/evidence/route-inventory.cjs
node support/specs/sails-retirement/evidence/route-inventory.cjs --check
```

Both exit **0**. The generated [JSON](route-inventory.json) retains every exact
method/URL, controller action, migration owner, prerequisites and standalone flag.
The source SHA identifies the generation base; working-tree declarations are
checked against the built code. The manifest never dispatches requests.

| Task | Standalone declarations | Total declarations |
| --- | ---: | ---: |
| SR-029 | 2 | 2 |
| SR-032 | 63 | 63 |
| SR-033 | 25 | 25 |
| SR-034 | 21 | 21 |
| SR-035 | 0 | 23 |
| SR-036 | 32 | 116 |
| SR-038 | 9 | 9 |
| SR-039 | 1 | 1 |
| SR-040 | 0 | 52 |
| SR-041 | 0 | 13 |
| SR-042 | 0 | 2 |
| SR-043 | 0 | 6 |
| **Total** | **153** | **333** |

The 32 new declarations are the **19 identity**, **9 query-definition** and
**4 RVA** declarations exported by their adapters, including browser aliases.
The inventory now assigns the roles/users/harvest-run/vocabulary manager page
declarations to SR-040 and all four multipart logo/favicon aliases to SR-041.
Those are classifications, not implementations. `ALL` still denotes a legacy
any-method declaration. Authentication additions are separately listed in the
JSON. Institution extensions remain subject to SR-005 designation.

## Open API work and actual dependencies

The **23 SR-035 declarations** require the single owned record save pipeline:
stored concurrency policy and preconditions, schema grants, revisions/incarnations,
audit/index effects, compensation and selected hooks. SR-043 progress and affected
SR-041/042 upload providers are explicit prerequisites. No mutation URL is mounted
by the authorization-only extraction. Account linking also needs this writer for
record ACL rewrites; missing composition fails before link or membership effects.

The **84 remaining SR-036 declarations** are grouped below. Exact URLs remain in
the JSON; counts are declarations, including aliases, rather than distinct domain
operations.

| Legacy controller | Open declarations | Remaining operation/provider work |
| --- | ---: | --- |
| ActionController | 1 | Resolve configured named action declarations and their concrete domain effects; no dynamic `eval` substitute. |
| AdminController | 5 | User lists/audit/links/candidates and linking; linking needs SR-035. |
| BrandingAppController | 11 | Draft/publication/history/typeface workflows and their real asset collaborators. |
| BrandingController | 1 | Preview issuance and its real rendering/artifact consumers. |
| EmailController | 1 | Owned notification/template/transport and named post-send hooks. |
| FormVocabularyController | 7 | Tenant-scoped vocabulary/query reads and selected external/service providers. |
| UserController | 1 | Tenant-scoped user lookup/disclosure. |
| VocabularyController | 5 | Browser vocabulary CRUD/list/get. |
| webservice/AdminController | 4 | Masked config read/write and cache refresh. Legacy GET refresh is an unsafe mutation needing explicit method/CSRF migration. |
| webservice/BrandingController | 12 | API draft/publication/history/typeface workflows and asset collaborators. |
| webservice/FigshareCrosswalkController | 9 | Crosswalk CRUD/mapping/approval/usage ownership and tenant checks. |
| webservice/FigshareVocabularyController | 10 | Source/catalogue/preview/clone/apply/sync flows and actual generated-client provider fixtures. |
| webservice/SearchController | 2 | Index-all/remove-all operations, accepted-work ownership and Solr effects. |
| webservice/SiemController | 2 | Configuration/test-destination writes, masked credential targeting and owned delivery adapters. |
| webservice/UserManagementController | 7 | API user reads/audit/link disclosure and linking. |
| webservice/VocabularyController | 6 | API vocabulary CRUD/list/get/reorder. |

Remaining identity reads, vocabulary CRUD, admin configuration, Figshare, SIEM,
notifications and indexing include **independently implementable work**. They are
not all blocked by SR-035 or reassigned to P6 to claim closure. Branding's native
font/theme delivery and preview consumers intersect SR-040; multipart inputs
belong to SR-041. No missing provider is represented by a no-op. Ordinary provider
construction starts no requests; failed administration preparation closes its
resources before admission and makes no upstream request in the executed test.

## Standalone import and override closure correction

The combined HTTP suite exposed a previously hidden import: storage persistence
used `PrismaAttachmentRepository`, which extended `CoreService`. The existing
repository algorithm now lives once in `persistence/storage/PrismaAttachments.ts`
with explicit audit/logger inputs. The runtime imports that owned implementation.
The old direct constructor is a comparison wrapper; `compat/sails/attachmentAudits`
supplies the optional SIEM callback and legacy HTTP-follow-up retention. Bootstrap
passes that binding explicitly. This does not add multipart/upload behavior.

The required attachment audit still persists before optional SIEM emission.
Optional emission failures retain their bounded diagnostic, and HTTP requests
retain that follow-up through shutdown without delaying their response. The
existing attachment-journal, audit-drain and harvest tests pass **59/59**, no
pending/failures (`p5-round-correction-regression2.log`). An initial split caught
the optional rejection after its retained lifetime, losing the bounded diagnostic;
the unchanged audit-drain test caught it. The correction handles rejection before
retention and the rerun passes.

The compiled import guard now rejects `CoreBase` and `CoreService` as well as
Sails, compatibility code, controllers, source imports and the core barrel. It
loads the new identity/vocabulary entrypoints and create-authorization projection.
The combined source guard also rejects those roots. A selected Users hook whose
replaced core factory throws demonstrates resolution before construction. Original
browser action names retain effective policy overrides; alias normalization is
used only for dispatch. Other API groups' named override and Express 5 matching,
HEAD/OPTIONS, parser/root-context/proxy checks remain in their preserved suites.
This is representative override coverage, not proof for unfinished groups.

## Actual environment and regression diagnostics

Host **agentvm**, Linux x86_64, Node **26.11.1**, npm **11.20.0**, TypeScript
**5.9.3**, ts-node **10.9.2**, Mocha **11.7.6**, Express **5.2.1**, csrf-sync
**4.2.1**, Mongo driver **7.7.0**, Prisma ORM **8.0.0-rc.19** / CLI
**8.0.0-rc.24**, Bruno **3.5.2**. No dependency version or lockfile changed.

Actual Docker Mongo **8.0.34**, FCV **8.0**, image
`sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`,
`sr-p5-mongo8` on `127.0.0.1:34903`. Solr **10.0.0**, `sr-p5-solr` on
`127.0.0.1:34904`, image
`sha256:c2a983cd9a5759c3b802b7b47f48b5cfae2b34d63a9444d62730fdbdb1b5308b`,
and Keycloak **26.5.6**, `sr-p6-auth-keycloak-1` on `127.0.0.1:18080`, image
`sha256:8d44614c74798322c4e07fbe0ecb15cfbb5879d69b484628555f58ade06f0d8c`,
are actual local providers. Versions were checked with `solr version` and
`/opt/keycloak/bin/kc.sh --version` inside their containers. Databases are disposable fixture
databases; there is no institution, replica-set or production upgrade proof.

Two combined attempts lost Mongo during creation of another fixture database.
The server exited **139**, `OOMKilled=false`. The diagnostic log contains
`TooManyFilesOpen`, failure to open `/proc/1/stat`, failure to create `eventfd`,
and then a fatal segmentation fault. Restarting retained the low process limit
and the problem repeated. The disposable container/volumes were recreated using
the same image with an explicit descriptor limit:

```sh
docker rm -v sr-p5-mongo8
docker run -d --name sr-p5-mongo8 --memory=768m \
  --ulimit nofile=64000:64000 -p 127.0.0.1:34903:27017 \
  mongo:8.0.34 --bind_ip_all --wiredTigerCacheSizeGB 0.25
docker exec sr-p5-mongo8 mongosh --quiet --eval \
  'print(JSON.stringify({version:db.version(),fcv:db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion}))'
```

Version/FCV and both soft/hard descriptor limits were verified. The interrupted
runs (`p5-round-integrated-http3.log`, `http4.log`) are not passing evidence. The
first isolated provider retry ran against the stopped database and correctly
failed its setup with `ECONNREFUSED`; the subsequent real retry passed both
provider-abort and failed-initialization cases (**2/2**, no pending/failures).
This environment correction is recorded rather than weakening test assertions.

The first full Mongo-backed core run was **4406 passing / 68 existing pending /
2 failing**. Harvest's ACL-only comparison binding was corrected in `183d75d8f`.
The offline startup child exceeded its unchanged 12-second limit during concurrent
CPU-heavy diagnostics. It passes alone in **10 seconds**; no timeout was raised.
Clean builds and final suites run sequentially to avoid both CPU contention and
removal of `dist` while a test imports it. An earlier overlapping storage clean
build produced a test-loading failure and is not counted as verification.

Build including both actual Prisma generation/copy steps exits **0**
(`p5-round-build4.log`). Strict application source/test typecheck exits **0**
(`p5-round-types9.log`). Root lint reports **991 files, 0 errors/warnings**
(`p5-round-lint4.log`). The requested two `prefer-const` warnings are fixed.
Storage package build/lint pass; storage regression is **266 passing / 38 existing
pending / 0 failures** (`p5-round-storage-tests.log`). Existing record/user/
controller regression is **556 passing**, RVA regression **9 passing**, both
with zero failures/pending. No skipped standalone Mongo case is counted.

## Final integrated HTTP and Bruno execution

Production source/test tree committed in `7f49cbe79`, built before execution.
Use the absolute PATH below when changing directories (the system Node is a
different major). At the repository root:

```sh
export PATH="/home/andrew/src/github/redbox-portal/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm run lint
```

Build and lint results are above. The final strict source/test check including
the failed-initialization fixture exits **0** (`p5-round-types10.log`). In
`packages/redbox-core`, using that same qualified PATH:

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
  test/http/IdentityAdministrationMongo.test.ts test/http/BrunoPilotMongo.test.ts
```

**105 passing / 0 failing / 0 pending**, process exit **0**
(`p5-round-integrated-http5.log`). This executes all 15 administration/query/RVA
tests and all four create-authorization tests; actual provider HTTP abort and
failed-preparation cases pass. All **26 Bruno requests / 37 tests** pass, with
zero failures/skips. The preserved suites cover persisted metadata writes,
authentication/session/CSRF, real OIDC, record reads/exports with real Solr,
query/report reads, compiled imports and shutdown ownership. Mongo remains
running after the complete command with the corrected descriptor limit. This
does not extend coverage to the 107 still-unmounted SR-035/036 declarations.

## Final Mongo-backed core regression and closeout

At the repository root with the same absolute qualified Node PATH, after the
HTTP command finished and without overlapping a clean build or diagnostic suite:

```sh
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34903/redbox_prisma_p5 \
  npm run test:core
git diff --check
```

**4408 passing / 68 existing pending / 0 failing**, process exit **0**, in about
two minutes (`p5-round-full-core2.log`), at production source `7f49cbe79`. The
unchanged offline startup child passes within its existing limit; harvest,
identity, attachment journals and audit-follow-up regressions pass. The pending
cases are the existing core-suite pending cases, not acceptance evidence for the
new standalone groups. All 105 explicitly invoked HTTP/Mongo cases executed with
zero pending. The storage suite's separate 38 existing pending cases likewise
establish no new provider proof.

Inventory generation/check and final whitespace check exit **0**. Its source SHA
is `7f49cbe79f0a2939a28f49a939387d4a0025e29f`; this final evidence/manifest commit
changes no production code. Only this round's Mongo/Solr/Keycloak test containers
and their owned disposable volumes are removed at closeout. Unrelated workspace
files and containers are left alone. No provider quota/usage limit occurred.

SR-035, SR-036 and SR-037 remain unchecked. Completing their independent open
operations and supplying the real progress/upload/native providers is further
implementation work, not a release decision that these tests can waive.
