# B11 — Legacy database preflight and migration

## Entry points and authority

The synchronous core `registerRedboxMigrations()` export registers
`@researchdatabox/redbox-core:20260905T000000-record-definitions`. The generated
`config/migrations.js` includes this core registration alongside hook and app-local
migrations. `MigrationRunner` and Umzug retain responsibility for ordering,
execution, fail-fast startup and recording completion. Production shim detection
also regenerates an old/missing migration shim that lacks this registration;
the upgrade does not depend on an operator remembering a marker file.

`RecordDefinitionMigrationService.preflight()` and `.migrate()` call the same
read/transform/publication-validation preparation. The pure
`transformLegacyRecordDefinition()` is shared with the standalone command:

```sh
RECORD_DEFINITION_PREFLIGHT_MONGO_URL='mongodb://…/database' \
  node support/integration-testing/record-definition-preflight.cjs
```

Supply connection credentials through the environment, preferably using a Mongo
read-only account. The command imports the built migration/registry modules,
connects directly to Mongo and issues reads only. It does not lift Sails, run
bootstrap/Umzug, synchronize schemas, create indexes or write migration/history
rows. It prints a JSON report on success and exits nonzero with bounded diagnostics
on failure. Driver errors and connection strings are not printed.

The standalone command uses persisted brand-scoped forms, roles and record-type
keys, and the core action registry. It intentionally does not execute deployment
hook configuration to discover custom registrations/storage capabilities. Strict
concurrency definitions requiring a storage capability cannot be certified by this
standalone command. The in-process preflight uses the deployment's existing B05
authority, including its action registry and storage capability. Both entry points
use exactly the same legacy transformation and publication validator; this is not
a second approximate converter. Successful preflight does not reserve data or
certify future writes/index creation. Artifact conflicts already present are checked during shared preparation. Concurrent
changes after preflight can still stop `up()`.

## Transformation and supported input

Only persisted `RecordType` rows and their own related `WorkflowStep` rows supply
definitions. Neither default-brand configuration nor another brand's rows are a
fallback. Brand IDs, stable keys and the legacy unique identity key are checked.
Deployment fields remain on the existing identity. Published B10/admin identities
and managed drafts are preserved rather than replaced by legacy data.

The converter reuses A07 `migrateLegacyRecordAction` and its explicit A01 mappings.
It converts options and supported Lodash conditions/templates to managed
JSONata/Handlebars, flattens sequence/callback trees, preserves binding order and
success/output dependencies, and admits first-class automatic transitions.
Existing A10 explicit transitions use the A10 validator/compiler and retain transition
hooks. Legacy automatic mutator edges do not acquire extra transition hooks that
the historical mutator did not invoke. No function
resolution, evaluation, Function constructor, service-name dispatch or fallback
is introduced. New aggregates contain registered bindings rather than legacy
function strings. Registry contract/parameter validation runs before publication.

Legacy manual target selection has no explicit edge table. For representable
inputs, the converter materializes directed edges between distinct stages using
each target's persisted, explicit `authorization.transitionRoles`; B02 also
requires those roles to have source-stage edit access. **An unrestricted legacy
transition is rejected**, not silently tightened to a guessed role list. Operators
must review and explicitly map that policy before upgrading. Legacy stages allow
records to remain there, so migrated stages are terminal-capable. Missing persisted
display indices use deterministic row order. Persisted record-type keys provide
the otherwise absent record-type labels. These choices have fixed warning codes.

Search filters, relationships, transfer fields/role rules, explicit validation
group overrides and concurrency settings have bounded structural mappings.
Unknown properties, hidden stages, unsupported dashboard configuration, an existing
non-null action plan, inherited validation groups without an explicit aggregate
mapping, unsafe expressions and unsupported action options fail closed. These
inputs require a reviewed mapping, not deletion of their semantics or an eval
escape hatch. Legacy automatic mutations must be the final pre action for their
event; interleaving them with later actions is rejected because moving them into
the automatic-transition engine could change observable ordering. Target stage,
label and form assertions must agree with persisted workflow rows.

The original A01 `representative-database.json` remains byte-identical. Its default
brand is intentionally rejected: it includes an automatic mutation attached to
`onTransitionWorkflow.pre`, a source stage absent from its workflow rows and
unrestricted manual targets. Its independent secondary brand remains transformable.
The new B11 supported fixture supplies two distinct brands, four stages, explicit
transition roles, a sequence, email-success callback, condition and automatic edge.
It produces four bindings and five transitions across the two brands. Tests do not
pretend that the historical unsafe fixture is a successful upgrade.

## Persistence, recovery and legacy projection lifecycle

