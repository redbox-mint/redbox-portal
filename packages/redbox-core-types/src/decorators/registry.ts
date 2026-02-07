import { EntityMeta, AttributeOptions, Constructor } from './types';

export const REGISTRY = new Map<Constructor, EntityMeta>();

const DEFAULT_PRIMARY_KEY = 'id';

export function toIdentity(value: string): string {
  return value
    ? value
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/\s+/g, '-')
        .toLowerCase()
    : '';
}

export function ensureMeta(target: Constructor): EntityMeta {
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

export function inferWaterlineType(target: object, propertyKey: string): string | undefined {
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

export function setAttribute(meta: EntityMeta, propertyKey: string, opts: AttributeOptions) {
  const current = meta.attributes[propertyKey] ?? {};
  meta.attributes[propertyKey] = { ...current, ...opts };
}

export function getRegisteredEntities(): EntityMeta[] {
  return Array.from(REGISTRY.values()).sort((a, b) =>
    a.entity.identity.localeCompare(b.entity.identity),
  );
}
