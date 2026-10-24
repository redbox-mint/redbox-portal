# v6 upgrade and recovery runbook

This runbook accompanies SR-048/SR-049. The production Express entrypoint is
`app.express.cjs`; it composes the installed selected domains and bundled hooks.
The final Sails-free P8 artifact passes installed fresh/restart/stop and complete
released-v5 stand-in cutover/recovery; see [exact artifacts and results](evidence/p8-artifacts.json).
Use a qualified immutable artifact and explicitly reviewed deployment inputs.
Institution designation/qualification remains a production release gate under
SR-005/045/049 and SR-055's inherited institution criterion. The local stand-in
results do not grant production acceptance to an undesignated deployment.

## Operator and API-client compatibility review

Review [every intentional v6 HTTP/behavior change](../../wiki/V6-Client-Compatibility.md)
with browser/API consumers and operators before cutover. The list maps the design's
recorded breaks and production-composition changes to affected clients and concrete
remediation, including 401/404, brand/actor requirements, Companion secrets,
pagination, session invalidation, CSRF/logout, upload ownership and socket protocols.
Record the institution's verified client conversions with its checkpoint.

## Prepare the release and checkpoint

Record the institution owner, supported source release and image digest, source
Node/MongoDB/FCV, target artifact digest, exact converted hook artifacts and
configuration revision. SR-003's public v5.0.4 image is a reproducible stand-in,
not a designation of an institution's supported source. Use separate source/v6
hook releases where needed; unchanged Sails-dependent hook source is unsupported.
Follow [hook conversion](hook-migration-v6.md) and
[configuration conversion](configuration-v6.md). Unsupported meaningful settings
must be converted, not deleted to make startup pass.

Inventory both application datastores, independent session and Agenda stores,
GridFS buckets, primary objects, branding fonts, staging/tus/Companion temporary
objects, configuration/secrets, generated page assets and hook/image/package
artifacts. Include external queue state and publisher reconciliation checkpoints.
Retain a verified copy of the source image and exact deployment inputs. Retaining
only a mutable image tag or only a database dump is insufficient.

Engine, FCV and topology changes are separate operator procedures. Do not assume
a direct MongoDB 7-to-9 upgrade or let application startup raise FCV. Record each
server's actual engine/FCV after its approved vendor-supported transition.
SR-045's two selected engine/FCV combinations do not qualify an untested TLS/auth
or institution topology.

Enter maintenance, remove ingress and stop all old hosts, queue consumers, cron,
upgraders and external writers. Await accepted work and successful resource
cleanup. A stop deadline failure is a failed stop: retain dependencies and retry
or reconcile the interrupted work before proceeding. Do not infer drain from a
closed listening socket. Allow container grace beyond the application's drain
deadline and any Agenda watchdog delay.

With every writer stopped, dump each datastore/session/queue database and copy
every byte store and deployment artifact from the same quiescent point. Separate
standalone dumps are consistent only while their writers remain stopped. MongoDB
replica-set online backup procedures are a different topology-specific operation.
Record tools versions, document/index inventories, checksums and the external
effect checkpoint. Test restoration in an isolated target before cutover.

## Prepare indexes and run one upgrader

From the installed, qualified candidate application, use its explicit operational
configuration module, not legacy `config/` discovery:

```sh
REDBOX_APPLICATION_CONFIG=/abs/deployment.cjs node app.express.cjs --maintenance=indexes:inspect
# Review duplicate keys, conflicting options and collection collation first.
REDBOX_APPLICATION_CONFIG=/abs/deployment.cjs node app.express.cjs --maintenance=indexes:ensure
REDBOX_APPLICATION_CONFIG=/abs/deployment.cjs node app.express.cjs --maintenance=indexes:inspect
```

Inspect exits 2 when not ready; connectivity/configuration/execution errors exit
1. Ensure must finish with exit 0 and a ready report before proceeding. These
commands do not run migrations, bootstrap, workers or HTTP, and do not repair
documents or silently drop conflicting indexes. Do not automate an unreviewed
ensure over institution data. See [maintenance](maintenance-v6.md).