After the complete batch validates, `up()` establishes the same native revision/
history uniqueness indexes used by B05. It then creates/reuses the deterministic
revision-1 ID and deterministic history ID, verifies their content and provenance,
and atomically activates the existing identity with an expected version of zero.
Revision/history use operation `migration`, a fixed migration actor, canonical
hashes, validation scope `migration` and a bounded provenance note. Waterline gets
cloned create arguments because adapters may mutate them.

The native CAS uses the verified unique legacy identity key, preserving the actual
primary key and brand association. It avoids constructing BSON IDs from a different
Mongo driver version. Null/missing version-zero fields are handled explicitly;
active/draft pointers, retirement and mutation fences block stale activation.
An ambiguous write is confirmed by reading the exact pointer/version. Conflicting
or malformed immutable artifacts are never adopted or overwritten. A history failure
can leave an orphan revision; an identical retry reuses it and completes history
before activation. Retrying after activation but before Umzug logs completion is
idempotent. No rollback/delete handler is supplied.

This is **not a multi-document transaction or a cross-instance migration lock**.
Quiesce writers and run one upgrade instance, as required by Data-Migrations.
Earlier identities in a batch may be active if a later write fails. Retry the same
persisted input; changed input conflicting with an orphan fails for explicit review.
Non-Mongo adapters without the required native index/CAS operations fail before
definition writes. The inherited `REDBOX_SKIP_MIGRATIONS` escape hatch still skips
all pending migrations; using it also skips B11's upgrade protection.

No eager draft is required by B10/B04: B04 can clone an active revision when editing
begins. This migration therefore creates no redundant mutable draft. Existing
managed drafts are preserved.

Legacy `WorkflowStep` rows and legacy identity fields are retained as recovery
evidence and are never rewritten or reseeded by migration. Once the pointer is
active, B06/B07 runtime adapters resolve the immutable aggregate and produce
compatibility workflow projections in memory. They do not synchronize a second
mutable WorkflowStep graph. Direct legacy-table consumers must move to these
adapters; editing retained rows does not edit a published definition. Corrupt active
definitions fail resolution rather than falling back to the retained function strings.
There is no automatic archive cleanup in B11.

## Bounds and diagnostics

Legacy reads admit at most 256 identities and 64 steps per identity. The Waterline
reader fetches stable one-row pages (compatible with `schema: false`), validates each body and caps
each admitted collection at 8 MB. The command consumes native cursors with batch
size one and the same byte cap. A single native document remains subject to Mongo's
document limit before application validation; there is no unbounded `toArray()`
of legacy bodies. Existing B05 authority-catalog bounds still apply in process.

Shared graph preflight caps input at 1 MB, depth 48, strings 32,768 characters,
property names 128 characters, arrays 256 entries, objects 128 properties and
50,000 work units. It rejects proxies, accessors, executable/non-JSON own properties,
cycles and pollution keys before cloning. Waterline's exact code-owned non-enumerable
RecordType serializer (and the draft model's serializer when validating a managed
draft) is excluded by exact code-owned function identity without calling it. Datetime metadata is handled
without calling caller-defined serialization methods. Expanded edges are capped
before building the graph; bindings have contract cardinality and 262,144-byte
expansion caps. The B02 aggregate and semantic validation limits apply afterward.

Reports contain the fixed migration identifier, bounded counts, opaque identity
hashes, canonical aggregate hashes and fixed warning codes. They contain no record
payload, action options, expression text, labels, credentials or raw driver errors.
Diagnostics identify generated row/field paths and error codes without echoing
untrusted values or property names. A failure stops the batch at its first unsafe
input; preflight never automatically repairs data.

## Verification

Work started at `f4229d6f` in the existing worktree. Installed dependencies and the
existing Mongo container on port 27190 were reused. The B11 native gate uses the
disposable `redbox_b11_native` database; the B09/B10 regression uses the separate
`redbox_b11_b09_regression` database. No dependency, Angular or lockfile change is
part of this slice.

Commands used (logs are under `.tmp/b11-*`):

