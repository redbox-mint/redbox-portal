# Native CI image candidates

Dependency-free Node 22+ helpers for PR3. They do not change the Dockerfile,
CircleCI configuration, existing publishing scripts, or Angular scripts.

```sh
node --test support/build/ci-image-candidates/*.test.cjs
node support/build/ci-image-candidates/cli.cjs prepare /tmp/prepare.json
node support/build/ci-image-candidates/cli.cjs verify /tmp/verify.json
node support/build/ci-image-candidates/cli.cjs plan /tmp/promotion.json
```

`plan` validates local archives and the gate contract without Docker, registry
access, or writes. `prepare` needs Docker Engine and Buildx, but never logs in,
pushes, or creates a registry manifest. `verify` loads images only when its JSON
has `"load": true`. `promote` is a separate, explicitly invoked command requiring
trusted executable authorization/coordinator code. No publication has been run
as part of implementing or testing this package.

## Preparation and workspace contract

Run one job on native AMD64 and one on native ARM64. Each job creates exactly one
`docker-container` Buildx builder, builds `runtime` then `runtime_pdfgen` with
`--load`, records native runtime evidence, and removes the builder. The Docker
daemon architecture must match the requested platform; emulated preparation is
rejected. The same builder retains common stages between the two targets. There
is no persistent cross-job cache configuration here (PR4 owns that).

Example `/tmp/prepare.json` (replace identity and toolchain values with the actual
committed source and versions for the job):

```json
{
  "root": "/tmp/ci-candidate-workspace",
  "context": "/home/circleci/project",
  "identity": {
    "revision": "0123456789abcdef0123456789abcdef01234567",
    "pipeline": 12345,
    "workflow": "unique-workflow-id",
    "attempt": 1
  },
  "platform": "linux/amd64",
  "compression": "gzip",
  "toolchain": { "node": "26.12.1", "npm": "11.6.2", "typescript": "5.9.3" }
}
```

Use a **pristine, disposable, source-only checkout**. Both tracked/untracked
changes and ignored files are rejected: ignored local configuration can otherwise
enter `COPY . .`. Write request/result JSON outside the source checkout. Output
must also be outside the Docker context. Do not run installs, asset generation,
or another writer in this checkout concurrently. Later asset-import work must
extend this contract explicitly instead of bypassing it. Preparation rechecks
the source before saving. It cannot detect another process changing and restoring
source during a build; isolation of the CI checkout is required.

`revision` is the full actual `git rev-parse HEAD`, including refreshed Dependabot
commits. Never use the original pipeline SHA for changed lockfiles. `pipeline` is
a positive, globally increasing publication ordering number in this project's
CircleCI pipeline stream (inject `<< pipeline.number >>`). `attempt` is a positive
rerun counter allocated once for the entire workflow and shared across both
architecture jobs, checks, and promotion. Increment it on every new preparation
attempt, including partial reruns. A per-job build number is unsuitable. The
same-attempt retry may promote the same artifacts again, but cannot rebuild and
replace them. Multiple CI projects/manual systems sharing tags must use one
ordering authority; their independent pipeline numbers are not comparable.

Paths are unique and created exclusively, including on interrupted runs:

```text
v1/<revision>/<pipeline>/<workflow>/<attempt>/<amd64|arm64>/
  images.tar.gz                 # or images.tar
  runtime/metadata.json
  runtime_pdfgen/metadata.json
  candidate.json
  checksums.sha256
  complete
```

Target metadata records source/workflow/attempt, target, platform, local image
ID, archive digest/bytes, toolchain, and asset evidence. Image labels bind source,
target and identity. Docker/client/Buildx versions and runtime Node are observed;
compiler/npm toolchain versions are **declared by the trusted preparation job**,
not independently extracted from the intermediate builder. Runtime Node is
checked against the declaration. Use exact versions from the Dockerfile/locks.
The asset digest covers sorted `[relative-path, file-content-sha256]` pairs under
`/opt/redbox-portal/.tmp/public`; it excludes mtimes/ownership and rejects symlinks.
Both targets and both architectures must have the same digest. Optional
`assetSha256` in prepare/verify pins a previously verified shared asset manifest
using this same algorithm. PR3 records assets; it does not import PR4 assets.

The prepare command prints `{directory, catalogSha256, archiveBytes, timings}` as
JSON to stdout; Docker logs go to stderr. Keep this result outside the checkout.
Persist `v1/.../<architecture>` relative to `/tmp/ci-candidate-workspace` in
CircleCI `persist_to_workspace`. The two producers write disjoint directories;
never persist an identical result filename from both jobs. Include the workflow
attempt in any result-file path, and persist checksums/metadata with the archive.

The trusted gate must obtain the **catalog digest from verified producer
provenance**. A checksum supplied alongside an attacker-controlled archive cannot
authenticate it. `complete` is written last. Files are created read-only and
existing attempts are never overwritten, but POSIX permissions do not provide
storage-level immutability. Restore archives to a private workspace with no
concurrent writers and pin `catalogSha256` independently. SHA256 verification
detects accidental or malicious modification relative to that trusted root.