### Released-v5 OID index conversion

The actual v5.0.4 rehearsal exposed a nonunique `record.redboxOid_1` index in
the storage database. V6 needs the unique index for create/restore conflict
classification. Inspect reports **conflicting**, and ensure exits **2 without
creating any selected index**. This refusal is expected. Review the exact
definition, duplicates and malformed/missing OIDs while writers stay stopped;
repair duplicate/invalid data separately with its owner. Do not relax the v6
constraint or add automatic index dropping to maintenance.

For this exact nonunique/simple/full index only, after verifying the complete
checkpoint, save and review this as `reviewed-v5-oid-index.js`:

```js
const records = db.getCollection('record');
const index = records.getIndexes().find(value => value.name === 'redboxOid_1');
if (!index || JSON.stringify(index.key) !== JSON.stringify({ redboxOid: 1 }) ||
    index.unique === true || index.sparse || index.partialFilterExpression ||
    index.hidden || index.expireAfterSeconds !== undefined ||
    (index.collation && index.collation.locale !== 'simple')) {
  throw new Error('Unexpected OID index definition; stop for owner review');
}
const total = records.countDocuments({});
const valid = records.countDocuments({ $expr: { $and: [
  { $eq: [{ $type: '$redboxOid' }, 'string'] }, { $ne: ['$redboxOid', ''] },
] } });
const duplicates = records.aggregate([
  { $group: { _id: '$redboxOid', count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }, { $limit: 1 },
]).toArray();
if (valid !== total || duplicates.length) throw new Error('Repair OIDs before DDL');
records.dropIndex('redboxOid_1');
```

Execute this separate operator action against the storage database, then repeat
the full explicit ensure/inspect. The rehearsal's guarded helper performs and
asserts this same operation against the sanitized two-record fixture. Removing
this nonunique index changes no documents; a failed ensure can still leave partial
DDL, so keep writers stopped and use the checkpoint recovery route if necessary.

```sh
mongosh "$REDBOX_STORAGE_MONGODB_URL" --quiet --file reviewed-v5-oid-index.js
REDBOX_APPLICATION_CONFIG=/abs/deployment.cjs node app.express.cjs --maintenance=indexes:ensure
REDBOX_APPLICATION_CONFIG=/abs/deployment.cjs node app.express.cjs --maintenance=indexes:inspect
```

Select exactly one migration runner. The implemented application API
`runApplicationMigrations` uses the existing ledger and lexical names; the storage
extension declares the record revision backfill through that API. Re-running
completed definitions skips their bodies. The ledger is not a distributed
upgrader lock: deployment coordination must enforce exclusivity.

### Persisted record hooks and queued work

Startup converts known v5 record-hook expressions, including nested notification
success callbacks. The notification repair migration runs even when the earlier
record-type converters are already complete in the ledger.
`20261025T010000-v6-persisted-queued-record-hook-operations` also converts existing
Mongo Agenda payloads for configured queued record-trigger jobs before workers
activate. It validates every selected payload before its first write, preserves
record/template data, and refuses unsupported declarations. Keep all other
writers and consumers stopped; retries are idempotent.

External SQS messages cannot be enumerated by startup. Each delivered queued
record-trigger payload receives the same finite conversion before strict named
operation dispatch, with ordinary acknowledgement/retry semantics. Unsupported
messages fail before invoking their hook; reconcile these with the queue owner.
There is no executable service-path fallback. Include both Mongo job documents
and external messages in the checkpoint and institution rehearsal.

### Initialize, validate and activate the installed portal

Set a strong deployment-owned `REDBOX_SESSION_SECRET` in the secret environment.
The explicit configuration module must contain the converted server/public URL,
separate datastores, session/Agenda URLs, storage and provider settings. The
executable consumes `REDBOX_APPLICATION_CONFIG`, `REDBOX_ENVIRONMENT_CONFIG` and
`REDBOX_LOCAL_CONFIG` before strict application environment validation; it does
not scan legacy Sails configuration files. Do not pass `sails_*` aliases.

