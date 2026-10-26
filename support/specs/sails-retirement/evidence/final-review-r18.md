# Sails retirement final review — round 18

**Four introduced class-(A) P2 findings; no P1; all four fixed. Zero class-(A)
P1/P2 findings remain open, so the gate is met after remediation.** This was not
a zero-finding round. SR-005, SR-045, SR-049 and SR-055 remain checked for their
explicitly authorized local WSU cohort, with the corrections and limits below.

Reviewed portal `8b049580d..f5d12f86a` on `stack/sails-retirement` and WSU
`14ab99e..1656f33` in the separate `redbox-hook-wsu-v6` worktree. AGENTS.md,
the six specified contracts, tracked wiki standards, R17 and primary WSU evidence
were reviewed. Code Review and ReDBox Testing skills informed the work. The
independent Standards and Spec reviews assessed the pinned incoming trees and
excluded concurrent fixes. The parent added the generalisation checks and
remediation. No portal core application runtime source changed.

## Findings and fixes

| Finding | Classification and effect | Fix and regression |
| --- | --- | --- |
| R18-01 — missing view-conversion preflight | **A/P2.** A neutral manifest could pass `check --v6` while hook EJS still used `TranslationService`, `BrandingService`, `CacheService`, `sails` or the retired ancestor `functions` include. WSU had already demonstrated the resulting homepage 500; sibling hooks share the patterns. | Portal **`17f56f6ed`** adds a targeted server-EJS AST scan with file/line conversion guidance. Tests reject executable uses and accept page locals, supported partials, prose, strings, comments and escaped EJS. Incoming code fails the retained regression. |
| R18-02 — incorrect runtime-export validation | **A/P2.** Checking only the declared key accepts null/types-only exports that cannot load, while rejecting Node's valid root shorthand. The first correction also needed ordered conditions and the actual host's import semantics. | Portal **`17f56f6ed`**, completed by **`916fd0dad`**, validates the selected import-compatible runtime target, accepts root shorthand, rejects null/declaration/outside and require-only targets, and respects null masking and array fallback. Subprocess cases compare the CLI result with actual Node imports. Both incoming-key-check and intermediate-condition failures are retained. |
| R18-03 — generated publication URLs have no HTTP mapping | **A/P2.** WSU still writes landing/harvest files and advertises `/published/<oid>`, but conversion removed the old Compose static mapping without adding a replacement. The draft-record/editor probes did not cover it. This initially undermined SR-049/SR-055 closure. | WSU **`3c764847a`** binds the selected persistent publication directory and adds an explicit public route for eligible published data publications. Only directory/index HTML, `oai_dc.xml` and `rif.xml` are served. Current eligibility, OID/filename bounds, symlink checks, no-store/nosniff, XML types and HEAD are covered. Generated URLs fail 404 before the fix; real generation and HTTP reads pass before/after restart, with draft/embargo/withdrawal/wrong-type/missing/path negative controls. The installed verifier now exercises the same generated URLs. |
| R18-04 — retired dependencies escape the v6 manifest check | **A/P2.** Neutral metadata did not prevent a hook from declaring Sails/Waterline/socket hooks, including optional and peer edges. A hook author could receive a green preflight for an unsupported installation. | Portal **`0b8334c5c`** rejects explicit retired packages across dependency/dev/peer/optional sections, retaining only the three exact historical neutral package names. The incoming manifest regression fails; the corrected check rejects every tested section. Installed graph controls independently cover transitive, scoped, optional, peer and owned-pin cases. |

All fix commits carry the requested coauthor trailer. No dependency was added or
changed. No new inherited B group, P3 runtime issue or severe signed-in-user
access-control exception was verified; the existing **14 B groups** remain in
the [inherited backlog](inherited-defects-backlog.md).

## Independent review axes and correctness

**Standards:** one A/P2 finding, R18-02. The independent reviewer found no other
actionable documented-standard violation or worthwhile baseline smell; incoming
isolated suites passed 55 dev-tools, 26 tooling and 435 WSU tests. These counts
overlap the parent's work and are not added to the final counts below.

**Spec:** one A/P2 finding, R18-03, against SR-049's requirement for converted
institution overrides, auth, storage and deployment settings. The independent
reviewer found the limited released-source fallback and local evidence honest.
Its missing publication mapping is now corrected and qualified.

