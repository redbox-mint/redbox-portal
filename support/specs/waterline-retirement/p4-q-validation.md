# P4 Q validation

Source baseline: `f8c8cd7de` on `t3/waterline-retirement`. G-Q is **PASS for
transaction-free `next`**, 2026-10-20. Promotion `d2dc6f8ce` makes Q default to
MongoDB; explicit Waterline rollback remains. G-TX stays closed. All fixtures
use owned disposable standalone MongoDB, never development data.

## Physical spike

`bash packages/redbox-core/test/fixtures/waterline-retirement/run-configuration.sh spike`
passes on Node 24.18.0 / official driver 7.7.0 / MongoDB 8.0.34 standalone.
[Loaded schema, raw EJSON, callbacks and actual indexes](evidence/p4-q/spike.txt).

All four collections use ObjectId `_id`, ISO string timestamps and schemaless
extension fields. AppConfig branding and I18n branding/bundle references are
ObjectIds; dashboard branding is a **string**. AppConfig has no brand/key unique
index. Duplicate creates succeed; legacy `updateOne` refuses multiple matches.
AppConfigService retains its warning/latest timestamp selection and tie rule.

Dashboard rows default provenance to `{}`. The loaded `migrate:safe` models
create only `_id` indexes even for declared unique fields. DashboardConfigService
currently creates `{branding:1}` unique at initialization. Q's driver requires
explicit operator preparation of that index and the two declared I18n UID
indexes. No AppConfig unique constraint is added.

Bundle defaults: displayName `''`, namespace `translation`, enabled `true`;
branding may be null. Bundle UID is generated on create and unchanged by locale
updates. Translation defaults: namespace `translation`, nullable category,
description, contentFormat and bundle. Empty value `''` is accepted; create
missing/null and update null values fail. A value-only or key-only update keeps
the existing UID. A submitted locale+key patch without branding generates a
**global** UID even on an existing branded row. Never compute it from merged data.

Secret leases have string `_id` names, BSON Date expiresAt, optional string owner
and cacheToken. They use the built-in `_id` uniqueness; no TTL deletion is added
because freshness tokens must survive release. AWS is outside the DB operation.

## Qualification

Implementation commit `7c3abfdd0` introduces `ConfigurationRepositories` and the
lazy `initializeConfigurationPersistence` / `getConfigurationRepositories`
application lifecycle. The five interfaces are appConfigs, dashboards, bundles,
translations and secretLeases. They expose explicit Promise operations and plain
DTOs: string identities/timestamps, JSON and epoch-ms lease metadata. BSON,
native filters/cursors/managers and driver types remain private. Nullable legacy
fields are represented in the public types. No dependency or lockfile changes.

The [consumer inventory](evidence/p4-q/consumers.json) covers AppConfigService,
AppConfigSecrets, DashboardConfigService, DashboardTypesService,
I18nEntriesService, TranslationService and NamedQueryExecution. All four Q
named-query targets follow Q independently of the promoted R selector. Model
registrations remain for Waterline fallback, associations and later P11/P12.

The Waterline adapter calls actual loaded models/callbacks. Its dashboard native
CAS/index ownership and secret native lease collection move behind explicit
operations without changing predicates. The driver adapter borrows the shared
application pool, checks loaded mappings/callbacks/server/collation/indexes
before service bootstrap, rejects incompatible hooks, and performs no startup
DDL or fallback. Stale repository references are fenced across cleanup or
selector changes. Ordinary imports and generated shims remain offline.

The shared fresh-volume script, matching hook template and installed
`persistence:indexes` command prepare dashboard branding plus both I18n UID
indexes. Q-only preparation leaves AppConfig duplicates valid, adds no lease
TTL and never runs business migrations/callbacks. Missing, sparse, conflicting
or duplicate indexes stop readiness with the maintenance command identified.
All selected groups are inspected before any ensure DDL.

## Compatibility and failure cases

The disposable standalone contract harness runs independent loaded Waterline and
MongoDB worker processes simultaneously. Each adapter writes data the other
reads/updates. Raw-document assertions cover ObjectId references, dashboard
string branding, ISO timestamps, empty/null/default values, extension fields,
secret-reference JSON and string-ID/BSON-Date leases. Reads do not rewrite
stored data. Unsupported BSON causes controlled driver repository/query refusal;
it cannot silently remove a row from a page. Waterline remains available for
investigation and explicit migration.

The real SIEM configuration producer normalizes omitted token/username/password
into own undefined properties. Waterline physically omits them. The SIEM form
adapter now omits those absent optional credentials before storage; the Q JSON
guard stays strict. A [reduced real-service regression](evidence/p4-q/siem.txt)
proves masking and identical raw JSON with both adapters. Core SIEM credential
binding, AWS failure/cache ordering and controller suites are renewed alongside
the full MongoDB Bruno rerun after its initial SIEM-save 500.

