# Sails retirement final review — round 20

> R21 qualification correction: the packed-consumer driver did not explicitly
> set strict/nonlegacy peer flags inside its temporary consumer, and its retained
> environment does not prove those settings. Its install/offline/consumer results
> below remain historical passes; their strict-peer claim is unproven. R21 fixes
> the driver and repeats all 12 packs / 20 checks with explicit strict flags;
> all 12 tarballs match R20 byte for byte. See [R21](final-review-r21.md).

**Five NEW class-(A) P2 findings; no P1. All five are fixed. R20 does not pass
the confirmation gate:** that requires a round finding zero new A/P1/P2 issues.
SR-055 is reopened for that confirmation. The other three task ticks retain
their expressly limited local WSU scope, subject to the verification below.

Reviewed portal `8b049580d...00de66500d79640b148a046dc03e4133a22308ec`
and WSU `14ab99eb3a89434b9c886d51d5edc37447f43588...c1c847ddb4b09673cfff65e5d85f0eb527164f7b`,
then the fixes at portal **`5786b7e77dfa56bec6e8e5919a01d206c41bf289`**
and WSU **`50293cc2cc1b8d34e6ec649d80c1faa64d4235ff`**. Read AGENTS.md,
the retirement spec, wiki standards/testing, R18/R19 and the institution evidence.
The Code Review and ReDBox Testing skills informed the review. Incoming-tree
[Standards](final-review-r20/standards-review.md) and
[Spec](final-review-r20/spec-review.md) reports remain separate; the latter's
[host follow-up](final-review-r20/spec-host-followup.md) and
[remediation review](final-review-r20/spec-remediation-review.md) qualify its
original findings. Overlapping discoveries are counted once.

## Findings and fixes

| Finding | Classification and user effect | Fix and sensitive regression |
| --- | --- | --- |
| R20-01 — invalid wildcard captures | **A/P2.** Preflight accepts captures containing `..`, `node_modules` or encoded equivalents, even when Node rejects them. An invalid captured subpath must also terminate an array rather than select a later fallback. | Portal **`5786b7e77`** validates captures separately from targets and preserves terminal selection errors. The systematic matrix reproduces incoming discrepancies and covers invalid captures with plain, encoded, array and constant targets. |
| R20-02 — trailing-slash public patterns | **A/P2.** Valid wildcard exports ending in `/` are falsely rejected, preventing a hook author from using a Node-supported public entry. | Portal **`5786b7e77`** follows Node's exact-key exclusion and pattern matching/precedence. Actual Node resolution and host loading supply the regression oracle. |
| R20-03 — separators in URL query/hash | **A/P2.** Valid targets with encoded separators in query or fragment are falsely rejected, although only pathname separators invalidate the resolved module URL. | Portal **`5786b7e77`** validates the selected pathname; query/hash controls resolve and import the selected module. Invalid pathname separators remain rejected without falling through. |
| R20-04 — host/preflight export parity | **A/P2.** The host's `import-meta-resolve@4.2.0` lacks Node 26's default `module-sync`/`node-addons` conditions and treats unmatched nested conditions as null. Hooks can pass preflight and fail startup; other valid hooks are rejected incorrectly. | Portal **`5786b7e77`** shares one pure export selector between preflight and the actual loader, using default Node 26 import conditions. The ponyfill remains only for legacy main/index fallback. Host tests and actual module-identity comparisons cover conditions, null masking and nested fallthrough. |
| R20-05 — latest PDF browser GET | **A/P2.** The converted read-only GET adds CSRF despite v5's explicit `csrf:false`; an ordinary authenticated browser link returns 403. | WSU **`50293cc2`** removes CSRF from that GET while retaining authentication, brand and view checks. The new HTTP test mounts the declared policies and real core CSRF implementation: incoming **2 pass/1 fails (403 vs 302)**; corrected full suite passes. Installed verification stages a real PDF through the public datastream API and follows the ordinary link before/after restart. |

Both product commits have the requested conventional message and coauthor
trailer. No dependency or version pin changed. R20 adds two inherited groups
(B-15 and B-16), for **16** cumulative groups in the backlog. No additional publication-byte
authorization, ordinary-user access-control or actionable P3 defect was verified.

