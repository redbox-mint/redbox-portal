# R17 commands and execution bounds

Repository: `/home/andrew/src/github/redbox-portal`; pinned `a49366803164429f9d8bdd249dadcdf856c9d13e...1d38ddd1c00c6197d3a28ebe616248bfd008faf0`. All commands completed in this round. Output redirections were exclusively into this scratch directory. The normal Node 24 binary was not used for the recorded checks.

Inventory captured using the requested `git diff a49366803...1d38ddd1c` and `git log a49366803..1d38ddd1c --oneline`. Each named fix and the two typing commits used `git show --format=fuller <commit>`. These are source reviews; a stored full feature diff is not a claim of reading every generated/deleted artifact.

From `packages/redbox-core`:

```sh
TS_NODE_PROJECT=test/tsconfig.json ../../.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types ../../node_modules/mocha/bin/mocha.js --no-config --require ts-node/register/transpile-only --require chai --require ./test/setup.ts --timeout 15000 --fail-zero --reporter json \
 test/http/recordDifferentialR14.test.ts \
 test/http/recordDatastreamContracts.test.ts \
 test/http/recordBrowserPages.test.ts \
 test/http/identityDifferential.test.ts \
 test/http/datastreamReadDifferential.test.ts \
 test/http/vocabularyVersionDifferential.test.ts \
 test/http/recordApiMutations.test.ts \
 test/http/recordBrowserMutations.test.ts \
 test/http/recordApiReads.test.ts \
 test/http/recordBrowserReads.test.ts \
 test/http/recordBrowserMetadata.test.ts \
 test/http/recordReadLimits.test.ts \
 test/http/recordResumableContracts.test.ts \
 test/http/recordProgressContracts.test.ts \
 test/configuration/legacyAcceptance.test.ts
```

Exit 0, 280 passed/0 failed/0 pending: `focused-current.json`, empty `focused-current.stderr`.

R14 negative command used the same flags, replacing `--require ts-node/register/transpile-only` with `--require ../../.tmp/sails-retirement/final-review-r17/spec-native-data-browser/r14-incoming-loader.cjs`, and selecting only the first six HTTP files plus `test/configuration/legacyAcceptance.test.ts`. The retained loader substitutes ten actual incoming source modules from `9bb858218` via the compiler hook; it changes no checkout files. Exit 42, 96 passed/42 expected failures/0 pending: `r14-incoming.json`, empty stderr. Every failure maps to one of the eight assigned fixes; full test names are in `late-fix-coverage.json`. Passing denial/foreign-brand/attachment-membership/normal-input cases remain controls.

The two R13 negative runs used the same flags and only `test/http/recordReadLimits.test.ts`, with `--require ../../.tmp/sails-retirement/final-review-r17/spec-native-data-browser/r13-pagination-loader.cjs`. Environment `R17_PAGINATION_CONTROL_REF='2d7516aaa^'` selects the actual pre-search-fix adapter: exit 7, 8 pass/7 expected failures (two search, five later browser-list cases). `R17_PAGINATION_CONTROL_REF='f1da6196e^'` selects the pre-browser-fix adapter: exit 5, 10 pass/5 expected failures. The five browser cases overlap. Corresponding `r13-*-incoming.json` and empty stderr files are retained; all 15 current cases pass in the 280-case run.

```sh
TS_NODE_PROJECT=test/tsconfig.json ../../.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types ../../node_modules/mocha/bin/mocha.js --no-config --require ts-node/register/transpile-only --require chai --require ./test/setup.ts --timeout 15000 --fail-zero --reporter json \
 test/unit/persistence-foundation.test.ts \
 test/unit/persistence-shutdown.test.ts \
 test/middleware/requestLifetime.test.ts \
 test/services/StandardDatastreamService.test.ts
```

Exit 0, 122 passed/0 failed/0 pending: `lifecycle-current.json`, empty stderr. Driver acquisition is controlled/stubbed; actual loopback HTTP/session cases use deterministic stores. This is not Mongo-backed drain qualification. The combined green count is 402; this does not include negative controls or baseline/probe observations.

From repository root, each retained scratch probe used the qualified Node binary:

```sh
.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types .tmp/sails-retirement/final-review-r17/spec-native-data-browser/angular-consumer-probes.cjs
.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types .tmp/sails-retirement/final-review-r17/spec-native-data-browser/angular-companion-probe.cjs
.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types .tmp/sails-retirement/final-review-r17/spec-native-data-browser/r15-delayed-widget-probe.cjs
```

All exit 0. Fresh results: 10 paired incoming/current user/role consumer observations; 24 installed-client/native-session-CSRF observations plus two header-setter causal controls; 12 actual delayed-widget/private-client observations. Incoming user/role methods reject and retain “Saving/Generating/Revoking”; current methods complete with the native 500 message. Incoming Companion requests fail 403 despite nested tus CSRF; corrected/current outer headers pass 200. Delayed setters update actual installed RequestClient private headers. Retained programs were copied from R16 with only the output destination changed; these result files were newly generated in R17. Jasmine additions for statuses 0/400/403/500 and both immediate/delayed widgets were read in full diffs, but Chrome/Karma was not rerun by this axis.

Fresh actual baseline method controls, all exit 0:

```sh
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json .tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types --require ./node_modules/ts-node/register/transpile-only support/specs/sails-retirement/evidence/final-review-r14/records-baseline-probes.cjs .tmp/sails-retirement/final-review-r17/spec-native-data-browser/records-baseline-fresh.json
.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types support/specs/sails-retirement/evidence/final-review-r14/identity-baseline.cjs
.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types support/specs/sails-retirement/evidence/final-review-r14/parent-baseline.cjs
.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node --no-experimental-strip-types support/specs/sails-retirement/evidence/final-review-r13/browser-list-baseline.cjs
```

Last three stdout outputs were redirected respectively to `identity-baseline-fresh.json`, `entrypoints-baseline-fresh.json`, `browser-list-baseline-fresh.json`. Counts: 13 + 13 + 5 + 4 = 35 accepted observations. Programs and their helpers were read before execution, load actual source bodies via `git show a49366803:<file>`, and use deterministic ports. This proves method provenance, not a historical full Sails HTTP deployment.

No tracked edits or source mutation by this axis, branch switch, worktree, push, delegate, container, database service or persistent runtime configuration change. No compile/typecheck, broad artifact or institution qualification claim. No parent/sibling test count has been included. `integrity.json`, `source-hashes.json`, `evidence-hashes.json` and `baseline-probe-hashes.json` pin the reviewed/check artifacts.

Final status: This axis made no tracked edits. Three parent-owned documentation edits were present at finalization; HEAD and reviewed runtime/test sources remain pinned to 1d38ddd1c00c6197d3a28ebe616248bfd008faf0. See `integrity.json` for the three exact paths and hashes. `associated-test-hashes.json` records executed/associated test-source hashes. The retained `write-evidence.py` predates this final status correction; finalized evidence files are authoritative and it should not be rerun unchanged.
