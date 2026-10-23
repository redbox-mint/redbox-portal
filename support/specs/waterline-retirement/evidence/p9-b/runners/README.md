# OCI B qualification recipes

Use this worktree's Node24.16.0/npm11.20.0 environment. Run heavy commands
sequentially under the shown external timeouts. All Mongo containers use the
pinned 9.0.4 digest and standalone topology. Never use unrelated development
containers/volumes or fixed deployment ports.

```bash
source .tmp/tx-parity-phase0/env.sh
mkdir -p .tmp/wrp9
cp support/specs/waterline-retirement/evidence/p9-b/runners/* .tmp/wrp9/
timeout 180 docker compose -p wrp9-815a2a6e -f .tmp/wrp9/mongo.yml up -d --wait
B_RUN_LABEL=one_qualification timeout 300 bash .tmp/wrp9/run-contract.sh one
B_RUN_LABEL=split_qualification timeout 300 bash .tmp/wrp9/run-contract.sh split
timeout 900 bash .tmp/wrp9/run-operations.sh
timeout 300 bash .tmp/wrp9/run-prior.sh
timeout 900 bash .tmp/wrp9/run-index.sh
```

Contracts require fresh namespaces; change B_RUN_LABEL and the matching
operations/prior URLs for repeated runs. The contract checkpoints, BSON EJSON
backup and external asset-byte snapshots are written under .tmp/wrp9. The restore
probe copies both B namespaces and their indexes into isolated targets, then
checks unavailable assets refuse restore before reinstating matching bytes.
It is a stopped synthetic B checkpoint, not a complete institution backup.

Build the designated pre-B artifact before changing installed dist: copy the
installed root/internal package dependencies and compiled packages using
prepare-prior.py, place Dockerfile.prior at .tmp/wrp9/prior/Dockerfile, then run
`timeout 600 docker build -t wrp9/prior:5afe0957c .tmp/wrp9/prior`. Record the source,
image ID, architecture and log hash. This is a local installed ARM64 snapshot,
not a clean production-pruned/private portal image. The prior runner mounts only
the current probe scripts and checkpoint into that immutable image.

The self-cleaning packaged two-layout runners are:

```bash
timeout 900 npm --prefix packages/redbox-core run test:branding-transition
timeout 1500 npm --prefix packages/redbox-core run test:branding-operations
```

Portal/API overlays retain stock Mocha config/bootstrap and unmodified Bruno
General requests in directories1–4, stock General Keycloak26.5.6 and the Mocha
base Solr digest. They omit unrelated frontend/nyc/install steps. For Mocha and
Bruno, temporarily move node_modules/redoc and node_modules/should into the
wrp9 held-node-modules directory and restore in an EXIT trap, as the supplied
run-bruno-matrix wrapper does. This avoids Sails controller discovery under
these dependency api directories without destructive reinstall.

Copy test/bruno into .tmp/wrp9/bruno-tests, remove other numbered top-level suite
directories5–9 in that disposable copy, and install its exact locked CLI with
npm11.20.0. The runner may reuse a copied previously installed exact-lock CLI;
never modify the repository lock/dependencies for the rehearsal.

```bash
timeout 900 bash .tmp/wrp9/run-portal.sh waterline
timeout 900 bash .tmp/wrp9/run-portal.sh mongodb
timeout 2400 bash .tmp/wrp9/run-bruno-matrix.sh
```

Each portal project has its own EXIT cleanup trap. The persistent B-only Mongo
project is removed explicitly with `timeout 90 docker compose -p wrp9-815a2a6e
-f .tmp/wrp9/mongo.yml down -v --remove-orphans --timeout 30`. Record anonymous
volume IDs before removal. Remove the task image and each exact task-created
BuildKit cache ID after the prior archive's checksum is recorded. Never use a
broad/global prune. Stop only P9's unused Mongo containers during the source
startup-import check if they contend for the two available CPUs; its internal
12000ms deadline remains unchanged.

P9.6 omitted-selector qualification (after the separate default change):

```bash
timeout 2400 bash .tmp/wrp9/run-promotion.sh
```

The packaged runner checks both physical layouts, each with42 contract plus six
omitted-default/poisoned-model/Waterline-rollback/restart cases. The promotion
wrapper keeps idle task Mongo containers stopped during source startup, then
starts only those containers for installed CLI checks and stops them again
before fresh default portal Mocha. Do not run it alongside another heavy command.
The prior context was captured before B implementation, from the compiled
5afe0957c source and its installed ARM64 dependencies. Do not label a current B
dist copy as that prior artifact; use the recorded retained archive/load command.

Final promoted-HEAD core matrix, after Docker cleanup:

```bash
timeout 1500 bash .tmp/wrp9/run-final-core.sh
```

Both explicit selectors run the full core selection and isolated unchanged
startup check. The command creates no Docker resources.
