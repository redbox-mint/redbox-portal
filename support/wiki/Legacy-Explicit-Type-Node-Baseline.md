# Legacy Explicit Type-Node Baseline

Run `npm run lint:explicit-type-nodes` to reject new explicit TypeScript `any` and `unknown` nodes in authored production source and emitted public declarations.

The source scan covers tracked TypeScript in `api`, `config`, `typescript`, package `src` directories, and Angular project `src` directories. Test directories, `*.test.*`, `*.spec.*`, and Angular `test.ts` entry points are deliberately excluded: test-only typing is not a release blocker. The declaration scan performs an isolated in-memory emit from `packages/redbox-core/tsconfig.json`; it never trusts an existing `dist` directory.

The authoritative legacy baseline is [explicit-type-node-baseline.json](../security/explicit-type-node-baseline.json). Existing debt predates this gate and is too broad to replace safely in an unrelated security fix. Each entry therefore freezes one file's exact AST finding multiset using separate `any`/`unknown` counts and a content fingerprint. A new file, an added or substituted node, a removed node, or a renamed file fails until the baseline is explicitly reconciled in review.

The baseline is a temporary compatibility inventory, not permission to use these types in new work. Replace legacy nodes with bounded domain types or validated runtime-value types, then regenerate and review the smaller baseline. `TYPE-SAFETY-LEGACY-BASELINE` tracks this repository-wide cleanup seam.

The gate is intentionally syntactic. It identifies explicit keyword nodes and declaration-emitter output; it does not claim that TypeScript inference, third-party declarations, or runtime input is safe. Production compilation and boundary validation remain separate required checks.
