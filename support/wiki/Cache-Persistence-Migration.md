# Cache deployment migration

Prisma is the only persistence implementation. Follow [persistence migration](Persistence-Migration.md) before upgrading institution hooks and configuration. Remove the entire `persistence` configuration and all backend environment overrides, including values set to `prisma`. Keep `datastores.mongodb` URL, credentials, database and supported connection options. Remove ORM adapter/migrate/model settings.

Stop writers and drain requests/workers. Back up databases, indexes, configuration, hooks and binary stores at a consistent boundary. Prepare the required indexes explicitly using [index preparation](Persistence-Index-Preparation.md), inspect again, start the upgraded application, and verify login, cache expiry, previews and service behavior before reopening traffic.

No collection rewrite, engine/FCV change, transaction conversion or automatic duplicate repair is part of this migration. Counter now allocates atomically. Optional model reads can contain null for missing fields; supplied-field patches preserve physical absence. The old bidirectional comparison campaigns are historical evidence, not runnable upgrade tools.

See [recovery](Cache-Persistence-Recovery.md) for ambiguous writes and checkpoint restoration. Runtime backend switching has been removed.
