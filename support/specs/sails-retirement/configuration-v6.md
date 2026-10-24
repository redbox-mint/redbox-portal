# Implemented v6 startup configuration (P3)

Use the narrow `@researchdatabox/redbox-core/configuration` public entry. This
contract serves the internal v6 Express default and maintenance. `npm start`
and Docker run `app.express.cjs`; the explicit Sails comparison scripts remain
only until P8. P7 internal promotion does not establish production release
acceptance; institution qualification and final Sails-free artifacts remain gates.

`loadStartupConfiguration` awaits explicitly selected application, environment and
local data modules. An ESM module default-exports an object; CommonJS uses
`module.exports`. Files may await imports. They must not acquire clients, start
jobs, write application data or install signals. Do not point this loader at
legacy generated config shims or a whole Sails config directory.

Precedence is core defaults, resolved extension contributions low to high,
application, selected environment, local, supported environment inputs, supported
CLI inputs. `resolveStartupConfiguration` accepts already-loaded layers. Schemas
validate each merged layer before any consumer initializes. Domain compositions
extend `deploymentSchema` with their concrete section schemas and supply their
core defaults. No general container or arbitrary Sails semantics are provided.
All ordinary arrays now replace (v5 Lodash merged by array index). Branding arrays
continue replacing. Agenda job arrays normalize to maps and merge by unique name;
rename/removal is an explicit configuration edit. Undefined contributes nothing;
null is an explicit value accepted only where the section schema permits it.
Functions survive by identity only at an explicitly declared `executablePaths`
position whose schema validates the function. Snapshots own and freeze data;
caller-owned declarations remain mutable. Dynamic brand/AppConfig data is separate.

## Deployment example and conversion

An institution can select its own files explicitly, including custom environment
names, without recreating Sails discovery:

```js
const { loadDeploymentConfiguration } = require('@researchdatabox/redbox-core/configuration');
const config = await loadDeploymentConfiguration({
  environment: 'institution-production',
  files: {
    application: '/etc/redbox/application.cjs',
    environment: '/etc/redbox/institution-production.mjs',
    local: '/run/redbox/local.cjs',
  },
  env: process.env,
  argv: process.argv.slice(2),
});
```

Example application file, with real secrets supplied through the deployment's
existing secret channels:

```js
module.exports = {
  server: {
    publicUrl: 'https://research.example.invalid/research',
    rootContext: '/research',
    trustProxy: ['loopback'],
  },
  datastores: {
    mongodb: { url: process.env.INSTITUTION_CORE_MONGO_URL },
    redboxStorage: { url: process.env.INSTITUTION_STORAGE_MONGO_URL },
  },
  redboxSession: {
    adapter: 'mongo', name: 'redbox.v6.sid',
    secret: process.env.INSTITUTION_SESSION_SECRET,
    mongoUrl: process.env.INSTITUTION_SESSION_MONGO_URL,
    cookie: { httpOnly: true, secure: true, sameSite: 'lax', path: '/research' },
  },
  auth: { defaultBrand: 'institution', defaultPortal: 'rdmp' },
  brandingConfigurationDefaults: {
    auth: { active: ['local', 'oidc'], oidc: { opts: { issuer: 'https://identity.example.invalid' } } },
  },
  storage: {
    primaryDisk: 'objects',
    disks: { objects: { driver: 'gridfs', config: { datastore: 'redboxStorage' } } },
  },
};
```

The auth provider data above is retained bootstrap data. The production composition
supports local, OIDC and AAF providers; configure and qualify each deployment's
actual provider. Existing account mappings persist; v6
sessions deliberately require login. Session configuration is optional until its
owner is selected; when enabled, provide its complete base configuration before
applying environment secret/URL overrides. No baked-in session secret is supplied.

`convertLegacyDeployment(oldData, source)` converts supported data to one layer;
pass the layer to `resolveStartupConfiguration`. It never imports old files,
loads hooks, emits secrets, or mutates the input. Unsupported meaningful keys
throw. Use manual typed extension conversion for domain keys outside this small
operational mapping; do not drop them merely to make the converter succeed.

| v5 key | v6 treatment |
| --- | --- |
| `datastores.mongodb/redboxStorage` URL, split credentials/database, driver options | Retained; existing offline Mongo resolver validates them. Keep two logical datastore names. |
| Datastore `adapter/migrate/schema/identity`, `models/orm/persistence` | Unsupported; follow persistence migration guidance. |
| `redboxSession` Mongo URL/options/dbName, cookie, name/secret/TTL | Retained; owned Mongo store, no `client/clientPromise` injection. Secret minimum 32 characters. |
| `session: false` | Removed disabled Sails hook setting; ReDBox sessions remain separate. Other Sails session adapters fail conversion. |
| `auth`, `brandingConfigurationDefaults` | Retained configuration data, including default brand/portal and local/OIDC/AAF bootstrap settings; dynamic edits remain repository operations. |
| `storage` disks/serviceName/keyPrefix | Retained; fs, S3 and GridFS driver declarations validated. |
| `port`, `host`, `appUrl` | `server.port`, `server.hostname`, `server.publicUrl`. |
| `http.rootContext`, `http.trustProxy` | `server.rootContext`, `server.trustProxy`; URL root must be empty or an absolute path without a trailing slash. |
| `agendaQueue` options/jobs | Retained, jobs merged by name; declaration does not enable processing. |
| `http.middleware`, `hooks`, `globals`, `blueprints`, bootstrap callbacks | Unsupported; port the actual capability to named extension/host lifecycle operations. |
| `_delete`, `_dontMerge`, service/controller injection and config-time writes | Unsupported in startup data; explicitly replace arrays, declare selected factories and await named bootstrap work. |

