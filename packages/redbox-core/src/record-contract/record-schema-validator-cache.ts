import {
  identifyRecordJsonSchema,
  normalizeRecordJsonSchemaDocument,
  type CompiledRecordJsonSchemaArtifact,
  type CompiledRecordJsonSchemaValidator,
  type PublishedRecordJsonSchemaDocument,
} from './record-json-schema-artifact';

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export interface RecordSchemaValidatorCacheEntry {
  readonly digest: string;
  readonly document: PublishedRecordJsonSchemaDocument;
  readonly validator: CompiledRecordJsonSchemaValidator;
}

export type RecordSchemaValidatorCacheEntryInput = Pick<
  CompiledRecordJsonSchemaArtifact,
  'digest' | 'document' | 'validator'
>;

export interface RecordSchemaValidatorCacheStatistics {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly size: number;
  readonly maxEntries: number;
}

export class RecordSchemaValidatorCacheConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RecordSchemaValidatorCacheConfigurationError';
  }
}

function immutableEntry(input: RecordSchemaValidatorCacheEntryInput): RecordSchemaValidatorCacheEntry {
  if (!DIGEST_PATTERN.test(input.digest)) {
    throw new RecordSchemaValidatorCacheConfigurationError(
      'A validator cache entry requires a lowercase SHA-256 digest.'
    );
  }
  if (typeof input.validator?.validate !== 'function') {
    throw new RecordSchemaValidatorCacheConfigurationError('A validator cache entry requires a compiled validator.');
  }
  const document = normalizeRecordJsonSchemaDocument(input.document) as PublishedRecordJsonSchemaDocument;
  if (typeof document.$id !== 'string') {
    throw new RecordSchemaValidatorCacheConfigurationError('A validator cache entry requires an identified document.');
  }
  let identity: ReturnType<typeof identifyRecordJsonSchema>;
  try {
    identity = identifyRecordJsonSchema(document, Number.MAX_SAFE_INTEGER);
  } catch {
    throw new RecordSchemaValidatorCacheConfigurationError(
      'A validator cache entry requires a valid self-consistent document identity.'
    );
  }
  if (identity.digest !== input.digest || identity.document.$id !== document.$id) {
    throw new RecordSchemaValidatorCacheConfigurationError(
      'A validator cache entry digest and identifier must match its document.'
    );
  }
  return Object.freeze({
    digest: input.digest,
    document: identity.document,
    validator: Object.freeze({ validate: input.validator.validate }),
  });
}

/**
 * Process-local deterministic LRU for immutable document/validator pairs.
 * Authorization and caller context are deliberately not representable in an
 * entry and must be evaluated by the service on every request.
 */
export class RecordSchemaValidatorCache {
  private readonly entries = new Map<string, RecordSchemaValidatorCacheEntry>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  public constructor(public readonly maxEntries: number) {
    if (!Number.isFinite(maxEntries) || !Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new RecordSchemaValidatorCacheConfigurationError(
        'recordSchema.cacheMaxEntries must be a finite positive integer.'
      );
    }
  }

  public get(digest: string): RecordSchemaValidatorCacheEntry | undefined {
    const entry = this.entries.get(digest);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    this.entries.delete(digest);
    this.entries.set(digest, entry);
    this.hits += 1;
    return entry;
  }

  public set(input: RecordSchemaValidatorCacheEntryInput): void {
    const entry = immutableEntry(input);
    if (this.entries.has(entry.digest)) {
      this.entries.delete(entry.digest);
    }
    this.entries.set(entry.digest, entry);
    if (this.entries.size <= this.maxEntries) {
      return;
    }
    const oldest = this.entries.keys().next();
    if (!oldest.done) {
      this.entries.delete(oldest.value);
      this.evictions += 1;
    }
  }

  public has(digest: string): boolean {
    return this.entries.has(digest);
  }

  public statistics(): RecordSchemaValidatorCacheStatistics {
    return Object.freeze({
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      size: this.entries.size,
      maxEntries: this.maxEntries,
    });
  }
}
