# Standalone shared web asset pilot

`pilot.cjs` is opt-in orchestration around the existing [producer/restore
contract](README.md). It changes no CircleCI configuration or publication policy.
`produce` builds assets; `prepare` restores them and writes a Docker build plan.
Neither command invokes Docker, publishes images, selects a production image,
cleans Docker resources, or contacts CircleCI. No dependency is added.

Use trusted helper code, a clean disposable checkout of the **full resulting
revision** (including any dependency-refresh commit), and the exact Node/npm
selection required by the existing helper. Production currently selects Node 24
for assets; Docker selects Node 26 for backend/runtime. The consumer's validator
needs the existing root TypeScript dependency. The producer also needs the
existing npm/Bash/nvm build prerequisites. Hosts must be native Linux AMD64 or
ARM64; the requested `platform` must match the executing host.

All paths must be absolute. Each `output` must be a new, nonexisting directory
outside the checkout and input artifact/receipt, with an existing trusted parent.
Use separate producer and consumer outputs per revision/workflow/attempt/native
job/target. Inputs and outputs must have a single trusted writer. Filesystem modes
prevent accidental edits, not malicious replacement by their owner.

## Produce once

Create a request outside the checkout; replace these example values with the
independently selected project, source and workflow identity:

```json
{
  "optIn": true,
  "identity": {
    "project": "gh/researchdatabox/redbox-portal",
    "revision": "0123456789abcdef0123456789abcdef01234567",
    "pipeline": 123,
    "workflow": "12345678-1234-1234-1234-123456789abc",
    "attempt": 1
  },
  "root": "/tmp/pilot-producer-source",
  "output": "/tmp/pilot-producer-123-attempt-1",
  "platform": "linux/amd64"
}
```

```bash
node support/build/ci-web-assets/pilot.cjs produce /tmp/pilot-produce-request.json
```

Build logs go to stderr; success stdout contains absolute `artifact` and `receipt`
paths plus `receiptSha256`. Transfer the artifact directory and receipt unchanged.
Keep **the stdout receipt checksum in a separate trusted channel**. The wrapper
does not authenticate CI API identities: the protected caller supplies and
authenticates them. A receipt plus a freshly computed hash from an untrusted
workspace is not an independent trust anchor. These hashes are not signatures.

The read-only receipt binds project, revision, pipeline, workflow, attempt, actual
producer architecture, wrapper implementation, descriptor checksum, manifest
checksum and the existing source/toolchain key. No new payload inventory is used.

## Prepare on each native architecture

Create another request using the **same independently expected `identity`** plus
these fields (the example is for a separate native ARM64 consumer):

```json
{
  "optIn": true,
  "identity": {
    "project": "gh/researchdatabox/redbox-portal",
    "revision": "0123456789abcdef0123456789abcdef01234567",
    "pipeline": 123,
    "workflow": "12345678-1234-1234-1234-123456789abc",
    "attempt": 1
  },
  "root": "/tmp/pilot-arm64-source",
  "output": "/tmp/pilot-consumer-123-attempt-1-arm64-runtime",
  "platform": "linux/arm64",
  "artifact": "/tmp/attached-producer/artifact",
  "receipt": "/tmp/attached-producer/receipt.json",
  "receiptSha256": "REPLACE_WITH_INDEPENDENT_TRUSTED_PRODUCER_STDOUT_CHECKSUM",
  "producerPlatform": "linux/amd64",
  "target": "runtime"
}
```

```bash
node support/build/ci-web-assets/pilot.cjs prepare /tmp/pilot-consume-request.json
```

Use identical identity, Node/npm and supported build flags on the consumer.
`prepare` checks the receipt anchor, expected workflow/architecture and descriptor,
then delegates clean-source/toolchain/archive/payload verification to `restore`.
It writes only to the new output, preserving source assets. Success stdout points
to `plan.json` and `web-assets/`, and includes `planSha256`. A required workspace
miss fails the command; there is no rebuild or local-assets fallback. Every error
returns 1 without a success record. Failed attempt directories remain reserved;
use a new path after repairing the producer or inputs.

Review `plan.json`. Its `invocation` contains `command`, `args`, `cwd`, and
`shell: false` for a separately authorized runner using `spawn`/`spawnSync`.
Never join the argument array into shell code or use `eval`. The plan selects
`WEB_ASSETS=shared`, the exact revision and trusted manifest checksum, and
`--build-context web-assets=...`. It exports only an OCI archive inside its output;
it supplies no image tag, `--push`, `--load`, credentials, arbitrary build args or
publication steps. Commas in output paths are rejected because Docker exporters
parse CSV. Supported targets are `runtime`, `runtime_pdfgen`, `test`,
`integration_mocha`, and `integration_playwright`.

Keep source/stage/plan unchanged until invocation and select a genuinely native
builder separately; a local host check does not attest a remote BuildKit daemon.
The existing Docker consumer revalidates the trusted manifest on import and after
copying. A prepared plan alone is not evidence of a successful native image,
startup, test suite, or publication authorization.

## Validation still required

Run the offline synthetic unit/CLI suite with:

```bash
node --test support/build/ci-web-assets/pilot.test.cjs
```

It uses small real Git checkouts, the existing producer/archive/restore validator,
and a synthetic builder; it runs no npm install, Angular build, Docker or CI jobs.
Native AMD64 **and** ARM64 production compilation, native image builds/startup,
PDF and integration checks, and cold-versus-shared byte/runtime comparisons remain
required. Cross-Node 24 producer versus Node 26 backend/runtime compatibility and
output equivalence remain unverified. Fixture tests select their executing Node
version and establish none of those production claims. CircleCI transfer/cost,
cache behavior and publication integration are outside this standalone pilot.