```sh
node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json
node_modules/.bin/tsc -p packages/sails-hook-redbox-storage-mongo/tsconfig.json
node_modules/.bin/tsc --noEmit
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node --no-experimental-strip-types node_modules/mocha/bin/mocha.js --no-config --require ts-node/register/transpile-only --require chai --require ./packages/redbox-core/test/setup.ts packages/redbox-core/test/loader/loader.test.ts packages/redbox-core/test/services/RecordDefinitionMigrationService.test.ts packages/redbox-core/test/legacy-database-migration.test.ts
RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:27190/redbox_b11_native bash support/integration-testing/run-b11-native.sh
RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:27190/redbox_b11_b09_regression bash support/integration-testing/run-b09-native.sh
npm --prefix packages/redbox-core test -- --timeout 15000 --reporter dot --require ../../.tmp/b07-fix-mocha-timeout.cjs
node_modules/.bin/tsc packages/redbox-core/test/record-definition-contracts.type-test.ts packages/redbox-core/test/record-definition-seeds.type-test.ts packages/redbox-core/test/record-definition-migration.type-test.ts --noEmit --skipLibCheck --strict --target es2022 --module nodenext --moduleResolution nodenext --esModuleInterop --experimentalDecorators
node .tmp/b11-compare-strict.cjs
npm run lint
bash -n support/integration-testing/run-b11-native.sh support/integration-testing/run-mocha-redbox.sh
git diff --check
git merge-base --is-ancestor f4229d6f HEAD
git diff f4229d6f --exit-code -- angular package.json package-lock.json '**/package.json' '**/*lock*'
```

Final results:

| Check | Result |
| --- | --- |
| Core and Mongo storage builds/declarations | Passed |
| Root typecheck and strict emitted public consumer | Passed |
| Focused loader, migration service and transformation suites | 67 passing |
| Normal core package runner | 3,197 passing; 14 existing pending |
| B11 generated-app/Mongo native gate | 2 passing; zero pending |
| B09/B10 generated-app/Mongo regression gate | 37 passing; zero pending |
| Strict diagnostic comparison against `f4229d6f` | 749 baseline/current; zero added or removed |
| Lint, unsafe-expression guard and explicit-type guard | Passed; 23 and 7 guard tests |
| Explicit-type frozen baselines | Unchanged: 5,403 source / 1,780 declaration nodes |
| Shell/command syntax, diff whitespace, ancestry and protected files | Passed |

The strict diagnostic comparison uses a read-only compiler-host overlay of `git show f4229d6f:<path>`;
it does not switch or rewrite the checkout. The inherited core timeout helper only
raises the existing hook API-documentation test's timeout. Existing core pending
tests are not converted into B11 successes; both native runners use `--forbid-pending`
and require their actual Mongo/generated-app prerequisites.

The B11 native tests use emitted loader registration, real Waterline/Mongo artifacts,
the default publication authority and the standalone command. They compare preflight
reports, inject a history-write failure after a real revision insert, retry through
MigrationRunner/Umzug, and repeat after activation. A separate Sails process runs
the generated migration list during bootstrap and verifies startup rejection and
absence of Umzug completion on unsafe input. The injected history failure is not a
claim of network-fault or transaction testing. The generated app's unrelated full
bootstrap is disabled; the full Compose/Bruno/Angular suites are outside this backend
verification. The normal integration runner now requires B11's isolated gate and
excludes its already-run suite from the broad second pass.


## B11 independent-review fix

The focused fix starts from accepted commit `e16e321f` in the same worktree. It
changes B11 migration/preflight implementation, its focused tests, and B11 evidence
only. Existing commits and the later implementation-plan sections are preserved.

Both public entry points now use one execution/preparation path. Preparation reads
and validates existing deterministic artifacts and occupied revision/history slots
before any indexes, inserts or activation. Persistence repeats the immutable
comparisons after reads/creates to detect intervening conflicts. Driver/reader
exceptions receive a fixed value-free diagnostic; stored payloads are not included
in errors. This remains a read-only preflight, not a reservation or transaction.

Already-managed active state is checked before skipping: canonical identity/pointer,
bounded versions, revision schema and canonical payload/hash, action-contract
manifest and existing publication authority, source operation/provenance, publication
history ownership and report/version relationships, and managed draft schema/base
pointers/report versions. Draft saves/discards and secret edits can advance the
identity version without publication history; validation does not invent a
publication for those advances. Retirement history uses B05's actual contract:
null revision/hash/source fields and an expected active-revision number. Drafts
retain a UUID identifying their last committed operation after the identity's
pending-operation fields are cleared; that is validated rather than mistaken for
an outstanding mutation.

Immutable event times require valid ISO datetime strings or genuine, valid native
Dates with the ordinary prototype and no own overrides. Null, numeric/boolean,
object/array and invalid dates are rejected without coercion. Only Waterline's
separate automatic `createdAt`/`updatedAt` metadata additionally admits bounded
valid epoch milliseconds. The standalone reader retains that metadata so managed
draft validation agrees with in-process preflight.