## Environment and command-line inputs

Canonical inputs: `REDBOX_PORT`, `REDBOX_HOSTNAME`, `REDBOX_PUBLIC_URL`,
`REDBOX_ROOT_CONTEXT`, `REDBOX_TRUST_PROXY` (JSON boolean, hop count or trusted
address list), `REDBOX_STOP_DEADLINE_MS`, `REDBOX_MONGODB_URL`,
`REDBOX_STORAGE_MONGODB_URL`, `REDBOX_SESSION_SECRET`,
`REDBOX_SESSION_MONGODB_URL`, `REDBOX_AGENDA_BACKEND`,
`REDBOX_AGENDA_MONGODB_URL`, `REDBOX_AGENDA_COLLECTION`,
`REDBOX_AGENDA_PROCESS_EVERY`, `REDBOX_AGENDA_HISTORY_RETENTION_HOURS`.
Unknown `REDBOX_*`/`sails_*` inputs fail. Unrelated process variables are ignored.
Environment selection is explicit at file selection time; a config module does
not silently reselect the environment. No implicit `rc`/`.sailsrc` loading.

CLI accepts only `--port=`, `--hostname=`, `--public-url=`, `--root-context=`,
`--stop-deadline-ms=`. Duplicate/unknown flags fail. CLI secrets are deliberately
absent. Defaults: port 1500, hostname 0.0.0.0, root empty, trust proxy false,
stop deadline 30000 ms. `publicUrl` is explicit and must include the deployment
root path; it does not change implicitly when a listen port is overridden.

`convertLegacyEnvironment` is an explicit preparation helper. It converts
`sails_port/host/appUrl`, `sails_http__rootContext/trustProxy`,
`sails_datastores__mongodb__url/redboxStorage__url`,
`sails_redboxSession__secret/mongoUrl` and `sails__redboxSession_secret/mongoUrl`.
Both characterized Agenda spellings, `sails__agendaQueue_options_<key>` and
`sails_agendaQueue__options__<key>`, map backend/db/collection/processEvery/
historyRetentionHours to the canonical inputs above. Canonical inputs win over
converted aliases; two legacy aliases for one target fail as ambiguous. Other
`sails_*` inputs fail with their source/path, never their value. Rewrite deployed
configuration to canonical inputs; this helper is not a permanent Sails loader.
Do not write converted secret-bearing values into committed files or raw debug
snapshots. Diagnostic errors omit values, driver exceptions and custom Zod
messages. No raw configuration debug-export switch is provided by this interface.

Synthetic fixtures test these conversions. Institution designation and actual
institution credential/proxy/provider qualification remain SR-005/SR-045–049.

## Dynamic state and legacy effects

`resolveBrandConfiguration(brand, block, { defaultBrand, readBrand, defaults })`
reads the current hydrated AppConfig state for every call, then default-brand
state and startup branding defaults. False and null are explicit values. It adds
no cache; existing AppConfig save/reload/cache-invalidation operations remain the
source of dynamic changes. The comparison `ConfigService.getBrand` delegates to
this same function and supplies its old per-brand-map fallback. A startup snapshot
contains defaults, never a frozen copy of live administrator settings.

Neutral extensions use config declarations, selected factories, package-relative
view/asset roots and awaited bootstrap work. They do not call `mergeHookConfig`.
Legacy file walking, locale/file copying and service/controller injection live in
`compat/sails/configuration.ts` until their comparison consumers retire. Native
asset serving/production preparation remains SR-040/SR-047. Branded writes in that
adapter return an awaitable completion and are registered on the persistence owner
before executing. Comparison bootstrap awaits them before dashboard finalization
and activation, even when an old caller ignores the return value. Cleanup waits
all accepted siblings; an override failure blocks readiness and is reported without
its payload. Existing init-only values are distinguished by
`AppConfigAlreadyExistsError`; unrelated write errors no longer count as success.

Shutdown uses **30,000 ms** by default for the application, Express host and Agenda
worker drain. Bind `server.stopDeadlineMs` to the host's `stopDeadlineMs` and the
application initialization options; Agenda can separately set
`agendaQueue.options.drainTimeoutMs`. Explicit stop calls can select a shorter
attempt deadline. All intervals must be positive bounded timer values. A deadline
failure retains owned work and dependencies for retry; it does not certify a
successful stop or roll back accepted writes.

Give containers a termination grace longer than the configured drain deadline
plus connection/native cleanup overhead (for the default, start with **45 seconds**,
e.g. Compose `stop_grace_period: 45s`, and measure representative uploads/jobs).
Longer accepted uploads may require larger explicitly configured bounds. Do not
start maintenance or a new deployment while a failed stop retains writers.
SIGKILL/forced process exit can leave partial writes or external effects and is an
operator recovery action. The pinned Agenda processor also has a passive watchdog
delay up to `lockLifetime/2` after a handler completes; it can keep Node's event
loop alive beyond resource closure. Allow for the actual configured lock lifetimes
when choosing process termination grace; no premature pool closure is used to
shorten that delay.
