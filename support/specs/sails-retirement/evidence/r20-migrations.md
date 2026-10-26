# R20 — WSU historical migration data-safety differential

Reviewed 2026-10-26. **No introduced class-A P1/P2 migration defect verified.**
One inherited **B/P2** defect is verified and recorded as
[B-15](inherited-defects-backlog.md#b-15--p2-failed-branding-history-insertion-is-not-recovered-on-migration-retry);
it is not fixed. This report supplements the parent's R20 review.

## Inputs, method and limits

- WSU baseline **`14ab99eb3a89434b9c886d51d5edc37447f43588`**; target
  **`c1c847ddb4b09673cfff65e5d85f0eb527164f7b`**. All 25 migration bodies,
  their helper bodies and corresponding deltas were read. Baseline TS loaded
  from `.tmp/sails-retirement/final-review-r20/wsu-v5/` is checked byte-for-byte
  against Git. Target TS is loaded directly from the pinned Git object, not the
  mutable working tree or hook dist. Bootstrap query/report JSON is checked
  against each corresponding commit before execution.
- Portal review pin **`00de66500`**. Existing compiled core codecs are used;
  the driver's ledger records loaded artifact hashes and checks their mapped
  tracked source files against this pin, HEAD and working tree. It also checks
  that initially loaded artifact bytes do not change during execution. The
  recorded checkout HEAD can be newer because the parent is reviewing/fixing
  other code. This is not a clean archive rebuild of portal at the review pin.
- The actual migration functions run through **synthetic persistence ports**.
  Current `wsuMigrationData` and core reference/configuration/vocabulary codecs
  are exercised. Raw physical Mongo substitutes only apply raw patches; they
  do not supply Waterline normalization. Baseline key callbacks and vocabulary
  normalization are extracted from released v5.0.4 portal source
  `c1dda53999f3b026347008731f33dba834e06c27`; reference create defaults are
  modelled. Branding repository, CSS generator and audit persistence are
  deterministic substitutes. No Waterline runtime, real Mongo, Docker,
  application startup or migration ledger is executed here.
- Every migration has a nonzero-write mixed fixture, plus an empty fixture.
  PDF addition has five extra combinations. Each clean first-pass write is
  failed **before persistence and after persistence/acknowledgement loss**,
  including audit callbacks. Each failed attempt is followed by three complete
  calls; clean calls likewise run three times. Resulting states are compared
  with clean results and with the other version, retaining identities, keys,
  revisions, nested opaque values and sentinels. Only top-level generated
  `createdAt`/`updatedAt` are excluded. Newly created synthetic IDs derive from
  natural keys so comparisons do not depend on random generation.
- Existing rows must remain by identity; custom/provenance/review sentinels,
  record metadata sentinels and `lastSaveDate`, and dashboard contexts must
  survive. Deep sentinels contain timestamp/revision-like names, empty strings,
  zero and false. Vocabulary lowercase keys and written query/report natural
  keys are asserted independently of the differential. Unique original audit
  outcomes must match clean runs; duplicate callbacks after audit-before-update
  retries are counted rather than hidden. Retention assertions cover these
  fixtures, not every possible historical document.
- No transaction, unique-index/CAS race, actual generated timestamp, engine or
  network behavior is qualified. These latest-hook v5 bodies are **not** the
  successfully rehearsed released-v5 source cohort: institution evidence uses
  released v5.0.4 plus WSU `4996206`; latest WSU `14ab99e` failed there because
  the newer dashboard models are absent. See
  [institution source decision](institution-wsu.md#sr-005--institution-source-decision-and-topology).
  This differential does not relabel that failure as a successful release run.

## Final execution

The final Node **26.11.1** command exits **0**:

```sh
PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH" \
  node .tmp/sails-retirement/final-review-r20/migration-differential.cjs \
  >> .tmp/sails-retirement/final-review-r20/migration-differential.log 2>&1
```

| Measure | Final result |
| --- | ---: |
| Historical migration identities / migrations with actual fixture writes | 25 / 25 |
| Clean paired scenarios | 55 |
| Partial-failure/retry paired scenarios | 1,368 |
| Total baseline/current state-and-audit comparisons | 1,423 |
| Version-specific scenario executions, excluding sensitivity controls | 2,846 |
| Explicit preservation/normalization assertions | 3,452,796 |
| Baseline/current mismatches or unexpected recovery differences | 0 |
| Partial cases converging exactly to the clean fixed point | 1,356 |
| Inherited missing-history cases | 12 |
| PDF revision-only recovery differences | 0 |
| Clean scenarios with no second-call writes | 54 / 55 |
| Clean scenarios with no third-call writes | 55 / 55 |
| Retry cases with no third-call writes, in both versions | 1,368 / 1,368 |
| Retry cases producing one extra audit callback, in both versions | 464 |

Two additional historical sensitivity controls deliberately run the pre-R19
port `3c764847a836a014e9294de0cd76121784627095`: each vocabulary migration
produces **56 stale lowercase value keys**. The current port produces none.
These controls establish that the synthetic physical port does not mask R19's
already-fixed normalization defect; they are not new findings or released-v5
integration runs.

The harvest fixture uses the real **`@record[harvestId]`** placeholder: 105 batch
rows plus two targeted repairs produce **107 repairs, 107 audits and 214 clean
writes**, crossing the 100-row page boundary. A retained top-level harvest ID
is copied; an absent source removes the placeholder. A populated local value
and the unrelated `{{redboxOid}}` string remain unchanged. Contributor recovery
likewise writes across a 100-row boundary: **111 records / 222 writes**.

## Per-migration disposition

All names below have prefix `redbox-hook-wsu:`. **I** means the second and third
clean calls write nothing. **P n/n** means all n before/after-write cases return
to the clean fixed point with retained identities/revisions. **S** means all
common sentinel/no-row-loss assertions pass. Key checks do not require untouched
pre-existing deliberately stale query/report keys to repair themselves.
Intended overwrites below are retained v5 policies, not newly invented behavior.

| Migration | Idempotence | Partial recovery | Keys / normalization | No-data-loss checks; intended changes/overwrites |
| --- | --- | --- | --- | --- |
| `20260720T000000-seed-namedqueries` | I | P 16/16 | brand/name keys; serialized query fields | S; seed or replace packaged query definition fields, retain custom fields |
| `20260721T000000-set-wsu-branding-variables` | I | 8/14 exact; 6 B-15 | brand identity and version/hash | S; WSU tokens override their existing values, other tokens survive; CSS/hash/version recomputed; history gap below |
| `20260721T010000-repair-wsu-branding-variables` | I | 8/14 exact; 6 B-15 | same shared branding function | S; same intended palette overrides and inherited history gap |
| `20260825T010000-seed-doi-appconfig` | I | P 4/4 | brand/config identity | S; recursively fill defaults beneath local settings; replace legacy Newcastle landing URL |
| `20260831T000000-upsert-reports` | I | P 20/20 | brand/name keys and reference codecs | S; intentionally replace packaged title/query/filter/column fields, retain unknown fields |
| `20260901T000000-migrate-vocabulary-values` | I | P 112/112 | all mapped values; `valueLower`/`labelLower` | S; replace exact legacy keys only in selected vocabularies; local values, labels and identifiers survive |
| `20260901T010000-repair-vocabulary-values` | I | P 112/112 | same normalizer, global entry scan | S; replace exact known legacy values across entries, preserve custom values/fields |
| `20260902T000000-seed-instrument-namedqueries` | I | P 16/16 | shared query seeder and natural keys | S; intentionally reapply all packaged query definitions, not only instrument |
| `20260902T010000-seed-instrument-doi-profile` | I | P 4/4 | shared brand/config seeder | S; add defaults under local DOI settings; same legacy URL correction |
| `20260903T000000-migrate-legacy-records` | I | P 12/12 | type dispatch, ID/cursor, server revision | S; mapped legacy RDMP/archive/publication fields only; unrelated metadata retained; original audits compared |
| `20260903T010000-repair-data-publication-citations` | I | P 4/4 | publication type, record ID/revision | S; repair recognized broken generated citation; retain other metadata and audit original |
| `20260903T020000-repair-legacy-harvest-ids` | I | P 428/428 | actual placeholder, IDs, >100 pagination | S; 107 exact-placeholder repairs; copy source ID or delete invalid placeholder, retain existing local/wrong-placeholder controls |
| `20260909T000000-migrate-appn-managing-organisation` | I | P 4/4 | canonical APPN ROR and record IDs | S; populate empty structured manager fields; retain original related-metadata rows |
| `20260909T010000-seed-ror-namedqueries` | I | P 16/16 | shared query seeder and natural keys | S; intentionally reapply all packaged query definitions |
| `20260909T020000-repair-ror-lookup-priority` | I | P 4/4 | trimmed/lowercase ROR identity | S; overwrite only derived priority, retain source ROR ID/metadata |
| `20260909T030000-repair-ror-lookup-search` | I | P 2/2 | ARDC matching; lowercase search alias | S; append HDA aliases once, retain existing search text and other metadata |
| `20260908T000000-populate-dr-coverage-from-linked-dp` | I | P 20/20 | linked OIDs and single-source selection | S; fill only null/missing coverage; explicit empty end date wins; source publication unchanged by inspection/differential |
| `20261019T000000-migrate-report-templates` | I | P 20/20 | shared report upserter / natural keys | S; intentionally reapply packaged report definition fields, retain unknown fields |
| `20261022T000000-backfill-selected-archive-coverage` | I | P 16/16 | all four selected OID/source pairs | S; only null/missing archive coverage filled; explicit empty end dates and complete source publications independently asserted unchanged |
| `20261022T010000-plan-pdf-dashboard` | I except empty rows: two passes | P 22/22 | dashboard ID/revision, workflow type IDs | S; missing/existing PDF combinations covered; add action without duplicate links; empty rows use packaged defaults, then add PDF on next pass |
| `20261022T020000-data-record-modified-sort` | I | P 6/6 | dashboard ID/revision, exact column predicate | S; change only recognized Modified field to root `lastSaveDate`; preserve custom columns/settings |
| `20261022T030000-rdmp-id-lists` | I | P 8/8 | dashboard/workflow/report IDs | S; add missing RDMP-ID column/filter, retain existing columns, filters and controls |
| `20261023T000000-dashboard-sorting` | I | P 42/42 | dashboard CAS revision and workflow IDs | S; update standard sort defaults/tie fields; explicit local choices and context/provenance are retained |
| `20261023T010000-dashboard-contributor-names` | I | P 444/444 | revision-zero predicate, IDs, >100 pagination | S; recover approved blank names from parts; align display alias with editable name; retain `lastSaveDate` and original audits |
| `20261023T020000-remove-plan-pdf-dashboard-links` | I | P 8/8 | dashboard revision/workflow identities | S; intentionally remove matching PDF anchors; retain other links/columns/settings and dashboard contexts |

The retained empty-row PDF behavior is not first-rerun idempotent: first pass
installs the current packaged RDMP defaults, which lack PDF; second pass adds
the action in one dashboard and two workflow steps; third pass writes nothing.
Both pinned versions behave identically. The subsequent removal migration
supersedes the intermediate action. This observation is not promoted to a
separate user-facing P1/P2 defect. The failure matrix preserves exact revisions;
no revision erasure was needed to make final recovery comparisons agree.

## Verified inherited finding — B-15 / P2

**Trigger:** update a brand, then fail its matching history insertion.
Current WSU `src/migrations/2026.07.21T000000-set-wsu-branding-variables.ts`
lines **107–112** has `if (!changed) { continue; }`, followed by
`await context.updateBrand(...)` and `await context.createBrandHistory(...)`.
Baseline `14ab99e` lines **118–124** has the identical decision and write order
using `BrandingConfig.update` and `BrandingConfigHistory.create`.
The repair migration delegates to the same helper in both versions.

In the mixed fixture, fail **before write 2** (history insert) after write 1
(brand update) commits. Brand `000000000000000000000001` is version **2** with
the intended hash; its version-2 history is absent after every retry. Failure
immediately after the update has the same outcome. An initially absent brand
has the equivalent gap at version 1. Both migrations reproduce six boundaries
each, **12 total**; the only resulting collection difference from a clean run
is `brandingconfighistory`. This is missing operator history, not loss of the
current branding configuration, and is inherited class **B/P2**, not class A.

The applicable guidance explicitly says migrations provide “no transaction,
rollback, or exactly-once guarantee”
([hook-migration-v6.md](../hook-migration-v6.md#awaited-bootstrap-and-migrations)).
That explains partial persistence; it does not repair this skipped history.
The runbook still requires a checkpoint and stopped writers. No standards
breach or judgment-only smell is substituted for this verified correctness
finding. Portal/WSU AGENTS.md, tracked coding standards, CONTRIBUTING.md and WSU
deployment/dashboard docs informed this scope. No additional non-tooling hard
standards breach was verified in these migration changes.

## Accounting, retained attempts and disposition

Raw artifacts are the three specifically authorized files under
`.tmp/sails-retirement/final-review-r20/`. The JSON contains per-migration and
per-failure results, original-audit comparisons, missing-history identities,
source/artifact hashes and method qualifications. The original parent's 75/75
comparison is prior evidence, not added to these counts.

The log retains an earlier expanded attempt that stopped on the newly exercised
inherited PDF empty-row non-idempotence. A completed intermediate attempt had
zero differential failures but misclassified six exact PDF recoveries as
revision-only differences because `[].every(...)` is true. The final driver
requires a nonempty difference before assigning that classification and reruns
the complete matrix. Those earlier attempts are not additional passing counts.

The final checkout HEAD recorded by the driver is
`5786b7e77dfa56bec6e8e5919a01d206c41bf289`; all **32** loaded core artifacts
retain their initial bytes and all 32 mapped tracked sources match the review
pin. The JSON contains **129 source hashes**: 46 baseline, 47 target, 32 portal,
three released-v5 model sources and one historical negative-control port.

| Final artifact, relative to portal root | SHA256 |
| --- | --- |
| [`.tmp/sails-retirement/final-review-r20/migration-differential.cjs`](../../../../.tmp/sails-retirement/final-review-r20/migration-differential.cjs) | `b28f9e18faf9562bb3d4454840ac7f6fbc985717cfa850c1175e43ec0b959650` |
| [`.tmp/sails-retirement/final-review-r20/migration-differential.json`](../../../../.tmp/sails-retirement/final-review-r20/migration-differential.json) | `e429520ab116be7f73cb25f17f5748c13fdc71a3f9d7dd585757092ba98e3fe0` |
| [`.tmp/sails-retirement/final-review-r20/migration-differential.log`](../../../../.tmp/sails-retirement/final-review-r20/migration-differential.log) | `8e286ab4977f08594306f64201306c99d0341024ceebf06dc013252a174233db` |

The embedded driver hash matches its final bytes. The final log summary and
JSON counts agree; the final command returned exit 0. SHA256 values cover the
whole retained log, including failed/intermediate attempts, not just the final
successful section.

This work changes no product code, commits, Docker resources, original WSU or
sibling files, or GraphQL specification. It adds no new installed/released-v5,
matrix, cutover, restore or production acceptance claim. **SR-005, SR-045,
SR-049 and SR-055: no disposition change from R19 on this limited evidence.**
Their historical qualifications and production-only gaps remain in the parent
review and institution record. B-15 remains an explicit separate inherited
follow-up.
