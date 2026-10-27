# P0R ORM re-evaluation — commands, results and limits

Date: **2026-10-20 Australia/Adelaide** (capture timestamps are **2026-10-19 UTC**).
Input: P0 at `dc9b9cb49^`, with G0 HOLD; human decisions first recorded in
`dc9b9cb49`. Spike/source/upstream checkpoint: `5d20cb4cc`; final evidence revision
is the commit introducing this record. See [ADR0003](adr/0003-orm-reevaluation.md).

**Current disposition (2026-10-20): P0R.1–P0R.7 COMPLETE; G0R PASSED.** The user
accepted ADR0003 and revised the v6 cache contract to driver-repository cache.
G0 remains HOLD and G-TX remains CLOSED on undecided OPS-TX-01. Transaction-free
P1/C2 implementation is authorized; see [P1 validation](p1-validation.md).

The experiment and results below are a **historical research record preceding
acceptance**. At that checkpoint the recommendation was proposed and no
production code, application manifests/locks, stack, selector, institution data
or existing container changed. Subsequent approval is recorded at the end;
references below to pending architecture approval describe that earlier state.

## Inputs and exact environment

Reviewed the programme design/plan/tasks, P0 inventory/validation, ADR0002 and
evidence (including actual raw BSON/junction, mappings, native owners,
atomicity/budgets and capabilities), plus the cache pilot's design/ADR/phase
validation/tasks/P7/deferred behavior and current persistence implementation.
Root AGENTS.md and wiki architecture/services/core/loader/coding/testing/
development/config/cache/hook guidance supply repository conventions. The
[input hashes](evidence/p0r/inputs.json) are a historical pre-ADR-edit snapshot,
not a claim that documents intentionally updated by P0R still have those hashes.

The user's 2026-10-20 decisions are recorded verbatim in substance in
[environment-release-support.md](evidence/environment-release-support.md#human-decisions--2026-10-20-binding-task-direction):
re-evaluate now; topology **NOT DECIDED** with no stack switch; branding
**REQUIRE SAME DEPLOYMENT** without history relocation; budgets/pre-change built
images **PROVISIONAL FOR NEXT**, formal operations approval only for official
releases; REL-01/SEC-01/INST-01 open. The updated design/plan/tasks are conditional
on accepting the proposed backend. ARCH-01 adoption is not marked approved.

| Component              | Exact tested / captured value                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Host debugging/tooling | Node **24.18.0**, host npm **12.0.2**; lock/install explicitly invoked **npm 11.20.0** instead.                                         |
| Docker Node matrix     | **24.16.0-bookworm**, **26.11.1-bookworm**; image digests in environment.txt.                                                           |
| Compiler/module        | TypeScript **5.9.3**, strict NodeNext resolution/emission, CommonJS package with no `type:module` change.                               |
| Prisma                 | CLI **8.0.0-rc.23**, Mongo runtime **8.0.0-rc.18**, independently pinned; RC/early access, still current latest.                        |
| MikroORM               | Core **7.2.5**, Mongo driver **7.2.5**; its MongoDB dependency dedupes to **7.7.0**.                                                    |
| Direct driver          | **mongodb 7.7.0**.                                                                                                                      |
| Mongoose control       | **9.11.2**, its MongoDB dependency dedupes to **7.7.0**.                                                                                |
| Package manager/lock   | Spike-only packageManager **npm@11.20.0**, exact direct pins, lockfileVersion **3**.                                                    |
| MongoDB                | **8.0.34**, FCV **8.0**; `mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.                        |
| Spike topology         | One-member replica set **wr_p0r**, random 127.0.0.1 published port, `directConnection=true`, no auth/TLS; test-only failpoints enabled. |
| Logical databases      | `mongodb` represented by **wr_p0r_app**, `redboxStorage` by **wr_p0r_storage**, both on that one owned deployment.                      |

Evidence: [environment](evidence/p0r/environment.txt),
[primary-source report](evidence/p0r-upstream.md),
[dated sources/versions/hashes](evidence/p0r-upstream.json),
[spike package/lock/runner](../../spikes/orm-reevaluation/README.md).
The npm metadata and source facts were researched independently in a background
research agent, then checked against the executable results here.

## Isolation and reproducible commands

The spike owns only `support/spikes/orm-reevaluation/` and its evidence. Its
`package.json` has exact direct pins and its own npm 11.20.0 lock; application
manifests/locks are unchanged. Runtime tarballs omit dev tooling and install away
from root/core dependency ancestry. `node_modules`, `dist`, `.tmp` and tarballs
are ignored, not committed.

Completed commands (repository root unless stated otherwise):

```bash
git status --short --branch
docker ps --format '{{.ID}} {{.Names}} {{.Image}}'
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}'
node --version
npm --version

