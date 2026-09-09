# A03 registration and loader acceptance evidence

Audited and finalized on 2026-09-08 from clean HEAD
`f570fa9cd` in the existing worktree. A01 and A02 approvals and all existing
commits are preserved. Only A03 task checkboxes are reconciled here.

## Audit and changes

Most of A03 was already implemented. Inspection covered registration, queue and
built-in actions, hook discovery/helper types, loader generation and startup,
public declarations, the wiki loader instructions, and existing tests. No new
registration abstraction, dependency or shim format was needed.

Two gaps were corrected:

- `registration.ts` now preflights each original registration descriptor before
  copying it to attach provenance. Previously spreading invoked getters and
  erased non-enumerable fields before A02 validation. The existing bounded
  validator rejects those shapes, proxies and unsupported callables; only the
  direct `$.handler` function is permitted. Strict descriptor validation still
  applies after loader-owned provenance is attached. Limits are the existing
  action-contract limits, with the descriptor schema enforcing its more specific
  cardinalities. Registration exports remain trusted installed code, not a
  sandbox for arbitrary modules.
- `registeredActionQueue.ts` now declares its public payload interface explicitly
  instead of exporting an inferred Zod schema graph. Runtime parsing is unchanged.
  This removes three inferred `unknown` declaration nodes and their obsolete
  frozen-baseline entry. No new baseline allowance was added.

## Acceptance mapping

Paths below are relative to `packages/redbox-core` unless stated otherwise.

| A03 requirement                                | Implementation and executable evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Capability metadata and discovery              | `src/hooks/hookDiscovery.ts` recognizes `sails.hasActions`; `src/loader/index.ts:findAndRegisterActions` requires a direct named export. `src/hooks/defineRedboxHook.ts` exposes the synchronous `RegisterRedboxActions` contract. Loader tests cover the helper, named export plus default factory, rejected default-only exports, disabled capability and resolved `lib/actions.js` provenance.                                                                                                |
| Loader/hook documentation                      | Existing `support/wiki/Redbox-Loader.md`, under **Action registration**, documents package metadata, named exports, synchronous direct handlers, collision behavior and public metadata. It already satisfies A03; no wiki/submodule change is required. The original-descriptor rejection policy is recorded above.                                                                                                                                                                             |
| Core uses the same mechanism                   | `src/action-registry/coreActions.ts:registerRedboxActions` returns the 11 built-in registrations. Both discovery and the generated config shim pass core and hook sources through `actionRegistrationSource`/`buildActionRegistry`. Tests verify all core IDs and empty hook registration; the standalone builder also supports a truly empty registry.                                                                                                                                          |
| Descriptor/handler provenance                  | The loader derives hook module paths relative to the installed package, attaches package/module provenance, and retains direct handler identity in a private map. Tests assert both resolved and explicitly supplied source provenance. Core uses the stable module identity `action-registry/core-actions`.                                                                                                                                                                                     |
| Duplicate IDs and version consistency          | `buildActionRegistry` rejects same-version duplicates and differing versions separately. Tests cover hook priority reversals, same-source duplicates, core/hook collisions and version conflicts, including generated-shim startup. Priority never selects a winner.                                                                                                                                                                                                                             |
| Invalid, missing and asynchronous registration | Tests reject missing exports/handlers, null/object returns, thrown registration errors, invalid descriptor versions, hidden properties, getters, executable extra fields and string handlers. Generated-shim execution rejects both fulfilled and rejected async registration through existing coverage; the rejected-Promise case drains the rejection without leaking its private error message.                                                                                               |
| Read-only public metadata                      | `RedboxActionRegistry` reparses/detaches descriptors, freezes nested metadata and separates handler lookup from `descriptorMetadata`. Tests recursively verify frozen data and absence of functions, original-input detachment, immutable arrays and preserved direct handler identity. Serialization retains intentional descriptor provenance but excludes handlers and private registry state. Strict descriptors reject arbitrary internal fields.                                           |
| Deterministic registry and shims               | Metadata is sorted by code-unit action ID. Discovery sorts action hooks by package name regardless of priority. Reversing dependency insertion and priority produces byte-identical generated shim content; the second generation reports zero writes.                                                                                                                                                                                                                                           |
| Startup regression                             | Tests execute the actual generated config shim with the source package exports and real fixture hook modules. They assert metadata parity with discovery and reuse the same generated file after changing hooks to duplicates, conflicting versions, missing handlers/exports, malformed returns and thrown/rejected registrations. Each load fails synchronously. This characterizes the config-load validation used when generation is skipped, without claiming a full Sails deployment test. |
| Public type contract                           | `test/loader/actionRegistryLoader.type-test.ts` consumes fresh emitted declarations. Positive assertions cover core/hook registration and queue fields; expected errors cover async/string registrations, handler leakage and nested metadata/provenance mutation. Existing A02 and hook-helper public-consumer fixtures also pass.                                                                                                                                                              |

## Verification

Production and public declarations, from the repository root:

```sh
node_modules/.bin/tsc --noEmit -p packages/redbox-core/tsconfig.json
node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json --emitDeclarationOnly --declarationMap false
node_modules/.bin/tsc --noEmit --strict --skipLibCheck --module nodenext \
  --moduleResolution nodenext --target es2022 --types node \
  packages/redbox-core/test/loader/actionRegistryLoader.type-test.ts \
  packages/redbox-core/test/action-registry.type-test.ts \
  packages/redbox-core/test/hooks/defineRedboxHook.type-test.ts
npm run lint
```

