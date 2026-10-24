# P7 qualification

Recorded on agentvm, Linux amd64, branch `stack/sails-retirement`. This is
qualification evidence with explicit incomplete gates, not release acceptance.
No P8 retirement, registry publication, push, branch switch or worktree was used.
The unrelated untracked GraphQL specification was left untouched.

## Source and exact tools

- Starting source: `4249667dcec90f49cf4302c77f0d568e2c1b4948`.
- Earlier corrected component and clean package/image source:
  **`58f7cbbd60e23881cdfea9fbcb712ab2b01914ca`**. Database drivers originated in
  `513bd8505`; recovery drivers/runbook in `cb10596b1`. Historical runs at the
  starting source are identified separately; they are not relabeled as final-source
  qualification.
- Initial Docker install-policy correction: `faadc1defff7bea7d2534673732ff54746de5297`.
  It makes script-free/strict flags explicit across subproject boundaries; it
  did not resolve the missing peer lock. The subsequent strict peer-lock repair
  is `4254c2ee2`; [cause, exact additions and red/green preflight](p7-peer-lock.md).
  No existing package versions or direct dependency manifests changed.
- Execution: Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**,
  ts-node **10.9.2**, Mocha **11.7.6**, Playwright **1.64.0**.
- Prisma ORM **8.0.0-rc.19**, CLI **8.0.0-rc.24**; Docker **29.6.1**,
  Compose **5.2.0**.
- MongoDB **8.0.34 / FCV 8.0**:
  `mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
- MongoDB **9.0.4 / FCV 9.0**:
  `mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`.
- Node builder:
  `node:26.11.1-bookworm@sha256:f1233c415b41ffcf237c717b3dea92e9d4ea006e0e4c71edcb790605d74f5404`.

Node was selected explicitly; the login shell's default Node 24 was not used for
v6 tests. The released comparison retains its own Node 24.16.0, as required.

## SR-045 — Database matrix

### Completed production matrix

Application source **`11e6f6277`**, runner **`f2a5ce474`**, checkout at start
**`212ec2ed9`** (subsequent commits only changed evidence). The corrected core
compiled normally; route lint reports zero warnings/errors. Image installation
was paused while these deadline-sensitive checks ran; no application/test
assertion or deadline changed.

```sh
DOCKER_HOST=unix:///run/sr-p7-engine.sock \
SR_P7_DATABASE_RUN_ID=11e6f6277-serial \
SR_P7_DATABASE_LOGS="$PWD/.tmp/sails-retirement/p7/database-11e6f6277-serial" \
SR_P7_PRODUCTION_PORTAL=true SR_PORTAL_SOLR_PORT=8983 \
  bash support/integration-testing/qualify-sails-retirement-databases.sh
