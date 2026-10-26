# Persistence migration for institutions

All persistence groups use Prisma and the application owns their pools. V6 uses
the standalone Express host. Framework hooks, model/service/controller globals,
`.sailsrc` and generated shims have been removed.

Remove `persistence`, `models` and `orm` configuration, including empty objects,
`RBPORTAL_*_BACKEND` and `sails_persistence*` environment variables. Even an
explicit `prisma` value fails with “Persistence backend selectors have been
removed”. Compose forwards stale host variables so startup can refuse them;
unset them in deployment manifests and host environments.

Keep `datastores.mongodb` and `datastores.redboxStorage`. Their `url` or existing
split connection settings (host, port, user/password, database and driver options)
retain their established parsing. Remove `adapter`, `identity`, `schema`,
`forceLoadAdapter`, `migrate` and `dontUseObjectIds` from datastore settings;
These settings are refused on every datastore, including unused definitions;
startup names the replacement connection keys without echoing credentials.
Session settings remain `redboxSession.mongoUrl`, `mongoOptions` and `dbName`.
Caller-supplied session `client`/`clientPromise` are refused: the app owns its pool.

Hook `hasModels:true` and `registerRedboxModels` exports are unsupported and must be converted to v6 declarations. Remove both. Move callbacks,
validation, defaults and other custom behavior into a service or a plain repository
boundary, and declare stored extension fields in the appropriate Prisma contract.
Use normal model CRUD for persistence; free-form content belongs in declared Json
fields. Regenerate contracts with `npm --prefix packages/redbox-core run generate:prisma`
and rebuild the package. Do not create a replacement global model/query emulator.

Physical collection names, identity encoding and logical datastore ownership are
fixed by these contracts. Custom model `tableName`, `columnName`, datastore and
association overrides are unsupported; migrate the institution data/configuration
explicitly. Both SIEM envelopes (`securityevent`) and attempts
(`siemdeliveryattempt`) use `datastores.mongodb`. Splitting them across datastores
is rejected through the obsolete model-configuration/registration checks. Move
both collections to that datastore before upgrading.

Use the inspect-first [exact shim cleanup](Redbox-Loader.md) for unedited v5 output.
Edited/custom files require explicit review and conversion. No build or startup
generates shims. The model generator is retired; use service/repository contracts.

Resolve repositories lazily after persistence initialization, never during hook
registration. For example, import `getReferenceRepositories` and call
`getReferenceRepositories(owner).forms.findByName(name, brand.id)` inside the service
method. Use the corresponding configuration, identity, vocabulary, branding,
job and storage boundaries for their domains. Reacquire repositories after an
application restart; retained handles reject operations after shutdown.

Before startup on an existing volume, stop writers and run
`npm run persistence:indexes -- --inspect`. Review duplicate data and conflicting
indexes with their owners, then explicitly run `--ensure`. These commands load
configuration without an ORM; they never repair records or drop indexes. Fresh
Compose databases install the same scoped indexes through init scripts.
See [index preparation](Persistence-Index-Preparation.md).

One application runtime owns all MongoDB pools, shared only for equal effective
connection policies. Prisma borrows them. Agenda, sessions, GridFS and binary
version checks use that runtime too. Shutdown drains accepted work and native
resources, closes Prisma clients, then closes pools. GridFS permanently remains
on MongoDB; a future PostgreSQL deployment needs MongoDB for bytes or a different
binary store. The [rewrite register](../specs/waterline-retirement/postgres-rewrite-register.md)
records each native exception and Prisma raw query.

Keep database backups and binary assets together. There is no runtime backend
rollback switch. Recovery to a prior release requires its matching artifact and
a reviewed backup/compatibility procedure; whole-branch recovery qualification
is separate from this implementation phase.
