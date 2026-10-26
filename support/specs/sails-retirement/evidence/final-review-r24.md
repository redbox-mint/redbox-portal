# Sails retirement final review — round 24

**One NEW class-(A) P2 finding; zero P1. The P2 is fixed. R24 does not pass
the confirmation gate.** SR-055 stays unchecked: remediation does not turn a
one-finding round into a zero-new-findings round. **54/55 tasks remain checked.**

Git logs verified incoming portal
**`1d579f8e5a3c2dd575e5e1479884507fae467474`** on `stack/sails-retirement`
and converted WSU **`80b2b80c036cbfd286d36ac9140beee2421d42d5`** on
`feature/v6-express`. The requested whole-delta comparisons are portal
`8b049580db7f3ef340c06a94b68b5bfa3930ca01..1d579f8e5` and WSU
`14ab99eb3a89434b9c886d51d5edc37447f43588..80b2b80`, followed by review
of the R24 remediation. Both AGENTS.md files, the standards/testing wiki,
retirement contracts, R18–R23 and institution evidence informed the review.
The code-review skill supplied independent Standards and Spec reviews;
ReDBox Testing informed qualification boundaries.

## New finding and remediation

**R24-01 — A/P2: the WSU development host-port selector breaks browser login.**
At incoming WSU `80b2b80`, setting `REDBOX_PORTAL_HOST_PORT=18599` while
leaving `REDBOX_PORTAL_APP_URL` unset publishes `18599:1500` but selects
`REDBOX_PUBLIC_URL=http://localhost:1500`. A browser POST from
`http://localhost:18599` is rejected by the production CSRF middleware with
**403 “Cross-origin request denied”**, even with a valid session token.
Local login uses that middleware. This violates the design's requirement to
“Preserve local login” and is a concrete case beyond R22's default-port table.
Baseline WSU `14ab99e` derives `sails_appUrl` from the selected host port;
the same browser-origin probe accepts it. The fixed-port default was introduced
by the conversion.

WSU **`8dd61118eed9582be8d4d01359677b9be4dba631`**
(`fix(wsu): match the development browser origin to its host port`) changes:

- `support/development/docker-compose.yml`: use
  `${REDBOX_PORTAL_APP_URL:-http://localhost:${REDBOX_PORTAL_HOST_PORT:-1500}}`.
- `support/v6/README.md`: explain the selected port and explicit URL precedence.
- `test/unit/development-origin.test.ts`: cover default, selected host port,
  explicit URL and empty selectors, with actual `createHttpCsrf` acceptance,
  invalid-token rejection and foreign-origin rejection.

The four new regressions produce **3 passes/1 failure before the fix** and
pass afterward. The complete WSU production compilation succeeds and unit suite
has **559 passes**. Unit tests expand the actual YAML scalars using Bash's
matching default syntax so they do not add a Docker CLI requirement to the
builder. A separate [real offline Compose probe](final-review-r24/compose-origin.cjs)
checks all four configurations against baseline, incoming and final files:
**12 rows**. It reproduces the incoming 403 and verifies all final cases.
No CSRF exception or origin-validation relaxation was added.

**R24-02 — A/P3: R23's historical classification overmatches a live link.**
The sampled `portal:support/wiki/TUS-and-Uppy-Companion-Setup.md:4` links to
current upload cutover guidance. R23 calls it “intentionally historical” because
the classifier matches `sails-retirement` in the path. The live guide has no
incorrect instruction. The [R24 sample overlay](final-review-r24/documentation-spot-audit.json)
corrects this row to “current”; the immutable R23 ledger and its original totals
are preserved. The heuristic is recorded without expanding this confirmation
round into a ledger rewrite. This accounting defect adds no P1/P2 finding.

No additional inherited P1/P2 or actionable P3 was verified. Existing inherited
backlog groups B-01–B-17 remain outside the feature gate; R23's B-17 dispositions
are not relabelled as introduced findings.

## Confirmation of R23's ten fixes

Portal **`9a2d72bd3433c807f0edece68be6d0f0e8ee7e55`** changes Markdown
and `test/tooling/retirement-docs.test.cjs`, with **no executable runtime-source
change**. Its CommonJS helper, secret instructions and provider lifecycle edits
are documentation examples. All ten current regressions pass in the fresh full
root-tooling run. [The sensitivity runner](final-review-r24/confirm-r23.py)
replaces only documents with pre-fix `f22474ec4` versions in a disposable
snapshot, keeping current tests and runtime: **0 pass/10 fail/0 skip**.
The recorded failures correspond to each original defective path.

