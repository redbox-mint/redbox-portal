# A05 — Harden JSONata and Handlebars execution

## Reconstructed state and scope

The starting worktree was clean at `d91ce43be`. History already contained the
expression runtime, worker, versioned projections, documentation and 11 initial
tests. There was no uncommitted A05 feature diff or A05 acceptance evidence.
Existing emitted declarations exposed 37 explicit `unknown` nodes, and the
worker protocol source contained three. A04 is accepted independently; this
change does not alter its implementation-plan status or redo its acceptance.

This change finishes the existing runtime. It does not replace the worktree,
change branches, remove commits, install dependencies, or change lockfiles,
Angular files, or the wiki submodule.

## Runtime contract and adversarial evidence

- **Fixed registries:** the managed JSONata registry installs only the shared
  `guessNameParts` and `luxonFormatDate` implementations. Names and installation
  now derive from one frozen registry. Handlebars derives its fixed allowlist
  from the shared pure helpers plus `emailList`; its installer removes ambient
  helpers. Evaluation accepts no bindings or helper registrations. Tests execute
  both JSONata functions and every allowed Handlebars helper, reject all
  prohibited helper forms and binding aliases/shadowing, and demonstrate that
  ambient helper registrations and extra evaluation options cannot inject code.
- **Helper options isolation:** Handlebars appends privileged runtime options
  even when authored arguments are missing. The adapter removes that object
  before invoking shared helpers. The three variadic helpers receive an inert
  sentinel for their documented trailing-argument convention. Tests cover
  missing arguments, subexpressions and block traversal, including the former
  `default null` route to runtime options.
- **Versioned contexts:** schema version 1 provides separate transition,
  parameter, text and prior-output projections. Selection omits server-owned
  objects and recursively excludes credential, token, request, response,
  environment, filesystem, service and prototype keys. The worker now validates
  strict purpose-specific shapes rather than accepting arbitrary extra fields.
  Conditions and value expressions also enforce their distinct purposes at the
  public runtime boundary. Prior-output projection selects own, requested fields
  from one validated prior binding; absent, duplicate, forbidden and excessive
  selections fail safely.
- **Property isolation:** bounded preflight precedes serialization and recursive
  protocol parsing. It rejects non-JSON capabilities, inherited custom
  prototypes, accessors, proxies, cycles and serialization hooks. The worker
  constructs objects with null prototypes and disables Handlebars prototype
  methods/properties. Tests cover inherited `toString`, quoted/bracket/slash
  prototype paths, computed lookup, function results and prototype-bearing
  result objects without invoking traps.
- **Execution limits:** workers recompile and check artifacts, so a forged AST
  count cannot bypass source validation. Source is bounded before normalization. Prepared artifacts also receive bounded
  preflight before property reads or worker transfer, rejecting oversized source,
  accessors and proxies without invoking traps.
  Both recursive JSONata and catastrophic native regex work are terminated by
  the worker deadline. Abort before startup reports interruption without a
  terminated worker; abort of an active worker reports interruption with
  termination. Deadline expiry remains `timeout`, including non-cooperative
  action Promise timeouts. Tests distinguish these outcomes.
- **Diagnostics:** a closed code vocabulary, fixed messages, bounded protocol
  parsing and frozen diagnostics prevent submitted source, context, values,
  library messages or causes from being returned. Error stacks contain only the
  fixed error name/message, without paths or private runtime frames. Tests cover
  library failures, hostile code strings, oversized diagnostic inputs and
  serialized diagnostic bounds.

| Limit                                  | Server-owned bound                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| JSONata / Handlebars source            | 8,192 / 16,384 UTF-16 code units, before and after normalization                             |
| AST nodes / depth                      | 2,000 / 64                                                                                   |
| Handlebars each blocks                 | 8                                                                                            |
| Input / result JSON bytes              | 262,144 / 65,536 UTF-8 bytes                                                                 |
| Input / result container depth         | 12 / 8                                                                                       |
| Array entries / object properties      | 100 / 100                                                                                    |
| Property-name length / validation work | 128 / 50,000                                                                                 |
| Evaluation time                        | Default 250 ms; integer override 10–2,000 ms                                                 |
| Worker startup                         | 5,000 ms, separately classified as worker startup failure                                    |
| Worker old / young generation / stack  | 32 / 8 / 8 MiB                                                                               |
| Diagnostic code                        | Closed vocabulary, at most 64 characters; serialized diagnostics tested below 256 characters |

Protocol envelopes additionally receive bounded preflight before Zod traverses
them. Tests include 10,000-level graphs, multibyte oversized strings, excessive
cardinality, oversized template output and deeply nested/oversized JSONata
results. Limits are rejection boundaries, not truncation of successful values.

