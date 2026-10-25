# R13 configuration acceptance and standards review

Reviewed baseline: `a49366803164429f9d8bdd249dadcdf856c9d13e`. Incoming review
checkpoint: `c8a5064d0`. The review used `git diff a49366803...HEAD` and
`git log a49366803..HEAD --oneline`, the eight retirement specifications,
R1–R12 review evidence, inherited backlog, AGENTS/CONTRIBUTING and tracked wiki
configuration, architecture, extension and standards documentation. R12's stricter
configuration contracts are included in the comparison below.

## Verified incoming defects

**Ten independent A/P2 boundaries; no configuration P1 finding.** Each affected
feature-written configuration acceptance or production composition. The incoming
negative control substitutes `c8a5064d0` configuration modules in memory and leaves
the shared checkout untouched. Baseline references below are paths under
`packages/redbox-core/` unless otherwise stated; line numbers identify the pinned
source, not a claim that a current file still has the same layout.

| ID | Current source location | Pinned baseline acceptance / observable failure | Fix |
| --- | --- | --- | --- |
| CFG-01 | `src/configuration/portal.ts:204`; `src/application/portal/http.ts:465` | `src/config/api.config.ts` supplies `max_requests: 20`; `src/controllers/webservice/RecordController.ts:1686,2342,2373` consumes this API bound. The new schema omitted it and the production API input used the unrelated search limit of 1,000,000. Restore the setting and its production binding. | `03b1d724e` |
| CFG-02 | `src/configuration/portal.ts:204`; `src/pages/clientConfiguration.ts:25` | Repository-root `views/apiClientConfig.ejs:21–22` merges `api.additionalClientConfig` last. The new loader rejected the public overrides before the existing page helper could use them. Restore JSON acceptance; retain explicit-public override precedence and the existing whitelist. This has a distinct browser-visible effect from CFG-01. | `03b1d724e` |
| CFG-03 | `src/configuration/portal.ts:207`; `src/application/portal/http.ts:405` | `src/services/FormPayloadPrehydrateService.ts:190` reads enabled/maxVocabSelections, with defaults true/50. New validation rejected these settings and production passed an empty configuration even if acceptance was repaired. Restore schema and production `config.form`. | `03b1d724e` |
| CFG-04 | `src/configuration/portal.ts:156` | `src/services/DomSanitizerService.ts:273` consumes `record.form.svgMaxBytes`, default 1,048,576. The new loader rejected operator overrides before sanitizer execution. Restore the positive byte setting and verify actual sanitizer behavior. | `03b1d724e` |
| CFG-05 | `src/configuration/portal.ts:220`; `src/config/appmode.config.ts` | `src/services/NavigationService.ts:515,618` resolves navigation featureFlag names against appmode data. New strict validation rejected institution-owned flags used by that consumer. Restore arbitrary JSON flags and the public index signature; regress enabled/disabled navigation. | `03b1d724e` |
| CFG-06 | `src/configuration/deployment.ts:23,189`; `src/config/storage.config.ts` | `src/persistence/preflight.ts` reads `storage.mongodb.indices/deletedRecordIndices/recordIdentityIndices`; bundled defaults and fixtures declare the native descriptors. The new loader omitted these arrays. Restore plain-data index descriptors and native JSON options. Driver Map/entry-array representations require the already intended plain-data conversion. | `03b1d724e` |
| CFG-07 | `src/configuration/portal.ts:109`; `src/config/record.config.ts` | Baseline `test/services/OrcidService.test.ts` and `test/services/RecordsService.test.ts` use `record.api.search.method: 'GET'`. New validation accepted only lower-case forms. Restore upper-case equivalents of the existing methods and align the public type. | `03b1d724e` |
| CFG-08 | `src/config/emailnotification.config.ts:32,45`; `src/configuration/portal-domains.schema.json` | Baseline `test/services/EmailService.test.ts` uses a subject-only template and jsonTransport; `src/services/EmailService.ts` passes serverOptions directly to Nodemailer. The new generated schema required both template fields and restricted native options/SMTP URL strings. Restore sparse templates, native transport object data/default fields and smtp/smtps URLs. Parent probe commit `c9a77fcd7` extracts the actual baseline method and exercises pinned Nodemailer without network. | `03b1d724e`, `217c61339` |
| CFG-09 | `src/configuration/deployment.ts:77` | `src/config/redboxSession.config.ts` declares optional stringify; the baseline Mongo store forwards native store options. The new schema omitted the native boolean. Restore `redboxSession.stringify`. | `03b1d724e` |
| CFG-10 | `src/configuration/portal.ts:203` | Repository-root `views/default/default/listWorkspaces.ejs:28,32` uses angularDev to select vendor/styles bundles in baseline and current source. The new loader rejected that switch. Restore the boolean and render the actual EJS template for both values. | `03b1d724e` |