Storage rows must have the original plain/null prototype and enumerable own data
properties before copying. Accessors, proxies, hidden data/functions, own undefined
payload fields and custom Date serializers fail before execution. The two exact
model-owned non-enumerable serializers are excluded without invocation. B11 read
queries use Waterline's `skipRecordVerification` metadata solely to bypass its
raw-value warning printer (`waterline/lib/waterline/utils/query/process-all-records.js`);
B11's bounded structural and contract checks then validate the returned values.
This does not change any B10 validation, model hooks, or other service queries.

Recognized legacy deployment fields `packageType` and `searchCore` are type-checked
even though they remain on the identity. WorkflowStep `hidden` must be absent or
false; malformed values and hidden stages are rejected. Step IDs/association
shapes and the legacy identity key are also checked before conversion.

The native test container `redbox-b09-rereview-mongo` had exited (status 14). It was
restarted in place, preserving its volumes. Tests use only the existing named
B11 and B09/B10 disposable databases. Native tests inject malformed artifacts
through Mongo, restore their test rows, compare preflight/migration rejection,
exercise CLI parity, retry through generated-loader/Umzug, and check valid B10
seeds, managed draft saves and retirement. The additional draft fixture is created
through Waterline and attached in the disposable database before a real B04 save.


### Focused-fix verification results

Logs use `.tmp/b11-fix-*`. The commands in the original verification section were
rerun with the same tools and native database URLs. The strict overlay script is
`.tmp/b11-fix-compare-strict.cjs`, with accepted commit `e16e321f` as its read-only
baseline; no checkout/reset or branch change is involved.

| Check | Result |
| --- | --- |
| Core and Mongo storage builds/declarations | Passed |
| Root typecheck and strict emitted public consumers | Passed |
| Final focused loader, service and transformer suites | 138 passing |
| B11 generated-app/Mongo/Umzug gate | 4 passing; zero pending |
| B09/B10 generated-app/Mongo regression gate | 37 passing; zero pending |
| Strict diagnostics against `e16e321f` | 749 baseline/current; zero added or removed |
| Lint and unsafe-expression guard | Passed; 23 guard tests |
| Explicit-type source/declaration guard | Passed; 7 guard tests; unchanged 5,403 / 1,780 baselines |
| Syntax, whitespace, ancestry and protected-file checks | Passed |
| Later implementation-plan sections | Byte-identical to `e16e321f` |

The additional broad core run passed 3,267 tests with 14 existing pending tests.
It preceded the final activation-confirmation descriptor case; that case and the
final code are covered by the 138-test focused suite and final native B11 rerun.
Neither mandatory native runner permits pending tests. The final native run also
checks that corrupt secret-bearing timestamp objects produce no Waterline warnings
or secret-bearing CLI diagnostics. Activation confirmation validates original row
descriptors before reading pointer/version values.

## B11 independent re-review: three focused fixes

This follow-up starts at `476a9629`, retaining accepted B11 implementation
`e16e321f` and all intervening commits. The worktree was clean on entry. Only the
migration service, its unit/native tests, this evidence and the B11 checklist are
changed. Angular, package manifests, lockfiles and later plan sections are unchanged.

Shared preparation now queries the unique history `operationId` slot using the
same deterministic value assigned to the proposed persisted history. A different
occupant fails with a fixed, value-free diagnostic before indexes or definition
writes. Original row validation and full immutable comparisons remain in place;
persistence repeats the slot check. The adversarial unit case occupies the second
brand's slot, proving the entire batch rejects before datastore/index access,
inserts or activation. Native Mongo coverage injects a different secret-bearing
history row and verifies in-process preflight, migration and standalone CLI reject
without revision inserts, identity activation, occupant changes or secret output.

Managed publication and rollback histories now require the exact `rdh_` ID derived
from their operation UUID. Tests first validate consistent publish/rollback state,
then substitute a correctly shaped but unrelated history ID. Both entry points
reject with zero writes, including after identity-version advances that take the
managed no-latest-history skip path.

Draft-only skips now validate retirement through the existing identity DTO contract,
using the existing strict event-time parser. Tests accept absent, cleared and valid
retirement metadata, and reject boolean/object/numeric/array values, invalid times,
missing actors, orphan actor/reason metadata and invalid or oversized reasons.
Both entry points reject with zero writes. The narrow Waterline read metadata
exception, original descriptor checks, shared preparation, earlier B11 security
checks and bounded diagnostics remain unchanged.

### Re-review verification

Commands are the original verification commands above, with logs under
`.tmp/b11-rereview-*`. The strict comparison reuses
`.tmp/b11-fix-compare-strict.cjs` against `e16e321f` through a read-only compiler
host overlay. Native runners use the same existing Mongo container and separate
disposable databases documented above. The first B09/B10 launch exited during
startup while B11 was still using their shared fixed HTTP port; the sequential
retry passed, with no runner or application changes.

