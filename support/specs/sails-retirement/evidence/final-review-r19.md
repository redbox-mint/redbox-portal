# Sails retirement final review — round 19

> R20 correction: the opening statement below that remediation met the final
> gate is superseded. The gate requires a round with zero new class-(A) P1/P2
> findings. R19 found four, so its successful remediation did not close that
> confirmation requirement. Its recorded test results and artifact scope remain
> historical evidence; see [R20](final-review-r20.md).

**Four introduced class-(A) P2 findings; no P1; all four fixed. Zero class-(A)
P1/P2 findings remain open, so the gate is met after remediation.** This
confirmation round found further export-validation and migration defects; it was
not a zero-finding round. SR-005, SR-045, SR-049 and SR-055 remain checked for
the explicitly authorized local WSU cohort, with the limits below.

Reviewed the complete portal delta `8b049580d..60f93bc29` on
`stack/sails-retirement`, including incoming `dbf0bc87f`, and WSU
`14ab99e..c1c847d` in the separate `redbox-hook-wsu-v6` worktree, including
incoming `3c76484`. Read both AGENTS.md files, the retirement contracts, tracked
wiki standards, R18 and institution evidence. Code Review and ReDBox Testing
skills informed this review. The independent incoming-tree
[Standards](final-review-r19/standards-review.md) and
[Spec](final-review-r19/spec-review.md) reports exclude concurrent fixes and are
retained as originally returned. Their open findings are resolved below.

## Findings and remediation

| Finding | Classification and user effect | Fix and regression |
| --- | --- | --- |
| R19-01 — nested export fallthrough | **A/P2.** A valid `{node:{require:"./dist/index.cjs"},default:"./dist/index.js"}` import was rejected. An unmatched nested condition was conflated with selected `null`. | Portal **`60f93bc29912d17236363fbf19bbdbd960f8ffe6`** distinguishes unmatched conditions, null, invalid target and invalid configuration. The real CLI/import table covers nested object/array fallthrough, null masking and Node 26 conditions. The incoming checker fails the new nested regression. |
| R19-02 — public export patterns | **A/P2.** A valid declared subpath exposed by `{"./*":"./dist/*.js"}` was rejected because the checker required an exact export key. | Portal **`60f93bc29`** selects the matching public pattern using Node specificity, substitutes its match, and retains exact-key/null masking. CLI/import regressions cover wildcard exports, competing prefix/suffix patterns and explicit masking. Incoming and corrected Node comparison probes demonstrate the false rejection and its correction. |
| R19-03 — invalid encoded targets | **A/P2.** Targets containing encoded `..`, `node_modules`, dot segments or separators could pass preflight but fail Node import. Declaration targets with query strings also escaped the runtime-type check. | Portal **`60f93bc29`** validates decoded target segments and distinguishes target-selection errors from errors after selection, preserving array fallback semantics. CLI/import cases reject encoded invalid paths, malformed escapes and declaration targets with queries. Incoming probes accept the invalid targets while Node rejects them; corrected probes agree. |
| R19-04 — stale vocabulary lookup keys | **A/P2.** The converted migration port applied raw `$set` after `prepareVocabulary`, bypassing the old model's update normalization. Pending September 1 migrations could write `value: "Open"` while retaining the old `valueLower`, so notation lookup missed the migrated value. | WSU **`c1c847ddb4b09673cfff65e5d85f0eb527164f7b`** uses the application's owned vocabulary repository `reviseEntry`. Two regressions exercise the actual migration functions through repository normalization, checking retained fields and idempotence. Both fail on the incoming implementation. An installed-image probe reproduces the stale key before the fix; both Mongo majors pass value/key/lookup/retention/idempotence checks afterward. |

Both commits have the requested coauthor trailer. No dependency was added or
changed. No new class-(B) P1/P2 group, actionable P3 defect or severe inherited
access-control exception was verified; the existing **14 B groups** remain in
the [inherited backlog](inherited-defects-backlog.md).

## Confirmation of the four R18 fixes

1. **View preflight — `17f56f6ed`: confirmed.** Its negative fixture covers the
   WSU-breaking `TranslationService`, `BrandingService` and ancestor `functions`
   include, plus `CacheService` and `sails` member uses. The regression fails
   against an isolated pre-R18 CLI snapshot. Positive fixtures accept page
   locals, supported installed partials, comments, strings, prose and escaped
   EJS. Read-only scans of bundled core views and WSU v6 views return **zero**
   findings; WSU's built `check --v6` exits **0**. Read-only UWA/JCU scans find
   **16/59** legacy usages and their CLI checks exit **1**. The original/sibling
   working-tree statuses and untracked-file hashes match the initial capture.
   This remains a bounded check of known uses in conventional `views/`, with
   custom roots/helpers/aliases and installed rendering requiring review.
