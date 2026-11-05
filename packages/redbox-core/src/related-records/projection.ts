import { cloneDeep } from 'lodash';
import { recordContractPointer, recordContractPointerTokens } from '../record-contract/json-pointer';

export function projectionTokens(pointer: string): string[] {
  const tokens = recordContractPointerTokens(recordContractPointer(pointer));
  if (!tokens.length) throw new Error('Related projection must select explicit fields');
  return tokens;
}

/** Own-property, presence-aware projection. Define properties so literal prototype keys are safe too. */
export function projectRelatedMetadata(
  metadata: unknown,
  fields: readonly string[]
): {
  metadata: Record<string, unknown>;
  absent: string[];
} {
  const result: Record<string, unknown> = {};
  const absent: string[] = [];
  for (const pointer of fields) {
    const tokens = projectionTokens(pointer);
    let value: unknown = metadata;
    let present = true;
    for (const token of tokens) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, token)) {
        present = false;
        break;
      }
      value = Reflect.get(value, token);
    }
    if (!present) {
      absent.push(pointer);
      continue;
    }
    let target = result;
    let sourceContainer: unknown = metadata;
    tokens.forEach((token, index) => {
      if (index === tokens.length - 1) {
        Object.defineProperty(target, token, {
          value: cloneDeep(value),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      } else {
        if (!Object.hasOwn(target, token) || target[token] === null || typeof target[token] !== 'object') {
          Object.defineProperty(target, token, {
            value: Array.isArray(sourceContainer && Reflect.get(sourceContainer as object, token)) ? [] : {},
            enumerable: true,
            configurable: true,
            writable: true,
          });
        }
        sourceContainer = sourceContainer && Reflect.get(sourceContainer as object, token);
        target = target[token] as Record<string, unknown>;
      }
    });
  }
  return { metadata: result, absent };
}
