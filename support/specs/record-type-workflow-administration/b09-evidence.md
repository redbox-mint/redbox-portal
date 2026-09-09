# B09 — Admin controllers, routes, authorization and API tests

Baseline: `74b803a0` (approved B08 UTF-8 correction), preserving B07 at
`6653b100` and every existing commit. The shared worktree was used in place;
no branch changes, resets, replacement checkouts, or dependency changes were made.
The Angular lockfile is unchanged. Architecture section 13 (including 13.1–13.3)
and the wiki controller, service, coding and testing conventions were read first.

## HTTP contract

All routes use `/:branding/:portal`, the existing Admin authorization rules,
normal policy chain plus no-cache, and explicit `csrf: true`. The controller
also requires authentication and an Admin role whose branding relation matches
the brand resolved from **route parameters** on every call. Session, query and
body brand selectors cannot override that brand. Constructors perform no
Sails-dependent setup; the inherited exported-action initialization wrapper is
retained. Only the sixteen named actions are exported/routed; service dispatch
and controller helpers are not HTTP actions. Blueprint routes remain disabled.

Success uses the established AJAX `res.ok` response. Failures use fixed JSON
errors: 400 malformed/invalid input, 401 authentication required, 403 forbidden,
404 missing resource, 409 optimistic conflict, 413 oversized input, 503 unavailable
lifecycle/protected storage, and a fixed 500 fallback. Typed lifecycle validation
and impact reports are retained; exception messages, causes, stacks, request bodies,
handlers and protected values are never copied into errors.

| Method | Path after prefix | Action |
| --- | --- | --- |
| GET | `/admin/record-definitions` | `list` |
| POST | `/admin/record-definitions/:sourceKey/clone` | `clone` |
| GET | `/admin/record-definitions/:key` | `get` |
| GET | `/admin/record-definitions/:key/draft` | `draft` |
| PUT | `/admin/record-definitions/:key/draft` | `save` |
| DELETE | `/admin/record-definitions/:key/draft` | `discard` |
| POST | `/admin/record-definitions/:key/validate` | `validate` |
| POST | `/admin/record-definitions/:key/publish` | `publish` |
| GET | `/admin/record-definitions/:key/revisions` | `revisions` |
| GET | `/admin/record-definitions/:key/revisions/:revision` | `revision` |
| POST | `/admin/record-definitions/:key/revisions/:revision/rollback` | `rollback` |
| POST | `/admin/record-definitions/:key/retire` | `retire` |
| POST | `/admin/record-definitions/:key/unretire` | `unretire` |
| GET | `/admin/record-actions` | `actions` |
| PUT | `/admin/record-definitions/:key/draft/actions/:bindingId/secrets/:parameter` | `writeSecret` |
| DELETE | `/admin/record-definitions/:key/draft/actions/:bindingId/secrets/:parameter` | `clearSecret` |

Every mutation body requires `schemaVersion: 1` and rejects unknown fields:

- Clone: `targetRecordTypeKey`, `expectedActiveRevisionNumber`. The source
  snapshot is checked inside the clone service as well as at the HTTP boundary;
  target creation retains the existing atomic uniqueness contract.
- Save: existing `RecordDefinitionDraftSaveRequestDto` (`definition`,
  `expectedDraftVersion`, `expectedActiveRevisionNumber`).
- Discard: `expectedDraftVersion`, `expectedActiveRevisionNumber`.
- Validate/publish: existing publication DTO (`expectedIdentityVersion`,
  `expectedDraftVersion`, `expectedActiveRevisionNumber`, optional `publicationNote`).
- Rollback: `expectedIdentityVersion`, `expectedActiveRevisionNumber`, mandatory
  `reason`; the revision comes exclusively from the path.
- Retire/unretire: `expectedIdentityVersion`, optional `reason`.
- Secret PUT: `expectedDraftVersion`, `expectedSecretVersion`, optional `value`.
  Omitted/blank retains; nonblank replaces after the existing UTF-8/byte validation.
- Secret DELETE: `expectedDraftVersion`, `expectedSecretVersion`, `confirm: true`.

Read bodies must be empty objects. Only list `after` and history `limit` query
parameters are accepted. Identity listing uses brand-filtered keyset pagination,
100 items per page and `nextAfter`; history defaults to 50 and caps at 100.
The input preflight bounds bytes (1 MiB), nesting (34 including envelopes), string
length (65,536), property names, cardinality and work before schema parsing.
Existing stricter aggregate validation remains authoritative. Revision parsing
accepts only positive decimal safe integers, including the full service range.

