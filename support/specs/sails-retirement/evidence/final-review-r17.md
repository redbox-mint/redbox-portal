ZERO class-(A) P1/P2 issues found

# Sails retirement final review — round 17 confirmation

Feature base `a49366803164429f9d8bdd249dadcdf856c9d13e`; incoming HEAD
`1d38ddd1c00c6197d3a28ebe616248bfd008faf0`. Review used the shared
`stack/sails-retirement` checkout. The supplied specifications, inherited backlog,
R13–R16 reports and their ledgers were read closely; R1–R12 findings and coverage
were skimmed. AGENTS.md and tracked wiki supplied project conventions. Code
Review, ReDBox Angular Apps and ReDBox Testing skills informed the work, with
independent Standards and Spec reviewers. No worktree, branch switch, push,
publication or tag was used. The unrelated untracked GraphQL specification was
untouched.

No new class-A P1/P2 was concretely verified, so there is no issue location or
runtime fix commit to list. This is the requested **zero-issue confirmation
round**. Only review evidence and task/wiki/backlog status text change.

## R16 local-login correction and sibling authentication

`4bf60062f` correctly catches rejected login requests, displays the safe v1/v2
message or fallback with refresh guidance, re-enables submission and retains
the entered fields. Successful login still redirects, and ordinary credential
denial still displays its message. The shared BaseComponent schedules rendering
after asynchronous methods settle, including this rejection path; no additional
OnPush rendering correction is needed.

Fresh execution of R16's unchanged probes reproduces its three incoming causal
observations and seven corrected controls. A fresh actual Chrome Headless153 run
passes **37/37 local-auth tests**, covering the rendered button/message, retained
fields and success/denial controls. R16's original 36 expected browser failures
against the old consumer remain historical evidence, reverified by hash; they
are not represented as a new R17 browser run.

The new [native recovery probe](final-review-r17/auth-recovery-probe.cjs) passes
[12 observations](final-review-r17/auth-recovery-results.json): v1/v2 audit 500
destroys the failed session and clears the rooted cookie; the consumer recovers;
the old CSRF token is refused; a fresh session/token successfully retries. An
expired browser session preserves its rooted original destination through login.
Stale logout CSRF refuses effects while retaining authentication; fresh CSRF
permits logout and invalidates the session; GET logout remains 405.

OIDC/AAF buttons are navigation links and logout uses ordinary POST+CSRF forms;
they do not share the local Angular submit flag. Their routes, provider
installation, production bindings, page context and error/session paths were
traced. **165 existing authentication, policy and production-composition tests
pass**, including a controlled real OIDC protocol peer and signed AAF cases. No
sibling class-A stranded-state defect was verified. These checks do not claim a
live institution IdP, Mongo audit write or newly deployed browser qualification.

## Review of every R13–R16 correction

The [combined late-commit ledger](final-review-r17/late-commit-review.json)
accounts for **all 34 commits after `c8a5064d0`**, including generated inventories,
test-only changes, tooling and evidence commits. **19 runtime fix commits**
implement the prior rounds' **34 corrected issue families**; the supporting
browser-list correction belongs to R13's existing limit issue. Each runtime fix
has a retained regression sensitive to its absence. Fresh controls execute
current tests/dependencies with enumerated actual historical modules or extracted
consumers; they do not simulate a complete historical deployment.