| Check | Result |
| --- | --- |
| Focused loader, migration service and transformation suites | 144 passing |
| Broader core package suite | 3,274 passing; 14 existing pending |
| B11 generated-app/Mongo/Umzug and CLI gate | 4 passing; zero pending |
| B09/B10 generated-app/Mongo regression | 37 passing; zero pending |
| Core and Mongo storage builds/declarations | Passed |
| Root typecheck and strict emitted public consumers | Passed |
| Strict diagnostics against `e16e321f` | 749 baseline/current; zero added or removed |
| Lint and unsafe-expression guard | Passed; 23 guard tests |
| Explicit-type source/declaration guard | Passed; 7 tests; unchanged 5,403 / 1,780 baselines |
| Prettier, shell syntax and diff whitespace | Passed |
| Ancestry, protected files and later plan sections | Passed |

## B11 round three: legacy retirement trust boundary

This P2 fix starts at `10ceb156`, preserving `e16e321f`, `476a9629` and all
existing changes. Shared preparation now applies the existing retirement validator
to legacy identities before excluding managed fields from transformation. Legacy
rows supply canonical DTO identity metadata solely for this validation; their
persisted schema, identity and version checks remain separate and unchanged. The
same helper continues to validate draft-only retirement without weakening its
checks. No transformation, artifact, history, CAS or storage-row safety logic changes.

Absent/null retirement metadata and a cleared empty reason remain accepted, with
preflight/migrate hash parity and successful subsequent preflight. Strict timestamp,
actor and bounded optional-reason validation rejects malformed retired metadata;
orphan actor/reason metadata fails with no timestamp. Valid retired legacy rows
still fail the existing quiescence guard rather than being activated or unretired.

The unit regression places adversarial metadata on the second legacy brand. Both
entry points reject the initial input with matching, bounded, value-free diagnostics,
unchanged tables, zero inserts/activation and zero datastore access (including
indexes). Cases include the reported null timestamp with object actor/object reason,
orphan fields, booleans, objects, numbers, arrays, malformed/missing actors, invalid
calendar times and oversized reasons. Accepted cleared states and legitimate retired
states have separate coverage. None of these rejection assertions depends on a
post-migration failure.

The native regression injects the reported payload directly into the supported B11
legacy fixture before migration. In-process preflight, migrate and standalone CLI
reject without secret output, revisions, history or activation; the stored row and
existing collection/index snapshots are unchanged. The initial test run exposed a
snapshot setup error when listing indexes on an absent collection. The snapshot
now records only existing collections, including their names, so it also detects
unexpected collection creation. The corrected native gate passes.

### Round-three verification

Commands follow the verification section above; logs use `.tmp/b11-round3-*`.
Core and Mongo builds emit declarations; the strict public consumer uses those
emitted declarations. The strict compiler-host overlay compares against `e16e321f`
without modifying the checkout. The B11 and B09/B10 native runners run sequentially
against the same separate disposable databases documented above. The additional
Mongo package suite uses its normal unit-test runner.

| Check | Result |
| --- | --- |
| Focused loader, migration service and transformation suites | 150 passing |
| Broader core package suite | 3,280 passing; 14 existing pending |
| B11 generated-app/Mongo/Umzug and CLI gate | 4 passing; zero pending |
| B09/B10 generated-app/Mongo regression | 37 passing; zero pending |
| Mongo package unit suite | 117 passing; 9 existing pending |
| Core and Mongo storage builds/declarations | Passed |
| Root typecheck and strict emitted public consumers | Passed |
| Strict diagnostics against `e16e321f` | 749 baseline/current; zero added or removed |
| Lint and unsafe-expression guard | Passed; 23 guard tests |
| Explicit-type source/declaration guard | Passed; 7 tests; unchanged 5,403 / 1,780 baselines |
| Prettier, shell/CLI syntax and diff whitespace | Passed |
| Scope, all three accepted ancestors and protected files | Passed |
| Plan sections before B11 and after B11 | Byte-identical to `10ceb156` |

## B11 Astra re-review: two P2 fixes

This round starts at `d6d39311`, preserving `e16e321f`, `476a9629`,
`10ceb156` and all existing changes. Only the migration service, the
publication authority reads, the standalone preflight, their unit/native
tests, this evidence and the B11 checklist are changed. Angular, package
manifests, lockfiles and later plan sections are unchanged.

