# A01 implementation and finalization evidence

Audited on 2026-09-08 in the existing worktree, starting at
`b150e4b3d3e8f2f8d464c070ec64163cb57df9f6`, with a clean working tree.
No branch, worktree, dependency, runtime implementation, public declaration, or
Angular lockfile change is part of this slice.

## Acceptance audit

| A01 completion item                                             | Artifacts and verified evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Machine-readable inventory                                      | [Inventory](legacy-action-inventory.json), validated by the strict schemas in `packages/redbox-core/test/fixtures/legacy-record-actions/fixtures.ts`. `scan.baselineRevision` now explicitly identifies the historical denominator.                                                                                                                                                                                                                                                                                             |
| Every shipped expression has a proposed namespaced ID and owner | All 11 historical expressions have an action profile and mapping to `redbox.core.*`, owned by `@researchdatabox/redbox-core`. [Mappings](legacy-action-mappings.json) additionally cover the two fixture-only runner/queue expressions. Inventory tests reconcile identities, owners, contract versions, parameter shapes and mapping uniqueness.                                                                                                                                                                               |
| Mutation, replacement, side effects and nesting classified      | Each action profile records parameters, mutation, return, failure and ordering semantics; each occurrence records mode, phase, order, parent/nesting and option presence. `onNotifySuccess`, `runHooksSync`, and queued `triggerConfiguration` have separate behavior profiles. Coordinator tests verify replacement threading, response whitelist/mutation, detached overlap, ignored results, fail-fast behavior and malformed entries. Notification-log tests verify both direct mutation and persisted replacement.         |
| Phase/action order for all four modes                           | `test/action-execution/legacy-compatibility.test.ts` now checks two sibling actions in each of pre/postSync/post for create, update, delete and transition. Its persistence marker is a modeled boundary. `test/services/RecordsService.test.ts` separately exercises real service orchestration with storage doubles: create and chained postSync persistence, update, explicit target create/update, delete tombstone/removal/audit/search, and postSync replacement.                                                         |
| Transition detection and onTransitionWorkflow                   | Historical source at the baseline sets `transitionRequested` from explicit context or non-empty `nextStep`, not record mutation alone. Historical transition pre precedes ordinary pre; transition postSync follows ordinary postSync. Current service tests assert manual-target ordering/context, ordinary update without transition hooks, one automatic hop, trigger suppression, CAS and validation. A10 intentionally changed automatic detection; this is documented rather than presented as unchanged legacy behavior. |
| Unsupported/unknown negative fixtures                           | `unknown-expression.json` contains an unshipped service and computed property access to a known service. The registered migration test consumes both and requires `unknown-legacy-action`. Existing migration tests also reject malformed nested children, unsafe paths and unsupported options. The historical fixture diagnostic label is `unknown-legacy-action-expression`; current runtime migration uses `unknown-legacy-action`.                                                                                         |
| Migration-document linkage                                      | Architecture section 12 links the [migration inventory page](../../wiki/Legacy-Record-Action-Migration-Inventory.md), inventory and mappings. That page links representative config/database/negative fixtures and this evidence. Stale claims about unchanged legacy payload execution and current eval resolution were corrected.                                                                                                                                                                                             |

## Source reconstruction and automated counts

The baseline is `60aa2a07a777d6ffe6791eec4bf1ea3b621dda77`, an existing
ancestor containing the pre-migration configuration and characterization tests.
Read-only `git show` inspection covered `RecordsService`, its record-hook
coordinator, `TriggerService`, `EmailService`, `RDMPService`, and `DoiService`.
Current equivalents were inspected against architecture sections 7.4/7.5 and 12.
In particular, legacy templates mutate their option cache; notification logs
always return Promises; DOI publication performs separate writeback; workspace
linking mutates the isolated response; nested email callbacks launch without
awaiting completion; historical runHooksSync resolves first and runs children
sequentially against the same input. The historical eval resolver and runner
are absent/rejected in the current managed path.

`legacy-action-inventory.test.ts` now offers an explicit historical audit through
`A01_VERIFY_HISTORY=1`. It uses `git ls-tree` and `git show` against the pinned
baseline and compares full occurrence metadata, including exact line numbers.
It fails if that history is unavailable. Ordinary tests remain usable in source
archives/shallow clones without opting in.

| Scan                                         | Top-level | Nested | Total | Unique expressions |
| -------------------------------------------- | --------: | -----: | ----: | -----------------: |
| Historical source / historical inventory     |        26 |      6 |    32 |                 11 |
| Current source / active inventory projection |        24 |      6 |    30 |                 10 |

Both comparisons pass. Commit `8fd19b8fe` removed the two dataPublication
`transitionWorkflow` pre actions. The current projection removes these and
adjusts subsequent pre ordering; historical line numbers are checked only
against historical source. No active occurrence is silently exempted.

The denominator covers core configuration, redbox-hook-dev and bundled hook
configuration. Core and other bundled hooks contribute zero. A broader `rg`
search over tracked first-party source/configuration confirmed that the only
runtime record-hook expression literals occur in the dev hook (30); other
`function` fields belong to declarations, migration parsing, validation or user
hooks. The documented exclusions are generated/installed/coverage output,
test literals, documentation, and authentication hooks. No additional shipped
bootstrap RecordType fixture was found. Representative test fixtures are checked
separately, including distinct persisted default/secondary brand rows.

## Verification

From `packages/redbox-core`:

```sh
A01_VERIFY_HISTORY=1 TS_NODE_PROJECT=test/tsconfig.json \
  ../../node_modules/.bin/mocha --no-config \
  --node-option=no-experimental-strip-types \
  --require ts-node/register/transpile-only --require chai --require ./test/setup.ts \
  'test/legacy-actions/*.test.ts' test/action-execution/legacy-compatibility.test.ts \
  test/services/RecordsService.test.ts test/legacy-database-migration.test.ts --reporter dot
```

Result: **326 passing**, including the historical scan, fixture rejection,
current lifecycle integration and database migration tests. The historical scan
initially exceeded Mocha's two-second default; it now has a local 30-second
budget and passes. Tests print the existing mocked `Sails.after` warning.

From the repository root:

- `node_modules/.bin/tsc --noEmit -p packages/redbox-core/tsconfig.json`: passed.
- `npm run lint`: passed, zero oxlint warnings/errors; unsafe-expression guard and
  its 23 tests passed; explicit-type-node source/declaration guard and its 7 tests
  passed. The existing frozen baseline has 5,403 source and 1,780 declaration
  nodes; this slice adds no runtime/source or public-declaration `any`/`unknown`.
- Prettier check passed for the new/updated inventory, fixture, compatibility and migration tests and Markdown (the wiki page was explicitly checked with `--ignore-path /dev/null`). `RecordsService.test.ts` retains one pre-existing formatting issue at line 4432, confirmed against HEAD; its two A01 test-title corrections introduce no formatting differences. The unrelated call formatting was preserved.
- `git diff --check`: passed.

Test-project typechecking with
`node_modules/.bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.json` remains
blocked by 156 pre-existing diagnostics (duplicate Sails/service globals,
legacy compatibility helper types and other test errors). An in-memory TypeScript
compiler host read the original HEAD versions of the edited tests through
`git show`, without replacing worktree files. Baseline and final diagnostics
match after normalizing source positions; none were introduced by this slice.
The focused suite uses the repository's transpile-only test convention.

Full Docker/Bruno/browser/Angular and live external-service tests were not run:
this slice changes inventory, test evidence and documentation only. Production
compilation, focused service tests and lint are the applicable checks here;
this is A01 acceptance evidence, not an R03 deployment or full upgrade gate.
