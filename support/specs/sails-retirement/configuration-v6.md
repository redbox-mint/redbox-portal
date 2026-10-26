# V6 startup configuration

Use the narrow `@researchdatabox/redbox-core/configuration` public entry. This
contract serves the v6 Express host and maintenance. `npm start` and Docker run
`app.express.cjs`. P8 removes the comparison scripts and adapters. Internal-default
promotion does not establish production release acceptance; institution
qualification and the final artifact evidence remain release gates.

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
names, without recreating Sails discovery. This CommonJS helper awaits the selected
files and returns offline configuration; call it from the institution composition
before constructing the application:

```js
const { loadDeploymentConfiguration } = require('@researchdatabox/redbox-core/configuration');
async function loadInstitutionConfiguration() {
  return loadDeploymentConfiguration({
    environment: 'institution-production',
    files: {
      application: '/etc/redbox/application.cjs',
      environment: '/etc/redbox/institution-production.mjs',
      local: '/run/redbox/local.cjs',
    },
    env: process.env,
    argv: process.argv.slice(2),
  });
}
module.exports = { loadInstitutionConfiguration };
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

S3 disk `key` and `secret` are optional: omit both to use the AWS default
credential provider chain, or supply both for explicit credentials. This matches
the storage driver's existing selection. Figshare defaults may omit the
`embargo.accessRights.embargoType` binding; the configuration model supplies its
existing `article` binding. Supplied credentials and bindings still require their
declared types.

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
PDF and provider callbacks receive this canonical application URL. Browser client
`baseUrl` and template `appUrl` receive its origin because their page root is
provided separately and appended once.

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
source of dynamic changes. A startup snapshot contains defaults, never a frozen
copy of live administrator settings. The former comparison `ConfigService.getBrand`
adapter was removed in P8; extensions use the explicit public helper and inputs.

Neutral extensions use config declarations, selected factories, package-relative
view/asset roots and awaited bootstrap work. They do not call `mergeHookConfig`.
P8 removes legacy file walking, implicit locale/file copying and service/controller
injection with the comparison adapter. Use the owned static build and selected
package-relative roots for assets, and bind application-data writes to explicit
awaited migration/bootstrap operations. Those operations finish before normal
activation; failures prevent readiness. Existing init-only values are distinguished
by `AppConfigAlreadyExistsError`; unrelated write errors do not count as success.
See the [extension lifecycle](extensions-v6.md) and
[hook migration](hook-migration-v6.md) for concrete bindings.

Shutdown uses **30,000 ms** by default for the application, Express host and Agenda
worker drain. Bind `server.stopDeadlineMs` to the host's `stopDeadlineMs` and the
application initialization options; Agenda can separately set
`agendaQueue.options.drainTimeoutMs`. Explicit stop calls can select a shorter
attempt deadline. All intervals must be positive bounded timer values. A deadline
failure retains owned work and dependencies for retry; it does not certify a
successful stop or roll back accepted writes.

Give containers a termination grace longer than the configured drain deadline
plus connection/native cleanup overhead (for the default, start with **45 seconds**,
e.g. Compose `stop_grace_period: 45s` or PM2 `kill_timeout: 45000`, and measure
representative uploads/jobs). The supplied Compose and PM2 templates set these
defaults; increase both the application bounds and supervisor grace together when needed.
Longer accepted uploads may require larger explicitly configured bounds. Do not
start maintenance or a new deployment while a failed stop retains writers.
SIGKILL/forced process exit can leave partial writes or external effects and is an
operator recovery action. The pinned Agenda processor also has a passive watchdog
delay up to `lockLifetime/2` after a handler completes; it can keep Node's event
loop alive beyond resource closure. Allow for the actual configured lock lifetimes
when choosing process termination grace; no premature pool closure is used to
shorten that delay.

Configured RVA and Figshare vocabulary imports retain their original work and
completion scope after a bootstrap timeout (including RVA early-row
reconciliation). The existing per-item failure logging and retry policy remain;
a timeout does not prove cancellation. Application stop drains the original
imports before closing dependencies, or fails its deadline retaining cleanup for
retry. OCFL writable abort likewise joins the disk upload's actual cleanup.

## Baseline input dispositions

The source-derived [R13 inventory](evidence/final-review-r13/configuration-inventory.json)
pins `a49366803164429f9d8bdd249dadcdf856c9d13e`. Its companion
[acceptance ledger](evidence/final-review-r13/configuration-acceptance.json) records
every discovered path, literal fixture, unresolved expression, environment read and
excluded file, with a disposition and provenance. It distinguishes request/record
snapshots and deliberately malformed test fixtures from startup data. A dynamic
property expression is retained as a wildcard, not presented as a new literal key.
This source audit is not the outstanding institution qualification.

Retained settings include `api.max_requests` (default **20**, independent of
`record.search.maxRecordsPerPage`), `api.additionalClientConfig`,
`form.prehydrate.enabled/maxVocabSelections`, `record.form.svgMaxBytes`, arbitrary
JSON `appmode` navigation feature flags, `angularDev`, `storage.mongodb` index
arrays and `redboxSession.stringify`. Record API method declarations accept their
existing lower-case methods and upper-case equivalents. Email templates may supply
only a subject or template; native Nodemailer transport objects and `smtp://` or
`smtps://` URL strings remain supported.
`api.additionalClientConfig` is explicitly public and merges last into the existing
browser whitelist. Server/session/provider configuration is not exported wholesale.
OIDC identifiers remain arbitrary strings, including dots, colons and Unicode.

