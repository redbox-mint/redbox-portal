# Data Migrations for ReDBox Loader

## Goal

Introduce a migration framework into the ReDBox loader (`@researchdatabox/redbox-core`) that allows the portal to perform data migrations when upgrading versions. Migrations run **before `coreBootstrap()`** so the database is fixed before any service bootstrap logic touches it.

Execution and tracking are delegated to [**Umzug**](https://github.com/sequelize/umzug) — a small, well-maintained, storage-agnostic migration runner — rather than being hand-rolled. We provide Umzug with the migration list and a thin custom **Storage** backed by Waterline (`sails.models.migration`), and call `umzug.up()`. Umzug owns: diffing the list against the executed log, running pending migrations in order, recording each success, halting on first failure, and (optionally) `down()`/rollback.

Migrations are supported from two sources:

- **App-local**: `api/migrations/*.js` files inside the portal application.
- **Hooks**: npm packages that declare `sails.hasMigrations: true` and export `registerRedboxMigrations()`.

Executed migrations are tracked by a unique `name` in a new `Migration` Waterline model (a plain log table; Umzug owns the read/write via the custom Storage). **Ordering is by migration `name`** (Umzug's default lexical ordering) — authors use timestamp/lexical name prefixes (e.g. `2026.06.08T10.00.00-rename-config-key`). There is no explicit `dependsOn` dependency graph.

## User Review Required

- Adds a new runtime dependency on `umzug` to `@researchdatabox/redbox-core`.
- Introduces a new `Migration` Waterline model; the loader will auto-generate its shim like any other core model. It is a plain log table written through a custom Umzug Storage (we do **not** use Umzug's built-in `MongoDBStorage`/`JSONStorage`, so the configured Waterline datastore is respected).
- Existing deployments will have an empty `Migration` table on first lift; no migrations will run unless explicitly authored.
- Migrations are **not** for schema changes (Waterline owns the schema) — they copy/transform **existing persisted data** into new structures (e.g. backfilling a new record field from an old one, reshaping `appconfig` rows).
- Bootstrap timing: `umzug.up()` executes between `preLiftSetup()` and `coreBootstrap()`. `coreBootstrap()` seeds defaults (branding, roles, record types, form definitions) — it does not touch the user/record data migrations operate on, so running first is correct and safe. Minor, transient caveat: migrations should not target structures that `coreBootstrap()` re-seeds. This caveat is shrinking — config-driven seeding is being phased out in favour of `bootstrapData()` services, and once that completes there is no overlap to worry about.
- In production, new migrations are only discovered when shims regenerate (`.regenerate-shims` marker or `REGENERATE_SHIMS=true`). An upgrade that adds a migration must trigger regeneration.

# Design

## 1\. Data Model (Waterline Models)

- **Purpose and scope**: Persist a record of every migration that has successfully run, so subsequent lifts skip already-executed work. This is the backing store for the custom Umzug Storage; Umzug reads it via `executed()` and appends via `logMigration()`.
- **New/changed models and attributes**:
  - `Migration` model (`id` is the default Waterline-managed primary key — **not** overridden):
    - `name` (string, required, unique): migration unique identifier and Umzug log key, e.g. `2026.06.08T10.00.00-rename-config-key` or `@my-org/hook:2026.06.08-seed-dashboard`.
    - `source` (string): `"app"` for app-local, or the hook package name (audit only).
    - `appVersion` (string): the portal's `package.json` version at the time the migration ran (audit only).
    - `ranAt` (number): timestamp of execution.
- **Relationships and indexes**: none.
- **Validation, lifecycle hooks, and defaults**: none.
- **Access control considerations**: none.
- **File locations and naming (core-types vs hook, and shim implications)**:
  - `packages/redbox-core/src/waterline-models/Migration.ts`
  - Registered in `packages/redbox-core/src/waterline-models/index.ts` so the loader auto-generates `api/models/Migration.js`.
- **Hook delivery requirements (capabilities \+ `registerRedboxModels()` if applicable)**: N/A — the `Migration` model is a core model, not hook-provided.

## 2\. Services Layer (Business Logic)

- **Service responsibilities**:
  - `MigrationRunner`: constructs an `Umzug` instance from the supplied migration list + a Waterline-backed Storage, and runs `umzug.up()`. Umzug handles pending detection, ordering (by `name`), sequential execution, logging each success, and halting on first failure.
- **Public methods, inputs/outputs, and errors**:
  - `runPendingMigrations(migrations: RedboxMigration[]): Promise<void>`
    - Builds a custom Umzug `Storage` over `sails.models.migration`:
      - `executed()` → `Migration.find().sort('ranAt ASC')` mapped to `name`s.
      - `logMigration({ name })` → `Migration.create({ name, source, appVersion, ranAt })`.
      - `unlogMigration({ name })` → `Migration.destroy({ name })` (supports rollback).
    - Maps the `RedboxMigration[]` to Umzug migrations (`{ name, up, down? }`), passing `sails` as the Umzug `context`.
    - Calls `umzug.up()`. Umzug skips already-run names, runs the rest in `name` order, logs each, and rejects on first failure — which propagates out to halt bootstrap.
    - Configures Umzug to tolerate executed-but-missing migrations (e.g. an uninstalled hook) rather than erroring on startup.
- **Transaction boundaries and side effects**: migrations may mutate any database rows; the runner does not wrap them in a DB transaction. Each migration is responsible for its own consistency.
- **Dependencies on models, configs, or external services**: `umzug`; requires `sails.models.migration` to be available (which it is, because the `Migration` shim is generated before lift).
- **File locations and naming**:
  - `packages/redbox-core/src/loader/MigrationRunner.ts`
- **Service conventions**: `MigrationRunner` is a plain module, not a `Services.Core.Service`, because it must run before `coreBootstrap()` when some services may not yet be initialized.
- **Export/update requirements**: export `runPendingMigrations` and the `RedboxMigration` type from `packages/redbox-core/src/index.ts`.

## 3\. Webservice Controllers (REST API)

- **Endpoint list (method \+ path)**: none added.
- **Request/response shapes and status codes**: unchanged.
- **Authn/authz and policy usage**: unchanged.
- **Error handling and validation (use `sendResp`)**: unchanged.
- **File locations and naming**: none.
- **Controller conventions (extend `Controllers.Core.Controller`, `init()`, `_exportedMethods`)**: unchanged.
- **Export/update requirements (ControllerExports index, routes, auth config)**: none.

## 4\. Ajax Controllers (Controllers)

- **Endpoint list (method \+ path or action)**: none added.
- **Request/response shapes**: unchanged.
- **Authn/authz and policy usage**: unchanged.
- **Error handling and validation (use `sendResp`)**: unchanged.
- **File locations and naming**: none.
- **Controller conventions (extend `Controllers.Core.Controller`, `init()`, `_exportedMethods`)**: unchanged.
- **Export/update requirements (ControllerExports index, routes, auth config)**: none.

## 5\. Angular App(s)

- **Apps/modules to add or modify (embedded apps only)**: none.
- **Routes: do not use Angular Router**; N/A.
- **Components and services**: none.
- **Data flow to/from APIs**: unchanged.
- **State management and error handling**: unchanged.
- **File locations and naming (Angular workspace \+ EJS view \+ assets output)**: none.
- **EJS view wiring (component tag \+ hashed asset includes using `CacheService.getNgAppFileHash`)**: none.
- **Render path (typically `RenderViewController.render` with `locals.view`)**: none.

## 6\. Additional Views

- **View templates to add/modify**: none.
- **Server-side data needed to render**: N/A.
- **Where view is wired in (e.g., `RenderViewController.render`)**: N/A.
- **Hook asset/view copy behavior if applicable**: N/A.

## 7\. Navigation Configuration

- **Menu/route entries to add/modify**: none.
- **Role/permission gating**: N/A.
- **File locations and naming**: N/A.

# Consistency Analysis

- **Cross-checks across all layers**:
  - The `Migration` model must be declared in `WaterlineModels` so the loader generates its shim; otherwise `sails.models.migration` is unavailable when the Umzug Storage runs.
  - The bootstrap shim (`bootstrap-shim.js.hbs`) must `require('./migrations')` and pass the array to `createGeneratedBootstrap`.
  - Migration `name`s must be unique across the combined app-local \+ hook list; ordering is purely lexical on `name`.
- **Missing pieces or conflicts**:
  - Rollback (`down`) is available via Umzug if migrations define a `down()`, but no CLI is wired up to invoke `umzug.down()` yet.
  - No CLI command to force re-run a migration. For now, operators can delete the `Migration` row manually (Umzug will then treat it as pending again).
- **Assumptions**:
  - App-local migrations live in `api/migrations/`.
  - `sails.models.migration` is available because the `Migration` shim is auto-generated by the loader alongside all other core models.
  - The `up()` function in each migration has full access to the `sails` global (models, services, config) — and also receives `sails` via Umzug's `context` — because it runs after Sails has lifted but before `coreBootstrap()`.
- **Open questions**:
  - Should we expose a `force` flag / CLI to re-run already-executed migrations for recovery scenarios?
  - If a migration ever needs to mutate structures that `coreBootstrap()` re-seeds, a post-`coreBootstrap()` phase would be required. Out of scope, and increasingly moot as config seeding is phased out in favour of `bootstrapData()` services.
- **Risks**:
  - A failing migration halts bootstrap entirely, preventing the portal from starting. This is intentional (fail-fast), but means migrations must be thoroughly tested.
  - Duplicate migration `name`s across app-local and hooks: the discovery step warns in development and throws in production.
  - An executed migration whose source is later removed (e.g. uninstalled hook) leaves an orphan log row; Umzug is configured to tolerate this rather than erroring on startup.
  - New runtime dependency on `umzug`.
