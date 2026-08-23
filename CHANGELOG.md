# Changelog

## Unreleased

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
  `isJournal`, `mutationFileId`, `attemptCount`, `lastAttemptAt`, and
  `lastSafeErrorCode` for reconciliation. Save outcome messages use
  translatable language keys throughout the browser flow. Confirmed physical
  attachment delete tombstones are reaped after reconciliation.
- Audited English translation metadata and added a repeatable duplicate-key, placeholder, and plural-form check.
- Moved demo locale fixtures under `language-defaults/demo/` and excluded them from locale discovery and synchronisation.
- Extracted form upload, data-location, typeahead, navigation, and confirmation defaults into translatable keys.
- Extracted DOI and Figshare server-side error prefixes/messages into translation keys.
