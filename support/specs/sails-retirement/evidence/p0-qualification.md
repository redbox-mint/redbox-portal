# SR-005 — Database candidates and institution rehearsal scope

Recorded 2026-10-23 on Linux amd64 in
`/home/andrew/src/github/redbox-portal`, branch `stack/sails-retirement`.
The integrated source baseline is `a49366803164429f9d8bdd249dadcdf856c9d13e`.
The tested P0 execution/configuration changes are recorded in
`2f5f5490ecda30114d8bb1a628bbced16d6c75a0` and
`3f62c46e1bca755075ccfd556b80d2acb78aab70`; these checks ran during preparation
of those commits. The persistence regression test source is unchanged from the
baseline. This is foundation evidence, not a standalone application qualification.

## Exact candidate matrix and observed coverage

Select **MongoDB 8.0.34 / FCV 8.0** and **MongoDB 9.0.4 / FCV 9.0** as the P0
qualification candidates. Execution uses **Node 26.11.1 / npm 11.20.0**, the
existing exact `@prisma/orm-mongo@8.0.0-rc.19` and `prisma@8.0.0-rc.24` pair,
Docker **29.6.1** and Compose **5.2.0**. No dependency changes were made here.

| Engine / FCV | Topology and datastore placement | Actual result / remaining coverage |
| --- | --- | --- |
| 8.0.34 / 8.0 | One unauthenticated standalone, two logical databases on the same server | Existing persistence regression: **30 passing, 0 failing, 0 pending**, 26 seconds. `logs/persistence-mongo8.log`, `mongo8-info.json`. |
| 9.0.4 / 9.0 | One unauthenticated standalone, two logical databases on the same server | Existing persistence regression: **30 passing, 0 failing, 0 pending**, 10 seconds. `logs/persistence-mongo9.log`, `mongo9-info.json`. |
| 8.0.34 / 8.0 and 9.0.4 / 9.0, separately | `mongodb` and `redboxStorage` on distinct servers of the same selected engine/FCV | Candidate coverage required before release; **not executed here**. Both datastores, connection/index ownership, distinct credentials and byte stores must be exercised. |
| 8.0.34 / 8.0 and 9.0.4 / 9.0, separately | Replica set, including primary change and reconnect/drain behavior | Candidate coverage required if present in the designated institution/deployment scope; **not executed here**. A one-member replica set would not prove failover. Exact member count, TLS/auth and deployment parameters await the cohort inventory. |
| Institution's exact source/target engines and FCVs | Its actual server placement, session/queue/storage connections and authentication | **Not designated or tested.** Do not generalize standalone results to this row. |

Immutable identifiers observed through `docker image inspect`:

- Mongo 8 image: `mongo:8.0.34`, repository digest/image ID
  `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`.
- Mongo 9 image: `mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8`.
  Inspecting the short `mongo:9.0.4` tag failed because this checkout had pulled
  only the digest reference; inspecting that exact image ID succeeded. The
  running server and FCV were queried directly, not inferred from a tag.

The actual suite supplies `PERSISTENCE_TEST_MONGO_URL` and uses
`redbox_prisma_p0` plus `redbox_prisma_p0_storage`. It exercises existing
repository/native-resource contracts, index inspection, session-store ownership,
concurrency and shutdown/restart fencing. It constructs the existing structural
owner (typed as `Sails.Application`) and includes legacy global collaborators in
individual tests. It does **not** start a portal, extract an application runtime,
or prove the SR-009 record-type graph. No existing test was rewritten or skipped.
The suite drops only its disposable databases after completion.

## Commands actually run

The two disposable database containers used 768 MiB limits, dynamic localhost
ports and a 0.25 GiB WiredTiger cache. Their inspected commands, limits and port
bindings confirmed this setup. Mongo 8's existing local `8.0` image was also
tagged `8.0.34`; the live version check confirmed the exact patch.

