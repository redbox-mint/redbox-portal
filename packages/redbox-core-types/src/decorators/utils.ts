import { AttributeOptions, EntityMeta, LifecycleHook, WaterlineModelDefinition } from './types';
import { REGISTRY } from './registry';

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
  const { identity, primaryKey, ...rest } = meta.entity;
  const definition: WaterlineModelDefinition = {
    ...rest,
    identity,
    primaryKey,
    attributes,
  };
  // Wrap lifecycle hooks in Waterline-compatible callback functions
  // Waterline expects: function(recordOrRecords, proceed) { ... proceed(); }
  // Handlers are expected to have signature: (recordOrRecords, proceed) => void
  for (const [hook, handlers] of Object.entries(meta.lifecycle)) {
    if (handlers && handlers.length) {
      if (handlers.length === 1) {
        // Single handler - pass it directly for best compatibility
        definition[hook as LifecycleHook] = handlers[0] as (
          recordOrRecords: unknown,
          proceed: (err?: Error) => void,
        ) => void;
      } else {
        // Multiple handlers - chain them with proceed callbacks
        definition[hook as LifecycleHook] = function(
          this: unknown,
          recordOrRecords: unknown,
          proceed: (err?: Error) => void,
        ) {
          let index = 0;
          const runNext = (err?: Error) => {
            if (err) {
              return proceed(err);
            }
            if (index >= handlers.length) {
              return proceed();
            }
            const handler = handlers[index++];
            try {
              handler.call(this, recordOrRecords, runNext);
            } catch (e) {
              proceed(e instanceof Error ? e : new Error(String(e)));
            }
          };
          runNext();
        };
      }
    }
  }
  return definition;
}
