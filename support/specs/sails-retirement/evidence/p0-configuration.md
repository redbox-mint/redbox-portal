# SR-004 — Configuration, hook and record-type characterization

Source baseline: `a49366803164429f9d8bdd249dadcdf856c9d13e`. Host: existing Sails
comparison implementation, not the proposed runtime. Core source paths below are
relative to `packages/redbox-core/src/`. Read with `p0-baseline.md` and the
machine-readable `characterization.json` produced by `characterize.cjs`.

## Actual configuration precedence and exceptions

1. `app.js` loads core and generates shims, then passes `rc('sails')` to
   `sails.lift()`. `rc@1.2.8` supplies its file/environment/CLI override object;
   Sails also normalizes environment and deployment inputs. Do not silently drop
   `.sailsrc`, `sails_*` inputs or CLI consumers during retirement.
2. Generated config shims call `mergeRedboxConfig(name, coreDefault, ...hooks)`.
   Hook contributions run in **low-to-high** precedence. This happens before
   Sails merges application/environment/local settings.
3. Installed Sails `lib/hooks/moduleloader/index.js:loadUserConfig` merges
   `config/*`, then `config/env/<environment>/**`, then
   `config/env/<environment>.js`, then `config/local`. The environment selector
   first uses a value already in `sails.config`, then local config, then
   `development`; an environment config cannot change the selected environment.
4. `lib/hooks/userconfig/index.js:loadModules` snapshots existing `sails.config`
   overrides and applies them after loaded user config. These source observations
   are tied to Sails `1.5.17` at root and `1.5.18` in core, not a new ReDBox
   precedence implementation.
5. Some defaults read environment variables **during module import**, including
   `config/agendaQueue.config.ts`'s separate `sails__agendaQueue_options_*` inputs.
   This spelling differs from rc's `sails_agendaQueue__options__*` nested inputs.
   Config loading is not yet a pure, awaited declaration phase.
6. Hooks can subsequently call `ConfigService.mergeHookConfig()` in their Sails
   initializer and mutate `sails.config` again (PDF does). Thus the legacy path is
   not one uniform immutable precedence pipeline. SR-019/SR-020 must characterize
   and convert meaningful late overrides rather than assuming the design's new
   layer order is already implemented.

Merge behaviors are deliberately distinct:

- Ordinary `mergeRedboxConfig` calls Lodash `merge`: arrays merge **by index**,
  objects recursively merge, and approved function values retain identity.
  For example `["a", "b"]` followed by `["x"]` becomes `["x", "b"]`.
- `brandingConfigurationDefaults` uses `mergeWith` to **replace arrays**. The
  same example becomes `["x"]`. Brand defaults have menu/home-panel semantics;
  they are not interchangeable with ordinary Lodash arrays.
- `agendaQueue` normalizes arrays of `{name, ...config}` or maps into jobs keyed
  by name, removes the redundant `name` property, ignores invalid/empty entries
  and merges each job's config. Existing job names survive; later definitions
  override the same job. Other Agenda settings use ordinary recursive merging.
- `mergeHookConfig` has another custom merge path: `fields` arrays replace by
  default; `_dontMerge` extends that file's exceptions and is removed from the
  required module object; `_delete` unsets configured paths before merge and is
  removed too. Other arrays retain Lodash index behavior. Per-file dont-merge
  state resets. This mutates required module objects and must not be treated as
  a side-effect-free config reader. Its map-shaped dont-merge branches warrant
  explicit conversion cases before relying on them.

The v6 design deliberately replaces **ordinary** arrays; it must document this
legacy difference. Functions must not be lost through JSON cloning. Debug
pre-lift/post-bootstrap snapshots serialize functions and can expose raw settings;
they are not a safe v6 configuration or evidence export interface.

## Every imperative `mergeHookConfig` action

`services/ConfigService.ts:mergeHookConfig` performs these operations synchronously
or starts promises without awaiting them:

- Resolve the hook under `appPath/node_modules`, with a special hook-root test
  launch fallback; synchronously walk/require config and branded-config files.
- For each brand's `init-only` files, start `AppConfigService.createConfig()`;
  existing entries are caught/logged. For `override`, resolve `BrandingService`
  and start `createOrUpdateConfig()`; failures are categorized/logged. Duplicate
  basename keys across extensions are skipped. **Neither group of promises is
  returned/awaited**: SR-021/SR-022 must own the writes and failure behavior.
- Merge `form-config` and `config` into the supplied mutable map; process the
  `_dontMerge`/`_delete` directives above.
