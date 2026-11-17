# Express baseline / FM-047 replay

[FM-005](../../specs/fastify-migration/evidence/FM-005.md) fixes the protocol.
This harness runs the complete production portal composition with the bundled
synthetic `dataRecord` configuration, real standalone Mongo 9, Solr 10 and FS
attachments. It does not qualify WSU or a release image. No application source,
dependency version or supported HTTP contract is changed.

Select Node 26.12.1/npm 11.20.0, rebuild core first, then run all commands serially
with external timeouts. Reserve the host for the benchmark. These scripts own only
`fm007-*` containers and the guarded disposable state directory. `start` creates
an invoking-UID-owned `fm007-state` (or `fm007-state-SUFFIX`) directory with the
`.fm007-disposable-state` ownership marker. Existing unmarked directories, unsafe
names and symlinked state/ancestors/markers are rejected. The same guard runs
before services, resets and cleanup deletions, including `all` failure cleanup. Ports are fixed
in `protocol.cjs`; Solr also reserves its stop port 18571. Check availability first.
The attachment filesystem must have at least 20 GiB free. Do not lower the portal's
10 GiB disk threshold. Preserve artifacts outside temporary state.

```bash
source ~/.nvm/nvm.sh
nvm use
timeout 600 npm run compile:core
timeout 30 node --test support/integration-testing/fastify-performance/protocol.test.cjs
timeout 3600 node support/integration-testing/fastify-performance/freeze.cjs

# The artifact record supplies the immutable image ID, not the mutable tag.
export FM007_IMAGE="$(node -p 'require("./support/specs/fastify-migration/evidence/FM-007-data/artifact.json").image')"
export FM007_STATE=/home/ubuntu/work/fm007-state
export FM007_BATCH=express-01
export RBPORTAL_PLAYWRIGHT_HOST=express # explicit retained baseline only
# Full matrix takes several hours. Each child has its own 600-second timeout.
timeout 43200 node support/integration-testing/fastify-performance/run.cjs all
timeout 120 node support/integration-testing/fastify-performance/report.cjs
```

`freeze.cjs` copies the current built tree, assets and physical installed package
graph into an immutable overlay on the recorded local Node 26 image. The saved
Docker archive, image metadata, every tracked lock hash, installed package manifest,
source/tree SHA and harness digests identify the measured artifact. It is a saved
current-build baseline, not a claim that inherited installed dependencies match
every lock entry or that the overlay is the final production runtime target.
The clean release graph/user/platform gates remain FM-044–046.

The fixture manifest selects the real Mongo storage extension and bundled forms.
`owner.cjs` calls `createPortalHost` without replacing domain factories or
repositories. Its loopback diagnostic server seeds/verifies state and exposes
owned stop/drain; it is outside timed paths. Diagnostic logs are suppressed with
the existing `nothingLogger`, identically across samples. Node runs nonroot as the
invoking UID/GID, with one CPU/2 GiB and `--max-old-space-size=1024`. Mongo and Solr
have the exact FM-005 resource limits; Nginx is limited to 256 MiB. All share the
two host CPUs, without CPU affinity. The generator is the host Node process.

Each attempt drops four guarded databases and the persisted Solr index, clears
attachment disks, and starts a fresh portal owner. The real storage service creates 1,000 deterministic measured
and 100 warm records at server revision zero, with exactly 8,192 UTF-8 metadata
bytes each, deriving brand/type/form/workflow/ACL inputs from the selected production configuration. No extra template record is persisted. Initial Solr data is
bulk-loaded using the selected service's actual `SolrDocument`/`preIndex` mapping,
then committed. This preparation is outside the timed workload. Initial indexing
is not artificially mixed into request throughput.

W1/W3 round-robin the full namespace. W2 has a disjoint singleton set per worker
(measured records 0–3 or warm records 0–3) and alternates the exact 1,024-byte patch
on every PUT. Seed ETags are fetched before timing; each successful response must
advance the revision by one and supply its new tag. No refresh GET is issued in
the timed window. Search remains queued with four workers/locks, other queue
defaults remain unchanged, and Agenda polls every 0.1 seconds. Every affected
record, audit count and final Solr title is verified after drain. Warm audits,
completed queue/history rows and warm index documents are cleared before timing;
all 1,000 measured records are reverified at seed revisions and metadata hashes.

The 1 MiB/32 MiB deterministic files are stored on the real FS primary disk through
the selected datastream service. Streams must consume all bytes and match SHA-256;
TTFB and last-byte completion are separate metrics. The agent validates login,
ACLs, v2 fields, HTML title/record/form bootstrap, unauthorized access and strict
missing-precondition refusal before each sample. Sessions remain persisted/touched.

HTTP/1.1 keepalive is enabled with one persistent connection per closed-loop
worker. Compression is explicitly `identity`/off; proxy buffering is off and
upgrades/forwarded headers are configured in the retained Nginx file. Direct uses
empty root; proxy uses `/research` with explicit loopback trust. Nginx also offers
a real terminated-TLS control, using a disposable self-signed IP certificate
generated by `run.cjs start`. A smoke with `FM007_TLS=true` and
`FM007_TLS_CERT=$FM007_STATE/tls/cert.pem` verifies a Secure cookie. TLS is not
silently included in the HTTP timing comparison. Socket/Companion/adverse-network
qualification and actual institution proxy/operator inputs remain separate gates.

