# R25 independent Standards review

**NEW A/P1/P2: 0.** No actionable documented-standard violation or baseline smell verified; no additional B finding.

Pinned comparisons:

- Portal `8b049580db7f3ef340c06a94b68b5bfa3930ca01...a4089ad238f78ca0d0f5b9227a61f8fd5ecf8061`.
- Converted WSU `14ab99eb3a89434b9c886d51d5edc37447f43588...8dd61118eed9582be8d4d01359677b9be4dba631`.

Read both repositories' AGENTS.md first, then [Coding Standards and Conventions](../../../../wiki/Coding-Standards-and-Conventions.md), [CONTRIBUTING.md](../../../../../CONTRIBUTING.md), R18–R24 reports and relevant retirement contracts/institution evidence. Exact commit lists were inspected. Concurrent WSU storage/configuration remediation is excluded from these pinned comparisons.

The standards pass covered extension export resolution/preflight, WSU registration and composition, migration ports, service/handler/view conversion, build/CI/development entrypoints, qualification drivers, regression hunks and changed guidance. Git confirms no executable portal `packages/*/src` changes since R20 and no WSU `src` changes after its R20 fix within these pins. No concrete failing case justified reopening the settled resolver, 25 migrations, HTTP, default clean-clone/CI/development or documentation reviews.

Repository overrides were applied: WSU retains the core compatibility anchor, hook-owned runtime dependencies and shared `run-hook-tsc`/`run-hook-mocha` launchers; local package references are permitted. Explicit composition/migration adapters implement the documented contracts, so their forwarding alone is not an actionable Middle Man smell. Tool-enforced formatting, compiler and dependency checks were excluded from findings. No hunk warranted a cited hard-rule violation or quoted smell finding.

Verification was static, using read-only Git inspection and TypeScript-printer normalization of migration diffs to distinguish substantive edits from formatting. No suites, builds, database probes or Docker resources were run; historical qualification is not claimed as fresh evidence. Only this report was written. No runtime, tests, task ticks, original/sibling hooks or GraphQL specification files were modified; no agents, commits, pushes, publications or tags were created.