- Merge language files, optionally back up core language files, and write the
  merged locale output (`mergeTranslationFiles`, `processTranslationFile`).
- Copy hook assets into `assets/` and `.tmp/public/`, and views into `views/`.
- Create `api/core` symlink where the legacy layout requires it.
- Require/install API services into both `sails.services` and `globalThis`, using
  basename/lowercase keys; nested directories are not supported by this path.
- Require controller functions and install non-private methods into
  `sails.config.controllers.moduleDefinitions` as `controller/method` actions.
- Copy response implementations into the application `api/responses` directory.

Owners: declarations/merge rules SR-019; diagnostics/deployment aliases SR-020;
dynamic AppConfig and awaited writes SR-021/SR-022; named factories SR-014;
assets/views SR-018/SR-040. Do not port all these effects into config resolution.

## Brand reads and dynamic state

`ConfigService.getBrand(brandName, block)` first calls the request-time
`sails.config.brandingAware(brandName)` function; then tries that function with
`auth.defaultBrand` (default `default`); then `brandingConfigurationDefaults`;
finally the legacy `config[block][brandName/defaultBrand]` map. It tests undefined,
not truthiness. `coreBootstrap()` assigns `brandingAware` from
`AppConfigService.getAppConfigurationForBrand` **after** AppConfig bootstrap.
AppConfig/Branding caches and invalidation remain dynamic operations; SR-021
must not freeze their database-backed contents into startup configuration.

## Hook precedence, loading and lookup

`hooks/hookDiscovery.ts` reads direct root dependencies **and devDependencies**
by default, resolving `<dependency>/package.json`. It uses the `sails.isHook` or
capability flags, including the rejected retired `hasModels` flag. Package-exports
that hide `package.json` are currently skipped; synchronous `require()` loading
cannot support awaited ESM top-level initialization. SR-012 owns both limitations.

`hookLoadPriority[0]` has highest priority; listed hooks outrank unlisted hooks.
Unlisted hook precedence is **descending** `name.localeCompare`; processing is
the reverse. Do not turn this into ascending direct-lookup order accidentally.
Priority normalization trims names, retains the first duplicate and warns on
invalid entries/uninstalled names. A process-level discovery map caches by app
path plus root package text and installed dependency-manifest signature.

Service/controller/policy/config/form registries process low-to-high because
they are last-write-wins. `hookResources.ts` searches view/asset roots high-to-low,
rejecting traversal, malformed encoding, backslashes and decoded slashes. Actual
filesystem copying by `mergeHookConfig` is a separate legacy mechanism. Core
and hook migrations are collected, then `MigrationRunner` sorts **lexically by
name**, independently of hook priority; success is recorded after each body.
There is no distributed migration lock or rollback/transaction promise.

## Lifecycle and record-type pilot dependency graph

Current ordering, from `bootstrap.ts` and `loader/bootstrapShimRuntime.ts`:

1. `preLiftSetup`: normalize deployment values/logging/route validation; initialize
   app-owned persistence and all groups; initialize service `init()` methods
   except record schemas; invoke controller `/init` actions. Persistence order is
   migration, cache, reference, configuration, progress, harvest, SIEM, Figshare,
   storage, identity, branding, vocabulary after the root runtime.
2. Pending lexical migrations; core bootstrap; ordered hook bootstraps;
   `DashboardConfigService.initialiseAfterBootstrap`; optional config export;
   readiness callback. Failure cleans persistence and invokes the callback with
   the original error; cleanup behavior belongs to SR-022/SR-024.
3. Core bootstrap: brand → roles → reports/named queries → roles-with-brand →
   users → path rules → record types → dashboard types → workflow steps → forms.
   Then vocabulary/record bootstrap imports, cron scheduling, translations,
   AppConfig, dynamic branding binding, Figshare vocabulary, Agenda init,
   workspace types/cache, storage health check and record-schema bootstrap.
   This already starts/schedules work before a future explicit activation gate.

Record-type requirements to preserve in SR-008/SR-009:

- `RecordTypesService` extends `Core.Service`/`CoreBase`. Its constructor starts
  an unawaited `processDynamicImports()` chain; logging and Lodash/config/service
  access remain global. Inject reference repositories, brand/config slices,
  logger and storage-capability operation; do not pass the whole Sails owner.
- `bootstrap(brand)` reads persisted definitions by brand. With `bootstrapAlways`
  it removes all brand definitions first. If none exist, it validates **all**
  configured record-schema definitions before creating them sequentially, then
  populates its service cache and checks storage capabilities. Existing definitions
  are also schema/capability validated and cached. Deletion/partial creation is
  not transactional; only disposable fixtures may exercise replacement.
