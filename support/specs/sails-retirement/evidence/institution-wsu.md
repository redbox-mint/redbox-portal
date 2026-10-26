# Western Sydney University institution qualification

Recorded 2026-10-26. This record designates the real WSU hook and distinguishes
local-equivalent execution from access to production. Earlier bundled-hook
stand-in evidence remains a historical snapshot; it is not relabelled WSU.

**R18 correction:** the original qualification below records WSU `1656f33` and
its exact artifacts. Review found that generated publication URLs lacked their
HTTP mapping, so those original probes alone did not close that behavior.
WSU `3c764847a` corrects it; the [R18 review](final-review-r18.md) and
[supplemental accounting](final-review-r18/review-accounting.json) record the
rebuilt artifact, generated-file HTTP checks, repeated matrices/cutover and final
tooling qualification. The original 66-file evidence ledger remains historical
and hash verified; its image IDs and counts are not rewritten as new executions.

**R19 confirmation and correction:** [R19](final-review-r19.md) found three
remaining runtime-export preflight defects and a WSU migration adapter that
bypassed vocabulary lookup-key normalization. Portal `60f93bc29` and WSU
`c1c847d` fix them with sensitive regressions. The clean 226-file WSU archive
rebuild on the unchanged qualified portal/PDF base produced
`sha256:83b888540e4e7c7732479edeabda854088ddf68fbfb9e2339ae4a52e713c9926`.
Fresh installed integration (including generated publication HTTP), both Mongo
8.0.34/FCV 8.0 and 9.0.4/FCV 9.0 rows, actual vocabulary migrations/notation
lookups, cutover/restart/stop, partial failure and exact four-database restoration
pass. Full affected suites pass WSU **440**, dev-tools **59**, root tooling **38**;
the final tooling build and **12 packs/20 consumer checks** pass. Source and
installed retirement audits have zero violations; all 1,261 baseline files
reconcile. All original 66 and R18's 83 raw evidence hashes still match.
[R19 accounting](final-review-r19/review-accounting.json) records inputs, fresh
results, failures and cleanup. The full original native recovery and broad
unchanged portal runtime suites below remain historical, not newly executed.
All four task ticks stand for their authorized local scope; the production-only
unchecked list below still applies. Both review-built images, six remaining
service containers and ten attached volumes were removed, and the owned engines
stopped. The original/sibling checkouts and untracked bytes remain unchanged.

**R20 correction:** [R20](final-review-r20.md) found five new A/P2 issues and
fixed them with portal `5786b7e77` and WSU `50293cc2`. The actual host now shares
Node 26 export selection with preflight, and ordinary authenticated latest-PDF
links work. Fresh full core/root and affected suites, packed consumers, installed
smoke/two-major matrix, cutover/restart/stop, partial initialization failure and
exact four-database restoration pass. Its image is an explicit current-core/WSU
derivative of the qualified base, not a new whole Angular/root rebuild. The
25-migration differential found no introduced data-safety defect. Original/R18/
R19 ledgers match their recorded hashes. **SR-005, SR-045 and SR-049 stand only
for the authorized local cohort; SR-055 is reopened:** a confirmation round must
find zero new A/P1/P2 issues. R19's statement that remediation alone closed the
gate, and the historical four-tick disposition below, are superseded. Inherited
defects and delayed-exit limitations are recorded in R20; production acceptance
remains unchecked.

**R22 build/deployment confirmation:** [R22](final-review-r22.md) verifies the
R21 fixes with real clean-clone Docker builds, then finds five further introduced
P2 author/build/deployment defects. Portal `55f00268e` and WSU `6212c02`/
`80b2b80` fix them with regression coverage. The source/entrypoint accounting,
actual image inputs, fresh results, expected prerequisite refusals and cleanup
are retained there. No core runtime changes since R20 require a new full runtime
qualification; R20's broader Mongo/upgrade/recovery proof is historical. SR-005,
SR-045 and SR-049 retain their existing authorized local scope. **SR-055 stays
open:** R22 is not a zero-new-findings round. Production acceptance is unchanged.

