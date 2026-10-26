# Sails retirement final review — round 26

**Two NEW class-(A) P2 findings; zero P1. Both are fixed. SR-055 remains open:
this is not a zero-new-findings confirmation round. Final ticks remain 54/55.**

Verified incoming branches and full revisions:

- Portal `stack/sails-retirement`: **`6942eb1778e1e2ab920c4e64a9fb7951d7c9ca82`**,
  matching the requested HEAD.
- Converted WSU `feature/v6-express`:
  **`764851e98cd2ae2d6938c41b18b8abcc081e0656`**, matching the requested HEAD.

The qualified product revisions are portal
**`10b987468c6e4c5a0a459424205520c1029ad538`** and unchanged WSU **`764851e`**.
Both AGENTS.md files, R18–R25, the retirement spec, configuration and migration
contracts, and relevant wiki coding/testing guidance were consulted. The ReDBox
Testing skill supplied the fixture-backed test workflow. No subagents were
spawned and no dependency pin changed.

## Findings and fixes

| Finding | Classification and concrete failure | Fix and regression |
| --- | --- | --- |
| R26-01 — shared S3 credential validation | **A/P2.** JCU, SCU, UON and UWA omit explicit `key`/`secret` for the AWS credential chain. R25 corrected WSU's own declaration, but shared v6 startup validation still refuses these legitimate declarations at `storage.disks.primary.config.key`. Both legacy/current drivers support omission. | Portal **`10b987468`** makes these properties optional strings in the deployment schema and public storage options. A real converter/deployment/portal-loader regression verifies omission, empty and explicit credentials, then captures actual StorageManager driver options. Malformed supplied values still fail. |
| R26-02 — default Figshare embargo binding | **A/P2.** CQU/UON omit `embargo.accessRights.embargoType` and rely on the model's existing article binding. The generated startup schema requires it, refusing valid institution configuration before the consumer can apply that default. | Portal **`10b987468`** makes the binding optional in `EmbargoBinding` and regenerates the domain schema. A real-loader regression verifies the supplied object remains intact and actual Figshare resolution supplies the article default, while malformed explicit bindings fail. |

The two regressions produce **zero passing / two failing** against the incoming
schema and **two passing** with the fixes. The final committed test file was
rerun against pinned incoming sources through an in-memory preload, preserving
the sensitive negative control without reverting worktree files. Both tests
also pass in the complete core suite. The fix has the requested conventional
message and `Co-Authored-By: GPT-6.1-sol <noreply@openai.com>` trailer.

