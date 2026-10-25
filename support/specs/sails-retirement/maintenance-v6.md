# Standalone v6 persistence maintenance

Stop portal hosts, queue consumers, migration runners and every other writer.
Take and verify a backup before maintenance. Index creation is not transactional;
a later error can leave earlier indexes created. These commands never repair data,
drop indexes, run migrations or start business bootstrap.

From the installed application directory:

```sh
npm run persistence:indexes -- --config deployment.mjs
npm run persistence:indexes -- --ensure --config deployment.mjs
npm run persistence:indexes -- --inspect --config deployment.mjs
```

The default is inspect. Ensure is an explicit operator action after reviewing the
inspection and resolving duplicate keys, conflicting definitions and collation.
All selected scopes are inspected before any DDL; any detected duplicate or
conflicting definition blocks the complete ensure pass. Equivalent existing indexes
are retained. A concurrent writer can invalidate inspection, so keep writers stopped
through preparation and verification.

Exit codes are **0** when ready, **2** for not-ready inspection/ensure or invalid
arguments, and **1** for configuration, loading, connectivity or execution failure.
The JSON report contains index states and final ownership counts. It omits
connection strings. Cleanup of owned pools, Prisma clients and native resources is
awaited on success and failure; exit 1 can also indicate a cleanup failure. Failure
diagnostics do not print configuration values.

## Selecting configuration and extensions

`--app <directory>` selects the installed application's package manifest (default:
current directory). Direct installed dependencies advertising the v6 extension
contract supply offline declarations, in existing hook priority order. Registration
must remain side-effect-free. Maintenance never calls module factories,
migrations, bootstrap, queue handlers or activation. It installs no signal handlers
and opens no listener.

`--config`, `--environment-config` and `--local-config` explicitly select shared
operational data modules, resolved relative to `--app`. They default-export plain
configuration data; CommonJS, ESM and ESM top-level await are supported. None is
implicitly discovered. `--environment <name>` selects the core environment default
(otherwise `NODE_ENV`, then `development`); it does not scan a directory.

Precedence is core defaults, ordered extension contributions, application file,
environment file, local file, then documented environment inputs. See
[configuration conversion](configuration-v6.md) for schemas, environment names,
legacy aliases and merge behavior. For example:

```js
// deployment.mjs: also use this data in the application's owned startup composition.
export default {
  datastores: {
    mongodb: { url: process.env.REDBOX_MONGODB_URL },
    redboxStorage: { url: process.env.REDBOX_STORAGE_MONGODB_URL },
  },
  agendaQueue: {
    options: { db: process.env.REDBOX_AGENDA_MONGODB_URL, collection: 'agendaJobs' },
  },
};
```

Maintenance consumes extension `datastores`, `agendaQueue`, `redboxSession` and `storage`
contributions. Domain sections (forms, views, authentication providers) stay offline.
Only storage ownership and operational configuration/jobs are resolved; maintenance
does not compose the portal business graph. Hook dependencies on core modules and
named core module/route replacements therefore remain offline too. Declaration
shape validation and explicit storage replacement selection still apply.
Explicit files must satisfy the deployment schema; unknown sections fail rather
than being silently ignored. Retired persistence/ORM selectors are rejected even
in extension contributions. Legacy Sails `config/`, `.sailsrc`, generated shims and
bootstrap files are never loaded. Convert their operational data explicitly.

The command supports the selected bundled Mongo storage module
`@researchdatabox/sails-hook-redbox-storage-mongo` with service name
`mongostorageservice`. A custom replacement fails before persistence acquisition:
it needs its own explicit preflight rather than inheriting another provider's
index assumptions. Core repository/cache, storage and GridFS descriptors retain
their existing preflights. Mongo Agenda descriptors are included when selected
jobs/default backend use Mongo; a separate Agenda URL/collection is honored.
An exclusively SQS job selection acquires no Agenda Mongo maintenance connection.
No Agenda job or logger collection is created by importing/preparing maintenance.

When Mongo sessions are selected, maintenance also inspects the configured session
database and collection (`sessions` by default). Explicit `ensure` creates the
connect-mongo `expires_1` TTL index on `{ expires: 1 }` with `expireAfterSeconds: 0`.
Incompatible TTL/index options or non-simple collection collation require operator
review; they are not silently replaced. Standalone HTTP preparation inspects this
index and fails when it is missing/conflicting. It disables connect-mongo's automatic
index creation and borrows the runtime-owned Mongo client. Session expiry continues
through Mongo TTL maintenance; HTTP startup does not perform DDL.

## Explicit record revision backfill

Index maintenance does not backfill record revisions or write the migration ledger.
The existing manual operation is available from the selected storage provider's
public entrypoint. Invoke it separately with writers stopped and a verified backup:

```js
import { initializePersistence, cleanupPersistence } from '@researchdatabox/redbox-core/extensions/storage';
import { recordRevisionMaintenance } from '@researchdatabox/sails-hook-redbox-storage-mongo/extension';

const owner = { config: finalizedDeploymentConfiguration, log: console };
try {
  await initializePersistence(owner);
  const stats = await recordRevisionMaintenance(owner).backfill();
  console.log(stats);
} finally {
  await cleanupPersistence(owner);
}
```

This uses the existing batched backfill and explicit options, not the application
migration runner. Review its statistics and existing revision-policy guidance before
restarting hosts. Neither maintenance entrypoint implies transactional rollback,
exactly-once execution or permission to run mixed-version writers.

## Upload/progress cutover qualification

Keep the same staging and primary byte stores across the authorized maintenance
window and forced v6 login. The owned tus provider persists resume state with
actor/brand/record bindings and issues root-relative locations. Drain unfinished
v5 transfers before cutover when possible. Old staging metadata without trusted
ownership bindings is retained and refused by v6; reconcile it using operator-
verified ownership or let the user restart the upload. Never adopt it based on
client-supplied IDs or delete it as part of session invalidation. Include the
staging store in the existing consistent backup/recovery procedure.

Cancelled attachment saves retain the authenticated actor and brand in their
mutation journal. Expiry cleanup verifies those identities against the stored
tus record binding before deleting staging. Historical journal rows without
that context remain for operator reconciliation; cancellation alone does not
authorize deleting an upload selected by a submitted file ID.

Pinned @uppy/companion 7.1.1 uses one explicit initialize-time app per process,
with a separate unlistened socket bridge. Stop fences new provider HTTP/upgrades,
drains admitted requests/connections within the application deadline, then
terminates remaining transports. Provider-internal remote I/O may outlive that
deadline and fail after the listener closes. Process exit is its final boundary;
retain the provider temporary directory until then. Cleanup cron starts during
initialize and has process lifetime. A second app or restart requires a new
process; Redis/periodic pings are refused by this adapter. Active tokens can
reconnect within that process; completed token replay/cross-process transfer
recovery is not promised. This bounded drain improves on released v5, which had
none. Inspect owned tus offsets after an interrupted transfer and reconcile/restart
using the authorized actor/record; do not infer completion from a lost socket.

SR-040 and SR-044 cover pages/static packaging and PDF/browser/provider lifetime
behavior. The focused [upload](evidence/p6-uploads.md) and
[realtime](evidence/p6-realtime.md) evidence records their bounded contracts;
[P8 evidence](evidence/p8-retirement.md) records final artifact qualification.
Institution-specific provider, credentials and topology qualification remains an
explicit release prerequisite.
