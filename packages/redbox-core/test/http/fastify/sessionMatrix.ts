import assert from 'node:assert/strict';

function pairs(row: object): string[] {
  const entries = Object.entries(row).map(([key, value]) => [key, JSON.stringify(value)]);
  return entries.flatMap(([key, value], i) =>
    entries.slice(i + 1).map(([other, next]) => `${key}=${value}|${other}=${next}`)
  );
}
/** Deterministic greedy covering subset of a finite, explicitly enumerated grid. */
export function pairwise<T extends object>(rows: readonly T[]): T[] {
  const uncovered = new Set(rows.flatMap(pairs));
  const candidates = rows.map(row => ({ row, pairs: pairs(row) }));
  const selected: T[] = [];
  while (uncovered.size) {
    let best = candidates[0];
    let count = -1;
    for (const candidate of candidates) {
      const coverage = candidate.pairs.reduce((n, pair) => n + Number(uncovered.has(pair)), 0);
      if (coverage > count) {
        best = candidate;
        count = coverage;
      }
    }
    assert(count > 0);
    selected.push(best.row);
    for (const pair of best.pairs) uncovered.delete(pair);
  }
  return selected;
}
export function assertPairwise<T extends object>(full: readonly T[], subset: readonly T[]): void {
  const required = new Set(full.flatMap(pairs));
  for (const row of subset) for (const pair of pairs(row)) required.delete(pair);
  assert.equal(required.size, 0, `Uncovered pairs: ${[...required].join(', ')}`);
}
