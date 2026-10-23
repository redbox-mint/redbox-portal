# SR-036 — protected identity administration, query definitions and RVA mutations

## Status, source and exact surface

**Partial. SR-036 remains unchecked.** Source starts at `fca67fe15`; the preceding
SR-035 authorization extraction is `87fd597f8`. This slice has **32 exact mounts**:

- **19 identity declarations** from `identityAdministrationRoutes`: API user
  create/update, disable/enable, token generate/revoke, role list/create; browser
  admin disable/enable, token generate/revoke, create/update, role assignment/list;
  self token generate/revoke and profile update.
- **9 query-definition declarations** from `queryWriteRoutes`: named-query
  create/update/delete, API report-config create/update/delete and all three admin
  aliases. They reuse the SR-033 modules/repositories.
- **4 external vocabulary declarations** from `vocabularyIntegrationRoutes`:
  API/admin RVA import and sync. Other vocabulary CRUD and form/provider lookups
  are not included by these mounts.

The reproducible method/URL inventory and remaining coverage are in
[API closure](p5-api-closure.md). These are adapters exported for explicit host
composition; the partial pilot does not magically mount an institution's routes.

## Ownership and security

`identity/Users.ts` and `identity/Roles.ts` contain the existing administration
operations, moved once out of the legacy services. Inputs name the identity
repository, existing authentication accounts, config/brand refresh functions,
logger, optional record-access collaborator and security event binding. Express
objects never enter them. The comparison services subclass the compatibility
compositions; generated exports now resolve per-application instances, rather
than retaining these converted services in the process service cache. Existing
controller membership/role-merge helpers delegate to the shared owned functions,
including when legacy consumers replace `getUserWithId`.

`vocabulary/RvaImport.ts` similarly owns the existing generated-client import/sync
algorithm. Its comparison shim supplies configuration/repository/vocabulary
bindings. Creating it does not contact the provider, run bootstrap imports or
acquire a listener. Each admitted HTTP mutation awaits provider requests,
persistence and user audit. SIEM emission keeps its existing best-effort error
handling and is now joined to the returned audit promise instead of detached work.

Every mounted write resolves effective policies (including `checkAuth`), then the
owned browser CSRF or verified API bearer exemption. It also explicitly requires
an authenticated actor, current-brand membership/Admin role, and the target's
membership/stored brand before mutation. Self routes use the authenticated actor
and reject profile role changes. Browser aliases retain **original controller
action names for policy selection**. IDs, nested parameters and role names are
validated before effects. Current-brand role resolution preserves foreign
memberships. Responses omit passwords and stored token hashes; tokens are only
returned at generation and are hashed by the existing operation.

Named query/report writes retain tenant-qualified keys. RVA sync loads/checks
the vocabulary's stored brand before making a provider call. The selected Users
hook replaces the core factory before construction; a core factory that throws
if constructed proves this in the actual HTTP fixture. An explicit old-name
`AdminController.generateUserKey = false` override proves alias policies remain
effective. The compiled import guard loads all extracted entrypoints without
Sails, controllers, compatibility modules or the core barrel.

## Compatibility, retry and partial effects

Existing successful status/envelope behavior is retained, including API user
update's **201**, browser status messages, role-list summary pagination, API v1/v2
negotiation, no-cache headers and repeated disable/enable. Create with an existing
current-brand username returns that account; a foreign username remains denied.
The existing API create acknowledges a persisted account even if role assignment
fails. Profile changes remain committed if later role assignment fails, returning
500. Audit failure after a mutation also reports failure without undoing the
committed change. Callers must inspect state before retrying; there is no new
transaction/exactly-once claim. A partially created account without brand roles
is not automatically made eligible for a subsequent create retry.

RVA upserts entries before updating vocabulary metadata, as before. Actual HTTP /
Mongo tests force a provider 503 (no entry changes), then metadata failure after
upsert (the entries remain), and a successful retry with the same identifier
(one entry, no duplicate). Local server fixtures exercise the actual generated
HTTP client, not stubbed methods. Production RVA outages, credentials and live
institution providers are not qualified here.

