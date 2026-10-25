# Final Sails retirement review — round 6

Reviewed `a49366803164429f9d8bdd249dadcdf856c9d13e` through initial HEAD
`c45385001` in the shared `stack/sails-retirement` checkout. Read R1–R5 and the
inherited backlog first, AGENTS.md, the eight requested specification documents,
and the relevant tracked wiki pages. Applied Code Review and Redbox Testing.
The independent [Standards](final-review-r6/standards-review.md) and
[Spec](final-review-r6/spec-review.md) reports retain their separate assessments:
three Standards findings and two Spec findings, all P2; the shared findings are
not counted twice. The parent review reproduced each candidate before fixing it.
No worktree, branch switch, push, publication or tag was used. The unrelated
untracked GraphQL specification remains untouched.

## Verified class-A findings

**Six class-A issues fixed: one P1 and five P2.** Each concerns feature-introduced
behavior or a newly written feature surface. Locations identify the corrected boundary in the
final runtime/test snapshot, `bfeac6770c726d0b66400b2d9f3faceb54fae0c6`.

| ID | Severity | Location | Reproduction and fix | Provenance | Fix commit |
|---|---|---|---|---|---|
| R6-01 | P2 | `packages/redbox-core/src/configuration/portal.ts:298`, `src/application/portal/providers.ts:232` | The documented `figshareDev` fixture configuration fails as an unknown key; production composition also hardcodes disabled/live mode. Validate and snapshot the supported fixture data, retain its defaults, and bind it into both selected Figshare consumers. Publishing/vocabulary regressions cover development/integration-test fixture behavior, production refusal, immutability and malformed values. The actual host qualifier captures the selected factory input. | New strict portal schema and provider composition omitted supported v5 configuration. | `c204936b0` |
| R6-02 | P2 | `packages/redbox-dev-tools/src/cli.ts:60`, `:100` | Public v6 `init` generates an exact TypeScript development dependency, but `check` exits 1 for that dependency and migration deletes it. Allow/preserve the explicit development compiler, normalize a nonexact compiler to the installed version, and retain runtime/peer restrictions. Exercise init → check → migrate → verify compiler → check through the actual CLI. | New v6 scaffold is incompatible with its own checker/migration. | `c9200d139` |
| R6-03 | P2 | `packages/redbox-core/src/application/portal/application.ts:398` | With every effective job using SQS, maintenance reports ready but normal initialization asks for three unselected Agenda Mongo indexes and rejects. Use `selectedAgendaMongoOptions` at startup, as at both maintenance entrances. The production composition regression covers all-SQS defaults and an explicit Mongo job override before any module initializes. | New application preflight omitted effective backend selection; R4 corrected only maintenance siblings. | `116435e22` |
| R6-04 | P2 | `packages/redbox-dev-tools/src/utils/config-helper.ts:104`, `packages/redbox-core/src/application/portal/http.ts:268` | Generated controller/add-method/Angular routes select nonexistent `authenticated`, causing production host preparation to throw. Emit the supported ordered authentication/brand/path chain; select and bind the owned `csrf` policy for write methods. Test actual emitted declarations against the real resolver and policy binder, and mount generated output in the production host. Document the required branded parameters and handler binding. | Feature-rewritten route generator and production extension-policy binding. | `6b9279a3c` |
| R6-05 | P2 | `packages/redbox-core/src/application/portal/http.ts:264` | Even a correctly declared protected route returns 404: its policy subrouter loses the outer route's branding/portal parameters. Enable Express `mergeParams`. The real host mounts generated output under `/research` and checks anonymous 401, verified bearer 200, session write without CSRF 403 and session write with CSRF 200, plus restart and clean stop. | Newly written production extension policy router. | `c696a816c` |
| R6-06 | P1 | `packages/redbox-core/src/http/express/multipart.ts:88` | End a file part without its terminating multipart boundary. Busboy emits a native parser error, consuming the one-shot listener; the downstream staging rejection destroys it with a second error, which is unhandled and can terminate the host. Keep observing errors and cancel streams once, preserving the first failure. Native parser errors return 400; provider/limit failures retain their status. Actual HTTP regressions verify staging cleanup, a successful subsequent upload, and drain waiting for gated disk cleanup after truncation. | Feature-owned parser. Discovered while finishing the interrupted review; separate from the five already committed fixes. | `bfeac6770` |

