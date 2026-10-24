# P7 production prerequisites: owned provider collaborators

## Workflow trigger operations

`records/WorkflowTriggers.ts` now receives the actual record read/write port,
branding lookup, translation operations, log and named hook resolver. The neutral
graph contains no CoreService, Sails request/lifecycle type or global service
lookup. The comparison boundary alone supplies globals and evaluates legacy hook
expressions. The existing `services/TriggerService` name delegates to that adapter
until P8. Workflow/regex/related-record save behavior retains the existing
implementation rather than duplicating the algorithms.

Template validation compiles to a local variable instead of overwriting
`options.template`. Startup configuration is frozen; the previous cache assignment
would throw against real portal configuration. The new standalone aggregate
executes successful/rejected template validation with frozen options, twice, plus
ordered named hook dispatch, resolution-before-effects and workflow transition.
Its deliberately unused record/brand collaborators throw on unexpected use;
this is a pure-operation check, not provider or portal qualification.

Node **26.11.1**, from `packages/redbox-core` with the absolute qualified toolchain
bin on PATH:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/services/TriggerService.test.ts
```

The unchanged existing suite reports **11 passing / 2 unchanged pending /
0 failing**, exit **0**. The two pending template cases predate this slice; they
were not changed or counted as passing. New compiled standalone qualification:

```sh
node packages/redbox-core/node_modules/typescript/bin/tsc -p packages/redbox-core/tsconfig.json
node --test packages/redbox-core/test/qualification/workflow-triggers.cjs
```

Both commands exited **0**; the aggregate is **1 passing / 0 failing / 0 skipped**,
**370.322033 ms** total. Logs under `.tmp/sails-retirement/p7/`:
`workflow-triggers-existing-final.log`, `workflow-triggers-build-final.log`,
`workflow-triggers-offline.log`. Focused lint: **0 errors / 0 warnings**;
formatting/diff checks pass. No dependency changed.

The first extraction invocation returned **8 passing / 2 pending / 3 failing**
because a nested regex error callback lost its `this` binding when translation
became an explicit input. The unchanged tests caught this; the callback now uses
lexical `this`. A corresponding compiler error is resolved in the final build.
No existing test, assertion or timeout was edited.

These changes remove an actual production collaborator prerequisite; complete
record-operation registration, provider assembly, production HTTP startup and
broad P7 acceptance remain open.

## Security-event capture, durable delivery and drain

`integrations/SecurityEvents.ts` now owns capture/normalization/redaction,
queue submission, persisted capture, ownership resolution and query operations.
Inputs supply the existing SIEM repository, exact-brand lookup/configuration,
queue, record lookup and log. It has explicit quiesce/drain/close and no request
types, CoreService, globals or process handlers. Request context projection and
the legacy shutdown callback live only in `compat/sails/securityEvents.ts`;
`services/SecurityEventService.ts` retains the comparison facade.

The unchanged existing suites `SecurityEventOwnership`,
`SecurityEventCapturePrivacy` and `SiemServices` pass **37 / 0 failing /
0 pending**, exit **0**, using Node **26.11.1** and the existing source Mocha
invocation recorded above. Log: `security-events-existing.log`. Core TypeScript
passes in `workflow-triggers-build-final.log`; focused lint and format pass.

The real qualification uses Mongo **8.0.34**, actual Agenda **6.2.6**/Mongo
backend, the actual repository/forwarding implementation, a local HTTP HEC receiver
and the two existing core security job declarations/options:

```sh
SR_SECURITY_EVENTS_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_security_events \
node --test packages/redbox-core/test/qualification/security-events.cjs
```

Result: **1 passing / 0 failing / 0 skipped**, exit **0**. One redacted security
event and one successful delivery attempt persist, with `deliveryState=delivered`.
Stop waits while the real collector response is held, then the accepted delivery
persists before the repository/pools close. Late work is rejected and the compiled
graph contains no Sails/CoreService/comparison imports. The temporary database
and receiver are removed in finally. Log: `security-events-mongo-final.log`;
aggregate body **1899.734864 ms**, natural process exit **62635.074847 ms**.

The exit delay is the already recorded Agenda passive lock-watchdog limitation
([P3](p3-lifecycle-config.md#sr-022--owned-queue)). Inspector observations after
cleanup found only two native Promise timeout callbacks, not sockets, with
`300000 ms` delays when the first new qualifier accidentally used library default
lock lifetimes. It now selects the actual core declarations (store **30000 ms**,
forward **120000 ms**), so natural exit waits about **60000 ms**. No force-exit,
monkey patch, dependency change or existing-test timeout/skip change was used.
Production operational qualification must still include these actual passive
timer delays and the selected job lifetimes.

Earlier development attempts: the first aggregate failed **0/1** because its
owner omitted the SIEM group's existing `redboxStorage` datastore. It now supplies
both explicit logical datastores. Type checking also caught an unknown record
lookup being inferred as absent by a Lodash overload; explicit metadata narrowing
fixes that boundary. Neither failure is counted as a passing run. This proves
the extracted capture/delivery path, not the complete production portal/job set.

## Integration notification delivery and durable throttle state

`integrations/IntegrationNotifications.ts` contains the shared notification
algorithm with explicit configuration, Email, log and awaited state operations.
`IntegrationNotificationState.ts` binds the existing CacheEntryRepository; it
preserves the configured database-cache lifetime and the algorithm's separate
failure-window timestamps, with no timer or detached writes. The comparison
service delegates through `compat/sails/integrationNotifications.ts`.

Node **26.11.1** commands (qualified toolchain bin on PATH):

```sh
# From packages/redbox-core
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/services/IntegrationNotificationService.test.ts
# From repository root
node packages/redbox-core/node_modules/typescript/bin/tsc -p packages/redbox-core/tsconfig.json
SR_NOTIFICATIONS_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_notifications \
node --test packages/redbox-core/test/qualification/integration-notifications.cjs
```

Unchanged existing suite: **20 passing / 0 failing / 0 pending**, exit **0**.
New compiled aggregate on actual Mongo **8.0.34** and a local SMTP receiver:
**1 passing / 0 failing / 0 skipped**, exit **0**, **1771.665730 ms** total.
Actual Email/Nodemailer renders the shipped templates and delivers two messages.
Dispatch remains pending while SMTP acceptance is held; the persisted state is
absent until delivery, then visible immediately after awaited dispatch. A new
notification instance suppresses a repeated failure using that state, sends one
recovery, persists clearing and suppresses duplicate recovery. Expired database
state returns null. The compiled graph contains no Sails/CoreService adapter;
the disposable database and sockets are cleaned up.

Logs: `integration-notifications-existing.log`, `notifications-build-final.log`,
`integration-notifications-mongo-final.log` under `.tmp/sails-retirement/p7/`.
TypeScript, focused formatting/lint and diff checks pass. The first compiler
invocation caught an insufficiently narrowed comparison config object; the
boundary now explicitly validates a non-array record. An invocation before the
new state adapter had been emitted failed module loading; the final invocation
uses the completed build. No existing test/assertion/timeout or dependency changed.
This is provider qualification, not a complete portal/queue composition claim.

## Explicit bundled record-hook names

`recordTypes/RecordHookNames.ts` supplies a finite conversion table for known
built-in v5 expressions. The dev v6 producer returns converted copies; the
comparison producer retains its original declarations. Only hooks and explicit
nested `options.hooks` lists are visited; template strings stay opaque. Unknown
Sails expressions and unsupported hook modes/phases fail. Existing named
institution operations remain named, subject to the production registry's later
validation. Creator-edit authorization recognizes the canonical permission
operation names and the retained comparison spellings.

```sh
node packages/redbox-core/node_modules/typescript/bin/tsc -p packages/redbox-core/tsconfig.json
node packages/redbox-core/node_modules/typescript/bin/tsc -p packages/redbox-hook-dev/tsconfig.json
node --test packages/redbox-core/test/qualification/record-hook-names.cjs \
  packages/redbox-core/test/qualification/portal-configuration.cjs
