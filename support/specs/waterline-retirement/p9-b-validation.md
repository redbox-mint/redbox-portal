# P9 / B branding qualification

G-B / P9.1–P9.6 **PASS for bounded `next`**, with an independent MongoDB
default promotion and explicit Waterline rollback.

This records the completed ADR0003 driver checkpoint requested for P9.
[ADR0004](adr/0004-prisma-for-all-persistence.md), accepted concurrently, now
selects Prisma for every group and requires a separately agreed implementation
plan. Its B follow-up can use these physical, failure/recovery, selector and
budget fixtures as the comparison baseline; Prisma qualification remains ahead.

B migrates BrandingConfig (`mongodb`) and BrandingConfigHistory (`redboxStorage`)
through plain operations and the official driver 7.7.0, with the loaded Waterline
baseline retained. Implementation `d70a40dde`; browser fixture `393981e2b`; TX-PARITY-01a
conditional-write simplification `7783a3861`.
TX-PARITY-01 supersedes BRAND-TX-01: no transaction/session, history relocation,
silent fallback or new uniqueness is introduced. TX-PARITY-01a permits the
driver's natural atomic conditional write (B-01); the loaded Waterline race
remains the explicit rollback baseline. This is bounded
`next` qualification; private institution mappings, official release/auth/failover,
identity and the remaining records/Counter/rebind owners remain separate gates.

Node 24.16.0/npm 11.20.0 on OCI ARM64, two CPUs, 12 GiB; MongoDB 9.0.4/FCV 9.0 standalone,
pinned `dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`.
All heavy commands ran sequentially with external timeouts and wrp9 Docker
ownership. Dependencies and locks are unchanged. The only added package entries
are test scripts. [Runner recipes](evidence/p9-b/runners/README.md) retain exact
bounded commands and overlays.

The [loaded spike](evidence/p9-b/spike.json) covers both models on both actual
logical datastores, with two databases on one server and with two separate
servers. IDs and the history branding reference are ObjectIds; counters are
numbers; CSS/hash/ISO timestamps and JSON colour/typeface/logo/favicon snapshots
retain their physical shapes. History dateCreated is an additional ISO created
clock. Safe-mode Waterline installs only `_id`, despite declared history
uniqueness. Two nonunique lookup indexes are explicitly prepared; compatible
operator-installed full uniqueness is accepted and retained. Startup inspects
both datastores without DDL or cleanup.

The live contract passes **42/0** in [one-server](evidence/p9-b/contract-one.json)
and **42/0** in [separate-server](evidence/p9-b/contract-split.json) layouts. It
covers raw/bidirectional writes, missing/unknown fields, normal-write allowlist
and `$` normalization, duplicate histories, loaded version/revision races,
publication/idempotence/conflict/unknown-before/unknown-after outcomes, retention,
restore, both cache preview paths, pending migrations and reruns. Separate
processes with simultaneous Waterline/driver selections exchange writes on shared
data; cleanup/stale handles, restart and explicit configuration rollback pass.

V's B-owned name bridge now follows B independently of V. Both actual V adapters
resolve a textual brand while Waterline BrandingConfig.findOne is made throwing
under B MongoDB. Waterline B rollback lookup still reads the driver objects.
B's populated roles use an explicit U-owned Role reader. RolesService's retained
BrandingConfig.addToCollection calls implement inverse U-owned Role.branding
writes; U must replace/qualify those. B model definitions/shims stay until P11's
connected-association and rollback retirement.

Normal writes execute explicit normalization/validation; the Waterline callbacks
retain the same operation for rollback. The typeface migration keeps its name,
order, ledger and preservation-before-pruning behavior. Only the frozen sidebar
operation performs native variable-only patches that deliberately bypass today's
allowlist and model timestamps. The live rerun checks preserve draft colours,
published colours, hashes and unrelated fields. Pruned histories have no down
migration and require checkpoint recovery.

The [quirk register](quirk-register.md) records every observed B quirk:

