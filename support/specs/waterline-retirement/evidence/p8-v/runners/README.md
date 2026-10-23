# OCI V qualification recipes

Run from this worktree, using the phase-zero Node24.16.0/npm11.20.0 environment.
These are the actual bounded runner overlays, not a new production deployment.
They retain stock Compose dependencies, Mocha config/bootstrap and unmodified
Bruno General requests (directories 1–4). No repository install/lock changes.

```bash
source .tmp/tx-parity-phase0/env.sh
mkdir -p .tmp/wrp8
cp support/specs/waterline-retirement/evidence/p8-v/runners/* .tmp/wrp8/
mkdir -p .tmp/wrp8/bruno-tests
# Disposable copy, including assets, helpers, configs and int-test environment:
cp -a test/bruno/. .tmp/wrp8/bruno-tests/
# General's stock runner only selects directories 1–4. In the disposable copy
# remove other top-level numbered suite directories before invoking the CLI.
find .tmp/wrp8/bruno-tests -maxdepth 1 -type d -name '[5-9] *' -exec rm -rf {} +
timeout 300 npm --prefix .tmp/wrp8/bruno-tests ci --ignore-scripts --strict-peer-deps --no-audit --no-fund
timeout 2400 bash .tmp/wrp8/run-bruno-matrix.sh
```

For the Mocha selector matrix, temporarily move `node_modules/redoc` and
`node_modules/should` to `.tmp/wrp8/held-node-modules`, as the Bruno matrix wrapper
does; restore them in an EXIT trap. This avoids Sails treating dependency `api/`
directories as application controllers, without stock runner's destructive
`rm -rf`/reinstall. Execute `timeout 900 bash .tmp/wrp8/run-portal.sh waterline`
and then the same command with `mongodb`.

Each Compose project owns fresh isolated volumes and is removed by its EXIT
trap. Pinned Mongo9, Node24 and memory limits support OCI ARM64. The app runs
compiled current core plus source/config; loader regenerates shims. The overlay
omits unrelated webpack, nyc and install steps. General's companion/schema env
and pinned Keycloak26.5.6 are retained; Solr uses the locally present Mocha-base
digest. Logs/results remain under ignored `.tmp/wrp8`; compact counts and hashes
are in the parent verification manifest. Never use these recipes against an
institution deployment or unrelated development containers.

`run-qualification.sh` renews contract/prior-image checks and calls `run-index.sh`
on the separately owned `wrp8-815a2a6e` Mongo project (`mongo.yml`, random loopback
port). Its index fixture resets only that task container's `redbox-portal` and
`redbox-storage` namespaces; contract/prior data uses `wr_p8_contract18`. The
long-lived multi-database rehearsal uses1536MiB for Mongo plus mongosh DDL;
WiredTiger stays0.25GiB. Create it with `timeout 120 docker compose -p
wrp8-815a2a6e -f .tmp/wrp8/mongo.yml up -d --wait`, and remove it afterward with
`timeout 90 docker compose -p wrp8-815a2a6e -f .tmp/wrp8/mongo.yml down -v
--remove-orphans --timeout 30`. Do not run the prior-image step without first
building the designated manifest's pre-V source snapshot/recipe.

After the independent V default promotion, `timeout 2400 bash
.tmp/wrp8/run-promotion.sh` clears both V environment overrides, runs the packaged
live contract/default rollback cases, full core plus isolated startup, fresh
installed-index rehearsal and the affected fresh portal Mocha suite. The portal
helper accepts `default` to leave the V variable unset; the core live fixture
omits the V group key entirely, rather than supplying an explicit backend.
