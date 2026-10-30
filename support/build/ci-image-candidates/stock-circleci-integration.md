# PR3 integration with stock CircleCI

These additions implement producer provenance verification and a registry-backed
reservation journal. **They do not implement a production coordinator.** Keep
`promote` disabled until a genuine coordinator satisfying the existing contract
is supplied. No existing publishing script, Dockerfile, or CircleCI job is changed.

Stock CircleCI can run native preparation, persist the two candidate bundles,
store their receipts, and execute read-only `plan` now. Stock serial groups plus
standard OCI Distribution do **not** establish the existing `withExclusive`
contract for mutable destination tags, including cancellation and crash cases.
This is a technical limitation, not a request to waive the promotion gate.

## What is implemented

| File | Purpose |
| --- | --- |
| `circleci-producer-receipt.cjs` | Reverify an actual prepared bundle against current CI identity, then emit a producer receipt for CircleCI artifact storage. No Docker/registry writes. |
| `circleci-authorize.cjs` | Read exact workflow/pipeline/job identities and successful statuses independently; authenticate each catalog root using its exact producer job artifact. Exports an authorization function usable by the existing promoter. |
| `registry-watermark.cjs` | Real OCI Distribution GET/tag-list/PUT operations and append-only reservations with per-destination high-water checks. Does not export `withExclusive`, `assertHeld`, or a lease. |

Only tests use mocks. Neither an in-memory coordinator nor a check-then-write
registry tag is offered as a distributed authority.

## Why serialization and a watermark are insufficient on their own

