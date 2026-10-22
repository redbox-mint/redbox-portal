# Persistence recovery and code rollback

Runtime backend switching has been removed. Any old backend override, including `prisma`, fails startup with instructions to remove it. There is no installed ORM or rollback adapter.

A code rollback requires a separately retained compatible deployment image and matching hook/configuration checkpoint. Stop writers and drain requests, workers and GridFS streams first. Code rollback does not undo database writes or external effects. Review Counter allocations, record revisions/incarnations, permanent identity records, attachment journals and binary objects before resuming. Never erase the permanent identity ledger to reuse an OID.

See [recovery](Cache-Persistence-Recovery.md) and [persistence migration](Persistence-Migration.md). Fuller whole-branch qualification remains a separate activity under ADR 0004.