**R24 confirmation:** [R24](final-review-r24.md) verifies all ten R23 guidance
fixes and finds one further A/P2 outside R22's default-port case. WSU development
published an overridden `REDBOX_PORTAL_HOST_PORT` while keeping the browser origin
on port 1500, so CSRF rejected login. WSU `8dd6111` restores the dependent default,
preserves an explicit `REDBOX_PORTAL_APP_URL` and adds four origin regressions.
All **559 compile/unit tests** pass; real offline Compose and actual CSRF
middleware verify default, selected-port, explicit-URL and empty-selector cases.
This is configuration/regression qualification, not a new installed image,
database matrix or recovery rehearsal. Portal runtime is unchanged since R20;
WSU runtime bodies are unchanged since the R22-qualified diagnostic. Historical
R20–R23 qualification retains its recorded limits. **SR-055 stays open:** R24
found one new A/P2 even though it is fixed. SR-005, SR-045 and SR-049 retain their
existing authorized local scope; production-only acceptance remains unchanged.

**R25 configuration confirmation:** [R25](final-review-r25.md) verifies WSU
`8dd6111` and its R24 origin regressions, then finds three new A/P2 issues.
WSU `63e8535` restores schema-valid AWS credential-chain settings; `764851e`
preserves configured exporter template/group options. Portal `25a455de8` accepts
PDF source path prefixes and the empty current-brand fallback. All three have
sensitive regressions and independent remediation acceptance. The complete WSU
compile/unit suite passes **565** tests; deployment configuration/Compose/callback
and three real HTTP-start tables pass within the recorded synthetic-provider
scope. The inventory enumerates **79 environment inputs and 542 configuration
leaf/array or exporter-option inputs**. Inherited DOI URL derivation is B-18.
The core schema fix changes executable source since R20, so R25 repeats full
core/root runtime qualification; exact fresh results and pending cases are in
its report. Historical installed images, two-major topology, cutover and recovery
below do not contain these R25 fixes and are not relabelled current artifacts.
SR-005/SR-045/SR-049 retain their qualified local historical scope; **SR-055
remains open**, with **54/55** tasks ticked. Three remediated findings still fail
the zero-new-findings confirmation rule. All production-only checks remain open.

## SR-005 — Institution, source decision and topology

The portal maintainer designated Western Sydney University (WSU), specifically
`redbox-hook-wsu` branch `feature/v5-refactor` at
`14ab99eb3a89434b9c886d51d5edc37447f43588`. The original checkout is
`/home/andrew/src/bitbucket/redbox-hook-wsu`; conversion uses the separate
`/home/andrew/src/bitbucket/redbox-hook-wsu-v6` worktree on `feature/v6-express`.
The sibling master is `4d7fef81654a785fc24470bceb017a9169cc351c`.
The original untracked migration notes and logs were read, retained and hash checked.

The hook peers `@researchdatabox/redbox-core@5.0.1-beta.11285` and uses mutable
`qcifengineering/redbox-portal:develop-pdfgen`. The peer is a real published npm
prerelease, but neither it nor a mutable development tag establishes production.
Head `14ab99e` explicitly says it rebuilds against patched develop core. Master
targets v4.3; `origin/hotfix/v2.0.4.1-core-v4.5.6` is another historical v4
reference. No branch, deployment manifest or supplied note establishes WSU's
actual production image. Production release coverage is therefore unknown.

**Designated released-source fallback:** released v5.0.4, portal source
`c1dda53999f3b026347008731f33dba834e06c27`, Linux amd64 image
`qcifengineering/redbox-portal@sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9`,
with WSU **`49962062859cd904fddae2076d8b7e4abf59d40d`** (2026-10-20).
This is the last WSU revision before `6624ff6` introduced migrations requiring
independent dashboard models absent from that release. The five WSU types,
forms, migrations, ROR bootstrap, S3 and local-auth configuration are retained.
Target conversion is from the designated latest hook `14ab99e`, including its
later fixes; no development core must be installed between source and v6.
The task authorizes choosing this defensible released fallback when history does
not establish production. **It is not evidence that WSU production uses it.**

