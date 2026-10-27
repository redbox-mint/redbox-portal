# Programme review — Round 18

**NO ISSUES FOUND**

Input and frozen qualification: `790e92ca53bf7a6e2d0f0b756b912adf53d620fa`,
branch `t3/waterline-retirement`; merge-base `ef23e07fe`. No runtime/test fix or
dependency change qualified. This evidence-only commit follows qualification.

## Independent review

Read R17 README, ownership state machine and transition pairs, then R14 coverage.
[Ownership review](ownership-review.md) verifies R17 against the actual service
and pinned Agenda/Mongo/SQS implementations: acquiring/owned/pending/uncertain/
release-failed/ended states, delivery identity, serialized saves/releases,
terminal and ambiguous outcomes, retry preservation and the admission overlay.
There is one compact claim record per unsettled delivery and one release path;
no superseded timestamp-candidate state or competing ownership registry remains.

The declared **12×12 ordered pairs per backend, 288 total**, are structurally
complete and agree with the source guards. [Pair audit](pair-audit.json) and
[source audit](source-audit.json) provide compact corroboration. This is source
inspection with executable witnesses, not 288 independently executed live overlaps.
The five requested invariants hold under the documented contract, including
bounded failed drain attempts that retain resources and ownership for retry.

[Coverage](coverage.md) records the fresh remaining-feature P1/P2 pass against
`ef23e07fe`. No concrete branch-introduced P1/P2 qualified. ADR0003 remains
ReDBox-owned repositories over the official MongoDB driver, without an ORM.
C2's intentional legacy-null timestamp handling and retired-Prisma refusal are
intact. P10 promotes only staged storage. G-TX stays CLOSED: Records/DeletedRecord,
CAS/lifecycle/permanent identity, U/authorization, Counter and attachment OID
rebind remain Waterline/native-owned. No release/institution/topology gate is waived.

## Verification

All **77 inventory entries passed in one complete runner invocation, exit 0**,
using the retained `d73b89047` runner and **npm 11.20.0**. No test failed and no
unchanged flaky retry was needed. [Verification](verification.json) records each
result, count, duration and raw-log SHA256; [attempts](attempts.json) distinguishes
read-only stock-container readiness polls from test executions.

- Core/storage builds; root/core/storage lint; root, persistence, cache and
  focused typechecks; storage test compilation: pass.
- Core **4,304 passing / 117 pending**; storage **291 passing / 38 pending**;
  separately enabled live storage **329 passing**.
- Figshare worker/HTTP **57 per selector**; live ownership **25 per selector**;
  failure/retry **5**; real Sails lower/signals **4**.
- Fresh stock Mocha **419 passing / 10 pending**; fresh Bruno **309/309 requests,
  553/553 tests, 3/3 assertions**.
- Both development selector configurations; index deployment/preflight/upgrade;
  HTTP/GridFS; selector edges and TLS/SRV: pass.
- Creation budgets **16 assertions / 24 samples**, zero failures. See
  [measurements](create-budget.json).
- Existing-volume upgrade **49 scopes / 20 collections** ready after explicit
  preparation, with all **six sentinels preserved**. Startup refuses HTTP before
  preparation, then returns **200**. See [upgrade](existing-volume-upgrade.json).

All seven supplemental commands passed: strict compilation, **116 focused
controls**, **eight live Mongo/Agenda scenarios**, SQS historical-receipt lifetime,
HTTP scope isolation and both default deadline/retry probes. The live scenarios
cover old/equal-timestamp release, overlapping ambiguous renewals, bounded state
after 128 failed renewals, stale saves, completion/retry reply loss, refused final
save and active-handler Job.save. [Supplemental evidence](supplemental.json)
records commands, counts, durations and hashes.

The SQS probe processes **256 historical deliveries** and releases only the final
active receipt on shutdown. Worker and real HTTP drain attempts return after
**30,006 / 30,000 ms**, retain resources, refuse late completion enqueues and
complete cleanup on retry. HTTP already returned **200**; callbacks occur once
per attempt.

## Integrity and cleanup

All **630 runtime sources / 1,856 compiled artifacts** match throughout final
qualification and supplemental probes; all **39 tracked manifests/locks** retain
their starting hashes. Both fresh portals and the Bruno CLI report npm **11.20.0**;
all **16 sampled critical artifacts per portal** match the host. [Runtime evidence](runtime.json)
records compact map hashes, artifact hashes and actual Node/npm versions.

Final resource sets exactly match the initial **31 containers, 77 volumes and
10 networks**, with no running containers or owned additions. All **11 retained
rollback image tags** preserve their original IDs, including
`redbox-p10-s:prior-12e566575`. See [cleanup](cleanup.json).

All R1–R17 history remains ancestral. No push, history rewrite, manifest/lock
change or quota limit occurred. Only compact structured evidence is committed;
raw logs and probe scripts remain ignored under `.tmp/review-round-18/`.
`SHA256SUMS` covers every other file in this evidence directory.