`get` returns the identity and immutable active revision/history DTO.
`draft` returns the safe draft plus `secretStates` containing only binding ID,
parameter name, configured boolean and slot version. Graph data is present in
aggregate stages/transitions; validate returns the publication validation and
impact reports using exactly the same server authority as publish. It never
accepts client-supplied roles, form capabilities, action registries or impact data.
Action metadata is obtained through `serializeDescriptorMetadata()`.

## Service and secret persistence changes

The thin controller delegates to `RecordDefinitionAdminService`, an HTTP input
adapter over the approved draft, publication and protected-storage services.
Draft service gains bounded identity listing and a clone-source revision
precondition. Publication gains a validation preview using its existing authority,
impact analysis and optimistic checks. Existing save/publication/rollback/history
and retirement persistence are reused.

Protected slot administration adds native atomic compare-and-swap of
`adminVersion`; a missing legacy counter reads as zero. Competing initial writes
resolve duplicate-key races as conflicts; replacements and clears use the same
counter. Clear removes ciphertext but retains a null-value tombstone and counter,
so a stale browser write cannot resurrect a cleared value. The model explicitly
represents the nullable ciphertext and bounded counter. No data migration or seed
is required or added. Runtime resolution treats a tombstone as unconfigured.
The B08 provider authorization, descriptor ownership, encryption key, AES-GCM
AAD and UTF-8 validation are retained. No secret read endpoint exists.

The legacy ActionController and `sails.config.action` executable path were already
removed in the approved baseline. A production source scan confirms they remain
absent. No generic action-execution route was added.

## Verification

| Check | Result |
| --- | --- |
| Focused controller/draft/publication/secret/model tests | 99 passing |
| Full core regression | 3,094 passing, 14 existing pending |
| Mounted Mongo controller/lifecycle/draft/runtime regressions | 33 passing |
| Real Sails routing/session/CSRF plus Bruno integration | 15 passing (including Bruno) |
| Bruno collection | 27 requests passed, 54/54 assertions in test scripts |
| Core and Mongo storage builds/declarations | Passed |
| Root TypeScript and strict public declaration consumer | Passed |
| Root lint | Zero warnings/errors |
| Unsafe-expression guard and adversarial tests | Passed, 23 tests; frozen 16 legacy sites |
| Explicit type-node guard and adversarial tests | Passed, 7 tests; frozen 5,409 source / 1,781 declaration nodes |
| Strict diagnostics versus `74b803a0` | 749 baseline / 749 current, zero additions or removals |
| Working/staged whitespace and secret sentinel checks | Passed |
| Dependency manifests, locks and Angular files | Unchanged |

The full core run preceded the final revision-range boundary test; the final focused
run covers that additional safe-integer case and all changed service/model behavior.

The Mongo test calls the exported controller through actual draft/publication
services, encryption and native persistence. It exercises listing/isolation,
secret blank/omitted/replace/clear/racing writes, stale secret and draft versions,
validation, publish conflict, safe revision/history reads, clone conflict,
save/discard, retire/unretire and rollback. Controlled roles/forms and a registered
secret action provide publication authority; no seeded UI or later migration is
needed. The mounted lift deliberately skips application bootstrap and uses a
task-owned disposable Mongo database with `migrate: drop`.

The separate standalone Sails HTTP harness exercises real routes, sessions,
CSRF middleware and the production controller/HTTP adapter. It supplies an
authenticated-user fixture and bounded service responses; it does not claim to
test credential login or Mongo within that HTTP process. Bruno executes the
committed browser-admin collection against this harness with an authenticated
session cookie, covering all sixteen route paths, missing resources, every
mutation without CSRF, every mutation with unknown input, and redaction.
The shared deployed collection uses the existing admin login cookie; the
standalone harness supplies the same cookie via `adminCookie`.

Run corrections: the first compile found a base-controller method-name collision
and a branded binding-ID mismatch; both were fixed. Initial HTTP fixture runs
needed the correct Sails server reference and service globals. A later concurrent
HTTP/Mongo run found Sails normalizes port zero to the default port; the HTTP
fixture now obtains an available ephemeral port explicitly. These were fixture
or compile corrections, not relaxed production checks.

Commands (from the worktree root unless stated):

