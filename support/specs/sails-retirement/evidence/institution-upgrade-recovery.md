# SR-048 / SR-049 installed upgrade and checkpoint recovery

The released **v5.0.4 + sanitized SR-003 fixture + bundled hooks** stand-in has
completed an installed v6 cutover, restart, successful shutdown, deliberate
partial migration failure, and full recovery to the exact released source.
SR-048's executable procedure is accepted. SR-049 remains partial solely because
no institution, approved production source or actual hook/configuration/topology
has been designated (SR-005). No institution data or designation was invented.

## Artifacts and deployment

- Released tag **v5.0.4**, source `c1dda53999f3b026347008731f33dba834e06c27`;
  Linux amd64 image
  `qcifengineering/redbox-portal@sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9`.
  Its installed **Node 24.16.0 / npm 11.13.0 / Sails 1.5.17** and bundled
  packages/hooks are unchanged; no current application source replaces them.
- V6 source **`b232d67617527b2e2630cda0dc3cf0f065a77f48`**, clean incremental
  production build described in [artifact evidence](p7-qualification.md#corrected-production-artifacts-and-installed-executable).
  Installed rehearsal image
  **`sha256:25725acf4be38222bdf3546e29cdd1016492ec671c19c9920c7beb8420a05b1b`**;
  **Node 26.11.1 / npm 11.20.0**, Prisma ORM **8.0.0-rc.19**. This image installs
  bundled demo/PDF/storage hooks in the production dependency graph. The released
  base image has no PDF hook; the candidate's native PDF render is separately
  qualified, not an invented released-PDF comparison.
- Independent core/storage MongoDB **8.0.34 / FCV 8.0** containers, each
  **768 MiB**, WiredTiger cache **0.25 GiB**, **nofile 64000:64000**:
  `mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
  No engine/FCV upgrade is performed. The separate replica-set matrix is in SR-045.
- Solr **10.0.0**:
  `solr:10.0.0@sha256:c2a983cd9a5759c3b802b7b47f48b5cfae2b34d63a9444d62730fdbdb1b5308b`.
- Dedicated Docker **29.6.1**, socket `unix:///run/sr-p7-isolated/docker.sock`,
  dedicated containerd; external owned network **sr-p7-final**. Source/candidate
  HTTP ports **18507/18508**, core/storage **28031/28032**, loopback only.
- Native Mongo tools **100.19.1**, Git
  `9348e032419d906e40966f477278cce647b9b1eb`, Go **1.26.8**, linux/amd64.

The committed logical fixture has **123 documents / 13 collections** and no
production credentials. The guarded helper seeds disposable local databases,
adds a real GridFS object and synthetic primary/staging files. Local auth and
fixture credentials, disabled external vocabulary imports and fenced publishers
are explicit inputs. External IdP/publisher reconciliation is not exercised here;
real OIDC and S3 are covered separately by the existing regression profiles.

## Executed procedure and outcomes

The operator procedure is [upgrade-recovery-v6.md](../upgrade-recovery-v6.md).
The executable is `support/integration-testing/rehearse-sails-retirement-recovery.sh`
with `packages/redbox-core/test/qualification/recovery-fixture.cjs`. Actual command:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
DOCKER_HOST=unix:///run/sr-p7-isolated/docker.sock \
SR_P7_RECOVERY_NETWORK=sr-p7-final \
SR_P7_SCRATCH_ROOT=/mnt/docker-storage/sr-p7-clean-production/.tmp/recovery-b232d6761 \
SR_P7_RECOVERY_LOGS="$PWD/.tmp/sails-retirement/p7/recovery-b232d6761" \
SR_P7_CANDIDATE_IMAGE=sha256:25725acf4be38222bdf3546e29cdd1016492ec671c19c9920c7beb8420a05b1b \
  bash support/integration-testing/rehearse-sails-retirement-recovery.sh
```

Final exit **0**, no conditional skips. Machine-readable outcomes:
[p7-production-recovery-results.json](p7-production-recovery-results.json).
No application source, emitted libraries or dependency directories are mounted
into either installed portal. Only deployment configuration/bytes and read-only
qualification helpers are supplied.

| Stage | Actual result |
| --- | --- |
| Released source | Home/login **200**; both retained records, forms, workflows and edit pages **200**; **20/20** authenticated forms requests. Exit **0**, no OOM. |
| Quiescent checkpoint | Writers stopped; **25 collections / 1895 documents**; native dumps of both stores; document/index manifests, GridFS bytes, primary/staging/configuration, runtime configuration and complete source image. |
| Index preparation | Inspect **2**; exact reviewed nonunique OID index conversion, no duplicates; ensure/inspect **0**, **102 scopes ready**, no retained owner pools/Prisma clients. Installed candidate maintenance ensure/inspect also **0**. |
| Installed initialize-only | Exit **0**; all **six** lexical migrations, core/ordered hook bootstrap and schema/storage/dashboard validation. Five record-hook types converted; two retained active records revision-backfilled. Explicit reviewed dashboard finding accepted through fingerprint-validated deployment data. |
| Candidate public behavior | Health/ready/home/fresh CSRF login **200**, session version **6**; both retained records/forms/workflows/edit pages **200**; **20/20** forms requests. |
| Candidate restart | Same installed image and persisted state; all preceding public checks repeat, **20/20** forms requests. Both stops exit **0**, no OOM/forced termination. |
| Partial failure | Installed core migration runner executes a body which writes a core collection and storage metadata, then throws; both writes persist, **no success ledger entry**. Bundled migration rerun has **0 pending**; password and **4 role links** preserved. |
| Complete restoration | Guarded disposable databases dropped, including candidate-only collections; both native dumps restored, **0 failed documents**; all **25 collections / 1895 documents** and every index/document checksum match, including original nonunique OID index. Exact GridFS/primary/staging/config bytes verified; source image reloaded. |
| Recovered source | Exact released artifact, home/login and both records/forms/workflows/edit pages **200**; **20/20** forms requests. Stop exit **0**, no OOM. |
| Cleanup | All owned portal/Solr/Mongo containers and anonymous volumes removed; the supplied external network is retained for subsequent qualification. Checkpoints remain outside Git. |

All six installed migrations are recorded in the raw initialize log. The deliberate
failure occurs after a full successful cutover and restart, not instead of those
steps. Recovery uses the complete pre-v6 checkpoint; the old source never starts
against partially modified v6 databases. Writer-free standalone dumps are a
quiescent checkpoint, not an online atomic cross-server snapshot.

## Operational comparison

Tolerances were committed **before candidate execution** in `d65ce7c23`: startup
and memory at most **1.5×** initialized released source, forms p95 at most **2×**,
zero failed requests, successful readiness and exit **0**, no OOM. Compare the
initialized restored source rather than cold logical-fixture bootstrap.

| Observation | Startup / stop (s) | Memory (MiB) | Forms p50 / p95 / max (ms), 20 successes |
| --- | --- | --- | --- |
| Cold released source | 216 / 1 | 554.0 | 104.580 / 155.893 / 190.722 |
| Installed v6 | 8 / 0 | 377.5 | 20.610 / 25.943 / 30.052 |
| Installed v6 restart | 9 / 0 | 295.8 | 19.714 / 23.161 / 23.204 |
| Initialized/restored v5 | 14 / 0 | 425.2 | 35.360 / 45.264 / 47.283 |

Candidate/restarted ratios: startup **0.571/0.643**, memory **0.888/0.696**,
forms p95 **0.573/0.512**. All criteria pass without changing tolerances. Cold
source includes initial image pull/bootstrap and is not the initialized baseline.
These shared-VM snapshots and 20 sequential requests are local operational checks,
not concurrency/capacity or institution performance guarantees. Busy drain and
retry are covered by the independent real-database matrix.

## Binary checkpoint verification

Earlier successful component rehearsals (`58f7cbbd6`, `4249667`) verified native
database/file restoration, but their saved source image could be only **13 KiB**:
OCI index/manifest, with configuration and all **23** layer blobs absent. A cached
engine accepted `docker load`. **Those historical binary-recovery claims are
superseded; they do not prove an independently recoverable image.**

The new read-only `image-backup.cjs` fails that actual thin archive (red, exit **1**,
missing configuration). A platform-qualified export and the actual current
checkpoint both pass (green, exit **0**): **23 layers**, **525915136 bytes**, SHA256
**`052c811bf18ced5437a52740ce8cfe19b867af37f14ad3b2042e80aebc461f1d`**.
The runner now saves `--platform linux/amd64` and verifies the payload immediately.
The completed rehearsal predates that harness edit; its actual retained payload
was independently verified, not assumed from another archive.

The fresh-engine proof uses a new task-owned Docker/containerd root in an empty
`unshare --net` namespace: no registry network, initially **zero images**, load
only the actual checkpoint archive, then `docker run --pull never --platform
linux/amd64 --network none <loaded-id> node --version`. The owned engine and
containerd are stopped afterwards; system Docker/containerd are never restarted.
The fresh engine loaded the exact digest and executed **v24.16.0**, exit **0**;
both owned daemon processes stopped successfully. The initial proof wrapper
needed `sudo mkdir` for its owned storage root (first wrapper exit 1 before any
daemon started); this was a permissions correction, not an image failure.
Raw proof logs: `.tmp/sails-retirement/p7/image-backup-offline/`.

## Regressions and earlier failed attempts

- Cold source exhausted the first 180 readiness probes; new rehearsal alone
  allows 600 bounded probes. No production/test assertion or timeout changed.
- Missing JSON negotiation headers made the first new probe follow an HTML
  redirect. The corrected helper matches existing Bruno headers and disallows
  redirects; JSON login must actually return 200.
- The runner now checks real migration ledger names, accepts the existing initial
  record revision 0 and awaits identity initialization. Cleanup is ordered and
  no longer retries already removed containers. These are new-harness fixes.
- Source OID index conflicts are deliberately refused. The runbook documents a
  separate exact-definition/zero-duplicate reviewed conversion after backup;
  generic maintenance still cannot silently drop an index or repair documents.
- Clean source `d82dc4f86` full upgrade exposed optional `undefined` fields
  introduced by dashboard snapshot construction. `f71e71f2e` omits only absent
  optional snapshot fields, retaining plain-JSON persistence validation. Red
  **38 pass/1 fail**; green **39 pass**, no skips.
- After that fix, dashboard migration correctly stopped at a material-difference
  review gate. `b232d6761` exposes validated explicit
  `dashboardMigrationResolutions` deployment data, preserving fingerprint/finding
  validation and the temporary Sails file adapter. Configuration red **7 pass/1
  fail**, green **8 pass**; complete dashboard services **40 pass**, zero skips.
  The synthetic decision and behavior are documented in the runbook. No automatic
  acceptance or migration skip was introduced.
- The thin image-export flaw and new payload verifier are described above.

Earlier retained checkpoints remain at:
`/mnt/docker-storage/sr-p7-clean-4254c2e/.tmp/recovery-58f7cbb/sr-p7-recovery.7dKyZ8`
and `/mnt/docker-storage/sr-p7-clean-4249667/.tmp/recovery-scratch/sr-p7-recovery.qqBTnz`.
Their 24/25 collection difference was an additional empty `figsharesync` collection;
each matched its own native checksum manifest. Their database/file evidence
remains valid; their old image-recovery proof does not.

Current complete checkpoint:
`/mnt/docker-storage/sr-p7-clean-production/.tmp/recovery-b232d6761/sr-p7-recovery.5pZ6qI`.
No dumps, image tar, raw logs, binary objects or synthetic session data are committed.

## Remaining institution gate

The orchestrator must designate the institution owner, approved supported source
artifact/checkpoint, actual converted hook/configuration/provider set, topology
(including TLS/auth), secrets access and external-effect reconciliation owner.
Then repeat the full procedure against that approved deployment. SR-049 remains
unchecked for precisely this external requirement; the user-authorized stand-in
cutover/recovery and SR-048 procedure are complete. Internal default promotion is
within this round's explicit scope. Production release acceptance and P8 remain
separate gates.
