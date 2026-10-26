# Sails retirement final review — round 22

**Five NEW class-(A) P2 findings; zero P1. All five are fixed. R22 does not
pass the confirmation gate.** SR-055 remains open because the gate requires a
round with zero new A/P1/P2 findings, rather than zero unfixed findings after
remediation. The task count remains **54/55**.

The incoming revisions were portal `f4cb14cfa6a1c015322c6b599bd4a352cb7cd1bb`
on `stack/sails-retirement` and converted WSU
`1b9b1ac4763c3439e8adc207f764f45a04a31d38` on `feature/v6-express`.
The institution delta remains portal `8b049580d..HEAD` and WSU
`14ab99e..HEAD`. Both AGENTS.md files, R18–R21, the institution evidence,
retirement contracts and the tracked hook-author/installation guidance were
read before reviewing. The ReDBox Hook Development, ReDBox Testing and
Diagnosing Bugs workflows informed the command and regression checks.

Final product inputs are portal **`55f00268e5b148451a3ee774c9a1fb4e1ec2629b`**
and WSU **`80b2b80c036cbfd286d36ac9140beee2421d42d5`**. The subsequent portal
commit containing this report changes evidence and task qualification only.
Full revision IDs, command arguments, exit codes, timings, source hashes and
raw-log hashes are in [machine accounting](final-review-r22/review-accounting.json).

## Findings and fixes

| Finding | Classification, concrete failure and introduced behavior | Fix and sensitive regression |
| --- | --- | --- |
| R22-01 — documented image IDs cannot be used as BuildKit inputs | **A/P2.** The converted WSU guide extracts bare `sha256:…` image IDs and supplies them as Dockerfile `FROM` arguments. A real clean-clone builder tries `docker.io/library/sha256:…` and fails to resolve it, despite the qualified image being loaded locally. | WSU **`6212c02cabf16bbc71ddd28771058e7b51d82358`** documents fixed, verified local tags, or published immutable repository/digest references for registry CI. Its executable guide regression rejects the previous image-argument transformation. The corrected exact guide command builds both stages successfully. |
| R22-02 — development build forces registry access for local qualified images | **A/P2.** `npm run dev:run:build` adds `--pull`, so the documented locally qualified portal tags fail with registry access denied. The same loaded inputs work without forced pulling. | WSU **`6212c02`** removes forced pulling. A regression executes the actual npm command with a Docker argument recorder and rejects `--pull`; the real development Compose build then succeeds with the fixed local inputs. |
| R22-03 — incomplete retirement of incompatible v5 entrypoints | **A/P2.** The converted branch retains npm core-mount commands, both old Compose files and the hook Mocha runner. These enter obsolete paths, fail with missing generated env/application paths or an empty builder image, or invoke Docker from the nominally retired cleanup command. They neither run v6 nor give conversion guidance. | WSU **`6212c02`** routes all three core-mount npm names to the existing retirement refusal, retires both old Compose files at interpolation and retires the direct hook runner. Executable npm/Bash regressions require a nonzero exit, v6-guide instruction and zero Docker calls. Actual legacy Compose invocations also refuse with that instruction. |
| R22-04 — published hook-author path still teaches removed APIs/tooling | **A/P2.** The author wiki installs historical registry tooling and demonstrates `Controllers`/Sails registration removed by retirement. The actual old controller sample fails against current core with **TS2305** (`Controllers` missing) and **TS2339** (`exports` missing); the pre-feature core exported `Controllers`. Services Architecture additionally invokes nonexistent unscoped `redbox-dev-tools` (**registry E404**). | Portal **`55f00268e`** replaces the obsolete author guide with the qualified built-source v6 init/install/build/check/pack sequence and corrects the linked service/customization pages. The new test executes the wiki shell block outside the portal, installs offline, compiles/packs and invokes the compiled `registerRedboxExtension()`, asserting API version 1. The incoming guide fails that test; all 39 final tooling tests pass. The offline failure alone is not the proof of the removed-API defect; the independent compiler and registry probes establish that failure. |
| R22-05 — fresh development startup lacks index preparation and actionable failure | **A/P2.** Following the converted development start path on fresh databases exits 1 with only `WSU startup failed Error`. A diagnostic replay establishes the actual cause: required persistence indexes have not been explicitly prepared. The documented installed maintenance commands do not supply a runnable development configuration/Compose recipe. | WSU **`80b2b80c036cbfd286d36ac9140beee2421d42d5`** adds `dev:run:indexes:inspect` and `dev:run:indexes:ensure`, using the same executable/configuration as development HTTP, and documents their separate execution before startup. The executable prints bounded guidance only for the exact known index-readiness error. The incoming subprocess test has **one pass / one failure**, and both cases pass after correction; an arbitrary provider message containing a synthetic private value remains hidden. Actual fresh inspect **2**, ensure **0**, initialize-only **0**, ordinary startup/readiness/pages and owned stop **0** verify the recipe. |

