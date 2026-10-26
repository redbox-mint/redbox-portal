# R26 institution configuration acceptance differential

The matched incoming/fixed comparison finds **two introduced P2 defects**:
optional S3 credentials and the omitted Figshare embargo-scope binding. Portal
`10b987468c6e4c5a0a459424205520c1029ad538` fixes both. No unexplained final
rejection or supplied-value loss remains in this corpus.

## Inputs and execution

[The replay](institution-acceptance.cjs) reads the bundled defaults, the actual
WSU v6 declaration and the seven sibling v5 `registerRedboxConfig` declarations
without invoking their lifecycle, migration or controller registrations. It
evaluates configuration modules and pure helpers in a bounded VM; core data
imports use the actual core configuration/model exports. Every source file has
a hash. Four variants per v5 hook cover absent and explicit AWS credentials,
Docker environment selection and the PROD Figshare crosswalk. Required bucket,
region and session values are synthetic fixtures; there is no provider call.

Each registered section traverses the documented operational
`convertLegacyDeployment` mapping, or the documented explicit typed domain
contribution when it is outside that converter's operational scope. The actual
`loadPortalConfiguration` performs merging, structural validation and generated
domain validation. Failed sections also receive all-errors structural/domain
diagnostics so an earlier error cannot conceal another invalid field. The
incoming replay substitutes only the pinned incoming schema sources in memory;
the matching final replay uses the fixed sources. No checkout is reverted.

| Institution/source | Sections, including environment variants |
| --- | ---: |
| Bundled defaults | 47 |
| CQU | 52 |
| JCU | 48 |
| SCU | 56 |
| UANZ | 49 |
| UC | 44 |
| UON | 48 |
| UWA | 52 |
| Converted WSU | 11 |
| **Total** | **407** |

The registered inputs contain **127,953 path/shape entries**, including
**77,434 non-container entries**. The source inventory also records **154
exported configuration modules** and **164 unique replayed source files**.
Dormant exported fragments are inventoried separately; their inclusion does
not claim they were active registrations. The supplemental
[deployment/source scanner](deployment-inputs.cjs) covers **213 tracked files,
461 service environment entries and 25,867 AST property rows**. Its file table
labels CQU's dormant v4 configuration, SCU's historical legacy tree, and CI/build
orchestration separately from the selected v5 inputs. AST rows record source
shapes rather than claiming standalone validity of arbitrary partial fragments.

The deployment environment comparison executes the real conversion/loader for
each service entry with secret-bearing values replaced by synthetic values:
**seven supported aliases resolve, 135 inputs receive documented refusals, and
319 unrelated namespace inputs remain owned by their service/data module**.
Refused generic `sails_*` discovery and unknown `REDBOX_*` inputs require explicit
typed contributions or selected host/provider operations under the v6 contract.
Supported explicit replacements are exercised, including PDF and DOI inputs.
An unrelated namespace accepted by core does not imply core consumes it.

## Acceptance dispositions

Incoming portal `6942eb1778e1e2ab920c4e64a9fb7951d7c9ca82` accepts **347** sections
and refuses **60**. Fixed portal `10b987468` accepts **367** and refuses **40**.
The **20 newly accepted cases** are precisely the two findings below. The
remaining ten institution/key combinations each occur in four variants.