```

Core and dev compile on Node **26.11.1**. The final aggregate reports **9 passing /
0 failing / 0 skipped**, exit **0**, **5531.371744 ms**, including **27** actual
bundled hook declarations converted, immutable source/template preservation,
idempotence and creator authorization. Logs: `named-hooks-core-build-final.log`,
`named-hooks-dev-build-final.log`, `named-hooks-qualified-final.log`. The first
dev build exposed an unnecessarily erased registration return type; the producer
now retains its actual ScenarioRegistration type. No assertions were weakened.
Production operation bindings and migration of persisted v5 definitions remain
required; these checks do not claim a v6 record write or upgrade.

## DOI HTTP, configuration and retained audit completion

`integrations/Doi.ts` now uses explicit translation/log, branded configuration,
records, audit and HTTP program inputs. `integrations/doi/` holds the shared
configuration and audited Effect runtime. Comparison globals and optional legacy
audit lookup live in `compat/sails/doi*.ts`; the existing service/helper paths are
delegates. There is one payload/HTTP/trigger algorithm. Config resolution clones
the branded data and receives the credential environment explicitly. DOI trigger
writeback still calls the existing record mutation protocol; that writeback is
not exercised by the new provider aggregate.

`queries/IntegrationAudits.ts` now retains asynchronous enqueue/persistence work,
exposes awaited completion/failure and drain/close, and awaits notification
submission. Synchronous `startAudit` remains synchronous and retains its work.
The caller/application owns admission; queue workers continue owning their jobs.
Best-effort audit failures remain logged rather than changing the provider result.

Node **26.11.1**, qualified toolchain bin on PATH:

```sh
# From packages/redbox-core
node node_modules/typescript/bin/tsc -p tsconfig.json
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/services/IntegrationAuditService.test.ts test/services/DoiService.test.ts \
  test/services/doi-v2/*.test.ts test/configmodels/DoiPublishing.test.ts
SR_DOI_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_doi \
node --test test/qualification/doi.cjs
```

Core build and unchanged existing suites pass: **91 passing / 0 failing /
0 pending**, exit **0**. The compiled aggregate uses actual Mongo **8.0.34**,
the actual bundled Prisma storage/audit implementation and a local DataCite HTTP
receiver: **1 passing / 0 failing / 0 skipped**, exit **0**. It sends a successful
create and rejected create (**2 HTTP requests**); success persists **4** nested
audit rows sharing one trace/two spans, failure persists **2 failed** rows plus
its start rows. **4** notification submissions are awaited. A held provider
response and held notification submission keep the DOI operation pending;
audit drain also waits. Credential references remain unchanged in frozen-source
configuration and the resolved password does not enter persisted audit data.
No Sails/CoreService/comparison module enters the compiled graph. The qualifier
uses direct integration-test audit persistence and deliberately does not exercise
Agenda or record writeback; those still require full portal qualification.

Final logs: `doi-qualified-build.log`, `doi-qualified-existing.log`,
`doi-qualified-mongo-http.log` in `.tmp/sails-retirement/p7/`. Formatting, focused
lint and diff checks pass. No dependency or existing test/assertion/timeout changed.
The initial extraction had **33 passing / 14 failing** because re-export getters
prevented the existing comparison runtime stubs from taking effect. Concrete
comparison delegates restore that seam; the unchanged tests then pass. TypeScript
also rejected insufficient method narrowing and the previous assumption that
plain branded DOI data was a config-model instance; both are corrected. A
premature compiled invocation before emission failed module loading and is not
counted as a passing run. Production provider binding remains open.

## RAiD ownership, OAuth and durable retry

`integrations/Raid.ts` receives explicit branding/current configuration, records,
queue, audits and log. Legacy config normalization and globals live only in
`compat/sails/raid*.ts`. `integrations/raid/http.ts` owns a supplied token map;
each provider has its own map and clears it on close. The previous process-wide
cache survives only in the comparison adapter. The actual generated RAiD client,
JSONata mapping, Effect interruption/retry and existing record append protocol
remain in use. The shared audit layer now awaits completion/failure promises.
The concrete Records port describes its actual initiating-actor and mutation
result contract, avoiding the older abstract interface's erased return value.

Node **26.11.1**, qualified toolchain bin on PATH, from `packages/redbox-core`:

```sh
node node_modules/typescript/bin/tsc -p tsconfig.json
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/services/RaidService.test.ts test/services/raid-v2/*.test.ts
SR_RAID_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_raid \
node --test test/qualification/raid.cjs
```

Core build passes. Existing unchanged suites: **40 passing / 2 unchanged pending /
0 failing**, exit **0**. Compiled real-Mongo/local-HTTP aggregate: **1 passing /
0 failing / 0 skipped**, exit **0**. Actual Mongo **8.0.34**, generated RAiD HTTP
client, Prisma storage/audits and Agenda **6.2.6** backend execute. **2 OAuth
requests / 4 mint requests / 48 persisted audit rows / 1 durable retry**. Two
successes on one provider reuse its token; another provider obtains its own.
A 503 schedules the next-day retry and retains the initiating actor, options and
attempt count in Mongo. App stop drains/closes and the compiled graph has no
Sails/CoreService/comparison import. The future retry is not claimed/executed;
associated-record writeback is not configured in this provider qualifier. The
disposable database and receiver are removed in finally.

Final logs in `.tmp/sails-retirement/p7/`: `raid-qualified-build.log`,
`raid-qualified-existing.log`, `raid-qualified-mongo-http.log`. Focused format,
lint and diff checks pass. No dependency or existing test/assertion/timeout changed.
The first new qualifier omitted the required forceRun/trigger condition and
therefore correctly performed no mint; its assertion failed. Supplying the actual
trigger input exercises HTTP and persists the expected outcome. Initial TypeScript
errors exposed the abstract record port's insufficient actor/result types; the
concrete owned-domain port fixes them without assertions or `any` casts.

## ONI OCFL storage and admitted publication

`integrations/Oni.ts` and `integrations/oni/` own publishing, configuration,
context, audit, repository and Effect runtime collaborators. The selected
StorageManager, datastream, brand/account lookup, Records, audit, log and admitted
work runner are explicit inputs. Repository promises remain retained through
Effect interruption/timeouts and are drained before persistence closes. Globals
and old helper signatures remain in comparison delegates only. Ingestion and
metadata writeback retain their existing algorithms; the aggregate below does
not configure or claim those effects.

Real OCFL qualification found two previously untested production adapter faults:
Flydrive 2.2.0 rejects percent signs in the existing encoded OCFL keys, and
`@ocfl/ocfl` 0.4.0 requires web ReadableStream inputs. The store now uses its owned
driver for both encodings, preserving the physical `%3D`/`%25` layout rather than
changing existing objects. Explicit prefix/traversal validation precedes driver
access. Node attachment streams convert to web streams at the OCFL transaction
boundary; the storage adapter converts web streams back to the driver's Node
stream contract. `createReadable`/`createWritable` expose the documented OCFL web
stream API; legacy Node stream methods remain available.

Node **26.11.1**, qualified toolchain bin on PATH:

```sh
# From packages/redbox-core
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/services/OniService.test.ts 'test/services/oni-v2/*.test.ts'
# From repository root
node packages/redbox-core/node_modules/typescript/bin/tsc -p packages/redbox-core/tsconfig.json
SR_ONI_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_oni \
node --test packages/redbox-core/test/qualification/oni.cjs
```

Core TypeScript exits **0**. Existing ONI suites plus one new traversal regression:
**83 passing / 0 failing / 0 pending**, exit **0**. Before the adapter fixes the
unchanged existing suites passed **82/0/0**, while the actual provider aggregate
failed. Two existing tests were changed with this specific justification: the
repository test now verifies web-stream type **and consumed attachment content**
instead of requiring Node-stream identity, and the store test distinguishes its
legacy Node method from its documented OCFL web method. No skip, timeout or
behavioral assertion was weakened. Formatter changes are incidental to those
files. No dependency changed.

Compiled aggregate on actual Mongo **8.0.34**, actual bundled Prisma storage,
Flydrive filesystem driver and actual OCFL implementation: **2 passing / 0 failing /
0 skipped**, exit **0**, **3655.730391 ms**. Both default-encoded and explicit-raw
layouts persist **10 files / 33 selected attachment bytes / 6 audit rows** each.
A held actual dataset write keeps application stop pending; completion persists
before pools close. Encoded/raw OCFL sentinel filenames are checked on disk. No
Sails/CoreService/comparison module enters the graph. Disposable database and
files are removed in finally. This is provider qualification, not a complete
production portal or broad-suite result.

Logs in `.tmp/sails-retirement/p7/`: `oni-build-complete.log`,
`oni-existing-qualified.log`, `oni-mongo-ocfl-qualified.log`. Focused lint has
**0 errors / 0 warnings**; formatting/diff checks pass. Earlier failed aggregates
exposed missing qualifier disk selection, the encoded-key fault, unsupported Node
stream input and a residual comparison context import. The compiler also rejected
a nonexistent static `Readable.wrap`; the implementation uses its instance API.
A premature invocation before compiler completion still loaded the preceding
adapter and is not counted as passing. The final aggregate follows completed
emission and passes its import check.

## Figshare mapping, storage and cache collaborators

`integrations/figshare/{config,context,bindings,metadata,assets,embargo}.ts` now
contain the shared algorithms behind explicit construction inputs. Publishing
configuration uses the existing neutral configuration resolver; brand lookups,
crosswalk resolution, storage disks/datastreams and logging are supplied. License
caches belong to a supplied instance map. Comparison globals and its separate
cache live in `compat/sails/figshare{Configuration,Helpers}.ts`; the existing helper
paths retain concrete callable delegates so current stub seams remain usable.
The facade and durable workers still need their own production wiring; this slice
does not claim to complete the Figshare provider or portal composition.

Node **26.11.1**, qualified toolchain bin on PATH:

```sh
# From packages/redbox-core
FIGSHARE_TEST_MONGO_URI=mongodb://127.0.0.1:29511/sr_p7_figshare \
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 15000 \
  'test/services/*igshare*.test.ts' 'test/services/figshare-v2/*.test.ts' \
  test/unit/figshare-persistence.test.ts
# From repository root
node packages/redbox-core/node_modules/typescript/bin/tsc -p packages/redbox-core/tsconfig.json
node --test packages/redbox-core/test/qualification/figshare-helpers.cjs
```

The unchanged existing suites report **293 passing / 0 failing / 0 pending**,
exit **0**, using actual Mongo **8.0.34** for queued work. Core build exits **0**.
The additional compiled aggregate uses actual Flydrive filesystem staging and the
actual Figshare HTTP client against a local receiver: **1 passing / 0 failing /
0 skipped**, exit **0**, **740.577416 ms** total. It verifies **2** license reads
for independent instance caches (repeat reads on one instance are cached), **1**
article metadata POST, **1** hosted upload with **39** exact bytes and awaited
response/cleanup, and **1** embargo write with a second idempotent observation.
Upload endpoints receive no API token; account endpoints receive the configured
test token. No Sails/CoreService/comparison import enters the standalone graph.
The receiver and disposable files are removed in finally. This aggregate does not
exercise crosswalk persistence, durable worker execution, records or shutdown;
existing provider/queued suites retain their respective coverage.

Final logs under `.tmp/sails-retirement/p7/`: `figshare-helpers-build-third.log`,
`figshare-existing-mongo-final.log`, `figshare-helpers-real-second.log`. Focused
format/lint and diff checks pass (**0 warnings / 0 errors**). No dependency or
existing test/assertion/timeout/skip changed. The initial no-Mongo invocation
reported **239 passing / 51 pending** and is not counted as Mongo qualification.
The first real-Mongo invocation was **292 passing / 1 failing**: an unchanged
error-path test performs brand lookup without a Sails owner, and the new warning
tried to read its log. The comparison boundary now supplies its existing no-op
logger in that case. Initial compile failures caught an overly broad crosswalk
output type, an unexported stream response type and widened development mode;
the final interfaces retain the actual contracts. The first new HTTP aggregate
incorrectly expected API credentials on upload URLs; it now verifies the actual
transport's credential isolation, while retaining the token assertion for account
URLs. That failed attempt is not counted as qualification.

## Figshare selected provider, durable workers and shutdown (2026-10-24)

The facade, administration, managed-asset, runtime, audit and worker algorithms now
live under `integrations/Figshare.ts` and `integrations/figshare/`. The old service
paths delegate; global lookup and the Sails shutdown hook are comparison-only in
`compat/sails/figshare{,Workers,Lifecycle}.ts`. `createFigshareProvider` constructs
one selected provider with explicit Records/repositories/queue/account/brand/type/
workflow/crosswalk/storage/audit/logger inputs and a per-instance license cache.
`FigshareWorkers` owns admission and accepted promises. Completion/failure audit
writes are awaited before a durable worker checkpoint closes. Production supplies
the admitted persistence scope; this does not yet wire the production portal.

Node **26.11.1**, Mongo **8.0.34**, Agenda **6.2.6**, the same Mongo image digest
recorded above, no dependency changes:

```sh
# Existing suite, from packages/redbox-core; qualified Node bin on PATH
FIGSHARE_TEST_MONGO_URI=mongodb://127.0.0.1:29511/sr_p7_figshare \
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 15000 \
  'test/services/*igshare*.test.ts' 'test/services/figshare-v2/*.test.ts' \
  test/unit/figshare-persistence.test.ts
# From repository root, after the successful core TypeScript build
SR_FIGSHARE_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_figshare_provider \
  node --test packages/redbox-core/test/qualification/figshare-provider.cjs
```

Final unchanged existing suite: **293 passing / 0 failing / 0 pending**, exit **0**,
18 seconds (`figshare-provider-existing-graph.log`). Compiled real provider
aggregate: **1 passing / 0 failing / 0 skipped**, exit **0**, body **2940.073351 ms**,
natural total **63544.738849 ms** (`figshare-provider-real-final.log`). Agenda's
passive lock-watchdog timer accounts for the remaining minute; no forced exit or
timeout reduction was used. It executes the real core `Figshare-SyncRecord` job
declaration, 120000-ms lock lifetime, Prisma Figshare store, bundled storage,
source-intent acknowledgment/CAS projection, actual ACL and local HTTP receiver:
**1 record create / 1 metadata PUT / 1 publish / 1 durable Agenda job / 2 audit
rows**, final status **synced**. A held HTTP response keeps drain pending. Native
post-close record reads verify article ID **51**, synced status, retained title/
ACL and advanced recordVersion/revision. Late admission is rejected and the
compiled import graph contains no comparison/CoreService/Sails module. Disposable
database/files/server are removed in finally. This is one configured job, not the
complete 16-job/schedule inventory. Workflow transition and attachment ports are
unused and throw; the preceding real helper aggregate covers file upload.

Core build, focused lint (**0 errors / 0 warnings**), Prettier and diff checks pass.
Logs: `figshare-provider-build-graph.log`, `figshare-provider-lint-final.log`,
`figshare-provider-format-check.log`, `figshare-provider-helpers-final.log` (helper
aggregate recheck passes). No existing tests/assertions/skips/timeouts changed.
The first worker run failed four existing cases because a comparison adapter
changed `.toPromise()` to `firstValueFrom` against existing `.toPromise()`-only
fixtures; the original boundary was restored, the run interrupted and its
disposable database dropped. A first compiled provider run found a pure helper
importing comparison configuration through the service barrel. Publish/writeback
now import the neutral config directly. Those failed runs are not qualification.

## Workspace and ORCID providers (2026-10-24)

The actual workspace association/HTTP, asynchronous job and ORCID algorithms now
live in `workspaces/{Workspaces,WorkspaceAsync}.ts` and `integrations/Orcid.ts`.
The original services delegate through comparison adapters. The owned worker
retains the admitted operation through all completion-status writes and supplies
explicit initialize/quiesce/drain/close operations. Dynamic service lookup and
Sails shutdown chaining remain only in the comparison adapter. Workspace request
logging no longer emits the entire configuration/header object. No dependencies
or existing tests changed.

Node **26.11.1**, real Mongo **8.0.34** on port **29511** (digest recorded above).
From `packages/redbox-core`, with the qualified Node directory on PATH:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 15000 \
  test/services/WorkspaceService.test.ts test/services/WorkspaceAsyncService.test.ts \
  test/services/OrcidService.test.ts test/extensions/*.test.ts
# From repository root, following the successful core TypeScript build:
SR_WORKSPACE_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_workspace \
  node --test packages/redbox-core/test/qualification/workspace-orcid.cjs
```

The unchanged selected existing suite passes **35 / 0 failing / 3 unchanged
pending** (Workspace 10/3 pending; WorkspaceAsync 8; ORCID 6; Extensions 11),
exit **0** (`workspaces-existing-final.log`). The three HTTP cases already use
`it.skip`; they are not qualification evidence. The separate compiled real
Mongo/HTTP aggregate passes **1 / 0 failing / 0 skipped**, exit **0**, body
**5594.020255 ms**, total **6452.031484 ms** (`workspaces-real-third.log`).
It executes **5 actual HTTP requests** (workspace POST/GET/PUT, paged ORCID
mapping, async work), persisted user/workspace association CRUD and population,
cold single-promise repeat behavior and association removal. Held async HTTP
keeps stop pending; status/message/time are persisted before pools close. The
compiled import graph has no Sails/comparison modules. Disposable state and HTTP
server are cleaned in finally. Record association CAS still needs the integrated
production-root run.

A first aggregate failed because its new user fixture omitted required email;
the fixture was corrected. The second exposed a real optional-argument defect:
`WorkspaceAsync.start` persisted omitted args as undefined into required J1 data.
It now normalizes `args ?? []`; the final qualifier retains omitted args. Earlier
compile errors on unknown actor inputs were fixed with an object-shape guard at
the typed Records boundary. Those failed attempts do not count as passes.
Core TypeScript build (`portal-data-build-second.log`), focused lint (**0 errors /
0 warnings**, `workspaces-data-lint.log`), format and diff checks pass. This is a
provider prerequisite, not a completed production host or SR-046 acceptance.