```

| Engine / FCV | Physical topology | Component | Full portal | Persistence | RecordTypes | Lifecycle | Failures / skips |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 8.0.34 / 8.0 | Separate standalone core/storage servers | 1 | 1 | 30 | 10 | 12 | 0 / 0 |
| 8.0.34 / 8.0 | Two independent three-member sets | 1 | 1 | 30 | 10 | 12 | 0 / 0 |
| 9.0.4 / 9.0 | Separate standalone core/storage servers | 1 | 1 | 30 | 10 | 12 | 0 / 0 |
| 9.0.4 / 9.0 | Two independent three-member sets | 1 | 1 | 30 | 10 | 12 | 0 / 0 |

**216 passing / 0 failing / 0 skipped / 0 cancelled; runner exit 0.** Both the
component and complete production portal step down **each** datastore's primary
in **each** replica row and require a different elected member. Existing owners
reconnect, read/write retained records and actual GridFS bytes, retain pools over
a failed drain deadline, retry stop and restart a fresh owner. The complete
production graph serves authenticated APIs/pages/assets/translation, enforces
401 and optimistic-concurrency 412, exposes readiness 503 before activation and
200 afterward, and finishes with zero pools/Prisma clients and no global Sails.
Whole production verifier durations: **21.226 / 42.947 / 17.015 / 42.323 s**.

All **16** Mongo containers and their owned anonymous volumes were stopped and
removed: 16 successful entries in each cleanup log and an empty final name
filter. The owned dependency installer resumed afterward. Exact versions/FCVs,
member/election observations and counts are retained in
[production results](p7-production-database-results.json); raw logs remain under
the command's ignored directory. This completes the requested local matrix;
SR-005's institution/topology/TLS/auth/source designation remains external.

The prior `2aae5ba50` retry passed Mongo8 standalone (1+1+30+10+12) and the
Mongo8 replica component/elections, then its complete portal aggregate hit the
unchanged 120000 ms bound while browser/provider work ran. It exited **1** and
cleaned all eight containers. The serial rerun above passed without changing
that bound (Mongo8 replica **42.947 s**). Do not count the interrupted retry as
a complete matrix.

### Historical component-only qualification

The new executable runner is
`support/integration-testing/qualify-sails-retirement-databases.sh`, with
`packages/redbox-core/test/qualification/{database-matrix,matrix-topology}.cjs`.
Each row uses distinct physical Docker containers for core and storage. Replica
rows use **two independent three-member replica sets**, not one-member sets or
two databases on one server. Mongo containers have `nofile=64000:64000`, 768 MiB
limits and 0.25 GiB WiredTiger caches. They bind localhost with host networking.

The matrix case queries actual server versions/FCVs and members; inspects,
ensures and reinspects indexes; initializes real storage/RecordTypes and the
migration ledger; probes Express readiness and a persisted type; creates a record;
steps down both primaries; requires different elected primaries and reconnects
existing owners; writes/downloads GridFS bytes; verifies physical placement;
holds an accepted write across a failed stop deadline, retains pools until retry;
reopens with a fresh owner; and rejects the stale handle. Its import check rejects
Sails, the comparison barrel and compatibility modules. **One aggregate node:test
case per row** is counted, not its individual assertions.

The existing persistence, RecordTypes and lifecycle suites also run on each row.
The persistence suite retains its own logical-database layout on the supplied
core server; it is the new aggregate case that proves physical split placement.
This is persistence/application/HTTP-component qualification, not a full portal.

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
DOCKER_HOST=unix:///run/sr-p7-engine.sock \
SR_P7_DATABASE_LOGS="$PWD/.tmp/sails-retirement/p7/database-58f7cbb-serial" \
  bash support/integration-testing/qualify-sails-retirement-databases.sh
```

The runner logs topology initialization, container image/limit/command inspection,
the aggregate case, all three unchanged existing suites, and actual cleanup. An
unsuccessful cleanup makes the runner fail. This complete invocation exited **0**.

| Engine / FCV | Physical placement/topology | Aggregate | Persistence | RecordTypes | Lifecycle | Failures / skips |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 8.0.34 / 8.0 | Separate standalone core/storage servers | 1 | 30 | 10 | 11 | 0 / 0 |
| 8.0.34 / 8.0 | Separate core/storage sets, three members each | 1 | 30 | 10 | 11 | 0 / 0 |
| 9.0.4 / 9.0 | Separate standalone core/storage servers | 1 | 30 | 10 | 11 | 0 / 0 |
| 9.0.4 / 9.0 | Separate core/storage sets, three members each | 1 | 30 | 10 | 11 | 0 / 0 |

Total: **4 aggregate cases + 204 unchanged existing tests**, zero failures,
skips, pending or cancellations. The aggregate process durations were **5.544,
27.595, 6.778 and 28.184 seconds** respectively. These are whole component qualification
process durations, not portal startup/latency benchmarks. Mongo8 primaries changed
core **29211 → 29213**, storage **29221 → 29222**; Mongo9 changed core
**29411 → 29412**, storage **29421 → 29422** (all localhost). Accepted writes,
GridFS and fresh-owner reads passed after those actual elections.