CFG-01 applies to the **webservice API**. Baseline browser
`src/controllers/RecordController.ts` extends Core.Controller and does not apply
`api.max_requests`. Browser search, normal lists and deleted-record lists must
retain their separate policy. `2d7516aaa` and `afaf6ef01` supply the supporting
maxSearchRows seam/binding; the parent's final supporting fix `f1da6196e` preserves
browser-list/deleted-route separation, with its focused real HTTP controls green.
Those supporting corrections are part of
CFG-01, not additional incoming defects. This configuration review does not claim
that baseline browser lists had a cap of 20.

CFG-02's whitelist control supplies synthetic server/session/OIDC secrets and
checks that they are absent from browser globals, while explicit public extras
override existing public values. No whole server configuration is newly exposed.
Configured OIDC identifiers remain unrestricted strings (dots, colons, Unicode);
the passing incoming control confirms this is not a configuration rejection.

## Complete source inventory and acceptance table

The reproducible [inventory](configuration-inventory.json) is generated by
[configuration-inventory.cjs](configuration-inventory.cjs) from the complete pinned
Git tree. It scans source/defaults/type declarations, actual config reads and
aliases, bundled hook and test fixture shapes, environment reads, tracked wiki and
EJS references. It never imports or executes baseline modules. Non-source,
generated/dependency/localization and legacy support/docs exclusions are individually
listed; AGENTS routes documentation review to tracked support/wiki instead.

| Inventory category | Count / disposition |
| --- | --- |
| Scanned source files | 3,511, individually named |
| Excluded files | 978, individually named with owner and disposition |
| Distinct discovered configuration paths | 5,796 |
| Path provenance records | 11,152 source file/line/kind records |
| Path classifications | 4,134 retained; 870 migrated; 668 inactive; 80 retired; 36 runtime state; 8 excluded fixtures |
| Literal source fixtures | 474: 195 retained; 162 migrated; 100 excluded fixtures; 12 retired; 5 inactive |
| Unresolved expressions | 253, each expression/source/owner/disposition retained |
| Environment reads | 295, each source/owner/conversion disposition retained |
| Current scalar/container/shared-reference/function shape rows | 4,054, each mapped to both compatibility documents |
| Typed retained fixtures | 186 accepted directly; 9 with known inherited literal diagnostics |
| Inherited compiler diagnostics | 10 diagnostics in five baseline declaration categories |

The [acceptance ledger](configuration-acceptance.json), generated by
[configuration-acceptance.cjs](configuration-acceptance.cjs), compares every path
with both the runtime schema and public configuration type. Every retained path
is accepted by both. Every literal fixture has a classification and reason; every
unresolved expression, excluded file and environment read has an owner and
disposition. No unresolved symbolic expression is silently executed, discarded or
represented as an established literal value.

`legacyInventory.test.ts` loads **all 195 retained literal fixtures** through the
actual loader/AJV and compares them with the generated public-type table
`legacyInventoryTypes.ts`. The five inherited declaration omissions are one grouped
B/P3 backlog item, B-07, with explicit subcases: AAF loginUrl, OIDC
claimMappingOptions, Solr jsonString, i18n defaultNS and reusable-form placeholders.
All corresponding runtime fixtures pass. The machine ledger retains the exact
baseline declaration text/line and diagnostic for each; narrow expected compiler
errors preserve those values without casts or fabricated runtime exclusions.