Every fix commit ends with the requested GPT-6.1-sol co-author trailer. No
dependency was added or loosened. These fixes use the existing schema, effective
backend selector, HTTP policy/CSRF implementation and standard Express parameter
inheritance. No new lifecycle manager, retry system or locking abstraction was
introduced.

[Focused negative controls](final-review-r6/regression-sensitivity.json) record
counts and hashes. Reviewed-head Figshare configuration fails the recognized
fixture case (1 passing/1 failing); the corrected configuration corpus passes 14.
The original scaffold check fails (0/1); the corrected full CLI file passes 8.
Substituting only the reviewed-head application preflight fails the all-SQS case
and retains the Mongo positive control (1/1); corrected preflight plus maintenance
passes 12. Reviewed-head generated output fails policy binding (0/1); the corrected
controller generator file passes 4. Reverting only compiled parameter inheritance
makes the actual final host regression fail with 404 instead of 401 (0/1); the
corrected production host and generated-application qualifiers each pass.
Focused controls are sensitivity evidence, not substitutes for full suites.

The completion-run truncated-body regression fails on the reviewed parser with
an uncaught second parser error and a 500 response (0 passing, 2 reported
failures for the one case). Changing only the error listener to persist removes
the uncaught failure but retains the wrong 500 (0/1). The complete correction
passes all 11 actual HTTP multipart tests, including a gated truncation/drain
interleaving. The earlier scratch probes are retained as preliminary evidence;
the checked-in real-HTTP regression is the accepted reproduction.

Rejected preliminary attempts are kept explicit. Early queue fixtures used an
unbound operation or failed to override the default jobs that explicitly select
Mongo. Only the final red/green queue logs are accepted. The first maintenance
probe used the historical image executable; current executables were copied before
accepted runs. The first new host fixture omitted its explicit handler binding;
a later attempt retained Secure cookies on its plain HTTP listener. Those fixture
errors were corrected and are not product findings. The final parameter control
uses the complete corrected fixture. Preliminary builds and focused runs do not
stand in for final-tree qualification.

## Inheritance and critical R5 assessment

**No new class-B item was verified; no inherited defect was fixed.** The three
existing P2 items remain in the [inherited backlog](inherited-defects-backlog.md).
No new candidate met the critical-security exception.

**No R5 fix was found wrong or reverted.** Reviewed the multipart parser/provider
write join on failure and abort; both extension composition paths' policy result
ownership; the completed-primary save fallback; login/session cookie handoff and
its six siblings; and the multipart field-order documentation. Focused lifetime,
upload and configuration checks pass 27 cases; the complete relevant suites are
also included below. R5's retained returned policy work uses existing HTTP
admission tracking; provider writes remain owned through actual cleanup; save
fallback independently confirms primary bytes without authorizing foreign staging.
No new hang, lost work or double work was reproduced. Hidden work that a trusted
callback neither returns nor registers remains outside the documented ownership
contract.

## Additional review

Reviewed configuration layering, ordinary-array replacement, named Agenda merging,
executable positions, immutable snapshots, safe diagnostics, explicit file/native
ESM loading, environment/CLI precedence and legacy alias conversion. Aside from
R6-01/R6-03, no additional verified class-A issue was found. Checked offline
extension discovery, deterministic first-listed-highest priority, replacements,
prerequisites, public exports, error reporting and migration ordering. R6-04/R6-05
close the reproduced generated/protected-route integration failures; other
reviewed extension/scaffold contracts had no additional verified defect.

Compared Docker/deployment entrypoints, health/readiness wiring, signal/grace
configuration, optional native provider packaging, maintenance inspect/ensure
selection and exit codes, and the v5 configuration/hook conversion paths with
code and runbooks. Rechecked design §1.3 against V6-Client-Compatibility.md and the
owned authentication, brand/object policies, 401/404 behavior, CSRF/logout, upload
ownership, progress protocol, Companion lifetime, diagnostic and recovery contracts.
No additional reproduced discrepancy was found. The generated fixture remains a
qualification fixture, not a designated institution.