One additional inherited **B/P2** group is recorded as
[B-19](inherited-defects-backlog.md#b-19--p2-institution-registration-leaves-_dontmerge-metadata-inert):
SCU/UON `_dontMerge` markers were already inert in their actual v5 registration
path. Sixteen baseline/current controls preserve the same markers and inherited
entries. It is left open, bringing the cumulative backlog to **19 groups**.
B-18 remains open. No further actionable P3 was verified.

## R25 confirmation

All three incoming fixes and their regressions were inspected and executed.
Fresh historical-source sensitivity uses [the pinned-source preload](final-review-r26/r25-sensitivity.cjs)
in memory, with no file reverts or sibling modifications.

| R25 fix | Sensitive historical control | Current result |
| --- | --- | --- |
| WSU S3 credential chain, `63e8535` | Original WSU declaration plus R25's original core schema: **one pass / three fail**. Restoring that schema is necessary because R26 now also accepts omission centrally. | All four original credential cases pass in incoming and final complete WSU suites. |
| WSU exporter template/group, `764851e` | Pre-fix actual deployment binding: **one pass / one fail**. | Both bundled and configured template/group cases pass in incoming and final WSU suites. |
| Portal PDF source prefixes, `25a455de8` | Pre-fix actual portal schema: **zero pass / one fail**, at URL validation. | Relative, empty and query-prefix regression passes in the incoming configuration group and final full core suite; invalid types remain refused. |

The incoming focused configuration group has **236 passing** tests, and the
incoming full WSU compile/unit run has **565 passing**. These counts are separate
from the final qualification, not added to it. No AWS, registry or native PDF
external effect is claimed by these sensitivity controls.

## Institution configuration settlement and final delta pass

The [acceptance settlement](final-review-r26/configuration-settlement.md) and
[row-by-row comparison](final-review-r26/acceptance-summary.json) account for
**407 registered configuration sections** from bundled defaults, WSU v6 and
read-only v5 CQU/JCU/SCU/UANZ/UC/UON/UWA sources. They contain **127,953 path/shape
entries**, including **77,434 non-container entries**, plus inventories of
exported/dormant fragments and deployment source. The supplemental deployment
scan covers **213 tracked files, 461 environment entries and 25,867 AST property
rows**. Values that can contain secrets are synthetic or represented by hashes.

Every registered section takes the operational converter or documented explicit
typed contribution path and the real v6 loader. Incoming **347 accepted / 60
refused** becomes **367 accepted / 40 refused**. All 40 final refusals have
documented intentional conversions: retired metadata, branded RAiD data, owned
HTTP integration, explicit container/scalar conversion, or extension-owned
custom namespaces. The table records and exercises data conversions; it does
not claim full live migrations/deployments of seven additional institutions.

The reverse comparison executes the baseline's pure merge functions and checks
supplied values against actual v6 outputs. Its **13 merge differences** are
documented ordinary-array replacement. There is **no unexplained supplied-value
loss or coercion** after remediation. Actual driver/provider-default behavior
is covered by the regressions above. Dormant source/AST inventory is labelled
separately from executed registered sections; the oracle isolates merge and
conversion, without claiming a fresh live v5 service stack.

The final pass considered the whole portal/converted-WSU delta, including
configuration composition and validation, ownership/shutdown paths, provider
binding and executable/build guidance outside the settled tables. R20's export
resolver and 25 migrations, R21's HTTP surface, R22's clean-clone/CI/development,
R23's 133 documentation pages and R25's WSU deployment configuration retain
their bounded conclusions. No settled finding is reopened without a concrete
failure. Beyond the two compatibility failures above, no additional new A/P1/P2
case was verified. Inherited findings do not count toward the introduced gate.

## Current qualification and historical limits

The runtime/schema fix changes executable source, so the full suites were
rerun. [Machine accounting](final-review-r26/review-accounting.json) preserves
the exact commands, fixture inputs/image identities, statuses and log hashes.

| Fresh check at portal `10b987468` / WSU `764851e` | Result |
| --- | --- |
| Core build | Exit **0** |
| Complete fixture-backed core suite | **5,635 passing / seven pending**, exit **0** |
| Additional 25-file real-service core group | **224 passing**, natural exit **0** |
| Separate Companion lifecycle / Mongo uploads | **2 / 6 passing**, exit **0** |
| Complete root application integration | **422 passing / ten pending**, exit **0** |
| Complete WSU compile/unit | **565 passing**, exit **0** |
| Complete dev-tools suite | **60 passing**, exit **0**, including the settled 1,271-case resolver table |
| Complete root tooling suite | **49 passing**, exit **0**, no skips |
| PDF owned lifecycle | **Five passing**, exit **0**, synthetic browser ports |
| Source AST/dependency closure | **1,251 scanned files**, zero executable violations / forbidden dependency entries |
| Source inventory/reconciliation | **1,222 matched files**; all **1,261** baseline files accounted for: 736 remaining-classified, 136 removed, 371 retained without candidates, 18 dependency metadata |

The root integration owner drains to `ready: false`, `cleanupPending: false`,
empty resources and zero operations/Prisma clients/pools. The real-service group
finishes all 224 assertions and exits naturally; inherited B-16's passive
watchdog delays exit and remains recorded separately. The two separate Companion
groups retain their explicit `--exit` command, rather than claiming natural
process exit. Seven core and ten root pending cases retain their recorded
contributor/validation/workspace/live-provider exclusions; they are not passes.

Host/fixture tooling uses **Node 26.11.1 / npm 11.20.0**. The retained test-builder
image is `sha256:2e86451c0651b1102d928a82a20e5c9c5460bb819688580ae06bc5c9835d3658`
with the current checkout mounted. Fresh disposable Mongo/authenticated Mongo,
Solr, Keycloak and Mailpit fixtures use immutable recorded image IDs and
64,000-descriptor process limits. These are current **source/compiled-tree**
results; no new immutable installed application image was built.

R25's earlier full-suite counts and R20's installed images, Mongo 8/9 topology,
cutover/restoration and packed-consumer results remain historical. No full
browser/Bruno/Angular, native PDF, production OAuth, complete native recovery or
production provider effect was repeated. Historical artifacts do not contain
the R25/R26 fixes. The institution record's unchecked production-only acceptance
work remains explicit. No production release acceptance is asserted.

## Attempts, cleanup and safeguards

Expected historical-source and incoming-schema failures are sensitivity evidence,
not failing final suites. Early VM harness attempts lacked browser-style globals,
retained cross-realm Array prototypes, or treated undefined as a supplied value;
the final matched run corrects these. One acceptance attempt raced replacement
of compiled `dist` during the build. A preliminary environment scan stopped on
the intentionally unsupported `REDBOX_HARVESTER_ADMIN_TOKEN`; the final scan
records its documented namespace refusal. The raw logs retain these attempts.

The first PDF command selected the package integration script by mistake. It
was cancelled during compilation, before integration/Compose, by terminating
only its verified owned process descendants (exit **-15**). An initial psutil
cleanup attempt could not run because psutil was unavailable; `/proc` descendant
verification supplied the bounded cancellation. This aborted command is not a
passing check. The correct `node --test` PDF ownership run passes five cases.
No default-daemon fixture was created.

Cleanup verified recorded container IDs/names and removed **six `sr-r26-*`
containers and three anonymous volumes**. Only private dockerd **280550** and
containerd **280530**, with verified `/run/sr-r26` command lines, were stopped.
The owned nsfs mount was unmounted before removing `/run/sr-r26`; system daemons
**976/792** were preserved. No custom network or image was built. Historical
images/checkpoints/cache and raw evidence logs were preserved.

All **14 before/after safeguard snapshots match**: the 12 protected original/
sibling checkouts, converted WSU status/diff/untracked bytes, and the excluded
GraphQL tree. WSU remains clean at `764851e`; no original WSU or sibling hook
file was modified. Review Python caches were removed. `git diff --check`
passes. No push, publication or tag occurred.

**Final ticks:** SR-005 `[x]`, SR-045 `[x]`, SR-049 `[x]` retain their stated local
historical qualification; SR-055 `[ ]`. **54/55**. A subsequent round must find
zero new class-(A) P1/P2 issues before SR-055 can close.