2. **Runtime exports — `17f56f6ed`, `916fd0dad`: completed by R19.** The original
   null/types-only/root-shorthand/import-condition regressions remain sensitive
   and green. Confirmation found R19-01/02/03 above, so R18's completion claim
   required correction. The final table compares **36** real CLI checks with
   actual Node imports. A separate **51-case** resolver differential has **zero
   mismatches**, treating declaration files as unsupported runtime targets even
   when `import.meta.resolve` can locate them. This validates declarations; it
   does not execute arbitrary hook code or prove build output exists.
3. **Publication delivery — WSU `3c764847a`: confirmed.** The advertised generated
   URL test fails **404** without the route. The full WSU suite covers directory
   and explicit index HTML, both XML formats, HEAD, invalid paths, missing files,
   symlinks, draft/embargo/withdrawal/wrong-type exclusions and eligibility changes.
   Fresh installed generation/HTTP reads pass before and after restart. The
   attachment route separately requires current publication eligibility, the
   linked source, matching publication/source brands and an explicitly selected
   file. No additional access-control regression was verified.
4. **Retired dependencies — `0b8334c5c`: confirmed.** A neutral manifest with
   forbidden framework dependencies fails across runtime/dev/peer/optional
   sections; the same regression passes the invalid manifest without the fix.
   The three exact historical neutral package names remain supported. Root graph
   controls and the installed WSU audit independently reject forbidden packages
   and edges and enforce exact owned pins.

## Complete-delta safety review

**Standards axis:** the independent report found no additional non-tooling
documented-standard violation or actionable baseline smell; dependency pins
comply. It reported the four correctness findings above. **Spec axis:** the
independent report confirmed R19-01 and found no further scope or safety defect.
These are overlapping reviews, not additional findings.

Reviewed WSU routes, policy bindings, handler dependencies, publication output
eligibility/paths, migrations and persistence port, finite persisted-declaration
conversion, deployment inputs, qualification drivers and their data fencing.
Brand policies filter actor roles to the requested brand before handler Admin
checks. Latest-PDF delivery checks record view permission. Public attachment
delivery cannot use an unrelated publication or cross-brand source, unselected
file, draft, embargoed or withdrawn publication. Generated publication delivery
rechecks eligibility and allows only the expected HTML/XML names. Existing ACL,
CSRF, cross-brand and publication negative cases pass in the full WSU suite.

Migration review found and fixed the vocabulary normalization loss. The converted
adapter uses application-owned pools, repository codecs/reference identifiers,
server-owned record revisions, audit behavior and the retained migration IDs.
Known hook declarations are converted only in designated fields; unknown
expressions still fail strict core validation, and queued updates compare the
old value before replacing it. The runbook still requires stopped writers,
explicit index maintenance, backups and external-effect reconciliation: migration
bodies/DDL are not transactional and switching images cannot undo writes.
No further introduced data-loss or access-control defect was verified.

## Fresh verification and artifact provenance

Host toolchain: **Node 26.11.1 / npm 11.20.0**, from the recorded task-local
toolchain. Commands, inputs, outputs, exit status, provenance and SHA256 ledger
are in [machine accounting](final-review-r19/review-accounting.json).

| Fresh verification | Result |
| --- | --- |
| Full dev-tools suite / TypeScript build | **59 passing**, build exit **0** |
| Full WSU compile/unit suite | **440 passing**, exit **0** |
| Full root tooling suite | **38 passing**, zero failures/skips |
| Final dev-tools packed consumers with unchanged built peer packages | **12 tarballs / 20 checks**, production/offline isolated install, CJS/ESM/TLA and compiled scaffold pass |
| Real CLI/import table / separate resolver differential | **36 / 51 cases**, all final expectations pass, zero differential mismatches |
| Read-only core/WSU/UWA/JCU view scans | **0 / 0 / 16 / 59** findings |
| Installed WSU integration | Home/login/CSRF, forms, real generated HTML/XML HTTP before/after restart, stop: pass |
| Installed separate-store matrix | Mongo **8.0.34 / FCV 8.0** and **9.0.4 / FCV 9.0**: pass; both processes naturally exit **0**, zero pools/Prisma clients |
| Actual installed vocabulary migrations on both majors | Both migration functions normalize value/key, notation lookup succeeds, unrelated data retained, second run unchanged; zero pools |
| Installed cutover/restart/stop | Explicit maintenance/initialization, five retained record/form/workflow/editor reads, S3 content check and both stops exit **0** |
| Partial initialization failure / checkpoint restoration | Real core/storage writes followed by failure, no activation, zero pools; exact four-database restore: **28 collections / 5,162 documents** |
| Source AST/dependency closure | **1,208 files**, zero executable/dependency violations |
| Original inventory reconciliation | All **1,261** baseline files accounted for; **742** classified, **136** removed, **365** retained without candidates, **18** dependency metadata checked |
| Installed corrected WSU AST / dependency graph | **4,095 files / 1,230 manifests**, zero executable/forbidden packages/edges; exact owned pins |
| Historical evidence integrity | All **66** original WSU and **83** R18 recorded raw files match their hashes |

