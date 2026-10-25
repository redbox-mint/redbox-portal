1 class-(A) P1/P2 issues found

# Sails retirement final review — round 16

Feature base `a49366803164429f9d8bdd249dadcdf856c9d13e`; incoming HEAD
`547370ac8a80e6f2af553e6958ad90343ff81d0a`. Work uses the shared
`stack/sails-retirement` checkout, without worktrees, branch switches, pushes,
publication or tags. The unrelated untracked GraphQL specification is untouched.
The eight supplied specifications, R1–R15 reports, R13–R15 ledgers, inherited
backlog, AGENTS.md and tracked wiki informed this review. Code Review, ReDBox
Angular Apps and ReDBox Testing skills were used. Independent Standards/host and
Spec/HTTP reviews are retained separately below. SR-005/045/049/055 remain
unchecked solely for the accepted undesignated representative institution.

## Verified class-A defect

| ID | Severity | File:line | Correction | Fix commit |
| --- | --- | --- | --- | --- |
| R16-01 | P2 | `angular/projects/researchdatabox/local-auth/src/app/local-auth.component.ts:87` | Catch rejected login requests, show a safe v1/v2 error or fallback plus refresh guidance, and re-enable the form while retaining its fields. | `4bf60062fd2a9d1cf387d3ac993cf531c1b6032b` |

The native login action now awaits its audit at
`packages/redbox-core/src/http/express/login.ts:187`. Correct credentials followed
by a rejected audit write produce a sanitized500 and destroy the failed session.
The incoming browser method propagated that rejection and left its submit button
disabled without a message or redirect. Executing the actual baseline
`UserController.localLogin` and `CoreController.recordBackgroundOperation` bodies
with the same rejected audit returns200/login success while recording the audit
failure in background. This is **class A despite the unchanged incoming client
source**: the feature introduced the realistic failing response boundary. It is
excluded from B-11. The fix preserves server audit/session cleanup; refresh
guidance explains how to obtain the new CSRF token before retrying.

The [incoming native proof](final-review-r16/local-login-audit-results.json)
retains three observations. The [fixed native proof](final-review-r16/local-login-audit-green-results.json)
passes seven controls using actual loopback HTTP, Passport sessions and CSRF,
with controlled identity/audit ports and the extracted production Angular
consumer. It covers v1/v2 audit500, real CSRF403, ordinary credential denial200,
successful login200 and actual baseline audit-failure behavior. It is not a
historical HTTP deployment or a Mongo audit-write test.

Actual Chrome Headless153 regression controls cover 12 statuses
`0/400/401/403/404/409/410/413/415/422/500/503` against v1, v2 and empty envelopes:
**36 expected incoming failures and one passing old control**, followed by
**37/37 fixed cases passed**. Tests inspect the rendered message and submit
button, retained fields and successful/denied login behavior. Logs and JUnit
remain under `.tmp/sails-retirement/final-review-r16/local-auth-*`.

## Browser error-handling sweep

The [per-callsite ledger](final-review-r16/client-error-sweep.json) reconciles
R15's exhaustive initiator inventory with source review of each intentional
status/envelope change in `support/wiki/V6-Client-Compatibility.md`:
401/403 authentication, membership and CSRF; 404 missing targets; 400/409/413/415/422
validation/conflict/upload limits;405/410 retired or unsafe methods; network 0,
500/503 and sanitized v1/v2/non-JSON errors. No shipped catch was found to depend
exclusively on403 where the native host can return401. Shipped logout forms use
POST+CSRF, and progress uses native grants/Socket.IO with disconnect or retry
handling. No additional realistic class-A stranded UI was verified.

| Scope or disposition | Count |
| --- | --- |
| Angular projects / production TypeScript / external templates | **22 / 259 / 80**; 20 apps and two libraries. |
| Shared browser package TypeScript | **141**. |
| HttpClient callsites / service owners / unmatched | **123 / 20 / 0**; R15 mapped 128 distinct native routes. |
| Recovery or typed completion / public unselected helpers | **95 / 6 callsites**. |
| Inherited incomplete recovery / quiet fallback / ignored shared typed outcome | **14 / 5 / 3 callsites**, respectively B-11/B-12/B-13. |
| Supplemental resource/protocol sites / explicit non-HTTP controls | **149 / 54**, including two Tus and six Companion installations. |
| Legacy browser entry files / request initiators | **58 / 15**. |
| Source hash inputs reconciled | **560**: 559 unchanged, plus the reviewed local-login fix. |
| Extracted recovery methods / rejected-port observations | **32 / 1,152**: 12 statuses × three envelopes per method. |
| Baseline/current inherited rejection / ignored typed-result observations | **32 / 4**. |

The [rejected-port results](final-review-r16/client-error-results.json) execute
production methods against injected rejections. They establish completion and
message/state behavior, not per-endpoint HTTP emission of every synthetic code
or deployed browser qualification. Callsite dispositions can have multiple
consumers; shared layers overlap. The inventory includes inherited failures and
does **not** assert that every legacy client recovers. External providers,
passive browser resources and arbitrary institution scripts are bounded
separately. An initial missing-`window.confirm` probe fixture and a hardcoded
branding rejection fixture were corrected before the accepted probes; those
preliminary attempts supply no passing gate.