No short smoke qualifies: `sample.cjs CELL OUTPUT --smoke` requires an explicitly
identified image and may use `FM007_CHECKOUT` for development; every result has
`smoke:true` and `valid:false`. Baseline mode forbids live source mounts.

`run.cjs start`/`run`/`clean` split lifecycle for diagnosis. `FM007_CELLS` selects
comma-separated cells and `FM007_BATCH` labels an entire five-sample rerun; neither
permits selecting individual favorable repetitions. Existing attempt directories
cannot be overwritten. `attempts.jsonl` records start/finish/failure, including
outer timeouts. Every attempt retains its own result; failures stop the driver.
Always run `clean` on an interrupted diagnostic run. It removes owned containers,
anonymous volumes and mutable app/attachment state; archive the disposable TLS
fixture before removing its directory if exact replay is needed.

`requests.jsonl.gz` retains per-request monotonic start/first-byte/end, status,
errors, bytes, SHA-256, reused-connection flag, cell/worker/record and revisions.
Scheduling stops at 120 seconds. Late completions remain separate and cannot
increase timed throughput. Latency quantiles include all successful offered work,
including late completions, with late latency also retained separately. Completion plus owned queue drain shares one bounded
60-second budget. Unexpected errors/timeouts, fewer than 100 timed completions,
wrong bytes/fields/revisions, failed/draining queues or leaked pools reject a run.

Node RSS/heap/cumulative CPU/resource usage and host/provider/proxy/generator
CPU/RSS/cgroup/pressure observations are sampled every second. Telemetry and seeds
are compressed after stop. With raw logs present, `report.cjs` independently
recomputes request metrics and checks telemetry coverage. `--save-resources`
preserves the derived CPU/RSS/heap/provider summaries bound to each unchanged
`result.json` SHA-256. Without raw logs, reporting uses the per-attempt results
and `resource-summaries.json`; the external archive is optional. Invalid completed
attempts retain error/timeout metrics and their disposition, and cannot enter
aggregates. All five valid samples are aggregated with median/min/max and
`(max-min)/median*100`. CPU percentages use one core = 100%; proxy/provider RSS sums
can include shared pages. Retained memory is captured immediately after queue
drain and separately after verification. Raw cgroup throttling and host conditions
are retained to investigate noise and generator/proxy saturation.

FM-047 must reload the saved Express image (`gzip -dc ... | docker image load`),
capture the candidate independently, and run complete five-sample pairs in the
fixed E/F, F/E, E/F, F/E, E/F order, resetting between every owner. This Express-only
driver intentionally does not implement candidate selection or make a Fastify
performance claim. Preserve the protocol/client/seed/configuration and resource
limits; any necessary host bootstrap adapter change must be identified and reviewed.
Above-10% variability requires investigation and complete affected-cell repeats;
generator/proxy saturation requires another runner and recapturing both baselines.
Never compare a different setup to this local baseline. Final deterioration remains
`(F_p95/E_p95-1)*100` / `(1-F_throughput/E_throughput)*100`, independently per cell.

FM-007 bulk telemetry is outside Git at
`/home/ubuntu/work/evidence-archive/fastify-migration/FM-007/raw-telemetry.tar.gz`.
The in-repo `FM-007-data/raw-manifest.json` lists every archived member's relative
path, byte size and SHA-256, plus the archive identity. This includes raw requests,
host/Node/portal logs, seeds, interrupted-state captures, setup/build logs and all
13 original measured harness files under `measured-harness/`. Copy the archive to
durable storage before retiring this worker. The image archive remains a separate
artifact. Results, attempts/selection records, aggregates and compact resource
summaries remain in Git.

```bash
# Verify archive SHA-256 and every member (no containers or extraction).
timeout 180 python3 support/integration-testing/fastify-performance/archive-raw.py verify
# After relocation, supply --archive /durable/path/raw-telemetry.tar.gz.

# Offline report from repository data only; no services or archive required.
timeout 120 node support/integration-testing/fastify-performance/report.cjs
timeout 30 python3 support/specs/fastify-migration/evidence/FM-007-data/build-record.py

# Optional independent raw replay, after archive verification. Use disposable storage.
review_raw=$(mktemp -d /tmp/fm007-raw-review.XXXXXX)
tar -xzf /home/ubuntu/work/evidence-archive/fastify-migration/FM-007/raw-telemetry.tar.gz -C "$review_raw"
timeout 120 node support/integration-testing/fastify-performance/report.cjs --verify-raw --raw-root "$review_raw"
rm -r -- "$review_raw"
```

The historical `artifact.json` identifies the measured image and original harness;
review fixes do not rewrite that identity. `harness-review.json` separately binds
the reviewed harness to that original image/harness and lists the current file
hashes accepted by `run.cjs`. Shared state protection and reporting/archive changes
do not change workload timing, payloads, concurrency, seeds or runtime settings.
FM-047 must preserve both identities and record any further adapter changes.
For a newly captured artifact, regenerate its own frozen identity; do not reuse
this historical review record for a different image.

For a new evidence set, run `report.cjs NEW_ROOT --save-resources` while its raw
logs exist, then archive those logs after verification. The archive helper's
`create --root NEW_ROOT --archive OUTSIDE_PATH --measured-harness ORIGINAL_DIR`
checks the original harness against that set's `artifact.json`, creates the
manifest, verifies the archive and all members, then removes only the enumerated
source files. Existing archives/manifests are never overwritten.
