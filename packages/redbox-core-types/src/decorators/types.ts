import 'reflect-metadata';

export type LifecycleHook =
  | 'beforeCreate'
  | 'beforeUpdate'
  | 'beforeDestroy'
  | 'beforeValidate'
  | 'afterCreate'
  | 'afterUpdate'
  | 'afterDestroy'
  | 'afterValidate';

export type Constructor<T = unknown> = new (...args: unknown[]) => T;

export type LifecycleHandler = (
  recordOrRecords: Record<string, unknown>,
  proceed: (err?: Error) => void,
) => void;

export interface AttributeOptions {
  [key: string]: unknown;
  type?: string;
  required?: boolean;
  unique?: boolean;
  defaultsTo?: unknown;
  columnName?: string;
  columnType?: string;
  allowNull?: boolean;
  autoCreatedAt?: boolean;
  autoUpdatedAt?: boolean;
  description?: string;
  example?: unknown;
  model?: string;
  collection?: string;
  via?: string;
  dominant?: boolean;
  custom?: (value: unknown) => boolean;
}

export interface EntityOptions {
  identity?: string;
  primaryKey?: string;
  tableName?: string;
  migrate?: 'alter' | 'drop' | 'safe';
  datastore?: string;
  schema?: boolean;
  autoCreatedAt?: boolean;
  autoUpdatedAt?: boolean;
  indexes?: Record<string, unknown>[];
  archiveModelIdentity?: string;
  archiveDateField?: string;
  [key: string]: unknown;
}

export interface EntityMeta {
  target: Constructor;
  className: string;
  entity: {
    identity: string;
    primaryKey: string;
    tableName?: string;
    migrate?: 'alter' | 'drop' | 'safe';
    datastore?: string;
    schema?: boolean;
    autoCreatedAt?: boolean;
    autoUpdatedAt?: boolean;
    indexes?: Record<string, unknown>[];
    archiveModelIdentity?: string;
    archiveDateField?: string;
    [key: string]: unknown;
  };
  attributes: Record<string, AttributeOptions>;
  lifecycle: Partial<Record<LifecycleHook, LifecycleHandler[]>>;
}

export interface WaterlineModelDefinition {
  identity: string;
  primaryKey: string;
  tableName?: string;
  migrate?: 'alter' | 'drop' | 'safe';
  datastore?: string;
  schema?: boolean;
  autoCreatedAt?: boolean;
  autoUpdatedAt?: boolean;
  indexes?: Record<string, unknown>[];
  archiveModelIdentity?: string;
  archiveDateField?: string;
  attributes: Record<string, AttributeOptions>;
  // Lifecycle hooks are functions with signature (recordOrRecords, proceed) => void
  beforeCreate?: (recordOrRecords: Record<string, unknown>, proceed: (err?: Error) => void) => void;
  beforeUpdate?: (recordOrRecords: Record<string, unknown>, proceed: (err?: Error) => void) => void;
  beforeDestroy?: (recordOrRecords: Record<string, unknown>, proceed: (err?: Error) => void) => void;
  beforeValidate?: (recordOrRecords: Record<string, unknown>, proceed: (err?: Error) => void) => void;
  afterCreate?: (recordOrRecords: Record<string, unknown>, proceed: (err?: Error) => void) => void;
  afterUpdate?: (recordOrRecords: Record<string, unknown>, proceed: (err?: Error) => void) => void;
  afterDestroy?: (recordOrRecords: Record<string, unknown>, proceed: (err?: Error) => void) => void;
  afterValidate?: (recordOrRecords: Record<string, unknown>, proceed: (err?: Error) => void) => void;
  [key: string]: unknown;
}