```sh
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config --require ts-node/register/transpile-only --require chai --require ./packages/redbox-core/test/setup.ts packages/redbox-core/test/controllers/RecordDefinitionAdminController.test.ts packages/redbox-core/test/services/ActionSecretService.test.ts packages/redbox-core/test/services/RecordDefinitionDraftService.test.ts packages/redbox-core/test/services/RecordDefinitionPublicationService.test.ts packages/redbox-core/test/model/RecordDefinitionModels.test.ts
npm --prefix packages/redbox-core test -- --timeout 15000 --reporter dot --require ../../.tmp/b07-fix-mocha-timeout.cjs
npm --prefix packages/redbox-core run build
npm --prefix packages/sails-hook-redbox-storage-mongo run build
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsc packages/redbox-core/test/record-definition-contracts.type-test.ts --noEmit --skipLibCheck --strict --target es2022 --module nodenext --moduleResolution nodenext --esModuleInterop --experimentalDecorators
npm run lint
node .tmp/b09-compare-strict.cjs
B09_BRUNO_CLI=/tmp/redbox-b09-bruno/node_modules/.bin/bru NODE_OPTIONS=--no-experimental-strip-types TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node_modules/.bin/mocha --require ts-node/register/transpile-only --require chai test/unit/controllers.RecordDefinitionAdmin.test.ts
```

The inherited core Mocha timeout helper raises only slow legacy suite timeouts.
The strict comparator uses a compiler-host overlay of `git show 74b803a0:<path>`
and excludes new B09 files from baseline roots; it compares file/code/message
multisets without checking out or modifying baseline source. Bruno CLI 4.0.0 was
installed under `/tmp`, leaving repository dependencies and lockfiles untouched.

Mounted Mongo command (task-owned container `redbox-b09-mongo`, port 27190):

```sh
docker run --rm --network host -v "$PWD:/opt/redbox-portal" -w /opt/redbox-portal -e NODE_ENV=development -e TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json -e RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:27190/redbox_b09_final --entrypoint node qcifengineering/redbox-portal:develop --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config --require ts-node/register/transpile-only --require chai --require ./test/integration/helpers/record-definition-bootstrap.cjs test/integration/services/RecordDefinitionPublicationService.test.ts test/integration/services/RecordDefinitionDraftService.test.ts
```

B10/B11 and all C-series work remain incomplete and unchanged.

## Exact changed files

- `packages/redbox-core/src/action-registry/secrets.ts`
- `packages/redbox-core/src/config/auth.config.ts`
- `packages/redbox-core/src/config/policies.config.ts`
- `packages/redbox-core/src/config/routes.config.ts`
- `packages/redbox-core/src/controllers/RecordDefinitionAdminController.ts`
- `packages/redbox-core/src/controllers/index.ts`
- `packages/redbox-core/src/services/RecordDefinitionAdminService.ts`
- `packages/redbox-core/src/services/RecordDefinitionDraftService.ts`
- `packages/redbox-core/src/services/RecordDefinitionPublicationService.ts`
- `packages/redbox-core/src/services/action-secrets/storage.ts`
- `packages/redbox-core/src/services/index.ts`
- `packages/redbox-core/src/waterline-models/ActionSecret.ts`
- `packages/redbox-core/test/controllers/RecordDefinitionAdminController.test.ts`
- `packages/redbox-core/test/model/RecordDefinitionModels.test.ts`
- `support/specs/record-type-workflow-administration/b09-evidence.md`
- `support/specs/record-type-workflow-administration/implementation-plan.md`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/01 Get CSRF token.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/02 List definitions.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/03 List action descriptors.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/04 Missing definition identity.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/05 Missing definition draft.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/06 Missing definition history.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/07 Missing definition revision.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/08 Missing CSRF clone.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/09 Reject unknown body clone.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/10 Missing CSRF save.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/11 Reject unknown body save.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/12 Missing CSRF discard.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/13 Reject unknown body discard.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/14 Missing CSRF validate.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/15 Reject unknown body validate.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/16 Missing CSRF publish.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/17 Reject unknown body publish.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/18 Missing CSRF rollback.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/19 Reject unknown body rollback.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/20 Missing CSRF retire.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/21 Reject unknown body retire.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/22 Missing CSRF unretire.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/23 Reject unknown body unretire.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/24 Missing CSRF writeSecret.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/25 Reject unknown body writeSecret.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/26 Missing CSRF clearSecret.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/27 Reject unknown body clearSecret.bru`
- `test/bruno/2 - AJAX calls/1 - Admin User Tests/Record Definitions/folder.bru`
- `test/unit/controllers.RecordDefinitionAdmin.test.ts`
- `test/integration/services/RecordDefinitionPublicationService.test.ts`

## Independent review follow-up

The original verification above did not exercise production parser failures,
provider/Admin counter interoperability, or the draft/secret interleaving through
generated discovery. Those gaps and the four resulting blockers are corrected in
[B09 independent review corrections](b09-fix-evidence.md), which supersedes the
original claims on these points and documents the non-expiring fence limitation.

The final independent re-review adds the mandatory generated/native gate and native
acknowledgement-loss matrix; see [current correction evidence](b09-fix-evidence.md).
The standalone HTTP suite is now under `test/unit` and supplies stubbed adapter
coverage only. Earlier counts above are historical, not results of the final correction.
