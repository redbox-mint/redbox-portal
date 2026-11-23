# Rehearse v6 Fastify-to-Express rollback and checkpoint recovery

This runbook exercises the two recovery choices for the local WSU installation in
[FM-049](evidence/FM-049.md#fm-050-handoff). It uses the FM-044 revision 5
Fastify deployment and the preceding v6 Express deployment from `f7ebc45fb`,
each with its own installed WSU hook. [Results and identities](evidence/FM-050.md)

| Path | Decision |
| --- | --- |
| Keep current state | Use only if index inspection, the migration ledger, record metadata and attachments, and external-effect reconciliation show that the preceding build can use the current data. Save the fenced current state before switching binaries. |
| Restore the checkpoint | Use a replacement installation when the current state is incompatible, uncertain, or partially migrated. Record the writes after the checkpoint, preserve them separately, and agree which ones to reapply before reopening production ingress. |

## Fence and preserve state

1. Set maintenance at the real ingress and suspend external writers, cron, queue
   consumers and publication dispatch. Check that new reads and writes receive
   the maintenance response. Drain accepted work and confirm the outgoing host
   exits 0 with its dependencies still available. Inventory unfinished uploads
   and worker claims before retrying an unsuccessful stop.
2. Preserve the current core, storage, session and Agenda databases, Solr index,
   S3 object versions, local staging and publication files, release images,
   exact hooks, and deployment configuration. Keep a separate copy of the
   pre-upgrade checkpoint and manifest. Record which writes occurred after it.
   Take both sets while all writers are stopped.
3. Compare the migration ledger and maintained indexes. Run the preceding
   artifact's `--maintenance=indexes:inspect` before its first start. Resolve
   a report other than exit 0 with the database owner. A failed migration may
   already have committed data even when its ledger entry is absent.
4. Restore the preceding config, hook and image as a unit. Use a fresh signing
   root and cookie name for this deployment. Verify stale cookies, including
   the same signed value under the new name, are rejected. Verify fresh local
   and configured provider logins. Retain old session rows for normal expiry
   or an operator-approved purge. Keep the previous signing roots out of the
   recovered deployment.

The restore path loads the checkpoint image in an independent empty store and
restores dirty-state-sensitive data into clean targets. Restoring only the
collections named in a dump with `--drop` can leave collections created after the
checkpoint. Run Solr and S3 verification before the source application starts,
then repeat the checks against the running application.

## Reconcile effects at each boundary

- **MongoDB and attachments.** Match post-cutover creates, edits and deletes by
  OID, revision and audit history. Validate attachment metadata and object bytes
  together by record OID and file ID. On checkpoint recovery, take candidate-only
  writes from the preserved state and reapply accepted changes with the supported
  record and attachment APIs. Keep the old-to-new ID mapping and handle any
  collisions with the record owner.
- **Solr.** Compare checkpoint and post-cutover document IDs and counts. With
  current state, verify the candidate's accepted writes appear in search. With a
  checkpoint, restore its stopped index or rebuild from the restored database,
  verify candidate-only hits are gone, then wait for indexing of any reapplied
  records. Check search visibility after reconciliation.
- **S3.** Compare keys, lengths and content hashes against the selected Mongo
  metadata. In a versioned bucket, retain exact version IDs and delete markers.
  Restore into a separate bucket or namespace from the captured objects. Quarantine
  candidate-only objects until the owner chooses to recover or dispose of them.
- **Jobs and outbound delivery.** Resolve outstanding Agenda/external queue work
  and compare provider delivery or publication IDs with the checkpoint. The
  respective owners confirm the outcome of email, SIEM, DOI/RAiD/Figshare
  publication, remote transfers, acknowledgements and other configured dispatch.
  Suppress replay of confirmed deliveries, use idempotency keys for approved
  retransmission and record any compensation at the provider. A checkpoint can
  recover local data. A delivered message, publication or acknowledgement has
  its own provider-side outcome. The local fixture compares Agenda jobs and
  staging/publication paths and uses disposable S3 and Solr. Institution provider
  and queue receipts are required for actual production use. The rehearsal
  expects enabled, unclaimed outbound jobs. Agenda records the active claim
  in `lockedAt` and identifies its owner in `lastModifiedBy`. The owner
  field can remain as history after the job releases its lock. A change in
  `nextRunAt` is allowed for the two local recurring jobs only after a
  completed run with the configured cadence (30 seconds for Figshare
  dispatch and one minute for SIEM retry).

## Reproduce the two local paths

Use an ARM64 Linux Docker worker with the retained FM-049 inputs, the
preceding WSU Express image, the immutable r5 base, the qualified WSU API2
package (SHA-256 `9248b56b997ca820a7958c323fbd943e11e0d52464b622a0e2acf8cd5ce27198`)
and Tailscale. Select two distinct namespaces and two sets
of six free ports. Ports map to core Mongo, storage Mongo, Solr, S3, the portal
listener and the Tailscale proxy. The tooling binds the public URL to MagicDNS.
It uses the digest-pinned MongoDB 9.0.4, Solr, S3 and proxy images listed in
[FM-049](upgrade-rehearsal-v6.md#prepare-a-fresh-deployment). The image proof
needs Docker Engine 29 with the containerd image store and the local Docker
binaries under `/usr`. Its disposable, network-isolated Docker helper needs
privileged execution to unpack image layers in its own volume. Do this on
the rehearsal worker.

From a clean shell or directory:

> **WSU package provenance.** The pinned WSU package (SHA-256 `9248b56b…5ce27198`) was built from
> `redbox-hook-wsu-api2` commit `58baba0` (branch `feature/v6-api2`) with the clean-install, build and
> `npm pack` procedure in FM-050. Use the archived tarball or rebuild from that commit
> and verify the SHA-256 before use. [FM-050 evidence](evidence/FM-050.md#source-built-wsu-requalification)

```sh
repo=/home/ubuntu/work/github/redbox-portal
tool="$repo/support/integration-testing/upgrade-rehearsal"
scratch=/home/ubuntu/work/fastify-orchestration/scratch/FM-050
handoff=/home/ubuntu/work/evidence-archive/fastify-migration/FM-049/rehearsal.l6imYYbj
manifest=20725999da37e7033ac4cd78f67ce31efbc6173ec057c2d508b6b2063337cad4
wsu_pack="/home/ubuntu/work/evidence-archive/fastify-migration/FM-050/final-round.cv2kjB4z/packs/redbox-hook-wsu-2.0.0-v6.0.tgz"
wsu_sha256=9248b56b997ca820a7958c323fbd943e11e0d52464b622a0e2acf8cd5ce27198
mkdir -p "$scratch"
live=$(mktemp -d -p "$scratch" live.XXXXXXXX)
export FM049_RUN="$live"
python3 "$tool/rollback-settings.py" "$live" fm050-live-replay 49910 live "$handoff" \
  --checkpoint-sha256 "$manifest" --wsu-pack "$wsu_pack" --wsu-pack-sha256 "$wsu_sha256"
timeout --kill-after=15s 800s python3 "$tool/rollback.py" \
  preload images targets r5-writes express-start smoke express-restart forward-check browser-start
```

The driver takes read-only mounts of the four retained volume inputs, copies
them and opens the copies. It installs the qualified source-built WSU API2
package and checkpoint-pinned XML dependency over the immutable r5 base. It
checks the package checksum, the r5 layer prefix, the installed command,
non-root user and health check before startup.
[Package provenance](evidence/FM-050.md#source-built-wsu-requalification)

The driver copies local state and starts the corrected deployment behind the
fence. It checks the retained r5 cookies, writes a new dataset and
attachment through the public API using operator access, waits for indexing
and stops r5 cleanly. Express reads all retained records and attachments,
rejects old Express and Fastify cookies and keeps its fresh sessions across a
graceful restart. To check the other direction, Express creates another
dataset and attachment, r5 reads both, and Express starts again. Keep the
other application process stopped at each switch.

For both attempts, do the following after `browser-start` prints the origin,
record and new capture directory.

1. Use a private browser session at the Tailscale origin. Confirm the public
   login page shows maintenance. Request `/_fm049/access/<operator>` using the
   disposable `operator` field in `settings.json`. The 204 response grants
   proxy access for verification.
2. Visit `/default/rdmp/user/login`, confirm 200 and capture
   `candidate-login.png`. Sign in as the fixture's local administrator
   (`admin` / `rbadmin`). Confirm **Welcome Local Admin** and capture
   `candidate-home.png`.
3. Visit `/default/rdmp/record/edit/<oid>` for the printed record. Confirm
   HTTP 200 and the saved title under **Dataset Information**. Capture
   `candidate-record.png`. Save all three screenshots in the printed capture
   directory. Write an `observation.json` in that directory with the following
   fields using the observed values.

```json
{
  "origin": "http://<MagicDNS name>:<proxy port>",
  "recordUrl": "http://<MagicDNS name>:<proxy port>/default/rdmp/record/edit/<oid>",
  "loginStatus": 200,
  "recordStatus": 200,
  "title": "FM-049 WSU dataRecord checkpoint",
  "welcome": "Welcome Local Admin",
  "tab": "Dataset Information",
  "pageErrors": [],
  "localErrors": []
}
```

Collect a new observation and screenshots for a new browser capture. The
driver binds the receipt to the attempt, exact Express image and Docker launch,
screenshot and observation hashes, provider launches, current inputs and prior
receipts. It checks current readiness, smoke, authenticated sessions and
provider state again before changing ingress. Both paths compare the live
migration ledger checksum with the sealed baseline immediately before
reopening. The negative controls alter copied inputs, a live migration ledger,
and disabled, claimed, or rescheduled outbound jobs. Each requires public 503
with no public success receipt.
`reopen` checks anonymous readiness and login after releasing the fence and
reinstates maintenance if either fails.

```sh
timeout --kill-after=10s 330s python3 "$tool/rollback.py" browser-finish controls reopen
timeout --kill-after=15s 180s python3 "$tool/rollback.py" cleanup
```

Leave the live run directory in place. The restore attempt uses its r5 write
and session receipts as the post-cutover reconciliation inputs.

```sh
restored=$(mktemp -d -p "$scratch" restore.XXXXXXXX)
export FM049_RUN="$restored"
python3 "$tool/rollback-settings.py" "$restored" fm050-restore-replay 49920 restore "$handoff" \
  --checkpoint-sha256 "$manifest" --live-run "$live"
timeout --kill-after=20s 1000s python3 "$tool/rollback.py" \
  preload images targets express-start smoke express-restart restore-current browser-start
```

The restore path verifies the copied manifest and every listed member. It loads
the original archive in an independent empty Docker store and compares the
complete platform, config and layer identities. It then loads the same payload
on the working engine under an attempt-only tag and starts the recovered binary
using the ID returned by that import. It restores four MongoDB archives, Solr,
S3 and filesystem state. It checks pre-start collection/index and S3 byte
inventories against the backup. The old Express cookies in the restored session
database are still rejected. The new dataset and both post-cutover attachment
objects are absent. Restore attempts never reuse partly restored targets. On
failure, keep the run files, clean up the owned Docker resources, and use a new
empty run directory and namespace.

Repeat the browser steps and `browser-finish controls reopen` sequence for the
restored attempt. Run `cleanup`. Leave the logs and the checkpoint copy available
until review completes. Both rehearsal runs use only disposable local state.

## Migration boundary

This is a v6-to-v6 artifact and configuration switch. The Fastify host,
controller contracts, extension bindings and session cutover did not introduce
a persistent data migration for the tested artifacts. The installed v6 programs
both use the existing migration ledger. The rehearsal compares its exact
contents before and after both paths.

Existing v6 changes include the record revision backfill, persisted record-hook
and Agenda payload conversion, branding typeface/history updates, dashboard
configuration conversion, and the reviewed unique record OID index conversion.
Their execution depends on the prepared source state and migration ledger. Some
replace legacy data and lack a paired `down` operation. Treat them as forward-only
for rollback planning. Recovery from those changes uses the appropriate
consistent pre-change checkpoint or an owner-approved repair. V5 recovery
requires the separate v5 recovery procedure and pre-v6 state. The historical
Sails retirement procedure explains the irreversible effects and engine/FCV
and index prerequisites. [Historical recovery runbook](../sails-retirement/upgrade-recovery-v6.md) · [Data migration contract](../../wiki/Data-Migrations.md)