The source image runs Node **24.16.0**, npm **11.13.0**, Sails **1.5.17**; its
historical installed core manifest is **0.0.1-beta.9022**, so artifact hashes are
authoritative. Published npm v5.0.5/tag `b27198ef35bba0eeb35a690458baf7abf644b8a2`
was also examined: it has no independent dashboard model, and pulling Docker
`qcifengineering/redbox-portal:5.0.5` returned `not found`. No compatibility run of
that npm release or the declared beta peer is claimed.

Latest WSU `14ab99e` **failed** on released v5.0.4 at
`redbox-hook-wsu:20261022T010000-plan-pdf-dashboard` with
`dashboard/workflow models unavailable`. No migration was skipped or falsely
recorded. The compatible historical hook then actually completed its migrations,
accepted five synthetic records through the source HTTP API and passed fresh
login plus all five record/form/workflow/edit-page reads. Its declared peer does
not match the release manifest; this is demonstrated selected runtime
compatibility, not a claim that the original package contract or typecheck passes.
The released dev-tools package lacks the newer compiler wrapper's emitted target;
the archived hook was emitted with the original installed TypeScript compiler
and `--noCheck --declaration false --declarationMap false`. Ordinary typechecking
against the installed development dependency tree failed and is not counted.
The scratch image contains only this emitted historical hook, its assets and
exact `xmlbuilder@15.1.1`; it never mounts current application source.

Source configuration is `/mnt/docker-storage/sr-wsu/v5-state/release.cjs`, SHA256
`f20dbb4cfc7ebd31d0902a4cbdb31de6b8d622a799b831d44dfe58abccb488ce`.
Its retained full configuration, installed hook, hook source archive and image
are part of the checkpoint. Source-hook archive SHA256 is
`f96da1d4191d35c184353db9b8d880828ba7f4cf22eaab44efb4e79b281ac095`.
The first source harness used the obsolete `solr.options` location. Selecting
`solr.cores.default.options` corrected the lookup; the source then served HTTP.
The disposable Solr `_default` wildcard conflicted with the required string
wildcard. The local operator explicitly replaced that one dynamic field before
checkpointing. Full Solr search/indexing behavior is not claimed by HTTP reads.

| Surface | Repository evidence / chosen local equivalent | Production access gap |
| --- | --- | --- |
| HTTP/deployment | Hook development Compose, `/default/rdmp`, canonical public URL; v6 uses explicit module and institution executable | Actual ingress/proxy/root/TLS settings and deployed image unknown |
| Auth | Development local admin/PDF-bot settings; local auth with fresh v6 session/CSRF is rehearsed | No institution credentials or federation metadata; WSU OIDC/AAF/SAML is not established or qualified |
| Mongo source | Checked-in v5 Compose selects MongoDB 7 standalone | Actual production engine/FCV, credentials, TLS and set membership unknown |
| Mongo target | Node 26.11.1, MongoDB 8.0.34/FCV 8.0 and 9.0.4/FCV 9.0; two independent standalone servers, separate portal/storage databases plus separate logical Agenda/session databases | No claim for institution TLS/auth/replica-set combinations; prior generic replica-set tests remain separately scoped |
| Search | Solr 8.11.1, core `redbox`, hook schema/preindex configuration | Real institution index contents and infrastructure unavailable |
| Primary bytes | S3 driver, attachment key prefix `attachments/`; local SeaweedFS 4.47 S3 endpoint with synthetic credentials | Real bucket/IAM/encryption/ACL infrastructure unavailable |
| Other bytes | Filesystem staging, Figshare staging and `/publications`; packaged WSU views/assets/templates/locales | Production paths/mounts and backup integration unknown |
| External effects | DOI/DataCite configuration, PDF jobs and generated publication/harvest files retained | No real DOI/email/Figshare publication is authorized or claimed |

Mongo candidate immutable IDs remain those in [P7](p7-qualification.md).
Seaweed uses
`chrislusf/seaweedfs:4.47@sha256:ce9e796f1fe6f06968f4c04bdaf8f678dad9c8acdfef3d244133d71bfa6bf882`.
The source local Mongo candidate is
`mongo:7.0.43-jammy@sha256:f71f6d0913c945096cd058557cbadf4ad435007f378d84b3c4c636c928735e72`.
No application command raises FCV or performs an in-place engine/topology upgrade.
Engine/FCV changes require the operator's vendor-supported procedure, independent
checkpoint and verification; a logical restore to an isolated target is recorded
separately from an engine upgrade.