| Round / commits | Correctness and regression conclusion |
| --- | --- |
| R13 `5f887304f`, `2f9634213` | Local credential lookup and configured OIDC names retain supported inputs without widening malformed-input acceptance. Fresh selected pre-fix controls fail 10 and 3 cases; current cases pass. |
| R13 `2d7516aaa`, `f1da6196e` | REST limits remain separate from browser/search limits. Fresh selected pre-fix controls fail two search and five browser cases; current 15 pass. Overlapping runs are not added as unique cases. |
| R13 `03b1d724e`, `217c61339` | Baseline configuration shapes and production bindings remain supported, including native SMTP/SMTPS URLs. Fresh selected pre-fix controls fail 10 and 2 cases; current acceptance/consumer tests and schema equality pass. |
| R13 `afaf6ef01` | Input aliases, precedence and request targets remain bounded to their route owners. Fresh pre-fix native controls give 26 passing / 33 expected failing; current 59/59 pass. |
| R14 `17504071e`, `c33416372` | Upload claim/finalization and original-view override contracts remain correct. Incoming modules fail nine and one current regression cases, respectively. |
| R14 `4c3261530`, `ea2a97c6c`, `da600162f` | REST identity selection/visibility, generic download streams/headers and empty RVA versions preserve the selected baseline behavior. Incoming modules fail nine, four and four cases. |
| R14 `8b64e7f69`, `8c9fef62f`, `fb08b5447` | Relationship envelopes, recoverable browser deletion, committed mutation outcomes/canonical Location and POST-preview precedence remain correct. Incoming modules fail two, nine and four cases. |
| R15 `8b091d8dc`, `e4a198691` | User/role mutations complete after HTTP rejection and retain drafts, modals and safe messages. Ten paired incoming/current native-response/consumer observations pass. |
| R15 `709483c46` | Both widgets put CSRF in outer Companion requests, including delayed configuration; nested Tus headers remain separate. 24 installed-client/native-CSRF observations, two setter controls and 12 delayed-widget observations pass. |
| R16 `4bf60062f` | Login rejection recovery remains correct; three incoming causal observations, seven corrected controls, 12 new recovery observations and 37 current Chrome regressions pass as described above. |

No correction was found wrong, unnecessarily broad, inconsistent with its
surrounding implementation or missing a causal regression. R14's two fixture
typing commits preserve runtime tests. R13's closure changes retain narrowly
classified literal data while detecting executable/ambient retired access:
**17 tooling tests pass**, including the three new prefilter controls.

R13's authored inventory/probe logic was reviewed separately from generated
data. Both configuration generators pass exact retained JSON/typing-fixture
equality. HTTP semantic reconciliation retains all 7,145 contract cells,
provenance, input-expression sets and dispositions; only current HEAD metadata,
source offsets and expression ordering are normalized. The 336-case permanent
inventory gate passes. The large generated inventories were mechanically checked,
not claimed as a line-by-line manual review. Baseline SMTP and 35 selected actual
controller/helper observations also pass freshly.

## Independent broader feature review

The [Standards report](final-review-r17/standards-review.md) and
[coverage](final-review-r17/standards-coverage.json) read the 38 central
application/host, extension, configuration, queue and maintenance TypeScript
files/8,352 lines end to end, plus stated build/configuration context. Ownership,
startup/rollback, replacement ordering, admitted work, drain/close and retry
remain consistent with the documented architecture. Generated schema equality
is separate from manual source review. No material documented-standard violation
or qualifying heuristic finding was verified.

The [Spec report](final-review-r17/spec-review.md) and
[coverage](final-review-r17/spec-coverage.json) independently trace native HTTP,
production data/lifecycle, target/tenant access, mutation outcomes, download/
upload resource ownership, persistence helpers and browser consumers. Large
Records/PrismaAttachments files have explicit bounded ranges and baseline diffs.
The parent supplies the authentication, route-manifest, integration/SIEM write
and export reads in [parent coverage](final-review-r17/parent-coverage.json).
Together the lanes cover all 51 Express modules and the central 88-module
host/application/extension/configuration/queue/maintenance set. Scope manifests
distinguish complete current reads, changed hunks, generated checks and exclusions.
No missing/wrong requirement, material scope creep or additional A/P1/P2 was
verified in these reviewed paths. This is bounded code review, not proof of
arbitrary institution hooks or external-provider behavior.

## P3, inherited backlog and status consistency

