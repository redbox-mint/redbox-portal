import { PersistenceError } from './errors';

/** Shared validation after each domain has applied its qualified paging policy. */
export function assertPersistencePage(values: readonly unknown[], code: string): void {
  if (values.some(value => !Number.isSafeInteger(value) || Number(value) < 0))
    throw new PersistenceError(code, 'Persistence pagination requires non-negative safe integers.');
}

/** The J2 loaded-model contract retains Waterline's legacy unlimited-limit forms. */
export function legacyModelPage(skip: unknown, limit: unknown): { skip: number; limit?: number } {
  if (typeof skip === 'string') skip = Number(skip);
  if (typeof limit === 'string') limit = Number(limit);
  if (skip === undefined) skip = 0;
  if (limit === null || limit === Infinity || (typeof limit === 'number' && limit < 0)) limit = undefined;
  // Loaded Waterline short-circuits an empty page before inspecting skip.
  if (limit === 0) return { skip: 0, limit: 0 };
  assertPersistencePage(limit === undefined ? [skip] : [skip, limit], 'invalid-harvest');
  return { skip: skip as number, limit: limit as number | undefined };
}
