# SR-048 / SR-049 stand-in upgrade and checkpoint recovery

The institution and approved production upgrade source are still **not
designated** (SR-005). The user authorized the released **v5.0.4** artifact,
sanitized SR-003 fixture and bundled hooks as a representative stand-in. No
institution has been invented and no private institution material was used.

This round exercises source behavior, the implemented v6 persistence/migration
components, deliberate partial writes, and complete checkpoint restoration.
**A complete v6 portal upgrade is not qualified:** the installed production
Express composition and broad existing-suite execution remain missing, as
documented in [P7 qualification](p7-qualification.md#sr-046--existing-regression-and-the-integration-gate).
SR-048 and SR-049 therefore remain unchecked even when this component/checkpoint
rehearsal passes. The missing institution designation is not their only open gate.

## Artifacts and deployment

- Source tag **v5.0.4**, commit
  `c1dda53999f3b026347008731f33dba834e06c27`.
- Released Linux amd64 image:
  `qcifengineering/redbox-portal@sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9`.
  Its own runtime is **Node 24.16.0 / npm 11.13.0 / Sails 1.5.17**. Current
  source mounts never replace its application, libraries or bundled hooks. Its
  bundled ReDBox storage hook is Mongo; PDF is
  absent from this released base image. The neutral storage extension runs in
  the v6 component step. This does not qualify a full PDF/provider cutover.
- Final v6 component source is
  `58f7cbbd60e23881cdfea9fbcb712ab2b01914ca`; component helpers run on **Node
  26.11.1 / npm 11.20.0**, Prisma ORM **8.0.0-rc.19**.
- Separate physical MongoDB **8.0.34 / FCV 8.0** core/storage standalone Docker
  servers, image
  `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
  Each has 768 MiB, `nofile=64000:64000`, a 0.25 GiB WiredTiger cache and explicit
  local ports **28031/28032**. No Mongo engine or FCV transition is performed.
- Solr **10.0.0**, pinned image
  `sha256:c2a983cd9a5759c3b802b7b47f48b5cfae2b34d63a9444d62730fdbdb1b5308b`.
- Source HTTP is isolated on **127.0.0.1:18507**, with disposable
  `sr-p7-upgrade-*` resources. Local authentication, a repository test token,
  disabled external vocabulary imports/cron and synthetic primary/staging files
  are explicit rehearsal inputs. External publishers/IdPs are not qualified.

The committed source fixture contains **123 documents / 13 collections** with
credentials removed. The helper seeds only disposable local databases with
explicit test credentials, adds an actual GridFS binary, and verifies the four
admin role links/password through the v6 identity repository. It refuses other
database names/ports and requires `SR_REHEARSAL_DISPOSABLE=true` before mutations.
Primary/staging files are synthetic; their preservation/restoration is real.

## Executable procedure

The [operator runbook](../upgrade-recovery-v6.md) is the published procedure.
The executable rehearsal is
`support/integration-testing/rehearse-sails-retirement-recovery.sh`, with
`packages/redbox-core/test/qualification/recovery-fixture.cjs`.

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
DOCKER_HOST=unix:///var/run/docker.sock \
SR_P7_SCRATCH_ROOT=/mnt/docker-storage/sr-p7-clean-4254c2e/.tmp/recovery-58f7cbb \
SR_P7_RECOVERY_LOGS="$PWD/.tmp/sails-retirement/p7/recovery-58f7cbb" \
  bash support/integration-testing/rehearse-sails-retirement-recovery.sh
```

The procedure creates fresh disposable stores, loads the sanitized fixture and
starts the exact released image. It probes home, JSON local login and **20**
authenticated forms requests; records elapsed startup, memory and request
latencies; and stops all application writers before taking a checkpoint.

The checkpoint includes both native `mongodump` archives; every collection's
document/index checksum manifest; the actual GridFS file; primary/staging bytes;
configuration and the released image containing the exact source packages/hooks.
The source's runtime config is copied for audit. The writer-free dumps are a
quiescent checkpoint, not an online atomic snapshot across independent servers.

Next it runs the actual compiled core index entrypoint in inspect/ensure/inspect
order, the bundled storage revision migration twice through the durable ledger,
and a deliberately failing migration body that writes both databases without a
success ledger entry. Identity/password/membership preservation and resource
cleanup are asserted. This exercises the nontransactional recovery trigger.

Recovery drops only the guarded disposable databases (including candidate-only
collections), damages files/config, restores both native dumps and every file,
reloads the saved image, verifies all document/index checksums and exact GridFS/
primary/staging bytes, then restarts the exact source image and repeats the public
probes and stop. It never calls old-image selection against modified v6 state a
rollback. No remote publication was sent, so external-effect reconciliation is
an explicit unexercised operator requirement, not a claimed successful undo.

## Failed attempts and recorded corrections

1. The first source-start observation exhausted the initial 180 readiness probes
   during concurrent clean-image work. No checkpoint or restoration was completed.
   The rehearsal now permits a bounded 600 probes to observe the released
   artifact's cold startup; no existing test or production timeout was changed.
2. The next attempt reached source readiness after **188 seconds**, then failed
   JSON parsing because its new fetch probe omitted the existing Bruno request's
   `Accept: application/json` / `X-Source: jsclient` negotiation. Fetch followed
   the source's HTML redirect. The corrected probe sends the existing request's
   headers and uses `redirect: 'manual'`, so a redirect cannot satisfy the 200
   JSON-login assertion. That attempt performed no successful upgrade/recovery.
3. New-harness corrections also fixed the migration API's void return (the
   helper checks real ledger names), accepted the existing initial revision **0**,
   and awaited identity initialization. Cleanup now stops the portal before its
   dependencies, records failures in the final exit, and avoids duplicate names.
   None changes an existing regression test or weakens a domain assertion.