| Input | Disposition and actual conversion |
| --- | --- |
| JCU, SCU, UON, UWA `storage.disks.primary.config` without `key`/`secret` | **Wrong rejection, A/P2, fixed.** Omission selects the AWS credential chain in both storage implementations. Optional string properties preserve that behavior; explicit malformed properties still fail. |
| CQU, UON `brandingConfigurationDefaults.figsharePublishing.embargo.accessRights` without `embargoType` | **Wrong rejection, A/P2, fixed.** The consumer merges the model's existing article binding. Startup now accepts omission and preserves that fallback; malformed supplied bindings still fail. All four variants, including the PROD crosswalk, exercise the rejection. |
| SCU `dashboardtype._dontMerge`, `workflow._dontMerge`; UON `dashboardtype._dontMerge` | **Correct documented break.** Retired loader metadata must become explicit definitions/bootstrap operations. Removing the marker makes every supplied definition pass the actual loader. This does not claim implicit deletion/replacement of core entries; B-19 records inherited inert metadata on ordinary registration sections. |
| SCU top-level `raid` | **Correct documented conversion.** RAiD publication data belongs under `brandingConfigurationDefaults.raidPublishing`; SCU supplies only the shared core fallback, with no institution override to lose. |
| SCU `routes`; UON `cors` | **Correct documented break.** Sails route/CORS discovery is replaced by owned HTTP/policy integration. These executable capability conversions require the selected host/provider port, rather than retaining inert startup data. |
| UANZ `dashboardtype.workspace.formatRules` | **Correct documented conversion.** V6 refuses scalar/container coercion. Explicitly convert empty `filterBy: []` to `{}` and singleton `recordTypeFilterBy: ['storage-new']` to `'storage-new'`. The actual loader preserves the entire resulting rules object, retaining the empty-filter/single-type meaning. |
| UANZ/UWA `servicenowCatalog`; UON `uonRdmpReminder` | **Correct documented conversion.** Put extension-owned data under `custom.<namespace>` and bind an explicitly selected institution factory/schema. The actual loader retains every defined field under that namespace. No ServiceNow or reminder operation runs in this review. |

The contract and conversion guidance are in
[configuration-v6.md](../../configuration-v6.md#baseline-input-dispositions)
and [hook-migration-v6.md](../../hook-migration-v6.md). No final refusal is left
unclassified. These are acceptance/conversion checks, not full migrations or
live deployments of the seven sibling hooks.

## Reverse meaning comparison

The replay executes only the three pure merge functions extracted from baseline
`a49366803164429f9d8bdd249dadcdf856c9d13e:packages/redbox-core/src/loader/index.ts`.
It compares their effective merge of the supplied institution data and shared
defaults with the actual v6 loader output, as well as checking every supplied
defined scalar/function value for loss or coercion. Undefined contributes no
override under the documented contract. The synthetic session environment is
included in both sides of the comparison.

There are **13 effective merge differences**, all the documented ordinary-array
replacement: UC Solr fields, UON reusable form fragments and WSU Solr fields.
Branding arrays already replaced in v5. There are **zero unexplained supplied
value changes**. This oracle isolates configuration merge/conversion semantics;
it does not claim a newly executed v5 service stack or general production data
migration. Actual storage driver selection and Figshare model default resolution
have separate regression coverage. Sixteen baseline/current controls establish
the inert `_dontMerge` behavior recorded as inherited B-19.

## Machine evidence and reproduction

- [acceptance-summary.json](acceptance-summary.json): one row per registered
  section, incoming/final result, classification, guidance and manual conversion.
- [incoming-acceptance.json.gz](incoming-acceptance.json.gz) and
  [final-acceptance.json.gz](final-acceptance.json.gz): full validator diagnostics,
  source hashes, export inventory, reverse comparisons and inherited controls.
- [input-shapes.json.gz](input-shapes.json.gz): **214 unique shared shape sets**.
  Each acceptance `inputShapeSet` and exported-module `exportShapeSet` references
  this dictionary. It retains every path, shape and scalar value hash while
  deduplicating identical arrays; raw expanded results remain in the local logs.
- [deployment-inputs.json.gz](deployment-inputs.json.gz): tracked source/AST and
  environment dispositions, with no raw source secrets.
- [review-accounting.json](review-accounting.json): exact commands, revisions,
  raw-output hashes and final/superseded run dispositions.

Use Node 26.11.1 with the recorded local dependencies. The replay and deployment
scanner write expanded JSON to an optional output path; the source inputs remain
read-only. For incoming sensitivity, preload `r25-sensitivity.cjs` with
`R26_SENSITIVITY=institution`. For final acceptance, omit the preload. The current
compiled WSU declaration must exist before replay; its normal compile/unit
script passed. Temporary fixtures/logs are distinct from provider credentials.