- sails-mongo counts/selects IDs and writes those IDs without rechecking
  version/draftRevision. An intervening change can be overwritten; the driver
  uses `findOneAndUpdate` instead: the same intervening write makes the driver
  return null. Live B-01 tests cover both draft/publication revisions and the
  service's history-before-write/conflict compensation. This is the sole
  improved quirk under TX-PARITY-01a; no existing data/index changes are needed.
- History's declared unique version constraint is absent in the loaded safe-mode
  baseline. Duplicates stay permitted unless an operator already installed it.
- A logo write can overwrite its mutable object before metadata failure. Favicon
  cleanup can delete the new referenced object after an applied metadata write
  loses its response. Both partial outcomes are reproduced in both selectors.
- Preview consumption remains non-atomic read/delete. Publication/cache refresh,
  pruning, assets and cleanup remain separate effects; no retry/transaction is
  added. Missing historical counters keep their existing zero-selection behavior.

The recovery case serializes both B collections as BSON-preserving EJSON and
copies their indexes into isolated namespaces, on the same respective servers.
Font/logo/favicon bytes are independently checkpointed. Raw document comparison
passes before restore; missing assets block retained restore before active
mutation; reinstating matching bytes permits font/colour restore and logo/favicon
reads. History restore retains current logo/favicon metadata. This is a synthetic
B-only stopped-writer checkpoint, not a full deployment backup/PITR rehearsal.

The locally built [pre-B ARM64 artifact](evidence/p9-b/prior-artifact.json) comes
from `5afe0957c6b98e49ad608dfd27b89e2ca66d3012`. Its probe verifies B repositories
are absent, compares complete current DTOs for both models and an active custom
font/logo/favicon brand, then writes both models with old Waterline. Six prior
checks and two current-driver readbacks pass. A fresh pre-probe checkpoint avoids
using stale benchmark state. It is the installed compiled core/storage/internal
package/dependency snapshot, not a clean production-pruned complete institution
portal/assets/hooks image. Institutions must retain and rehearse their actual
artifact and coordinated databases/assets/configuration. See rollback record.

[Operations](evidence/p9-b/operations.json) use 30 warmups and 250 cycles per sample,
three alternating samples per backend: brand lookup, history lookup, sorted
history and draft revision. MongoDB/Waterline ratios: p95 **0.35604** (<=1.20),
throughput **2.77291** (>=0.90), RSS **0.96944** (<=1.10), DB calls **0.57143**
(<=1.25). Maximum readiness **107.22ms** (<250ms). Waterline makes 1,960 and the driver 1,120 calls per sample;
all return to the stabilized observer connection baseline6. Every driver sample
uses one shared client for two compatible logical databases. These small-fixture
budgets do not certify production capacity or a complete role-heavy catalogue.

```bash
source .tmp/tx-parity-phase0/env.sh
timeout 900 npm --prefix packages/redbox-core run test:branding-transition
timeout 1500 npm --prefix packages/redbox-core run test:branding-operations
timeout 1500 bash .tmp/wrp9/run-core.sh
timeout 500 bash .tmp/wrp9/run-browser.sh
timeout 1800 bash .tmp/wrp9/run-portal-matrix.sh
timeout 2400 bash .tmp/wrp9/run-bruno-matrix.sh
```

Core passes **4,317/117 pending/0 failed per selector**, including the unchanged
startup-import deadline. The focused existing branding selection passes 170.
Build, strict persistence types, root types and lint pass. The unused P9 Mongo
containers were stopped for the source startup check after two 12000ms deadline
failures under their CPU load; passing times 10608/9557ms. No deadline or lazy
import requirement changed. [Excluded attempts](evidence/p9-b/attempts.json)
retain failed diagnostics and corrections.

The actual Chromium155 browser suite passes **2/0 per selector**: real custom
font print cascade and both native Tab/Enter upload controls. The test's one-shot
filechooser listeners raced protocol interception toggling between controls on
both available Chromium executables. A permanent listener plus an initial
protocol barrier keeps interception armed; application markup, keyboard actions,
assertions and deadline are unchanged. Missing Bootstrap CSS was extracted into
a disposable path from the exact Angular lock's 5.3.8 tarball after SHA512
verification; its temporary dependency link is removed. No Angular build or
private authenticated full-UI qualification is claimed.