The reconciliation owner is **WSU deployment operator (designated by the portal
maintainer, Andrew Brazzatti)**. No more specific owner was found in the hook docs.

## Conversion findings and fixes

The conversion preserves the five WSU record types, workflow forms, named queries,
reports, vocabularies, branding, publication templates, PDF requests and all 25
historical migration names. Registration is neutral data. The institution
executable explicitly binds four record operations, migrations and HTTP handlers;
maintenance uses the same selected configuration and storage extension.

First-institution friction produced portal commit `fd2ae641f`:

- `check --v6` now rejects legacy discovery metadata and missing neutral public
  exports; subprocess regression coverage is included. The ordinary dependency
  check alone had misleadingly passed an unconverted manifest.
- The migration guide now uses actual production policy names, explicitly adds
  CSRF to extension routes, explains brand-scoped Admin checks, documents the
  institution composition executable, and corrects migration/bootstrap timing.
- Institution conversion precedes core's lexical hook converters. It handles only
  four known WSU expressions, including nested notification/queued declarations;
  templates and unknown expressions are preserved for strict validation.
- Old singleton/global controller/service/model lookups became constructed
  operations, selected HTTP inputs and migration-only callbacks using the owned
  pools. New writes use core codecs and server-owned revisions; no client is
  opened by WSU migration callbacks. A source-smoke cross-package BSON constructor
  failure was fixed in the hook by using core codecs/client-generated identities.
- Single regeneration is now POST with auth, CSRF and current brand-scoped Admin.
  Public downloads require published eligibility, selected bytes and matching
  publication/source brand/link. These intentional legacy-client changes are
  documented in the WSU deployment guide and tested through Express policies.
- Hook build/Compose/entrypoint metadata now targets v6. Old Sails test/core-mount
  runners explicitly refuse and direct operators to v6 guidance.

Portal runtime source has not changed in this work. Fresh dev-tools suite:
**55 passing** (including the isolated compiler regression). WSU production source
compiles; final unit suite: **435 passing**.
Historical WSU tests were adapted to explicit callbacks without deleting their
pagination, CAS, audit, idempotence, exporter or form assertions. Unit execution
uses transpile-only for pre-existing fixture typing problems; production source
compilation remains type checked. The v5 source compiler attempts and qualified
artifact/recovery results are accounted separately below.

## Execution and artifact accounting

Work logs/artifacts are retained under `/mnt/docker-storage/sr-wsu/`. Source-smoke
runs use dependency symlinks and are not clean-artifact proof. The committed
`packages/redbox-core/test/qualification/wsu.cjs` requires its disposable flag and
local Mongo URLs. The selected configuration supplies local HTTP/S3 endpoints;
the driver does not separately enforce their locality. It checks actual
engine/FCV values, configured forms, auth, S3, worker state,
persistence ownership and restart. Portal driver commits: `badf2cc68`, `62b52dc94`; recovery verifier/auditor controls: `bb78ee9c2`.

| Gate | Observed result | Scope |
| --- | --- | --- |
| WSU unit / production compile | 435 passing / compile exit 0 | Converted hook source, including real EJS regressions |
| Portal dev-tools | 55 passing | Full affected suite, including CLI and isolated compiler regressions |
| Node 26.11.1 + Mongo 8.0.34 / FCV 8.0 | Pass: selected maintenance, five types, 12 persisted forms, login/CSRF, S3, real worker, drain timeout/retained pools, successful stop/pools 0, restart | Source composition on two standalone servers; `matrix8-source5.log` |
| Node 26.11.1 + Mongo 9.0.4 / FCV 9.0 | Same checks pass | Source composition on two standalone servers; `matrix9-source4.log` |

First driver attempts used an incorrect expected persisted-form count (13 included
the generated view-only form). The corrected driver checks every configured
workflow's actual form, with 12 persisted forms. Early S3 writes failed because
the disposable Seaweed service had no seeded S3 identity; recreating it with the
same synthetic credentials and bucket used in WSU Compose corrected the harness.
Those attempts are retained and not counted as passing combinations.

