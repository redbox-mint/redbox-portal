/** Authenticated external record reads. Independent of write-schema enforcement. */
export interface RecordGraphqlConfig {
  enabled: boolean;
  /** Maximum resident brand/portal schema snapshots, never record values. */
  cacheEntries: number;
  /** Maximum configured type/workflow/form variants in one scope. */
  maxVariants: number;
  /** Shared across instances. Required for collection cursors; never exposed in discovery. */
  cursorSecret?: string;
  /** Hard bounds for complete GraphQL report CSV exports. */
  reportExport?: { maxRows: number; maxPages: number; timeoutMs: number; maxBytes: number };
}

export const recordGraphql: RecordGraphqlConfig = {
  enabled: false,
  cacheEntries: 16,
  maxVariants: 100,
  reportExport: { maxRows: 10000, maxPages: 400, timeoutMs: 30000, maxBytes: 16777216 },
};

export function validateRecordGraphqlConfig(value: RecordGraphqlConfig): void {
  if (
    typeof value.enabled !== 'boolean' ||
    !Number.isSafeInteger(value.cacheEntries) ||
    value.cacheEntries < 1 ||
    value.cacheEntries > 64 ||
    !Number.isSafeInteger(value.maxVariants) ||
    value.maxVariants < 1 ||
    value.maxVariants > 100 ||
    (value.cursorSecret !== undefined &&
      (typeof value.cursorSecret !== 'string' || value.cursorSecret.length < 32 || value.cursorSecret.length > 4096))
  )
    throw new Error('Invalid recordGraphql configuration.');
}