The installed index command passes **18/0** before promotion, including both B
scopes, duplicate preservation and existing operator uniqueness. Other selected
groups retain their independent preparation and constraints. Portal Mocha passes
**35/0 per selector** using the actual bootstrap and six affected files. General
Bruno uses all stock directories 1–4 (310 unchanged source files, exact locked
CLI 4.2.1); **309 requests / 553 tests / 3 assertions / 0 failures per
selector**. Its JSON reports and log hashes are recorded in the
[verification manifest](evidence/p9-b/verification.json). General's stock
Keycloak 26.5.6 and the Mocha-base Solr digest are retained. External RVA cases
allow upstream unavailability, so these results do not certify upstream uptime.
Promotion omission/rollback checks, immutable archive and final cleanup are
recorded separately after qualification.

The retained prior archive is `.tmp/wrp9/prior-5afe0957c.tar`, 723,593,216 bytes,
SHA-256 `982bf3e8d24819615260448945ff3d129ef45ce5df4a8f0d71572c63db6fc15c`. The [rollback record](evidence/p9-b/rollback.json)
retains load/probe commands, both logical-datastore checkpoints and recovery limits.

The plain repository boundary leaves a future PostgreSQL adapter separate; no
SQL adapter, institution data conversion or cross-database portability is qualified.

The separate P9.6 default promotion follows qualification `052f4b257`.
[Promotion evidence](evidence/p9-b/promotion.json) passes the packaged runner in
both layouts (**42 contract + 6 omission/rollback cases per layout**), default
core (**4,317 passing / 117 pending / 0 failed**), installed index CLI (**18/0;
72 scopes across 29 collections**) and fresh omitted-selector portal Mocha
(**35/0**). B model query methods throw in the omitted-selector live checks;
both-model and V-bridge reads, driver writes, explicit Waterline rollback and a
fresh omitted-selector restart still pass. Build, strict persistence/root types
and root lint pass. All ten Compose/template B defaults agree with the core.
Explicit-selector Bruno results already cover the atomic adapter.

MongoDB 9.0.4/FCV 9.0 ran both loaded sails-mongo and official driver 7.7.0 on this
ARM64 kernel as standalone servers. No Mongo 7/8 fallback, replica-set conversion,
session/transaction or history relocation was used. P9 used 1536 MiB Mongo limits
and 0.25 GiB WiredTiger; no P9 OOM was observed. Unsupported institution mappings,
private hooks, complete production artifacts, auth/failover and official release
acceptance remain outside this bounded next qualification.

U must replace the explicit Role projection and inverse Role.branding membership
writes before retiring B's association models. Remaining S must preserve its
record/identity/authorization/staged-byte ownership; B adds no shared session or
cross-resource atomicity. Counter stays read-then-write under its separate user
decision. Both groups should use the quirk register and TX-PARITY-01a rather than
adding emulation of otherwise eligible driver improvements.

The separate promotion is `1efe5229d`. [Cleanup](evidence/p9-b/cleanup.json)
verifies zero task containers/networks/named volumes, removal of all four main
anonymous volumes and the prior Docker image, and all 13 exact task-created
BuildKit records absent. No remaining Docker volume was created since the
pre-B source checkpoint. No global prune was used. The same three unrelated
development containers remain running; no mutation command targeted them.
Disposable image-context/Bruno dependency copies are removed. Both recorded
prior archives remain; P8's archive SHA-256 is unchanged. Dependencies/locks
are unchanged, and no push or PR was created.

After promotion and Docker cleanup, both explicit selectors were revalidated on
`7827feb33`: **4,317 passing / 117 pending / 0 failed each**. The unchanged
startup subprocess checks pass in 10,991ms (Waterline) and
9,568ms (MongoDB). `timeout 1500 bash .tmp/wrp9/run-final-core.sh`
is retained with the verification log hashes; it creates no Docker resources.

The prior-image container probe used the one-server/two-database layout. The
separate-server layout has loaded Waterline/driver contract and configuration
rollback evidence; the prior image was not separately probed on that layout.