Review included both qualification drivers, installed-graph checking, migration
ordering/finite conversion, handler bindings, local authentication, mutation CSRF,
brand-scoped Admin authorization, publication download eligibility and templates.
No additional introduced fault was verified in those paths. The AST auditor's
WSU conversion exception requires the exact file, property-key position and
known target; wrong targets, evaluated strings, unknown expressions and live
access remain violations. The new EJS exception is only the exact negative
fixture written by the CLI test. No broad exemption for hook code was added.

## Generalisation to the next hook

Read-only checks of `redbox-hook-uwa` and `redbox-hook-jcu` found **16 and 59**
retired view usages respectively. Their checkout statuses are unchanged; the
converted WSU hook passes the final built `check --v6`. This is a recurring
conversion problem, not WSU-only advice.

The [migration guide](../hook-migration-v6.md) and
[compatibility wiki](../../../wiki/V6-Client-Compatibility.md) now describe:
the declared/shared compiler base required in an isolated install; legacy
manifest/dependency/runtime-export rejection; replacements for view globals and
obsolete includes; and the finite core lexical converter's gap. Institution
expressions need a reviewed hook-local converter before the core conversion,
preserving old migration identities, opaque data and strict unknown rejection.
Guidance requires packaged home/login HTML and generated publication HTTP checks
before and after restart. Readiness or JSON-only probes do not cover these pages.

The preflight is intentionally bounded to known member uses and includes in
server EJS under conventional `views/`. Additional declared roots, custom helpers,
dynamic aliases, build output and deployment bindings still require inspection,
compilation and an installed rehearsal. It does not claim to prove arbitrary
template or hook compatibility.

## Evidence honesty and four-task disposition

All **66** primary evidence files exist and match the recorded SHA256 hashes.
Recorded source/matrix/cutover/restore logs support their stated local results;
no independent fabricated-result issue was found. The missing publication probe
was a real coverage gap, now corrected rather than relabelled as historical proof.

Latest WSU `14ab99e` fails on released v5.0.4 because its newer dashboard models
are absent. Released **v5.0.4 plus WSU `4996206`** is a defensible, explicitly
authorized historical fallback; the target includes the later hook changes.
It proves that selected direct upgrade, not WSU's actual production source,
every latest/patched-v5 combination, or the declared beta-peer contract. The
source's `--noCheck` compilation/peer mismatch and failed latest-hook attempt
remain disclosed. No intervening development release is required by the selected
successful upgrade.

| Task | Disposition after remediation |
| --- | --- |
| SR-005 | **Tick stands.** Real WSU hook/configuration, exact released fallback, Mongo/FCV/separate-store candidates and local topology are identified. Unknown actual production source/access remain explicit. |
| SR-045 | **Tick stands.** Fresh corrected-image WSU rows on Mongo 8.0.34/FCV 8.0 and 9.0.4/FCV 9.0 pass real persistence, maintenance, worker writes, ownership/drain/retry, auth/pages and restart; both processes naturally exit 0. WSU rows use separate standalones. Historical generic replica-set rows retain their own scope. |
| SR-049 | **Tick stands after R18-03.** The corrected installed artifact serves generated publications and repeats cutover, retained-record reads, restart, clean stop, real partial-initialization failure and exact four-database checkpoint restoration. Original full file/config/hook/S3/Solr/source-image recovery remains retained historical proof; unchanged migration/configuration bodies were checked. It is not claimed as newly repeated complete source recovery. |
| SR-055 | **Tick stands after the corrected hook artifact and final tooling qualification.** Exact source/build provenance, installed audits, fresh integration/matrices/cutover, isolated packed consumers and all 1,261 baseline inventory dispositions pass. Unchanged bare/bundled portal and broad R16 runtime evidence remain historical, not fresh R18 executions. |

Production image/configuration confirmation, institution IdP/TLS/IAM/replica-set
controls, actual operator dashboard decisions, workload/search/PDF/publication
effects, external reconciliation and in-place Mongo engine/FCV upgrades remain
unqualified. Synthetic publication generation and local S3 checks do not claim
real DOI/email/Figshare effects. The source-to-target native restore emits Mongo's
cross-version warning; exact synthetic document/index equality is verified, not
general endorsement of cross-version restore or an in-place engine upgrade.

