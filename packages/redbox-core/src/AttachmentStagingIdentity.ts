const ATTACHMENT_STAGING_FILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** A staging object ID is one bounded key segment, never a path. */
export function normalizeAttachmentStagingFileId(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return ATTACHMENT_STAGING_FILE_ID_PATTERN.test(normalized) ? normalized : undefined;
}