The combined build-entrypoint regression has **17 passes / five failures** on
the incoming implementation and **22 passes / zero failures** after the first
WSU fix. These 22 cases include the R21 wiring/context regressions. Two startup
diagnostic cases complete the current **555-test** WSU suite. Counts are nested,
not additional suite totals. Startup still never prepares indexes implicitly;
inspect/ensure remain explicit operator actions and ensure does not drop
conflicting indexes.

No new class-(B) defect or severe ordinary-user access-control exception was
verified. The inherited backlog remains **16 groups** and was not changed.
The task summary's historical R16/R17 labels and obsolete backlog count are
also corrected as a trivial P3 evidence correction, separate from the five P2s.

## Clean-clone and entrypoint settlement

The [complete command matrix](final-review-r22/entrypoint-matrix.md) lists all
**17 current npm scripts**, five build scripts, both Dockerfile stages, all
four Compose files, five CircleCI jobs and seven run steps, direct legacy/S3
scripts, WSU deployment commands and the portal author/installation commands.
Every row has an observed successful execution, a clear expected prerequisite
or retirement refusal, or an explicitly identified alias/transitive execution.
Published/native-architecture operations are not claimed as positive executions.

Three genuine Git clones were used, rather than source copies or dependency
links passed off as clean checkouts:

* The incoming `1b9b1ac` standalone clone has no sibling portal, `node_modules`
  or `dist`. With valid current image inputs, `bash support/build/test.sh`
  builds the builder target and passes **546 tests**. This independently verifies
  R21's builder-argument and source-context corrections in an actual Docker build.
* A development-layout clone uses the documented built sibling portal for host
  `npm ci`, build, full `npm test`, integration aliases and mounted development
  commands. The CI commands' `chmod +x` changes only the four documented script
  file modes in this disposable clone; that is not an unexplained dirty source.
* A final standalone clone at `80b2b80`, with no host dependency installation or
  compiled output, passes the exact CI builder command (**555 tests**) and the
  exact CI installed-integration command, then the always-cleanup command. Its
  final Git status is clean. It proves the image path does not depend on a hidden
  sibling checkout or host `dist`/`node_modules`.