## Fresh verification and artifact provenance

Node **26.11.1**, npm **11.20.0**. Exact inputs, summaries, commands and raw-log
hashes are in [review accounting](final-review-r18/review-accounting.json).

| Fresh R18 verification | Result |
| --- | --- |
| Complete dev-tools suite and TypeScript build | **59 passing**, build exit 0, including final ordered/import export cases. |
| Complete WSU compile/unit suite | **438 passing**, no pending. |
| Complete root tooling suite | **38 passing**, zero failures/skips. |
| Packed consumer | **12 packs / 20 checks**, strict production install, offline CI, ESM/CJS/TLA and compiled scaffold, exit 0. |
| Corrected installed WSU integration | Actual packed hook, home/login HTML, fresh CSRF login, workflow forms, generated publication/index/XML before/after restart and owned stop: exit 0. |
| Corrected WSU two-major matrix | Both Mongo 8/9 separate-store rows pass; natural exit 0 and owned pools 0. |
| Corrected installed cutover/recovery subset | Maintenance ensure/inspect, initialize-only, five retained record/form/workflow/editor reads, fresh CSRF/pages, S3 verification, restart and both stops pass; real partial writes fail initialization before activation, pools 0; restored **28 collections / 5,162 documents** and indexes match. |
| Source retirement/inventory at `916fd0dad` | **1,206** audited candidates; zero executable/dependency violations; **1,177** text-matched files; all **1,261** baseline files reconciled. |
| Corrected installed WSU retirement | **4,095** owned files and **1,230** installed manifests; zero executable/forbidden-package/forbidden-edge violations; exact owned pins. |
| Primary evidence and checkout safeguards | **66/66** hashes match; original WSU's three untracked-file hashes match; sibling statuses unchanged. |

Corrected WSU image:
`sha256:02e4b3ddd3cfb7f4b22b50d1de7f85c9be30fa4e828108d97f97992bdea19361`.
The original hook Dockerfile compiles/packs/installs the exact **225-file Git
archive of WSU `3c764847a`**, using the previously qualified bare portal/PDF
image `sha256:2ce824c3c7bef21b866a099481eb31494b087a182e56fa4a82237792f0a6e7c7`
for both stages. That base is portal **`03c2cbad5`**, whose core runtime is
unchanged. This is not a whole-portal rebuild at `916fd0dad`; final dev-tools are
qualified separately by build/full suite/packed consumer. Installed integration
uses only deployment configuration mounts, without source/dist/dependency
overlays. Matrix and failure probes mount their test driver explicitly.

The fresh pack run uses the standard consumer driver with task-local output and
fixture paths; it packs existing built unchanged packages and rebuilt final
dev-tools. It is not a fresh clean-archive rebuild of every portal package.
R16's broad core/storage/PDF/root/browser/Angular/Bruno results still qualify
their unchanged application runtime; none was rerun or counted as fresh R18.

Retained failures include the intended incoming regressions, an intermediate
TypeScript indexing build error, a compile racing dev-tools output deletion,
the initial Express 4 test harness (corrected to core's Express 5), an engine
namespace/image-reference error, and a packed output-path error. Corrected final
commands pass. Startup connection/503 responses precede readiness; matrix Docker
health defaults point at a different port, so those rows claim their explicit
readiness assertions, not Docker health status. Final cutover readiness probes
return 200 and supervised stops exit 0.

## Cleanup and final state

R18 removed **nine retained containers and ten attached anonymous volumes**;
transient build/audit/cutover containers removed themselves. Zero R18 containers,
volumes or custom networks remain. Both review-owned dockerd/containerd processes
are stopped; six pre-existing volumes and retained images/checkpoints are
preserved. System engines were not stopped. Raw R18 logs and scripts remain under
`.tmp/sails-retirement/final-review-r18/` and
`/mnt/docker-storage/sr-wsu/final-review-r18/`, with hashes in the accounting.

The original WSU checkout, its untracked files, sibling hooks and unrelated
GraphQL specification were not modified. WSU's v6 worktree is clean. No push,
publication or Git tag was performed.