## Export resolution settled against Node and the host

The retained **1,271-case** table compares the checker and actual loader with
Node **26.11.1**, recording import resolution, require resolution and actual
imports separately. It covers strings, ordered and nested conditions, arrays,
fallbacks, null, root shorthand, exact and wildcard subpaths, pattern precedence,
encoded/invalid targets and captures, query/hash, declaration targets and missing
files. Preflight deliberately validates declarations without requiring generated
files to exist. Declaration files are unsupported runtime entries even if Node
can resolve them. The host always loads through native import, including CJS;
require results document the separate conditions rather than changing that
contract. Exact selected targets are compared after equivalent URL/path
canonicalization on both sides.

Incoming code has **200 checker + 70 host discrepancies = 270**; final code has
**zero**. This is a regression sensitivity run against transpiled pinned Git
sources, without reverting the worktree. The full suite also runs the matrix and
**41 real CLI/import cases**. Independently retained reruns compare **25,000
generated shapes** and **11 numeric-condition controls**, with zero selection
differences, plus **40 strict module-namespace identity comparisons and four
rejection controls**, with zero differences. See the remediation review for the
retained runner, raw rows, method limits and original probe/rerun distinction.

The selector is qualified for the documented Node 26 default import conditions.
Custom process condition flags are outside this qualification. These finite
matrices and generated controls provide strong parity evidence, not a proof for
all possible package manifests or arbitrary top-level hook code.

## All 25 migrations and remaining delta

The [per-migration review](r20-migrations.md) covers every migration's writes,
lookup keys, v5 normalization, rerun behavior, partially migrated data, revisions,
audit effects and preserved fields. It runs the actual baseline/current migration
bodies against synthetic persistence ports and actual current codecs, with
released-v5 key/normalization callbacks. **55 clean plus 1,368 partial-failure
scenarios = 1,423 paired comparisons**, **2,846 version executions**, and
**3,452,796 preservation/normalization assertions** have zero version mismatches.
Every migration writes in its populated fixtures; the driver exercises empty and
mixed rows, pagination, before/after-write failures and three reruns. Two pre-R19
controls each expose 56 stale vocabulary keys; current code exposes none.

**B-15/P2**, added to the [inherited backlog](inherited-defects-backlog.md), is a
branding-history gap: if the brand update commits and history insertion fails,
reruns see no changed brand and permanently omit the audit entry. Both versions
reproduce it at 12 boundaries; it is not fixed. The other 1,356 partial cases
converge exactly. Duplicate audit callbacks at 464 retry boundaries and the
two-call PDF empty-row behavior are identical in both versions and documented
with their limits. These are synthetic-port comparisons, not a released-v5
Waterline/Mongo integration or an atomic-migration guarantee. No introduced
migration data-safety P1/P2 was verified.

Re-reviewed WSU route policy declarations, brand-filtered Admin roles, publication
eligibility, current view permission, linked-source/selected-file/brand checks,
path and symlink handling, draft/embargo/withdrawal exclusions and generated
HTML/XML delivery. Existing negative tests and installed delivery remain part of
the verification. No further A/P1/P2 finding was verified in this scope.

## Standards

The independent [incoming report](final-review-r20/standards-review.md) found no
new A/P1/P2, inherited correctness defect, actionable documented-standard breach
or baseline smell within its closure/standards scope. It reconciles all 1,261
baseline files and passes 73 classification controls (14 AST, seven installed
dependency, 52 manifest). Its separate migration follow-up adds B-15 as recorded
above; it does not change this incoming closure result.

## Spec

The independent [incoming report](final-review-r20/spec-review.md) found two
A/P2 defects: the ordinary latest-PDF GET's CSRF policy and actual host/preflight
export mismatch (R20-05 and R20-04). The host follow-up confirms nested fallthrough
as a second mechanism of the same loading finding. The remediation review
accepts both fixes; the later process-exit diagnosis adds inherited B-16.

Incoming-axis totals: **Standards zero A/P1/P2; Spec two A/P2, both fixed**.
The parent differential's three further resolver findings bring R20's total to
five; overlapping findings are not added twice.

