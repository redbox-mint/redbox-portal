import { cloneDeep as _cloneDeep, isEqual as _isEqual } from 'lodash';
import { isPlainRecord } from './internal/plain-record';

/** A property or array-index path through a JSON-like record value. */
export type RecordValuePath = Array<string | number>;

export type RecordValueChangeKind = 'add' | 'delete' | 'change';

/**
 * One structural change between two JSON-like values.
 *
 * Object additions/deletions and array-index additions/deletions retain their
 * historical backend semantics. Concurrency callers should use
 * `diffRecordValuesForConcurrency`, which treats an array as one atomic value.
 */
export interface RecordValueChange {
  readonly kind: RecordValueChangeKind;
  readonly path: RecordValuePath;
  readonly original: unknown;
  readonly changed: unknown;
}

export interface RecordValueOverlap {
  readonly path: RecordValuePath;
  readonly local: RecordValueChange;
  readonly remote: RecordValueChange;
  readonly resolved: boolean;
}

export interface ThreeWayRecordDiff {
  readonly localChanges: readonly RecordValueChange[];
  readonly remoteChanges: readonly RecordValueChange[];
  readonly applicableLocalChanges: readonly RecordValueChange[];
  readonly resolvedOverlaps: readonly RecordValueOverlap[];
  readonly unresolvedOverlaps: readonly RecordValueOverlap[];
  /** True when latest already contains every base-to-local final value. */
  readonly localChangesAlreadyPresent: boolean;
}

export interface ThreeWayRecordRebase<T> extends ThreeWayRecordDiff {
  /** Latest plus only base-to-local changes that do not diverge from remote. */
  readonly candidate: T;
}

interface LocatedValue {
  readonly exists: boolean;
  readonly value: unknown;
}

/**
 * Pure recursive diff retaining the established FormRecordConsistencyService
 * add/delete/change and path ordering contract.
 */
export function diffRecordValues(
  original: unknown,
  changed: unknown,
  path: readonly (string | number)[] = []
): RecordValueChange[] {
  if (original === changed) return [];

  const originalArray = Array.isArray(original);
  const changedArray = Array.isArray(changed);
  const originalRecord = isPlainRecord(original);
  const changedRecord = isPlainRecord(changed);

  if ((originalArray && changedArray) || (originalRecord && changedRecord)) {
    const originalKeys = valueKeys(original);
    const changedKeys = valueKeys(changed);
    const originalKeySet = new Set<string | number>(originalKeys);
    const changedKeySet = new Set<string | number>(changedKeys);
    const result: RecordValueChange[] = [];

    for (const key of originalKeys) {
      const nextPath = [...path, key];
      const originalValue = valueAtKey(original, key);
      if (!changedKeySet.has(key)) {
        result.push({ kind: 'delete', path: nextPath, original: originalValue, changed: undefined });
        continue;
      }
      result.push(...diffRecordValues(originalValue, valueAtKey(changed, key), nextPath));
    }

    for (const key of changedKeys) {
      if (originalKeySet.has(key)) continue;
      result.push({
        kind: 'add',
        path: [...path, key],
        original: undefined,
        changed: valueAtKey(changed, key),
      });
    }
    return result;
  }

  return [{ kind: 'change', path: [...path], original, changed }];
}

/**
 * Collapse a descendant of an array to the containing array path. Numeric path
 * segments are emitted only by array traversal; numeric-looking object keys
 * remain strings and therefore remain ordinary object properties.
 */
export function normalizeConcurrencyPath(path: readonly (string | number)[]): RecordValuePath {
  const firstArrayIndex = path.findIndex(segment => typeof segment === 'number');
  return firstArrayIndex < 0 ? [...path] : path.slice(0, firstArrayIndex);
}