```sh
docker run -d --name sr-p0-mongo8 --memory=768m -p 127.0.0.1::27017 mongo:8.0.34 --bind_ip_all --wiredTigerCacheSizeGB 0.25
docker run -d --name sr-p0-mongo9 --memory=768m -p 127.0.0.1::27017 mongo:9.0.4@sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8 --bind_ip_all --wiredTigerCacheSizeGB 0.25
docker port sr-p0-mongo8 27017/tcp
docker port sr-p0-mongo9 27017/tcp
docker exec sr-p0-mongo8 mongosh --quiet --eval 'print(JSON.stringify({version:db.version(),fcv:db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion,hello:db.hello()}))'
docker exec sr-p0-mongo9 mongosh --quiet --eval 'print(JSON.stringify({version:db.version(),fcv:db.adminCommand({getParameter:1,featureCompatibilityVersion:1}).featureCompatibilityVersion,hello:db.hello()}))'
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34897/redbox_prisma_p0 npm --prefix packages/redbox-core run test:persistence
PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34898/redbox_prisma_p0 npm --prefix packages/redbox-core run test:persistence
docker inspect sr-p0-mongo8 sr-p0-mongo9 --format '{{.Name}} memory={{.HostConfig.Memory}} networks={{json .NetworkSettings.Networks}}'
docker image inspect mongo:8.0.34 mongo:9.0.4 mongo:7.0.43-jammy --format '{{json .RepoTags}} id={{.Id}} digests={{json .RepoDigests}}'
docker image inspect sha256:dc28ed5a9d0fc616903c3f463bb1e53b92b49f441721b91926e87d90bf957ce8 --format '{{.Id}} {{json .RepoDigests}}'
```

Both `test:persistence` commands exited **0**. The metadata files retain the
first live version/FCV/hello observations, at `09:05:16Z` and `09:06:09Z`.
Repeating the same live queries at `09:24:12Z` confirmed the versions/FCVs and
standalone topology before cleanup. `hello` contains no replica-set identity;
the containers were not launched with `--replSet`.

## Institution cohort, access gaps and release source

**SR-005 is partial and remains unchecked.** A real representative institution
hook/configuration and supported production upgrade source have not been
designated. Repository defaults, bundled hooks and the demo hook are available;
they are not evidence of institution behavior. Do not invent an institution or
copy private deployment material into this repository.

The orchestrator/institution owner must supply or designate:

- The institution and approved owner of the rehearsal, exact hook/app commit or
  packed artifact, service/controller overrides, imperative config contributors,
  custom forms/workflows and assets. Use a sanitized fixture or keep sensitive
  material in an institution-owned location with an approved access method.
- The supported **production** source release and image digest, source Node,
  Mongo engine/FCV/topology and the matching hook/configuration artifacts. The
  released **v5.0.4** source
  `c1dda53999f3b026347008731f33dba834e06c27` and digest tested in
  [SR-003](p0-released-v5.md) are a reproducible public-behavior reference and
  candidate source, not an institution support designation. The Sails-plus-Prisma
  branch is an intermediate comparison, not a production upgrade starting point.
- Actual `datastores.mongodb` and `datastores.redboxStorage` placement, including
  separate-server deployments; independent `redboxSession.mongoUrl`, Agenda
  `options.db`/Mongo or SQS backend, storage-hook/GridFS connections and binary
  locations. Record shared versus separate pool ownership without logging secrets.
- TLS/auth, replica-set members/read/write settings, proxy/root path, identity
  providers, session/cookie settings, upload/socket paths and external publishers.
  Local synthetic auth cannot qualify the institution's OIDC/AAF behavior.
- An isolated rehearsal target, consistent approved data/binary checkpoint,
  recovery artifacts, external-effect reconciliation point and acceptance owner.
  SR-003's credential-stripped logical fixture is not this recovery checkpoint.

Full integrated host/image/topology coverage and actual upgrade/recovery results
remain SR-045–SR-049. Missing institution access prevents completion of the
cohort designation now; it is not a conditional test skip or a claim that those
later release tasks have passed. Local Docker/network access was available.

## Separate operator prerequisites for engine and FCV

