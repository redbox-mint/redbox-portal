# SR-035 — shared create/workflow authorization; mutation pipeline pending

## Status and source

**Partial. SR-035 remains unchecked.** Implementation starts at `fca67fe15`
(`stack/sails-retirement`, shared checkout). No record mutation URL is advertised
as standalone by this slice. The exact 23 declarations remain in the route
inventory. Final integrated execution is recorded in [API closure](p5-api-closure.md).

## Extracted operation

`records/RecordCreateAuthorization.ts` owns the existing create ACL projection,
stored starting/target workflow lookup and target diagnostics. The comparison
`services/RecordsService.ts` delegates to it, retaining its overridable edit and
transition checks. No second authorization algorithm, controller dispatcher,
Sails global or socket client is imported by the owned module. The two historical
RDMP hook names are configuration string comparisons, never evaluated code.

Actual Mongo tests read the stored record type and workflow definitions, require
both edit and target transition roles, reject unknown/malformed/foreign targets,
and prove submitted actor authorization cannot grant create access. This is
shared authorization extraction, not proof of a successful HTTP mutation.

## Outstanding acceptance and concrete dependencies

The existing `RecordsService` still owns the save orchestration: stored concurrency
policy/If-Match checks, metadata/schema validation and grants, revisions and
incarnations, hook effects and compensation, index/audit effects, attachments and
progress. Moving only controller methods would hide these dependencies. Remaining
work is to extract that orchestration once, bind selected hook operations without
`eval`/globals, and supply the actual providers. Create/update/delete/restore,
permission changes, harvest and transitions therefore remain unmounted.

- **SR-043** is an explicit task prerequisite: replace `AsynchsService`/Sails socket
  progress with the owned authorized progress integration. This round is explicitly
  prohibited from starting SR-040 onward.
- **SR-041/042** own affected attachment, staging, multipart/tus/Companion providers.
  A no-op attachment collaborator would not establish compensation or partial effects.
- Remaining SR-035 work must exercise real success/denied/stale writes, stored
  concurrency modes, ETag/preconditions, schema grants, audit and partial failures
  on the complete owned pipeline. This extraction does not satisfy those cases.

SR-036 account linking needs this writer for record ACL rewrites. Its extracted
identity module rejects missing writer composition before creating links,
changing memberships or disabling an alias; its HTTP linking routes stay absent.

## Actual execution

Host: local standalone Express test fixtures and real Docker MongoDB **8.0.34**,
FCV **8.0**, container `sr-p5-mongo8`, loopback `127.0.0.1:34903`, image
`sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
Fixtures use disposable `sr_p4_http_<pid>_<counter>` databases and drop only their
own data after draining the application. No institution/topology qualification
is implied. Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**, Mocha
**11.7.6**, ts-node **10.9.2**, Express **5.2.1**, Prisma ORM **8.0.0-rc.19** /
CLI **8.0.0-rc.24**, Mongo driver **7.7.0**. No dependency or lockfile change.

At the repository root:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm run lint
```

Core build (including both actual Prisma contract generation/copy steps) and
strict application source/test typecheck exit **0**. Repository lint: **986 files,
0 errors, 0 warnings** at this extraction point (`p5-round-lint2.log`).
The two requested `prefer-const` warnings are fixed: the integration-audit
comparison constructor defers its `const instance` reference in getters; CSV
cancellation closes over the lazily initialized `const output` stream. Storage
build and lint passed, with zero lint errors/warnings.

In `packages/redbox-core`, using the same absolute qualified Node PATH:

```sh
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http \
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --timeout 45000 test/http/RecordCreateAuthorizationMongo.test.ts

TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 10000 \
  test/services/RecordsService.test.ts test/services/UsersService.test.ts \
  test/controllers/UserController.test.ts test/controllers/RecordController.test.ts \
  test/controllers/webservice/UserManagementController.test.ts
```

Create authorization **4 passing, 0 failing/pending** (also executed with the
identity HTTP suite). Existing service/controller regression **556 passing,
0 failing/pending**, exit **0** (`p5-round-regression2.log`). Initial diagnostics
found two fixture brand roles missing and one TypeScript callback-arity mismatch;
these were corrected, followed by actual reruns. Identity extraction diagnostics
and final closeout are recorded separately; no skipped test is counted here.

Full regression exposed an eager comparison lookup in `createAuthorization()`:
harvest's ACL-only projection does not need record-type/workflow services. Those
bindings are now lazy getters, preserving existing harvest fixture/override
behavior. The unchanged focused harvest suite passes **26/26**; combined audit,
attachment-journal and harvest regression passes **59/59**, no pending/failures
(`p5-round-correction-regression2.log`). Final full-core results are in API closure.
