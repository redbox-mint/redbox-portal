# A02 contract finalization evidence

Audited in the existing worktree from clean HEAD
`6978c5c3355d170c7ea8c9b6519bcb7a8882b2ae` on 2026-09-08. A01 remains independently
approved. This slice adds acceptance tests and reconciles only A02 in the plan;
the original finalization changed no runtime implementation, dependencies, lockfiles, or other tasks.
The independent-review correction below supersedes its preflight guarantee.

## Acceptance audit

Paths below are relative to `packages/redbox-core`.

| Completion item                                            | Source and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolated, strongly typed public contracts; no bypass casts | `src/action-registry/{contracts,identifiers,limits,index}.ts` define/export the contracts. `src/index.ts` exposes `ActionRegistry` and `RegistryActionDefinition`. Public validators expose `RuntimeValidator<T>` rather than inferred Zod validator internals. `test/action-registry.type-test.ts` imports the emitted package entry point, checks validator types, exhaustive result/patch narrowing, branded IDs, and expected compile failures for invalid payloads, secrets and UI fields.                                                                                                           |
| Descriptor metadata                                        | `actionDefinitionSchema` requires namespaced ID, positive integer contract version, provenance, direct handler function, contexts, modes, phases, repetition permission, parameter/output schemas, result contract and policy bounds. Provenance rejects upward traversal; duplicate scope values and inconsistent transition context/mode are rejected. Existing registry/plan tests cover applicability, duplicates and repetition; new nested-boundary cases cover provenance, schemas, fields, patch constraints and policy objects.                                                                  |
| Binding metadata                                           | `actionBindingSchema` requires derived ID, stable key, action ID/version, explicit scope, parameters and integer order; dependencies and policy overrides are optional strict objects. `deriveStableActionBindingId` hashes length-prefixed record-type/scope/action/version/stable-key identity, excluding order. Collection validation checks collisions, duplicate orders, repetition, earlier same-attachment dependencies and declared safe output references. Registry tests cover identities/order; plan tests cover missing, forward, cross-attachment, unsafe, mistyped and cyclic dependencies. |
| Runtime validators and unknown-field rejection             | Strict object schemas plus getter/proxy/cycle/prototype-safe bounded preflight protect descriptor, binding, context and result entry points. The new metadata matrix verifies nested descriptor and binding boundaries, including retry schedules and forbidden secret values. Existing tests verify unknown descriptors, result branches, unsafe patches, getters and JSON limits. Arbitrary keys are allowed only inside explicitly declared JSON data maps, not metadata envelopes.                                                                                                                    |
| Required, exact contract versions                          | Descriptor/binding versions are positive bounded integers, with no coercion or range semantics. `validateActionBindingForDefinition` compares with `!==`. New tests reject omitted, string, zero, negative, fractional and excessive versions, accept equal versions and require the specific mismatch error for differing valid versions. Schema versions are separate literal `1` contracts; new tests reject future descriptor/binding/parameter/output-schema versions.                                                                                                                               |
| Closed result/patch unions                                 | Results discriminate on `kind`: `no-change`, `patch`, `replace`, `reject`. Patch operations discriminate on `op`: `add`, `replace`, `remove`; each object is strict. Patch paths reject malformed pointer escapes/prototype properties and must fall within descriptor prefixes. Descriptor validation requires patch constraints exactly when patch is allowed. Registry tests cover result payloads, patch operations, and every lifecycle/transition mode and phase; emitted type tests exhaust both unions.                                                                                           |
| Controlled parameter vocabulary and UI                     | Strings (including multiline values through bounded `ui.rows`), finite numbers, booleans, enums, bounded arrays of controlled item kinds, object JSON, JSONata, Handlebars and write-only secrets are implemented. UI hints are limited to placeholder/helpText/rows; no arbitrary Formly configuration or executable expressions. New tests verify multiline values, row bounds and rejected executable UI fields. Existing tests cover all kinds, defaults, constraints, enum membership, required parameters and array size/depth/byte boundaries. Actual UI conversion belongs to later UI slices.    |
| Secret metadata only                                       | Descriptors require `writeOnly: true`; persisted bindings contain only `{ kind: 'secret', configured: boolean }`. Defaults/raw values are forbidden, verified at runtime and through emitted types. `ResolvedActionSecret` is a separate handler-only reveal/redacted-serialization interface; storage/provider behavior is outside A02.                                                                                                                                                                                                                                                                  |
| Outputs and curated context                                | Output fields have declared primitive/JSON kinds, required flags and a unique safe-field subset. Definition-aware result validation rejects missing required, undeclared and mistyped output. Context includes explicit execution/brand/record/scope/actor/transition/prior-output data; parsing deeply freezes it. Tests cover transition coherence, safe prior outputs, nested prototype keys, aggregate bytes and 64-field maximum.                                                                                                                                                                    |
| Explicit safe defaults/maximums                            | `limits.ts` and `action-execution/policy.ts` are the authority. Default bounds: timeout 30,000 ms, minimum 100, maximum 60,000, retries disabled. Absolute execution caps: timeout 600,000 ms, five attempts, retry delay 60,000 ms. Descriptor bounds can narrow these. Tests cover invalid defaults and timeout/retry overrides; new cases cover strict policy metadata.                                                                                                                                                                                                                                |
| Positive and negative tests                                | `test/action-registry.test.ts`, `test/action-plan.test.ts`, `test/action-execution/*.test.ts` and the new public type fixture provide executable evidence. No casts to `any` or `unknown` were added.                                                                                                                                                                                                                                                                                                                                                                                                     |

