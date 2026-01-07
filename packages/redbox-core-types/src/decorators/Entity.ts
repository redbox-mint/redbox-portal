import { EntityOptions } from './types';
import { ensureMeta, toIdentity } from './registry';

export function Entity(
  identityOrOpts?: string | EntityOptions,
  maybeOpts?: EntityOptions,
): ClassDecorator {
  const identity = typeof identityOrOpts === 'string' ? identityOrOpts : undefined;
  const options = typeof identityOrOpts === 'object' ? identityOrOpts : maybeOpts;

  return target => {
    const meta = ensureMeta(target);
    const { identity: providedIdentity, ...rest } = options ?? {};
    const defaultTableName = toIdentity(target.name);
    const resolvedIdentity = providedIdentity ?? identity;
    if (resolvedIdentity) {
      meta.entity.identity = resolvedIdentity;
      const shouldResetTableName =
        rest.tableName !== undefined
          ? false
          : !meta.entity.tableName || meta.entity.tableName === defaultTableName;
      if (shouldResetTableName) {
        meta.entity.tableName = resolvedIdentity;
      }
    }
    Object.entries(rest).forEach(([key, value]) => {
      if (value !== undefined) {
        (meta.entity as Record<string, unknown>)[key] = value;
      }
    });
    meta.entity.tableName ??= meta.entity.identity;
  };
}
