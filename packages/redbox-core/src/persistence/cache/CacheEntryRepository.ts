import type { JsonValue } from '../types';
export type { JsonValue } from '../types';

export interface CacheEntryRecord {
  id: string;
  name: string;
  data?: JsonValue;
  /** Numeric epoch seconds, independent of the storage numeric subtype. */
  ts_added: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CacheEntryWrite {
  name: string;
  data?: JsonValue;
  ts_added: number;
}

/**
 * ReDBox's cache persistence seam. Every failure rejects; adapter errors retain
 * their original cause/identity unless a caller needs a normalized category.
 * No operation retries, upserts, or provides atomic read/delete semantics.
 */
export interface CacheEntryRepository {
  /** Returns null on a miss. Records contain plain JSON, string IDs and optional ISO string timestamps. */
  findByName(name: string): Promise<CacheEntryRecord | null>;
  /** Omitted data creates null with the default model; no fetched row is exposed. */
  create(entry: CacheEntryWrite): Promise<void>;
  /** Missing names are a no-op. Omitted data leaves existing data unchanged. */
  updateByName(name: string, entry: CacheEntryWrite): Promise<void>;
  /** Missing IDs are a no-op. IDs are opaque strings, not necessarily ObjectId hex. */
  deleteById(id: string): Promise<void>;
}
