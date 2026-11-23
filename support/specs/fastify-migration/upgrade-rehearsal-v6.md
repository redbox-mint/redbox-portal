# Rehearse a v6 Express-to-Fastify upgrade

This runbook replays the local WSU upgrade from pre-Fastify v6 Express
`f7ebc45fb5b7c837b66dd309e879f89b87065f7e` to FM-044 revision 5
`sha256:28898f254d52fcbcfc71ed1bebb0c39726ee089e992b643f7303ed1ca581080a`.
Both installations use `node node_modules/redbox-hook-wsu/support/v6/app.cjs`
with the WSU bindings and the production composition for that image. The
[rehearsal evidence](evidence/FM-049.md) records the exact image and hook digests.
The [rollback rehearsal](rollback-rehearsal-v6.md) covers keeping current data
and restoring this checkpoint into clean targets.
For a new WSU run, pass the fixed source-built API2 package and its recorded
SHA-256 as the second and third arguments to `prepare-deployments.sh`.
[Fixed package qualification](evidence/FM-050.md#source-built-wsu-requalification)

## Prepare a fresh deployment

Run from the repository root on the ARM64 rehearsal worker with Docker BuildKit,
Tailscale, Python 3.12, and the local revision 5 image. Choose a new namespace and
six free ports. The namespace below was used for the review replay. Choose
another unique suffix if its image tags or resources already exist. The original
`fm049-*` volumes listed in the [FM-050 handoff](evidence/FM-049.md#fm-050-handoff)
belong to rollback.

> **WSU package provenance.** The pinned WSU package (SHA-256 `9248b56b…5ce27198`) was built from
> `redbox-hook-wsu-api2` commit `58baba0` (branch `feature/v6-api2`) with the clean-install, build and
> `npm pack` procedure in FM-050. Use the archived tarball or rebuild from that commit
> and verify the SHA-256 before use. [FM-050 evidence](evidence/FM-050.md#source-built-wsu-requalification)

```sh
fm049_tool="$PWD/support/integration-testing/upgrade-rehearsal"
fm049_scratch=/home/ubuntu/work/fastify-orchestration/scratch/FM-049
mkdir -p "$fm049_scratch"
export FM049_RUN=$(mktemp -d -p "$fm049_scratch" review1.XXXXXXXX)
python3 "$fm049_tool/settings.py" "$FM049_RUN" fm049-r1-259 49850

timeout --kill-after=35s 5500s "$fm049_tool/prepare-deployments.sh" \
  /home/ubuntu/work/bitbucket/redbox-hook-wsu-v6 \
  /home/ubuntu/work/evidence-archive/fastify-migration/FM-050/final-round.cv2kjB4z/packs/redbox-hook-wsu-2.0.0-v6.0.tgz \
  9248b56b997ca820a7958c323fbd943e11e0d52464b622a0e2acf8cd5ce27198

timeout --kill-after=15s 1000s "$fm049_tool/rehearse.py" preload
timeout --kill-after=20s 950s "$fm049_tool/rehearse.py" services source-start seed
```

The preload step inspects these exact references and pulls only those absent
from the local Docker engine. Service startup uses `--pull=never`.

| Provider | Pinned image |
| --- | --- |
| MongoDB 9.0.4 | `mongo@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8` |
| Solr 10.0.0 | `solr@sha256:b866a82ef3a0a16ed25005731dd0c5d87541b70783a14a2392ecfa12810541cb` |
| SeaweedFS 4.47 | `chrislusf/seaweedfs:4.47@sha256:ce9e796f1fe6f06968f4c04bdaf8f678dad9c8acdfef3d244133d71bfa6bf882` |
| Nginx 1.29.3 | `nginx@sha256:b3c656d55d7ad751196f21b7fd2e8d4da9cb430e32f646adcf92441b72f82b14` |

[Settings](../../integration-testing/upgrade-rehearsal/settings.py) creates an
attempt ID in the empty run directory, then creates `gate/`, `checkpoint/`,
`components/`, and `state/{staging,figshare,publications}/`. The six ports
belong to core Mongo, storage Mongo, Solr, S3, the loopback portal, and the
Tailscale proxy in that order. The sample uses `fm049-r1-259-{core,storage,solr,s3}-data`
volumes and `sr_wsu_fm049_r1_259*` databases. Containers and volumes carry the
attempt ID. The driver checks the ports and resource names before creating them.

[Preparation](../../integration-testing/upgrade-rehearsal/prepare-deployments.sh)
builds the Express `runtime` target from a clean archive of `f7ebc45fb` with
that revision's pinned Dockerfile. It compiles API1 from the read-only clone
archive at `764851e98cd2ae2d6938c41b18b8abcc081e0656` against that portal
builder. Supply the fixed FM-050 API2 pack built from WSU source tree
`ba31914b4ff22f4688cf9517bd6ab68e3e20fd9f` over base `37b64b9`,
with SHA-256 `9248b56b997ca820a7958c323fbd943e11e0d52464b622a0e2acf8cd5ce27198`.
The script verifies the pack and both r5 digests, installs the hook and the
lock-pinned `xmlbuilder@15.1.1` in each deployment, and records each image
digest under `components/`. It verifies the parent image layers, health
check, and non-root access to the installed WSU entrypoint. Source preparation
runs the index commands, starts the installed Express deployment, and seeds
the disposable WSU records, users and bytes.

## Run the window

[The driver](../../integration-testing/upgrade-rehearsal/rehearse.py) uses the
directory selected by `FM049_RUN`. Keep it set for every command.

```sh
timeout --kill-after=25s 900s "$fm049_tool/rehearse.py" quiesce-and-drain checkpoint
timeout --kill-after=20s 120s "$fm049_tool/rehearse.py" checkpoint-control
timeout --kill-after=25s 1100s "$fm049_tool/rehearse.py" deploy invalidate readiness smoke-api-auth-upload
timeout --kill-after=20s 600s "$fm049_tool/rehearse.py" restart-control candidate-restart
timeout --kill-after=10s 90s "$fm049_tool/rehearse.py" browser-start
```

1. **Quiesce and drain.** Start a multipart upload and confirm staging receives
   bytes. Enable the Nginx maintenance fence and require HTTP 503 for new
   public readiness, page, and API requests. Finish the admitted upload, verify
   the downloaded bytes, and require a clean Express stop and empty staging.
   Keep Express stopped after the drain throughout the window. If it starts
   again, follow [the fenced recovery](#recover-after-an-express-restart).
2. **Checkpoint.** Inventory and dump core, storage, Agenda and session data.
   Capture Solr's data directory at a clean stop, S3 attachment bytes, and
   local staging and publication paths. Save and verify the preceding image,
   including its configuration and all layer blobs. Seal the completed
   checkpoint with `SHA256SUMS`. The deployment step requires the complete
   manifest, every listed checksum, and matching attempt and source image
   identities. `checkpoint-control` tests each required file missing and
   damaged, including the source image archive.
3. **Select the staged candidate and force login.** Verify the staged r5 image
   and API2 installation. Rotate the signing root and select the Fastify
   cookie name. Inspect indexes and create the candidate container while
   Express remains stopped. Keep the session database in the checkpoint.
   Use a fresh signing root for rollback as well.
4. **Readiness and HTTP smoke.** Start the candidate and record late listen,
   readiness 200, liveness 200 and a healthy container. Public requests still
   receive 503. Verify old cookies are rejected, fresh CSRF logins and record
   and workflow reads pass, and retained and newly uploaded bytes match.
5. **Restart and check persistence.** `restart-control` injects a rejected
   session on a real restart and tests the traffic gate with missing and stale
   receipts. `candidate-restart` performs a clean stop and start, then verifies
   both new sessions and the upload. A successful restart receipt requires all
   checks and records the current attempt, container ID, image digest, and
   Docker start timestamp. The public gate also requires readiness and browser
   receipts for that launch and checks the earlier API smoke against the same
   attempt, container, and image.

Each gated step discards its previous success receipt when it starts. A new
receipt seals the step's inputs and prerequisite receipts by checksum.
Rerunning an earlier step requires downstream checks again. A failed
checkpoint recheck leaves the archive available for diagnosis and revokes
deployment authorization.

### Recover after an Express restart

Keep the proxy fence in place throughout recovery. Stop any running candidate
before using Express. If the rehearsal's Express container has already stopped,
start it behind the fence and wait for its Docker healthcheck:

```sh
test -f "$FM049_RUN/gate/maintenance"
fm049_namespace=$(jq -er .namespace "$FM049_RUN/settings.json")
timeout 65s docker start "$fm049_namespace-express"
timeout 480s bash -c 'until [[ $(docker inspect --format "{{.State.Health.Status}}" "$1") == healthy ]]; do sleep 1; done' _ "$fm049_namespace-express"
```

With Express running and ready behind the fence, re-drain it and take a fresh
checkpoint. The driver stops the current Express launch, records the full
attachment inventory, and discards any stopped candidate container from the
same attempt. The providers and fence stay in place.

```sh
test -f "$FM049_RUN/gate/maintenance"
timeout --kill-after=20s 180s "$fm049_tool/rehearse.py" quiesce-and-drain
mv "$FM049_RUN/checkpoint" "$FM049_RUN/checkpoint-before-redrain-$(date -u +%Y%m%dT%H%M%S%N)"
mkdir -m 700 "$FM049_RUN/checkpoint"
timeout --kill-after=25s 900s "$fm049_tool/rehearse.py" checkpoint
```

Continue from `deploy` and repeat the remaining gates before reopening.

### Resume a failed checkpoint

If `checkpoint` returns an error after a successful drain, leave the proxy
fenced and Express stopped. Fix the checkpoint error while the providers
remain isolated. Preserve the partial directory and retry only `checkpoint`:

```sh
mv "$FM049_RUN/checkpoint" "$FM049_RUN/checkpoint-failed-$(date -u +%Y%m%dT%H%M%S%N)"
mkdir -m 700 "$FM049_RUN/checkpoint"
timeout --kill-after=25s 900s "$fm049_tool/rehearse.py" checkpoint
```

Then continue with the remaining steps. The checkpoint step checks the
current attempt's successful drain, the closed fence, and stopped Express
before writing anything.

### Verify in the browser and reopen

`browser-start` prints the Tailscale origin, existing dataset record and a
fresh capture directory tied to the current container launch.

1. In a private browser session, open `/default/rdmp/user/login` on that
   origin and confirm the maintenance 503. Request
   `/_fm049/access/<operator token>` on the same origin using the disposable
   `operator` value in the run's `settings.json`. Expect 204. The returned
   operator cookie passes only the proxy fence.
2. Reopen login and capture `candidate-login.png`. Sign in with the
   fixture's local administrator (`admin` / `rbadmin`). Verify the exact
   `Welcome Local Admin` text and capture `candidate-home.png`.
3. Open `/default/rdmp/record/edit/<oid>`. Select **Dataset Information**,
   verify the persisted title and inspect local requests and script errors.
   Capture `candidate-record.png`. Put all three PNGs in the fresh capture
   directory. Save `observation.json` there with `origin`, `recordUrl`,
   `loginStatus` and `recordStatus` (both 200), `welcome` (the text above),
   `existingRecordVisible` (true), `tab` (`Dataset Information`), and
   `pageErrors` and `localErrors` (empty arrays for a pass). Use fresh browser
   observations and screenshots after any restart.

```sh
timeout --kill-after=10s 90s "$fm049_tool/rehearse.py" browser-finish browser-control browser-finish
timeout --kill-after=10s 100s "$fm049_tool/rehearse.py" restore-traffic
timeout --kill-after=15s 180s "$fm049_tool/rehearse.py" cleanup
```

`browser-finish` seals the exact observation file and all three screenshot
hashes. `browser-control` checks that a changed upstream session file and a
changed browser observation both block reopening. It runs a failing browser
recheck, restores the original observation, and confirms public traffic stays
fenced until the browser receipt is renewed. `restore-traffic` verifies the receipt
chain, the live readiness and liveness, and the full checkpoint before opening.
Public readiness and login must return 200. The driver reapplies the fence if
the public probes fail. Cleanup fences again, stops the candidate and removes
containers and volumes owned by this replay. The replay files and image
remain available. [FM-050 handoff](evidence/FM-049.md#fm-050-handoff)