## Limits and scope reconstruction

The schema constants explicitly cap IDs (action 128, binding 64, ordinary 128,
parameter name 64 characters), parameters/output fields (64), dependencies (32),
array items/enum options/patch operations (100), JSON depth (8), JSON bytes
(262,144), structural depth (16), contract bytes (16,777,216), validation work
(50,000), and diagnostic count (100). Literal strings are capped at 32,768,
JSONata at 8,192 and Handlebars at 16,384 characters. UI rows are 2–20.
Versions/order have integer maximum 2,147,483,647. Plans additionally cap bindings
at 256. Contexts cap prior outputs at 32 and actor roles at 64.

The runtime execution report in `action-execution/types.ts` describes legacy
execution telemetry; it is distinct from the closed registered-action result
union in A02. Likewise, the legacy execution-policy parser is not the managed
binding boundary: managed bindings use the strict A02 override schema and
semantic descriptor bounds. This audit does not redesign those older APIs.

## Verification

From `packages/redbox-core`:

```sh
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config \
  --node-option=no-experimental-strip-types \
  --require ts-node/register/transpile-only --require chai --require ./test/setup.ts \
  test/action-registry.test.ts test/action-plan.test.ts \
  'test/action-execution/*.test.ts' --reporter dot
```

Result: **99 passing**. The three new runtime tests extend existing coverage;
there was no runtime behavior change needed for the audited A02 requirements.

From the repository root:

```sh
node_modules/.bin/tsc --noEmit -p packages/redbox-core/tsconfig.json
node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json --emitDeclarationOnly --declarationMap false
node_modules/.bin/tsc --noEmit --strict --skipLibCheck --module nodenext \
  --moduleResolution nodenext --target es2022 --types node \
  packages/redbox-core/test/action-registry.type-test.ts
npm run lint
```

Production checking, declaration emission and the strict public-consumer fixture
passed. The consumer uses freshly emitted `dist/index.d.ts`; `skipLibCheck`
matches the project's dependency-declaration convention, while its own positive
and expected-negative assertions are checked strictly. An AST inspection of the
four A02 registry modules, execution types/policy, runtimeValues and
boundedValidation, in both source and fresh declarations (16 files), found **zero
explicit any/unknown type nodes**. No runtime/source or public declarations were
changed relative to the parent.

Repository lint passed with zero oxlint warnings/errors, the unsafe-expression
security guard and its 23 tests, and the explicit-type-node guard and its seven
tests. The global frozen baseline remains 5,403 source and 1,780 declaration
nodes. This global allowance is not an A02 exemption: the scoped A02 AST scan
above is zero. In particular, the pre-existing registered queue's inferred
`unknown` declaration nodes belong to its separate implementation, not the A02
contract surface, and were not modified or newly exempted.

The full test-project typecheck still reports **156 pre-existing diagnostics**.
An in-memory TypeScript compiler host compared the starting commit's test source
with the final source, excluding the newly added fixture only from the parent.
Both runs produced exactly the same 156 file/code/message diagnostics after
normalizing positions; no worktree files were replaced. These include duplicate
Sails/service globals, legacy test typing issues and a test rootDir issue. The
focused suite follows the repository's transpile-only convention; the new
public-consumer fixture separately passes strict typechecking.

Prettier passed for the audited A02 registry modules, execution types/policy,
both changed/new test files and this evidence/plan. `git diff --check` passed.
No dependency installation or Angular lockfile edit was needed. Docker, Bruno,
browser, live-service and full repository formatting runs were not performed:
this acceptance slice changes tests/documentation only. This is A02 evidence,
not approval of later tasks or the initiative's release gates.

## Independent-review bounded-validation correction

Reviewed from `12a040ea35e48d7428cd2fbcbda867106a330538`. The previous preflight
inspected hidden descriptors but skipped their values, allowing downstream Zod
to read uninspected output graphs. Regression tests against that commit reproduce
the throwing getter and hidden-field acceptance.

`src/boundedValidation.ts` now rejects non-enumerable own properties except an
array's intrinsic `length`, symbol keys, non-index array properties, and
prototype-related names. It rejects these unsupported shapes before downstream
validation, including hidden known fields and hidden unknown fields; strict
schemas still enforce ordinary unknown metadata fields. Enumerable JSON data
maps, parsed/frozen values, null-prototype objects, and descriptor handler
functions remain supported. Existing byte, string, depth, cardinality and work
limits are unchanged. Own-key cardinality is checked before descriptor traversal;
JavaScript's atomic own-key enumeration itself cannot be interrupted by the
traversal work budget.

