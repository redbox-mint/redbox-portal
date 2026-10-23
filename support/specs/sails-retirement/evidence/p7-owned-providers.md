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
