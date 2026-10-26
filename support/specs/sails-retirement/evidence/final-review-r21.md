# Sails retirement final review — round 21

**Two NEW class-(A) P2 findings; no P1. Both are fixed. R21 does not pass
the confirmation gate**, which requires a round with zero new A/P1/P2 findings.
SR-055 remains open. Two P3 qualification/evidence corrections are also fixed;
neither is counted as a P1/P2 product finding.

Confirmation review of portal `1217948908d69de90fd4b1d20bb42b0f1ee711cb`
on `stack/sails-retirement` and converted WSU
`50293cc2cc1b8d34e6ec649d80c1faa64d4235ff` on `feature/v6-express`.
The reviewed deltas are portal `8b049580d..121794890` and WSU
`14ab99e..50293cc2`. AGENTS.md in both repositories, the retirement contracts,
tracked wiki standards/testing, R18–R20 and the WSU institution record were read
before reviewing. Code Review supplied independent Standards and Spec axes.
Final remediation inputs are portal `15f8a8d58` and WSU `1b9b1ac` (full
identifiers and command/artifact hashes are in the machine accounting below).

## Findings and fixes

| Finding | Classification and effect | Fix and regression |
| --- | --- | --- |
| R21-02 — builder image omitted by existing build scripts | **A/P2.** The converted Dockerfile requires `REDBOX_BUILD_IMAGE`, but local and amd64/arm64 deployment entrypoints pass only the runtime image, leaving the builder `FROM` empty even when both inputs are provided. V5 used its supplied runtime image for both stages. | WSU **`8679736ae9501eed3639fd4261b78b0cd77d4610`** forwards both exact image inputs, requires them before any Docker invocation and removes the mutable v5 fallback. The ten initial regression cases produce **one pass / nine failures** before the fix; corrected cases pass. |
| R21-03 — clean CircleCI checkout cannot compile | **A/P2.** Converted manifests/lockfiles link core/dev-tools to a sibling portal checkout. CircleCI checks out only WSU and runs host `npm ci`/compile before Docker can rewrite those paths. An isolated manifest/lock install succeeds but leaves the dev-tools executable unavailable; compile fails **MODULE_NOT_FOUND**, exit 1. V5's corresponding dependencies were exact registry packages. | WSU **`8679736`**, completed by **`1b9b1ac`**, runs compile/unit work in the qualified Dockerfile `builder` target, uses the v6 integration Compose stack directly and removes redundant host install/compile steps from deploy/local jobs. All five jobs remain. CI configuration and `.dockerignore` stay in the builder source context for its contract test. A failed unit run preserves its exit status and removes its temporary image. Four CI regressions fail before the initial correction; the additional context assertion fails before the completion fix. Final results are below. |
| R21-01 — unproven strict packed-consumer policy | **A/P3.** Detailed below. | Portal **`15f8a8d58`** forces strict/nonlegacy peers; the real packed graph passes, and the deliberately inconsistent control fails ERESOLVE. |
| R21-04 — stale task summary | **A/P3.** R20 reopened SR-055 but left the task header saying 55/55 complete. The actual checkboxes are 54/55. | This evidence/task commit changes the header to 54/55 and keeps SR-055 open. |

The build-script tests execute the actual Bash entrypoints with a Docker stub
that records argument arrays and rejects missing Dockerfile image inputs. The
stub replaces every Docker invocation, including login, builder setup, privileged
architecture setup and push. Local, amd64 and arm64 commands are checked; missing
inputs fail before even login. They prove command wiring and failure propagation,
not a newly executed image build, CircleCI run, registry publication or native
arm64 qualification. Both qualified image inputs remain deployment prerequisites.

The [bounded remediation review](final-review-r21/spec-remediation-review.md)
caught `.dockerignore` excluding itself while the new CI contract test reads it.
The strengthened assertion produces **14 passes / one failure** against
`8679736`; `1b9b1ac` removes that exclusion. The complete compile/unit suite then
passes **546 tests**, both in the converted worktree and in a disposable copy of
all tracked context sources after the current exclusions. The latter copies
228 files and links the existing installed dependencies; it checks source-context
completeness, not an actual Docker dependency install or image build. The same
Spec reviewer accepts the completed fix. This is completion of R21-03, not a
third independent P2 finding.

No class-(B) defect or severe ordinary-user access-control exception was newly
verified. The inherited backlog remains **16 groups**. All changes are tests,
build/CI scripts and documentation; core and WSU application runtime bodies,
dependency manifests and pins are unchanged.

## Extension loading and R20 confirmation

