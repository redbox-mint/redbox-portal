# Preparing persistence indexes

Fresh default dev/test stacks mount `support/resources/mongodb-persistence-indexes.js`
into MongoDB's official init directory. Hook archetypes ship the same script.
It creates the cache/M name indexes, R key indexes, Q dashboard/UID indexes and
J2 lineage/query, J3/J4 and V lookup indexes, plus full S attachment/Counter indexes in `redbox-portal`
and record/deletedrecord/recordidentity/schema/reference/audit indexes in `redbox-storage`, with the qualified uniqueness flags
and simple collation. It runs only when MongoDB initializes
an empty data volume. It never deletes documents, removes indexes or discovers
constraints from model declarations. A custom database needs application-aware
preparation using the command below.

Existing volumes do not rerun init scripts. Keep the qualified engine/FCV and
volume, stop application writers and migration runners, and take the deployment's
backup/checkpoint. Run the following **single application-aware command** from
the application directory, with the same `NODE_ENV`, configuration, hooks and
protected datastore credentials as the application. Remove all backend selectors before running this stopped maintenance process:

```bash
npm run persistence:indexes -- --inspect
```

Inspection is the default mode and performs no datastore writes. The command
loads the effective Sails config and hooks with `hooks.orm=false`; it does not lift HTTP, run pre-lift setup, initialize domain
services, start workers or execute migration bodies/business bootstrap. Normal
loader generation may create missing shim files; existing overrides are retained.
An app in another directory can be selected with `--app /path/to/application`.

The report contains only group/backend/collection (and index name for multi-index J2 scopes), index readiness and duplicate
counts. It does not print document names, payloads, connection URLs or credentials.
Current selected scopes are:

| Group | Persistence owner | Required index |
| --- | --- | --- |
| Cache | `prisma` | `cacheentry`, unique full `{name: 1}`, simple collation |
| M | `prisma` | `migration`, unique full `{name: 1}`, simple collation |
| R | `prisma` | `recordtype`, `dashboardtype`, `report`, `namedquery`, unique full `{key: 1}`, simple collation |
| Q | `prisma` | `dashboardconfiguration`, unique full `{branding: 1}`; `i18nbundle` and `i18ntranslation`, unique full `{uid: 1}`; simple collation |
| J3 | `prisma` | Eight indexes on `securityevent` and `siemdeliveryattempt`: global unique eventId, brand polling/recovery/retention and delivery history; simple collation, no TTL. See [J3 operations](../specs/waterline-retirement/p5c-j3-operations.md). |
| J4 | `prisma` | Three indexes on `figsharesync`: full unique OID, partial unique scalar namespace/article binding, numeric dispatch polling. See [J4 operations](../specs/waterline-retirement/p5d-j4-operations.md). |
| J2 | `prisma` | 14 indexes: four on `harvestrun`, four on `harvestrunchunk`, six on `harvestrecordevent`; unique full run brand/type/source/source-run dimensions and chunk run/hash/attempt; simple collation |
| V | `prisma` | 21 nonunique simple-collation lookup indexes across the seven vocabulary/Figshare vocabulary collections. Retain compatible existing unique constraints; never infer uniqueness from `Entity.indexes`. See [V operations](../specs/waterline-retirement/p8-v-operations.md). |
| B | `prisma` | Two nonunique simple-collation lookup indexes: brandingconfig `{name: 1}` in `mongodb`, brandingconfighistory `{branding: 1, version: 1}` in `redboxStorage`. Both existing datastores, including separate servers, are inspected. See [branding persistence](Branding-Persistence.md). |
| U | `prisma` | Seven built-in ObjectId `_id` scopes: user, role, userlink, useraudit, pathrule, workspaceapp and the loaded role_users__user_roles junction. Existing login/email/ownership indexes and their collation are retained unchanged; no new unique constraint or DDL. See [identity persistence](Identity-Persistence.md). |
| S | `prisma` | 35 scopes: seven attachment/Counter scopes in `mongodb`; 28 record/deletedrecord/recordidentity/schema/audit scopes in `redboxStorage`. Includes global Counter name uniqueness and the existing OID/lifecycle/source-intent indexes. Startup only inspects; existing Counter duplicates must be resolved before explicit preparation. See [storage persistence](Staged-Storage-Persistence.md). |