The latest extended source rows also pass all five HTTP metadata/form/workflow
reads and real institution mutation-route authentication/CSRF controls. Both
processes exited 0. The source checkpoint has **28 collections / 5,162 documents**
across portal, storage, Agenda and session databases. Native dumps restored into
isolated Mongo 8 targets with zero failed documents, and all document/index
checksums match. This logical restore is distinct from an in-place engine upgrade.
Complete source image payload: **32 layers / 527,278,080 bytes**, SHA256
`049bf649d15f87e805125d0aa069dcfb043e43bc98d793c98943bc9396231dcc`.
S3 object bodies/checksums, staging/publication/configuration files, installed hook,
source hook archive and Solr snapshot are checkpointed too.

Fresh full root tooling suite: **26 passing**, including auditor controls
for offline legacy-metadata rejection versus live access. The new dev-tools check
and negative WSU literal initially produced five auditor findings; explicit,
narrow AST classifications now distinguish those rejection checks/fixtures while
retaining live-access failures. Current committed source has **zero executable
violations / zero forbidden dependency entries** and all **1,261** baseline
inventory files reconcile. These are source checks, not installed-image claims.

## Further first-institution friction and regression coverage

A clean WSU build failed because the old `tsconfig.json` extended undeclared
`@tsconfig/node24`, previously supplied by a hoisted development dependency.
WSU `9dd256f` now extends the declared dev-tools shared compiler base. Portal
`04791ca71` adds an isolated compiler regression and concrete migration guidance;
the regression exercises both the old failure and the working base without
hoisted compiler-base packages. The production hook compile passes in the clean
image build. Test fixture transpilation remains separate from that typecheck.

The installed candidate `fed13b010bfd7a2b590a4ebb2e8f939a8f4b1b643cb63645f71b8136a92bc086`
passed the earlier API-only checks but returned **500** from the actual anonymous
WSU homepage. WSU `1656f33` converts its `TranslationService`/`BrandingService`
globals to `page.t`/`page.base` and removes login's obsolete functions include.
Three real `PageArtifacts` tests first failed with `TranslationService is not
defined` and `Page include artifact missing`, then passed, including escaped
query/session errors and installed-partial selection. The complete WSU suite is
**435 passing**. Portal `03c2cbad5` strengthens installed matrix/recovery probes
and the migration guide to require both anonymous home and login HTML. The final
packaged smoke does the same. The failed image is superseded, not qualified.

The source auditor initially flagged the installed dependency verifier's exact
`sails.io.js` rejection-table literal. Portal `d25c93095` classifies only that
membership table. Controls still reject an actual import and an unrelated legacy
runtime path. This supplements the prior narrow finite-WSU-conversion and CLI
manifest-rejection controls; the full root tooling suite is **26 passing**.
No application runtime source changed in the portal repository. These defects
were corrected in the conversion, dev-tools or migration guidance with actual
regression coverage; no Sails runtime compatibility layer was introduced.

## SR-045 — Installed WSU topology qualification

All final images are Linux amd64, built from exact Git archive contents:
portal **`03c2cbad5fb2764eb09df9e50b83ff4b18624bc6`** (5,072 files) and WSU
**`1656f339190880bddd3d52c2c4b292e9868b1492`** (223 files). Every archive file's
Git blob hash matches; neither source mounts nor dependency overlays qualify the
installed runs. Subsequent portal changes are auditor controls and evidence/docs.

The final WSU immutable image is
**`sha256:5d332405b694fa990b1fd5271c7693a8f28a78f6ff86952f8ca1c3b2950d15b9`**.
Its native runtime reports Node **26.11.1**, npm **11.20.0**, Chromium
**156.0.8078.47** on Debian 12. The clean hook pack has 304 files. Offline installed
registration and composition import pass with network connect/listen/fetch and
filesystem mutations actively refused: five types, 13 declared forms, 26
migrations (25 historical names plus the v6 converter), four routes. Twelve forms
are persisted; the thirteenth is a generated view-only declaration.

