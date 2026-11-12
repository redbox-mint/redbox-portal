import { cloneDeep } from 'lodash';
import { relatedOutputBytes } from './output-size';
import { recordContractPointer, recordContractPointerTokens } from '../record-contract/json-pointer';

export function projectionTokens(pointer: string): string[] {
  const tokens = recordContractPointerTokens(recordContractPointer(pointer));
  if (!tokens.length) throw new Error('Related projection must select explicit fields');
  return tokens;
}

/** Borrow selected values for size checks; callers must detach before publishing or mutating. */
export function selectRelatedMetadata(
  metadata: unknown,
  fields: readonly string[]
): {
  metadata: Record<string, unknown>;
  absent: string[];
} {
  const result: Record<string, unknown> = {};
  const absent: string[] = [];
  const selectedPaths: string[][] = [];
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
    // An already selected ancestor includes this value; never write through its borrowed object.
    if (selectedPaths.some(path => path.length <= tokens.length && path.every((token, index) => token === tokens[index]))) continue;
    selectedPaths.push(tokens);
    let target = result;
    let sourceContainer: unknown = metadata;
    tokens.forEach((token, index) => {
      if (index === tokens.length - 1) {
        Object.defineProperty(target, token, {
          value,
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

/** Own-property projection, bounded before selected values are cloned. */
export function projectRelatedMetadata(metadata: unknown, fields: readonly string[], maxBytes?: number): {
  metadata: Record<string, unknown>;
  absent: string[];
} {
  const selected = selectRelatedMetadata(metadata, fields);
  if (maxBytes !== undefined) relatedOutputBytes(selected.metadata, maxBytes);
  return { metadata: cloneDeep(selected.metadata), absent: selected.absent };
}