The caller audit covered registry contracts/identifiers/plans/queue/migration,
expression runtime/worker, automatic transitions, record-definition domain and
validation/migration, and administration/draft/publication/seed/coordinator
services. They use preflight before schema validation or data reads. The shared
rejection policy closes the same hidden-field gap across those callers. The
record-definition test that previously expected hidden secret values to be
stripped now expects rejection; its valid-input detachment assertion remains in
a separate test. No unrelated task status or dependency/lockfile changed.

Correction verification uses the focused command above plus
`test/expression-runtime.test.ts`, `test/workflow-transition/automatic.test.ts`,
`test/record-definition-contracts.test.ts`, and
`test/record-definition-validation.test.ts`: **184 passing**. Production typechecking, fresh
public declaration emission, the strict A02 public-consumer fixture, repository
lint/security/type-surface guards, scoped formatting and `git diff --check`
passed for this correction. A02 source and emitted declarations retain zero
explicit any/unknown type nodes; the existing global baseline is unchanged.

## Second independent-review correction: callable values

Continued from `fbacf0776410ad45a9d77f0dbc6e9129f36c1dbd` in the existing clean
worktree. This correction supersedes the earlier claim that skipping function
properties was safe. Functions were skipped in object traversal and treated as
scalars in arrays/root inputs, allowing Zod diagnostics to inspect hostile
callables.

Preflight now visits every own enumerable data value, independently of whether
JSON serialization would omit it. Functions are rejected by default. Only
`actionDefinitionSchema` and `parseActionDefinition` opt in, and only for the
exact `$.handler` path. All other action contract validators (including nested
JSON, output, result, binding, context and parameter validators) retain the
function rejection policy; no Zod schema was weakened.

Permitted handlers must be non-proxy functions with the intrinsic ordinary or
async function prototype. Own metadata is limited to data properties named
`length`, `name`, `prototype`, `arguments` and `caller`, with checked value shapes.
An own instance prototype must be an ordinary non-proxy object containing only
a data `constructor` reference back to the function. This preserves ordinary,
arrow, async, bound, method and frozen handlers. Accessor metadata, custom
properties/prototypes, generator prototypes and callable/revoked proxies are
unsupported. Handler bodies are never invoked during validation; this is a
property-inspection guarantee, not a guarantee about executing handler code.
The policy assumes the process's intrinsic prototypes are trusted.

Proxy detection precedes function reflection. Function descriptor reads are
capped at five plus one constructor descriptor; prototype chains are never
walked. As with the existing object policy, JavaScript's atomic own-key
enumeration cannot be interrupted or allocation-bounded by the traversal work
budget. The correction does not claim a hard bound on that engine operation.
Existing serialization byte accounting is preserved, including omitted values.

The caller/schema audit covered every preflight call: action contracts,
identifiers, plans, queue and legacy migration; expression runtime and worker;
automatic transitions; record-workflow domain, definition validation and legacy
database migration; and administration, draft, publication, seed and record-action
coordinator services. Their preflight inputs are data graphs, except descriptor
handlers. Registry lookup/execution handlers are separate from serialized plan
inputs, and resolved-secret methods are separate from persisted contracts, so
neither needs a broader exception. Automatic-transition configuration preflights
its selected transition/hook subtrees, not unrelated record-type properties.

Adversarial tests cover throwing function `length`, `name`, `prototype` and
extra-property accessors, an accessor-backed instance `constructor`, custom
function/prototype proxies, callable get/reflection traps and revoked callable
proxies at root, object and array positions. Both result `safeParse` and
`parseActionResult` reject nested `output.fields.x` cases with zero accessor/trap
calls; the parser reports `ActionContractValidationError`. Tests also exercise
shared preflight, record-definition and automatic-transition validators, and
expression context validation before serialization. Compatibility tests retain
handler identity and verify validation does not execute handlers.

Verification: the focused action/plan/execution, expression, automatic workflow
transition and record-definition contract/validation suites pass with **187
passing**. Production typechecking, fresh declaration emission, the strict public
consumer fixture and the scoped AST scan pass (**16 source/declaration files,
zero explicit any/unknown nodes**). The test-project typecheck still has exactly
**156 pre-existing diagnostics**: normalized file/code/message multisets before
and after are identical. Test-only hostile-input typing does not affect the
runtime or public type surface. Repository lint/security/type-surface guards pass (zero oxlint warnings/errors,
23 security-guard tests and seven type-surface-guard tests; frozen baseline
unchanged). Scoped Prettier and `git diff --check` pass. Loading the starting
commit's two runtime modules in memory makes both new adversarial tests fail:
unsafe handlers are accepted and expression serialization executes a caller
read. No worktree source was replaced for this regression check. No dependency,
lockfile, Angular lockfile or unrelated task changes are included.
