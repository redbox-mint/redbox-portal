import { get as _get, set as _set } from 'lodash';
import { transformNestedValues } from './NestedValueUtils';

/**
 * Options controlling {@link trimRecordWhitespace}.
 */
export interface TrimWhitespaceOptions {
  /**
   * Root lodash paths on the target to walk. Defaults to `['metadata']`, so
   * `metaMetadata` and `authorization` are left alone unless listed here.
   */
  paths?: string[];
  /**
   * Include-list. When non-empty, ONLY matching fields are trimmed.
   * Takes precedence over `excludeFields` when both are supplied.
   */
  fields?: string[];
  /**
   * Exclude-list. Matching fields (and everything beneath them) are skipped.
   * Ignored when `fields` is non-empty.
   */
  excludeFields?: string[];
  /**
   * When true, a string that is empty after trimming becomes `null`.
   * Defaults to false.
   */
  nullifyEmpty?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * A field entry matches when it equals either the index-normalised path
 * (`contributor_ci[].text_full_name`) or the leaf key name
 * (`text_full_name`). The leaf form lets callers target a field inside a
 * repeatable without enumerating indices.
 */
function matchesField(entries: string[], path: string, leaf: string): boolean {
  if (entries.length === 0) {
    return false;
  }
  return entries.includes(path) || (leaf !== '' && entries.includes(leaf));
}

function pathIsWithinField(entries: string[], path: string, leaf: string): boolean {
  return entries.some(entry =>
    entry === leaf ||
    path === entry ||
    path.startsWith(`${entry}.`) ||
    path.startsWith(`${entry}[]`)
  );
}

/**
 * Recursively strips leading and trailing whitespace from every string value
 * found under the configured `paths` of `target`.
 *
 * Only `String.prototype.trim()` is applied to the whole value, so intra-string
 * formatting is preserved - including the two-space markdown line break.
 * Object keys are never modified.
 *
 * Mutates `target` in place.
 *
 * @returns true when at least one value changed.
 */
export function trimRecordWhitespace(target: unknown, options: TrimWhitespaceOptions = {}): boolean {
  if (typeof target !== 'object' || target === null) {
    return false;
  }

  const paths = options.paths && options.paths.length > 0 ? options.paths : ['metadata'];
  const fields = options.fields ?? [];
  const excludeFields = options.excludeFields ?? [];
  const useIncludeList = fields.length > 0;

  let changed = false;
  for (const rootPath of paths) {
    const rootValue = _get(target, rootPath);
    if (rootValue === undefined || rootValue === null) {
      continue;
    }
    const leaf = String(rootPath).split('.').pop() ?? '';
    const rootIncluded = useIncludeList && matchesField(fields, '', leaf);
    const result = transformNestedValues(rootValue, {
      rootLeaf: leaf,
      mutate: true,
      referenceTracking: 'visited',
      isTraversableObject: isPlainObject,
      transform: (value, context) => {
        if (!useIncludeList && matchesField(excludeFields, context.path, context.leaf)) {
          return { value, traverse: false };
        }
        if (typeof value !== 'string') {
          return undefined;
        }
        if (useIncludeList && !rootIncluded && !pathIsWithinField(fields, context.path, context.leaf)) {
          return { value, traverse: false };
        }
        const trimmed = value.trim();
        return {
          value: options.nullifyEmpty === true && trimmed === '' ? null : trimmed,
          traverse: false,
        };
      },
    });
    if (result.changed) {
      changed = true;
      if (result.value !== rootValue) {
        _set(target as object, rootPath, result.value);
      }
    }
  }
  return changed;
}