The [independent Standards/loading report](final-review-r21/standards-review.md)
traces production startup through `createPortalApplication` →
`loadInstalledExtensionProviders` → `loadExtensionModule`; index maintenance also
uses the shared loader. Its exports branch calls the same selector as preflight;
no-exports packages retain the previous `import-meta-resolve` fallback. Fresh
focused loader, production root-only ESM storage, maintenance-extension and
handler-lifetime tests pass **15/15**.

An additional **13-case** baseline `8b049580d` / current / native-import comparison
passes for CJS/ESM main/index, missing-main and directory fallbacks, null exports,
legacy subpaths, aliases, hidden manifests, hoisted discovery and symlinks. The
unsupported extensionless subpath consistently rejects. Existing installed
storage and bundled development hooks return the identical native-import module
namespaces. Four extracted R20 archives verify the actual packed loader and CJS,
ESM-only dependency and awaited TLA behavior, without dependency overlays.

Core loading/exports/index JavaScript is byte-identical to R20's archive and its
executable AST matches transpilation of pinned `121794890` sources. Declarations
and public package export maps match. All **43 changed WSU runtime sources**
match pinned `50293cc2` and have zero normalized executable-AST differences from
dist. Comments/maps, formatting, redundant parentheses and numeric spelling are
normalization details, not claimed byte identity for every source/dist file.

The complete dev-tools suite passes **60 tests**, including the **1,271-case**
checker/host/Node differential and **41** actual CLI/import cases. No new resolver
or supported-host behavioral drift was verified. R20's explicitly corrected
default-Node-condition cases are intentional fixes; custom process conditions
remain outside the qualified contract. Its 25,000-shape and migration settlements
were not reopened without a counterexample.

## WSU HTTP settlement

The five declarations below are the complete custom WSU route set. Every GET
also has Express's implicit HEAD. `B/A/R` means the ordered policies
`brandingAndPortal`, `isWebServiceAuthenticated`, `brandActor`. The regeneration
handlers additionally require an Admin role **after** filtering roles to the
requested brand. A user who is an Admin only elsewhere and a Researcher here
does not pass that handler check.

| Route | Method | Declared policies | CSRF | Brand, role and object requirements |
| --- | --- | --- | --- | --- |
| `/published/:oid{/:file}` | GET, implicit HEAD | `public` | None | No actor role; current dataPublication must be published and not embargoed. Only `index.html`, `oai_dc.xml`, `rif.xml`; bounded OID and symlink-safe persistent file lookup. |
| `/:branding/:portal/pubrecord/:oid/pubattach/:attachId` | GET, implicit HEAD | `public` | None | No actor role; existing requested brand, eligible dataPublication, matching publication/source brands, linked dataRecord and explicitly selected file. This public handler has no independent portal allowlist policy, as in the v5 custom route. |
| `/:branding/:portal/record/:oid/latest-pdf` | GET, implicit HEAD | B/A/R | None | Authenticated actor with a role in the requested brand; existing brand/portal, matching rdmp brand/type and current record view permission. Redirects to latest PDF or the ordinary record view. |
| `/:branding/:portal/regenLandingPages/:oid` | POST | B/A/R, `csrf` | Browser token; independently verified bearer exemption | Existing brand/portal, current brand-scoped Admin, matching-brand dataPublication. |
| `/:branding/:portal/admin/regenLandingPages/recordType/:recordType` | POST | B/A/R, `csrf` | Browser token; independently verified bearer exemption | Existing brand/portal and current brand-scoped Admin; paginated query constrained to that brand and requested type. |

These requirements are compared with the actual `14ab99e:src/index.ts`, both
original controllers and the documented intentional changes in WSU
`support/v6/README.md:44` and the institution record. The old single-record
regeneration GET is intentionally a protected POST; stricter public attachment
eligibility/source checks are intentional. The v5 root redirect is intentionally
owned by core. R18 added the explicit publication-file route to replace the old
deployment static mapping. Neither removed v5 route is an omitted custom
declaration. The two regeneration GET/HEAD aliases return 404 and perform no work.

The following are **observed, asserted results** for all five routes, with no
token / a valid session token. The eligible public fixtures use brand 1; the
ordinary user has a brand-1 Researcher role, wrong-brand Admin only a brand-2
Admin role, and right-brand Admin a brand-1 Admin role.

