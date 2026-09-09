# Legacy Unsafe Expression Boundary

Run `npm run lint:unsafe-expressions` to scan Git-tracked first-party JavaScript and TypeScript for direct builtin `eval` calls and Lodash `template` calls reached through imports, `require`, simple aliases, or the legacy Sails `_` global.

Managed record/workflow actions use the bounded runtime described in [Managed Record Expressions and Templates](Managed-Record-Expressions-and-Templates.md). Managed action, expression-runtime, coordinator, and workflow-transition source paths cannot be allowlisted. The guard also excludes tests, documentation tooling, dependencies, compiled output, and coverage output while continuing to scan first-party assets and production files with test-like names.

The authoritative inventory is [unsafe-expression-allowlist.json](../security/unsafe-expression-allowlist.json). Each entry identifies one legacy call site by kind, repository path, whitespace-normalized call-expression fingerprint, owner, rationale, and follow-up identifier. A changed or added call is unexpected; removing a call makes its entry stale. Either condition fails the guard until the JSON manifest is reconciled in review.

Exact generated or vendored asset exclusions live in [unsafe-expression-source-exclusions.json](../security/unsafe-expression-source-exclusions.json). Directory exclusions and globs are not accepted. First-party asset scripts remain in scope.

This guard is intentionally a bounded syntax check, not a JavaScript abstract interpreter. It does not claim to prove arbitrary runtime provenance, dynamically resolved module names, non-Lodash template engines, or `Function` construction safe. Broader expression execution remains subject to ordinary security review. Replace one allowlisted legacy surface at a time, retain compatibility evidence, and then delete its manifest entry.
