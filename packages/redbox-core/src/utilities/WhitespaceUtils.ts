import { get as _get, set as _set } from 'lodash';

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

interface WalkContext {
  fields: string[];
  excludeFields: string[];
  nullifyEmpty: boolean;
  seen: WeakSet<object>;
}

interface WalkResult {
  value: unknown;
  changed: boolean;
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

function walk(value: unknown, path: string, leaf: string, included: boolean, ctx: WalkContext): WalkResult {
  const useIncludeList = ctx.fields.length > 0;
  const selfIncluded = included || (useIncludeList && matchesField(ctx.fields, path, leaf));

  if (!useIncludeList && matchesField(ctx.excludeFields, path, leaf)) {
    // Excluding a container excludes everything beneath it.
    return { value, changed: false };
  }

  if (typeof value === 'string') {
    if (useIncludeList && !selfIncluded) {
      return { value, changed: false };
    }
    const trimmed = value.trim();
    const next = ctx.nullifyEmpty && trimmed === '' ? null : trimmed;
    return { value: next, changed: next !== value };
  }

  if (Array.isArray(value)) {
    if (ctx.seen.has(value)) {
      return { value, changed: false };
    }
    ctx.seen.add(value);
    let changed = false;
    // Array indices are normalised to `[]` so path matching is index-agnostic.
    const childPath = `${path}[]`;
    for (let i = 0; i < value.length; i++) {
      const result = walk(value[i], childPath, leaf, selfIncluded, ctx);
      if (result.changed) {
        value[i] = result.value;
        changed = true;
      }
    }
    return { value, changed };
  }

  if (isPlainObject(value)) {
    if (ctx.seen.has(value)) {
      return { value, changed: false };
    }
    ctx.seen.add(value);
    let changed = false;
    for (const key of Object.keys(value)) {
      const childPath = path === '' ? key : `${path}.${key}`;
      const result = walk(value[key], childPath, key, selfIncluded, ctx);
      if (result.changed) {
        value[key] = result.value;
        changed = true;
      }
    }
    return { value, changed };
  }

  // Numbers, booleans, null, undefined, Date, Buffer and other class
  // instances are left untouched.
  return { value, changed: false };
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
  const ctx: WalkContext = {
    fields: options.fields ?? [],
    excludeFields: options.excludeFields ?? [],
    nullifyEmpty: options.nullifyEmpty === true,
    seen: new WeakSet<object>(),
  };

  let changed = false;
  for (const rootPath of paths) {
    const rootValue = _get(target, rootPath);
    if (rootValue === undefined || rootValue === null) {
      continue;
    }
    const leaf = String(rootPath).split('.').pop() ?? '';
    const result = walk(rootValue, '', leaf, false, ctx);
    if (result.changed) {
      changed = true;
      if (result.value !== rootValue) {
        _set(target as object, rootPath, result.value);
      }
    }
  }
  return changed;
}
