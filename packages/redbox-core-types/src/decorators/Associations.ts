import { AttributeOptions } from './types';
import { Attr } from './Attr';

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