| Final installed row | Observed result | Exact scope |
| --- | --- | --- |
| Node 26.11.1 / MongoDB 8.0.34 / FCV 8.0 | Pass; process exit 0 | Two independent standalone servers; separate core/storage and logical Agenda/session DBs |
| Node 26.11.1 / MongoDB 9.0.4 / FCV 9.0 | Pass; process exit 0 | Same WSU topology equivalent on the selected newer major |
| Packaged WSU integration entrypoint | Pass; process exit 0 | Fresh standalone Mongo 8 DBs, installed hook, actual home/login, CSRF login, every configured workflow form, owned stop |

Each matrix row starts from empty dedicated databases and checks actual server
version/FCV/standalone status, inspect/ensure/inspect, five WSU types and every
configured persisted form, fresh login/CSRF, both anonymous pages, five HTTP
metadata/form/workflow reads, institution mutation authentication/CSRF, selected
S3 byte round-trip, a real queued SecurityEvent write, failed drain retaining
pools and admitted work, successful retry with pools/Prisma clients **0**, and
restart retaining brand/form identity. Both processes naturally exit 0 after
provider timers expire. The packaged production executable separately exits 0 on
successful stop. No untested WSU TLS/auth/replica-set combination is claimed.
Earlier generic replica-set/stepdown rows remain separately scoped in P7.

The first final-smoke launch raced creation of its image-ID file and failed
before creating a container (`invalid reference format`). Correct sequencing
produced the counted passing `integration-smoke3.log`; the harness failure is
retained as `integration-smoke2.log` and is not a runtime pass.

## SR-049 — Released WSU cutover and complete recovery

Source image **`sha256:2a0ca94182fed139207c0d4da41102f58a7e42638cb747ad57636a2b12160b48`**
contains the released v5.0.4 portal plus the historical compatible WSU hook above.
Both real source servers report MongoDB **7.0.43 / FCV 7.0**, standalone. Native
Database Tools **100.19.1** dump the quiescent core, storage, Agenda and session
databases. The checkpoint retains all **28 collections / 5,162 documents** and
indexes, all synthetic S3 bodies, staging/publication/configuration files, source
hook archive, installed hook, generated runtime configuration, Solr data snapshot
and complete source image. It is retained at
`/mnt/docker-storage/sr-wsu/checkpoint/`; `checksums.txt` includes the Solr archive.

The designated five fixtures are created through the real source HTTP API and
contain synthetic titles/classifications and a synthetic ROR object. Bundled WSU
ROR bootstrap data describes public organizations, not personal data. The source
checkpoint includes seven retained types/14 forms, including inherited core
objects; fresh v6's 12 persisted WSU forms are not used to delete that history.
A logical restore into clean Mongo 8 targets has zero failed documents and exact
document/index checksums before the sole v6 upgrader runs. This is a logical
migration, not an in-place Mongo engine or FCV upgrade.

Maintenance first reports the source nonunique `redboxOid_1` conflict. A separate
guarded operator review verifies all 1,275 live storage OIDs are valid/unique and
drops only that exact old nonunique index, then ensure/inspect report ready.
Initialization's original dashboard preflight stops on one inherited
`existing-locations` finding, rather than discarding it. The local rehearsal
explicitly accepts standard-dashboard behavior for finding `170fbfa0478ae963`,
with capture fingerprint
`3b0f0c260eb68e93fbeaa69f258e93222a691800490b7c775238c560dd17fc81`.
The decision/configuration is retained. It is a synthetic local decision, not a
production WSU dashboard approval. Reviewed initialize-only exits 0 and schema,
configured-form and integration-pin checks pass.

The installed WSU executable uses the selected v6 configuration, separate stores,
local auth, S3 endpoint, staging/publication mounts and Solr 8.11.1. A new
`wsu.v6.sid` cookie and rotated synthetic secret require fresh login and CSRF.
`REDBOX_PORT=18560` also selects the actual image health-check port. Before and
after restart, the candidate is Docker-healthy, `/healthz` and `/readyz` return
200, home/login return HTML 200, and all five retained records, forms, workflows
and edit pages read successfully. Both supervised stops drain and exit **0**.
No interim development core is installed.

