import { AttributeOptions, Constructor } from './types';
import { ensureMeta, inferWaterlineType, setAttribute } from './registry';

export function Attr(opts: AttributeOptions = {}): PropertyDecorator {
  return (target, propertyKey) => {
    const ctor = target.constructor as Constructor;
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
    const ctor = target.constructor as Constructor;
    const meta = ensureMeta(ctor);
    meta.entity.primaryKey = propertyKey as string;
  };
}
