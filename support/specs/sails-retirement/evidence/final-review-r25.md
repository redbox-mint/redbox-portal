# Sails retirement final review — round 25

**Three NEW class-(A) P2 findings; zero P1. All three are fixed. SR-055 remains
open: this is not a zero-new-findings confirmation round. Final ticks are
54/55; SR-005, SR-045 and SR-049 retain their recorded local qualification.**

Incoming branches and full HEADs were verified before review:

- Portal `stack/sails-retirement`: `a4089ad238f78ca0d0f5b9227a61f8fd5ecf8061`.
- Converted WSU `feature/v6-express`: `8dd61118eed9582be8d4d01359677b9be4dba631`.

The qualified product revisions are portal
**`25a455de8b2f5c80486567ced6addafc808976a2`** and WSU
**`764851e98cd2ae2d6938c41b18b8abcc081e0656`**. Both AGENTS.md files, the spec,
configuration/extension contracts, institution evidence and R18–R24 were read.
The Code Review skill supplied independent Standards and Spec reviews. Findings
overlapping the primary review are counted once. No dependency pin changed.

## Findings and fixes

| Finding | Classification and concrete effect | Fix and sensitive regression |
| --- | --- | --- |
| R25-01 — AWS credential-chain configuration | **A/P2.** With bucket/region set and optional hook credentials absent, the real v6 loader rejects `storage.disks.primary.config.key`. The actual storage driver supports omitted explicit credentials, so instance/task-role deployments cannot start. | WSU **`63e8535`** emits schema-valid empty strings for absent optional credentials. The real StorageManager still omits driver credentials unless both are populated. Four subprocess regressions cover absent, empty, whitespace and explicit values: **1 pass/3 fail before**, all four pass afterward. Deployment guidance explains both supported modes. |
| R25-02 — exporter template/group overrides | **A/P2.** A validated publication hook's `templatePath` and `rifGroupName` survive configuration resolution, then the institution binding silently replaces them. The baseline exporter honors both; a real hook author's template and registry group are lost. | WSU **`764851e`** preserves supplied template/group values with bundled defaults. Two binding regressions: **1 pass/1 fail before**, both pass afterward. The independent probe also compares actual generated baseline/current bytes. Publication root and canonical URL selection remain deployment-owned. |
| R25-03 — PDF source path validation | **A/P2.** The loader requires `pdfgen.sourceUrlBase` to be a full URL, although the documented provider consumes a relative path prefix and uses empty string as its current-brand fallback. Valid configured prefixes fail startup. | Portal **`25a455de8`** accepts an optional string. The resolution regression tests empty, view-path and query-prefix values and rejects a numeric value: **0 pass/1 fail before** with the actual `invalid_format`, then passes in the full core suite. Independent real-loader/provider checks accept four path/default cases and reject four invalid types. |

All three fixes have conventional commit messages and the requested
`Co-Authored-By: GPT-6.1-sol <noreply@openai.com>` trailer. Independent
[remediation review](final-review-r25/spec-remediation-review.md) accepts all
three, with no unresolved Spec objection. Its six WSU regressions, eight core
configuration tests and eight supplemental PDF cases are separate bounded
checks, not additional full-suite counts.