A real `postBootstrap` initialization operation then creates a candidate-only
core collection, changes a retained storage record and throws deliberately.
Initialization fails; activation remains closed; both partial writes remain;
cleanup reports pools **0**. The rehearsal also damages the retained S3 object,
adds a candidate-only S3 object, removes staging bytes, changes publication bytes
and breaks candidate configuration. Diagnostic database checksums, migration
ledger/damaged records, S3 bodies and failed configuration are retained before
restoration.

With every WSU writer fenced, recovery drops all four target databases before
native restore, removing the candidate-only collection, then verifies all 28
collections/5,162 documents and indexes exactly. It replaces the S3 object set
(including deletion of the candidate-only object), restores source deployment
files into an empty directory and compares all four file bodies, replaces the
quiescent Solr data and compares every file hash, and restores all four native
source databases on Mongo 7 to exact document/index checksums. It restores **76
configuration files** and **160 installed-hook files** before source startup,
with complete filename/content hash equality. The source hook/image/configuration
are recovered as a set; no old executable sees candidate-modified state.

The complete source image archive is **527,278,080 bytes / 32 layers**, SHA256
`049bf649d15f87e805125d0aa069dcfb043e43bc98d793c98943bc9396231dcc`.
An empty offline engine, born without registry networking, independently loaded
it and executed Node 24.16.0 with `--pull never --network none`. Docker's OCI
save/load changes the index wrapper: the actually loaded image ID is
**`sha256:af9fdbdbaf5e8e40125a2c1a7e5f8fcb4f843581df02e3c2af3daf63ad4470d6`**.
Platform, image configuration and all 32 filesystem layers equal the original.
The final source recovery explicitly creates the container from this loaded ID,
asserts the selected ID, and repeats source login, both anonymous pages, all five
record/form/workflow/edit-page reads, S3 body verification, restart and both stops
(exit **0**). The earlier original-index run is retained separately; it is not
the independent archive-executable proof. The runbook now explains this distinction.

Reconciliation owner: **WSU deployment operator (designated by the portal
maintainer, Andrew Brazzatti)**. External effects: no real DOI/email/Figshare
publication, transfer or external queue acknowledgement was sent; only the
synthetic local S3/filesystem effects above required reconciliation. The local
owner decision is to restore the complete checkpoint and discard candidate-only
state before source writes resume. Real external effects require that owner's
production reconciliation, as the runbook specifies.

## SR-055 — Final artifacts, inventory and task disposition

| Clean artifact | Immutable image | Final result |
| --- | --- | --- |
| Bare portal with PDF runtime | `sha256:2ce824c3c7bef21b866a099481eb31494b087a182e56fa4a82237792f0a6e7c7` | Installed assets/components, actual default executable fresh/restart/stop, health/ready/page/asset/CSRF login and 20 form requests per start: pass, exit 0 |
| Bundled hook with PDF runtime | `sha256:ca32ea7735b9d46fb7b75ba74810806bb678f52f5e889d0b91ed699f5b62e944` | Same installed qualification with explicit bundled presence: pass, exit 0 |
| Converted WSU with PDF runtime | `sha256:5d332405b694fa990b1fd5271c7693a8f28a78f6ff86952f8ca1c3b2950d15b9` | Fresh integration, two-major matrix, released-source cutover/restart/stop and complete recovery: pass |
| Real packed dependency set | 12 packs / 20 checks | Strict/offline isolated consumer, CJS, ESM, TLA and compiled scaffold: pass, exit 0 |

All three installed AST/dependency audits pass: **3,880 / 4,042 / 4,093** owned
files scanned, **1,228 / 1,229 / 1,230** installed manifests respectively, zero
executable Sails violations and zero forbidden dependency entries. Owned package
pins are exact/local references. The final source audit at `d25c93095` also has
zero violations/dependency entries and reconciles all **1,261** baseline files.

Fresh affected suites: WSU **435**, dev-tools **55**, root tooling **26** passed.
R16's broad core/root/browser/Bruno/Angular qualification is retained for its
unchanged application runtime, with an explicit Git path comparison in
`runtime-equivalence.json`: the only changed production source is the dev-tools
CLI, covered by its full suite. Those broad suite counts are **not newly rerun**.
The new WSU runtime/views received their complete unit and installed integration
checks. No portal core runtime fix required a new broad runtime regression run.