The shared cases also exercise create-only bundle UIDs, translation partial
patch UID rules, duplicate AppConfig latest selection/save refusal, case
sensitive literal prefix matching, all four tenant-scoped query readers, ID filters, ordered pages and
projections, service HTML sanitization, simultaneous mixed writers, selector
rollback/forward, retained-reference fencing and a new-process restart.

Competing dashboard revisions have exactly one winner and preserve all copied
targets within the aggregate. Injected native update errors leave raw state
unchanged without retry/save fallback. The standard dashboard suite additionally
covers conflict results, multi-target copy validation, legacy initialization,
preflight/resolution fingerprints, retained recovery snapshots and completed
Migration-ledger behavior.

Applied CAS and lease writes with injected failed write-concern acknowledgements
remain committed/readable even though the caller receives an error. Neither
adapter automatically retries or compensates. Rejected-command and failed-ack
fixtures are distinct; neither is a production failover claim.

Lease cases cover competing acquisition, expired-owner refusal, ownership
replacement, stale renewal/token/release rejection, preserved freshness tokens
and injected update failures. The standard service integration suite replaces a
real lease owner and proves refusal before AWS dispatch. Existing unit suites
characterize masking, publication/cache ordering, SDK error redaction, oversized
bundles, heartbeat failure/loss, the 30-second abort deadline and recovery only
after lease expiry. AWS commands are SDK-mocked; no claim of live AWS/KMS/IAM
qualification or MongoDB/AWS atomicity is made. Aborted AWS writes can still
commit and a database operation already dispatched is not cancellable by lease
loss.

I18n entry/bundle synchronization remains best effort. An injected bundle write
failure leaves the committed empty entry readable and still invokes resource
reload. Existing suites cover bundle-first entry synchronization, pruning,
overwrite/default merging, empty values and reload behavior. No transaction or
stronger synchronization was introduced; G-TX remains closed.

Loaded callback and custom-collection hooks are exercised through Waterline;
all four callback overrides are refused by MongoDB before readiness. Institutions
must inventory private hooks and stored queries, port their behavior to explicit
services/targets or retain Waterline. A migrated institution service using the public repository getter also preserves
its extension behavior against both adapters. This synthetic hook evidence does not
qualify unknown institution overrides.

## Rollback artifact and recovery

The [artifact record](evidence/p4-q/rollback-artifact.json) identifies the built
pre-Q `f8c8cd7de` installed-package image, its immutable image ID, source/tarball
and lock hashes. Identical dependency locks allow reuse of the previously
installed dependency layer; the captured pre-Q compiled package replaces core
files while preserving nested installed dependencies. The offline smoke checks
that package before the unchanged-database rehearsal.

The contract uses the same owned database/indexes for driver writes, config
rollback, forward selection and the prior built image. The pre-Q image reads all
four shapes and the native lease Date, then writes an AppConfig row the current
driver reads. Recovery does not drop indexes or replay migrations. The fixture
checkpoint is synthetic MongoDB data plus a designated package/runtime image;
real deployment rollback also requires matching hooks/config/assets and
reconciliation of subsequent DB and AWS effects. See
[operations](p4-q-operations.md).

## Future PostgreSQL obligations

No PostgreSQL adapter is implemented. A future Q adapter/data migration must
preserve duplicate AppConfig selection and ties without inventing uniqueness;
map opaque IDs, nullable JSON, missing fields and string timestamps explicitly;
provide unique dashboard branding and conditional revision updates; design
lease row ownership/expiry/fencing and retained cache-token semantics; and
preserve I18n global UID rules, submitted-field callback conditions and best
effort projections. Stored JSON predicates/collation and institution targets
need separate translation. SQL transactions would not make AWS and DB writes
atomic. These obligations follow ADR0003 and design §4.

## Command results and G-Q

The [command record](evidence/p4-q/verification.json) and
[sanitized signals](evidence/p4-q/verification.txt) record completed checks.
Build, core (4,142 passing, 106 existing pending), cache-contract freshness,
persistence/root type checks, lint and changed-file formatting pass. The core
import regression stays below its unchanged 12-second deadline and asserts no
eager Q imports. Foundation (12), Prisma cache (17), driver cache (15), M (15,
including its prior image), R's complete transition/prior-image suite and all
12 index-preparation cases pass. The cache-only lifecycle fixture explicitly
selects Waterline and supplies inert Q registrations; it still checks original
startup failure identity and cleanup through every generated bootstrap stage.