The application must not silently upgrade the Mongo engine, raise FCV or convert
topology. Before a rehearsal, the operator must identify the starting engine/FCV,
confirm the vendor-supported upgrade sequence and driver compatibility for each
server, stop/drain writers and preserve a consistent recoverable checkpoint.
Perform any required engine upgrade and health checks separately from the
application change; changing FCV is a separate deliberate operator step after
checking that upgrade's prerequisites. Do not assume a direct 7-to-9 upgrade.

Record actual engine/FCV after each approved step, including both servers when
datastores are split, and validate recovery with matching binaries/configuration.
Follow [the existing index preparation procedure](../../../wiki/Persistence-Index-Preparation.md)
for offline inspect/reviewed ensure; index preparation does not upgrade the engine
or repair documents. Replica-set conversion, transactions and PostgreSQL are not
implied prerequisites for this task. A major-version guard supplies no topology,
institution or recovery qualification.

## Owned test-resource cleanup

Before removal, mounts were inspected: Mongo and Solr used seven disposable
anonymous volumes; portal/browser mounts were only the explicit synthetic config
and checkout binds. No institution volume or unrelated Docker resource was
removed. Commands actually run after all captures:

```sh
docker inspect sr-p0-mongo7 sr-p0-mongo8 sr-p0-mongo9 sr-p0-solr sr-p0-v5 sr-p0-v5-browser --format '{{.Name}} mounts={{json .Mounts}}'
docker network inspect sr-p0-baseline --format '{{range .Containers}}{{.Name}} {{end}}'
timeout 55 docker stop --timeout 20 sr-p0-mongo7 sr-p0-mongo8 sr-p0-mongo9 sr-p0-solr
docker inspect sr-p0-mongo7 sr-p0-mongo8 sr-p0-mongo9 sr-p0-solr sr-p0-v5 sr-p0-v5-browser --format '{{.Name}} status={{.State.Status}} exit={{.State.ExitCode}} finished={{.State.FinishedAt}}'
timeout 55 docker rm -v sr-p0-v5-browser sr-p0-v5 sr-p0-mongo7 sr-p0-mongo8 sr-p0-mongo9 sr-p0-solr
docker network rm sr-p0-baseline
docker ps -a --filter name=sr-p0 --format '{{.Names}} {{.Status}}'
docker network ls --filter name=sr-p0-baseline --format '{{.Name}}'
```

Stop/removal/network commands exited **0**. The Mongo processes exited **0**;
Solr exited **143** on termination. The already-stopped released portal and
browser had exited **0**. Stop completed without the 55-second wrapper expiring;
these observations are not a dedicated application drain/failure test. Final
container/network listings were empty. Python `Path.unlink()` removed the raw
temporary Bruno reporter `/tmp/sails-retirement-v5-bruno-results.json`, which
contained synthetic request/session material. The browser storage directory
`.tmp/sails-retirement/v5-fixtures/.tmp/playwright/storage/` contained **zero JSON
auth-state files** after cleanup. Sanitized committed summaries remain available.

## P0 evidence closeout checks

The final documentation/fixture checks used **Python 3.12.3** and the same exact
Node 26 toolchain, with no portal/database suite rerun after cleanup:

```sh
python3 --version
python3 support/specs/sails-retirement/evidence/verify-v5-fixture.py
PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH" node --check support/specs/sails-retirement/evidence/capture-v5-fixture.js
git diff --check
```

All exited **0**. The fixture validator reports **13 collections / 123 documents,
4 role links / 9 workflow-form links, zero credential keys and 52 sanitized email
values**. An additional inline Python check parsed **12 evidence JSON files**,
resolved **9 local Markdown link targets**, compared all **12 selected request
hashes** with `git show v5.0.4:<file>`, and compared the task-list suffix against
`a49366803164429f9d8bdd249dadcdf856c9d13e`: **P1 onward is byte-for-byte unchanged**.
Only SR-001–SR-004 are checked; SR-005 remains unchecked. No P1 implementation was
started. The pre-existing untracked GraphQL specification directory was untouched.