[Sanitized machine-readable results](p7-database-results.json) retain row counts,
versions/FCVs, elections and durations. Cleanup stopped and removed **all 16 Mongo
containers and their owned anonymous volumes**, 16 successful entries in each
cleanup log; the complete runner exited 0. An independent full-core test server
was separately stopped/removed, both commands exit 0.

### Failed attempts and harness corrections

- An early GridFS run found an out-of-date local storage-hook installation using
  MongoDB driver 6.21.0 against core's pinned 7.7.0 (`BSONVersionError`). Repeating
  `npm --prefix packages/sails-hook-redbox-storage-mongo ci --ignore-scripts
  --strict-peer-deps --no-audit --no-fund` installed 559 packages from the existing
  lock. No dependency version or test expectation changed.
- An early three-member setup initiated after only member 1 answered ping. Mongo
  refused the quorum check because member 3 was not listening. The new harness
  now waits for **every member** before initiation; no member assertion was removed.
- An earlier Mongo8 replica aggregate passed, with both primaries changing, but
  its Docker worker reap hung. It is not counted as a successful complete runner.
- The first isolated-engine attempt passed the Mongo8 standalone aggregate, then
  timed out in the existing persistence suite's 30-second setup: **0 passing /
  1 failing**. No timeout was increased. Concurrent image installation/extraction
  produced heavy disk pressure; tests were retried with the image install paused.
- The first corrected-source rerun (`database-58f7cbb`) passed both Mongo8
  aggregates, including real independent-set elections, and all 51 standalone
  regression cases. The replica persistence suite then failed its unchanged
  30-second setup (**0 passing / 1 failing**); overall runner exit **1**. This
  invocation overlapped the clean native install/build. At failure investigation,
  `/proc/pressure/io` reported `full avg10=69.47`, and a one-second `iostat`
  sample showed the scratch disk at **99.60% utilization**. All eight created
  containers/volumes were stopped and removed. No timeout was increased. The
  subsequent isolated rerun passed all four aggregates and all 204 existing cases,
  runner exit **0**, with no skips, test edits or timeout increases.
- Per-attempt log directories prevent stale output from masquerading as results
  from a later failed invocation. Raw logs remain ignored under `.tmp/`.

The selected local rows do not designate an institution's topology, TLS/auth,
credentials, session/Agenda placement or upgrade source. SR-005 remains partial.
Engine/FCV upgrades are separate operator procedures; no startup command changes
FCV and no direct MongoDB 7-to-9 engine upgrade is qualified.
MongoDB 7 is outside the v6 target. Other engine/FCV pairs (including transitional
Mongo9/FCV8), mixed-engine replica sets, other Node patches and authenticated/TLS
topologies are not qualified by these rows. Released v5's Node24 observations are
source/recovery evidence only. S3/IdP/provider coverage still requires the broad
profiles below; runtime version-guard acceptance does not supply that coverage.

## SR-046 — Existing regression and the integration gate

The complete production browser rerun now passes **124/124**, **0 failures /
0 skips**, **20.6 minutes**: apps **60**, forms **41**, smoke **23**. Dedicated
OIDC passes **13 requests / 17 checks**, no failures/skips, **29.410 s**; its
Compose runner and cleanup exit 0. General Bruno passes **309 requests / 553
tests / 3 assertions**, and real S3 passes **7 requests / 12 tests**, both with
zero failures/skips. Full compiled root Mocha passes **422 / 10 unchanged
pending / 0 failing**; final serialized core passes **4485 / 7 unchanged pending
/ 0 failing** with every real-Mongo case executing. SR-046 is complete.
Commands, hosts, reviewed pending cases, justified test conversions and the
route-order regression are in [production composition](p7-production-composition.md).
Earlier diagnostic failures and the historical core result below are retained
as history, not the current suite totals.

The full unchanged existing core suite ran with all four real-service environment
inputs, using dedicated Docker MongoDB 8.0.34 and authenticated 9.0.4 servers,
independent of matrix cleanup. Source **`58f7cbbd60e23881cdfea9fbcb712ab2b01914ca`**:

