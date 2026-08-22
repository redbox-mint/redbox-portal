# Changelog

## Unreleased

- Prepared the record-write boundary for authoritative server-side validators
  (the wider validator feature is not yet declared released). Unauthorized
  workflow transitions now fail instead of falling through as ordinary
  updates; `create(..., targetStep)` enforces `transitionRoles`; replacement
  records returned by awaited `postSync` hooks are persisted; and `updateMeta`
  no longer mutates its caller-owned record. Explicit validation bypasses and
  the direct `createBatch` v1 batch bypass are synchronously and durably
  audited even when normal record auditing is disabled. Storage-service
  implementers must now provide `createRecordAudit()` and return confirmed
  success because it is a required `StorageService` interface capability.
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