- `create`, `get` and `getAll` preserve RxJS Observable behavior and field
  selection. The service's `recordTypes` cache is currently owned indirectly by
  the module-wide exported service singleton, not by a new application instance.
- Schema checks run only when `recordSchema` is enabled and a definition is
  present; invalid paths yield `RecordTypeRecordSchemaConfigurationError` with
  structured problems and sanitized record-type names. Full schema compilation
  additionally needs storage readiness and registered contributors, and currently
  runs late at `bootstrapRecordSchema()`.
- Concurrency policy normalizes when definitions are created. Strict mode
  requires the configured storage service's capability contract. Bootstrap checks
  **stored** policies too. Each mutation-time
  `resolveConcurrentModificationPolicy()` rereads the stored definition (projecting
  `concurrentModification`) and checks capability again; missing/malformed policy
  fails closed. Startup caching must not freeze later administrator changes.

Additional dependencies confirmed: SR-008 needs SR-015's storage capability or an
explicit injected equivalent; SR-022 needs contributor discovery before schema
bootstrap and all hook targets before dashboard post-bootstrap. These are existing
minimum dependencies to preserve, not permission to start those phases in P0.

## Process-level caches and PDF ownership

- Core `services/index.ts`: `serviceCache`, contributor discovery state/registry;
  `controllers/index.ts`: `controllerCache` (including webservice keys).
  SR-007/SR-014 must resolve overrides before constructing a discarded singleton.
- `CoreBase` keeps namespaced logger state on instances; converted instances must
  stop finding Sails and starting asynchronous work in constructors (SR-007).
- `api-routes/route-resolution.ts`: cached route array/map, reset in current
  bootstrap (SR-026/SR-027). `hooks/hookDiscovery.ts`: manifest/resource discovery
  cache (SR-012/SR-013).
- `config/http.config.ts`: lazy session/Companion middleware, Companion mount/socket
  wired flag, body-parser skip-config/matchers (SR-028/SR-042). Passport is currently
  imported/shared; require per-app composition in SR-028/SR-038.
- Record types, branding/AppConfig, schema validators and other service caches
  belong to service instances currently reached through global export caches.
  SR-007/SR-021 must preserve dynamic invalidation while isolating instances.
- PDF `src/index.ts` calls imperative config merge, then merges Agenda jobs by
  name, and waits for `hook:moduleloader:loaded` to register its typed AppConfig
  model. `PDFService.init()` waits for storage/datastream/`ready`, owns generation
  and retry fibers, and patches `sails.lower()` to interrupt them. Cleanup errors
  are logged while lowering proceeds. SR-016/SR-023/SR-024 must replace the event
  and patch paths with awaited activation/drain and observable retained ownership.

## Executed checks

The source characterization above was followed by these real checks on Node
`26.11.1` / npm `11.20.0`, TypeScript `5.9.3`, ts-node `10.9.2`, Mocha `11.7.6`:

```sh
node support/specs/sails-retirement/evidence/characterize.cjs > support/specs/sails-retirement/evidence/characterization.json
```

Exit **0**, recorded against execution commit
`2f5f5490e` and unchanged domain source from the integrated baseline. The script
asserts actual array/function/Agenda behavior and invokes installed Sails
moduleloader/userconfig functions over temporary config files: base, environment
folder, environment file and local values survive as distinct keys; local wins
the file layers, then explicit overrides win. No application, database, worker or
listener is constructed for this characterization. It also records **152 unique
core contract routes**, **331 core route-table entries**, policy chains and the
three discovered hooks in their real precedence order. Each route/group has a
migration owner; institution overrides are explicitly outside this core snapshot.

The exact focused Mocha command is in `p0-execution.md`: **116 passing, 0 failing,
0 pending**, including loader merges, discovery/lookup, lexical migration order,
bootstrap failure/order, ConfigService dynamic/branded behavior, record-schema
validation, stored concurrency policy and strict storage-capability cases.
`logs/focused.log` preserves case names; the prior build/import/timeout failures
are retained and explained in the execution record. These are existing tests,
including fake repository collaborators where the suite uses them; they are not
the P1 standalone persisted-module proof.

SR-004 conclusion: characterization and acceptance are satisfied. The imperative
writes, instance caches, PDF events/shutdown and pilot prerequisites have concrete
owners; no runtime extraction or lifecycle change was implemented in this task.
