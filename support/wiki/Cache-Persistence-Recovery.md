# Persistence recovery

Stop producers and drain accepted requests, jobs, Prisma operations and GridFS streams before taking or restoring a checkpoint. Capture both logical datastores (`mongodb`, `redboxStorage`), indexes, configuration, hooks and primary binary objects at the same stopped-writer boundary, including across separate servers. Test restores in isolated namespaces and verify BSON types, indexes, asset hashes and public reads.

An error acknowledgment can follow an applied write. Reconcile durable revisions/incarnations, lifecycle IDs, lease/cleanup tokens, attachment generations, history versions and actual bytes before retrying. Counter allocations can leave gaps; never reuse an uncertain allocation. Multi-step operations retain partial failures and ordered compensation; they are not transactions.

Do not delete duplicate rows, replace indexes, replay recorded migrations or erase permanent record identity automatically. Use the scoped [index commands](Persistence-Index-Preparation.md) to inspect and explicitly prepare reviewed indexes with writers stopped. Startup is inspect-only.

Restoring a checkpoint needs a defined loss window and reconciliation of later writes/external effects. Code rollback requires a compatible image and matching hooks/configuration; there is no runtime backend switch. See [persistence migration](Persistence-Migration.md).