Intentional security/error changes and client migration are in design §1.3:
explicit authentication/brand/Admin gates, preservation of foreign role memberships,
self-role denial, malformed/unknown role rejection and sanitized backend errors.
The intermediate source supplies account-linking/disable/query/report/RVA behavior
not covered by the selected released-v5 capture. The existing released-v5-selected
Bruno token requests are actually replayed; broader parity is not inferred from
those two cases.

## Actual focused execution

Host **agentvm, Linux x86_64**, local standalone Express host, root context
`/portal`, ephemeral loopback listener. Actual Docker Mongo **8.0.34 / FCV 8.0**,
`sr-p5-mongo8`, `127.0.0.1:34903`, image
`sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
Every fixture owns a separate `sr_p4_http_<pid>_<counter>` database, session store
and application lifetime; only its own database is dropped after draining.
Node **26.11.1**, npm **11.20.0**, TS **5.9.3**, Mocha **11.7.6**, ts-node
**10.9.2**, Express **5.2.1**, csrf-sync **4.2.1**, Mongo driver **7.7.0**,
Prisma ORM **8.0.0-rc.19** / CLI **8.0.0-rc.24**, Bruno **3.5.2**. No dependency
version/lockfile change; the new `./identity` export exposes the owned entrypoint.

```sh
# Repository root, also use this absolute qualified PATH when changing cwd:
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-core run typecheck:application
npm run lint

# packages/redbox-core:
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http \
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --timeout 45000 test/http/RecordCreateAuthorizationMongo.test.ts \
  test/http/IdentityAdministrationMongo.test.ts

TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 10000 \
  test/services/RvaImportService.test.ts
```

The build actually regenerates/copies both Prisma contracts and exits **0**.
Strict source/test typecheck exits **0**. Repository lint: **989 files, 0 errors /
0 warnings**. Focused Mongo/HTTP run: **17 passing, 0 failing/pending**
(`p5-round-admin-http6.log`), before adding the final actual-provider abort case;
its final integrated result is in API closure. The run includes existing Bruno
**2 requests / 4 tests / 0 failures/skips**, using real persisted target identities.
Existing record/user/controller regression: **556 passing, 0 failing/pending**;
existing RVA regression: **9 passing, 0 failing/pending**. Client-abort tests retain
accepted user writes through a failed stop deadline, then persist and audit before
closing repositories. The final provider-abort case applies that check to actual
upstream HTTP work as well.

Initial diagnostics (retained in ignored `.tmp/sails-retirement/p5-round-*` logs):
namespace import/type errors, missing required identity fixture fields, a
credential-safe test assertion, legacy mocks lacking newly delegated helper
methods, and a fixture brand resolver returning the default brand for every ID.
Each was corrected and rerun; existing tests were preserved. The latter fixture
correction makes the foreign-object test actually create a foreign vocabulary.

## Outstanding work

Account-linking routes remain absent because their record ACL rewrite requires
SR-035's owned writer. A real Mongo test proves missing writer composition fails
before `userlink` creation or membership changes. Linking/audit/list/search reads
still need complete tenant-scoped disclosure adapters. The comparison globals
remain for unmigrated consumers; no per-request standalone fallback is installed.

Other SR-036 work remains independently implementable: remaining user reads,
vocabulary CRUD/form lookups, admin config/cache aliases, branding configuration /
publication and native asset collaborators, Figshare vocabulary/crosswalk flows,
search index mutations, SIEM writes, notifications and configured action dispatch.
They are explicit open implementation work, **not** claimed to be blocked solely
by SR-035. The closure evidence groups all 84 remaining declarations and records
actual provider prerequisites. SR-040 onward was not started. Institution
qualification remains SR-005 and is outside this round. No provider quota/usage
limit was encountered.

## Integrated verification of this slice

The final combined run (`p5-round-integrated-http5.log`) passes **105 tests, zero
failures/pending**, including all **15 identity/query/RVA tests** and the four
create-authorization tests. All **26 actual Bruno requests / 37 tests** pass;
the two existing identity-token requests account for four of those tests. The
actual-provider abort test persists the imported vocabulary and user audit before
shutdown, and deliberate failed preparation makes no provider request and cleans
up. The source/compiled import guards pass with the owned attachment repository
boundary described in [API closure](p5-api-closure.md#standalone-import-and-override-closure-correction).
The full command, descriptor-limit environment correction, earlier failures and
full-core closeout are recorded there. No timeouts or assertions were weakened.
