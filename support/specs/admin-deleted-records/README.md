# Deleted records administration

Delivered on `admin-deferred/05-deleted-records`, based on `admin-deferred/04-export-cancel`.

The deleted-record table shows record type badges and the original deletion actor, supports server-side deletion-period and username filters, and lets an Admin restore or permanently delete selected rows. Selection belongs to the current page and clears after a successful read. Permanent deletion opens the existing accessible confirmation dialog with the selected count. Single-record restore and permanent deletion retain their existing behavior.

## API contracts

- `GET /:branding/:portal/listDeletedRecords` (session/Admin) and the existing `GET /:branding/:portal/api/deletedrecords/list` expose `recordType`, optional translated `recordTypeLabel`, `deletedBy: { id?, username? } | null`, and `dateDeleted`. Existing response envelopes and other fields remain supported.
- Both lists accept `deletedWithin=7|30|any` (omitted/empty means any time) and optional `deletedBy=<exact username>`. Periods are rolling 24-hour days measured by the server clock. Predicates apply to the Mongo query before both counting and pagination, alongside existing brand, permissions, title and record-type filters. Unknown original actors do not match a username filter.
- `POST /:branding/:portal/admin/deletedRecords/bulk` accepts `{ action: "restore" | "destroy", items: [{ oid, entityTag }] }`. The list must contain 1–100 unique ids. Each opaque tag must address that selected deleted representation. Invalid batches return 400 before any mutation. Session CSRF protection and Admin path authorization apply.
- Each item independently follows the single-record brand/edit authorization and RecordsService lifecycle checks. Processing is sequential and continues after a failure. The response is `{ results: [{ oid, status, reason }] }` (or the normal v2 `data` envelope), with `status: succeeded | failed | unknown`. Reasons are bounded public codes; no exception text or record metadata is returned. `unknown` means the caller must verify state before retrying.
- The browser obtains opaque tags using the existing selected-revision preflight. A stale/unreadable selection is reported independently without dispatching that item. Missing/malformed server results and transport failures after dispatch remain unknown. The list is refreshed after results arrive; refresh failures retain the action lock and explicit refresh control.

Contracts live in `packages/redbox-core/src/api-routes/groups/deleted-records.ts` and the existing records group. Regenerate the ignored REST outputs with `npm run doc:api` after compiling core.

## Storage and compatibility

The record type already exists at `deletedRecordMetadata.metaMetadata.type`. New tombstones capture `deletedBy: { brandId, id?, username? }` from the deletion caller, alongside `dateDeleted`. Later lifecycle operations preserve this original snapshot. Responses only expose an actor whose snapshot brand matches the active brand.

Legacy tombstones and background deletions without an identifiable caller show **Unknown**. There is no historical backfill: the latest lifecycle operation or record creator cannot establish the original deleter reliably. No destructive migration or configuration change is required. Storage bootstrap creates compound indexes for brand/deletion date and brand/deleter/deletion date.

## Verification

See [verification.md](verification.md) for suite results, browser checks, screenshots and fixture cleanup. No dependencies were added. Docker integration suites were deliberately not run; the added `test/integration/services/AdminDeletedRecordsAjax.test.ts` covers real session/Admin/CSRF routing for the integration environment.
