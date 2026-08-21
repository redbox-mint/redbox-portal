# Changelog

## Unreleased

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