This is a bounded feature review. Existing historical immutable artifact/topology
results qualify their original source; they are not new evidence for these fixes.
The full current mounted/compiled-tree qualification is recorded separately below.

The completion review also applied the Diagnosing Bugs workflow. It critically
read all five existing R6 fixes and found none
incorrect or regressive. A hash audit checks 1,320 source, test, configuration,
template and executable files in the qualification container against the current
checkout, with no differences. The interrupted agent's existing full driver
completed on `c696a816c`; its real-service process exited naturally after finite
five-minute timers expired. Diagnostic inspection found only those timers and
standard I/O, with no provider socket or child process. R6-06 was then reproduced
from two unfinished scratch probes and fixed separately. The complete final
driver is rerun on `bfeac6770`; the earlier gates are preserved under
`pre-completion-fix/` and superseded, rather than reused for the corrected tree.

## Final-tree qualification

**All requested final gates pass, with zero final failures.**
[Machine-readable results and 297 evidence hashes](final-review-r6/qualification.json)
separate accepted final results from negative controls, superseded qualification
and rejected local-driver attempts. Every recorded hash was checked against its
local file before the evidence commit.

The qualified runtime, configuration and test inputs are the same committed
revision, `bfeac6770c726d0b66400b2d9f3faceb54fae0c6`. After R6-06, the entire
R5 sequence was repeated, including all builds, static gates and full suites;
no earlier `c696a816c` gate substitutes for a final result. Closing changes are
documentation/evidence only.

| Gate | Result | Evidence under `.tmp/sails-retirement/final-review-r6/` |
|---|---|---|
| Full ordinary core Mocha | 4607 passing, 7 unchanged pending | `core-default-final.log` |
| Full separately collected real-service core | 213 passing, zero pending/failures; natural process exit | `core-real-final.log` |
| Isolated Companion lifecycle/uploads | 2 + 6 passing | `CompanionLifecycleProbe-final.log`, `CompanionUploadsMongo-final.log` |
| Full root Mocha | 422 passing, 10 unchanged pending; resources/operations/clients/pools zero after stop | `root-final.log` |
| Full storage Mongo Mocha | 306 passing | `storage-final-clean.log` |
| Full dev-tools Mocha | 52 passing | `dev-tools-final-clean.log` |
| Full PDF unit Mocha | 79 passing | `pdf-unit-final.log` |
| Full Playwright and harness | 124/124 browser cases, no skips; harness 19/19 | `playwright-full-final.xml`, `playwright-harness-final.log` |
| Dedicated retirement browser | 4/4, no skips; real Keycloak/tus/Companion/PDF, durable completion and stop retry; pools/clients/upgrade listeners zero | `retirement-browser-final.xml`, `retirement-browser-final.log` |
| General Bruno | 309/309 requests, 554/554 tests, 3/3 assertions | `bruno-general-final.xml`, `bruno-general-final.log` |
| Dedicated OIDC Bruno | 13/13 requests, 17/17 tests | `bruno-oidc-final.xml` |
| Dedicated S3 Bruno | 7/7 requests, 12/12 tests; fresh XML/executed counts verified | `bruno-s3-final.xml` |
| Native PDF integration | 4/4 requests, 10/10 tests; fresh XML/executed counts verified | `pdf-final.xml` |
| Production host/generated application | 1 + 1 passing; generated fixture remains distinct from the undesignated institution | `production-host-final.log`, `generated-institution-final.log` |
| Compiled persisted-hook qualification | 5/5 | `hook-qualification-final.log` |
| Builds/typechecks/generated contracts | Five packages compile; six exact core configurations and root pass; Prisma contracts and portal schema verified | `build-final.log`, `typecheck-*-exact-final.log`, `prisma-check.log`, `portal-config-check.log` |
| Lint/import boundaries | 936 files, zero warnings/errors | `lint-final.log` |
| API docs/generation/audit/tests | Generation/audit pass; 43 published surfaces, 524 unchanged advisories, 4/4 tests | `doc-api-final.log`, `docs-*-final.log` |
| Exact dependencies/locks | 23 manifests, 376 declarations, 20 permitted local references, zero violations; six changed lock roots consistent | `dependency-pins.json`, `lockfile-consistency.json` |
| Retirement tooling regression | 8/8 | `closure-tests-final.log` |
| Installed compiled-tree closure | 6135 files; zero executable/forbidden violations | `compiled-tree-closure-final.json` |
| Committed source closure/inventory (`bfeac6770`) | 1078 closure files, 1049 inventory matches; zero executable/forbidden/unclassified violations; 1261/1261 baseline entries reconciled | `source-closure-qualified.json`, `source-inventory-qualified.json`, `reconciliation-qualified.json` |

