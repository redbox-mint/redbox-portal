# B08 protected secret-slot persistence

Work starts at approved B07 HEAD `6653b100` in the existing shared worktree.
No commits, branch, worktree, dependency pins or user edits are replaced. The
Angular lockfile remains blob `999da9f88d7f2f0fea33119c8c55eeb2c6e957b8`.

## Implementation and operational boundary

`ActionSecretService` follows the existing service export/shim pattern and offers
only write, replace, clear and configured-state methods. Like the definition
lifecycle services, it takes server-authenticated brand authority; it is not an
HTTP authorization boundary. B09 must authorize the administrator and derive
`requesterBrandId` from the authenticated request before calling it. No B09 routes,
controllers, UI, or later slices are added. Provider metadata identifies the
server provider, not an invented human actor.

The initial provider uses the existing ActionSecret model's Sails Mongo datastore
and native single-document mutations, consistent with definition persistence.
There was no reusable reversible-encryption implementation in the existing
source. The native boundary receives only AES-256-GCM ciphertext: it never sends
plaintext to Waterline hooks, model validation, Mongo queries, or driver errors.
A random 96-bit nonce is generated per replacement. The canonical slot ID is
additional authenticated data, binding ciphertext to brand, record type, binding
and parameter. Model create/update hooks reject plaintext or malformed envelopes;
model JSON excludes the provider payload. Configured-state queries project out
that payload. The default storage factory and encryption helpers are internal
and stripped from emitted public declarations. No plaintext read service exists.

A06 retains its provider/storage seam, fixed-message errors, branded slot IDs,
write limits and private resolved-secret wrappers. Oversized blanks and malformed
UTF-16 strings are rejected, preventing silently lossy UTF-8 persistence. Persistent providers add
storage authorization hooks: even blank writes must reference a declared draft
secret, and execution must reference the exact current active binding before
and after the protected read. Only the provider-bound registry executor can
supply trusted bindings. Publicly validated plans cannot resolve secrets.
Record execution and the existing registered queue consumer use this provider.
Retired identities retain active actions for existing records; creation availability
remains governed by the existing record lifecycle.
Expressions are evaluated before resolution and never receive the secret map.
Trusted executable handlers alone receive descriptor-declared secret wrappers;
ordinary error, result, audit and expression projection protections remain in
force. The provider never retains or reports adapter exception causes.

Values are independent of definition snapshots. Blank/omitted writes retain;
nonblank writes replace; explicit clear atomically deletes. Reads report a
boolean. Configured markers in a draft/revision are declarations, not a copy of
protected storage; required missing values fail closed during execution. Clone
uses fresh binding/slot identity and unconfigured markers. Rollback reuses only
the current slot, never a historical value, and cannot undo a clear.

Concurrency is single-document Mongo atomic ordering, not a multi-document
transaction with definition publication. Simultaneous mutations use the last
applied slot operation; contending initial upserts may return a redacted provider
failure on a unique-key race. There is no read-modify-write fallback or retry that
could overwrite a later clear. A secret already read for an executing trusted
handler cannot be recalled by a later clear; active-binding rechecks deny
revocation observed during the read. Removed drafts deny new slot administration;
old slots cannot authorize an absent or different active binding. B09 owns
request concurrency envelopes and UI confirmation for explicit clear.

## Deployment, backups and future providers

Set `REDBOX_ACTION_SECRET_KEY` to a securely generated 32-byte key encoded as
exactly 64 hexadecimal characters, consistently on every application/worker
instance. Supply it through deployment secret injection; do not commit it, put
it in a definition, expose it through bootstrap data, or log it. Missing or
malformed keys deny replacement/resolution; clear and configured-state reads do
not need decryption. No dependency was added.

Keep database backups and encryption-key backups separately access controlled.
A database-only backup contains authenticated ciphertext; loss of the key makes
existing values unrecoverable. A backup of both key and database can decrypt the
values. Restoring an old database backup can restore old credentials (unlike
application definition rollback); reconcile/revoke/re-enter credentials after
recovery. Deletion does not erase backups or Mongo journal/storage remnants.
Use database authentication, restricted network access and encrypted backup/media
storage as well as this application protection.

