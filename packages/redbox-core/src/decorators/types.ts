import 'reflect-metadata';
import type { RuntimeRecord, RuntimeValue } from '../runtimeValues';

export type LifecycleHook =
  | 'beforeCreate'
  | 'beforeUpdate'
  | 'beforeDestroy'
  | 'beforeValidate'
  | 'afterCreate'
  | 'afterUpdate'
  | 'afterDestroy'
  | 'afterValidate';

export type Constructor<T = object> = new (...args: RuntimeValue[]) => T;

export type LifecycleHandler = (recordOrRecords: RuntimeRecord, proceed: (err?: Error) => void) => void;

export interface AttributeOptions {
  [key: string]: RuntimeValue | CallableFunction;
  type?: string;
  required?: boolean;
  unique?: boolean;
  defaultsTo?: RuntimeValue;
  columnName?: string;
  columnType?: string;
  allowNull?: boolean;
  autoCreatedAt?: boolean;
  autoUpdatedAt?: boolean;
  description?: string;
  example?: RuntimeValue;
  model?: string;
  collection?: string;
  via?: string;
  dominant?: boolean;
  custom?: (value: RuntimeValue) => boolean;
}

export interface EntityOptions {
  identity?: string;
  primaryKey?: string;
  tableName?: string;
  migrate?: 'alter' | 'drop' | 'safe';
  datastore?: string;
  schema?: boolean;
  dontUseObjectIds?: boolean;
  autoCreatedAt?: boolean;
  autoUpdatedAt?: boolean;
  indexes?: RuntimeRecord[];
  archiveModelIdentity?: string;
  archiveDateField?: string;
  [key: string]: RuntimeValue | CallableFunction;
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
    dontUseObjectIds?: boolean;
    autoCreatedAt?: boolean;
    autoUpdatedAt?: boolean;
    indexes?: RuntimeRecord[];
    archiveModelIdentity?: string;
    archiveDateField?: string;
    [key: string]: RuntimeValue | CallableFunction;
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
  dontUseObjectIds?: boolean;
  autoCreatedAt?: boolean;
  autoUpdatedAt?: boolean;
  indexes?: RuntimeRecord[];
  archiveModelIdentity?: string;
  archiveDateField?: string;
  attributes: Record<string, AttributeOptions>;
  // Lifecycle hooks are functions with signature (recordOrRecords, proceed) => void
  beforeCreate?: LifecycleHandler;
  beforeUpdate?: LifecycleHandler;
  beforeDestroy?: LifecycleHandler;
  beforeValidate?: LifecycleHandler;
  afterCreate?: LifecycleHandler;
  afterUpdate?: LifecycleHandler;
  afterDestroy?: LifecycleHandler;
  afterValidate?: LifecycleHandler;
  [key: string]: RuntimeValue | CallableFunction;
}
