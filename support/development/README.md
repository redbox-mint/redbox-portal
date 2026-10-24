# Internal v6 development workflow

The development Compose services run `app.express.cjs` on Node 26.11.1. Both
mount and build modes use the `rehearsal` image target: it installs the bundled
demo and PDF hooks in the production dependency graph. The pristine production
`runtime` target continues to omit demo hooks.

```sh
# From the repository root, with Node 26.11.1 / npm 11.20.0 selected:
npm run compile:all
export REDBOX_SESSION_SECRET="$(openssl rand -hex 32)"
npm run dev:run
# Or rebuild the image and run without a source mount:
npm run dev:run:build
```

The explicit [application.cjs](application.cjs) module supplies local deployment
data. Compose passes canonical `REDBOX_*` inputs and requires a session secret;
it does not forward the legacy `.env` file or `sails_*` aliases. Optional Companion
provider variables are converted by that module; enabling it requires a complete
Google or OneDrive credential pair. Institution settings belong in explicitly
selected deployment modules as described in
[configuration-v6.md](../specs/sails-retirement/configuration-v6.md).

Default browser URL is `http://localhost:1500`, readiness is `/readyz` and health
is `/healthz`. `APP_URL` (or `REDBOX_PUBLIC_URL`) selects the browser-facing URL;
set it along with `RBPORTAL_HTTP_PORT` when changing the host port. Debugging uses
`--inspect` on localhost:9876. Host ports are bound to loopback. Optional
`RBPORTAL_DEBUG_PORT`, `RBPORTAL_MONGO_PORT` and `RBPORTAL_SOLR_PORT` avoid conflicts.
`RBPORTAL_IMAGE` selects an already built local image, otherwise Compose builds
`redbox-portal:dev` from the repository Dockerfile.

Data stays under `.dev` unless `RBPORTAL_DEV_DATA_DIR` selects another absolute
directory. For a disposable verification use a new directory; mount/build modes
share that selected state. Rebuild backend output and Angular/webpack assets
after source changes; this workflow does not install a runtime transpiler or a
second HTTP host. The config module is explicitly mounted in both modes because
`support/development` is excluded from production image contexts.

The Mongo init script prepares new volumes. Before using existing state, follow
[the upgrade runbook](../specs/sails-retirement/upgrade-recovery-v6.md), including
quiescence, backup, reviewed indexes, migration and recovery. Engine/FCV changes
are separate procedures. For explicit maintenance with this Compose deployment:

```sh
docker compose -f support/development/docker-compose.yml --profile build run --rm \
  --entrypoint node rbportal-build app.express.cjs --maintenance=indexes:inspect
```

Root `npm start` and `npm run debug` run Express; outside Compose provide
`REDBOX_APPLICATION_CONFIG` and `REDBOX_SESSION_SECRET`. `npm run
start:sails:comparison` and `npm run debug:sails:comparison` retain the old
comparison adapter until P8. Comparison runs require isolated data and converted
v5 inputs; never run the old host on data already modified by v6.
