# Internal v6 development workflow


The development Compose services run `app.js` on Node 26.12.1. Both
mount and build modes use the `rehearsal` image target: it installs the bundled
demo and PDF hooks in the production dependency graph. The pristine production
`runtime` target continues to omit demo hooks.

Build mode uses `NODE_ENV=production` for that installed graph. Mount mode uses
`NODE_ENV=development` and discovers the workspace's installed development hooks;
compile/install the workspace dependencies before starting it.

```sh
# From the repository root, with Node 26.12.1 / npm 11.20.0 selected:
npm run compile:all
export REDBOX_SESSION_SECRET="$(openssl rand -hex 32)"
npm run dev:run
# Or rebuild the image and run without a source mount:
npm run dev:run:build
```

The explicit [application.cjs](application.cjs) module supplies local deployment
data. Compose passes canonical `REDBOX_*` inputs and requires a session secret.
Optional Companion provider variables are converted by that module. Enabling
it requires a complete Google Drive or OneDrive credential pair. The default
upload allowlist uses the public origin and `REDBOX_ROOT_CONTEXT` for the
`default/rdmp` attachment path. To override it, use comma-separated literal
prefixes in `UPPY_COMPANION_UPLOAD_URLS`.
[Companion setup](../wiki/TUS-and-Uppy-Companion-Setup.md) · [Fastify configuration](../wiki/Configuration-Guide.md)

Default browser URL is `http://localhost:1500`, readiness is `/readyz` and health
is `/healthz`. `APP_URL` (or `REDBOX_PUBLIC_URL`) selects the browser-facing URL;
set it along with `RBPORTAL_HTTP_PORT` when changing the host port. The HTTP bind
defaults to loopback. For remote development, set `RBPORTAL_HTTP_BIND_ADDRESS`
to the Docker host's reachable interface address. On Tailscale, use the
Tailscale IPv4 address for the bind and the MagicDNS name in `APP_URL`.
MongoDB, Solr and the debug port stay on loopback. Optional
`RBPORTAL_DEBUG_PORT`, `RBPORTAL_MONGO_PORT` and `RBPORTAL_SOLR_PORT` avoid conflicts.
`RBPORTAL_IMAGE` selects an already built local image, otherwise Compose builds
`redbox-portal:dev` from the repository Dockerfile.

Data stays under `.dev` unless `RBPORTAL_DEV_DATA_DIR` selects another absolute
directory. For a disposable verification use a new directory; mount/build modes
share that selected state. Rebuild backend output and Angular/webpack assets
after source changes; this workflow does not install a runtime transpiler or a
second HTTP host. The config module is explicitly mounted in both modes because
`support/development` is excluded from production image contexts.

The Mongo init scripts prepare domain, separate Agenda and v6 session indexes on
new volumes; Compose waits for the final Mongo server and Solr core to be healthy.
Before using existing state, follow
[the Fastify upgrade guidance](../wiki/Installation-Guide.md#existing-installation-upgrade), including
quiescence, backup, reviewed indexes, migration and recovery. Engine/FCV changes
are separate procedures. For explicit maintenance with this Compose deployment:

```sh
docker compose -f support/development/docker-compose.yml --profile build run --rm \
  --entrypoint node rbportal-build app.js --maintenance=indexes:inspect
```

Root `npm start` and `npm run debug` run Fastify; outside Compose provide
`REDBOX_APPLICATION_CONFIG` and `REDBOX_SESSION_SECRET`. Run released-v5
comparisons with the separate artifact and isolated pre-upgrade data.

Fastify listens only after initialization and preparation. Before that, both
`/healthz` and `/readyz` refuse connections. The image allows 180 seconds of
startup grace, then five readiness failures at 30-second intervals (5-second
probe timeout). Use `/healthz` for liveness and `/readyz` for traffic readiness;
a deployment with separate probes must give startup its own budget. Stop grace
must exceed `server.stopDeadlineMs` (default 30 seconds); PM2 and the deployment
example allow 45 seconds. After full stop, start a fresh process for Companion.

The baked Fastify runtime passed qualification on revision 5. The mounted
development stack and the rehearsal image serve development workflows.
[G7 evidence](../specs/fastify-migration/evidence/FM-048.md)