```sh
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:29511/redbox_prisma_p7_full \
P1_MONGO_URL='mongodb://p1_fixture:p1-only@127.0.0.1:29512/wr_p1_core?authSource=admin' \
FIGSHARE_TEST_MONGO_URI=mongodb://127.0.0.1:29511/sr_p7_figshare \
SIEM_TEST_MONGO_URL=mongodb://127.0.0.1:29511/sr_p7_siem \
  npm run test:core
```

Final result: **4481 passing / 7 explicitly pending / 0 failing**, runner exit
**0**. Log: `.tmp/sails-retirement/p7/core-real-mongo-final/suite.log`;
[machine-readable result](p7-core-regression.json). The 61 formerly
environment-gated cases actually executed: foundation **3**, queued Figshare
**51**, SIEM **7**. Both owned database containers and volumes were removed.

The expanded run first failed **4479/7/2**, reproducing two maintenance/stale-handle
regressions. The isolated foundation suite failed **1/0/2** before the fixes and
passed **3/0/0** afterward. The shared-group unit suite passed **11/0/0**. The
[red/green evidence and fixes](p7-regression-fixes.md) record the intermediate
**4480/7/1** full rerun and final diagnostic compatibility correction. No existing
test, assertion or timeout changed. Seven unchanged explicitly disabled source
cases remain uncovered: two RAiD contributor cases, two trigger-template cases
and three workspace HTTP cases. They are not successful qualification.

Earlier core-only environment runs were **4420/68/0** and a stopped-server
setup failure **4390/68/1**; neither is the final result. The existing core suite
uses legacy global setup. Its domain coverage does **not** prove a complete
production Express portal.

```sh
node node_modules/@playwright/test/cli.js test --list --reporter=line
```

Playwright discovery exited **0**: **124 tests / 22 files**, including apps,
forms and smoke. This is inventory, not browser execution. There are **331 tracked `.bru` files** under `test/bruno` (confirmed with
`git ls-files test/bruno`; installed Bruno dependency fixtures excluded). This is
an inventory count (including two environment files), not executed requests or
assertions.

### Subsequent production integration (current P7 work)

The earlier missing-composition audit has been addressed by the production
`app.express.cjs` executable and selected application/configuration/provider/HTTP
assembly. Its implementation and incremental results are recorded in
[production composition](p7-production-composition.md). The old component matrix,
packed artifacts and image results above/below remain historical results for
**58f7cbb**, not qualifications of the later complete portal.

The complete existing Playwright suite actually executed against the production
Express listener: **114 passing / 10 failing / 0 skipped, 124 total, 22.3 minutes**
(`playwright-production-fourth.log`). Nine failures involve dashboard/search
consumers; eight are associated with the stale generated asset tree. Search page
2 returned **2 records / totalItems 12**, but omitted the controller-owned `page`
field, causing the client to reset pagination. The host correction retains that
field. F09's exact missing-record diagnostics are converted from legacy 500 to
v6 404; all downstream/recovery assertions remain. Fresh compiled/assets focused
and complete reruns are required.

The twelfth full root Mocha diagnostic finished **416 passing / 10 unchanged
pending / 6 failing**, exit 6 (`mocha-production-twelfth.log`). Five failures were
remaining explicit anonymous 403-to-401 conversions; the sixth was a target with
no brand membership, corrected without loosening the production tenant check.
The focused actual Express access suite passed **13/0/0**. These diagnostic runs
used a per-process transpile loader; the subsequent full compiled-source run
uses `run-mocha-express.sh` without that override. The subsequent full compiled-source run completed **422 passing / 10 unchanged
pending / 0 failing, 47 seconds, exit 0**, with zero retained pools/clients/operations
at stop (`mocha-production-thirteenth.log`). Existing pending publisher/live
external cases do not count as successful coverage.