## Destination contract

Handlebars remains a text-template engine. Escaping applies to the **entire**
rendered value, including administrator-authored literal text.

| Destination                                | Accepted use and tested behavior                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `plain-text`                               | Preserves text, including markup characters; only for plain-text sinks                     |
| `html-text`                                | Escapes the entire value for an HTML text node; literal markup is escaped too              |
| `email-subject`                            | Removes CR/LF boundaries and trims the result                                              |
| `url-component`                            | Encodes the whole component, including RFC 3986 reserved `!'()*` characters                |
| HTML attribute, full URL, JavaScript, JSON | Unsupported destinations are rejected at compilation, including calls bypassing TypeScript |

Do not insert plain text into HTML, use an HTML text result as an attribute or
script, or treat a URL component as a complete URL. JavaScript and JSON
construction require their own structured serializers; this runtime does not
offer code or JSON templates. Triple mustaches and raw-output extensions remain
forbidden for every destination.

## Verification

Commands run from the repository root unless indicated:

```sh
npm --prefix packages/redbox-core run build
node_modules/.bin/tsc --noEmit -p packages/redbox-core/tsconfig.json
node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json --emitDeclarationOnly --declarationMap false
node_modules/.bin/tsc --noEmit --strict --skipLibCheck --module nodenext \
  --moduleResolution nodenext --target es2022 --types node \
  packages/redbox-core/test/expression-runtime.type-test.ts \
  packages/redbox-core/test/action-registry.type-test.ts \
  packages/redbox-core/test/hooks/defineRedboxHook.type-test.ts \
  packages/redbox-core/test/loader/actionRegistryLoader.type-test.ts
npm run lint
git diff --check
```

The actual Node 24/Mocha setup uses this prefix from `packages/redbox-core`,
after the package build (workers load production JavaScript):

```sh
TS_NODE_PROJECT=test/tsconfig.json ../../node_modules/.bin/mocha --no-config \
  --node-option=no-experimental-strip-types \
  --require ts-node/register/transpile-only --require chai --require ./test/setup.ts \
  test/expression-runtime.test.ts test/workflow-transition/automatic.test.ts \
  test/action-registry.test.ts test/action-plan.test.ts \
  test/action-registry-built-ins.test.ts 'test/action-execution/*.test.ts' --reporter dot
```

Fresh declaration emission and strict public-consumer fixtures pass. A TypeScript
AST traversal of every expression-runtime source file and corresponding fresh
declaration finds **zero explicit any/unknown nodes in 18 files**. The global
frozen baseline removes only the three obsolete A05 entries: three source and
37 declaration nodes. Repository lint passes with zero oxlint warnings/errors,
23 security-guard tests and seven type-surface-guard tests.

Formatting is checked with Prettier on all expression-runtime source/tests,
this evidence, the implementation plan and the adjusted baseline. Production
typechecking/build and diff checks pass. Ignored build artifacts are freshly
generated rather than committed.

Full test-project compiler diagnostics are compared with a read-only TypeScript
compiler-host overlay of the starting commit's changed source/test files,
normalizing locations but preserving file/code/message multiplicity. The
existing test passed an action-parameter context to the condition evaluator;
it now uses the transition projection. No worktree files are substituted for
this comparison.

Final focused regression result: **149 passing** (24 expression-runtime,
nine automatic-transition and 116 action registry/plan/execution tests).
Compiler comparison: **156 parent / 155 final diagnostics; zero added and one
removed**, the corrected expression test described above. The remaining 155
diagnostics are existing test-project debt; they do not affect the passing
production build or strict emitted-public-consumer checks.

Local verification logs are under `.tmp/a05/`: `build.log`, `production.log`,
`declarations.log`, `consumer.log`, `ast.log`, `regression.log`, `lint.log`,
`format.log`, and `comparison.log`. The committed tests and commands above are
the reproducible acceptance evidence.

## Independent-review follow-up (2026-09-08)

The fix starts from the clean accepted commit `f05a0e5bb` (parent
`d91ce43be`), preserving its history and worktree. Runtime callers were inspected
in registered action execution, automatic transitions, and
`WorkflowTransitionService`, along with compilation callers in action planning,
legacy migration, and record-definition validation. Their public contracts do
not change.

The review identified three gaps in the original property-isolation claim:

