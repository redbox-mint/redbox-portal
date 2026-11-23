# Installation Guide


V6 starts the Fastify host with `node app.js` on Node 26.12.1. The qualified
MongoDB floor is the 8.0 line at **8.0.38** with FCV 8.0. The other qualified
version is **9.0.4** with FCV 9.0. Select an immutable, qualified image and exact
API2 extension artifacts. G7 covers local qualification of candidate revision 5.
The upgrade/rollback rehearsal and institutional production acceptance are pending.
[G7 closure](../specs/fastify-migration/evidence/FM-048.md) · [Database matrix](../specs/fastify-migration/evidence/FM-046.md#deployment-matrix)

## Evaluation and development

Install Docker/Compose, use the repository's exact pins, and follow
[Development](Development-Guide.md). The checked-in
`support/development/docker-compose.yml` supplies the selected application and
providers. For a local build:

```sh
npm run compile:all
export REDBOX_SESSION_SECRET="$(openssl rand -hex 32)"
npm run dev:run:build
```

The image starts Fastify as the `node` user with its baked command.
Use explicit deployment modules and real secrets as described in
[Configuration](Configuration-Guide.md). Serve the configured public URL/root
context through the approved reverse proxy and configure trusted proxies and
browser origins explicitly.

## Qualified deployment scope

Run one portal process using Docker or a single PM2 fork. The tested listener
uses HTTP/1.1 directly or behind Nginx, which can terminate TLS and forward
HTTP/1.1 upstream. MongoDB qualification covers standalone and independent
core/storage servers or replica sets as listed in the matrix. Portal replica
continuity, PM2 cluster mode, direct TLS or HTTP/2, and untested topologies are
outside the qualified scope. [Deployment boundaries](../specs/fastify-migration/evidence/FM-046.md#qualification-boundaries)

## Startup, probes, and shutdown

Before Fastify binds its listener, connection attempts fail. Once bound,
`GET /healthz` reports process liveness and `GET /readyz` reports traffic
readiness. Both use exact, unprefixed paths, even with a configured root context.
Readiness returns 503 until activation opens admission and during shutdown while
the listener can still respond.

The image probes `/readyz` on `REDBOX_PORT` (default 1500). It allows 180 seconds
of startup grace, checks every 30 seconds with a five-second probe timeout, and
marks the container unhealthy after five counted failures. Give separate startup
probes their own budget. Allow stop grace beyond the host's `server.stopDeadlineMs`
(30 seconds by default) and the configured queue drain timeout. The Docker and
PM2 examples allow 45 seconds. Check for a successful drain before starting
maintenance. Restart Companion in a fresh process after full stop.

## Existing installation upgrade

Plan the maintenance window around the current client and session requirements.
FM-049 and FM-050 track rehearsal from the preceding v6 image.
[Client compatibility](V6-Client-Compatibility.md) · [Fastify rehearsal status](../specs/fastify-migration/tasks.md#p8--rehearsal-and-handoff)

Stop every writer and take a consistent checkpoint of all databases, sessions,
queues, byte stores, configuration and exact artifacts. Prepare indexes and run
initialization using the selected Fastify build.

```sh
REDBOX_APPLICATION_CONFIG=/etc/redbox/application.cjs node app.js --maintenance=indexes:inspect
REDBOX_APPLICATION_CONFIG=/etc/redbox/application.cjs node app.js --maintenance=indexes:ensure
REDBOX_APPLICATION_CONFIG=/etc/redbox/application.cjs node app.js --initialize-only
```

Inspect exits 2 for required operator action and 1 for operational error. Ensure
never silently drops conflicting indexes. Review duplicate records and reconcile
any released-v5 nonunique OID index with all writers stopped. MongoDB engine/FCV
upgrades are separate vendor-supported operations. Existing volumes never rerun
empty-volume init scripts. [Index preparation](Persistence-Index-Preparation.md) · [Record OID index reconciliation](Concurrent-Record-Modifications.md#storage-adapters-and-hooks)

Require a fresh login after cutover and rollback, using fresh session signing
roots with no preceding-host verifier. Retain unfinished transfer state for trusted
reconciliation. Mixed-version rolling operation and starting v5 against v6-written
state are unsupported. Recovery restores the complete quiescent checkpoint and
its matching image/hooks/configuration. Keep ingress closed until authentication,
brand permissions, reads/writes, providers and successful drain are verified.
Start the Fastify build with its baked command or `node app.js` under the
selected supervisor. Wait for `GET /readyz` before restoring traffic.

Persistent primary objects, GridFS, branding fonts, staging and Companion temporary
files must outlive containers. Configure resource/stop limits for the deployment;
a failed drain remains a failed stop. See [maintenance](../specs/sails-retirement/maintenance-v6.md).

The [Docker example](../deployment-examples/docker/docker-compose.yml) requires
an immutable v6 `RBPORTAL_IMAGE`, canonical `REDBOX_PUBLIC_URL` and session secret.
Adapt its explicit `deployment.cjs` for the selected institution extensions,
authentication and disks. Start Mongo/Solr, then run
`docker compose run --rm redboxportal node app.js --maintenance=indexes:ensure`
before starting the portal. The [PM2 template](../ecosystem.template) likewise
selects `app.js`, an explicit configuration path and current environment
inputs; it requires the same qualified Node26 runtime and index preparation.

Prisma is the sole application persistence backend, including cache; GridFS bytes use the MongoDB driver. Remove retired backend selectors and Waterline settings before startup. [Persistence migration](Persistence-Migration.md) · [Backup and recovery](Cache-Persistence-Recovery.md)
