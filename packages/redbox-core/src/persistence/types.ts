/** Plain values crossing repository boundaries; BSON and driver handles stay private. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** IDs are opaque to callers. Concrete operations own their physical codecs. */
export type PersistenceId = string;
export type LogicalDatastore = 'mongodb' | 'redboxStorage';
export type PersistenceGroup =
  | 'migration'
  | 'reference'
  | 'configuration'
  | 'progress'
  | 'harvest'
  | 'siem'
  | 'figshare'
  | 'identity'
  | 'vocabulary'
  | 'branding'
  | 'storage';

/** A resource must stop accepting work and await in-flight work before pools close. */
export interface PersistenceResource {
  /** Synchronously close producer admission. Must be idempotent and must not release dependencies. */
  quiesce?(): void;
  drain?(): Promise<void>;
  close(): Promise<void>;
}