Intentional plain-data/strict scalar rejections are mapped to
[configuration-v6.md](../../configuration-v6.md#baseline-input-dispositions) and
[V6-Client-Compatibility.md](../../../../wiki/V6-Client-Compatibility.md#configuration-input-dispositions).
The ten rejection controls cover API/SVG/prehydrate/session/SMTP numeric strings,
a boolean string, structured URL, Mongo Map and entry-array keys, and an arbitrary
function in public extras. The ledger covers the remaining declared shapes and
the three explicit DOMPurify function exceptions. This documents the selected-data
contract and existing intended retirements; it does not excuse the ten repaired
baseline acceptance defects by inventing new breaks.

## Top-level RAiD fallback disposition

**Intentional documented conversion, not an additional defect.** Baseline
`src/services/RaidService.ts:122` uses branded raidPublishing first, then
`legacyConfigToPublishing(sails.config.raid)`. Baseline
`src/config/brandingConfigurationDefaults.config.ts:375–405,418` builds and seeds
the branded block from core RAiD defaults. The fallback is reachable when branded
configuration is absent; it is not universally unreachable. Current
`src/application/portal/providers.ts:194` supplies brand/default raidPublishing.
Both compatibility documents explicitly require copying legacy fallback data to
the brand's raidPublishing AppConfig or brandingConfigurationDefaults.raidPublishing,
preserving credentials, connections and mappings. No runtime fix is claimed here.

## Focused verification

Native Node **26.11.1**, repository exact-pinned dependencies. From
`packages/redbox-core`:

```sh
TS_NODE_PROJECT=test/tsconfig.json \
../../.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node \
--no-experimental-strip-types ../../node_modules/mocha/bin/mocha.js \
--no-config --require ts-node/register/transpile-only --timeout 10000 \
test/configuration/legacyAcceptance.test.ts test/configuration/legacyInventory.test.ts

../../.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin/node \
../../node_modules/typescript/bin/tsc --noEmit -p test/tsconfig.application.json
```

- **219 passing**: 13 focused consumer/configuration cases, 195 retained source
  fixtures, ten intentional shape rejections and one completeness check.
- Application typecheck **exit 0**, including all three configuration test/table
  files. SMTP assertions use actual SMTPTransport instance narrowing.
- Incoming negative control: run only legacyAcceptance.test.ts and add
  `--require ../../support/specs/sails-retirement/evidence/final-review-r13/configuration-negative-control.cjs`.
  **12 expected failures / one passing OIDC control**, exit 12. Multiple cases for
  the same email boundary are supporting shapes, not extra defects.
- From repository root, both inventory and acceptance generators with `--check`
  **exit 0**; the latter also verifies the complete typed literal table and exact
  inherited diagnostics. Checks are read-only.
- Prettier check for legacyAcceptance.test.ts, legacyInventory.test.ts and
  legacyInventoryTypes.ts **passes**. No dependency changes.

Native logs remain under
`.tmp/sails-retirement/final-review-r13/configuration/`: inventory-green.log,
regression-red.log, acceptance-check.log and typecheck-final.log. Parent owns full
qualification; no Docker management or broad gate was run here.

## Standards, clean areas and limits

No additional material P1/P2 breach of the documented standards was verified in
this assigned configuration scope. Exact dependency pins remain unchanged.
Existing configuration-loader precedence, environment conversion ownership,
explicit extension selection, prototype/plain-data safety, public whitelist,
unrestricted OIDC identifier strings and R12 schema constraints remain covered by
the reviewed source and retained table. The only reported P3 is inherited B-07.

No separate baseline code-smell finding is asserted. The supplied smell vocabulary
was treated as judgment guidance rather than a new repo requirement; tooling-only
issues and speculative refactors are excluded. No auth runtime or parent-owned
HTTP request validation was changed by this reviewer.

Static unresolved expressions have explicit dispositions, not claimed runtime
execution coverage. Synthetic/source acceptance does not close the accepted
representative institution gap SR-005/045/049/055. No further exploratory sweep is
pending in this assigned review.