| Route | Anonymous | Ordinary user | Wrong-brand Admin | Right-brand Admin |
| --- | --- | --- | --- | --- |
| Publication file | 200 / 200 | 200 / 200 | 200 / 200 | 200 / 200 |
| Published attachment | 200 / 200 | 200 / 200 | 200 / 200 | 200 / 200 |
| Latest PDF | 401 / 401 | 302 / 302 | 403 / 403 | 302 / 302 |
| Regenerate publication | 401 / 401 | 403 / 403 | 403 / 403 | 403 / 200 |
| Regenerate type | 401 / 401 | 403 / 403 | 403 / 403 | 403 / 200 |

The retained WSU `test/unit/http-surface.test.ts` also tests the mixed-brand
Admin/Researcher, every implicit HEAD with both token states, missing/invalid/
query-only tokens, body tokens, foreign Origin and cross-site Fetch Metadata,
forged and verified bearer credentials, invalid brand/portal, record view denial,
wrong record type/brand, malformed identifiers, latest-PDF fallback and publication
draft/queued/embargoed/retired states. Public attachment controls independently
deny unrelated sources, wrong publication/source brands, unselected files and
wrong types for every actor/token combination. Byte readers and producers are
asserted untouched on denials. All GET/HEAD cases assert no call to the producer.

The fixture uses the current declared handlers/policies, real core
`createHttpPolicies`, `bindHttpPolicies`, `createHttpCsrf().apiProtect`, the
neutral extension compositor and `ExpressHost` at `/prefix`. The policy binding
matches production `application/portal/http.ts`; actors, sessions, records and
storage/provider operations are explicit synthetic ports. This is a real HTTP
authorization/control-flow settlement, not a new installed Mongo/session/IdP or
external publication-effects rehearsal. R20 retains those separately qualified
installed/local paths and their limits.

**88 HTTP tests pass; the final compile/unit suite passes 546 tests**, including
15 build/CI cases. WSU commit
**`c2f547cc1976b1926b46d22e3f4f22e632c7f2d6`** adds only this test file.
No WSU production body or dependency changed. Sensitivity transpiles the exact
pre-R20 `c1c847d:src/index.ts` and substitutes its registration in the test
process while retaining current handler/policy bodies: **81 pass, seven fail,
exit 7**. Ordinary, right-brand Admin and mixed-role GET/HEAD requests reproduce
403 instead of 302; the no-token object checks are likewise blocked too early.
These are confirmations of **R20-05**, not new findings.

## P3 qualification correction

**R21-01 — A/P3: packed verification did not force its claimed strict peer
policy.** The shipped `test/extensions/run-packed.cjs` and retained R20 copy
changed npm's working directory to a temporary consumer, outside the repository
`.npmrc`, without passing either peer-policy flag. The retained R20 parent
environment is insufficient to establish strictness. Current npm settings in
`/tmp` are `strict-peer-deps=false`, `legacy-peer-deps=true`; a real deliberately
inconsistent local peer graph installs successfully with the old arguments and
fails **ERESOLVE** with the corrected arguments. R20's install/offline/consumer
passes remain valid observations, but their **strict-peer qualification was
unproven**. This is an evidence/test-policy correction: no failing shipped graph
or P1/P2 product consequence was verified.

Portal **`15f8a8d58a7ec00e397b806452e2ea8853e0a38d`** explicitly adds
`--strict-peer-deps --legacy-peer-deps=false` to both install and offline CI.
The retained task-local driver applies the same change. The accepted strict run
passes **12 packs / 20 checks**, and all 12 tarballs are byte-identical to R20's.
The pre-build-fix WSU tarball at `c2f547cc` is also byte-identical to R20's
(`1076ee2d15d413c939735c076d78789c36cf3d04e1b640b7fd09dd27510743bf`).
The initial R21 default-policy run is retained separately and is not counted as
strict verification. No package dependency, version pin or runtime body changed.

The final WSU `1b9b1ac` pack has SHA256
`13422ecc580f108a5dc9e5aee740135110f85361a43cacf811418d16ef4cb6b1`.
Member comparison finds no additions/removals and exactly one changed member,
`package/support/v6/README.md`. All runtime members match the R20-equivalent
pack. The build/CI scripts and tests are source/development inputs, outside the
hook's runtime pack.

## Independent review and evidence honesty

**Standards:** [incoming report](final-review-r21/standards-review.md) finds zero
documented-standard breaches, actionable baseline smells or new A/P1/P2 issues.
Its correctness/provenance checks are recorded above and are not duplicate parent
suite counts.

**Spec:** [incoming report](final-review-r21/spec-review.md) finds R21-02;
the [clean-CI follow-up](final-review-r21/spec-ci-followup.md) confirms R21-03 as
a separate introduced P2. It also identifies the stale header and concurs with
the P3 peer-policy qualification. No further non-HTTP service/configuration
defect or scope creep was verified. Axis totals are **Standards zero A/P1/P2;
Spec two A/P2**, both fixed; R21 still fails the zero-new-findings gate.