Finding 1 (retired identity with a legitimate post-retirement draft save):
shared preparation previously required retirement history at the current
identity version, so a valid managed retired identity that received a draft
save (identity.version advanced with no new retirement event) was rejected
with `missing-identity-history` on both entry points. Validation now keeps
the strict current-version retirement check and, when no history occupies
the current version on a retired identity, locates the applicable retirement
event through a new latest-retire/unretire lookup (Waterline sorted read and
standalone native sorted read, both under the existing protected read
metadata) and validates it with the same strict shape: B05 null
revision/hash/source fields, UUID-bound `rdh_` ID, expected/active-revision
binding, revision-schema coherence, exact retiredAt/actor/reason match,
`/retirement` added change, empty redactions and `truncated: false`. The
gap additionally requires the retirement to postdate the publication history
and predate the current version, which is the legitimate draft-advance
shape. Malformed, orphan and mismatched retirement metadata still fails
closed with bounded value-free diagnostics and zero writes, and
deterministic history uniqueness, CAS/identity invariants and read-only
preflight semantics are unchanged.

Finding 2 (authority reads outside the protected boundary): preparation
shares the publication authority, whose Waterline role/form/record-type
catalog reads did not use `skipRecordVerification`, so a secret-bearing
malformed persisted `Role.name` produced raw-value Waterline warnings
containing the sentinel on both entry points. All three catalog reads now
use the protected read metadata and keep their existing row validation, so
malformed values fail closed with bounded diagnostics and never log or
expose raw persisted values. The standalone preflight validates its
role/form/record-type catalog with the same reference/key patterns,
cardinality bounds and duplicate checks, and the migration service
additionally validates every loaded authority snapshot (roles, forms,
record-type keys) with bounded value-free `invalid-authority` diagnostics,
so custom and standalone authorities cannot broaden trust by suppressing
row assertions.

Regressions use the normal lifecycle and adversarial sentinels. The unit
suite accepts a retired identity with one and then two legitimate draft
advances after retirement (preflight/migrate skip with hash parity and zero
writes) and still rejects tampered actor/timestamp metadata in the gap. A
separate unit case rejects secret-bearing malformed authority snapshots for
roles, forms and record-type keys on both entry points with identical
bounded messages, unchanged tables and zero writes. The native gate extends
the managed B10 test through the real B04 save after a real B05 retire
(version advances, preflight/CLI/migrate parity, skipped, no new
revisions/history, identity row unchanged) and injects a secret-bearing
malformed `Role.name` through native Mongo (reusing the driver's own
`branding` ObjectId instance to avoid cross-package BSON version mixing),
verifying in-process preflight/migrate and standalone CLI reject without
the sentinel in diagnostics, with unchanged revision/history counts and no
secret-bearing `console.warn` output.

### Astra re-review verification

Commands follow the verification section above; the B11 and B09/B10 native
runners use the same existing Mongo container and separate disposable
databases documented above. The strict compiler-host overlay compares
against `f4229d6f` without modifying the checkout.

| Check | Result |
| --- | --- |
| Focused loader, migration service and transformation suites | 152 passing |
| Broader core package suite | 3,282 passing; 14 existing pending |
| B11 generated-app/Mongo/Umzug and CLI gate | 5 passing; zero pending |
| B09/B10 generated-app/Mongo regression | 37 passing; zero pending |
| Mongo package unit suite | 117 passing; 9 existing pending |
| Core and Mongo storage builds/declarations | Passed |
| Root typecheck and strict emitted public consumers | Passed |
| Strict diagnostics against `f4229d6f` | 749 baseline/current; zero added or removed |
| Lint and unsafe-expression guard | Passed; 23 guard tests |
| Explicit-type source/declaration guard | Passed; 7 tests; unchanged 5,403 / 1,780 baselines |
| Shell/CLI syntax and diff whitespace | Passed |
| Ancestry, protected files (Angular, manifests, lockfiles) and scope | Passed |
| Plan sections before B11 and after B11 | Byte-identical to `d6d39311` |

## B11 Astra review: three focused P2 fixes

This round starts at `a4943cf6`, preserving `e16e321f`, `476a9629`,
`10ceb156`, `d6d39311` and all existing changes. Only the migration
service, the standalone preflight, their unit/native tests, this evidence
and the B11 checklist are changed. Angular, package manifests, lockfiles
and later plan sections are unchanged.