The initial format has one deployment key and no automatic online key rotation.
For a planned key change, quiesce action execution and slot writes, preserve the
old key for backup recovery, inject the new key on all instances, replace every
configured credential from its authoritative source, verify required slots, and
then resume. Mixed keys across instances fail resolution. Never generate a fresh
key automatically at application startup.

This protects against plaintext disclosure through normal persistence and
serialization; it does not protect against a compromised application process,
a malicious trusted hook/handler, privileged debugger, memory/core dump, or an
operator with both the key and database. Handlers are trusted server code and
must not log or return revealed credentials. The existing `ActionSecretStorage`
interface is the seam for a future external secret manager; such a provider must
retain slot ownership, active-binding authorization, redaction, limits and atomic
mutation semantics. External providers and a rotation/key-version migration are
outside B08.

## Verification

Final logs are in ignored `.tmp/b08-*.log` artifacts in this shared worktree.
Build/type/lint commands run sequentially, followed by tests, to avoid replacing
compiled artifacts while a mounted application is loading them.

Build and type/security checks (exit zero):

```sh
npm --prefix packages/redbox-core run build
npm --prefix packages/sails-hook-redbox-storage-mongo run build
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsc packages/redbox-core/test/record-definition-contracts.type-test.ts \
  --noEmit --skipLibCheck --strict --target es2022 --module nodenext \
  --moduleResolution nodenext --esModuleInterop --experimentalDecorators
npm run lint
```

`npm run lint` reports zero warnings/errors and includes the explicit commands
`npm run lint:unsafe-expressions` and `npm run lint:explicit-type-nodes`.
The unsafe-expression guard retains **16 documented legacy sites** and passes
**23 tests**. The explicit type gate retains **5,409 frozen source / 1,781 frozen
public declaration nodes** and passes **seven adversarial tests**. No baseline,
allowlist, compiler option or production timeout is weakened. The generated
`services/action-secrets/{storage,envelope}.d.ts` modules contain only `export {}`;
`ActionSecretService.d.ts` exposes only the four write/state operations.

Focused controller-independent tests (**62 passing**):

```sh
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json \
node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config \
  --require ts-node/register/transpile-only --require chai \
  --require ./packages/redbox-core/test/setup.ts \
  packages/redbox-core/test/services/ActionSecretService.test.ts \
  packages/redbox-core/test/action-secret-provider.test.ts \
  packages/redbox-core/test/model/RecordDefinitionModels.test.ts \
  packages/redbox-core/test/services/record-actions/coordinator.test.ts \
  packages/redbox-core/test/action-execution/registered-executor.test.ts
```

Full regression commands:

```sh
npm --prefix packages/redbox-core test -- --timeout 15000 --reporter dot \
  --require ../../.tmp/b07-fix-mocha-timeout.cjs
npm --prefix packages/sails-hook-redbox-storage-mongo test -- --reporter dot
```

The inherited ignored B07 Mocha hook gives only the existing
`API routes contract layer should include hook-contributed routes in merged docs`
test a 30-second timeout. Assertions and production deadlines are unchanged.

Mounted real Mongo/publication/draft/executor security coverage:

```sh
docker run -d --name redbox-b08-mongo -p 127.0.0.1:27189:27017 mongo:7
docker run --rm --network host \
  -v "$PWD:/opt/redbox-portal" -w /opt/redbox-portal \
  -e NODE_ENV=development \
  -e TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json \
  -e RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:27189/redbox_b08_mounted \
  --entrypoint node qcifengineering/redbox-portal:develop \
  --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config \
  --require ts-node/register/transpile-only --require chai \
  --require ./test/integration/helpers/record-definition-bootstrap.cjs \
  test/integration/services/RecordDefinitionPublicationService.test.ts \
  test/integration/services/RecordDefinitionDraftService.test.ts
node .tmp/b08-compare-strict.cjs
git diff --check
git diff --cached --check
git hash-object angular/package-lock.json
git rev-parse 6653b100:angular/package-lock.json
```