cd support/spikes/orm-reevaluation
# Exact installed npm CLI obtained from the npm@11.20.0 bootstrap cache:
node /home/andrew/.npm/_npx/9ecf9ce147f291fb/node_modules/npm/bin/npm-cli.js install --ignore-scripts --strict-peer-deps --no-audit --no-fund
# Exit 0; 316 packages. Log identifies npm v11.20.0.
node node_modules/prisma/dist/prisma.js contract emit --output-path src/generated
# Exit 0; private JSON + declaration artifacts emitted without a DB URL.
./run.sh host
# Final host run exit 0; 4 candidates, 53 assertions (Prisma TX explicitly BLOCKED).
./run.sh > ../../specs/waterline-retirement/evidence/p0r/matrix.txt 2>&1
# Exit 0; complete Docker build/pack/install/runtime matrix below.
python3 extract-fixtures.py --check
# Exit 0; selected fixtures exactly match reproducible P0 extraction.
```

The tracked [runner](../../spikes/orm-reevaluation/run.sh) preserves the full
command sequence. It starts a new digest-pinned container, initiates/waits for a
primary, records FCV, and guards destructive database resets with owned-run
opt-in, loopback URI, exact set name and exact server version. It uses only its
two fixed synthetic databases. No named development/integration container,
existing volume or repository Compose project is addressed. Every attempt's
EXIT trap removes only the returned owned container ID and anonymous volumes.

For **each** Node version the runner completed:

1. `docker run --rm --network none … node:<version>-bookworm bash -c …`:
   `prisma contract emit`, `npm run build` (`tsc` + copy private JSON), then
   CommonJS `require()` of **every** candidate and the package entry. No network,
   DB environment, DB URL, schema push or module-type conversion.
2. `npm pack --ignore-scripts --json`; install that tarball in `/packed` with
   npm **11.20.0**, `--ignore-scripts --strict-peer-deps --no-audit --no-fund`;
   import the installed entry and `npm ls --all`. The runner's runtime directory
   has no mounted repo/root/core modules. Production dependency tree contains
   all candidate runtime pins, including one deduped Mongo driver **7.7.0**.
3. Run all four **installed** candidates, three fresh processes each, on the
   same disposable replica set. `node --expose-gc …/dist/run.js <candidate>