- **Signal lifecycle:** options are read as own data properties. Signal member
  resolution rejects proxies and caller accessors without executing them;
  the native AbortSignal aborted getter remains supported. Listener functions
  are captured before worker startup. Registration errors terminate the worker
  and return the closed `expression-options-invalid` diagnostic. Cleanup errors
  cannot escape worker, timer, or abort callbacks; existing failures retain their
  classification, while otherwise successful execution reports a sanitized
  options failure. Worker handlers are installed before subscription, including
  synchronous abort/reentry, and aborted state is checked again after subscribing.
- **Prior-output selection:** bounded preflight now validates selector shape,
  cardinality, strings, own indices, and descriptors before selection. Numeric
  index traversal avoids caller iterators, and selected output values are read
  through own data descriptors after action-context validation. Sparse arrays,
  revoked proxies, getters, non-string selectors, and custom iterators fail with
  the closed diagnostic vocabulary. Ordinary and null-prototype selector arrays
  remain supported.
- **Serialization:** after bounded preflight, the runtime copies only own data
  properties into containers with null prototypes, including arrays. JSON
  serialization operates on that copy, protecting against non-enumerable
  inherited `Object.prototype.toJSON` and `Array.prototype.toJSON` functions and
  getters. Custom prototypes and own callable/accessor hooks continue to fail
  preflight. Primitive bigints are rejected before JSON serialization can consult
  `BigInt.prototype.toJSON`. No original hook or getter runs, and serialization
  exceptions retain the fixed context-invalid diagnostic.

Five additional adversarial test groups cover these boundaries, including
selected and unselected prior-output getters; option/signal accessors and revoked
proxies; registration and cleanup failures for both engines; and synchronous
abort, active abort, abort during subscription, timeout, and cleanup reentry.
Counters prove zero selector/option/signal-member getter or proxy calls and zero
inherited serialization-hook calls. Listener-method exceptions are intentionally
exercised and contained. Diagnostics remain bounded and omit private error text.

Final focused result: **154 passing**, preserving all 149 accepted tests.
Production build/typecheck, fresh declarations, strict public consumers, and the
expression-runtime AST scan pass (zero explicit `any`/`unknown` nodes across
18 source/declaration files). Verification uses the commands above; follow-up
logs are `.tmp/a05/fix-*.log`.

Final repository lint reports zero oxlint warnings/errors; all 23 security-guard
and seven type-surface-guard tests pass. Formatting and `git diff --check` pass.
A read-only compiler-host comparison against `f05a0e5bb` reports **155 parent /
155 final test-project diagnostics, zero added or removed**. Comparison against
`d91ce43be` reports **156 parent / 155 final, zero added and the same one removed
condition-context diagnostic documented above**. Existing test-project debt
remains separate from the passing production and strict consumer checks.
No dependency pins, lockfiles, Angular files, or unrelated files change.

## Second independent-review correction (2026-09-08)

This correction starts from clean `7ca17d32d` (parent `f05a0e5bb`). Both staged
and unstaged diffs were empty. The A05 spec/evidence and every compilation and
evaluation caller were inspected; no caller contracts or unrelated files change.

- **Native signal boundary:** Node 24 stores native signal state in discoverable
  symbols; its `aborted` getter is not a safe brand check. The runtime no longer
  invokes that getter. It requires the native prototype and own data descriptors
  for the native signal shape, rejects accessor/proxy payloads, and reads state
  through descriptors. Composite signals retain lazy-abort behavior through
  bounded intrinsic Set/WeakRef traversal, without caller iterators or getters.
  Existing subscription/cleanup handling and interruption/timeout classification
  remain intact. Tests cover forged native prototypes, inherited instances,
  revoked proxies, every native private symbol accessor, extra symbol accessors,
  poisoned composite iterators/references, ordinary and composite native signals,
  and composites whose source aborted before evaluation. Private getter/trap
  counters remain zero for both engines.
- **Artifact boundary:** before any artifact field read, the runtime requires a
  non-proxy ordinary or null-prototype object with exactly the required enumerable
  own data fields. It validates schema/engine, bounded nonempty string source,
  positive bounded integer AST count, and the Handlebars destination. This also
  rejects extra context fields. Null/undefined, primitives, arrays, missing fields,
  inherited/non-enumerable/accessor fields, symbols, proxies and invalid values
  consistently return the bounded engine-specific `artifact-invalid` diagnostic.
  No inherited engine getter executes or leaks its private message. Legitimate
  compiled artifacts and null-prototype copies still execute; structurally valid
  forged AST counts still reach independent worker validation.

Verification logs for this correction use `.tmp/a05/fix2-*.log`, with the same
build, focused/adjacent test, declaration, strict consumer, AST, repository lint,
security/type-surface guard, formatting and diff commands documented above.
Test-project diagnostic comparison uses a read-only compiler-host overlay against
both `7ca17d32d` and its parent `f05a0e5bb`, after build output is stable.