Example verify request:

```json
{
  "directory": "/tmp/restored/v1/0123456789abcdef0123456789abcdef01234567/12345/unique-workflow-id/1/amd64",
  "identity": {
    "revision": "0123456789abcdef0123456789abcdef01234567",
    "pipeline": 12345,
    "workflow": "unique-workflow-id",
    "attempt": 1
  },
  "platform": "linux/amd64",
  "catalogSha256": "sha256:<64 hexadecimal characters from the producer>",
  "load": true
}
```

Verification checks the complete/checksum inventory, catalog, both target metadata
files, archive length/hash, identity, platform, targets, and asset evidence.
Loading is streaming and followed by image-ID/platform/label inspection for both
images. Promotion does not run ARM binaries on AMD64: native evidence and actual
startup checks belong in the native producer/validation jobs.

## Validation gate and CircleCI wiring

Preparation can overlap validation only on deploy-eligible branches/tags. Give
build-only jobs **no publishing credentials**, including forks and untrusted
branches. Native jobs must load their candidates and run image contracts/startup,
hook-content checks, production dependency resolution, HTTP assets, and a tiny
Chromium PDF before reporting success. Metadata/evidence alone is not a startup
test. Preserve existing integration/test report and coverage behavior.

Create the following promotion request in a protected gate job. The identity is
identical everywhere. Ellipses below mean real values, not accepted placeholders.

```js
const { json, sha256 } = require('./support/build/ci-image-candidates/candidates.cjs');
const policy = {
  identity,                        // exact prepare identity
  mode: 'branch',                   // branch | rc | release | manual
  gitRef: 'refs/heads/develop',      // fully qualified source ref
  repository: 'qcifengineering/redbox-portal',
  tags: { runtime: 'develop', runtime_pdfgen: 'develop-pdfgen' },
  requiredChecks: expectedValidationJobsForThisWorkflow
};
const gate = {
  schemaVersion: 1,
  status: 'success',
  identity,
  policySha256: sha256(json(policy)),
  checks: verifiedJobStatuses,      // every requiredChecks entry must equal 'success'
  candidates: {
    'linux/amd64': amd64Producer.catalogSha256,
    'linux/arm64': arm64Producer.catalogSha256
  }
};
const request = {
  policy, gate,
  candidates: [
    { directory: amd64Directory, platform: 'linux/amd64', catalogSha256: gate.candidates['linux/amd64'] },
    { directory: arm64Directory, platform: 'linux/arm64', catalogSha256: gate.candidates['linux/arm64'] }
  ]
};
// Write json(request) to /tmp/promotion.json in the protected job.
```

`policy-digest POLICY.json` also computes the policy hash. This binds destinations,
source ref, mode and required jobs to the receipt. JSON property order must be
preserved when transporting policy data (hash uses the exported `json` function).

The gate contract is an **authorization boundary**, not a self-signed success
file. The protected promotion adapter's `authorize({policy, gate, fingerprint})`
must return `true` only after independently authenticating the gate's provenance,
producer catalog digests, exact revision/workflow/attempt and expected suite set.
It may query trusted CI evidence or verify an authenticated receipt. It must also
enforce the repository/ref/mode/destination allowlist. A constant `true` or a JSON
file from the preparation workspace is not a production authorization adapter.

Populate `requiredChecks` from the reviewed validation dependency list, including
all Angular matrix entries, package checks, Bruno, Mocha, Playwright, RVA, docs,
and both native image contract/startup jobs where enabled. Keep the required
`ci/circleci: test-playwright` status name. Missing suites must not become green
because a mode silently omitted them; release/RC jobs need equivalent validation.
Manual publication uses this same gate. A manual trigger does not authorize an
ungated build. The helper checks an explicit trusted list, not CircleCI YAML, so
the integrating gate is responsible for its completeness.

Suggested DAG changes for the configuration owner:

1. Native `prepare-amd64` and `prepare-arm64` produce disjoint workspace paths.
2. Each native check consumes and pins its own archive/image IDs.
3. A protected validation-complete job requires every expected suite and both
   native checks, and binds their producer roots into the authenticated receipt.
4. One protected promoter attaches both archives **after** that gate, uses fresh
   trusted helper/adapter code, receives publishing credentials, acquires the
   shared coordinator, and calls `promote`. Replace old deployment writers; all
   remaining writers must use the same coordinator and ordering authority.
5. Store the returned promotion receipt as a job artifact. It contains actual
   registry image digests, index digests and exact per-architecture membership.

## Promotion and concurrency contract

```sh
# Review locally; no registry writes or Docker needed:
node support/build/ci-image-candidates/cli.cjs plan /tmp/promotion.json

# Integration command ONLY, after providing a production authorization/coordinator adapter:
node support/build/ci-image-candidates/cli.cjs promote /tmp/promotion.json /trusted/promotion-adapter.cjs
```

The trusted adapter exports `{coordinator, authorize}`. It must come from protected
CI code, never from an untrusted workspace. The default Docker/Git/registry
adapters use existing Docker authentication; the helper never logs in or reads
credential values. Registry access belongs only to the protected promoter.