/** Prefix-aware path overlap: equality, local parent, or remote parent. */
export function recordValuePathsOverlap(
  first: readonly (string | number)[],
  second: readonly (string | number)[]
): boolean {
  const commonLength = Math.min(first.length, second.length);
  for (let index = 0; index < commonLength; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

/** Deterministic deep equality for JSON-like values; object key order is ignored. */
export function canonicallyEqualRecordValues(first: unknown, second: unknown): boolean {
  return _isEqual(first, second);
}

/**
 * Concurrency diff with arrays/repeatables represented by one whole-value
 * change at their root. The ordinary diff remains index-based for audit users.
 */
export function diffRecordValuesForConcurrency(
  original: unknown,
  changed: unknown,
  path: readonly (string | number)[] = []
): RecordValueChange[] {
  if (canonicallyEqualRecordValues(original, changed)) return [];
  if (Array.isArray(original) || Array.isArray(changed)) {
    return [{ kind: 'change', path: [...path], original, changed }];
  }

  const originalRecord = isPlainRecord(original);
  const changedRecord = isPlainRecord(changed);
  if (originalRecord && changedRecord) {
    const result: RecordValueChange[] = [];
    const changedKeys = new Set(Object.keys(changed));
    const originalKeys = Object.keys(original);
    const originalKeySet = new Set(originalKeys);

    for (const key of originalKeys) {
      const nextPath = [...path, key];
      if (!changedKeys.has(key)) {
        result.push({ kind: 'delete', path: nextPath, original: original[key], changed: undefined });
        continue;
      }
      result.push(...diffRecordValuesForConcurrency(original[key], changed[key], nextPath));
    }
    for (const key of Object.keys(changed)) {
      if (originalKeySet.has(key)) continue;
      result.push({ kind: 'add', path: [...path, key], original: undefined, changed: changed[key] });
    }
    return result;
  }

  return [{ kind: 'change', path: [...path], original, changed }];
}

/**
 * Compare base/local/latest and classify overlaps using final projected state,
 * not merely the leaf values stored on individual diff entries.
 */
export function compareThreeWayRecordValues(base: unknown, local: unknown, latest: unknown): ThreeWayRecordDiff {
  const localChanges = diffRecordValuesForConcurrency(base, local);
  const remoteChanges = diffRecordValuesForConcurrency(base, latest);
  const resolvedOverlaps: RecordValueOverlap[] = [];
  const unresolvedOverlaps: RecordValueOverlap[] = [];
  const localWithDivergentOverlap = new Set<RecordValueChange>();

  for (const localChange of localChanges) {
    for (const remoteChange of remoteChanges) {
      if (!recordValuePathsOverlap(localChange.path, remoteChange.path)) continue;
      const overlapPath = localChange.path.length <= remoteChange.path.length ? localChange.path : remoteChange.path;
      const resolved = locatedValuesEqual(valueAtPath(local, overlapPath), valueAtPath(latest, overlapPath));
      const overlap = {
        path: [...overlapPath],
        local: localChange,
        remote: remoteChange,
        resolved,
      } satisfies RecordValueOverlap;
      if (resolved) {
        resolvedOverlaps.push(overlap);
      } else {
        unresolvedOverlaps.push(overlap);
        localWithDivergentOverlap.add(localChange);
      }
    }
  }

  const applicableLocalChanges = localChanges.filter(change => {
    if (localWithDivergentOverlap.has(change)) return false;
    return !remoteChanges.some(remote => recordValuePathsOverlap(change.path, remote.path));
  });
  const localChangesAlreadyPresent = localChanges.every(change =>
    locatedValuesEqual(valueAtPath(local, change.path), valueAtPath(latest, change.path))
  );

  return {
    localChanges,
    remoteChanges,
    applicableLocalChanges,
    resolvedOverlaps,
    unresolvedOverlaps,
    localChangesAlreadyPresent,
  };
}

/**
 * Clone latest and apply the supplied structural changes without mutating any
 * snapshot. Numeric deletes against the same array are applied from the
 * highest index down, so a compatible `diffRecordValues()` result cannot
 * shift a later delete onto the wrong item.
 */
export function applyRecordValueChanges<T>(latest: T, changes: readonly RecordValueChange[]): T {
  let result: unknown = _cloneDeep(latest);
  for (const change of changesInApplicationOrder(changes)) {
    if (change.path.length === 0) {
      result = change.kind === 'delete' ? undefined : _cloneDeep(change.changed);
      continue;
    }
    result = applyChangeAtPath(result, change);
  }
  return result as T;
}

function changesInApplicationOrder(changes: readonly RecordValueChange[]): readonly RecordValueChange[] {
  const arrayDeleteGroups = new Map<string, RecordValueChange[]>();
  for (const change of changes) {
    const key = arrayDeleteParentKey(change);
    if (key === undefined) continue;
    const group = arrayDeleteGroups.get(key) ?? [];
    group.push(change);
    arrayDeleteGroups.set(key, group);
  }
  for (const group of arrayDeleteGroups.values()) {
    group.sort((first, second) => {
      const firstIndex = first.path[first.path.length - 1] as number;
      const secondIndex = second.path[second.path.length - 1] as number;
      return secondIndex - firstIndex;
    });
    for (let index = 1; index < group.length; index += 1) {
      const previousIndex = group[index - 1].path[group[index - 1].path.length - 1];
      const currentIndex = group[index].path[group[index].path.length - 1];
      if (previousIndex === currentIndex) {
        throw new TypeError('A record change set cannot delete the same array index more than once.');
      }
    }
  }

  const emittedGroups = new Set<string>();
  const ordered: RecordValueChange[] = [];
  for (const change of changes) {
    const key = arrayDeleteParentKey(change);
    if (key === undefined) {
      ordered.push(change);
      continue;
    }
    if (emittedGroups.has(key)) continue;
    emittedGroups.add(key);
    ordered.push(...(arrayDeleteGroups.get(key) ?? []));
  }
  return ordered;
}

function arrayDeleteParentKey(change: RecordValueChange): string | undefined {
  if (change.kind !== 'delete' || change.path.length === 0) return undefined;
  const finalSegment = change.path[change.path.length - 1];
  if (typeof finalSegment !== 'number') return undefined;
  if (!Number.isSafeInteger(finalSegment) || finalSegment < 0) {
    throw new TypeError('A record change array index must be a non-negative safe integer.');
  }
  return JSON.stringify(change.path.slice(0, -1));
}

/** Build latest-plus-local while retaining divergent overlaps for later review. */
export function rebaseRecordValues<T>(base: unknown, local: unknown, latest: T): ThreeWayRecordRebase<T> {
  const comparison = compareThreeWayRecordValues(base, local, latest);
  return {
    ...comparison,
    candidate: applyRecordValueChanges(latest, comparison.applicableLocalChanges),
  };
}

function valueKeys(value: unknown): Array<string | number> {
  if (Array.isArray(value)) return Array.from({ length: value.length }, (_, index) => index);
  return isPlainRecord(value) ? Object.keys(value) : [];
}

function valueAtKey(value: unknown, key: string | number): unknown {
  return (value as Record<string | number, unknown>)[key];
}

function valueAtPath(value: unknown, path: readonly (string | number)[]): LocatedValue {
  let current = value;
  if (path.length === 0) return { exists: true, value: current };
  for (const segment of path) {
    if ((!Array.isArray(current) && !isPlainRecord(current)) || !hasOwn(current, segment)) {
      return { exists: false, value: undefined };
    }
    current = (current as Record<string | number, unknown>)[segment];
  }
  return { exists: true, value: current };
}

function locatedValuesEqual(first: LocatedValue, second: LocatedValue): boolean {
  return first.exists === second.exists && (!first.exists || canonicallyEqualRecordValues(first.value, second.value));
}

function applyChangeAtPath(root: unknown, change: RecordValueChange): unknown {
  const clonedRoot = isContainer(root) ? root : containerFor(change.path[0]);
  let parent = clonedRoot as Record<string | number, unknown>;
  for (let index = 0; index < change.path.length - 1; index += 1) {
    const segment = change.path[index];
    const nextSegment = change.path[index + 1];
    // Never traverse an inherited container. In particular, `__proto__` on a
    // normal object resolves to Object.prototype; reusing it would let an
    // otherwise ordinary record change mutate the global prototype.
    const existing = hasOwn(parent, segment) ? parent[segment] : undefined;
    const next = isContainer(existing) ? existing : containerFor(nextSegment);
    defineValue(parent, segment, next);
    parent = next as Record<string | number, unknown>;
  }

  const finalSegment = change.path[change.path.length - 1];
  if (change.kind === 'delete') {
    if (Array.isArray(parent) && typeof finalSegment === 'number') {
      parent.splice(finalSegment, 1);
    } else {
      delete parent[finalSegment];
    }
  } else {
    defineValue(parent, finalSegment, _cloneDeep(change.changed));
  }
  return clonedRoot;
}

function defineValue(target: Record<string | number, unknown>, key: string | number, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function containerFor(segment: string | number): Record<string, unknown> | unknown[] {
  return typeof segment === 'number' ? [] : {};
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || isPlainRecord(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