Final result: **156 passing** focused/adjacent tests. Production build/typecheck,
fresh declarations and strict public consumers pass. The AST scan reports
**zero explicit any/unknown nodes across 18 source/declaration files**. Repository
lint reports zero warnings/errors, with **23 security-guard and seven type-surface
tests passing**. Formatting and diff checks pass. Both compiler comparisons
report **155 baseline / 155 final diagnostics, zero added or removed**; these
remain existing test-project debt. No dependency manifests, lockfiles, Angular
files, or unrelated files changed.

## Third independent-review correction (2026-09-08)

This correction starts from clean `36da4cb98`. The governing A05 scope,
architecture, prior evidence, and all compilation/evaluation callers were read
before editing. It changes only the runtime, its adversarial tests, and this
evidence, preserving the existing branch and commits.

- **Cancellation normalization:** plain signal-like objects now fail with the
  engine-tagged `expression-options-invalid` diagnostic before any listener
  method runs or worker starts. The runtime accepts descriptor-validated Node 24
  signal state; this is safe structural normalization, not a claim that Node's
  mutable symbol fields provide an unforgeable native brand.
- **No EventTarget registration or cleanup:** the runtime never calls supplied
  or intrinsic listener methods on the supplied signal. It polls cancellation
  state every 5 ms and checks it before processing worker messages and deadlines.
  It never traverses nested event maps, listener lists, or dispatch hooks.
  Therefore modified nested event state can be safely left untouched, including
  changes made after evaluation starts. Cleanup clears only runtime-owned timers.
  Cancellation remains asynchronous, with polling subject to event-loop scheduling;
  worker execution still has its independent hard deadline.
- **Native behavior and bounds:** ordinary controllers, native timeout signals,
  and composite signals retain pre-start and active interruption semantics.
  Composite state uses intrinsic Set/WeakRef traversal with one shared budget of
  1,000 signal/reference visits and depth at most eight; signal shape validation
  permits at most 100 own keys. Invalid state discovered during polling terminates
  the worker and returns the bounded options diagnostic. Already-aborted signals
  report interruption without worker termination; active cancellation terminates
  the worker. A runtime deadline remains `timeout`, whereas cancellation by a
  native timeout signal remains `interrupted`.
- **Opaque reasons:** the native reason data field is never inspected, serialized,
  or used to classify cancellation. Ordinary, revoked, and callable proxies,
  accessor-bearing objects, bigint, symbols, and errors all remain valid reasons.
  Tests cover pre-aborted and active composite cancellation without reason traps.

The earlier synthetic-listener tests are replaced with zero-invocation rejection
assertions. Additional adversarial tests assert zero calls for modified event-map
methods, entry accessors/proxies, nested listener proxies, listener/dispatch
methods and symbol hooks, late event-state changes, and reason traps. Further
checks cover excessive composite traversal, late cancellation-state accessors,
and native signals with throwing listener methods reaching a genuine worker
timeout. Existing artifact, projection, serialization, helper, and limit tests
remain in the focused suite.

Verification uses the build, production typecheck, declaration emission, strict
public consumers, AST scan, focused/adjacent suite, and repository lint commands
above. Additional direct-caller coverage uses the same Mocha prefix with:

```sh
test/services/WorkflowTransitionService.test.ts \
  test/record-definition-validation.test.ts \
  test/loader/actionRegistryLoader.test.ts \
  test/legacy-actions/registered-legacy-actions.test.ts --reporter dot
```

Local logs use `.tmp/a05/fix3-*.log`. The read-only compiler-host comparison
uses `A05_COMPARE_REF=36da4cb98 node .tmp/a05/fix-compare.cjs`, preserving diagnostic
file/code/message multiplicity while ignoring source locations. It does not
replace worktree files.

Final execution results: **159 passing** focused/adjacent tests (34 expression,
nine automatic-transition, and 116 action tests), plus **94 passing** direct-caller
tests. The corrected typed non-native fixture also passes its targeted recheck
(**one passing**). Production build/typecheck, fresh declaration emission, and
strict public-consumer checks pass. The AST scan finds **zero explicit any/unknown
nodes in 18 source/declaration files**. Repository lint passes with zero warnings
or errors, **23 security-guard tests** and **seven type-surface-guard tests**.
Formatting and diff checks pass.

The final parent comparison reports **155 parent / 155 final diagnostics, zero
added or removed**. Existing test-project debt is unchanged. No dependency
manifests, lockfiles, Angular files, or unrelated files changed.