Promotion verifies all archives and the gate first, then under exclusive
coordination checks the current remote Git ref, loads and inspects all four
images, and durably reserves the publication order. It never runs `docker build`.
Annotated release/RC tags are resolved to their peeled commit. Every registry
write rechecks exclusive ownership and source-ref freshness.

Only after this does it push unique `ci-*` image tags. It records each digest
returned by `docker push` and inspects that immutable registry manifest's
`config.digest` against the verified local image ID. These two digests have
different meanings and are not interchanged. Both multi-architecture indexes
are built from `repository@sha256:...` sources and checked for the exact two
platform/digest pairs. Only after **both** indexes pass are the destination
branch/release tags pointed at their verified immutable index digests.

The coordinator interface is:

```js
await coordinator.withExclusive(repository, async lease => {
  await lease.assertHeld();
  await lease.reserve({ identity, fingerprint, destinations: ['develop', 'develop-pdfgen'] });
  // all registry writes occur inside this callback
  await lease.complete(promotionReceipt);
});
```

It must serialize the **entire callback** across every publisher for a repository.
Before allowing writes, `reserve` must atomically and durably record a high-water
mark for **each destination**, compare `(pipeline, attempt)` lexicographically,
reject lower orders, and pin same-order retries to exactly the same fingerprint.
A failed/crashed publication retains its reservation, so an older workflow cannot
overwrite it. Ownership must remain valid until every in-flight registry write
has finished. Do not use an expiring lease without fencing that the registry
actually enforces: checking a TTL before an unprotected network write is racy.

`FilesystemCoordinator` is provided for deployments with a real shared POSIX
filesystem supporting atomic `mkdir`, atomic rename and `fsync`:

```js
const { FilesystemCoordinator } = require('/trusted/ci-image-candidates/coordinator.cjs');
module.exports.coordinator = new FilesystemCoordinator({
  root: '/shared/ci-promotion-state/redbox-portal',
  scope: 'shared-posix'
});
module.exports.authorize = verifyAuthenticatedGateAndAllowedDestination;
```

The root must be the **same live filesystem** on every publisher, protected from
untrusted writers, with persistent state and no state rollback. It is not a
CircleCI workspace archive, cache restore, executor `/tmp`, or eventually
consistent object-store mount. A contending job fails closed rather than waiting.
There is no TTL or automatic lock stealing; a crash leaves a lock. Recover only
after stopping/proving termination of every old publisher, retaining the durable
watermarks, then removing the abandoned lock directory. Never remove a live lock.
If the CI environment cannot supply shared POSIX storage, implement the same
contract in an authoritative coordinator service instead. `promote` has no
uncoordinated fallback. CircleCI serial groups can reduce contention, but neither
a serial group label alone nor `git ls-remote` alone implements this durable
high-water contract.

This prevents older publications replacing newer content **when that coordinator
contract is satisfied**. Git ref freshness is a point-in-time read: a new commit
can arrive immediately afterward. The repository lock/watermark still prevents
an older publisher from overwriting a newer publisher. It does not lock Git pushes.
External writers bypassing the coordinator defeat this guarantee.

There is **no registry transaction across the runtime and PDF destination tags**.
A failure after the first final-tag write can leave one variant updated. Both
indexes were validated before either write, but atomic pair visibility is not
claimed. Retry the exact same fingerprint while current; never roll back to an
older attempt to repair a partial write. If superseded, publish the newer complete
pair. Operators should inspect the planned `ci-index-*` references and destination
digests if a failed run could not save its receipt. Workspace immutability and
unique registry tag naming also do not stop an unrelated credential holder from
overwriting candidate tags; all downstream assembly uses recorded content digests.

## Archive and transfer costs

Both targets use one `docker image save` stream per architecture, deduplicating
their common layers. Default gzip level 1 trades CPU for transfer bytes and streams
directly to the archive without an intermediate uncompressed tar. `compression:
"none"` is available for benchmarking. Loading also streams; SHA256 is checked
before decompression/loading. Peak archive disk usage is one compressed bundle,
plus loaded Docker layers and metadata, not two full variant archives. Native
asset hashing currently reads one asset file at a time; very large individual
files affect memory.

Metadata reports archive bytes and build/archive/hash/preparation milliseconds.
Record CircleCI workspace upload/download, Docker load, push/index/tag timings,
peak disk, and actual billing separately; those are not measured by the prep
timer. Two native startup jobs plus a promoter can each download the same bundle;
measure total fan-out bytes, not only upload size. Apply retention to per-attempt
workspace artifacts and `ci-*` registry tags after successful promotion; preserve
digests still referenced by retained release indexes. Do not delete the coordinator
watermarks during artifact cleanup.

This implementation has fake-adapter and local-filesystem coverage. Real native
builds/startup/PDF checks, registry compatibility, shared-storage crash durability,
CircleCI gate authentication, workflow wiring and performance/cost measurements
remain integration work. No speedup, actual publication, or distributed-safety
validation is claimed from the unit tests.
