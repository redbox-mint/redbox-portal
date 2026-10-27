# Configuration and Customisation Guide

## Managing your customisations

Much like in ReDBox 1.8+, it is recommended that you keep your configuration changes in its own repository and overlay them as part of the deployment process.

See the sample customisation repository for an example.

## Explicit v6 startup configuration

The v6 host awaits explicitly selected CommonJS/ESM data modules. Set
`REDBOX_APPLICATION_CONFIG`, `REDBOX_ENVIRONMENT_CONFIG` and `REDBOX_LOCAL_CONFIG`
to absolute filenames. `module.exports = { ... }` or an ESM default object is
supported. Files must remain offline; initialization owns effects.

Precedence is core defaults, resolved extension contributions low to high,
application, selected environment, local, supported environment variables, then
supported CLI inputs. Ordinary arrays replace; Agenda jobs merge by unique name.
Schema validation rejects unsupported meaningful settings before acquisition.
`NODE_ENV` names the environment; it does not discover `config/env` automatically.

```js
module.exports = {
  server: { publicUrl: 'https://research.example.invalid/research', rootContext: '/research' },
  datastores: {
    mongodb: { url: process.env.INSTITUTION_CORE_MONGO_URL },
    redboxStorage: { url: process.env.INSTITUTION_STORAGE_MONGO_URL },
  },
  redboxSession: {
    name: 'redbox.v6.sid', adapter: 'mongo', secret: process.env.INSTITUTION_SESSION_SECRET,
    mongoUrl: process.env.INSTITUTION_SESSION_MONGO_URL,
    cookie: { secure: true, httpOnly: true, sameSite: 'lax', path: '/research' },
  },
};
```

The default cookie name is `redbox.sid`; the example deliberately selects a new
`redbox.v6.sid` for cutover. Set a new name and rotate the secret so v5 sessions
cannot be reused. Defaults are `Secure`, `HttpOnly`, `SameSite=Lax`, with path `/`;
set `cookie.path` to the deployment root when appropriate. HTTPS termination must
match the configured public URL and trusted proxy settings so secure cookies are
issued. Custom browser clients must send that cookie, fetch a new root-scoped
`/csrfToken`, and reacquire progress grants after login. Explicitly allow each
canonical browser origin; a forwarded host does not establish trust. Preserve
upload/staging bytes independently of session invalidation; see
[v6 client compatibility](V6-Client-Compatibility.md).

Use `REDBOX_SESSION_SECRET` (at least 32 characters), `REDBOX_SESSION_MONGODB_URL`
and other documented inputs in [configuration conversion](../specs/sails-retirement/configuration-v6.md).
Legacy `sails_*`/`sails__*`, `.sailsrc`, generated config, arbitrary framework
options and implicit hook registrations are unsupported. The offline converter
accepts data, never imports old files, and reports unsupported keys without
printing secret values. Review every converted setting; do not drop meaningful
settings to pass validation. Dynamic brand/AppConfig data remains separate.

Core section defaults/interfaces live in `packages/redbox-core/src/config/`;
`src/configuration/portal.ts` validates the composed portal. Important sections
include `record`, `auth`, `recordValidation`, `recordSchema`, `solr`, `storage`,
`brandingConfigurationDefaults`, `agendaQueue`, `redboxSession` and `companion`.

For OIDC provider logout, set `auth.logoutOrigins` to the trusted HTTP(S)
origins of the provider's end-session endpoints, for example
`['https://identity.example.edu']`. Origins must have no path, credentials or
trailing slash. When `logoutFromAuthServer` is enabled, only an allowlisted
provider origin survives login session rotation and may receive the logout
redirect. Without an allowlist, logout uses the configured local destination.

### Branding typeface limits (`branding`)

`packages/redbox-core/src/config/branding.config.ts` adds four operator-configurable positive integers (invalid values fall back to the defaults with a logged warning):

| Key | Default | Behaviour |
|---|---|---|
| `typefaceFaceMaxBytes` | `2 * 1024 * 1024` | Maximum compressed bytes for a newly uploaded face |
| `typefaceFamilyMaxBytes` | `8 * 1024 * 1024` | Maximum distinct compressed bytes referenced by a resulting custom draft |
| `historyMaxVersions` | `3` | Newest complete branding versions retained per brand |
| `typefaceOrphanGraceMs` | `24 * 60 * 60 * 1000` | Minimum unreferenced object age before daily reconciliation deletes it |

Lowering limits later affects only new uploads: already active or retained faces are grandfathered and remain publishable and restorable as long as their stored bytes verify. There is no feature flag and no decompressed-size setting. Font objects live on the Flydrive primary disk under `branding-fonts/<brand-id>/<sha256>.woff2` and must persist alongside the database backup (history pruning on upgrade is irreversible).

## Extension configuration

Return pure `config` data in `registerRedboxExtension()`. First-listed-highest
`hookLoadPriority` remains deterministic; ordinary arrays replace. Factories and
executable positions require explicit contracts, not arbitrary config functions.
See [extension loading](Redbox-Loader.md).

### Developer-only Figshare fixture mode

Figshare fixture mode is configured through environment/runtime config, not through brand AppConfig.

- Config key: `figshareDev`
- Intended use: local development, Docker development, and automated tests
- Production behavior: runtime fixture activation is ignored in production

Example:

```javascript
figshareDev: {
  enabled: true,
  mode: 'fixture',
  fixtures: {
    article: {
      id: 'fixture-123',
      url: 'https://figshare.example/articles/fixture-123'
    },
    licenses: [
      { value: 1, name: 'CC-BY', url: 'https://license.test/cc-by' }
    ],
    articleFiles: []
  }
}
```

For machine-specific fixtures, select a private local data module with `REDBOX_LOCAL_CONFIG`.

## Diagnostics and upgrade

Startup errors report the input layer and safe setting path. Review configuration
outside the process using the typed loader; never publish secrets or whole
resolved snapshots. Follow [v6 upgrade/recovery](../specs/sails-retirement/upgrade-recovery-v6.md)
and the [client compatibility list](V6-Client-Compatibility.md).

## AppConfig secret storage

[AppConfig secrets in AWS Secrets Manager](AppConfig-Secrets) describes optional AWS storage for branding-aware password and token fields, deployment setup, and migration behavior.


## Persistence configuration

All groups use Prisma. Keep `datastores.mongodb`, `datastores.redboxStorage` and
`redboxSession.mongoUrl`/`mongoOptions`/`dbName`. Remove all backend selectors,
model configuration and datastore adapter/migrate settings; stale values fail
with actionable guidance. See
[the institution migration guide](Persistence-Migration.md) for exact keys,
fixed model ownership, session pooling, index preparation and upgrade errors.

`custom.cacheControl.noCache` is retired; configure `page.noCache` in v6.