The corrected installed WSU image was
**`sha256:83b888540e4e7c7732479edeabda854088ddf68fbfb9e2339ae4a52e713c9926`**.
Its source context is a clean **226-file Git archive of `c1c847d`**, with every
file compared to that commit. The hook's unchanged build stages compile, pack
and install it on the already qualified clean portal/PDF runtime
`sha256:2ce824c3c7bef21b866a099481eb31494b087a182e56fa4a82237792f0a6e7c7`
(portal `03c2cbad5`). Configuration and test drivers are mounted explicitly;
application source/dist/dependencies are not overlaid for installed checks.
The installed AST auditor is mounted outside the scanned tree.

This is an exact hook rebuild on the unchanged qualified portal application
runtime, not a fresh rebuild of every portal package. Final dev-tools `60f93bc29`
was separately rebuilt and packed; the other packed packages use their existing
unchanged qualified build outputs. Git comparisons confirm no portal core
application runtime change. R16/R18 broad core/browser/Bruno/Angular results,
the original bare/bundled image qualification and the original complete native
recovery remain **historical evidence**, not new executions or counts. No core
runtime change required repeating those broad suites.

## Evidence honesty and task disposition

| Task | R19 disposition |
| --- | --- |
| **SR-005** | **Stands.** WSU remains the designated representative institution. Released v5.0.4 plus compatible historical WSU `4996206` remains the explicitly authorized source fallback; latest-hook `14ab99e` failure/peer/compiler limits and actual-production source gaps remain disclosed. |
| **SR-045** | **Stands.** Both selected Mongo/FCV rows repeat successfully on the final corrected installed WSU hook with its separate standalone stores, local S3/Solr/auth topology. Real production TLS/auth/replica-set membership and in-place engine upgrades remain unqualified. |
| **SR-049** | **Stands.** Final-hook cutover, retained reads, explicit maintenance, restart/stop, partial initialization failure and exact database checkpoint restoration repeat. The original complete native recovery, including archive-loaded source image, files/config/hook/Solr/S3, remains historical and is not claimed as wholly repeated here. |
| **SR-055** | **Stands after R19 fixes.** Final hook installed qualification, final tooling build/packed checks, affected full suites and source/installed closure pass. Historical broad runtime evidence is identified separately. The R18 zero-open assessment is superseded by this remediation record. |

Production image/configuration/source coverage, federation credentials, ingress/
TLS/IAM, replica-set topology, production workload/search/provider effects and
operator engine/FCV procedures remain the unchecked acceptance work listed in
[WSU evidence](institution-wsu.md#sr-055--final-artifacts-inventory-and-task-disposition).
Local qualification does not assert production acceptance or authorize release.

## Failed attempts, cleanup and retained evidence

The regression sensitivity logs intentionally fail: three pre-R18 CLI checks,
pre-route publication HTTP, incoming nested export, both incoming vocabulary
tests and the old installed vocabulary implementation. Incoming wildcard and
encoded-target probes also retain the discrepancies. They are not passing runs.

An initial export-test tuple inference compile error was corrected before the
genuine regression run. One full dev-tools run passed its assertions but exceeded
the old 180-second subprocess-test allowance under concurrent verification load
(58 pass/one timeout). The 36-subprocess test allowance is now 360 seconds; the
final full run passes all 59. The first installed vocabulary probe omitted
explicit index maintenance and failed its prerequisite; after correction the
old image fails the genuine stale-key assertion and both final rows pass.
An initial auditor mounted itself inside its scanned tree and reported nine
self-findings; mounting it outside produces the final zero-violation result.
The first owned Docker daemon selected an empty containerd namespace; it was
restarted with the durable qualification namespace before building. An earlier
exploratory image context included extra verification files; it is superseded by
the clean archive build above. None of these attempts is counted as a pass.

All transient verifier containers were removed. Compose cleanup removed the
remaining **six service containers and ten attached anonymous volumes**; final
container, volume and custom-network listings are empty. Both review-built images
(`redbox-wsu:r19` and `redbox-wsu:r19-final`) were removed. Only the two owned
`/run/sr-r19` Docker/containerd processes were terminated and confirmed stopped.
Existing historical images/checkpoints and the durable cache remain; unrelated
system daemons were not targeted.

Raw scripts/logs are retained under `.tmp/sails-retirement/final-review-r19/`
and `/mnt/docker-storage/sr-wsu/final-review-r19/`; accounting records their
hashes and reproduction entrypoints. Original WSU and UWA/JCU statuses and
untracked bytes match the initial capture; the sibling Dockerfile modifications
were pre-existing. No write was made to those checkouts, other sibling hooks or
`support/specs/graphql-record-metadata/`. No push, publication or tag occurred.
