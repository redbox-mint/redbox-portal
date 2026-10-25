# R17 Standards bounded coverage

Base `a49366803164429f9d8bdd249dadcdf856c9d13e`; HEAD `1d38ddd1c00c6197d3a28ebe616248bfd008faf0`; branch `stack/sails-retirement`.

`source-coverage.json` is the path/line-count/SHA-256/method manifest. The central set is **38 TypeScript files / 8,352 current source lines**, read end to end: all 13 application files, seven extension files, 11 configuration TS files, five queue files, ExpressHost and maintenance/indexes. This is current-file coverage, not a claim that all those lines were newly written or that every caller was independently reviewed. Additional complete build/config/input files and partial hunk coverage are identified separately in the manifest.

The exact requested feature diff and commit list are retained as `feature.diff` and `commits.txt`; `late.diff` contains post-R12 changes. Saving a diff does not establish that every hunk was manually reviewed. `late-commit-coverage.md` and `.json` account for all 34 later commits and handoffs. No claim of independent whole-feature Express/data, UI, auth, persisted integration, build or deployment qualification follows from this axis.

## Documented rules applied

- AGENTS.md dependency pins and tracked-wiki preference; CONTRIBUTING.md:23 test updates.
- Coding-Standards-and-Conventions.md:3, :10 and :24: TypeScript, naming and async/error idioms. Tooling trivia and P3-only observations excluded.
- Services-Architecture.md:3, :8, :22, :39 and :77: explicit collaborators, fresh owned instances, offline factories, awaited initialization and rollback, quiesce/drain/close, retries, declared module ordering, concrete extension contracts and owned persistence work.
- Architecture-Overview.md:9 and :39: production composition and admitted work ownership.
- Configuration-Guide.md:9 and :57: explicit awaited configuration, precedence, validation and safe failure paths.
- Development-Guide.md:34 and Redbox-Core-Types.md:36: qualified Node/toolchain and source/packed entrypoints.

The corresponding host, composition, extension, startup configuration, queue/maintenance and build files were read in full/context. The generated domain schema was checked for equality using its actual generator; its 9,715 lines were not manually audited. No material A/P1/P2 documented-rule violation was verified. No new B defect was concretely established; B-07 declaration omissions and B-08 native TTL/hidden-index option loss remain the inherited backlog's existing dispositions.

## Heuristics (separate from documented rules)

The supplied naming, duplication, feature-envy, data-clump, primitive-obsession, dispatch, scattered-change, divergent-change, unused-flexibility, message-chain, delegate and inheritance heuristics informed source reading. No qualifying A/P1/P2 smell was verified. Concrete composition wrappers and explicit dependency forwarding match the repository's documented architecture; file size, repeated route mounting or constructor forwarding alone supply no user-impact finding. Existing AppConfig/AWS lease and Agenda algorithms were compared with baseline provenance rather than called feature defects merely because moved/reformatted.

## Newly executed evidence

`checks-summary.json` / `focused-results.json`: 354 late/config/input tests, 141 host/lifecycle/extension/configuration/queue tests and 72 queue/maintenance/composition tests = **567 passing**, all exit 0. `http-inventory-green.log` adds **336 passing**, for **903 total passing existing Mocha tests**. `late-green.log`, `lifecycle-green.log`, `queue-maintenance-green.log` hold names. Tests use existing fixture collaborators and loopback HTTP; this is not persisted database/browser qualification. `run-focused.py` and `run-inventory-checks.py` retain exact setup.

`negative-results.json`, `run-negative.py`, `historical-loader.cjs` and six `*-negative.log` files retain newly rerun pre-fix controls. Failure counts are local input 10, OIDC names 3, config/bindings 10, native SMTP URLs 2, search pages 2 and browser lists 5. Only selected historical modules replace current ones in memory; all other dependencies/tests remain current. Historical R13–R16 claims in prior reports were not rerun wholesale. `schema-check.log` records the new equality check.

## Test-only commits and generated data

`c9a77fcd7`: full authored baseline SMTP probe reviewed and newly rerun, recording actual baseline method success/native host+port and current loader acceptance; only delivery replaced. No live SMTP or historical server. `def11b40c`: all authored helper/test/verification scripts read; existing permanent gate passes 336 cases. Regenerated inventory matches baseline/current contract data and owner expression sets: 335 declarations, 152 API declarations, 331 baseline patterns, zero unresolved, 7,145 cells (5,945 baseline differentials + 1,200 current alias snapshots). Full JSON byte equality is false because working HEAD, current source line offsets and owner-expression order changed. The initial comparator also mishandled undefined properties versus JSON omission; its failed log is preserved. The corrected semantic comparison retains all contract cells, baseline provenance, expression sets, dispositions and counts; `http-inventory-reconciliation-final.json` passes. The writing CLI was read but not executed, preserving tracked data.

`9cff20d50`: all authored inventory/acceptance/type-policy generator and permanent-test logic reviewed. Both generators' read-only `--check` modes pass exact retained JSON and generated typing-fixture equality: 3,511 scanned files, 5,796 paths / 11,152 provenance sites, 474 fixtures, 253 unresolved expressions, 295 environment reads and 978 exclusions. 195 retained literals execute against the loader; the virtual compiler policy records 186 accepted fixtures and nine with known inherited declaration diagnostics (10 diagnostics across five B-07 declaration gaps). Ten intentional invalid-shape rejections also pass. No giant row-by-row manual audit, blanket static-extractor soundness or full-project compiler gate is claimed. Per-commit conclusions are in the late ledger.

## Lockfile accounting observation

There are 18 tracked lockfiles; the parent R16 lock comparison covered six selected consumer roots, not all 18. The portal-ng-common leaf lock remains baseline-unchanged while its manifest moves exact tslib 2.8.1 from development to runtime dependencies. The documented library workflow builds through Angular CLI at the Angular root and publishes from dist (leaf README:41, :45). Production compilation changes to angular and performs root npm ci before building the library (compileProductionAngular.sh:19, :22, :73); package files exclude the leaf lock. No supported-use break was concretely verified, so no A/P1/P2 finding. Parent reports clean Angular root install/build passed R16; this axis did not rerun it. No all-lockfile qualification is inferred.

Parent owns `afaf6ef01`, R13 closure tooling, R16 local-auth and broader auth/docs/loginUI; sibling owns Express/data behavior. Latest parent confirmation is auth **165** / Chrome **37** passing with all controls passing; prior native recovery probe **12** passing. These parent-reported results are excluded from this axis totals. No nested delegates were used. SR-005/045/049/055 retain the accepted undesignated-institution disposition. This axis made no tracked edits, branch changes, worktrees, pushes, containers or runtime changes. At final status, the parent-owned R17 text edits in tasks.md, inherited-defects-backlog.md and ReDBox-Automated-Tests.md are present and were reviewed as a bounded diff; runtime/test files remain unchanged at pinned HEAD. `parent-documentation.diff` / `read-only-check.json` record this distinction; `artifact-hashes.json` hashes retained scratch evidence and checked generated inputs.