Pending Mocha cases are not counted as passing coverage. Fresh browser/API XML
has no skips. Overlapping suites are not added into a synthetic coverage count.
The final input audit was repeated after all suites and Bruno artifact restoration:
all 1,320 selected source/test/configuration/template/executable files matched the
qualification container. The complete real-service main process exited naturally;
its finite timers were allowed to expire without cancellation or forced exit.

Used the same isolated existing Docker daemon as R5,
`unix:///run/sr-p7-isolated/docker.sock`, with current mounted source/tests, current
executables and all five rebuilt compiled-package overlays. Verified Node
26.11.1, npm 11.20.0 and MongoDB 9.0.4 in the actual containers; the toolchain
witness records their exact image IDs. Reused P8's historical toolchain/rehearsal
and native-browser artifacts. **No image was built, and no replacement immutable
image or topology-matrix qualification is claimed.**

Two rejected final-tail setup attempts remain explicit. On the first rerun of the
local driver, it matched an old ready marker before the detached fixture truncated
its log and wrote `sr-pages-host.json`; Docker reported that the file was missing.
Clearing that root-owned log directly from the host then failed with `Permission
denied`. Corrected the local driver to clear its readiness log and PID artifact
through the owning container before launch. `run-completion-tail.sh` reran the
entire PDF-unit/retirement-browser/persisted-hook tail successfully on unchanged
`bfeac6770`. The rejected attempts are retained under `rejected-tail-readiness/`
and `rejected-tail-log-permissions/`; neither supplies a final gate or adds a
product finding. `full-sequence.tsv` contains all six final PASS stages, and
`full-driver.log` preserves both failures followed by the successful completion.

## Cleanup and checkout

All four round-owned Compose projects were removed with their volumes. Removed
the six standalone containers, all three captured anonymous volumes, the
`sr-final-r6-profiles` network and the three exact round-owned firewall rules.
Final queries find zero owned containers, networks, volumes or firewall rules.
No image was built, so no round-created dangling image remains to remove. The
existing unrelated dangling image dates from October 14 and was left untouched.
Docker storage has 8.6 GB free after cleanup. See `container-cleanup.log`,
`network-cleanup.log`, `firewall-cleanup.log`, `volume-cleanup.log`,
`remaining-owned-*.log`, `dangling-images-*-cleanup.log` and
`disk-after-cleanup.log`.

Preserved the incoming Bruno diff as `generated-bruno-fixture-changes.patch` and
the final rerun's generated diff as `generated-bruno-final-run.patch`, then
restored only `test/bruno/environments/int-test.bru` and
`test/bruno/package-lock.json`. The environment contained run-specific values.
The lock mutation changed only its top-level name from `bruno` to `bruno-tests`;
the manifest has no name field, so there is no deliberate manifest-name correction
to retain. Dependency/lock checks were repeated after restoration. No Bruno
change is committed. The unrelated untracked GraphQL specification is untouched.

Closing-tree inventory, closure and reconciliation checks are rerun after the
evidence commit, with local outputs `source-closure-final.json`,
`source-inventory-final.json` and `reconciliation-final.json`. These are separate
from the qualified runtime/test snapshot above. Final `git diff --check` passes;
the only remaining untracked path is the explicitly excluded GraphQL specification.

## Remaining acceptance

**SR-005/045/049/055 remain unchecked solely because no representative institution
is designated.** This accepted gap was neither flagged as a new issue nor closed.
The final response records the resulting HEAD after this evidence commit; this
file cannot name its own containing commit. Closing evidence changes do not alter
the qualified runtime/test inputs.