## Fresh verification and provenance

Host and fixture runtime: **Node 26.11.1 / npm 11.20.0**. Exact commands,
inputs, exit statuses, retained artifacts and SHA256 values are in
[machine accounting](final-review-r20/review-accounting.json). Raw artifacts
remain under `.tmp/sails-retirement/final-review-r20/`.

| Fresh verification | Result |
| --- | --- |
| Full dev-tools suite / build | **60 passing**, exit **0**; build exit **0** |
| Full WSU compile/unit suite | **443 passing**, exit **0** |
| Full core suite with real persistence fixtures / core build | **5,632 passing / seven pending**, exit **0**; build exit **0** |
| Additional 25-file real-service group | **224 passing**, exit **0** |
| Separate real Companion lifecycle / upload groups | **2 / 6 passing**, exit **0** |
| Full root application integration | **422 passing / ten pending**, exit **0**, zero pools/Prisma clients on stop |
| Full root tooling | **38/38 passing**, exit **0** |
| Fresh packs / isolated production-offline consumers | **12 / 20**, all pass |
| Actual CLI/import table / systematic checker+host differential | **41 / 1,271 cases**, final expectations pass, zero differential mismatches |
| Independent generated shapes / numeric controls / host identity checks | **25,000 / 11 / 40 plus four rejection controls**, zero differences |
| All-migration behavioral differential | **1,423 pairs / 3,452,796 assertions**, zero version mismatches |
| Read-only core / WSU / UWA / JCU view scans | **0 / 0 / 16 / 59** findings; WSU CLI exit **0**, UWA/JCU exit **1** |
| Installed fresh integration | Pages, login/CSRF, forms, generated HTML/XML and real latest-PDF browser link before/after restart; pass, zero pools |
| Installed separate-store Mongo matrix | Mongo **8.0.34 / FCV 8.0** and **9.0.4 / FCV 9.0**, both pass; natural exit **0**, zero pools/Prisma clients (watchdog timing qualified below) |
| Installed cutover / restart / stop / partial failure / database restoration | Pass; retained reads/S3, both stops exit **0**; real failed initialization does not activate and closes pools; exact restore **four databases / 28 collections / 5,162 documents** |
| Source AST/dependency closure | **1,212 candidates**, zero violations |
| Original inventory reconciliation | All **1,261** baseline files: **742** classified, **136** removed, **365** retained without candidates, **18** dependency metadata; all **423** added candidates accounted for |
| Installed AST / dependency graph | **3,417 candidates / 1,230 manifests**, zero executable/forbidden packages/edges; exact owned pins |

The seven core pending tests are inherited explicit contributor (two), validation
(two) and workspace API (three) cases. Root's ten pending cases are seven live
DOI operations, the unmigrated legacy embargoed form, live DataCite and production
RVA import. They are not counted as passes. The initial fixture-free core run
(**5,541 passing / 98 pending**) is retained but superseded by the accepted
fixture-backed run above; the two counts are not added.

The installed derivative image is
**`sha256:0cb517fa72cbf846ac97712bb052c4618ce908db168f62a0085c08cdf9012a5a`**.
It starts from the exact qualified portal/PDF base
`redbox-portal@sha256:2ce824c3c7bef21b866a099481eb31494b087a182e56fa4a82237792f0a6e7c7`
(portal `03c2cbad5`), replaces core source/dist with the freshly built/packed
`5786b7e77` core, and strictly production-installs freshly compiled/packed WSU
`50293cc2`. Byte comparisons against Git identify the inputs. Core dependency
metadata is unchanged; no additional dependency install for core is needed.
This is an explicit derivative, not a fresh whole-portal/Angular image rebuild.
Installed checks mount only configuration/drivers; application source, dist and
dependencies are not overlaid. Packed consumer checks independently use 12
fresh tarballs, including current core and dev-tools.

The original broad browser/Angular, generic replica-set/stepdown matrix,
bare/bundled artifacts, and complete native recovery remain historical proof.
R20 does not claim those were wholly repeated. Original WSU, R18 and R19 raw
ledgers verify **66/66, 83/83 and 117/117** hashes; the 226 archived incoming WSU
source hashes also match. Fresh runtime suites are required and recorded here
because R20 changes the host loader.