| R23 fix | Fresh confirmation and safety check |
| --- | --- |
| 01 — explicit configuration/forms/schema | Load the exact AppConfig CommonJS example through `loadPortalConfiguration`; strictly compile and invoke the forms registration. Check selected-fragment placement and removed aliases. A supplemental real-loader probe accepts `false`/`true` and rejects string booleans. |
| 02 — development secrets | Execute the exact README secret/export/start block with an npm adapter calling actual offline Compose. Current passes required-secret interpolation; pre-fix fails. The private per-development secret and persistence guidance does not claim this shell block provisions a production secret. |
| 03 — diagnostics | Confirm `app.express.cjs`, debug script and readiness guidance against current entrypoints; the regression rejects deleted startup flags and executable. No portal start or readiness deployment is claimed. |
| 04 — chronicle handler | Strictly compile and invoke the complete Express handler; assert its safe API-v2 error envelope using current chronicle and response APIs. |
| 05 — Companion setup | Load the exact configuration example offline; inspect explicit actor/brand/object authorization and lifecycle contracts. Fresh Companion configuration/process tests pass. No provider OAuth or external upload is claimed. |
| 06 — shipped skills/page helper | Scan all shipped Markdown skill copies for the retired APIs and render the exact EJS block using real PageArtifacts and page locals; assert the bundle URL. |
| 07 — dashboard migration | Strictly compile and execute the captured-input offline preview; verify explicit resolution data and removal of rejected environment controls. No database mutation occurs. |
| 08 — cache/storage/PDF lifecycle | Execute real neutral storage registration and inspect owned initialization/activation/quiesce/drain/close contracts. All five PDF ownership tests pass, including retained cleanup, accepted writes and retry cancellation. They use fixture browser resources. |
| 09 — Figshare binding | Strictly compile the complete binding sample and execute real binding resolution with an injected crosswalk resolver. No Figshare network call occurs. |
| 10 — CommonJS configuration helper | Node syntax-check the exact `.cjs` helper, invoke its exported async function with real selected CJS/ESM files and assert local-file precedence. The former top-level `await` fails. No startup side effect is introduced. |

The focused configuration/deployment, Companion lifecycle/configuration and
PageArtifacts suite has **17 passes**; PDF ownership has **5 passes**.
The exact initial hook-migration shell flow also succeeds through offline
init/install/build/check/pack, and the exact Services-guide init block succeeds.
These executions confirm the guidance without substituting new runtime APIs.

The first supplemental schema harness rewrote one CJS filename between values
and observed the first cached export on the next load. `loading.ts` imports
selected module URLs; Node caches those modules. Repeating with a unique file
per value passes all four assertions. Both logs are retained; the first is a
harness failure, not a product finding or an accepted run.

## Documentation spot-audit

The [sample record](final-review-r24/documentation-spot-audit.json) contains
**20 items across 19 pages**, selected from R23's “current” and “intentionally
historical” rows. It preserves exact item IDs/text, R23 and current locations,
page hashes, classification and source/execution reasons. **19 classifications
are confirmed; one is corrected under R24-02.**

Current samples cover the quick start, CommonJS loader, AppConfig, forms,
chronicle, Figshare, PDF/storage registration, bundled Angular EJS, dashboard
conversion, WSU maintenance, record-schema configuration, shim retirement and
the Markdown parser fragment. Historical samples cover the explicit v5 locale
notice, lifecycle “Before” example, retired loader registrations, unsupported
`.sailsrc`, and preserved pre-v5 acceptance Compose. The final live-maintenance
link sample exposes the P3 classifier error described above.

All **133 incoming page hashes match R23's final ledger**. After R24 remediation,
only WSU `support/v6/README.md` changes among those pages; the sample record
uses its final hash. The fresh shell/CommonJS syntax survey records **105
checks/102 successes**, with the same two explicit replacement placeholders
(`<shell>`, `<portal-host>`) and inherited combined validation fragment already
recorded in B-17. This is a sample audit plus syntax survey, not a second claim
to execute every command in the 133-page table.

## Standards

The independent [Standards report](final-review-r24/standards-review.md) finds
**zero new A/P1/P2**, no material documented-standard breach and no actionable
introduced smell. It examines both pinned deltas, service bindings, publication
side effects, extension preflight, dependency/audit controls and qualification
drivers. Its reported 36 retired-dependency controls, conventional-view scans
and 278 exact/local dependency entries across 16 manifests passed. These are
reviewer-reported probes, separate from the main logged suite counts.

## Spec

The independent [Spec report](final-review-r24/spec-review.md) finds **one new
A/P2, no P1**: R24-01. It reports 29 matching baseline/current in-memory service
scenarios and no further concrete missing/partial requirement or scope creep.
The [bounded remediation review](final-review-r24/spec-remediation-review.md)
accepts WSU `8dd6111` after four regression cases and four real offline Compose
cases, with no unresolved objection. These checks are not added to the main WSU
suite or 12-row comparison counts. Standards: zero P1/P2; Spec: one P2, fixed.

The whole-delta pass includes remaining explicit composition/service bindings,
extension/provider ownership, auth/CSRF, configuration, dependency controls,
entrypoints and qualification drivers. Settled export resolution (R20), 25 WSU
migrations (R20), HTTP table (R21), default clean-clone/CI/development paths
(R22), and documentation table (R23) remain accepted within their stated scope.
Only the concrete selected-port failure reopens a settled surface. No additional
new class-(A) P1/P2 is verified.

