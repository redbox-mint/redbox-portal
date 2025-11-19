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
  type?: string;
  required?: boolean;
  unique?: boolean;
  defaultsTo?: unknown;
  columnName?: string;
  allowNull?: boolean;
  autoCreatedAt?: boolean;
  autoUpdatedAt?: boolean;
  description?: string;
  example?: unknown;
  model?: string;
  collection?: string;
  via?: string;
}

export interface EntityOptions {
  identity?: string;
  primaryKey?: string;
  tableName?: string;
  migrate?: 'alter' | 'drop' | 'safe';
}

export interface EntityMeta {
  target: Function;
  className: string;
  entity: {
    identity: string;
    primaryKey: string;
    tableName?: string;
    migrate?: 'alter' | 'drop' | 'safe';
  };
  attributes: Record<string, AttributeOptions>;
  lifecycle: Partial<Record<LifecycleHook, Function[]>>;
}

export interface WaterlineModelDefinition
  extends Partial<Record<LifecycleHook, Function[]>> {
  identity: string;
  primaryKey: string;
  tableName?: string;
  migrate?: 'alter' | 'drop' | 'safe';
  attributes: Record<string, AttributeOptions>;
}

export const REGISTRY = new Map<Function, EntityMeta>();

const DEFAULT_PRIMARY_KEY = 'id';

function toIdentity(value: string): string {
  return value
    ? value
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/\s+/g, '-')
        .toLowerCase()
    : '';
}

function ensureMeta(target: Function): EntityMeta {
  let existing = REGISTRY.get(target);
  if (!existing) {
    existing = {
      target,
      className: target.name,
      entity: {
        identity: toIdentity(target.name),
        primaryKey: DEFAULT_PRIMARY_KEY,
        tableName: toIdentity(target.name),
      },
      attributes: {},
      lifecycle: {},
    };
    REGISTRY.set(target, existing);
  }
  return existing;
}

function inferWaterlineType(target: object, propertyKey: string): string | undefined {
  const designType: unknown = Reflect.getMetadata('design:type', target, propertyKey);
  if (!designType) {
    return undefined;
  }
  switch (designType) {
    case String:
      return 'string';
    case Number:
      return 'number';
    case Boolean:
      return 'boolean';
    case Date:
      return 'datetime';
    default:
      if (designType === Array) {
        return 'json[]';
      }
      if (designType === Object) {
        return 'json';
      }
  }
  return undefined;
}

function setAttribute(meta: EntityMeta, propertyKey: string, opts: AttributeOptions) {
  const current = meta.attributes[propertyKey] ?? {};
  meta.attributes[propertyKey] = { ...current, ...opts };
}

export function Entity(
  identityOrOpts?: string | EntityOptions,
  maybeOpts?: EntityOptions,
): ClassDecorator {
  const identity = typeof identityOrOpts === 'string' ? identityOrOpts : undefined;
  const options = typeof identityOrOpts === 'object' ? identityOrOpts : maybeOpts;

  return target => {
    const meta = ensureMeta(target);
    const resolvedIdentity = options?.identity ?? identity;
    if (resolvedIdentity) {
      meta.entity.identity = resolvedIdentity;
      meta.entity.tableName ??= resolvedIdentity;
    }
    if (options?.tableName) {
      meta.entity.tableName = options.tableName;
    }
    if (options?.primaryKey) {
      meta.entity.primaryKey = options.primaryKey;
    }
    if (options?.migrate) {
      meta.entity.migrate = options.migrate;
    }
    if (!meta.entity.tableName) {
      meta.entity.tableName = meta.entity.identity;
    }
  };
}

export function Attr(opts: AttributeOptions = {}): PropertyDecorator {
  return (target, propertyKey) => {
    const ctor = target.constructor as Function;
    const meta = ensureMeta(ctor);
    const name = propertyKey as string;
    const attribute: AttributeOptions = { ...opts };
    if (!attribute.type && !attribute.model && !attribute.collection) {
      const inferred = inferWaterlineType(target, name);
      if (inferred) {
        attribute.type = inferred;
      }
    }
    setAttribute(meta, name, attribute);
  };
}

export function PrimaryKey(opts: AttributeOptions = {}): PropertyDecorator {
  return (target, propertyKey) => {
    const decorator = Attr({
      required: true,
      unique: true,
      ...opts,
    });
    decorator(target, propertyKey);
    const ctor = target.constructor as Function;
    const meta = ensureMeta(ctor);
    meta.entity.primaryKey = propertyKey as string;
  };
}

export function BelongsTo(model: string, opts: AttributeOptions = {}): PropertyDecorator {
  return Attr({ ...opts, model });
}

export function HasMany(
  collection: string,
  via: string,
  opts: AttributeOptions = {},
): PropertyDecorator {
  return Attr({ ...opts, collection, via });
}

function createLifecycleDecorator(hook: LifecycleHook) {
  return (handler: Function): ClassDecorator => {
    return target => {
      if (typeof handler !== 'function') {
        throw new Error(`${hook} decorator expects a function, received ${typeof handler}`);
      }
      const meta = ensureMeta(target);
      const current = meta.lifecycle[hook] ?? [];
      current.push(handler);
      meta.lifecycle[hook] = current;
    };
  };
}

export const BeforeCreate = createLifecycleDecorator('beforeCreate');
export const BeforeUpdate = createLifecycleDecorator('beforeUpdate');
export const BeforeDestroy = createLifecycleDecorator('beforeDestroy');
export const BeforeValidate = createLifecycleDecorator('beforeValidate');
export const AfterCreate = createLifecycleDecorator('afterCreate');
export const AfterUpdate = createLifecycleDecorator('afterUpdate');
export const AfterDestroy = createLifecycleDecorator('afterDestroy');
export const AfterValidate = createLifecycleDecorator('afterValidate');

export function getRegisteredEntities(): EntityMeta[] {
  return Array.from(REGISTRY.values()).sort((a, b) =>
    a.entity.identity.localeCompare(b.entity.identity),
  );
}

export function toWaterlineModelDef(target: Function | EntityMeta): WaterlineModelDefinition {
  const meta = typeof target === 'function' ? REGISTRY.get(target) : target;
  if (!meta) {
    throw new Error('Entity has not been registered');
  }
  const attributes = Object.entries(meta.attributes).reduce<Record<string, AttributeOptions>>(
    (acc, [key, value]) => {
      acc[key] = { ...value };
      return acc;
    },
    {},
  );
  const definition: WaterlineModelDefinition = {
    identity: meta.entity.identity,
    primaryKey: meta.entity.primaryKey,
    attributes,
  };
  if (meta.entity.tableName) {
    definition.tableName = meta.entity.tableName;
  }
  if (meta.entity.migrate) {
    definition.migrate = meta.entity.migrate;
  }
  for (const [hook, handlers] of Object.entries(meta.lifecycle)) {
    if (handlers && handlers.length) {
      definition[hook as LifecycleHook] = [...handlers];
    }
  }
  return definition;
}
