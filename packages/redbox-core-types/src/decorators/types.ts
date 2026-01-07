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
  target: Function;
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
  lifecycle: Partial<Record<LifecycleHook, Function[]>>;
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
  beforeCreate?: (recordOrRecords: unknown, proceed: (err?: Error) => void) => void;
  beforeUpdate?: (recordOrRecords: unknown, proceed: (err?: Error) => void) => void;
  beforeDestroy?: (recordOrRecords: unknown, proceed: (err?: Error) => void) => void;
  beforeValidate?: (recordOrRecords: unknown, proceed: (err?: Error) => void) => void;
  afterCreate?: (recordOrRecords: unknown, proceed: (err?: Error) => void) => void;
  afterUpdate?: (recordOrRecords: unknown, proceed: (err?: Error) => void) => void;
  afterDestroy?: (recordOrRecords: unknown, proceed: (err?: Error) => void) => void;
  afterValidate?: (recordOrRecords: unknown, proceed: (err?: Error) => void) => void;
  [key: string]: unknown;
}