## Current qualification and historical limits

Fresh R24 uses **Node 26.11.1 / npm 11.20.0**. Commands, working directories,
exits and log hashes are in [machine accounting](final-review-r24/review-accounting.json).

| Fresh check | Result |
| --- | --- |
| `node --test test/tooling/*.test.cjs` | **49 pass**, zero failures/skips; includes all ten R23 regressions |
| Full dev-tools test/build | **60 pass**, build exit 0; includes ordinary 1,271-case resolver regression |
| `npm run docs:test` | **4 pass** |
| `npm run docs:audit` | **Exit 0**, 43 published surfaces / 524 advisory findings |
| Core `tsc --noEmit` | **Exit 0** |
| Focused core configuration/deployment/Companion/PageArtifacts | **17 pass** |
| PDF lifecycle | **5 pass**, fixture browser; no native PDF claim |
| WSU `npm run test:unit` | **559 pass** after production compilation; incoming suite was 555 pass |
| New WSU regression sensitivity | Before: **3 pass/1 expected fail**; final four cases pass within full suite |
| Actual offline Compose + actual CSRF | **12 rows**; expected incoming selected-port rejection, all final cases correct |
| R23 sensitivity against pre-fix documents | **0 pass/10 expected fail/0 skip**; wrapper exit 0 |
| Exact hook-migration and Services-guide shell flows | **Both exit 0** in disposable offline authoring directories |
| Source AST/dependency closure at portal `1d579f8e5` | **1,234 candidates**, zero executable violations/forbidden entries |
| Source inventory at the same pin | **1,205 matched files**, zero unclassified |
| Reconciliation | All **1,261 baseline files / 451 added candidates** accounted for; 736 remaining-classified, 136 removed, 371 retained without candidates, 18 dependency metadata |

Before deciding task disposition, the required restricted Git comparison was
rerun:

```text
git diff --stat 5786b7e77..HEAD -- 'packages/*/src/**'
 packages/redbox-core/src/services/figshare-v2/README.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

There are **no executable portal `packages/*/src` changes since R20
`5786b7e77dfa56bec6e8e5919a01d206c41bf289`**, and no host/dependency contract
changes. WSU `src/**` is unchanged since its R20 fix
`50293cc2cc1b8d34e6ec649d80c1faa64d4235ff`. WSU's R22 `support/v6/app.cjs`
change only prints bounded guidance for the known index-readiness error; R22
already qualified it with full WSU/installed/development runs. No such runtime
body changes afterward. R24 changes Compose data, Markdown and a regression.
The condition requiring repetition of full core/root runtime suites is not met;
the affected complete WSU compile/unit suite was rerun for the Compose change.

R20's full core/root runtime suites, MongoDB 8/9 matrix, installed cutover,
restoration and differential checks remain **historical R20 qualification**.
R21 HTTP and R22 clean-clone/CI/development qualification retain their recorded
prerequisite, publication and architecture limits. R23's documentation ledger
and B-17 comparison remain historical. R24 runs no new image build, installed
application, Mongo matrix, recovery rehearsal, provider OAuth or external side
effect. The ordinary dev-tools resolver test does not repeat R20's settled
25,000-case matrix. No historical result is counted as a fresh R24 pass.

## Cleanup and final ticks

Disposable authoring, compiler, selected-configuration and syntax directories
are removed. The review-created Python bytecode cache is removed; hashed raw
evidence stays under `.tmp/sails-retirement/final-review-r24/`. No Docker
container, image, network or volume was created: Compose was used offline.

All **14 safeguards** match before/after: 12 protected original/sibling hook
checkouts, the converted WSU worktree's tracked-diff/status/untracked snapshot,
and the excluded GraphQL specification tree. Converted WSU is clean at its
authorized new commit; snapshot equality does not assert its HEAD is unchanged.
Original WSU, its untracked files, siblings and
`support/specs/graphql-record-metadata/` were not modified. No dependency pin,
manifest or lock was changed. No push, publication or tag occurred.

| Task | Final tick and qualification |
| --- | --- |
| SR-005 | **[x]** Existing WSU designation, released-source fallback and authorized local scope stand; production-only gaps remain explicit. |
| SR-045 | **[x]** Existing R20 Mongo 8/9 and earlier generic replica-set evidence stand; no fresh topology qualification claimed. |
| SR-049 | **[x]** Existing local cutover/restart/partial-failure/checkpoint restoration stands; no fresh recovery rehearsal claimed. |
| SR-055 | **[ ]** One new A/P2 fixed; a subsequent round finding zero new A/P1/P2 is required. |

The recorded task total remains **54/55**. Production-only acceptance work
retains the limits in [institution qualification](institution-wsu.md).