Run the sole migration/bootstrap process with background claims closed:

```sh
REDBOX_APPLICATION_CONFIG=/abs/deployment.cjs node app.express.cjs --initialize-only
```

Require exit 0. This executes lexical migrations, core bootstrap, ordered
extension bootstrap and schema/storage/dashboard validation, then closes its
resources without activation. Initialization can write even when it fails; use
the recovery procedure below for partial failure. The next normal start observes
the same durable ledger and persisted definitions.

Start the candidate under the deployment's process supervisor:

```sh
REDBOX_APPLICATION_CONFIG=/abs/deployment.cjs node app.express.cjs
curl --fail http://127.0.0.1:1500/healthz
curl --fail http://127.0.0.1:1500/readyz
```

The internal v6 `npm start` and Docker CMD select this same Express executable.
The Docker health check uses `${REDBOX_PORT:-1500}/readyz`; set `REDBOX_PORT`
when selecting a nondefault server port in the deployment module. Local development
uses the explicit [Compose workflow](../../development/README.md).

Use the configured port and root context for user routes; health/readiness paths
are unprefixed. `/healthz` alone does not prove readiness. Route `/readyz`
explicitly through any deployment proxy. Require readiness 200 and verify fresh
login/providers, role/brand isolation, existing records/forms/workflows,
bytes/uploads, jobs and progress clients before opening ingress. A normal start
also runs initialization; never run two candidates as concurrent upgraders.

Exercise restart and graceful stop while maintenance remains active. Send SIGTERM
to the supervised Node process (or use `docker stop` with sufficient grace),
require successful drain and exit 0, then repeat startup/readiness/public probes.
A listener close or elapsed container timeout is not evidence of successful
resource cleanup. The v6 artifact has no Sails comparison entrypoint. Keep any
released-v5 comparison in a separate environment and never start it against a
database modified by v6.

Select a new session cookie name, rotate the secret and require fresh login.
Verify the cookie path, HTTPS/proxy settings and browser origin allowlist using
[session configuration](../../wiki/Configuration-Guide.md). Reacquire CSRF and
progress grants after login. Do not delete account,
membership, record or upload/staging state to invalidate sessions. Drain old
uploads before cutover; reconcile unbound v5 staging metadata from trusted
operator records instead of accepting client-supplied ownership. Companion's
accepted process-lifetime and recovery limits are in [maintenance](maintenance-v6.md).

## Recover a failed or interrupted cutover

Fence the failed candidate, stop every writer and preserve diagnostic/ledger and
external-effect information. Migration bodies, index DDL and bootstrap effects
are not transactional across databases or external systems. A failed body may
leave writes without a success ledger entry. Determine whether a reviewed repair
can safely resume; otherwise restore the complete consistent checkpoint into an
isolated replacement deployment.

Restore both databases and every independent session/queue database, their
indexes, GridFS/primary/staging bytes, configuration/secrets, hook/page assets and
the exact source artifact. Remove candidate-only collections/state by restoring
into clean database targets; `mongorestore --drop` only drops collections present
in its input and is not an installation-wide rollback. Check document and index
hashes, references and binary checksums before restarting the source artifact.
Never point the old image at state already modified by the candidate and call
image selection a rollback.

Reconcile any already-sent email, DOI/RAiD/Figshare publication, remote transfers
and queue acknowledgements against the recorded external checkpoint. Database
restoration cannot undo these effects. Obtain the owner's reconciliation decision
before resuming writes. Then verify source login, authorization, public pages,
existing record/form/workflow reads and binary retrieval, and observe restart/stop
again before ending maintenance.

## Reproduce the disposable stand-in rehearsal