CircleCI's [configuration reference](https://circleci.com/docs/reference/configuration-reference/#serial-group)
says that when no group is waiting/running, a lower pipeline number can start,
including a rerun of an older workflow. Its
[serial-group guide](https://circleci.com/docs/guides/orchestrate/controlling-serial-execution-across-your-organization/)
says cancellation releases the lock and starts the next job, documents a manual
**Release serial group** action, and says failed jobs cannot retain their lock.
The public job metadata does not prove that no operator released a group.

A durable watermark fixes the *idle older rerun* problem when every writer uses
it. It does not fence an accepted registry request:

1. Pipeline 20 reserves its order and submits a final destination-tag PUT.
2. CircleCI cancels the job, releasing the group. The registry may still process
   that already accepted request; killing Docker/client processes is no proof of
   server-side completion or cancellation.
3. Pipeline 21 reserves its order and publishes its final destination tags.
4. The old PUT finishes afterward, replacing one destination with pipeline 20.

Both pipelines may build the *same current Git commit*. Every remote-ref check
can pass. The journal still correctly says 21, while the final tag contains 20.
The cancellation counterexample is executable in `registry-watermark.test.cjs`.
It assumes no manual release and still demonstrates the missing guarantee.

A mutable single `ci-high-water` tag has an additional flaw: a delayed old PUT
can overwrite the watermark itself. The implementation instead appends one
content-addressed reservation tag and enumerates all retained records. A delayed
lower append cannot lower the maximum. This protects the journal, **not final
image-tag writes**. Standard Distribution provides no promised compare-and-swap
or fencing operation for a tag PUT; sending `If-Match` without a verified registry
contract is insufficient. A second read before writing also leaves the same gap.

## Configuration owner's patch sequence

1. Introduce native AMD64/ARM64 preparation on deploy-eligible branches/tags.
   Build `runtime` and `runtime_pdfgen` together using existing `cli.cjs prepare`.
   Use a pristine source-only checkout and output outside the Docker context.
   Keep preparation free of publishing credentials. Preserve the validated source
   revision after Dependabot refresh; if it differs from the pipeline revision,
   start validation/preparation in the refreshed commit's pipeline.
2. In each producer, load and verify its bundle and run **all** native runtime,
   hook-content, dependency, HTTP-asset, startup and Chromium/PDF checks. Generate
   the receipt only after those commands succeed. Run shell commands with normal
   failure propagation; never upload a success receipt through `when: always`.
3. Persist both existing, disjoint `v1/<revision>/<pipeline>/<workflow>/1/<arch>`
   directories. Store receipts as separate CircleCI job artifacts as shown below.
   A receipt in the attached workspace does not authenticate a catalog.
4. Keep the complete `validation-complete` dependency list, adding both native
   producer jobs. Expand Angular matrix jobs into distinct exact API job names in
   the reviewed authorization policy; a matrix alias such as `test-angular` does
   not authenticate 19 concrete jobs. Preserve `ci/circleci: test-playwright`, all
   coverage/JUnit handling, RVA, and docs. Define equivalent gates for branch,
   RC, release, and manual modes. The existing `docker_manual_publish` graph is
   not this gate and must be replaced before candidate promotion is enabled.
5. Add a protected promoter after the gate that can run `plan` without registry
   writes. Load its helper and trust config from independently protected code,
   not the candidate workspace or arbitrary source checkout. Pin/approve the
   exact source **and compiled** pipeline configuration; keep its approved digest
   outside that pipeline's request/artifacts. Independently derive the expected
   source/destinations/mode/suite list and current promoter identity.
6. Before enabling writes, establish the prerequisites below and replace **every**
   old branch, release, RC, architecture, manifest, and manual publisher. All
   writers affecting this repository must share one project ordering stream,
   one registry journal and one real authority. Do not keep a manual bypass.
   Use one serial group for the entire promotion job, never individual build/run
   steps. Do not release a live serial group manually. These measures supplement
   the authority; they are not its implementation.

Use these environment entries in both producer and promoter job definitions;
these explicit injected pipeline values avoid assuming an undocumented built-in
pipeline number or ID:

```yaml
environment:
  REDBOX_CIRCLE_PIPELINE_NUMBER: << pipeline.number >>
  REDBOX_CIRCLE_PIPELINE_ID: << pipeline.id >>
```

For the AMD64 producer, after successful native checks, add `platform` to the
prepare result and emit its independently retrievable receipt:

```sh
# /tmp/prepare-amd64-result.json is stdout from cli.cjs prepare.
node - <<'NODE'
const fs = require('node:fs');
const result = JSON.parse(fs.readFileSync('/tmp/prepare-amd64-result.json', 'utf8'));
fs.writeFileSync('/tmp/prepare-amd64-verified.json', JSON.stringify({ ...result, platform: 'linux/amd64' }));
NODE
mkdir -p /tmp/ci-provenance
node support/build/ci-image-candidates/circleci-producer-receipt.cjs \
  /tmp/prepare-amd64-verified.json > /tmp/ci-provenance/amd64.json
```

```yaml
- store_artifacts:
    path: /tmp/ci-provenance/amd64.json
    destination: ci-provenance/amd64.json
```

Use the analogous `arm64` paths/platform in the other producer. Keep producers
nonparallel (`parallelism: 1`); the verifier requires artifact `node_index: 0`.
Confirm the returned artifact `path` in the pilot and pin that exact path in
`trust.producers`; do not select `latest`, a branch artifact, or a user URL.
The receipt CLI requires `CIRCLE_WORKFLOW_JOB_ID`, `CIRCLE_WORKFLOW_ID`,
`CIRCLE_BUILD_NUM`, `CIRCLE_SHA1`, and the usual project environment. Missing or
mismatched identity fails. It fixes `attempt: 1`.

The eventual whole-job invocation should carry a stable repository key such as
`serial-group: redbox-portal/image-promotion-v1`. Do not include workflow,
pipeline, mode, branch, or target in that key. Adding it to all old parallel
publish jobs does not turn separate architecture pushes/manifests into one
protected callback. Retire those jobs when switching authority.

## Authenticated gate adapter

Construct the read client and authorization function in protected adapter code:

```js
const { CircleCIReadClient, createCircleCIAuthorizer } = require('/trusted/ci-image-candidates/circleci-authorize.cjs');
const client = new CircleCIReadClient({
  // Optional for public reads; required when this project's endpoints deny them.
  token: protectedReadToken,
  artifactOrigins: approvedArtifactAndCDNOrigins,
  authenticatedArtifactOrigins: approvedCircleCIArtifactOriginsRequiringToken,
});
const authorize = createCircleCIAuthorizer({ client, trust: independentlyApprovedTrust });
// authorize is concrete; a production coordinator is still required separately.
```

`independentlyApprovedTrust` must contain:

```js
{
  projectSlug: 'gh/redbox-mint/redbox-portal',
  projectId, pipelineId, workflowId, workflowName, promoterJobNumber,
  configurationSha256, // sha256(json({ source: approvedSource, compiled: approvedCompiled }))
  policy,             // full reviewed policy from README.md, including exact identity
  producers: {
    'linux/amd64': { name: 'prepare-amd64', artifactPath: 'ci-provenance/amd64.json' },
    'linux/arm64': { name: 'prepare-arm64', artifactPath: 'ci-provenance/arm64.json' },
  },
}
```

Static project IDs, protected repository URLs/destinations and approved
configuration digests are policy. Pipeline/workflow/promoter job IDs come from
the protected current job; expected revision/ref come from its trusted CI/Git
identity and protected destination rules. Do not copy those values from the
promotion request to make the policy compare equal. Deriving the approved
configuration digest from the fetched configuration under review would also be
self-approval. Dynamic setup configuration is rejected until its provenance can
be authenticated. Configuration approval must account for parameters and orb
expansion; unsupported responses fail closed.

The public [v2 OpenAPI](https://circleci.com/api/v2/openapi.json), inspected on
2026-10-31, documents `/jobs/{job_id}` with independent `project_id`, `pipeline_id`,
`workflow_id`, `name`, `status`, and optional `job_number`/`type`. This adapter
requires all those fields, plus the paginated workflow job list. No fallback
authenticates a job by name/status alone. Missing optional fields or inaccessible
endpoints block authorization pending compatibility verification.

The same inspected schema does **not** expose artifact listing. The implementation
uses the documented [v1.1 job artifact endpoint](https://circleci.com/docs/api/v1/index.html#artifacts-of-a-job)
for that part; it does not pretend this evidence comes from v2. It checks the
exact job number, path, platform, catalog digest and complete producer identity.
API redirects are rejected. Artifact redirects are followed only through exact
independently approved HTTPS origins, for at most five requests. API tokens are
sent only to explicitly approved authenticated artifact origins, never forwarded
to a signed CDN redirect. No URL, signed query, or credential is logged.

Authentication establishes the following chain:

`approved pipeline config/source + exact successful native job -> its job artifact
-> catalog SHA256 -> metadata/archive checksums -> loaded image IDs/labels ->
pushed registry config digest -> exact architecture digests in both indexes`.

The last four steps are enforced by the existing candidate verifier/promoter.
The producer's code and source still need the stated trust boundary: a CircleCI
artifact of arbitrary untrusted code is not proof of a valid image. Protect CI
configuration, contexts and source refs, disable publishing credentials on forks
and SSH debug reruns, and never authorize using a self-declared success file.

## Reruns and ordering

V2's `auto_rerun_number` is only an **automatic** rerun counter. It is not a
global attempt allocator for manual/full/partial reruns. This adapter therefore
accepts `attempt: 1` only, reserving the whole pipeline number once. The fingerprint
binds workflow ID, destinations, exact suite set and both catalogs.

An exact same-workflow/same-fingerprint retry is idempotent. A full rerun under the
same pipeline has a different workflow/fingerprint and cannot replace an existing
reservation. A partial rerun inheriting a check/producer from another workflow is
rejected by that job's independent `workflow_id`. A rerun can be considered only
if it supplies every check freshly within its own workflow and no conflicting
pipeline reservation exists. Prefer a **new pipeline** with fresh validation and
both producers for repairs/rebuilds; never fabricate an attempt from per-job build
numbers or accept an operator override to the watermark.

## Registry prerequisites and remaining authority blocker

The journal requires an already provisioned registry repository with:

- Support for exact-byte OCI empty indexes and annotations, manifest GET/PUT,
  complete paginated tag enumeration, strongly consistent reads/listing, durable
  writes, and acknowledged SHA256 content digests.
- Immutable `ci-watermark-v1-*` tags and retention that never deletes reservation
  tags or the initialization marker. No state rollback, backup restore to an
  earlier inventory, or other writer allowed to delete/rewrite journal state.
  A project-scoped single ordering stream must be preserved across CI migration.
- A deliberate audited initial seed of `markerManifest(canonicalRepository)` at
  exported `MARKER`, **after** stopping old publishers and recording/migrating
  any existing ordering floor. The helper never bootstraps or resets state on
  404. Restoring only the marker while deleting history is undetectable; prevention
  must be enforced by registry access/retention policy. The marker is not a backup.
- Registry-scoped credentials usable by `DistributionWatermarkStore` (injected
  Authorization value; token negotiation is not implemented). The store repository
  path must match the canonical registry repository in every record. Docker login
  alone does not automatically supply HTTP API bearer authorization to this helper.

Each reservation is one index covering **both destinations**, committed before
publication and retained even on failure. Reads inspect all records, validate
content-derived tag names, reject conflicting same-order fingerprints, and take
the maximum `(pipeline, attempt)` per destination. No completion flag lowers the
watermark. No unsafe journal compaction is supplied; enumeration grows with
retained attempts and must be measured before adopting this backend.

The **remaining blocker** is exclusive ownership until all accepted registry
writes have finished. A standard CircleCI serial group cannot be adapted to the
existing lease contract simply by polling job status. With no new service, a
possible future implementation needs an **existing registry's documented and
tested server-side fencing or atomic conditional tag mutation with non-ABA
version semantics**, applied to every mutable destination write, together with
durable ordering. Such semantics are vendor-specific, are not established here,
and require an adapter/compatibility pilot before enabling promotion. Alternatively
use genuinely shared persistent POSIX storage with the existing no-steal
coordinator, or a real authority that drains/fences in-flight writes. Executor
`/tmp`, CircleCI workspaces/caches and advisory expiring locks do not qualify.

No credentials, registry provider guarantees, protected CI trust config, or real
authority were supplied for this task. The safe deliverable is therefore
preparation/artifact authorization/journaling plus a **blocked write integration**.
Do not attach `RegistryWatermark` to `coordinator` or bypass the existing required
`withExclusive` check. The two final variant tags are also not a registry
transaction; the existing partial-pair recovery rules still apply.

## Verification

```sh
node --test support/build/ci-image-candidates/*.test.cjs
```

New tests use public API response shapes and OCI HTTP semantics without network
requests. They exercise paginated inventories, unavailable/corrupt state,
job-number/ID/project/workflow mismatches, inherited partial reruns, fork origins,
unapproved configurations, missing/duplicate suites/artifacts, substituted catalog
roots, archive corruption, API failures and status changes, protected redirect
authentication, stale idle reruns, overlapping reservations, conflicting rebuilds,
and the canceled publisher's delayed final-tag counterexample. Existing tests
exercise loaded image identity, push config digest, exact index membership and
remote Git freshness. No real registry writes or publication occurred.

After prerequisites are met, the owner must still validate expanded CircleCI
config for every mode, verify actual API fields/artifact paths and registry
capabilities in a controlled namespace, run real native startup/PDF checks, and
fault-inject cancellation at accepted PUT boundaries. Retain all required suites
and reports. No performance improvement or live distributed safety is claimed by
these mocked tests.
