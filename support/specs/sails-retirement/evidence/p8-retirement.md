# P8 retirement evidence

Work starts at `ad5c68d3b`, branch `stack/sails-retirement`, shared checkout.
No worktree, branch switch, push or publication. Wiki is an ordinary tracked
snapshot on this branch; the user explicitly confirmed that it must stay so.
SR-005/045/049's institution designation gap remains unchanged.

## SR-051 — Generated-file reconciliation (in progress)

The SR-001 `app-shims-before.json` was compared against the actual working tree:
245 files, all 236 generated files match their recorded SHA256 exactly; nine
application-owned files (three migrations and six environment modules) are
preserved. One application-owned migration has changed since the baseline.
The offline `support/migrations/retire-v5-shims.cjs` defaults to inspection and
requires a trusted manifest, exact digest and ordinary path. It preserves edits,
unknown files and symlinks. It never generates output or imports the application.

Actual commands:

```sh
node --test test/tooling/retire-v5-shims.test.cjs
node support/migrations/retire-v5-shims.cjs . support/specs/sails-retirement/evidence/app-shims-before.json --apply
PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH" npm --prefix packages/redbox-core run build
```

Cleanup regression: **1 passed / 0 failed / 0 skipped**, including inspect-only,
exact removal, edited output, symlink preservation and traversal rejection.
Initial cleanup rejected the manifest's old model-shim paths after removing
preceding exact matches. The command now validates every candidate before
mutation and includes those obsolete model paths; retry exits **0** and removes
the remaining exact matches. All 236 are absent and the nine owned files remain.
Logs/reconciliation details stay in ignored `.tmp/sails-retirement/p8/`.

Core clean build: Node **26.11.1**, npm **11.20.0**, Prisma generation/schema
verification/TypeScript/copy **exit 0**. Shim generator, generation templates,
public loader export and former entrypoint generation calls have been removed.
`app.js` and `app.integrationtest.js` delegate to the sole Express executable.
Consumer tests/tooling conversion remains in progress; no P8 checkbox is claimed.

## Qualification status

No final P8 artifact or broad-suite result has yet been obtained. Earlier P7
results are historical inputs, not post-removal proof. Runtime, test/tooling,
documentation and final clean-artifact closure are still in progress.