4. The negotiated probe passed home/login and 20 forms requests, stopped the
   source with exit 0, and captured **25 collections / 1895 documents**. Ensure
   then correctly refused the released nonunique `record.redboxOid_1` index:
   **one conflict, zero duplicate groups**, exit **2**, and no selected DDL.
   The final runner performs a separate reviewed fixture-specific action after
   the backup: verify the exact full/simple/nonunique index and two valid scalar
   OIDs without duplicates, remove only that index without changing documents,
   then let the unchanged explicit ensure create the required v6 uniqueness.
   The [runbook conversion](../upgrade-recovery-v6.md#released-v5-oid-index-conversion)
   records this concrete upgrade requirement. The original nonunique definition
   is retained in the checkpoint and restored/verified during recovery.
   Cleanup also now unregisters the removed source portal before a possible
   intermediate failure; it no longer retries a nonexistent name.

Raw logs, synthetic session data, dumps, image tar and binary files stay outside
Git under the selected ignored log/scratch directories. The scratch path is
recorded by the runner in `scratch-path.txt`. Only sanitized outcomes are recorded
here.

## Final executed result

The final corrected-source `recovery-58f7cbb` invocation exited **0**, with no conditional
test skips. [Sanitized machine-readable results](p7-recovery-results.json) record
the following actual outcomes:

| Step | Result |
| --- | --- |
| Released-source public probes | Home **200**, JSON local admin login **200**, **20/20** authenticated forms requests **200**. |
| Quiescent checkpoint | **24 collections / 1895 documents**; both databases, document/index checksums, real GridFS bytes, primary/staging bytes, configuration and saved exact source image. |
| Index preparation | Inspect exit **2**; reviewed nonunique OID index conversion; ensure and final inspect exit **0**, **102 scopes ready**. Each CLI reports **0 owned pools / 0 Prisma clients** after cleanup. |
| Bundled revision migration | **1 migration**, **2 active records**, **0 tombstones**, **1 batch**; second run **0 pending**; password and **4 roles** preserved. |
| Interrupted migration | Actual core collection insert and storage metadata update survive the thrown error; **no success ledger entry**; owner cleanup reaches **0 pools**. |
| Restoration | Both databases rebuilt from complete native archives; **24 collections / 1895 documents**, every document/index checksum identical; exact GridFS/primary/staging/configuration bytes and original nonunique index restored; saved image loaded. **0 failed documents** in either restore. |
| Recovered source probes | Same image: home **200**, JSON local admin login **200**, **20/20** forms requests **200**. |
| Source and recovered stop | Both actual container exit codes **0**, no OOM; **0 s / 1 s** at the script's one-second resolution, after probes completed. This is not a busy v6 drain qualification. |
| Resource cleanup | Owned portal/Solr/Mongo containers, anonymous volumes and network removed; final owned-resource listings empty. Backup artifacts retained in the recorded scratch directory. |

Native dump/restore tools: **100.19.1**, Git
`9348e032419d906e40966f477278cce647b9b1eb`, Go **1.26.8**, Linux amd64.
Observed source/recovered startup: **104 s / 9 s**. Container memory snapshots:
**609.6 MiB / 430.8 MiB**. Forms latency over 20 sequential requests each:
source p50 **32.013 ms**, p95 **60.820 ms**, max **96.256 ms**; recovered p50
**34.081 ms**, p95 **43.664 ms**, max **44.387 ms**. These are loaded observations
of cold logical-fixture bootstrap versus an initialized restored checkpoint,
both on **released Sails**, not controlled Express performance comparisons or
promotion tolerances. Docker health interval state was not a readiness assertion;
the actual public probes above supplied the source/recovered readiness signal.

The retained final checkpoint is under
`/mnt/docker-storage/sr-p7-clean-4254c2e/.tmp/recovery-58f7cbb/sr-p7-recovery.7dKyZ8`,
with its path also recorded in the ignored `recovery-58f7cbb/scratch-path.txt`.
The earlier successful checkpoint is retained separately under
`/mnt/docker-storage/sr-p7-clean-4249667/.tmp/recovery-scratch/sr-p7-recovery.qqBTnz`.
That earlier run had 25 collections because it additionally contained the empty
`redbox-portal.figsharesync` collection; the current run has the same 1895
documents in 24 collections. Each restore matched its own complete checkpoint,
including empty collections and index definitions. No collection was omitted
from either checkpoint or checksum comparison.
No source restart against partially modified state was used as recovery.

## Remaining acceptance

Implement and qualify the complete installed Express composition; exercise the
runbook's migration/bootstrap/validation/activation, fresh v6 login, records/forms/
workflow behavior, storage/providers, restart and stop; run all existing broad
suites; and repeat recovery from that fully upgraded candidate. Then obtain the
institution/source/hook/configuration/topology designation and perform its actual
rehearsal with an approved consistent checkpoint and reconciliation owner. A
component migration or successful released-source recovery cannot close these
gates. Do not promote Express or begin P8 on the strength of this stand-in alone.