The actual full production database runner at **b53a3d06f** passed both Mongo8
standalone/independent-three-member-set portal rows (including elections on both
sets), then passed Mongo9 standalone portal checks but failed **1 of 12** existing
lifecycle tests at its unchanged queue drain deadline. It exited **1** and did
**not** execute Mongo9 replica. Three focused unchanged Mongo9 drain runs passed
(1/0/0 each; 7 s, 7 s, 6 s), with diagnostic instrumentation and no timeout edits.
The complete production matrix still requires a green rerun. Logs:
`.tmp/sails-retirement/p7/database-b53a3d06f/` and `queue-drain-focused-{1,2,3}.log`.

The next production retry at `cd32dd3cf` passed Mongo8 standalone component,
portal and existing 30/10/12 regressions, then failed Docker removal after its
90-second cleanup bound. The retry also reported removal already in progress;
it did not reach the remaining rows. The runner now gives each invocation
unique container names, stops completed rows immediately, and defers removal
until all rows finish, with a 600-second infrastructure cleanup bound. No
application/test deadline or assertion changes. The subsequent four-row run
uses source `2aae5ba50` and these runner changes; its results must be collected
before it supplies acceptance.

The first existing general Compose invocation executed zero Bruno cases:
Keycloak's cold augmentation outlasted its unchanged health retries. The retry
prestarts the same pinned providers and waits for that same health check to pass
before running the existing Compose runner. Profile email state now uses a
project-scoped volume, so general/OIDC/S3 do not share a Mailpit database. All
three merged Compose configurations validate. These are harness corrections,
not passed suite results.

Actual full general/OIDC/S3 Compose profiles, clean installed full-portal artifacts,
complete v5-to-v6 cutover/recovery and final promotion remain qualification gates.
Their new runners preserve the real host, CSRF and existing assertions. Presence
of those runners or a local partial collection result does not satisfy acceptance.

The subsequent application-owned administrator/path-rule extraction and unchanged
core rerun are recorded in [identity bootstrap evidence](p7-identity-bootstrap.md).
At source `17766ea5bd7ff9761c9447c226000ed9da2f2e90`, the corrected fresh-database
run again passed **4481 / 7 unchanged pending / 0 failing**. Its compiled real-Mongo
bootstrap aggregate passed **1 / 0 / 0**. This removes another production
composition prerequisite; it does not close the integrated-portal gate above.

[Owned record-trigger evidence](p7-record-triggers.md) records the next shared
extraction at `403d97d55b804470e511b4fcc51a0f97578be902`: **83 unchanged existing
RDMP/logging cases** and **1 real-Mongo/Agenda aggregate** pass with no failures or
skips. Queue submission is awaited and template configuration is immutable. The
full production composition and broad Express suites remain open.

[Portal configuration evidence](p7-portal-configuration.md) records the offline
43-section/default composition, explicit session-secret validation and real
bundled-hook conversion at `6dad9b837b53283e4c36c84f3391a808b520b0a7`:
**7 compiled checks**, **104 unchanged sanitizer/queue/configuration tests**, and
**2 unchanged DOI configuration tests** pass without failures or skips. The
full unchanged core run at that source also passed **4481 / 7 unchanged pending /
0 failing**, exit **0**. The remaining production prerequisite is the complete selected instance/provider,
bootstrap/migration and HTTP/page assembly plus its owning executable.

## SR-047 — Clean packed artifacts

### Current production packages

Clean committed source **`d82dc4f864be4797451b5b3795afbf694896725f`** was
extracted with `git archive` to
`/mnt/docker-storage/sr-p7-clean-production/.tmp/candidate-d82dc4f86`.
No host node_modules, emitted output or generated Prisma artifacts were copied.
All **nine package builds**, the root TypeScript build, offline Prisma contract
check/generation/copy, **twenty Angular applications / two libraries** and API
descriptors passed. Angular reports **97 warnings**; webpack **5.111.1** reports
**9 warnings / 0 errors**. Node **26.11.1**, npm **11.20.0**.

