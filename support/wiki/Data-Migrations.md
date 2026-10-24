# Data migrations

Data migrations transform existing documents during startup before default business bootstrap. Prisma contracts declare fields; index changes use the explicit [index preparation](Persistence-Index-Preparation.md) commands. Startup never synchronizes a schema or repairs data.

Run upgrades with one instance and writers stopped. There is no cross-instance migration-body lock or transaction: unique execution names do not make a body exactly once. Back up databases, binary objects, configuration and hooks at a consistent boundary. Make transformations idempotent and bounded; a failed body can leave earlier writes applied and startup halts.

## Registration and handlers

App migrations live in `api/migrations/YYYYMMDDTHHMMSS-description.js`. Generate a skeleton with:

```bash
npx redbox-dev-tools --root /path/to/app generate migration backfill-dataset-label
```

V6 extensions return named `migrations` work from `registerRedboxExtension()`. The application binds concrete inputs after persistence initialization. App-local skeleton files are not discovered automatically; bind their operation explicitly. Prefix new extension names with the package identity and preserve existing ledger names during conversion. Pending migrations run in lexical name order, and successful execution is recorded through the migration ledger repository. Recorded names are skipped on restart.

Handlers receive Umzug params, with the application in `context`, not as the first argument itself. Use service/repository operations initialized before the runner:

```javascript
const { getConfigurationRepositories } = require('@researchdatabox/redbox-core');
module.exports = {
  name: '20261022T120000-update-config',
  async up({ context: app }) {
    const configs = getConfigurationRepositories(app).appConfigs;
    const current = await configs.findForBrandAndKey(brandId, 'institution');
    if (current && current.configData.oldLabel !== undefined) {
      const { oldLabel, ...rest } = current.configData;
      await configs.replaceForBrandAndKey(brandId, 'institution', { ...rest, label: oldLabel });
    }
  },
};
```

Supply the institution's actual `brandId`. Use public services for record writes so authorization, validation, revision/incarnation CAS, schema grants and lifecycle rules remain enforced. Declare real institution extension fields in the appropriate Prisma contract. Missing optional reads may be null; write only intentionally changed fields. Model globals and model registration are removed; see [institution migration](Persistence-Migration.md).

## Recovery and inspection

Use `getMigrationLedgerRepository(app).executedNames()` for inspection. A successful ledger row follows the body, so reconcile partial effects before restarting an unrecorded body. Do not delete a ledger row to rerun a destructive operation. `down` remains optional manual code; startup does not run it and there is no automatic rollback CLI.

New data repair should normally be a new forward migration. Renaming/removing a hook does not remove historical execution names. Keep those records for audit. Never delete the permanent record identity ledger or reset Counter to reuse uncertain allocations.

GridFS remains a native byte store on app-owned pools. Raw Prisma or direct driver operations require a supported-model-API gap and a PostgreSQL rewrite-register entry under ADR 0004. Data transformations do not authorize changing MongoDB binary, FCV, topology, collation or uniqueness. See [recovery](Cache-Persistence-Recovery.md).