No new runtime P3 or inherited group was verified. R14's ten recorded P3
response/cache/wording groups retain their R15/R16 consumer dispositions;
the identity error group was partially corrected by R15. No severe
ordinary-signed-in-user access-control exception was demonstrated.
[B-01–B-14](inherited-defects-backlog.md) remain unchanged apart from the
through-R17 header. A source-library leaf lock observation did not demonstrate a
supported-use failure; the precise six-root structural check is retained without
an all-lockfile claim.

Task/wiki status now links R17 while retaining R16 as the latest **full**
qualification. Historical P8 images still qualify their exact `5088f4a7a` source.
Task counts remain **51/55 complete**; SR-005/045/049/055 remain unchecked solely
for the accepted undesignated representative institution. Historical evidence
reports remain snapshots, and no institution acceptance is inferred.

## Verification and qualification disposition

Fresh checks use Node 26.11.1/npm 11.20.0. Exact commands, counts and retained raw
log hashes are in [review accounting](final-review-r17/review-accounting.json),
[parent checks](final-review-r17/parent-checks.json),
[Standards checks](final-review-r17/standards-checks.json) and
[Spec checks](final-review-r17/spec-checks.json). Counts below overlap across
reviewers and are not added as unique tests.

| Fresh R17 gate | Accepted result |
| --- | --- |
| Parent authentication/policies/composition; local-auth Chrome | 165 / 37 passed. |
| Parent R13 HTTP acceptance; retirement tooling; documentation tests | 59 / 17 / 4 passed. |
| Standards late inputs/configuration, lifecycle, queue/maintenance and inventory | 354 + 141 + 72 + 336 = 903 passed. |
| Spec HTTP/data and lifecycle | 280 + 122 = 402 passed; zero pending. |
| Historical-module controls | Standards six groups: 17 passing / 32 expected failing; R13 HTTP: 26/33; R14 HTTP: 96/42. Only expected behavioral assertions fail. |
| Native/extracted consumer probes | Auth recovery 12, R16 incoming/current 3/7, R15 paired/causal 48 and pinned baseline methods 35 pass. |
| Generators and documentation audit | Schema/configuration equality and HTTP semantic reconciliation pass; 43 documentation surfaces, 524 existing advisories. |
| Incoming committed-tree retirement closure | 1,186 source candidates; zero executable/dependency violations; all 1,261 baseline entries reconciled; 1,157 classified current matches. |
| Pins and selected lock contracts | 23 manifests, 377 exact declarations, 20 permitted local references; six selected local-core consumer roots, zero violations. |

No runtime or test input changed after the qualified
`4bf60062fd2a9d1cf387d3ac993cf531c1b6032b` revision. **R16's full final-tree
qualification still applies to this runtime tree**; it was not rerun or relabelled
as fresh R17 qualification. Its 361 qualification artifacts, 19 retained review
artifacts, 82 durable review scratch artifacts and 89 source hashes (88 TypeScript
plus schema) all reverify. R16 retains core 5,631, real-service 224, root 422,
storage 306, dev-tools 53, PDF 79, Playwright 124 plus four dedicated retirement
browser cases, focused Angular 135, all Bruno suites and complete closure; exact
pending counts and other gates remain in [R16](final-review-r16.md).

Rejected review-driver attempts remain separate: the first documentation launcher
failed before the audit; the initial structural comparator selected a leaf lock
outside R16's six-root scope; the initial HTTP inventory comparator mishandled
serialized undefined values and expression ordering; the final link preflight
initially required its own not-yet-emitted accounting manifest. Corrected accepted checks
changed only review drivers/comparisons, with explicit limits; no application,
dependency or test source changed, and none of those failed attempts supplies a
passing gate.

All state and raw logs remain on durable disk under
`.tmp/sails-retirement/final-review-r17/`; no reboot or interrupted run occurred.
R17 created no Docker engine, container, network, volume or image and pulled/built
no images, so there are no owned Docker resources or dangling images to remove.
Owned loopback servers and Chrome/Karma processes exited. Existing unrelated
host resources were left alone.
