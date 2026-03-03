// Types
export {
  LifecycleHook,
  AttributeOptions,
  EntityOptions,
  EntityMeta,
  WaterlineModelDefinition,
} from './types';

// Registry and helpers
export {
  REGISTRY,
  ensureMeta,
  toIdentity,
  inferWaterlineType,
  setAttribute,
  getRegisteredEntities,
} from './registry';

// Decorators
export { Entity } from './Entity';
export { Attr, PrimaryKey } from './Attr';
export { BelongsTo, HasMany } from './Associations';
export {
  BeforeCreate,
  BeforeUpdate,
  BeforeDestroy,
  BeforeValidate,
  AfterCreate,
  AfterUpdate,
  AfterDestroy,
  AfterValidate,
} from './Lifecycle';

// Utils
export { toWaterlineModelDef } from './utils';
