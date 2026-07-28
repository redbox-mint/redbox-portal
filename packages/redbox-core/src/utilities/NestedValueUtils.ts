export interface NestedValueContext {
  /** Dot path with array indices represented by `[]`. */
  path: string;
  /** Property name for object values, or the containing property for array elements. */
  leaf: string;
  /** Immediate parent container, when this is not the root value. */
  parent?: object;
}

export interface NestedValueTransform {
  value: unknown;
  /** Prevent traversal into the returned value. */
  traverse?: boolean;
  /** Omit this value from its containing object. Array elements are never omitted. */
  omit?: boolean;
}

export interface TransformNestedValuesOptions {
  rootPath?: string;
  rootLeaf?: string;
  transform?: (value: unknown, context: NestedValueContext) => NestedValueTransform | undefined;
  mutate?: boolean;
  isTraversableObject?: (value: object) => boolean;
  sortObjectKeys?: boolean;
  /**
   * `visited` treats every repeated reference as circular. `ancestors` only
   * treats references to the active traversal lineage as circular.
   */
  referenceTracking?: 'visited' | 'ancestors';
  onCircular?: (value: object, context: NestedValueContext) => NestedValueTransform;
}

export interface TransformNestedValuesResult {
  value: unknown;
  changed: boolean;
  omit: boolean;
}

const defaultTraversableObject = (_value: object): boolean => true;

/**
 * Recursively transforms values in arrays and objects.
 *
 * By default the result is a clone. Set `mutate` to update traversed containers
 * in place. Circular-reference handling and object traversal are caller-defined
 * so domain utilities can retain their own safety semantics.
 */
export function transformNestedValues(
  input: unknown,
  options: TransformNestedValuesOptions = {}
): TransformNestedValuesResult {
  const references = new WeakSet<object>();
  const mutate = options.mutate === true;
  const isTraversableObject = options.isTraversableObject ?? defaultTraversableObject;
  const referenceTracking = options.referenceTracking ?? 'visited';

  const visit = (original: unknown, context: NestedValueContext): TransformNestedValuesResult => {
    const transformed = options.transform?.(original, context);
    const value = transformed ? transformed.value : original;
    const selfChanged = value !== original;

    if (transformed?.omit === true) {
      return { value, changed: true, omit: true };
    }
    if (transformed?.traverse === false || value === null || typeof value !== 'object') {
      return { value, changed: selfChanged, omit: false };
    }
    if (!Array.isArray(value) && !isTraversableObject(value)) {
      return { value, changed: selfChanged, omit: false };
    }

    if (references.has(value)) {
      const circular = options.onCircular?.(value, context) ?? { value, traverse: false };
      return {
        value: circular.value,
        changed: circular.value !== original,
        omit: circular.omit === true,
      };
    }

    references.add(value);
    let changed = selfChanged;
    let result: object;

    if (Array.isArray(value)) {
      const target: unknown[] = mutate ? value : new Array(value.length);
      const childPath = `${context.path}[]`;
      for (let index = 0; index < value.length; index++) {
        if (!(index in value)) {
          continue;
        }
        const child = visit(value[index], {
          path: childPath,
          leaf: context.leaf,
          parent: value,
        });
        // Omitting array entries would shift indices, so retain the transformed value.
        target[index] = child.value;
        changed = changed || child.changed;
      }
      result = target;
    } else {
      const source = value as Record<string, unknown>;
      const target: Record<string, unknown> = mutate ? source : {};
      const keys = Object.keys(source);
      if (options.sortObjectKeys) {
        keys.sort((left, right) => left.localeCompare(right));
      }
      for (const key of keys) {
        const child = visit(source[key], {
          path: context.path === '' ? key : `${context.path}.${key}`,
          leaf: key,
          parent: source,
        });
        if (child.omit) {
          if (mutate) {
            delete target[key];
          }
          changed = true;
          continue;
        }
        target[key] = child.value;
        changed = changed || child.changed;
      }
      result = target;
    }

    if (referenceTracking === 'ancestors') {
      references.delete(value);
    }
    return { value: result, changed, omit: false };
  };

  return visit(input, {
    path: options.rootPath ?? '',
    leaf: options.rootLeaf ?? '',
  });
}