```sh
DOCKER_HOST=unix:///run/sr-p7-isolated/docker.sock \
SR_P7_CLEAN_CONTEXT=/mnt/docker-storage/sr-p7-clean-production/.tmp/candidate-d82dc4f86 \
SR_P7_PACKED_OUTPUT="$PWD/.tmp/sails-retirement/p7/packed-d82dc4f86" \
  bash support/integration-testing/qualify-sails-retirement-packages.sh
```

The complete package qualifier exited **0**: **12 tarballs / 20 existing
production/offline consumer checks**, no failures or skips. Strict peer resolution
and `legacy-peer-deps=false` apply to both consumer installs. Online install added
**1423 packages**; fresh offline ci added **1419**. Public exports, ESM-only/top-level
await, CommonJS registration, isolated applications, Express lifetime, development
registration and generated-hook compilation/lifecycle all pass. These are
consumer checks, not the full application regressions counted under SR-046.
The [current manifest](p7-production-packed-artifacts.json) records all twelve
SHA256s, file counts, tools, source and the real result. No binary is committed.

Harness **`40b79fc3c`** runs the unchanged consumer inside a temporary Docker
build stage and exports only its results/tarballs. Every install and compilation
stage was reused from the completed clean build cache. Earlier cache-prewarming
dependency-image and builder-image exports were deliberately cancelled (exit
**130**) while exporting their unused development trees, including the very large
Prisma Composer/Alchemy trees. They are not qualified images or failed consumer
checks. The original clean production Dockerfile and all consumer assertions are
unchanged. Logs: `.tmp/sails-retirement/p7/{dependencies-2e7ea887e,builder-d82dc4f86}-build.log`
and `packed-d82dc4f86.log`. Runtime/rehearsal image qualification remains required.

### Historical native packages

Earlier native source: **`58f7cbbd60e23881cdfea9fbcb712ab2b01914ca`**. A fresh
`git archive` was extracted to
`/mnt/docker-storage/sr-p7-clean-4254c2e/.tmp/final-58f7cbb`. This is an ordinary
archive directory, not a worktree or the shared checkout's installed tree.
No pre-existing node_modules, emitted files or generated Prisma output were
copied into it. Node **26.11.1**, npm **11.20.0**:

```sh
git archive 58f7cbbd60e23881cdfea9fbcb712ab2b01914ca | tar -x -C "$clean_archive"
export npm_config_legacy_peer_deps=false
export npm_config_cache=/mnt/docker-storage/sr-p7-npm-cache
export PUPPETEER_SKIP_DOWNLOAD=true
cd "$clean_archive"
npm ci --ignore-scripts --strict-peer-deps --legacy-peer-deps=false --no-audit --no-fund
for package in agenda-sqs-backend sails-ng-common raido rva-registry redbox-core sails-hook-redbox-storage-mongo redbox-dev-tools redbox-hook-dev; do
  npm --prefix "packages/$package" ci --ignore-scripts --strict-peer-deps --legacy-peer-deps=false --no-audit --no-fund
done
npm --prefix packages/sails-hook-redbox-pdfgen ci --ignore-scripts --legacy-peer-deps=true --no-audit --no-fund
npm --prefix packages/agenda-sqs-backend run build
npm --prefix packages/raido run build
npm --prefix packages/rva-registry run build
npm --prefix packages/sails-ng-common run compile:clean
npm --prefix packages/sails-ng-common run compile
npm --prefix packages/redbox-core run check:prisma
npm --prefix packages/redbox-core run build
npm --prefix packages/redbox-dev-tools run build
npm --prefix packages/sails-hook-redbox-storage-mongo run build
npm --prefix packages/redbox-hook-dev run build
npm --prefix packages/sails-hook-redbox-pdfgen run compile
mkdir -p .tmp/consumer-scratch
npm_config_strict_peer_deps=true TMPDIR="$PWD/.tmp/consumer-scratch" \
  node packages/redbox-core/test/extensions/run-packed.cjs
```