Fresh hash verification matches **66/66 original WSU, 83/83 R18, 117/117 R19
and 195/195 R20** ledger files. Archived incoming WSU hashes match **226/226**;
source provenance matches **227 WSU and 1,162 portal** pinned Git files. The
fresh source closure at `121794890` audits **1,219 candidates**, with zero
executable/dependency violations. Inventory has **1,190 files**, none
unclassified. All **1,261 baseline** dispositions reconcile and **430 added
candidates** are accounted for. R20's smaller candidate counts referred to its
earlier pinned source; they are not silently relabelled as current counts.

## Verification accounting and limits

| Fresh verification | Result |
| --- | --- |
| WSU shared compile/full unit suite | **546 passing**, zero failures; includes 88 HTTP and 15 build/CI tests |
| Isolated tracked builder-source context, existing installed dependency links | **546 passing**, zero failures; temporary context removed |
| Core loading, production ESM storage, maintenance extensions and handler ownership | **15 passing**, zero failures |
| Baseline/current/native loader fallback and discovery comparison | **13 cases agree** |
| Complete dev-tools suite | **60 passing**, including 1,271 resolver comparisons and 41 CLI/import cases |
| Root tooling | **38/38 passing**, no skips |
| Packed production install, offline CI and consumers, explicit strict/nonlegacy peers | **12 packs / 20 checks passing**; all 12 packs byte-identical to R20 |
| Bash/YAML and task accounting | Five build scripts parse; CI YAML parses and retains five jobs; **54/55** task ticks checked |

The 1,271 comparisons and 41 CLI/import cases are nested inside the 60 tests,
not additive suite totals. Intermediate WSU runs of 531, 541, 545 and 546 before
the final context correction are retained, but the table uses the final run.
Negative controls are expected failures: incoming build wiring **1 pass / 9
failures** (exit 9), incoming CI wiring **10 / 4** (exit 4), incomplete builder
context **14 / 1** (exit 1), pre-R20 HTTP **81 / 7** (exit 7), isolated old CI
compile exit 1, and the deliberate strict-peer conflict **ERESOLVE**, exit 1.
Corrected wiring/context checks and the current HTTP/packed suites pass; these
expected failures are not counted as passing suites.

| Task | Final tick and qualification |
| --- | --- |
| SR-005 | **[x]** WSU designation, released source fallback and authorized local topology scope stand; production access/source gaps remain explicit. |
| SR-045 | **[x]** Historical generic replica-set matrix and R20 installed WSU Mongo 8/9/FCV rows stand. No fresh R21 database or production topology qualification is claimed. |
| SR-049 | **[x]** Authorized local WSU upgrade/restart/partial-failure/four-database restoration stands; complete native recovery remains the separately retained historical rehearsal. |
| SR-055 | **[ ]** Two new A/P2 findings were fixed, but R21 is not a zero-new-findings round. A subsequent qualifying confirmation round is required. |

Commands, raw-log hashes, protected-checkout snapshots, exact inputs and results
are retained in [machine accounting](final-review-r21/review-accounting.json).
Raw files, including independent command transcripts, are under
`.tmp/sails-retirement/final-review-r21/`. The toolchain is Node **26.11.1**, npm
**11.20.0**. No runtime code has changed in R21, so R20's full fixture-backed
core/root/real-service, Mongo 8/9, installed restart/cutover/restoration and
artifact results remain **historical R20 evidence**, not fresh R21 executions.
The R20 25,000-shape resolver and 1,423-pair migration settlements are retained;
they are not counted again as fresh work here.

The sensitivity harness's first attempt wrote its preload relative to the WSU
working directory and failed before loading it. The next used command-line
`-r`, which the custom Mocha launcher's child did not inherit, so its 88 passes
were a current-code control, not regression sensitivity. Both logs remain;
the accepted sensitivity uses inherited `NODE_OPTIONS=--require=...` and
explicitly reports the pinned registration in the actual test process. No
worktree source/dist file was reverted or replaced for sensitivity.

No Docker daemon, container, network, volume or image was created by this round.
All **12 protected original/sibling checkout snapshots are unchanged**; converted
WSU is clean at `1b9b1ac`. Packed-consumer temporary installation cleanup is
recorded separately. No original WSU, sibling hook or unrelated GraphQL
specification file was written.
No push, publication or Git tag occurred.
