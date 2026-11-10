/** Authenticated external record reads. Independent of write-schema enforcement. */
export interface RecordGraphqlConfig {
  enabled: boolean;
  /** Maximum resident brand/portal schema snapshots, never record values. */
  cacheEntries: number;
  /** Maximum configured type/workflow/form variants in one scope. */
  maxVariants: number;
}

export const recordGraphql: RecordGraphqlConfig = {
  enabled: false,
  cacheEntries: 16,
  maxVariants: 100,
};

export function validateRecordGraphqlConfig(value: RecordGraphqlConfig): void {
  if (
    typeof value.enabled !== 'boolean' ||
    !Number.isSafeInteger(value.cacheEntries) ||
    value.cacheEntries < 1 ||
    value.cacheEntries > 64 ||
    !Number.isSafeInteger(value.maxVariants) ||
    value.maxVariants < 1 ||
    value.maxVariants > 100
  )
    throw new Error('Invalid recordGraphql configuration.');
}