The complete invocation exited **0**: **nine package builds, twelve tarballs,
eighteen existing consumer checks**. The existing explicit PDF build-install
legacy-peer exception is preserved; every production consumer install uses strict
peers and **legacy=false**. Core Prisma check/generation/copy, common Node/browser
builds, PDF and development builds all passed. Root strict install added **2117**
packages. A post-run byte comparison against the commit confirmed **all twenty
package manifests/lockfiles remained unchanged**.

The isolated production consumer completed install and a fresh **offline npm ci**,
then checked narrow exports, async ESM-only dependency/top-level await, CommonJS
hooks, isolation, focused Express startup/stop, development registration and
compilation of a generated hook scaffold. Its sandbox was removed by the runner.
These **18 verifier checks** are not full application regressions. The sanitized
[artifact manifest](p7-packed-artifacts.json) records all **12 SHA256s**, file counts,
source/tools and the real result. No tarball, dependency tree or raw log is
committed. Local log: `.tmp/sails-retirement/p7-clean-final-58f7cbb.log`; original
manifest inside the fresh archive: `.tmp/sails-retirement/p2-pack/result.json`.

### Earlier failures and repairs

The first native archive at `4249667dc` passed with the user-level
`legacy-peer-deps=true` preference. That was not strict-install proof. The first
clean Docker attempts exposed missing core peer-lock entries. Commit `faadc1def`
makes script-free/strict installs explicit, but alone did not fix the peer lock.
Commit `4254c2ee2` completed those missing entries while preserving existing
package versions, including SASLprep **1.5.5**; [peer-lock red/green evidence](p7-peer-lock.md).
An intermediate image attempt was canceled by a turn interruption before export
(`p7-clean-image-build3.log`); it produced no qualified image. The later completed
build is the baseline below.

The clean image at `4254c2ee2` built successfully, including all **20 Angular
applications / 2 libraries** and webpack, and passed **one offline assets case**
(six views / twenty applications). Its real split-datastore component failed
**0 passing / 1 failing / 0 skipped**, exit **1**, when GridFS crossed incompatible
BSON majors. Root's stale nested storage-driver entries installed MongoDB
**6.21.0** under the hook alongside core **7.7.0**. Commit `b600ffe38` removes the
five obsolete lock entries. A fresh production ci then installed **1537 packages**,
resolved both drivers to **7.7.0** and passed cross-package BSON serialization.
The [production-lock evidence](p7-production-lock.md) records the exact failed
image IDs and reproduction. It is not called a qualified image.

The final corrected source also contains `58f7cbbd6`'s two real-Mongo persistence
fixes, covered by the unchanged full-core and isolated regression runs above.

### Clean image and operational qualification

Image qualification must use the immutable locally built image ID with
`support/integration-testing/qualify-sails-retirement-artifact.sh`. That runner
mounts only verifier scripts: **no source, dist or node_modules mounts**. It checks
installed exports, actual Mongo/BSON resolution and all twenty Angular bundles,
then executes the existing real-byte/application lifecycle component on separate
MongoDB 8 servers. Each owned container/volume is explicitly cleaned up.

The clean `git archive 58f7cbbd60e23881cdfea9fbcb712ab2b01914ca` runtime
build completed with exit **0**, local tag `redbox-portal:sr-p7-58f7cbb`.
Immutable OCI index **`sha256:297c74f5855462107163f687ff4028a3b6deba14d8f360b27c9e5d09c02670ed`**;
linux/amd64 manifest **`sha256:6d7588729528116ba24fffd66f7277f6b3f9cd386a4d8b0c0719f55154d704ed`**;
config **`sha256:03f0363ce372b9681abc03ca08466dddbf7afd5fc3a7149631ba8257ffc30826`**.
Revision label matches the source commit. Node **26.11.1**, npm **11.20.0**.
Strict root/core/production installs added **2117/1708/1537** packages.
All **20 Angular applications / 2 libraries** built (**97 warnings**); webpack
**5.111.1** completed with **9 warnings / 0 errors**. Prisma generation/copy,
API descriptors and runtime import smoke also passed. Build log:
`.tmp/sails-retirement/p7-clean-image-58f7cbb.log`.

