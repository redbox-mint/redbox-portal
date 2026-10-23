# P1 shared driver foundation — validation and G1

## Retained programme regression command (Round 10)

The sequential [review runner](../../../packages/redbox-core/test/fixtures/waterline-retirement/README.md#repeat-the-retained-programme-review-regressions)
contains the complete retained R5–R9 harness inventory and Round 10's selectors,
index audits, fetched-create budgets and existing-volume upgrade controls,
plus Round 11 error-boundary, mixed-clock owner-fencing and live TLS/SRV checks:

```bash
npx --yes --package=npm@11.20.0 -c 'python3 packages/redbox-core/test/fixtures/waterline-retirement/run-review-regressions.py'
```

Run from the root with Docker, installed dependencies and retained prior images.
Builds precede fixture consumers; commands run sequentially, with compact result
records and raw logs under `.tmp/review-regressions`. `--list`, `--stage` and
`--only` support inspection and targeted reruns. See
[Round 10 results](evidence/review-round-10/README.md) for exact tested artifacts,
failure dispositions, the R/Q/J1/J2 create-call budgets and pre-programme-image
upgrade through explicit index preparation. Earlier checkpoint evidence below
retains its original scope and historical selector defaults.

Date: **2026-10-20 Australia/Adelaide**. Decision owner for the architecture and
cache direction: **user**, accepted ADR0003 / G0R. G0 remains HOLD and G-TX CLOSED.
This implementation follows the explicit authorization for transaction-free P1/C2.

## Source and disposition

Specification decision commit: `2d8266b4a`; foundation/C2 implementation:
`95db84cbe`; resource refinement: `839e81cc4`; final connection-policy hardening:
**`f7050fff0`**. This evidence is committed separately after validation.
No push, default promotion, Prisma removal or repository topology conversion.

**G1: FOUNDATION PASS for transaction-free P2 implementation**, within the tested
matrix and limits below. This is an implementation evidence decision, not a
release-owner approval or a pass of G0, G-STABLE for retirement, G-TX, G-C2 or G7.
C2's driver implementation is opt-in; its promotion qualification remains HOLD.
See [C2 status](c2-validation.md) and [interfaces/ownership/hook seam](p1-foundation.md).

## Delivered interfaces and task evidence

| Task  | Delivered evidence                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1.1  | Common plain JSON/opaque string ID/logical datastore/group/backend/resource types and optional-app cache getter; four cache operations, no generic query/CRUD facade, unit of work or public driver/BSON/session interface. Installed consumer typechecks the public seam. Future groups add domain-specific getters.                                                                                                            |
| P1.2  | App-owned Symbol.for runtime survives loader cache invalidation; offline repeat/concurrent init, lazy acquisition/pool reuse, operation tracking, shutdown refusal/drain/close/retry, bootstrap failure cleanup and original-error preservation. Unit, live cache restart and existing bootstrap/runtime regression suites pass.                                                                                                 |
| P1.3  | Explicit typed `persistence.groups.<group>.backend`; new groups default Waterline; unknown/stale configuration and premature mongodb groups fail. Cache supports waterline/prisma/mongodb, absent/default remains Prisma. Loaded standard mapping/custom datastore aliases honored; unsupported physical hook mapping refused.                                                                                                   |
| P1.4  | Independent config resolver, no loaded model/manager/normalizer call. URL/protocol-less/split/numeric/escaped DB/auth precedence matched against the legacy normalizer in tests; effective authSource/TLS/SRV/options policy checked offline. Real authenticated custom application datastore/escaped split credentials and both logical DBs pass. Invalid inputs redact credentials/causes.                                     |
| P1.5  | Plain scoped inspect/require/ensure API. Real missing/conflicting/nonunique/partial/sparse/TTL/collation/duplicate cases, idempotent explicit create and duplicate-preserving AppConfig probe. New foundation/cache startup does no DDL/cleanup. Existing owner-specific DDL is retained for its owning phase; partial/sparse duplicate audits remain operation-specific.                                                        |
| P1.6  | Private cache ObjectId/JSON/string-time codec; plain per-package/datastore index descriptors. Two logical DBs use the same compatible client, incompatible authSource/options hash differently; no per-model clients or unintended collections. No Prisma generation expansion.                                                                                                                                                  |
| P1.7  | Core DB-free build/freshness, strict foundation/cache typechecks, lint, installed core plus storage hook and four local package tarballs. Node 24/26 consumer compilation, no-network/no-socket import/shim checks and production-pruned slim Docker live driver/Prisma operation checks. CI is wired to the new standalone runners; YAML/local paths verified, remote CircleCI execution not claimed. Stack topology unchanged. |
| P1.8  | Published service-based institution seam, actual loaded Waterline custom datastore/collection/callback baseline and explicit driver refusal for unsupported hook mapping; standard custom datastore alias tested with real auth. P1 leaves loader definitions/shims and handwritten files intact. Obsolete-registration refusal and provenance-safe retirement remain P11/P12; private institution certification is INST-01.     |
| P1.9  | Agenda borrows independent application DB (no User manager), SQS-only acquires no unused pool; drain then stop before shared pool closure. Created connect-mongo stores close once. GridFS ownership is app-scoped across reload, app-isolated, and retained after error/failed close for retry. Public resource callbacks and ownership matrix document borrowed versus owned resources and P10 work.                           |
| P1.10 | Command matrix below, original cache suites retained, raw/mixed/restart/service/hook/packed driver regressions recorded. Defaults unchanged; remaining gates/limits explicit.                                                                                                                                                                                                                                                    |

The internal `mongoDatabase`/operation helpers and concrete cache implementation
are adapter seams, absent from the package-root exports. Domain/service callers
receive plain values through repositories. `mongodb` is the explicit backend
name because it identifies the persistence engine; no ambiguous `driver` alias.
Initialization refuses every new mongodb group until its own concrete composition
branch is added. P2 enables only migration after its adapter/readiness exists.

## Exact commands and observed results

All commands start in the repository root. Builds finish before any worker or
package fixture consumes `dist`. Standalone runners create and remove their own
containers; no development/integration volume or existing MongoDB data is used.
All final rows below exit **0**. Logs are under [evidence/p1](evidence/p1/README.md).

| Command                                                                                                      | Result                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm --prefix packages/redbox-core run build`                                                                | PASS, including retained Prisma contract generation/copy.                                                                                |
| `npm run test:core`                                                                                          | 4,123 passing / 95 pending, exit 0; final-source run without concurrent builds/installers.                                               |
| `npm --prefix packages/redbox-core run test:persistence-foundation`                                          | 12 passing: 9 unit/resource cases plus 3 real authenticated standalone MongoDB cases; no skips.                                          |
| `npm --prefix packages/redbox-core run typecheck:persistence`                                                | PASS; strict source + new foundation tests.                                                                                              |
| `node node_modules/typescript/bin/tsc --noEmit -p packages/redbox-core/test/tsconfig.cache-persistence.json` | PASS; existing scoped cache tests.                                                                                                       |
| `npm --prefix packages/redbox-core run lint`                                                                 | PASS; zero warnings/errors.                                                                                                              |
| `npm --prefix packages/redbox-core run check:cache-contract`                                                 | PASS; existing committed contract unchanged.                                                                                             |
| `P3_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-prisma`                                 | 17 passing, no skips; includes all original 16 plus custom-datastore driver parity.                                                      |
| `P5_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-transition`                             | 8 passing, no skips.                                                                                                                     |
| `P5_SKIP_BUILD=true npm --prefix packages/redbox-core run test:cache-driver-transition`                      | 15 passing, no skips; original eight plus driver/raw/services, both preview paths, three-way mixed/restart and unsupported hook refusal. |
| `npm --prefix packages/sails-hook-redbox-storage-mongo run build`                                            | PASS; real storage hook packed beside core.                                                                                              |
| `CACHE_PACKAGE_NODE_VERSION=24.16.0 npm --prefix packages/redbox-core run test:cache-package`                | PASS: clean installed core/storage, offline consumer/import/shims, production-pruned slim driver cache/two-DB/Prisma runtime.            |
| `CACHE_PACKAGE_NODE_VERSION=26.11.1 npm --prefix packages/redbox-core run test:cache-package`                | PASS: clean installed core/storage, offline consumer/import/shims, production-pruned slim driver cache/two-DB/Prisma runtime.            |

Additional final checks: policy/unit and changed Markdown formatting, runner bash syntax,
CircleCI YAML parse, relative documentation links, exact dependency pins and
unchanged lockfiles, `git diff --check`, and absence of task-owned containers /
package networks. Package locks are generated only in disposable fixture dirs
using **npm 11.20.0**; application locks are unchanged. No production dependency
was added or upgraded.

## Matrix and physical/operational scope

- Host: Node **24.18.0**, npm **12.0.2** for read/run scripts only, TypeScript
  **5.9.3**, NodeNext resolution/emission with CommonJS package semantics.
- Core official driver: exact **7.7.0** already pinned. The storage hook retains
  its separate **7.2.0** owner; sails-mongo retains its legacy transitive driver.
  No public driver type crosses these package contracts.
- Upstream maturity/engines: [P0R primary sources](evidence/p0r-upstream.md)
  record stable official driver **7.7.0**, declared Node **>=20.19.0** and MongoDB
  **4.4+** requirement. These are upstream support facts, not this test matrix.
- Executed production package matrix: exact Node **24.16.0** and **26.11.1**
  bookworm build / bookworm-slim runtime. No repo module ancestry, source tree,
  Prisma CLI or development dependency is used at runtime. Existing published
  TypeScript runtime dependency remains part of core's prior manifest.
- Live server: standalone MongoDB **8.0.34**, image digest
  `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
  Foundation and Prisma fixtures use synthetic authentication on random loopback
  ports; transition/package fixtures use disposable isolated unauthenticated
  servers. No replica-set container was needed or created for P1.
- Foundation writes only explicit synthetic ledger/index/AppConfig/cache probes
  in `wr_p1_core`; `wr_p1_storage` is independently routed and initially empty.
  Compatible pools share a client; different effective credentials/authSource/
  TLS/options do not. TLS/SRV parsing is offline, not a live TLS/SRV handshake.

## Corrections and negative evidence

Early foundation development exposed driver-generated callback metadata in the
pool key and source ts-node resolution of `.js` adapter imports. Normalized
connection-policy filtering and lazy typed CommonJS adapter resolution fixed
those failures; final offline/live/package checks use those paths.

The initial three-backend transition attempt failed on inherited loaded-model
`datastore` properties. The guard now accepts actual inherited declarations and
configured standard custom application datastore names, while refusing changed
physical mappings. Both the custom authenticated fixture and mixed suite pass.

A later transition rerun was invalidated by an accidentally overlapping build
removing `dist` (12 passed, 3 MODULE_NOT_FOUND worker failures). It is retained
as negative harness evidence and **not counted as qualification**; the final
suite was rerun only after build completion. Do not rebuild shared `dist` while
these independent worker processes are active.

Final policy review found that two opaque TLS SecureContext instances can have
identical enumerable shapes despite different policies. User-supplied nonplain
objects/functions now fail safely before pool reuse; ordinary serializable
options and Buffer certificate inputs remain supported. The regression tests
use real Node TLS contexts and a custom pkFactory callback, without sockets.

Contract generation still reports its pre-existing TS module reparse/optional
skills-sync notices. The package install reports pre-existing deprecated
transitive packages; no unsolicited dependency upgrades were made.

## Limits, retained gates and P2 handoff

The startup-module-loading test retains its existing **12-second** child limit.
The final run without concurrent builds/installers passed in **11,928 ms**; the
earlier post-resource-refinement run passed in 11,032 ms. Passing these runs does
not resolve the known load sensitivity or establish an operational latency budget.
Solr-before-ready/full portal bootstrap qualification is not attempted here.

No full portal/API/browser, long-lived Agenda/SQS workload, session TTL/login,
active GridFS stream drain, production failover/TLS/SRV handshake, recovery or
1,000-operation budget campaign is claimed. P1 supplies ownership callbacks and
ordering; P10 must qualify each actual owner and HTTP/worker quiescence. Pools
remain owned if resource drain/close fails; retry is required before reinit.
Custom connection callbacks/opaque objects fail safely, rather than being
silently pooled. INST-01 and SEC-01 remain open; synthetic public fixtures do not
certify private hooks, queries, rich BSON or security boundaries.

G0R PASSED; **G0 HOLD**, **G-STABLE retirement qualification OPEN**, **G-TX CLOSED**,
**G-C2 HOLD**. U/V/B and atomic S stay operationally blocked. OPS-TX-01 is
undecided; no dev/test/CI stack conversion. Cache default remains Prisma,
Waterline remains the default for every new group, all ORM/Prisma artifacts and
existing freshness tooling remain until their separately gated retirement.

P2 must add a small migration-ledger interface/Waterline baseline before its
private driver adapter. Preserve `name`, `source`, `appVersion`, epoch-ms
`ranAt`, `durationMs`, `executedBy`, ordering, skipped/failed/pending-body behavior
and original errors. A unique name is not exactly-once migration-body execution:
require one deployment migration runner. Initialize before domain services,
use existing lifecycle/connection/index seams, enable only migration's explicit
composition branch, and collect raw/bidirectional/mixed/restart/prior-artifact
rollback/budget evidence. No generic query registry or transaction bypass.
