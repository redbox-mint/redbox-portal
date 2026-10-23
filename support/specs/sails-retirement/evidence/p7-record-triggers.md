# P7 production prerequisite: owned record triggers

Source `403d97d55b804470e511b4fcc51a0f97578be902`, Node **26.11.1**, npm
**11.20.0**. No dependency changed. This is another concrete production-composition
prerequisite removed; it does not qualify a complete Express portal or close any
P7 checkbox.

The bundled development hook configures RDMP template, counter, permissions,
attachment-size and workspace operations. Their existing implementation is now
`src/records/RecordTriggers.ts`, with explicit configuration, logger, repositories,
queue, effective-user, translation, configured-operation and workspace inputs.
The public `redbox-core/record-triggers` export loads this domain directly.
`services/RDMPService.ts` exports the comparison adapter from
`compat/sails/recordTriggers.ts`; only that adapter resolves legacy globals/names.
There is one implementation of the trigger behavior.

Two defects found during production wiring were corrected:

- `queueTriggerCall` previously returned `of(record)` immediately after launching
  an unobserved queue Promise. It now returns a cold Observable that awaits the
  actual submission, propagates rejection, and shares the first result/error
  across subscriptions to the same call. The owning Agenda implementation retains
  accepted workers through shutdown.
- Counter and record templates previously replaced configuration strings with
  compiled functions. Compilation now uses a local value, allowing the finalized
  immutable startup snapshot. Record templates receive the explicit helpers
  `moment`, `numeral`, `convertToType` and Lodash's existing `_`; private dependency
  inputs are not exposed as template imports. Configured queued operations are
  resolved by the supplied binding rather than evaluated in the domain.

## Executed verification

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
node node_modules/typescript/bin/tsc -p packages/redbox-core/tsconfig.json
node node_modules/prettier/bin/prettier.cjs --check \
  packages/redbox-core/src/records/RecordTriggers.ts \
  packages/redbox-core/src/compat/sails/recordTriggers.ts \
  packages/redbox-core/src/services/RDMPService.ts \
  packages/redbox-core/test/qualification/record-triggers.cjs
node node_modules/oxlint/bin/oxlint \
  packages/redbox-core/src/records/RecordTriggers.ts \
  packages/redbox-core/src/compat/sails/recordTriggers.ts \
  packages/redbox-core/src/services/RDMPService.ts
```

TypeScript emission **exit 0**; focused formatting passed and lint returned
**0 warnings / 0 errors**. Build log:
`.tmp/sails-retirement/p7/record-triggers-build-final.log`.

From `packages/redbox-core`, with the absolute Node-26 toolchain bin prepended:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --require chai --require test/setup.ts --timeout 5000 \
  test/services/RDMPService.test.ts test/services/RDMPLogging.test.ts
```

The **83 unchanged existing tests passed / 0 failed / 0 pending**, exit 0,
about three seconds. No existing test/assertion/timeout changed. An initial focused
invocation accidentally selected the shell's Node 24 because its toolchain path
was relative to the core directory; that run also passed 83 but is not the Node-26
qualification. The corrected command emitted `v26.11.1` before running. Final log:
`.tmp/sails-retirement/p7/record-triggers-existing-node26.log`.

From the repository root:

```sh
SR_RECORD_TRIGGERS_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_record_triggers \
  node --test --test-reporter=tap packages/redbox-core/test/qualification/record-triggers.cjs
```

The compiled narrow graph, with global Sails absent, passed **1 aggregate / 0
failed / 0 skipped**, exit 0, without force-exit. Test duration **1337.16819 ms**;
process duration **6793.130568 ms**. MongoDB **8.0.34 / FCV 8.0**, using the same
owned Docker fixture/image documented in P7. Log:
`.tmp/sails-retirement/p7/record-triggers-mongo-qualified.log`.

The aggregate actually persists a brand/user, resolves contributor permissions
through the canonical identity repository, increments the real counter twice,
uses frozen record/counter template configuration, verifies private input is not
a template import, submits one actual Agenda job and delays completion after its
durable write. Repeated subscription does not duplicate submission. It holds a
real accepted worker during stop and verifies stop waits for its final persisted
result, then reports zero pools/Prisma clients and refuses new work. Queue failure
propagates and an undeclared operation string is rejected by the explicit binding.
The loaded graph excludes CoreBase/CoreService/Sails/comparison imports.

Harness-development failures were a wrong storage-runtime import and a synthetic
non-ObjectId brand value. The latter correctly failed through the storage boundary;
the final test creates a real brand and uses its canonical ID. Both failed runs
cleaned their disposable database/clients and are not counted as qualification.
The final run also dropped its owned scratch database and closed its native client.
This test does not configure workspace operations and claims no standalone
workspace integration coverage; the unchanged comparison suite covers delegation.

The source-58 clean packages/image and released-v5 recovery remain scoped to their
recorded source. They do not qualify this later trigger source as a complete portal.