The following command uses new, explicitly guarded `sr-p7-upgrade-*` Docker
resources, the sanitized released-v5 fixture, synthetic credentials, split MongoDB
8.0.34 servers, the released v5.0.4 image and the qualified local v6 candidate
with bundled hooks. It initializes the installed candidate, exercises fresh login
and retained records/forms/workflows, then checks restart and graceful stop.
It deliberately changes both databases and files after taking the checkpoint,
then restores the entire checkpoint and restarts the released source. It never
connects to an institution database. Keep at least 6 GiB free in the scratch root:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
export SR_P7_SCRATCH_ROOT=/path/to/disposable/scratch
# Immutable image ID from the clean SR-047 build; use the bundled-hook stand-in.
export SR_P7_CANDIDATE_IMAGE=sha256:25725acf4be38222bdf3546e29cdd1016492ec671c19c9920c7beb8420a05b1b
bash support/integration-testing/rehearse-sails-retirement-recovery.sh
```

The scratch path is recorded in the timestamped
`.tmp/sails-retirement/p7/recovery-*/scratch-path.txt` directory (or the explicit
`SR_P7_RECOVERY_LOGS` directory); backups and the saved image
are deliberately retained there for inspection. Logs are summarized in
[the rehearsal evidence](evidence/institution-upgrade-recovery.md). That complete
installed cutover/restart/stop and recovery passed, including a fresh offline
source-image restore. The real institution's approved configuration, hooks,
providers, topology and checkpoint still require their own rehearsal.

## Dashboard conversion decisions before activation

A released deployment without independent dashboard settings can stop during
`--initialize-only` with a dashboard preflight summary. On an isolated checkpoint
copy, retain that summary's input fingerprint, finding IDs and proposed behavior.
Review material differences before proceeding. The failed initialization may
already have written a recovery snapshot or completed earlier ledger entries;
keep writers fenced and the complete checkpoint available.

V6 accepts decisions as explicit deployment data, rather than reading
`REDBOX_DASHBOARD_MIGRATION_RESOLUTIONS` from the domain's process environment:

```js
module.exports = {
  // Other converted deployment settings remain here.
  dashboardMigrationResolutions: require('/etc/redbox/reviewed-dashboard-resolutions.json'),
};
```

The JSON contains `captureFingerprints` by brand,
`acceptedFindingIdsByBrand` and `replacements` (brand, target, complete settings).
Use only the actual reviewed fingerprint and finding IDs; changed inputs fail
instead of reusing stale decisions. The former comparison adapter and its file
environment input are retired. V6 has no migration-skip startup mode.

The sanitized stand-in's reviewed fingerprint is
`4439b700369c53470342b7a6f3ae1ee3884708931211121ea25ba5279a62539a`;
finding `170fbfa0478ae963` identifies `existing-locations-draft`. Its old workspace
page rendered three cells/actions empty; the selected conversion preserves the
standard dashboard's populated cells/actions. This decision applies only to the
bundled synthetic fixture. An institution must review its own capture and
behavior. The rehearsal supplies that single explicit decision and retains
all migration validation and fingerprint checks.

## Verify that the saved source image contains its filesystem

Save the actual deployment platform, then verify the archive before calling it
a binary backup:

```sh
docker image save --platform linux/amd64 -o released-image.tar "$SOURCE_IMAGE_DIGEST"
node packages/redbox-core/test/qualification/image-backup.cjs released-image.tar
```

Use the deployment's actual platform if it differs. The read-only verifier checks
that the configuration and every referenced filesystem layer are present, and
records the archive SHA256. The rehearsal found that a cached OCI index could be
saved/reloaded successfully while its tar omitted all referenced blobs. A
successful `docker load` into an engine that already has those layers is therefore
insufficient proof. Load the verified archive into a fresh isolated engine with
registry access unavailable, then run the loaded image with `--pull=never` and
`--network=none` (for example, its own `node --version`). Preserve the verified
archive and exact config/hooks with the database/files checkpoint.
