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