## R15 critique and independent whole-feature review

All three R15 fixes remain correct. User and role mutations complete after native
HTTP rejection and retain safe messages/drafts. Both upload widgets provide CSRF
in actual Companion request headers, including delayed configuration updates.
Independent controls retain ten administration observations, 24 installed
Companion/native-CSRF observations, two setter controls and 12 actual delayed
widget/private-client observations: **48 in total**. Provider dispatch is
controlled; no live cloud OAuth/transfer is claimed by those probes. No R15 fix
was reversed or found wrong.

The [Standards report](final-review-r16/standards-review.md) and
[coverage](final-review-r16/standards-coverage.json) cover all 38 scoped TypeScript
files/8,352 lines: 13 application, seven extension, 11 configuration, five queue, one
maintenance and ExpressHost. Acquisition, activation, dependency/replacement
ordering, configuration consumers, admitted work, completion, drain and retry
were read end to end. The generated 9,715-line schema was checked by whole-file
generator equality and retained-input checks, rather than claimed hand review.
Focused lifecycle/extension/configuration checks pass 101 cases; queue,
maintenance and configuration checks pass 293. No material documented-standard
violation or further A/P1/P2 was verified.

The [Spec report](final-review-r16/spec-review.md) and
[coverage](final-review-r16/spec-coverage.json) cover all 51 Express files/9,865
lines and both production bindings/644 lines. They trace target/tenant access,
authentication, data normalization, response completion, request/resource
ownership, multipart, downloads, progress and provider protocols. Together the
axes cover **88 unique scoped TypeScript files/17,912 lines**; ExpressHost and
production bindings overlap. The 51 HTTP adapter hashes remain unchanged after
the browser correction. No further verified A/P1/P2 or material scope creep
remains in this scope. These are bounded review conclusions, not proof of every
institution hook or arbitrary external-provider behavior.

## P3 documentation and inherited backlog

Two trivial class-A P3 documentation groups are corrected: task status/counts and
review links now distinguish historical P8 images from subsequent source/compiled
qualification; wiki descriptions no longer advertise controller shim generation
or call the rewritten v6 extension guide historical v5 guidance. The header
states **51/55 complete** and links R1–R16. Historical reports remain snapshots:
the Standards review's “unapplied patch” describes its read-only capture, before
the parent applied and completed that reconciliation. R14's ten bounded P3
response/cache/wording groups retain their R15 consumer dispositions; no further
runtime P3 correction was warranted this round.

Four verified inherited groups are appended to the
[backlog](inherited-defects-backlog.md), leaving B-01–B-10 unchanged:

- **B-11 P2:** older list/bootstrap consumers lack visible rejection recovery;
  14 callsites, 32 baseline/current observations. Local login is expressly
  excluded and fixed as R16-01.
- **B-12 P3:** five read callsites can quietly use empty/default data after
  rejection; full consumer files are byte-identical to the baseline.
- **B-13 P2:** deleted-record restore/destroy ignore unsuccessful typed results;
  four baseline/current observations and unchanged component/shared service.
- **B-14 P2:** the raw-audit download link omits a configured deployment root.
  Five native/source controls prove unprefixed404 and prefixed200; the actual
  baseline URL builder produces the same link. See
  [retained proof](final-review-r16/audit-root-results.json).

No severe ordinary-signed-in-user access-control exception was demonstrated.
Inherited behavior is recorded without runtime changes.

## Final-tree qualification

Every accepted gate uses runtime/test inputs frozen at
`4bf60062fd2a9d1cf387d3ac993cf531c1b6032b`, on Node **26.11.1**, npm
**11.20.0** and MongoDB **9.0.4**. The
[qualification manifest](final-review-r16/qualification.json) records fresh suite
results, source/compiled dependency and asset audits, toolchain/images, explicit
rejected-attempt accounting, cleanup and **361 durable qualification artifact
hashes**. Logs, drivers and the frozen source archive remain under
`.tmp/sails-retirement/final-review-r16/qualification/`; no R15 result supplies an
R16 qualification gate.

