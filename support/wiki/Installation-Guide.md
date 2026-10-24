# Installation Guide

V6 runs the owned Express 5 host (`app.express.cjs`) with Node 26.11.1 and
MongoDB 8+. Select an immutable, qualified application image and exact converted
hook artifacts. Internal-default promotion is not production release acceptance;
see the current [retirement task status](../specs/sails-retirement/tasks.md).

## Evaluation and development

Install Docker/Compose, use the repository's exact pins, and follow
[Development](Development-Guide.md). The checked-in
`support/development/docker-compose.yml` supplies the selected application and
providers. For a local build:

```sh
npm run dev:prepare
npm run dev:run:build
```

The image's CMD starts Express; do not override it with a framework lift command.
Use explicit deployment modules and real secrets as described in
[Configuration](Configuration-Guide.md). Serve the configured public URL/root
context through the approved reverse proxy and configure trusted proxies and
browser origins explicitly. Readiness is `/readyz`; liveness is `/healthz`.

## Existing installation upgrade

Follow the complete [v6 upgrade/recovery runbook](../specs/sails-retirement/upgrade-recovery-v6.md)
and [operator/API-client changes](V6-Client-Compatibility.md). Stop every writer,
checkpoint all databases, sessions, queues, byte stores, configuration and exact
artifacts consistently, then prepare indexes with the installed application:

```sh
REDBOX_APPLICATION_CONFIG=/etc/redbox/application.cjs node app.express.cjs --maintenance=indexes:inspect
REDBOX_APPLICATION_CONFIG=/etc/redbox/application.cjs node app.express.cjs --maintenance=indexes:ensure
REDBOX_APPLICATION_CONFIG=/etc/redbox/application.cjs node app.express.cjs --initialize-only
```

Inspect exits 2 for required operator action and 1 for operational error. Ensure
never silently drops conflicting indexes. Review duplicate records and the
released-v5 nonunique OID index procedure in the runbook. MongoDB engine/FCV
upgrades are separate vendor-supported operations. Existing volumes never rerun
empty-volume init scripts.

Require a fresh login after cutover; retain unfinished transfer state for trusted
reconciliation. Mixed-version rolling operation and starting v5 against v6-written
state are unsupported. Recovery restores the complete quiescent checkpoint and
its matching image/hooks/configuration. Keep ingress closed until authentication,
brand permissions, reads/writes, providers and successful drain are verified.

Persistent primary objects, GridFS, branding fonts, staging and Companion temporary
files must outlive containers. Configure resource/stop limits for the deployment;
a failed drain remains a failed stop. See [maintenance](../specs/sails-retirement/maintenance-v6.md).