Finding 1 (valid clone-publish state rejected): `validateDraft` required
the managed draft base revision to equal the current active revision, but
the normal B04/B05 lifecycle retains the draft's original base after
publication. B04 clone creates the draft with a null base and B05 publish
keeps it, so a published cloned identity holds active revision 1 with a
retained null draft base and both entry points rejected it with
`invalid-managed-draft`. Validation now accepts a null base or any
historical base at or before the active revision, requiring exact
null-pairing, the derived base ID binding and a base within the published
range. Ownership, schema/content/version checks, the draft validation
report coherence check and malformed/future/orphan rejections are
unchanged. A malformed base that makes the persisted-draft schema
refinement throw a raw error is now mapped to the same bounded
`invalid-managed-draft` diagnostic instead of the generic wrapper, keeping
preflight/migrate parity.

Finding 2 (valid rollback history rejected): B05 rollback stores
validation scope `rollback` with a null expected draft version, but the
managed-history check accepted only `migration`/`publication` scopes and
compared report draft versions against `expectedDraftVersion ?? 0`, so a
native rollback (revision 2, rollback history event) failed with
`invalid-active-history`. Validation is now operation-specific: expected
scope is `migration` for migration, `rollback` for rollback and
`publication` for publish/bootstrap; rollback requires a positive source
revision below the target revision and a null expected draft version;
rollback report draft versions must equal the impact draft version instead
of the null expectation. Publish/bootstrap/migration expectations are
unchanged, and arbitrary scope/operation combinations still fail closed.
ID, operationId, recordType, identity version, revision/hash, actor/reason,
timestamp, changes and redaction bindings are unchanged.

Finding 3 (standalone CLI authority parity gap): the CLI validated
Role/Form rows by name/configuration but never checked normalized branding
ownership, so Mongo array matching admitted branding arrays carrying a
foreign brand and the CLI exited 0 with a valid report while in-process
preflight/migrate rejected. Every CLI authority row (roles, forms and
record-type keys) now requires scalar validated brand ownership before
projection, matching the in-process boundary. Diagnostics stay bounded and
secret-free with no raw-value logs. A probe against the disposable native
database confirmed the gap and the fix: the pre-fix CLI exited 0 with an
unchanged valid report on mixed-brand string-array rows while the fixed
CLI exits 1 with `$.authority: invalid-authority`.

Regressions use the normal lifecycle and adversarial sentinels with zero
writes. Unit coverage accepts a clone-publish retained null base and a
historical base on managed skip (preflight/migrate parity, zero writes)
while rejecting future, zero, mismatched and orphan bases; accepts real
rollback history including a draft existing at rollback time while
rejecting publication-scoped rollback, numeric expected draft versions,
null/future sources, divergent report versions and rollback-scoped
publish; and corrects the existing canonical-history-ID test to the true
rollback contract. The native gate clones `reviewclone` through the real
B04 service, publishes it through the real B05 service (active revision 1
with retained null base), rolls it back through the real B05 service
(revision 2, `rollback` scope, null expected draft version), and exercises
preflight/CLI/migrate parity with unchanged revisions/history/identity
rows after each step. It then injects mixed-brand Role/Form associations
in both string-array and ObjectId-array shapes, verifying CLI failure,
in-process fail-closed behavior where the rows are observable, unchanged
counts and valid-row acceptance with CLI/preflight parity after cleanup.

### Three-P2 verification

Commands follow the verification section above; the B11 and B09/B10 native
runners use the same existing Mongo container and separate disposable
databases documented above. The strict compiler-host overlay compares
against `e16e321f` without modifying the checkout. The B11 and B09/B10
native runners ran sequentially against their separate disposable
databases.

| Check | Result |
| --- | --- |
| Focused loader, migration service and transformation suites | 154 passing |
| Broader core package suite | 3,284 passing; 14 existing pending |
| B11 generated-app/Mongo/Umzug and CLI gate | 8 passing; zero pending |
| B09/B10 generated-app/Mongo regression | 37 passing; zero pending |
| Mongo package unit suite | 117 passing; 9 existing pending |
| Core and Mongo storage builds/declarations | Passed |
| Root typecheck and strict emitted public consumers | Passed |
| Strict diagnostics against `e16e321f` | 749 baseline/current; zero added or removed |
| Source and emitted-declaration any/unknown | Unchanged (zero in service source and emitted declarations) |
| Lint, unsafe-expression and explicit-type guards | Passed; 23 and 7 guard tests |
| Prettier (format-gated paths), shell/CLI syntax and diff whitespace | Passed |
| Ancestry, protected files (Angular, manifests, lockfiles) and scope | Passed |
| Plan sections before B11 and after B11 | Byte-identical to `a4943cf6` |

## B11 Astra review: two focused lifecycle fixes