The canceled full development/test-image export is not a built artifact or a
passing gate. The final WSU build instead combines the clean portal builder/PDF
runtime stages with the hook Dockerfile's compile/pack/install stages and a clean
named WSU source context; it never exports a developer dependency overlay.

**Historical disposition (superseded for SR-055 by R20 above):** SR-005, SR-045, SR-049 and SR-055 were recorded complete for the explicitly
authorized WSU released-source fallback and faithful local topology cohort. This
meets their designation, persistence/ownership/maintenance, institution
cutover/recovery and clean-artifact/inventory criteria. It does not assert actual
production deployment proof or authorize a release. Access/release gaps were
required to remain explicit in SR-005 and supported combinations in SR-045;
the task authorizes the defensible released-v5 fallback and local equivalents.

The following production acceptance work remains **unchecked**:

- [ ] Confirm WSU's actually deployed source image, hook/configuration and source
  database/FCV; select any additional source-release coverage it requires.
- [ ] Confirm/qualify real ingress, proxy/TLS, Mongo authentication/TLS/set
  membership, S3 IAM/bucket controls, institution provider metadata and credentials.
  No WSU federation or replica-set arrangement was established from this repo.
- [ ] Obtain the production dashboard/client compatibility decisions and rehearse
  real operator backup/engine/FCV procedures on the confirmed deployment inputs.
- [ ] Qualify production search/indexing, workload/availability tolerances and any
  real PDF/publication/email/provider/transfer paths with institution-owned data
  and an external-effect reconciliation checkpoint. Their production effects were
  not exercised by local record reads or generic historical suite results.

No unmet production-only check is relabelled a local pass. If those confirmed
inputs expand the supported matrix, add and execute its rows before production
acceptance. The user-authorized local scope does not supply those credentials.

All 14 remaining owned containers and their 14 attached anonymous volumes were
removed; generic artifact verifier transients had already cleaned themselves.
No owned container/volume or custom network remains. Both owned engines are
stopped. Checkpoints, images and logs are retained. Existing unrelated volumes
were preserved. The original WSU checkout stays at `14ab99e` with only its three
original untracked files and unchanged SHA256 hashes; the master checkout and
untracked portal GraphQL specification were untouched.

## Reproduction, evidence files and commits

[Machine-readable results](institution-wsu-results.json) record exact inputs,
artifact IDs, probes, baseline scope, cleanup and SHA256 hashes for **66** retained
logs/scripts/manifests under `/mnt/docker-storage/sr-wsu/`. Important entrypoints:

```sh
# Exact Node toolchain used by host-side qualification scripts.
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
# The owned engine has been stopped; its durable data root is retained.
export DOCKER_HOST=unix:///run/sr-wsu/docker.sock
# Build inputs and combined Dockerfile are retained alongside the logs.
# Actual final executions (all exited 0):
bash /mnt/docker-storage/sr-wsu/run-installed-matrix.sh
bash /mnt/docker-storage/sr-wsu/run-integration-smoke.sh
bash /mnt/docker-storage/sr-wsu/run-wsu-upgrade.sh
bash /mnt/docker-storage/sr-wsu/restore-complete.sh
bash /mnt/docker-storage/sr-wsu/restore-archive-source.sh
bash /mnt/docker-storage/sr-wsu/audit-final-images.sh
```

These scripts operate only their recorded disposable databases/resources. They
are an execution record, not an instruction to run them against production or
without first recreating/fencing their local prerequisites. Configuration,
fixtures and checkpoint checksums are retained in that same scratch root.

Portal implementation/qualification commits: `fd2ae641f`, `badf2cc68`,
`62b52dc94`, `bb78ee9c2`, `cfe9b187a`, `106d31bc6`, `04791ca71`, `03c2cbad5`,
`d25c93095`; the closing documentation commit contains this evidence and task
updates. WSU commits: `69596d4`, `be1379c`, `419dab5`, `cc708d9`, `9dd256f`,
`1656f33`. All use the requested co-author trailer. No push, publication or tag
was performed.