| Gate | Accepted result |
| --- | --- |
| Core default | **5,631 passed**, seven existing pending. |
| Core real-service | **224 passed**, zero pending; natural process exit without `--exit`, debugger or in-process diagnostics. |
| Companion lifecycle / Mongo uploads | **2 / 6 passed**. |
| Root integration | **422 passed**, ten existing pending. |
| Storage / dev-tools / PDF unit | **306 / 53 / 79 passed**. |
| Full Playwright / harness | **124 / 19 passed**, zero failures or skips. |
| Dedicated retirement browser | **4 passed**, including visible Angular, real progress/upload bytes, Keycloak and persisted PDF/session/upload work through retried stop. |
| Production host / generated institution fixture | **1 / 1 passed**. |
| Persisted compiled hooks | **5 passed**, zero skips. |
| Bruno general | **309 requests, 554 tests and three assertions passed**; 557 JUnit cases. |
| Bruno OIDC / S3 / PDF | **13 / 7 / 4 requests**, **17 / 12 / 10 tests passed**, zero failures/errors/skips. |
| Packed standalone maintenance | **Ten commands across 102 scopes**, three Agenda scopes; pending/failures/pools zero and explicit backfill changes one entry then zero. |
| Focused Angular | **135 passed** in Chrome: users39, roles5, widgets54, local-auth37. |
| Clean source build | Literal **npm ci --ignore-scripts --strict-peer-deps**, **compile:all** (backend, 22 Angular projects and Webpack) and **package:pages** exit zero. Nine existing build advisories. |
| Backend/static | Five fresh package builds, all declared host/container typechecks, Prisma/configuration checks and **17 closure-tooling tests passed**. |
| Lint / documentation | **937 files, zero lint errors**, one existing control-regex advisory; **43 documentation surfaces**, 524 existing advisories and **four documentation tests passed**. |
| Pins / lock roots | **23 manifests, 377 declarations, 20 permitted local references, six lock roots**, zero violations; dependency versions unchanged. |
| Retirement closure | **1,175 committed source / 6,079 compiled-tree files**, zero executable/dependency violations; **1,261/1,261 baseline files reconciled**, 1,146 current classified matches. |

Both container source audits compare **all 5,025 frozen files**, with zero
differences after qualification. Fresh clean-compiler Angular exports contain
**185 files** across four apps; **187 asset checks** include raw and minified
progress artifacts. Builder public bytes match the clean compiler and exported
apps; Compose profiles retain R15's separate frozen raw-progress overlay. Both
actual matcher consumers in the builder and clean compiler resolve exact
**path-to-regexp8.4.2** bytes. Installed-tree closure also passed again after the
separate builder Bruno prerequisite was installed. The review source hashes and
retained artifacts are independently reverified in
[review accounting](final-review-r16/review-accounting.json): **88 scoped TypeScript
files plus the generated schema, 19 retained review artifacts and 82 durable
review scratch artifacts** reverify. The final documentation regeneration/audit
also passes 43 surfaces with the same 524 advisories.

Two qualification-driver assertions failed before any suite started. The overlay
initially assumed the tracked `packages/raido/dist` destination did not exist;
then its progress-asset audit incorrectly required raw source and minified
Webpack output to have identical bytes. Both failures and the explicit prefix
adjudication are retained. All 5,025 frozen inputs in both containers still match;
clean npm ci/compile:all/package:pages and the five fresh package/type/schema
checks completed successfully. The corrected checks compare the actual clean
compiler, exported scratch artifact and builder public bytes: 187 asset files
match, including four Angular applications and the minified progress helper.
Only these driver steps were corrected/continued; no application, fixture,
dependency or test source changed, no reboot occurred and no qualification
suite result was reused. The fresh full suites run after these corrections.

The first host static attempt then rejected the scratch dependency-symlink facade
with TypeScript2742 inferred-name portability diagnostics referring to deep
external `@types/qs` realpaths. The normal host layout, core TypeScript executable
and unchanged `--noEmit` configurations used by R15 are used for the accepted
host retry; container checks already passed. Its failure, original sequence and
explicit adjudication are retained. The completed 135-case Angular prefix stays
accepted against unchanged runtime/test inputs; static and all remaining suites
run fresh. Host lint/docs also use the normal checkout, including the final
current documentation. No compiler flag, runtime/test source or dependency was
changed for this environment repair.

The first real-service attempt completed 215 passing/9 failing because setup had
removed the builder's separate `test/bruno/node_modules`; every failure was the
same missing locked CLI entry point. Its whole 224-case group is rejected. The
failed process retained handles and was explicitly terminated; that attempt is
not claimed as natural exit. The exact frozen Bruno lockfile was installed in
the builder with `npm ci --ignore-scripts --strict-peer-deps` (CLI 4.2.1), owned
Mongo/Solr data reset, and the entire real-service/Companion group rerun. No
runtime/test source, lockfile or dependency version changed. Passing earlier
gates remain tied to the unchanged freeze, with explicit retry adjudication.

All owned containers, volumes, networks, firewall rules and hosts aliases are
removed. The parent-restored isolated Docker/containerd processes are stopped;
their remaining owned default network-namespace mount was explicitly unmounted
before removing `/run/sr-p7-isolated`. The initial busy-mount cleanup attempt is
preserved separately. No images were built/pulled and no new dangling images
remain; pre-existing images/data on disk are preserved. Generated Bruno files
were restored byte-for-byte. No reboot interrupted qualification.

Historical pinned images were used with current frozen source/compiled overlays;
this does not claim replacement immutable images, a repeated topology matrix or
representative-institution acceptance. The four accepted unchecked tasks remain
unchanged. One P2 was found and fixed, so R16 is **not** a zero-issue confirmation
round; no verified class-A P1/P2 remains after the correction.