The final pristine installed smoke asserts readiness, anonymous home/login HTML,
CSRF login, workflow forms, generated publication HTML/XML and ordinary
latest-PDF links before/after process restart, then owned stop. Both earlier
latest-revision `npm test` and the `:mocha` integration alias also pass. Provider
shutdown diagnostics (Solr's SIGTERM exit 143 and Seaweed stream-close messages)
occur after the portal's asserted successful stop; the specified Compose
`--exit-code-from rbportal` returns **0**.

The accepted development replay runs maintenance, initialization and HTTP
**sequentially**. Fresh inspection exits **2** with the explicit readiness report;
ensure exits **0**; initialize-only exits **0**. `/readyz` returns 200/ready,
`/default/rdmp/home` and `/default/rdmp/user/login` return **200 text/html**.
SIGTERM stops the portal with exit **0** and the npm Compose command returns
**0**. Both cleanup npm aliases succeed.

## Image provenance and qualification limits

The local inputs are **derivative images**, not fresh end-to-end builds of the
entire portal image graph. Their retained
[Dockerfile](final-review-r22/current-base.Dockerfile) copies the current built
core/dev-tools, core manifest/log transport and exact `path-to-regexp` 8.4.2 onto
the historical qualified bases:

| Input | Base image ID | Derived image ID used for WSU builds |
| --- | --- | --- |
| Portal test/toolchain | `sha256:2e86451c0651b1102d928a82a20e5c9c5460bb819688580ae06bc5c9835d3658` | `sha256:b46fd1f881f7b5ce8091706d52016890ec19846ab21b8f80edbd32811c11f87f` |
| Portal PDF runtime | `sha256:2ce824c3c7bef21b866a099481eb31494b087a182e56fa4a82237792f0a6e7c7` | `sha256:172929aeb9e87ef2dc6f37e15b48203f54b851170ff01e2911298a60e400927f` |

The local tags `redbox-portal:sr-r22-test` and `redbox-portal:sr-r22-pdf` are held
fixed and their IDs are recorded. All **2,024 core dist files and 46 dev-tools
dist files** in the copied inputs match the later complete successful portal
build byte for byte. The exact guide image at WSU `6212c02` is
`sha256:557a7c8651687275952b5abbfabd24930b5b7e65b899158d99bff87a76aa3577`;
the final pristine `80b2b80` integration image is
`sha256:49c9cab69a73b5d69e8beb58e7638646d4649ae248c2c216e050e2753cb17569`.
The latter's full image metadata and a latest-revision installed-hook member
hash inventory are retained in the raw evidence.

In this Docker/BuildKit environment, even a newly built local image named only
as `repository@digest` tried a registry lookup. Successful local builds use
the recorded tags. Published repository/digest CI inputs remain an explicit
registry prerequisite; this round did not publish an image to prove that path.

All deploy/local/manifest job command strings were invoked with credentials
deliberately absent and refuse at the named credential prerequisite before any
registry login or publication. Build-image omissions similarly refuse before
Docker. The executable argument-recorder regressions check both image arguments,
platforms, suffixes, load/push selection, temporary-image cleanup and failure
propagation without sending registry commands. No positive registry deployment,
manifest publication, CircleCI machine execution or native arm64 build is claimed.
Actual WSU production federation, credentials, TLS and replica-set arrangements
remain outside the authorized local-equivalent qualification.

## Verification and whole-delta closure

| Fresh check | Observed result |
| --- | --- |
| Complete portal `npm run compile:all` | **Exit 0**, all packages, 20 Angular applications/two libraries and Webpack; nine Webpack warnings, no failures |
| Portal `npm run package:pages` | **Exit 0** |
| Complete root tooling | **39 passing**, zero failures/skips; includes actual outside-portal author commands |
| Complete dev-tools suite | **60 passing**, including the nested 1,271 resolver comparisons and 41 CLI/import cases |
| Final pristine CI builder | **555 passing**, zero failures |
| Final host `npm test` | **555 unit tests plus installed integration passing**, exit 0 |
| Final pristine CI integration, npm `:mocha` alias | **Both pass**, exit 0; actual image builds/installed host, restart and stop |
| Documented external hook creation/build/check/pack | **Both migration and author wiki flows pass**, exit 0; service-guide init also passes |
| Development build/inspect/ensure/initialize/start/HTML/stop/cleanup | **Pass**, with fresh inspect's documented operator-action exit 2 |
| Build/CI/legacy/prerequisite matrix | **22 build cases and two startup cases pass**, plus actual command/refusal results in the matrix |
| Source closure at portal `55f00268e` | **1,223 candidates**, zero executable or forbidden-dependency violations |
| Source inventory at the same revision | **1,194 matched files**, zero unclassified |
| Baseline/added-candidate reconciliation | **All 1,261 baseline dispositions and 434 added candidates reconcile** |

The complete change-name comparison since R20's fully tested runtime revision
`5786b7e77` contains only review evidence/tasks, the R21 packed-test peer-policy
correction, the author wiki and its test. **No core runtime source, package
manifest or host executable changed.** R22's only WSU runtime change is the
bounded startup diagnostic described above, covered by the full WSU unit,
installed and development runs. Thus the user-requested condition for repeating
the full core/root/Mongo suites is not met. R20's full core/root/real-service,
Mongo 8/9, installed cutover/restoration and migration results remain explicitly
**historical R20 evidence**. The settled 25,000 resolver shapes, 1,423 migration
scenarios and R21 HTTP settlement were not reopened without a counterexample,
nor counted as fresh executions. The fresh 60-test dev-tools suite does repeat
its ordinary 1,271-case resolver regression.

## Excluded attempts, cleanup and task ticks

The raw ledger retains failed setup attempts rather than presenting them as
product results: initial isolated-daemon bridge/namespace setup; derivative
builds pointed at the wrong context; an initial builder run on the obsolete
unmodified historical test base (538 pass/eight failures); root-owned ignored
dependencies and an NVM-incompatible task-toolchain npm prefix during initial
portal compilation; and tests started while the dependency tree was still being
rewritten. The accepted complete compile and final suites run after those
conditions are corrected. `hook-guide-after-fix.log` is one of those dependency
write-race failures; the accepted guide pass is in `tooling-full-final.log`.

An early development harness accidentally overlapped ordinary startup with
initialize-only. Both drivers were cancelled and their results discarded, the
owned disposable project/data were reset, and the accepted sequential replay
above started again from fresh data. No user or institution data was involved.
These setup/driver failures are not silently counted as successful checks or
new product findings. The actual unsupported-image, obsolete-entrypoint,
removed-API and missing-index failures remain findings as recorded above.

All owned Compose projects (`sr-r22-wsu`, `sr-r22-dev-final`, `sr-r22-dev`) were
removed with volumes/orphans; final Docker listings show **zero containers,
zero volumes and no review network**. All five review image tags/images were
removed. The isolated dockerd/containerd processes, `sr-r22-br`, transient daemon
state and every temporary clone/context below `/mnt/docker-storage/sr-r22` were
removed. System Docker daemons, historical images/checkpoints and shared caches
were preserved. Cleanup identities and before/after listings are retained.

All **12 protected original/sibling hook checkouts**, including their tracked
diffs and untracked hashes, exactly match the initial snapshots. The authorized
converted WSU worktree is clean at `80b2b80`. No original WSU, sibling hook or
`support/specs/graphql-record-metadata/` file was written. No push, publication
or Git tag occurred.

| Task | Final tick and qualification |
| --- | --- |
| SR-005 | **[x]** WSU designation, released-source fallback and authorized local scope stand; production access/source gaps remain explicit. |
| SR-045 | **[x]** Historical generic replica-set and R20 installed WSU Mongo 8/9/FCV rows stand. R22 adds fresh disposable Mongo 8 command checks, not a new production topology qualification. |
| SR-049 | **[x]** Existing authorized local upgrade/restart/partial-failure/four-database restoration stands; no fresh R22 recovery rehearsal is claimed. |
| SR-055 | **[ ]** Five new A/P2s fixed; a subsequent round with zero new A/P1/P2 findings is still required. |

Raw logs and drivers remain under `.tmp/sails-retirement/final-review-r22/`;
the tracked ledger hashes those files. Node **26.11.1** and npm **11.20.0** were
used for the accepted host checks. The table and machine inventory make the
build/CI/deployment entrypoint settlement reproducible without broadening its
publication, architecture or production claims.