One **B/P2** group is added as [B-18](inherited-defects-backlog.md#b-18--p2-wsu-doi-landing-defaults-ignore-selected-url-and-brand-settings):
WSU DOI landing defaults read ambient environment before selected files/CLI and
hardcode the instrument brand/portal. The actual baseline `14ab99e` and incoming
`8dd6111` helpers produce the same incorrect defaults in six offline scenarios,
including working explicit-DOI-base controls. The real resolved configuration
table also records the selected-file/CLI URL divergence. Explicit
`DOI_PUBLIC_LANDING_URL` / `DOI_INSTRUMENT_LANDING_URL` are the workaround.
No DOI was minted. This inherited issue remains in the backlog, now 18 groups;
it does not increase the introduced gate count. No additional actionable P3 was
verified.

## R24 fix and deployment configuration settlement

The incoming complete WSU compile/unit suite passes **559** tests, including
R24's four origin regressions. The retained [real Compose/CSRF probe](final-review-r25/compose-origin.cjs)
expands baseline `14ab99e`, pre-fix `80b2b80`, fixed `8dd6111` and current Compose
data for defaults, selected host port, explicit URL and empty selectors:
**16 asserted cases**. Only the intentional pre-fix selected-port control returns
403; valid current browser origins pass. This verifies the fix at the requested
incoming commit independently of R25 remediation.

The [deployment input table](final-review-r25/configuration-table.md) and
[machine inventory](final-review-r25/configuration-inputs.json) enumerate **79
environment inputs and 542 configuration leaf/array or exporter-option inputs**,
plus CLI switches and build positional arguments. Each records its default,
downstream consumers and override channel. The generator scans 113 tracked WSU
files, includes inherited canonical portal environment maps and expands the
actual resolved defaults. Arrays are ordered atomic inputs; arbitrary native
driver JSON options stay provider-owned. Synthetic required S3/session fixtures
are labelled. Optional exporter options, retired inputs, service-only variables,
CI image/registry inputs and the historical NODE_PATH note are distinguished.
Form/workflow/metadata DSL content remains the settled domain surface.

| Table / execution | Observed result and limits |
| --- | --- |
| [Offline configuration resolution](final-review-r25/configuration-matrix.cjs) | **26 rows: 22 pass, four expected refusals.** Fresh subprocess per row; real WSU extension, real loader, Mongo target resolvers, session options, CSRF and DOI JSONata. Covers listener/origin/root/proxy/cookies, separate and replica/TLS Mongo URIs, queue, S3 options/credential modes/prefixes/staging, Solr, brand/landing/admin/logging, DOI, mail/Figshare/PDF and all selected-file/environment/CLI precedence. Invalid secret, proxy, unknown and retired inputs are refused. No external provider call. |
| [Real Compose deployment expansion](final-review-r25/compose-deployment.cjs) | **Four active rows pass; two retired entrypoints are correctly refused.** Defaults, all six selected host ports, explicit HTTPS URL/root/proxy overlay and disposable integration preserve internal Mongo/session/Agenda/Solr/S3 targets, matching S3 credentials/buckets and both required build-image arguments. Offline `docker compose config`; no image build/publication claim. |
| [OIDC callback construction](final-review-r25/callbacks.cjs) | **Three rows pass:** local default, selected port and HTTPS `/research`. Actual configuration loader and OIDC strategy emit the explicitly registered callback with PKCE/state. Issuer metadata is synthetic and offline; no provider exchange. |
| [Real HTTP starts](final-review-r25/live-http.cjs) | **Three starts pass:** ordinary local URL, selected host port and HTTPS proxy + `/research` + changed brand/portal. Actual ExpressHost/ApplicationRuntime, Passport/session/CSRF, WSU page template and static middleware verify login 302, root/post-login redirects, cookie path/security, home/assets 200 and foreign-origin/invalid-token 403. Synthetic identity and memory session ports; this is not an installed WSU/Mongo qualification. |

The corresponding result JSON files are retained beside the runners. Public URL,
root context, listener port, cookie path/security, registered IdP callback and
brand/landing paths are explicit settings with separate consumers. Compose host
port publication changes its default public URL but keeps service DNS/ports
inside the network. Only service environment entries are forwarded from Compose;
other deployment settings use an explicit configuration/Compose override. The
tests supply consistent settings and verify the actual derivations. B-18 records
the concrete inherited DOI exception; it is not hidden as an independent knob.

## Whole-delta review and independent axes

The incoming portal/WSU delta, exact commit lists and remaining configuration,
registration/composition, provider binding, maintenance/executable, build/CI and
guidance paths were checked alongside the independent reviews. R20's resolver
and 25-migration tables, R21's HTTP table, R22's clean-clone/CI/development table
and R23's complete documentation table retain their bounded conclusions. The
three concrete failures above justify new findings; no hypothetical objection
reopens a settled surface. Historical results are not added to fresh counts.

### Standards

The [incoming report](final-review-r25/standards-review.md) finds **zero new
A/P1/P2**, no actionable documented-standard breach or baseline smell and no
additional inherited finding. It covers the full pinned delta, applies the
documented WSU dependency/launcher exceptions and excludes tooling-enforced
checks. Its static migration normalization does not claim fresh execution.
Concurrent remediation was outside its pinned comparison.

### Spec

The [incoming report](final-review-r25/spec-review.md) finds **two A/P2**: S3
credential-chain rejection and discarded exporter options. It cites meaningful
configuration preservation (`design.md:43`) and hook-argument preservation
(`extensions-v6.md:123`), with real loader/exporter reproducers. The S3 finding
overlaps the primary's discovery and counts once. The primary configuration
table adds the PDF defect. The separate remediation review accepts all three.

Incoming-axis totals: **Standards zero; Spec two P2**, both remediated; the
combined round has **three distinct new A/P2** and no P1.

## Current qualification and historical limits

`git diff --stat 5786b7e77..HEAD -- 'packages/*/src/**'` at the qualified product
revision reports the Figshare README and the new PDF schema change. Excluding
Markdown leaves exactly `packages/redbox-core/src/configuration/portal.ts`.
**Runtime is therefore changed since R20**, and the conditional full-suite rerun
was performed. [Accounting](final-review-r25/review-accounting.json) records the
exact stat, source revisions, commands, fixture image IDs and log hashes.

| Fresh check | Result |
| --- | --- |
| Core build | Exit **0** |
| Complete fixture-backed core suite | **5,633 passing / seven pending**, exit **0** |
| Additional 25-file real-service core group | **224 passing**, natural exit **0** |
| Separate Companion lifecycle / Mongo upload groups | **2 / 6 passing**, exit **0** |
| Full root application integration | **422 passing / ten pending**, exit **0**; final owner reports zero resources/operations/Prisma clients/pools |
| Complete final WSU compile/unit suite | **565 passing**, exit **0** |
| Complete dev-tools suite | **60 passing**, exit **0**, including the 1,271-case resolver table |
| Complete root tooling suite | **49 passing**, exit **0** |
| PDF lifecycle | **Five passing**, exit **0**; synthetic browser ports |
| Source AST/dependency closure at `25a455de8` | **1,239 scanned candidates**, zero executable violations / forbidden dependency entries |
| Current source inventory and reconciliation | **1,210 matched files**, zero unclassified; all **1,261** baseline files and **456** added candidates accounted for |

Host and fixture runtime use **Node 26.11.1 / npm 11.20.0**. The runtime builder
is the retained image `sha256:2e86451c0651b1102d928a82a20e5c9c5460bb819688580ae06bc5c9835d3658`
with the current portal checkout mounted. Fresh disposable Mongo, authenticated
Mongo, Solr, Keycloak and Mailpit fixtures use the recorded immutable image IDs
and 64,000-descriptor limits. This qualifies source/compiled tests; it is not a
new immutable installed application image. The real-service group completed its
224 assertions before naturally exiting; no forced exit was added to that group.

The seven core and ten root pending tests retain R20's explicit contributor,
validation/workspace and live DOI/DataCite/RVA/legacy-form exclusions. They are
not passes. Earlier intermediate WSU suites (559 incoming, 563 after S3) and the
independent focused runs are not added to the final 565 count.

R20's installed images, Mongo 8/9 topology rows, cutover/restoration and packed
consumers remain historical. The full browser/Bruno/Angular, native PDF,
production OAuth, complete native recovery and production external effects were
not repeated here. No image contains the R25 fixes merely because an older
installed check passed. The institution record and unchecked production-only
acceptance work remain explicit. No release acceptance is asserted.

## Failed attempts and cleanup

Intentional sensitivity failures are retained separately from successful final
runs. The first PDF regression attempt failed on missing executable-path fixture
metadata; only its corrected `invalid_format` run is sensitivity evidence.
Harness iterations used a nonexported session helper/authentication export, a
nonexistent session close method, an incomplete Figshare object and malformed
callback fixture syntax; corrected final runners pass. One WSU command ran from
the wrong directory, and another raced core build's replacement of `dist`, causing
missing type declarations; the sequential final compile/unit run supersedes both.
An initial reconciliation paired an old inventory commit with current closure;
the current/current pair passes. Retired Compose refusal is asserted in the final
table. All command statuses and superseding runs remain in machine accounting.

Cleanup removed **six fixture/builder containers and three attached anonymous
volumes**, stopped only private dockerd **263679** and containerd **263643**, and
preserved system daemons **976/792**. Fixture IDs/names and exact daemon command
lines were verified; adapted fixtures retain an `sr.review=r20` label, so cleanup
used recorded IDs and `sr-r25-*` names. The first final-directory removal found a
busy private nsfs bind after daemons stopped. Recorded cleanup resumed by
verifying and unmounting only `/run/sr-r25/docker/netns/default`, then removing
that owned transient directory. Offline container/volume directory checks confirm
removal. No custom network or review-built image was created; historical images,
checkpoints and evidence logs remain.

All 14 safeguard snapshots match: 12 protected original/sibling checkouts, the
clean committed converted WSU worktree's status/diff/untracked bytes and the
excluded untracked GraphQL tree. The snapshots do not compare WSU HEAD, which
changed through the two authorized commits. Temporary probe directories and
review Python caches are absent; `git diff --check` passes. No original WSU,
sibling hook or GraphQL file was modified. No push, publication or tag occurred.

**Final disposition:** SR-005 `[x]`, SR-045 `[x]`, SR-049 `[x]` for their stated
local historical scope; SR-055 `[ ]`. A subsequent round must find zero new
class-(A) P1/P2 issues before the confirmation gate can close.
