# Changelog

## Unreleased

- Added concurrent-record modification protection across browser, API v1/v2,
  datastream, internal-writer, and delete/restore/purge paths. Record types can
  use compatible `last-write-wins`, migration `observe`, or enforcing `strict`
  policy; supplied opaque ETags are always honored, successful writes advance
  server-owned revisions, and bundled Mongo storage provides atomic CAS plus
  permanent explicit-OID incarnation ownership. Generated forms are bound to
  the authoritative form/workflow fingerprint, conflicts use private typed
  projections, and unresolved in-memory browser work is protected on native
  navigation in the shipped bootstrap-only form host. An SPA host can opt into
  the same decision through the exported route guard, but must register it on
  its form route. This release also adds lifecycle recovery, bounded
  privacy-safe telemetry/counters, final revision/resolution audit fields, API
  contract updates, Bruno fixtures, and an operator rollout/rollback runbook.
  Tokenless legacy lifecycle and browser-create callers remain compatible in
  `last-write-wins` and `observe`; `strict` requires the applicable exact tag or
  authoritative browser form fingerprint. Supplied tokens are enforced in
  every mode. Public API datastream download and listing now enforce the same
  brand and view-access boundary as the metadata read, answering `404`/`403`
  instead of serving an inaccessible OID. Mongo startup also requires unique
  active, tombstone, and incarnation-ledger OID indexes before advertising the
  concurrency capability.
  Automatic browser rebasing now preserves edits made after its candidate
  snapshot or during asynchronous control replacement, and failed retries
  return to an export/reload/resubmit-capable state. A failed mandatory
  post-commit reload is reported as saved-with-warnings with deferred
  projection/index/audit reconciliation instead of as a clean save. Routine
  successful concurrency telemetry is emitted at INFO rather than WARN.
- Added authoritative server-side execution of form-defined validators across
  record create, metadata update, workflow transition, and awaited postSync
  secondary writes. The server independently resolves exact forms, conditional
  groups, sanitized JSONata context, named validation operations, advisory
  groups, authorization restrictions, and shadow/enforce rollout policy while
  preserving Angular's interactive validation UX and API v1 compatibility.
  Validation failures use safe field/pointer/lineage-aware save issues, and
  API/Angular clients can send optional server-owned `operation` intent.
  Rollout defaults to shadow and includes bounded privacy-safe structured logs,
  OpenTelemetry duration/outcome/error/timeout/configuration instruments, a
  per-record-type/operation/form/code shadow report, and durable fingerprinted
  mode-change audits. Explicit internal bypasses and the direct `createBatch`
  v1 batch bypass are synchronously and durably audited even when ordinary
  record auditing is disabled. Storage-service implementers must provide
  `createRecordAudit()` and return confirmed success.
- Added typed record-save outcomes with request correlation, item-level
  attachment completion, durable attachment mutation journaling, and
  persisted-warning indexing/audit handling. Added API v2 save contracts and
  form-level field-aware validation/focus behavior. `AttachmentMetadata` now
  supports `attachmentId`, `operation`, `mutationState`, `generation`,
  `isJournal` and `mutationFileId` for reconciliation. Save outcome messages use
  translatable language keys throughout the browser flow. Confirmed physical
  attachment delete tombstones are reaped after reconciliation.
- Audited English translation metadata and added a repeatable duplicate-key, placeholder, and plural-form check.
- Moved demo locale fixtures under `language-defaults/demo/` and excluded them from locale discovery and synchronisation.
- Extracted form upload, data-location, typeahead, navigation, and confirmation defaults into translatable keys.
- Extracted DOI and Figshare server-side error prefixes/messages into translation keys.
