Pinned review: **four introduced A/P2 findings remain**. Concurrent working-tree edits were excluded.

**Standards:** No additional non-tooling documented violations or actionable baseline smells found. Exact dependency pins comply.

**Spec/correctness:**

1. **A/P2 — Nested export conditions reject valid hooks.** [v6-checks.ts:43](/home/andrew/src/github/redbox-portal/packages/redbox-dev-tools/src/utils/v6-checks.ts:43) returns immediately for a matching condition even when its nested conditions have no match. For `{node:{require:"./index.cjs"},default:"./index.js"}`, Node’s import resolver selects the default; the pinned checker returns false. Distinguish unmatched conditions from explicit `null`, preserving null masking. This confirms the parent’s suspicion.

2. **A/P2 — Public export patterns are rejected.** [v6-checks.ts:50](/home/andrew/src/github/redbox-portal/packages/redbox-dev-tools/src/utils/v6-checks.ts:50) only selects an exact key. With `redbox.extension="./extension"` and `exports={"./*":"./dist/*.js"}`, Node resolves `./dist/extension.js`, but preflight rejects it. Support pattern resolution. The [public-export contract](/home/andrew/src/github/redbox-portal/support/specs/sails-retirement/extensions-v6.md:3) does not require exact keys.

3. **A/P2 — Invalid encoded export targets pass preflight.** [v6-checks.ts:30](/home/andrew/src/github/redbox-portal/packages/redbox-dev-tools/src/utils/v6-checks.ts:30) accepts `./dist/%2e%2e/%2e%2e/outside.js`; Node rejects it with `ERR_INVALID_PACKAGE_TARGET`. Consequently, the advertised runtime-export check passes a declaration that cannot load. Validate decoded segments according to Node’s rules. Read-only probes against the pinned function and Node’s resolver reproduced all three discrepancies.

4. **A/P2 — Vocabulary migrations skip normalization.** WSU [migration-data.ts:55](/home/andrew/src/bitbucket/redbox-hook-wsu-v6/src/migration-data.ts:55) uses `prepareVocabulary` before a raw `$set`, bypassing entry normalization. Pending September 1 migrations can change a legacy value to `Open` while retaining its old `valueLower`. An in-memory port probe reproduced this; [notation lookup](/home/andrew/src/github/redbox-portal/packages/redbox-core/src/persistence/vocabulary/selections.ts:28) then misses the new value. Baseline Waterline `beforeUpdate` recomputed `valueLower`. Use the normalized repository update, preserving the [compatibility contract](/home/andrew/src/github/redbox-portal/support/specs/sails-retirement/design.md:34).

No new B findings or further view/publication/dependency regressions verified. No files edited, Docker used, agents spawned, or full suites run.