All groups use Prisma and the command inspects all 99 scopes across 40 collections. Any explicit selector (including `prisma`) fails with removal guidance. AppConfig duplicates remain permitted; no brand/key unique index is added. Secret leases use string `_id` uniqueness and BSON Dates without TTL. J1 checks built-in `_id` and collation without secondary indexes. Mappings are fixed in the Prisma contracts; institution model registrations are refused before DDL. SIEM events and attempts both use `datastores.mongodb`.

V accounts for 21 scopes across seven collections. The former safe-mode baseline
created only `_id`, despite entity-level unique declarations.
The default empty Figshare source key is incompatible with installing its declared
sparse unique index. Preparation deliberately adds lookup indexes without new
uniqueness, retaining compatible constraints that operators already installed.
Resolve the declaration/default mismatch as a separate decision. V startup only
inspects; port institution fields and callbacks before upgrading.

Current TX-PARITY-01 OCI qualification uses pinned MongoDB **9.0.4 / FCV 9.0**
standalone; earlier MongoDB 8 evidence remains historical. This migration does
not change the engine, FCV, topology or stored documents.

After reviewing all reports, explicitly invoke:

```bash
npm run persistence:indexes -- --ensure
```

Ensure inspects **every selected scope before any index creation**. Known
duplicates or conflicting definitions block creation for all selected scopes.
Compatible existing indexes under other names are preserved. Missing indexes
are created using the owning groups' existing inspect/ensure APIs, then verified.
The command never deletes data, drops/replaces indexes or repairs duplicates.
Resolve such problems separately with their owner. Keep writers stopped: DDL
can race new writes and is not an atomic transaction across groups.

Exit codes: **0** means every selected scope is ready; **2** means known missing,
duplicate/conflicting indexes or invalid command arguments; **1** means a config,
mapping, connection, permission or execution failure. Native errors are redacted.
After ensure, run inspect again, then restart the designated deployment runner
and admit traffic after startup/migrations succeed. Unique ledger names do not
make migration bodies exactly once across nodes.

For the supplied default development stack, keep its MongoDB service running and
run the same command in a one-off application container with its existing config:

```bash
docker compose --profile mount -f support/development/docker-compose.yml run \
  --rm --no-deps --entrypoint node rbportal-mount app.express.cjs --maintenance=indexes:inspect
docker compose --profile mount -f support/development/docker-compose.yml run \
  --rm --no-deps --entrypoint node rbportal-mount app.express.cjs --maintenance=indexes:ensure
```

Use the institution's actual Compose project/service and current installed core
artifact. Existing hook apps can add the same npm script shipped by the archetype:
`"persistence:indexes": "node node_modules/@researchdatabox/redbox-core/bin/persistence-indexes.cjs"`.
No extra database URL is introduced. Do not use volume deletion or `down -v` to
repair an existing deployment; see [backup/recovery](Cache-Persistence-Recovery.md).

When qualifying another group, extend the one fresh-stack script and its hook
template, and this command's deployment-only coordinator using that group's
inspect/ensure APIs. Extend the real fresh/upgrade regression too. There is no
generic schema synchronization, and normal startup stays inspect-only.

Institution hook/configuration guidance: [persistence migration](Persistence-Migration.md).

J4 partial-key duplicate auditing excludes null/missing bindings and refuses unqualified array keys before DDL. The fresh-stack script includes its three scopes; all deployments inspect them.

Full S preparation preserves its existing unique/sparse/partial schema indexes and
ISO attachment versus BSON Date schema timestamps. IntegrationAudit adds no
secondary index. Record index preparation now belongs to S. Session/Agenda initialization remains independently
owned. No transaction gate applies to this migration. See [S operations and rollback](Staged-Storage-Persistence.md).

B preparation never adds declared history uniqueness or moves history. The loaded
safe-mode baseline supplied only `_id`; duplicate versions remain permitted.
Compatible full uniqueness installed by an operator is retained. Startup inspects
both datastores without DDL. Use the same stopped-writer maintenance boundary for
both databases and external font/logo/favicon checkpoints. TX-PARITY-01a's atomic
conditional Prisma write requires no index or document rewrite.
