No new class-A P1/P2 merge blocker or material documented coding-standard violation was verified at `547370ac8` against `a49366803`. No speculative refactor or tooling-enforced issue is reported.

**A/P3 documentation notes (two groups):**

- `support/specs/sails-retirement/tasks.md:3,11,21,884`: 51/55 checkboxes are complete; SR-005/045/049/055 correctly remain partial. The prominent suite counts describe historical P8, review links stop at R5, and SR-055 stops at R4. R15 qualifies runtime/test `709483c46` with 5,631 core passes/7 unchanged pending, 224 real-service passes and 98 focused Angular passes. `support/wiki/ReDBox-Automated-Tests.md:151` likewise needs the later qualification link and explicit historical/current wording. All 72 existing task links resolve. **Exact, unapplied reconciliation:** `docs-reconciliation.patch`; `git apply --check` passes. Preserve the historical immutable-image/topology boundary and add the actual R16 parent report only when complete.
- `support/wiki/Home.md:54` still advertises controller `init()`/shim generation although the rewritten controller page states shims are absent. `support/wiki/Development-Guide.md:24` calls the rewritten v6 extension guide “Historical v5 guidance.” Exact replacement text is in the same patch.

**Reviewed clean:** all 13 application, seven extension, 11 configuration TypeScript, five queue and one maintenance files, plus `ExpressHost.ts`: **38 TypeScript files/8,352 lines**, read end to end. The additional 9,715-line generated schema passes whole-file generator equality and retained-input checks. Per-file hashes/counts are in `audit.json`. Reviewed acquisition/activation, factory dependencies/replacements, configuration consumers, preparation, admitted work, queue completion, drain and retry.

**R15 critique:** all three fixes remain correct. Rechecked five user/role mutations against native rejection responses (10 observations), and both upload widgets against installed Uppy/native CSRF (24 observations, two delayed-header controls). Provider dispatch is controlled; no live cloud/OAuth claim.

**B:** no new inherited item; retain B-01–B-10. No severe ordinary-user access-control exception was demonstrated. The accepted institution gap is unchanged.

**Validation:** 101 lifecycle/extension/configuration and 293 queue/maintenance/configuration checks pass; Node 26.11.1. All 23 tracked manifests/377 dependency declarations are exact or permitted local references (20); no new ranges. No runtime/test edit, branch/worktree change, Docker management, commit, publication or delegation. `coverage.json` contains commands, probes and limitations.
