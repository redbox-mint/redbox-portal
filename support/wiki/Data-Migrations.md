# Data Migrations

This guide explains how to create, use, and troubleshoot data migrations in ReDBox.

## What are Data Migrations?

Data migrations allow you to transform existing data in the ReDBox database when upgrading versions. They run automatically during application startup, before the core bootstrap process initializes default data.

Migrations are ideal for:
- Backfilling new record fields from old data
- Reshaping existing data structures
- Renaming configuration keys
- Consolidating data from multiple fields

Migrations are **not** for schema changes — Waterline owns the database schema. Use migrations only to transform data that already persists.

## How Migrations Run

When ReDBox starts:

1. Sails lifts and initializes the database connection
2. The `Migration` table is created (if it doesn't exist)
3. Pending migrations are discovered from two sources:
   - App-local migrations in `api/migrations/`
   - Hook migrations from packages with `sails.hasMigrations: true`
4. Migrations run in **lexical order by name** (not execution order)
5. Each successful migration is logged in the `Migration` table
6. Already-executed migrations are skipped on subsequent startups
7. If any migration fails, startup halts (fail-fast)

## Creating a Migration

### File Location and Naming

**App-local migrations:**
```
api/migrations/YYYYMMDDTHHMMSS-description.js
```

**Hook migrations:**
- Declare `sails.hasMigrations: true` in your hook's package.json
- Export a `registerRedboxMigrations()` function that returns an array of migrations
- Migration names in hooks use a prefix: `@scope/hook-name:YYYYMMDDTHHMMSS-description`

### Migration Structure

All migrations export an object with:

```typescript
{
  name: string;        // Unique identifier (e.g., "2026.06.08T10.00.00-rename-key")
  up: (context: any) => Promise<void>;     // Required: forward transformation
  down?: (context: any) => Promise<void>;  // Optional: rollback (not yet exposed via CLI)
}
```

The `context` parameter is the Sails global, providing access to models, services, and config.

### Example: Backfilling a New Field

```javascript
// api/migrations/20260608T100000-backfill-dataset-label.js

module.exports = {
  name: '20260608T100000-backfill-dataset-label',

  async up(sails) {
    // Find all Records without a label
    const records = await sails.models.record.find({
      label: null
    });

    // Backfill from the record name or a default
    for (const record of records) {
      await sails.models.record.updateOne({ id: record.id })
        .set({ label: record.name || 'Untitled' });
    }

    sails.log.info(`Backfilled ${records.length} records with default labels`);
  },

  async down(sails) {
    // Clear labels to reverse the migration
    await sails.models.record.update({})
      .set({ label: null });

    sails.log.info('Cleared all labels (rollback)');
  }
};
```

### Example: Reshaping Configuration

```javascript
// api/migrations/20260608T110000-migrate-appconfig-structure.js

module.exports = {
  name: '20260608T110000-migrate-appconfig-structure',

  async up(sails) {
    const config = await sails.models.appconfig.findOne({ key: 'branding' });
    if (!config) return;

    const oldBranding = JSON.parse(config.value);
    const newBranding = {
      logoUrl: oldBranding.logo_url,
      primaryColor: oldBranding.primary || '#0066cc',
      siteName: oldBranding.site_name || 'ReDBox'
    };

    await sails.models.appconfig.updateOne({ key: 'branding' })
      .set({ value: JSON.stringify(newBranding) });

    sails.log.info('Migrated branding configuration structure');
  }
};
```

## Rollbacks and the `down` Handler

The optional `down` handler is **forwarded to Umzug but not invoked by the normal lift**. ReDBox only ever runs pending `up()` migrations during startup; there is no automatic or CLI rollback wired into the portal today. A `down` handler therefore only runs if an operator drives Umzug manually (e.g. a one-off script that builds the same Umzug instance and calls `umzug.down()`).

Because of this, treat `down` as a best-effort, manual safety net rather than a guaranteed reverse path:

- **It may be a silent no-op.** If no rollback is ever triggered, the `down` you wrote never executes. Don't rely on it as part of routine deploys.
- **The runtime context may differ at rollback time.** A `down` that references models or services contributed by a specific hook can fail at runtime if that hook is no longer installed, disabled, or loaded in a different order than when `up()` ran. Hook-authored migrations are the most exposed to this.
- **Prefer idempotent, model-agnostic rollbacks.** Where a reverse is feasible, write `down` so it tolerates partially-applied state and only touches core models that are guaranteed to be present.
- **When a safe reverse is not possible, omit `down`** rather than shipping one that throws or corrupts data on a partial rollback.

The forwarding contract (that `down` is passed through verbatim) is covered by `toRunnableMigrations` and its tests in `MigrationRunner.test.ts`.

## Naming Conventions

Use one of these formats:

**Timestamp-based (recommended):**
```
20260608T100000-short-description
2026.06.08T10.00.00-short-description
```

**Semantic-based:**
```
001-initial-setup
002-rename-config-keys
```

**Hook migrations:**
```
@my-org/my-hook:20260608T100000-backfill-field
```

Key points:
- Names must be **unique** across app-local and all installed hooks
- Ordering is **purely lexical** on the name string
- Use lowercase and hyphens (no spaces or underscores)
- Keep descriptions short and action-oriented

## Migration Best Practices

### 1. Idempotency and Safety

Migrations can be tested in development before production. Structure them to be safe if run multiple times (though Umzug skips executed migrations on normal startup).

```javascript
// Good: Check before mutating
async up(sails) {
  const hasLabel = await sails.models.record.findOne({ where: { label: { '!=': null } } });
  if (hasLabel) return; // Already migrated

  // ... backfill logic
}
```

### 2. Batch Operations for Large Datasets

For tables with millions of rows, batch the update to avoid memory/database load:

```javascript
async up(sails) {
  const BATCH_SIZE = 1000;
  let offset = 0;
  let updated = 0;

  while (true) {
    const batch = await sails.models.record
      .find({ label: null })
      .limit(BATCH_SIZE)
      .skip(offset);

    if (batch.length === 0) break;

    for (const record of batch) {
      await sails.models.record.updateOne({ id: record.id })
        .set({ label: record.name || 'Untitled' });
      updated++;
    }

    offset += BATCH_SIZE;
    sails.log.info(`Processed ${updated} records...`);
  }
}
```

### 3. Logging for Debugging

Always log what your migration does so operators can verify it succeeded:

```javascript
async up(sails) {
  const before = await sails.models.record.count();
  
  // ... migration logic ...
  
  const after = await sails.models.record.count();
  sails.log.info(
    `Migration complete. Records: ${before} → ${after}. ` +
    `Labels backfilled: ${labelsAdded}.`
  );
}
```

### 4. Avoid Targeting Bootstrap Structures

Migrations run *before* `coreBootstrap()`, which seeds defaults (branding, roles, record types). If your migration targets structures that bootstrap re-seeds, the bootstrap will overwrite your changes.

As config seeding is phased out in favor of `bootstrapData()` services, this caveat is shrinking.

### 5. Use Services When Available

If a service exists for your domain, use it rather than querying models directly:

```javascript
// Better: Use a service if available
async up(sails) {
  const service = sails.services.core.recordService;
  if (service && service.backfillMissingLabels) {
    await service.backfillMissingLabels();
  }
}
```

## Verifying Migrations

### Check Executed Migrations

Query the `Migration` table to see which migrations have run:

```javascript
const executed = await sails.models.migration.find().sort('ranAt ASC');
console.log(executed.map(m => ({ name: m.name, source: m.source, ranAt: new Date(m.ranAt) })));
```

### Manual Testing

To test a migration in development:

1. Create the migration file in `api/migrations/`
2. Start the application; the migration runs automatically
3. Verify the data transformation in the database
4. To re-run the migration (for testing), delete its row from the `Migration` table:
   ```javascript
   await sails.models.migration.destroy({ name: '20260608T100000-test-migration' });
   ```
5. Restart the application

## Troubleshooting

### Migration Fails and Prevents Startup

If a migration's `up()` throws an error:
- Startup halts immediately (fail-fast)
- The error is logged in the application logs
- The failed migration is **not** recorded in the `Migration` table

**Recovery steps:**
1. Check the application logs for the specific error
2. Fix the migration file
3. Restart the application

### Orphaned Migration Rows

If a hook providing a migration is uninstalled, its migration row remains in the `Migration` table but is no longer in the migration list. ReDBox tolerates this gracefully — the orphaned row is ignored on startup.

**To clean up:**
```javascript
await sails.models.migration.destroy({ name: '@old-hook/old-migration:20260101T000000' });
```

### Migration Not Running

Verify:
1. **File location**: App-local migrations must be in `api/migrations/` with a `.js` extension
2. **Hook registration**: Hook migrations require `registerRedboxMigrations()` export returning an array
3. **Unique name**: Ensure the migration name isn't duplicated (check the `Migration` table)
4. **Already executed**: Check if the migration was already run; if so, delete its row to force a re-run

### Duplicate Migration Names

If two migrations have the same name:
- **Development**: Warning logged, but startup continues (first one runs)
- **Production**: Startup fails (names must be unique)

Use hook-prefixed names to avoid collisions:
```
@my-org/hook-name:20260608T100000-description
```

## Hook Integration

To add migrations from a hook package:

1. In your hook's `package.json`:
   ```json
   {
     "name": "@my-org/my-hook",
     "sails": {
       "hasMigrations": true
     }
   }
   ```

2. Export `registerRedboxMigrations()` from your hook's entry point:
   ```typescript
   export async function registerRedboxMigrations(): Promise<RedboxMigration[]> {
     return [
       {
         name: '@my-org/my-hook:20260608T100000-seed-dashboard',
         async up(sails) {
           // ... migration logic
         }
       }
     ];
   }
   ```

3. The hook's migrations are discovered automatically during bootstrap

## Related

- [Umzug Documentation](https://github.com/sequelize/umzug) — the migration runner engine
- [Waterline Models](./Waterline-Models.md) — for understanding model structure
- [Core Services](./Services.md) — for accessing business logic in migrations