| Baseline input | Conversion or disposition |
| --- | --- |
| Number-valued startup data, including `api.max_requests`, `record` row/byte/time limits, `form.prehydrate.maxVocabSelections`, Mongo index directions/TTL options, SMTP ports, PDF limits, Agenda limits, datastore driver options and session TTL/cookie durations | Supply actual JavaScript/JSON numbers, not numeric strings, booleans or numeric prefixes. Startup data is typed and does not apply the old incidental `Number(...)`/driver coercions. Declared positive/integer/nonnegative/timer bounds apply. Canonical numeric environment/CLI inputs are parsed explicitly by their named owner. Native JSON option maps preserve their declared driver data; they do not recursively coerce strings. |
| String-, boolean-, array- and object-valued startup data | Supply the declared type; no implicit stringification, truthiness conversion, comma splitting or scalar-to-array conversion. In particular `"false"` is not `false`, a port number is not a URL string, and provider arrays remain arrays. Explicit conversion helpers may parse the documented environment spelling before returning typed data. |
| Mongo `storage.mongodb.indices/deletedRecordIndices/recordIdentityIndices` | Arrays of plain descriptors with `key` as a plain object, e.g. `{ key: { redboxOid: 1 }, unique: true }`. Directions use native numbers or `2d`, `2dsphere`, `text`, `geoHaystack`, `hashed`. Convert driver `Map` or entry-array key representations to an object in the selected module; no `Map`, class instance or function belongs in startup data. Keep native options as JSON data. |
| Functions, constructors, registries, instances, `Map`, `Set`, `Date`, `RegExp`, client/store injection | Convert to plain data or a selected factory/named operation. The only startup executable exceptions are the three declared `dompurify.hooks` callbacks (`afterSanitizeAttributes`, `beforeSanitizeElements`, `afterSanitizeElements`). URI regular expressions use `{ source, flags }`; core defaults perform that conversion explicitly. Datastore/session pools remain runtime-owned. |
| `form.forms`, `form.formConfigRegistry`, `form.defaultForm`, `validators`, `workspacetype_services` | Port generated registries and executable validators/workspace handlers to explicit extension forms, registered validators and selected factories. Form/workflow references and field-validator DSL data retain their domain meaning. `form.prehydrate` remains startup data. |
| `routes`, `controllers`, `policies`, `views`, `dynamicasset`, `cors`, `security`, `http.middleware`, `services`, `queue.serviceName` | Convert executable/discovered HTTP and service wiring to owned route/policy declarations, `PortalHttpOptions` and selected factories. Keep `csp` data and supported `server` root/proxy settings. Dynamic page routes remain owned; add custom dynamic routes explicitly. Supply the Email domain's `disabled` input through its selected factory instead of `services.email.disabled`. |
| `log`, `lognamespace`, `log.requestChronicle` | Use `logging.level`, the selected logger, explicit domain logger inputs and `PortalHttpOptions.requestLogging`. Logger destination/formatter objects and Sails namespace discovery are not startup domain data. |
| `raid` | Convert legacy RAiD data to `brandingConfigurationDefaults.raidPublishing` and the brand's `raidPublishing` AppConfig. Baseline already seeded that branded block from core RAiD defaults and preferred it over the old top-level fallback. Convert the fallback explicitly for a legacy installation that omitted branded RAiD configuration; do not discard its credentials/mappings. |
| `crontab`, `bootstrapTimeout`, `db.waitRetries/waitSleep`, bootstrap callbacks | Use named `schedules`, awaited bootstrap operations and explicit lifecycle/deadline/readiness handling. Sails hook timeouts and startup polling are retired. |
| `dynamicconfig`, `brandingAware`, `passport`, `beforeShutdown`, `recordContractContributorState`, `configmodels`, `appPath`, `startupMinute` | These described discovery or generated runtime state. Use owned AppConfig hydration/brand resolution, authentication/lifecycle/record registries and host `appPath`; a generated startup timestamp is not operator configuration. |
| `autoreload`, `blueprints`, `globals`, `hooks`, `pubsub`, `typescript`, `webpack`, `dontBackupCoreLanguageFilesWhenMerging` | Retired Sails/dev-loader machinery; use explicit extension selection and owned builds. No implicit copying, backup, auto-routing or global injection. |
| `UPPY_*`/provider environment values | Explicitly call `resolveCompanionConfiguration(selectedEnvironment)` in the selected data module and contribute its returned `companion` data. Loading core defaults does not discover ambient provider secrets. This also preserves the documented boolean and upload-URL parsing performed by that helper. |
| `redboxSession.host/port/db/pass/prefix` | Historical Redis comments; baseline selected Mongo and ignored those Redis fields. Redis session adapters are unsupported. Use Mongo URL/options/dbName and the supported native serialization setting. |
| `redboxToCkan`, `enableNewForm`, `datapubs`, `api.endpoint`, `record.customFields`, `features`, separate `reusable*FormDefinitions` fragments | No bundled baseline startup consumer (some are examples, an unimplemented proposal, or build-time fragments included in `reusableFormDefinitions`). They are not silently accepted arbitrary extension namespaces. Move actual extension-owned data into an explicitly owned schema/selected factory. |

The machine ledger's `strictShapes` rows associate scalar/container/function
validation with this section and the matching client-compatibility section. The
recorded inventory's unresolved expressions are never executed to manufacture a
fixture or a credential. Their owning source module and migration disposition
remain visible for review.