The expanded Q contract, readiness and provisional operations all pass, with
no data rewrite and connections returned to baseline. Q p95/throughput/RSS/call
ratios are 0.784 / 1.420 / 0.666 / 1.00; see the operations guide. Clean packages
installed/pruned with npm 11.20.0 pass offline types/import/shims and live Q
repositories/queries/CAS/leases on Node 24.16.0 and 26.11.1. No dependencies or
lockfiles changed; [audit](evidence/p4-q/dependencies.json).

The corrected standard fresh-volume MongoDB Mocha runner passes all 53 selected
tests, including an assertion that the MongoDB reader bypasses the loaded model.
The root direct-lift bootstrap now forwards Q alongside M/R; a prior run exposed
its missing forwarding and is not claimed as a MongoDB pass. Both renewed Mocha runs pass 53 tests. The final Bruno runs pass all 305
requests and 549 assertions per backend, including the corrected SIEM save/mask
path. All standard runs use fresh volumes, normal dependency startup and shared
init indexes; no manual index preparation or runner replacement is used.
[Unsuccessful attempts](evidence/p4-q/runner-retries.json) remain distinct from
passing evidence.


## G-Q decision

**PASS for transaction-free `next`**, 2026-10-20, implementation/fix checkpoint
`4bef01eb0`. P4.1–P4.5 are evidenced across all four Q entities and the native
lease collection; no Q consumer/native path is left for a later group. Plain
operations, actual loaded Waterline callbacks, driver readiness, scoped query
readers, raw/bidirectional/mixed/restart/config/prior-image rollback, security
behavior, failure injection and provisional operational budgets pass. The final
SIEM producer fix preserves Waterline's physical omission while retaining the
strict repository JSON contract. The final standard suites pass with each backend.

The gate-acceptance commit retains Waterline. The following separate promotion
selects MongoDB and requires renewed default Mocha, Bruno and development startup
proof. M/R/cache remain independently selected. No transaction was introduced;
I18n remains best effort and MongoDB remains standalone.

This accepts the bounded `next` fixture, not unknown institution data/hooks or
queries, live AWS/IAM/KMS, production auth/failover/capacity, the release-level
security/support decisions, G-STABLE/G-RETIRE or G-TX. Keep incompatible private
hooks on Waterline while migrating their behavior explicitly. P5 J1–J4 must
qualify independently using the handoff in the operations guide.


## Separate Q promotion

The promotion changes the Q default and supplied Compose/hook-archetype defaults
to MongoDB. M/R/cache remain independently selectable. Index preparation without
selectors now inspects/ensures nine scopes, including Q's three required indexes.
Other scope tests explicitly retain Waterline Q to keep their DDL assertions bounded.
Fresh default Mocha, Bruno and development app.js runs and renewed core/index
checks pass. Their results are recorded below.


### Post-promotion proof — complete

Promotion `d2dc6f8ce` follows gate acceptance `c05c867dd`; the default was not
changed in qualification. [Exact commands/exits/hashes](evidence/p4-q/promotion.json)
and [sanitized results](evidence/p4-q/promotion.txt) record the final proof:

- Build, persistence/root type checking and lint: exit 0.
- `npm run test:core`: 4,142 passing, 106 existing pending; offline source import
  10,415 ms against the unchanged 12,000 ms deadline, with no eager Q imports.
- `npm --prefix packages/redbox-core run test:persistence-indexes`: 12 passing
  cases, including all **nine** omitted-selector scopes and fresh Q readiness.
- Fresh default standard Mocha: 53 passing, actual MongoDB backend asserted.
- Fresh default standard Bruno: 305/305 requests and 549/549 assertions.
- Standard development Compose + `app.js`: HTTP startup succeeds; the actual
  in-container `persistence:indexes -- --inspect` reports all nine scopes ready
  and four applied migrations. Only fresh owned data/ports/env-file isolation is
  supplied; no manual index DDL or dependency prewarming is inserted.
- Clean installed/pruned packages on Node 24.16.0 and 26.11.1 omit Q's selector,
  assert MongoDB, pass offline types/imports/shims and all Q repositories, query,
  normalized SIEM, CAS and lease probes. Locks are generated with npm 11.20.0.

Two inert bootstrap fixtures needed explicit Q Waterline selection (`af47d1c66`);
their purpose is lifecycle ordering, and driver readiness remains strict. The
final dev run also caught mixed list/map YAML in the environment anchor: R had
the pre-existing error and Q repeated it. `400f9e793` corrects those two entries;
all eight supplied Compose YAML files parse and real isolated dev startup passes.
The [attempt record](evidence/p4-q/runner-retries.json) distinguishes these from
passing results. Task projects, containers and volumes are cleaned; the designated
pre-Q rollback image remains retained. No push or development datastore access
was performed. P4.1–P4.6 are complete within G-Q's stated `next` scope.