## Task disposition

| Task | R20 disposition |
| --- | --- |
| **SR-005** | **Stands** for the designated WSU cohort and explicitly authorized released-v5.0.4 plus compatible WSU `4996206` fallback. Actual production source and release-coverage gaps remain explicit. |
| **SR-045** | **Stands** for the final derivative's two selected Mongo/FCV rows, separate standalone stores and local S3/Solr/auth topology. Both processes naturally exit 0. The watchdog diagnosis below qualifies exit timing; actual production TLS/auth/set membership and engine upgrades remain unqualified. |
| **SR-049** | **Stands** for the authorized local rehearsal after PDF requalification and final-artifact cutover/restart/stop/partial-failure/exact database restoration. Complete source-image/files/configuration/Solr recovery remains historical. |
| **SR-055** | **Reopened.** Artifact/inventory checks pass, but R20 found five new A/P2 issues. A subsequent confirmation round with zero new A/P1/P2 findings is required. |

Production source/configuration coverage, actual TLS/auth/set membership,
federation/IAM/provider credentials, representative workload and operator engine/
FCV procedures remain the explicitly unchecked production acceptance work in
the [institution record](institution-wsu.md). Local qualification does not claim
production acceptance or authorize release. R19's assertion that fixes alone met
the final gate is corrected at the top of its report; historical counts remain.

## Failed attempts, limitations and cleanup

Incoming sensitivity failures are intentional evidence, not successful runs.
The initial export-matrix harness had URL canonicalization differences; those
artifacts remain, followed by corrected canonicalization on both sides. An
independent retention harness initially omitted the final encoded-backslash
rejection; its 351 false discrepancies remain under `initial-harness-run/` and
are explicitly superseded by the corrected retained rerun. Migration harness
iterations and their fixture/classification corrections are described in the
per-migration report, without combining counts.

Initial fixture MongoDB processes inherited a 1,024-descriptor limit and ran out
of files. Raising a live process limit was insufficient: all six owned Mongo
fixtures were recreated with 64,000 descriptors and fresh tmpfs data before the
accepted full runs. The nofile and invalid-fixture full/real/auth attempts remain
retained and are not passing evidence. The first installed build used a SHA-only
FROM reference, then corrected it to repository@digest. Two smoke harness
attempts used the retired GridFS port or an incomplete staging fake; the accepted
run uses the actual public datastream staging API. No product behavior was
changed to hide these harness/fixture failures.

The installed Mongo 8 verifier printed zero owned pools/clients but remained alive
for roughly five minutes before naturally exiting 0. Inspector and standalone
Agenda probes identify a referenced job watchdog delay; the released-v5 image
also reproduces it. The [diagnostic review](final-review-r20/drain-review.md)
records its precise timing, dependency/source provenance, scaled controls and
classification. This inherited limitation is **B-16/P2**, recorded without a
product fix. Zero pools is a storage-ownership assertion, not an immediate exit
claim. The Mongo 9 row also naturally exits 0; both actual cutover signal stops
exit 0 within their 60-second Docker grace period. No forced `process.exit` was
introduced to make the matrix pass.

Final cleanup removed **12 service/builder containers**, their **nine attached
anonymous volumes**, **six orphan anonymous volumes** from the earlier Mongo
fixture attempts, and the review-built derivative image. Final container,
volume, owned-image and custom-network lists are empty. Historical images and
checkpoints remain. The first cleanup successfully removed the containers/image
but its unprivileged signal to root-owned daemons failed; the retained error and
Docker events record that partial attempt. Cleanup resumed with `sudo -n` after
checking each PID's exact isolated-daemon command line. Only dockerd **137291**
and containerd **137093** under `/run/sr-r20` were stopped. The unrelated system
dockerd/containerd processes **976/792** remain alive. See `cleanup.json`, its
command journal, volume provenance and first-attempt events in raw accounting.

All **12 protected original/sibling checkouts** retain their initial statuses,
tracked diffs and untracked bytes. The converted WSU worktree is clean after its
authorized fix. No original WSU, sibling hook or GraphQL specification file was
written. No push, publication or Git tag occurred.