The B08 case uses a real persisted draft, publication, active revision resolver,
Mongo slot mutations, model serialization, registry executor, clone and rollback.
It captures executor log/audit/output projections and checks the secret sentinel
is absent. It also examines native snapshots/history/acknowledgements and
exercises malformed/oversized/undeclared input and concurrent upserts. The unit
suite independently covers malformed access, hostile error objects, UTF-8 limits,
missing/wrong keys, ciphertext authentication/tampering/owner swaps, revoked
bindings during reads, and delayed write acknowledgement after clear. It checks
unacknowledged mutations fail closed and repeated writes use fresh nonces.

The strict comparison uses a compiler-host source overlay from
`git show 6653b100:<path>` and excludes new B08 source files from baseline roots.
It never checks out or modifies baseline source. It compares diagnostic
file/code/message multisets under `packages/redbox-core/tsconfig.strict.json`.

Environment limits: the inherited integration lift skips application bootstrap
and uses a disposable database with `migrate: drop`. B08 publication authority
supplies controlled roles/forms and a normally registered test handler; the
actual publication, active resolution, encryption, native persistence and
executor run unmodified. This is controller-independent coverage, not a B09
HTTP/browser or external secret-manager exercise. Existing suite-pending tests
remain pending. The task-owned Mongo container is removed after verification.

Run corrections: the first full core run had 3,045 passing, 14 pending, and two
B08 fixture-hook failures because an earlier suite removed global Sails. The
fixture now installs/restores its own Sails object. An initial mounted attempt
overlapped core declaration emission and could not load `dist/index.js`; final
runs are sequential. The first expanded mounted executor case correctly denied
a fixture missing the operation request ID; supplying the required request ID
fixed that fixture without relaxing the execution boundary. A subsequent full
core run passed 3,066 tests before the final two malformed-Unicode cases were
added. Final results are recorded below.

## Final results

| Check | Result |
| --- | --- |
| Focused provider/model/coordinator/executor tests | 62 passing |
| Full core regression | 3,068 passing, 14 existing pending |
| Full Mongo storage regression | 117 passing, 9 existing pending |
| Mounted Mongo publication/draft/executor integration | 32 passing |
| Core and Mongo builds/declarations | Passed |
| Root types and strict public declaration consumer | Passed |
| Lint | Zero warnings/errors |
| Unsafe-expression gate and tests | Passed; 23 tests; frozen 16 legacy sites |
| Explicit any/unknown source/public emission gate and tests | Passed; 7 tests; frozen 5,409 / 1,781 nodes |
| Strict diagnostics versus `6653b100` | 749 baseline / 749 current; zero additions/removals |
| Final log sentinel scan | No fixture secret in focused/core/storage/mounted/lint logs |
| Dependency manifests/locks and Angular lockfile | Unchanged |
| Working and staged diff checks | Passed |

The final command sequence completed with exit zero. The task-owned
`redbox-b08-mongo` container was removed after verification.

## Changed files

- `packages/redbox-core/src/action-registry/secrets.ts`
- `packages/redbox-core/src/services/ActionSecretService.ts`
- `packages/redbox-core/src/services/action-secrets/envelope.ts`
- `packages/redbox-core/src/services/action-secrets/storage.ts`
- `packages/redbox-core/src/services/RDMPService.ts`
- `packages/redbox-core/src/services/RecordsService.ts`
- `packages/redbox-core/src/services/index.ts`
- `packages/redbox-core/src/services/record-actions/coordinator.ts`
- `packages/redbox-core/src/waterline-models/ActionSecret.ts`
- `packages/redbox-core/test/helpers/action-secret-fixture.ts`
- `packages/redbox-core/test/model/RecordDefinitionModels.test.ts`
- `packages/redbox-core/test/services/ActionSecretService.test.ts`
- `packages/redbox-core/test/services/record-actions/coordinator.test.ts`
- `test/integration/services/RecordDefinitionPublicationService.test.ts`
- `support/specs/record-type-workflow-administration/b08-evidence.md`
- `support/specs/record-type-workflow-administration/implementation-plan.md`