```sh
PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH" \
DOCKER_HOST=unix:///run/sr-p7-engine.sock \
SR_P7_IMAGE=sha256:297c74f5855462107163f687ff4028a3b6deba14d8f360b27c9e5d09c02670ed \
SR_P7_ARTIFACT_LOGS="$PWD/.tmp/sails-retirement/p7/artifact-58f7cbb" \
  bash support/integration-testing/qualify-sails-retirement-artifact.sh
```

Runner exit **0**. Installed assets/exports/BSON: **1 passing / 0 failing /
0 skipped**, six views / twenty applications; actual core and storage drivers
both **7.7.0**. Installed real-byte/lifecycle component: **1 passing / 0 failing /
0 skipped**, separate physical Mongo **8.0.34 / FCV 8.0** core/storage servers.
Real GridFS bytes, persisted data/maintenance/ledger, component readiness,
deadline/drain/retry and fresh-owner restart passed. All **four** owned containers
and volumes were removed. Logs: `.tmp/sails-retirement/p7/artifact-58f7cbb/`.

`docker image save` of that immutable image exited **0**. The retained local tar
is **277441536 bytes**, SHA256
**`3094bd1998289cdb4e310e78a38fe2cb5821baca548630f1a8be4eb963411bd5`**;
path and full results: [image manifest](p7-image-artifact.json). No registry was
used for publication. `runtime_pdfgen` and test image variants remain unqualified.
The image's actual CMD is still `["node", "app.js"]`, the Sails comparison host.
These are green installed-component results, not full production Express startup.

These historical image results do not qualify the subsequently implemented
complete production composition. Its installed startup/readiness/shutdown,
generated institution portal behavior and comparable request latency/memory
still require the new clean artifact run. Packed-library or installed-component
checks cannot supply those results. Released-v5 operational observations are in the recovery
evidence; they are not an Express-versus-v5 comparison.

## SR-048 / SR-049 — Upgrade and recovery

The [operator runbook](../upgrade-recovery-v6.md) describes artifact/configuration/
hook preparation, complete quiescent checkpoints, reviewed index preparation,
one coordinated nontransactional migration runner, bootstrap/validation/activation,
fresh login, complete restoration and external-effect reconciliation. It uses the implemented `app.express.cjs` maintenance, initialize-only and
normal startup commands. The complete installed cutover run remains required.

Executed stand-in rehearsal commands, outcomes and limits are recorded separately
in [institution upgrade/recovery](institution-upgrade-recovery.md). Database-only
component migration, source restart, or missing institution designation cannot
stand in for a complete v6 portal upgrade/restart/stop and recovery acceptance.

## SR-050 — Promotion gate

Promotion has not been performed. SR-046/047/049 require the integrated production
Express artifact and full qualification. Repointing `npm start`, Docker or the
development workflow at a fixture would make normal deployment incomplete. The
Sails comparison entrypoint remains the actual default until those gates pass.
P8 has not started. Missing institution designation is **not the only remaining
gap**: the production artifact and complete installed upgrade execution also
remain. The complete broad regression is accepted under SR-046 above.

### Operational comparison criteria for the production candidate

Before the new installed-portal/cutover runs, the local engineering review uses
these tolerances: zero failed requests in each 20-request sequential forms sample;
startup within 1.5 times the released source observation; resident container
memory within 1.5 times that source snapshot; and forms p95 within twice the
released source sample. Both candidate fresh start and restart must become ready
and stop with exit 0, without OOM/forced termination. Persistent owners must close
without retained pools/clients. Compare initialized/restored observations
separately from cold fixture bootstrap; record absolute measurements as well as
ratios. These deliberately broad local tolerances accommodate this shared VM's
observed cold-cache/disk variability. They are internal review criteria, not
institution performance requirements or load-test guarantees. A failed criterion
requires investigation, not retroactive adjustment. A 20-request sequential
sample does not characterize concurrency, tail latency or production capacity.
