# Storage persistence on next

Prisma owns all storage operations. Backend selectors and the ORM have been removed. See [persistence migration](Persistence-Migration.md). No transactions are introduced.

| Operation | Default owner |
| --- | --- |
| Record/DeletedRecord CRUD, revision/incarnation CAS, lifecycle/delete/restore/purge, source intents and permanent recordidentity | Prisma model operations |
| Record authorization, schema-grant authorization and U-participating access assignment | Prisma model operations, ordered as before |
| Counter | Prisma single atomic increment/upsert returning the allocated number |
| Attachment metadata, OID rebind, journal/cleanup fencing and access audit | Prisma model repository |
| Schema artifact/reference and record/integration audit operations | Prisma model storage |
| Revision maintenance, dotted Json sorting/counting and stored record projection | Prisma models / typed query builder |
| GridFS bytes | Existing app-owned direct-driver resources, permanent ADR 0004 exception |

Every operation in the storage service/capability contract selects the same S
owner. Multi-step operations retain their write order, compensation and partial
failure outcomes. They do not become transactions or exactly-once operations.

## Preparation

Stop writers/migration runners and retain matching database, byte, hook and config
checkpoints. Follow [index preparation](Persistence-Index-Preparation.md): inspect,
review every selected report, explicitly ensure, then inspect again. S requires
**35 scopes** across nine indexed collections: seven attachment/Counter scopes in logical
`mongodb`, and 28 record/deletedrecord/recordidentity/schema/audit scopes in
`redboxStorage`. All defaults select **99 scopes across 40 collections**.
IntegrationAudit has no secondary index. All selected storage collections require
simple collation. Startup is inspect-only; fresh-volume scripts and generated
hook templates prepare the same indexes. Existing volumes require explicit ensure.

Counter's existing declared **global unique name** is explicitly prepared, as are
the existing record OID/identity/lifecycle indexes. Safe-mode Waterline did not
necessarily create the Counter index. Existing duplicates or conflicting indexes
block preparation before DDL; there is no automatic cleanup, index replacement or
data rewrite. A name already belonging to another brand is not a second counter.
Concurrent successful Prisma callers receive distinct numbers. An ambiguous
acknowledgment can consume a number; reconcile it instead of blindly retrying.


Collections and datastore routing are unchanged. Record content, authorization (including legacy aliases),
workflow/previousWorkflow, notification and source intents are Json; record/attachment/Counter timestamps remain
ISO strings, while schema timestamps/pin expiry remain BSON Dates. Model reads
may expose absent optional fields as null; patches set supplied fields only.
Authoritative lifecycle snapshots retain physical absence and explicit nulls
separately through typed result shapes; decoded read-null defaults are not written back. Institution fields/callbacks/mappings and rich BSON require qualification;
declare real fields and port callbacks before upgrading.

## Recovery and rollback

Stop producers and drain accepted workers, requests and byte streams before shutdown. Retain matching database/index, binary, configuration and hook checkpoints. There is no runtime backend switch.

Reconcile unknown writes using durable revisions/incarnations, lifecycle operation
IDs, journal generations/cleanup tokens and actual byte existence. A failed
acknowledgment can follow an applied write. Never erase recordidentity to reuse
an OID or replay a recorded migration body. Code rollback does not undo subsequent
writes or external effects; restoring a checkpoint requires a defined loss window
and reconciliation. Historical P10 prior-image evidence is not new phase-7
qualification.

[Phase 7 evidence](../specs/waterline-retirement/evidence/prisma-phase7.md) records
bidirectional raw formats, partial failures, Counter concurrency and the default
core/storage/portal/API checks. Earlier [P10 validation](../specs/waterline-retirement/p10-s-validation.md)
and [operations](../specs/waterline-retirement/p10-s-operations.md) describe the
historical staged implementation. ADR 0004/TX-PARITY-01 supersede their transaction
and campaign gates. No browser, prior-image or budget campaign is repeated here.

GridFS bytes use the native MongoDB driver. Agenda and sessions retain their
independently qualified owners. Native resources drain before Prisma clients
and their borrowed pools close. [Qualified database profiles](Installation-Guide.md#qualified-deployment-scope)

## HTTP shutdown ownership

The native session boundary and bound Fastify controller actions share request ownership.
Socket closure alone does not finish accepted controller work. Shutdown waits for
returned action promises, including writes after an early response, and for work
registered with `recordBackgroundOperation`.
API2 actions return a promise covering the complete operation, including after
client disconnection. Qualified core adapters explicitly retain callback work. Return the existing promise when a
synchronous action delegates to an async implementation.

A handler that cancels after disconnection without ending the response must return
a promise that settles after cancellation/cleanup; this includes streamed downloads.
The framework cannot infer completion of an arbitrary detached callback that never
attempts a response. Register auxiliary work before returning or ending the response;
do not assume a returned RxJS subscription includes nested subscriptions or async
observer callbacks. Raw HTTP adapters are qualified core integrations with explicit ownership;
extension actions use the public controller seam. See the
[API2 guide](../specs/fastify-migration/extension-api2.md). No timeout declares unfinished
accepted database writes complete.