Production checking, fresh emission and strict consumer checks pass.
A TypeScript AST scan of source and freshly emitted declarations for
`action-registry/{registration,coreActions,builtInActions,registeredActionQueue}`,
`loader/index` and `hooks/{defineRedboxHook,hookDiscovery}` found **zero explicit
any/unknown nodes in 14 files**. The global frozen baseline shrinks from 1,780 to
1,777 declaration nodes; its 5,403 legacy source nodes are unchanged. These
legacy allowances do not exempt the audited A03 surface.

Focused regression commands use this prefix from `packages/redbox-core`:

```sh
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config \
  --node-option=no-experimental-strip-types \
  --require ts-node/register/transpile-only --require chai --require ./test/setup.ts
```

Run these file groups separately with `--reporter dot`:

- `test/loader/actionRegistryLoader.test.ts test/loader/loader.test.ts test/loader/bootstrapShimRuntime.test.ts 'test/hooks/*.test.ts'`
- `test/action-registry.test.ts test/action-plan.test.ts test/action-registry-built-ins.test.ts 'test/action-execution/*.test.ts'`
- `test/services/AgendaQueueService.test.ts`

Results: **92 loader/hook, 116 action, and 25 queue tests passing (233 total)**.
Repository lint passes with zero oxlint warnings/errors, 23 security-guard tests
and seven type-surface-guard tests. The final test-project typecheck retains
**156 pre-existing diagnostics**. Starting and final compiler output have
identical file/code/message multisets after normalizing line/column positions;
no source was reset or substituted. The separate emitted-public-consumer
fixtures pass strict typechecking.

The initial combined invocation exposed existing global-fixture interference:
loader/hook cleanup removes `sails` before the built-in suite's setup. Isolating
the groups avoids that test-order dependency. No production change was made for
it. Running the new malformed-original-descriptor test with the starting
commit's registration module loaded in memory fails with “Missing expected
exception”; the current implementation passes. No worktree file was replaced
for that parent regression check.

No dependency installation, manifest change, lockfile edit or Angular change was
needed. Scoped Prettier and `git diff --check` pass. Docker, Bruno, browser and
live-service suites were not run; this is A03 acceptance evidence, not approval
of later tasks or the combined release gate.

## Independent-review correction (2026-09-08)

The acceptance above was incomplete: at `2d6160684`, returned collections were
still checked with `instanceof Promise` and iterated before protected descriptor
preflight. Getter-backed array elements could execute and be accepted; proxy
arrays could execute prototype traps and leak private errors; revoked descriptor
proxies could throw during classification. These were existing A03 acceptance
gaps, not regressions introduced by the original-descriptor correction.

The focused correction validates the collection envelope inside a sanitization
boundary before iterating descriptors. Native proxy detection precedes array
classification and reflection. Only dense arrays with the ordinary or null
prototype and enumerable own data elements are copied; accessors, hidden/extra
or symbol keys, custom iterators, sparse arrays and custom prototypes are
rejected without getters or traps. Collection length is bounded by the existing
`maxValidationWork` (50,000); per-descriptor graph limits and the approved direct
`$.handler` policy remain unchanged. As in the bounded validator, JavaScript's
atomic own-key enumeration itself cannot be incrementally budgeted.
Descriptor classification now follows its protected preflight, including for
revoked proxies. Frozen and null-prototype collections/descriptors remain valid.

Native Promise branding replaces prototype-based detection. Ordinary fulfilled
and rejected Promises, including async registration results, fail synchronously
with `asynchronous-action-registration`; intrinsic rejection handling drains
ordinary rejected Promises. Custom Promise properties/prototypes are never read
or invoked to drain rejections. Proxy-wrapped Promises are invalid collections.
Thrown registration failures and invalid collections/descriptors use sanitized
`invalid-action-registration` errors without retaining private causes.

The new `actionRegistryLoader.test.ts` regression exercises the direct builder
and the actual generated config shim against the same adversarial inputs. It
asserts zero getter/trap calls, bounded sanitized errors, revoked array and
descriptor proxies, proxy-wrapped Promises, hidden/symbol/custom iterator
properties, invalid cardinality/sparse returns, valid frozen/null-prototype
inputs, and Promise/async rejection semantics. Loading the starting commit's
registration module in memory makes this regression fail with the raw private
collection error; the corrected module passes. No tracked source was replaced
for this comparison.

Verification repeats the commands above, plus root production typechecking:
**93 loader/hook, 116 action and 25 queue tests pass (234 total)**. Core and root
production typechecks, fresh declaration emission, strict emitted-public
consumers, the strict 14-file A03 source/declaration AST scan (zero explicit
`any`/`unknown`), repository lint, 23 security-guard tests and seven type-surface
guard tests pass. Scoped Prettier and `git diff --check` pass. The test-project
parent/current diagnostic comparison uses a read-only compiler-host overlay of
`2d6160684`, normalizing only diagnostic positions: **156 parent / 156 current
diagnostics, identical file/code/message multisets; zero added or removed**.

Only this A03 evidence correction and the focused implementation/regression are
changed. No task checkboxes, dependencies, lockfiles (including Angular), wiki
submodule contents or unrelated edits are changed; all prior commits are retained.