/evidence/<node>-<candidate>-<repeat>.json` records assertions and costs.

Text log trailing whitespace/extra final blank lines are normalized; command
results and payloads are unchanged.

Raw logs: [24 build](evidence/p0r/build-24.16.0.txt),
[26 build](evidence/p0r/build-26.11.1.txt),
[24 installed tree](evidence/p0r/install-24.16.0.txt),
[26 installed tree](evidence/p0r/install-26.11.1.txt),
[24 pack](evidence/p0r/pack-24.16.0.json),
[26 pack](evidence/p0r/pack-26.11.1.json),
[runtime stdout](evidence/p0r/matrix.txt).
Prisma CLI prints its TS source reparse warning and an optional skills-sync
notice. They do not prevent compilation/runtime. No skills sync or package-wide
ESM conversion was performed.

## Results against P0 physical fixtures

**24/24 packed candidate runs PASS their supported assertions: 318 passed
assertions, no assertion skips disguised as success.** Prisma transaction
scenarios are explicitly **UNSUPPORTED/BLOCKED**, not assertions counted as
passes. MikroORM's optional repeated commit-disconnect case is explicitly
**NOT QUALIFIED**, not included among its 14 passed assertions.

| Candidate | Runs (3 per Node) | Assertions/run | Mapping/junction/native                        | Commit / abort / conflict retry | Cross-db commit+abort                                  | Commit disconnect                                    |
| --------- | ----------------: | -------------: | ---------------------------------------------- | ------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| Driver    |                 6 |             15 | PASS                                           | PASS                            | PASS, 1 session                                        | Recovered from 2 injected disconnects; callback once |
| MikroORM  |                 6 |             14 | PASS with explicit metadata/projection/refresh | PASS with own bounded retry     | PASS with distinct context names + session propagation | NOT QUALIFIED for repeated disconnects               |
| Mongoose  |                 6 |             15 | PASS with explicit schemas/options             | PASS                            | PASS, 1 session                                        | Recovered from 2 injected disconnects; callback once |
| Prisma    |                 6 |              9 | PASS                                           | UNSUPPORTED                     | UNSUPPORTED                                            | UNSUPPORTED                                          |

Each result JSON is under [evidence/p0r](evidence/p0r/); e.g.
[driver 24](evidence/p0r/24.16.0-driver-1.json),
[Mikro 24](evidence/p0r/24.16.0-mikro-1.json),
[Mongoose 26](evidence/p0r/26.11.1-mongoose-1.json),
[Prisma 26](evidence/p0r/26.11.1-prisma-1.json).

The fixture extractor preserves P0 raw CacheEntry/User/Role/WorkspaceApp/
BrandingConfig/BrandingConfigHistory and real junction rows. No invented join
table is used. The original raw documents are seeded without type/shape changes.
Tests assert string-facing ObjectIds, unchanged string createdAt/updatedAt,
numeric semantics, object/array/empty/false/zero/null JSON writes, raw missing
fields, unknown-field retention and no rewrite on read. Patch updates retain
createdAt and the labelled unknown field. Prisma/Mikro decode absent optional
JSON as **null**, whereas driver/Mongoose preserve absence; all retain physical
absence on unrelated patches. This is an explicit codec obligation for fields
where the domain distinguishes them.

Relationship tests read belongs-to/has-many, preserve a deliberately missing
target, and add a duplicate edge, remove matching edges and replace a user's
memberships. Raw rows are still exactly `_id`, `user_roles`, `role_users`, all
ObjectIds, with only the `_id` index: no uniqueness/timestamp/array/cascade
conversion. Mikro/Mongoose exercise actual populated relations as well as DTO
assembly; Prisma includes belong-to targets and assembles has-many explicitly.
The batched helper uses small full-fixture scans for assertions, not a proposed
production query strategy or a claim of all relationship/deletion parity.

Transactional candidates commit two writes and demonstrate outside readers see
the prior state before commit; an injected failure after two writes leaves
neither write persisted. A real out-of-session update after the transaction's
snapshot read forces server **112 WriteConflict**. Each candidate records one
failed command and exactly **two callback executions**, with the final durable
version proving replay. The branding probe writes real `brandingconfig` in app
and `brandingconfighistory` in storage; command monitoring asserts both database
names, a **single session hash**, `autocommit:false`, and external raw commit/
rollback outcomes. It does not use a native write as a substitute for ORM writes.

Native coexistence tests use the same client for competing revision CAS (one
winner), atomic `findOneAndUpdate` lease claims (one winner), stale-owner
rejection, explicit scoped index creation/inspection, one-row-batch cursor and
bounded keyset page, and GridFS upload/download/delete with byte equality.
Those calls are labelled **private native driver**, not ORM capabilities.
GridFS is not part of the transaction. No automatic schema/index sync is enabled.

## Spike corrections and negative evidence

- The host's `npx --package=npm@11.20.0 npm install …` bootstrap first rejected
  with **EALLOWSCRIPTS** under its inherited invocation environment. Invoking the
  installed npm **11.20.0** CLI directly succeeded; the host npm 12 did not write
  the spike lock. Root/core locks were never touched.
- The initial Prisma CLI path `prisma/build/index.js` is absent in Prisma 8;
  use its declared `dist/prisma.js` binary. Importing a runtime adapter as the
  contract source also failed local extensionless ESM resolution. A standalone
  `contract.ts` and private generated JSON/types solve that without changing
  the package module type. Both offline Docker builds prove the final path.
- MikroORM schema APIs now take schema references/callbacks and string
  `ObjectId` metadata, not old string entity-name APIs. Compiler errors were
  fixed before the final runs, without dropping strict mode.
- A naive serialization of MikroORM managed relationships recursed through
  entity cycles. Explicit adapter-local projections fixed it. The working
  `nativeUpdate` path needs fresh/refresh reads to avoid identity-map staleness.
- [Initial retry failure](evidence/p0r/mikro-retry-label-loss.json): MikroORM
  wraps the driver error and the `hasErrorLabel()` method was unavailable at the
  application catch. The bounded retry explicitly accepts actual server code
  **112** too, with a fresh transaction/manager each time. This is ReDBox-side
  policy, not automatic MikroORM retry. Arbitrary errors/unknown commits are not
  replayed by that wrapper.
- [Initial routing failure](evidence/p0r/mikro-context-routing.json): two default
  ORM context names caused the transactional manager lookup to route a history
  write into the app database. Distinct **p0r-app / p0r-storage** context names,
  shared external client and explicit storage transaction context fixed it.
  Final command-monitoring assertions would fail if that regression returned.
- One commit disconnect recovered on MikroORM through the driver's lower-level
  commit retry. An exploratory **two-disconnect** run did not settle within
  **46 seconds** and its exact Node child was terminated; shell exit **143**
  triggered owned-container cleanup. This is inconclusive under longer library
  deadlines, not proof that transactions never recover. The default matrix
  records **NOT QUALIFIED**. Reproduce only as a bounded optional probe described
  in the spike README. Driver/Mongoose two-disconnect tests complete and assert
  multiple commit attempts with a single callback execution.
- Prisma `transaction` is observed **undefined**, and official source confirms
  no ORM session parameter. No fake transaction/fallback path is supplied.
  Upstream TML-2313 / issue #30765 provides a roadmap item **without a date**.

## Startup and memory observations

Median of three fresh installed-package processes per Node, measured around
candidate module import + pool/metadata initialization above a shared harness
that **already loaded the official Mongo driver**. Memory is GC-requested RSS
delta. Values are not full portal startup or production capacity measurements.
The complete heap/RSS/time values are in each JSON and
[summary.json](evidence/p0r/summary.json).

| Candidate | Node 24.16 init ms / RSS MiB delta | Node 26.11 init ms / RSS MiB delta |
| --------- | ---------------------------------: | ---------------------------------: |
| Driver    |                         36.9 / 2.9 |                         33.6 / 2.3 |
| MikroORM  |                       189.0 / 15.7 |                       185.6 / 15.0 |
| Mongoose  |                       155.2 / 11.2 |                       139.8 / 10.2 |
| Prisma    |                       640.6 / 67.3 |                       628.5 / 70.7 |

These observations support a smaller incremental runtime cost for the driver in
this fixture. They do **not** pass/fail P0's latency/throughput/startup/memory
budgets: no Waterline baseline, 1,000-operation/100-warmup/three-repeat domain
workload, production authentication/failover or complete pool census is run.
Negative heap deltas reflect collecting harness allocations, not negative memory
use. The user provisionally accepted budgets for `next`, not these samples as
group promotion qualification. The pilot's existing 12-second timeout and Solr
readiness concerns remain unresolved.

## Scope, cleanup and gate disposition

The spikes qualify selected existing physical shapes/APIs, not all callbacks,
46 complete repositories, private institution mappings/custom IDs/queries,
credential-safe DTOs, stored rich BSON, full managed flush/save behavior,
multi-node/sharded failover, auth/TLS, durability after server crash or arbitrary
commit uncertainty. External assets, Agenda/session/GridFS ownership and
backup/upgrade/restore still require group work. No PostgreSQL adapter is built;
the hook/SQL/maintenance trade-offs and primary-source maturity/licences are in
ADR0003/upstream evidence.

Owned-container deletion/absence is recorded in [cleanup.txt](evidence/p0r/cleanup.txt).
Final verification checks fixture extraction, exact lock pins, 24 result files /
318 passed assertions with explicit capability limits, cross-db session proofs,
local links, formatting, whitespace, source scope and absence of owned containers.
See [checks.txt](evidence/p0r/checks.txt). Completed final commands:

```bash
python3 support/spikes/orm-reevaluation/audit.py
# Exit 0: exact lock/fixtures, 24 runs / 318 assertions, explicit limits,
# cross-db sessions, tracked scope, local links and no owned containers.
git diff --check
# Exit 0.
```

After source formatting, both exact Docker Node versions also ran
`node node_modules/typescript/bin/tsc --noEmit` offline, exit 0. Node 24's offline
`prisma contract emit --output-path .tmp/fresh` followed by `cmp` for both
committed artifacts passed, confirming deterministic generation after formatting.
Prettier 3.9.9 checks passed for the changed TS/JS/JSON/Markdown source documents.

No root/core compile, portal/Bruno/browser
or production workload pass is claimed for this isolated research change.

If G0R accepts the recommendation, update the selected-backend gates as proposed
and progress only within remaining approvals. **Do not** open G-TX, switch stacks,
mark ARCH-01 adopted before user acceptance, or erase the pilot's official v6
contract. REL-01, SEC-01, INST-01 and OPS-TX-01 remain explicit decisions. All
commits have the requested Codex co-author trailer; **no push** is performed.

## Subsequent user acceptance — 2026-10-20

G0R PASSED: user ACCEPTED ADR0003. REL-01 cache sub-decision revises v6 to
driver-repository cache through C2. P0R results above are historical. G0 remains
HOLD for remaining owner decisions; P1/C2 implementation is explicitly authorized.
OPS-TX-01 stays undecided and G-TX closed; no repository stack switch.
