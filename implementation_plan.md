# Data Migrations Feature

## Goal Description

Add a migration framework to the ReDBox loader that allows the portal to perform data migrations when upgrading versions. Migrations run **before `coreBootstrap()`**, ensuring the database is in the correct state before any service logic executes.

Execution and tracking are delegated to [**Umzug**](https://github.com/sequelize/umzug) (a small, storage-agnostic migration runner) rather than hand-rolled. We supply Umzug with the migration list and a custom Waterline-backed `Storage`, then call `umzug.up()`.

Migrations are sourced from:

- **App-local**: JavaScript files in `api/migrations/*.js`.
- **Hooks**: npm packages declaring `sails.hasMigrations: true` and exporting `registerRedboxMigrations()`.

The framework tracks executed migrations by unique `name` in a new `Migration` Waterline model (a log table behind the custom Umzug Storage). **Ordering is lexical by migration `name`** (Umzug's default) — authors use timestamp/lexical prefixes. No explicit `dependsOn` graph.

## Proposed Changes

### Packages

#### \[packages/redbox-core\]

##### \[MODIFY\] [package.json](http://packages/redbox-core/package.json)

- Add `umzug` to `dependencies` (CJS-compatible with the `require`-based shims).

##### \[NEW\] [waterline-models/Migration.ts](http://packages/redbox-core/src/waterline-models/Migration.ts)

- Define the `Migration` Waterline model using the `@Entity` decorator.
- Do **not** override `id` — leave it as the Waterline-managed primary key.
- Attributes:
  - `name` (string, required, unique) — Umzug log key / migration identifier
  - `source` (string)
  - `appVersion` (string)
  - `ranAt` (number)
- Add a unique index on `name`.

##### \[MODIFY\] [waterline-models/index.ts](http://packages/redbox-core/src/waterline-models/index.ts)

- Export `Migration` types and `MigrationWLDef`.
- Add `Migration: MigrationWLDef` to the `WaterlineModels` registry.

##### \[NEW\] [loader/MigrationRunner.ts](http://packages/redbox-core/src/loader/MigrationRunner.ts)

- `runPendingMigrations(migrations: RedboxMigration[]): Promise<void>`
  - Returns early if `migrations` is empty.
  - Builds a custom Umzug `Storage` over `sails.models.migration`:
    - `executed()` → `Migration.find().sort('ranAt ASC')` mapped to `name`s.
    - `logMigration({ name })` → `Migration.create({ name, source, appVersion, ranAt: Date.now() })`.
    - `unlogMigration({ name })` → `Migration.destroy({ name })`.
  - Maps `RedboxMigration[]` → Umzug migrations `{ name, up, down? }`, with `sails` passed as Umzug `context`.
  - Constructs the `Umzug` instance with a `sails.log`-backed logger and tolerance for executed-but-missing migrations.
  - Calls `umzug.up()` — Umzug skips already-run names, runs the rest in lexical `name` order, logs each success, and rejects on first failure (propagated to halt bootstrap).
- Export `RedboxMigration` type here (canonical home); re-exported from `loader/index.ts` and `src/index.ts`.

##### \[MODIFY\] [loader/index.ts](http://packages/redbox-core/src/loader/index.ts)

- Add types (re-export `RedboxMigration` from `loader/MigrationRunner`):
  - `RedboxMigration`: `{ name: string; source?: string; up: (ctx?: unknown) => Promise<void>; down?: (ctx?: unknown) => Promise<void> }`
  - `HookMigrationRegistration`: `{ name: string; module: string }` (mirrors the existing `Hook*Registration` shape).
- Add `hookMigrations: HookMigrationRegistration[]` to the `HookRegistrations` interface.
- **Integrate hook-migration discovery into the existing `findAndRegisterHooks` loop** (alongside `hasModels`/`hasServices`/etc.) rather than a separate dependency scan:
  - When `depPackageJson.sails?.hasMigrations === true`, record `{ name: depName, module: depName }`.
  - (The actual `up`/`down` functions are pulled at runtime by the generated shim via `require('<module>').registerRedboxMigrations()`.)
- New helper `discoverLocalMigrationFiles(appPath): string[]`
  - Lists `api/migrations/*.js` filenames (sorted) for the generator to emit `require()` calls against. Existence/shape is validated at runtime in the shim/runner.
- New function `generateMigrationConfigShim(configDir, appPath, hookMigrations): Promise<GenerationStats>`
  - Generates `config/migrations.js` from a template.
  - Emits `require('<hook>').registerRedboxMigrations()` for each hook and `require('../api/migrations/<file>')` for each app-local file, aggregating both into a single exported `migrations` array at runtime.
  - Emits duplicate-`name` detection: warn in development, throw in production.
- Update `GenerateAllShimsStats` to include `migrationStats: GenerationStats`.
- Add `generateMigrationConfigShim(...)` to the `Promise.all([...])` in `generateAllShims` and include `migrationStats` in the returned `stats`.

##### \[MODIFY\] [loader/bootstrapShimRuntime.ts](http://packages/redbox-core/src/loader/bootstrapShimRuntime.ts)

- Add import for `runPendingMigrations`.
- Update `createGeneratedBootstrap` signature to accept a fourth parameter: `migrations: RedboxMigration[] = []`.
- In the returned bootstrap function, after `preLiftSetup()` and before `coreBootstrap()`:

```ts
if (migrations.length > 0) {
  await runPendingMigrations(migrations);
}
```

##### \[MODIFY\] [redbox-loader-templates/bootstrap-shim.js.hbs](http://packages/redbox-core/redbox-loader-templates/bootstrap-shim.js.hbs)

- Add `const migrations = require('./migrations').migrations || [];`
- Pass `migrations` as the fourth argument to `createGeneratedBootstrap(...)`.

##### \[MODIFY\] [index.ts](http://packages/redbox-core/src/index.ts)

- Export `runPendingMigrations` and `RedboxMigration` type from `./loader/MigrationRunner`.

### API (Sails App)

- _Note: API Shims (`api/models/_.js`, `api/services/_.js`, `config/_.js`) are auto-generated by `redbox-loader.js` and do not need to be created manually.\*

#### \[NEW\] [api/migrations/](http://api/migrations/)

- This directory is created by the portal application (not by the core package).
- Each `.js` file exports a single `RedboxMigration` object. Use a timestamp/lexical prefix in `name` to control ordering:

```javascript
module.exports = {
  name: '2026.06.08T10.00.00-rename-old-config-key',
  up: async ({ context: sails } = {}) => {
    await sails.models.appconfig.update({ key: 'oldKey' }, { key: 'newKey' });
  },
  down: async ({ context: sails } = {}) => {
    // optional rollback
    await sails.models.appconfig.update({ key: 'newKey' }, { key: 'oldKey' });
  },
};
```

### Hook Contract

Hooks declare migration support in `package.json`:

```json
{
  "sails": {
    "hasMigrations": true
  }
}
```

And export:

```ts
export function registerRedboxMigrations(): RedboxMigration[] {
  return [
    {
      name: 'my-hook:2026.06.08-seed-dashboard-widgets',
      up: async ({ context: sails } = {}) => {
        /* ... */
      },
    },
  ];
}
```

## Verification Plan

### Automated Tests

#### Unit Tests: `packages/redbox-core/test/loader/loader.test.ts`

- `findAndRegisterHooks`: discovers `hookMigrations` from a fake hook module declaring `sails.hasMigrations` in the sandbox.
- `discoverLocalMigrationFiles`: lists sandbox `api/migrations/*.js` in sorted order.
- Duplicate `name` detection: warns in development; throws in production.
- `generateMigrationConfigShim`: produces a valid `config/migrations.js` that can be `require`d in a VM and yields the aggregated `migrations` array (hook + app-local) in `name` order.
- `generateAllShims`: asserts `migrationStats` appears in the returned result when migrations are present.

#### Unit Tests: `packages/redbox-core/test/loader/MigrationRunner.test.ts`

- Executes pending migrations in lexical `name` order.
- Skips already-run migrations (mock `Migration` model returns executed names via the Storage `executed()`).
- Records a `Migration` row (`name`, `source`, `appVersion`, `ranAt`) after each successful migration via `logMigration`.
- Halts on first `up()` failure; subsequent migrations do not run and are not logged.
- `down()` calls `unlogMigration` / `Migration.destroy`.
- Tolerates an executed name with no corresponding migration in the list (no startup error).
- Empty migration list is a no-op.

#### Integration Tests

- Create a temporary sandbox Sails app with a local migration that mutates a mock model.
- Verify the migration runs during bootstrap and a `Migration` record is created.
- Re-bootstrap the same app; verify the migration does **not** re-run.
- Test a hook-provided migration plus an app-local migration; verify both run in `name` order and each is logged.

### Manual Verification

1. **Setup**:
   - Create `api/migrations/001-test-migration.js` in a local portal:

```javascript
module.exports = {
  name: '2026.06.08T10.00.00-test-migration',
  up: async ({ context: sails } = {}) => {
    sails.log.info('Test migration executed');
  },
};
```

2. **Execution**:
   - Lift the portal. (In production, ensure shims regenerate — `.regenerate-shims` marker or `REGENERATE_SHIMS=true` — so the new migration is discovered.)
3. **Verification**:
   - Check logs for Umzug running `2026.06.08T10.00.00-test-migration`.
   - Query the `Migration` collection; verify a document with `name: '2026.06.08T10.00.00-test-migration'` exists.
4. **Re-run check**:
   - Stop and lift again.
   - Verify the migration does **not** execute a second time (no log line for that name).
