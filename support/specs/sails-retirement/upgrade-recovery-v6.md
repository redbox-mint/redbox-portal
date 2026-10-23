# v6 upgrade and recovery runbook

This runbook accompanies SR-048/SR-049. **The current branch is not an
upgrade-ready portal artifact.** Its standalone persistence maintenance and
domain modules are implemented, but the installed production Express composition
and full existing-suite qualification remain open. Do not substitute the P6
browser fixture for the production entrypoint. The executable rehearsal below
tests released-v5 recovery and the implemented v6 persistence components; it does
not certify a complete portal upgrade.

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
npm run persistence:indexes -- --inspect --config deployment.mjs
# Review duplicate keys, conflicting options and collection collation first.
npm run persistence:indexes -- --ensure --config deployment.mjs
npm run persistence:indexes -- --inspect --config deployment.mjs
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
npm run persistence:indexes -- --ensure --config deployment.mjs
npm run persistence:indexes -- --inspect --config deployment.mjs
```

Select exactly one migration runner. The implemented application API
`runApplicationMigrations` uses the existing ledger and lexical names; the storage
extension declares the record revision backfill through that API. Re-running
completed definitions skips their bodies. The ledger is not a distributed
upgrader lock: deployment coordination must enforce exclusivity.

**Production startup gate:** a concrete installed Express composition must bind
the selected factories/work, all core/extension bootstrap operations, validation,
HTTP adapters, background owners and installed pages/assets before this step can
be exercised. At the recorded P7 source there is no production command for this
composition. `npm start`/`node app.js` still lifts the Sails comparison host.
Consequently no `start:express` or `upgrade` command is invented here. SR-046,
SR-047 and the full SR-048 cutover remain open until that implementation and its
qualification supply the tested command.

Once that gate is satisfied, initialize the sole candidate while admission and
background claims remain closed; await lexical migrations, core bootstrap,
ordered extension bootstrap, schema/storage/dashboard validation and post-bootstrap
prerequisites before activation. Validate the listener's unprefixed `/readyz`
(route it explicitly through any deployment proxy), supported login/providers, role/brand isolation,
existing records/forms/workflows, bytes/uploads, jobs and progress clients. Open
ingress only after these checks and the approved regression suites pass.

Use the v6 session name/secret and require fresh login. Do not delete account,
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
8.0.34 servers, the released v5.0.4 image and bundled Mongo storage migration.
It deliberately changes both databases and files after taking the checkpoint,
then restores the entire checkpoint and restarts the released source. It never
connects to an institution database. Keep at least 6 GiB free in the scratch root:

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
export SR_P7_SCRATCH_ROOT=/path/to/disposable/scratch
bash support/integration-testing/rehearse-sails-retirement-recovery.sh
```

The scratch path is recorded in the timestamped
`.tmp/sails-retirement/p7/recovery-*/scratch-path.txt` directory (or the explicit
`SR_P7_RECOVERY_LOGS` directory); backups and the saved image
are deliberately retained there for inspection. Logs are summarized in
[the rehearsal evidence](evidence/institution-upgrade-recovery.md). Neither
sanitized fixture recovery nor the missing institution designation replaces the
required complete v6 portal upgrade/restart/stop and recovery acceptance.