This round starts at `10314e1d`, preserving `e16e321f`, `476a9629`,
`10ceb156`, `d6d39311`, `a4943cf6` and all existing changes. Only the
migration service, its unit/native tests, this evidence and the B11
checklist are changed. Angular, package manifests, lockfiles and later
plan sections are unchanged.

Finding 1 (valid lifecycle rejection at `validateDraft`): the managed
draft check required the save-time validation report's active revision to
equal the retained draft base. That rejects two legitimate B04/B05
states: a published clone whose retained null base coexists with a
clone-time report referencing no active revision, and a subsequent B04
save whose report references the current active revision while the base
stays null. The report's active revision is now validated independently
of the base: null (untouched clone-time reports) or a published revision
at or before the current active revision (clone/publish/rollback saves).
Record identity, draft-version equality, historical/null base binding,
schema brand/key refinement and revision bounds are unchanged, and
future, malformed, wrong-identity and mismatched values still fail closed
with the same bounded `invalid-managed-draft` diagnostic. The first
version of this fix required exact report/active equality; the native
gate caught that over-correction on the real retained clone (report null
with active revision 1) and the rule was relaxed to the bound check,
which the rerun verifies.

Finding 2 (retirement-history bypass across draft-only gaps): when the
publication history sat below the current identity version with no
history at the current version, unretired identities returned without
consulting retirement history. Publish, retire, draft-save, then clearing
`retiredAt`/`retiredBy`/`retirementReason` without an unretire event left
the latest durable event as retire, yet both entry points accepted the
contradictory unretired identity. The gap path now locates the latest
durable retire/unretire event for unretired identities as well: no event
permits the legitimate never-retired draft-only advance, a valid unretire
event permits the gap, and a contradictory retire or malformed event
fails closed with bounded value-free `invalid-identity-history`
diagnostics before writes. The retired-identity path is unchanged apart
from sharing the lookup. The standalone CLI uses the same service path
and native sorted read, so parity holds. Migration idempotence and
read-only preflight semantics are unchanged.

Regressions use the normal lifecycle and adversarial sentinels with zero
writes. Unit coverage accepts the clone-publish-save retained draft with
its save-time report (draft version 1, null base,
`validatedActiveRevisionNumber` 1), the untouched clone-time null report,
historical bases and rollback saves with stale/current reports, while
rejecting future/mismatched/wrong-identity reports and orphan bases; and
accepts legitimate never-retired, retired-gap and unretire-gap advances
while rejecting the cleared-without-event bypass and malformed gap
events. The unit reader mock gains a bounded `find` chain so the
Waterline `latestRetirement` fallback is exercised exactly as production
queries it. The native gate clones through the real B04 service,
publishes through the real B05 service, saves the retained draft (draft
version 1, null base, report active 1) and exercises preflight/CLI/migrate
parity with unchanged revisions/history/identity rows, then tampers the
persisted report to verify fail-closed parity and restoration; and runs
publish, retire, post-retirement save, native retirement clearing,
restoration, proper unretire and a final save, verifying rejection with
`invalid-identity-history` on every entry point during the bypass window
and acceptance otherwise, with unchanged counts and restored rows. Both
reproductions were confirmed to fail on the pre-fix code (unit: valid
save rejected with `invalid-managed-draft`; bypass accepted without
rejection) and pass after the fix.

### Two-fix verification

Commands follow the verification section above; logs use
`.tmp/b11-astra2-*`. The strict compiler-host overlay compares against
`e16e321f` without modifying the checkout. The B11 and B09/B10 native
runners ran sequentially against their separate disposable databases. The
B11 disposable database was dropped once before the final clean rerun
because the earlier over-correction run had persisted a retained clone
under its per-run brand.

| Check | Result |
| --- | --- |
| Focused loader, migration service and transformation suites | 156 passing |
| Broader core package suite | 3,286 passing; 14 existing pending |
| B11 generated-app/Mongo/Umzug and CLI gate | 10 passing; zero pending |
| B09/B10 generated-app/Mongo regression | 37 passing; zero pending |
| Mongo package unit suite | 117 passing; 9 existing pending |
| Core and Mongo storage builds/declarations | Passed |
| Root typecheck and strict emitted public consumers | Passed |
| Strict diagnostics against `e16e321f` | 749 baseline/current; zero added or removed |
| Source and emitted-declaration any/unknown | Unchanged (zero in service source and emitted declarations) |
| Lint, unsafe-expression and explicit-type guards | Passed; 23 and 7 guard tests |
| Prettier (format-gated paths), shell/CLI syntax and diff whitespace | Passed |
| Ancestry, protected files (Angular, manifests, lockfiles) and scope | Passed |
| Plan sections before B11 and after B11 | Byte-identical to `10314e1d` |
