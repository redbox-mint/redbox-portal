import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type Table = {
  revision: string;
  format: string;
  cases: Record<string, unknown>;
  shared: Record<string, unknown>;
  sequences?: Record<string, unknown[]>;
  sharedFiles?: Record<string, string>;
  sequenceFiles?: Record<string, { file: string; count: number }>;
};
const tables = new Map<
  string,
  { table: Table; decoded: Map<string, unknown>; sequenceFile?: string; sequences?: Record<string, unknown[]> }
>();
let title = '';
let ordinals = new Map<string, number>();
beforeEach(function () {
  title = this.currentTest!.fullTitle();
  ordinals = new Map();
  for (const store of tables.values()) store.decoded.clear();
});

/** Full JSON expectations, with lossless references for repeated database/HTTP
 * values. References save space; assertions compare decoded values, never hashes.
 * Ordinary tests have no capture/update mode.
 */
function goldenTable(kind: string) {
  let store = tables.get(kind);
  if (!store) {
    // Mocha executes suites serially. Retain only the current family so the
    // large route corpus cannot pin every subsequent family's decoded values.
    tables.clear();
    const table = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/golden', kind + '.json'), 'utf8')) as Table;
    assert.equal(table.format, 'redbox-golden-v1');
    assert.equal(table.revision, 'd776f9581bec488b211454791794e79eeaee034d');
    store = { table, decoded: new Map() };
    tables.set(kind, store);
  }
  return store;
}
export function golden(kind: string, key: string): unknown {
  const store = goldenTable(kind);
  const { table, decoded } = store;
  function decode(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(decode);
    if (!value || typeof value !== 'object') return value;
    if (Object.hasOwn(value, '$body'))
      return readFileSync(
        path.join(__dirname, 'fixtures/golden', Reflect.get(value, '$body') as string),
        'utf8'
      ).trim();
    if (Object.hasOwn(value, '$undefined')) return undefined;
    if (Object.hasOwn(value, '$concat'))
      return (Reflect.get(value, '$concat') as unknown[]).flatMap(item => decode(item) as unknown[]);
    if (Object.hasOwn(value, '$text')) return (Reflect.get(value, '$text') as unknown[]).map(decode).join('');
    if (Object.hasOwn(value, '$json')) return JSON.stringify(decode(Reflect.get(value, '$json')));
    if (Object.hasOwn(value, '$object'))
      return Object.fromEntries(decode(Reflect.get(value, '$object')) as [string, unknown][]);
    if (Object.hasOwn(value, '$ref')) {
      const ref = Reflect.get(value, '$ref') as string;
      if (!Object.hasOwn(table.shared, ref) && table.sharedFiles?.[ref.slice(0, 3)]) {
        const chunk = JSON.parse(
          readFileSync(path.join(__dirname, 'fixtures/golden', table.sharedFiles[ref.slice(0, 3)]), 'utf8')
        );
        Object.assign(table.shared, chunk);
      }
      assert(Object.hasOwn(table.shared, ref), 'Missing golden reference: ' + ref);
      if (!decoded.has(ref)) decoded.set(ref, decode(table.shared[ref]));
      return decoded.get(ref);
    }
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, decode(item)]));
  }
  if (Object.hasOwn(table.cases, key)) return decode(table.cases[key]);
  const sequence = /^(.*) #(\d+)$/.exec(key);
  let values = sequence && table.sequences?.[sequence[1]];
  const external = sequence && table.sequenceFiles?.[sequence[1]];
  if (!values && external) {
    if (store.sequenceFile !== external.file) {
      store.sequences = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/golden', external.file), 'utf8'));
      store.sequenceFile = external.file;
    }
    values = store.sequences![sequence![1]];
  }
  assert(values && Number(sequence![2]) < values.length, 'Missing golden observation: ' + kind + ' ' + key);
  return decode(values[Number(sequence![2])]);
}
export function assertGolden(kind: string, key: string, actual: unknown): void {
  // Keep diagnostics bounded for large, shared record/flow snapshots. The native
  // deep-equality comparator still receives both complete values; passing an
  // AssertionError avoids formatting their entire expanded graph on failure.
  assert.deepEqual(
    actual,
    golden(kind, key),
    new assert.AssertionError({ message: 'Complete native contract: ' + kind + ' ' + key })
  );
}
export function goldenKey(kind: string): string {
  const ordinal = ordinals.get(kind) ?? 0;
  ordinals.set(kind, ordinal + 1);
  return title + ' #' + ordinal;
}
export function assertGoldenNext(kind: string, actual: unknown): void {
  assertGolden(kind, goldenKey(kind), actual);
}

function* caseKeys(table: Table): Generator<string> {
  yield* Object.keys(table.cases);
  for (const [title, values] of Object.entries(table.sequences ?? {}))
    for (let ordinal = 0; ordinal < values.length; ordinal++) yield title + ' #' + ordinal;
  for (const [title, { count }] of Object.entries(table.sequenceFiles ?? {}))
    for (let ordinal = 0; ordinal < count; ordinal++) yield title + ' #' + ordinal;
}

/** Exercise the same full-equality assertion as each production test. Trace-only
 * observations have no HTTP envelope; every component they do record is checked. */
export function goldenControls(kind: string): void {
  describe(kind + ' golden assertion controls', () => {
    it('rejects corruption of every recorded wire/state component', () => {
      const table = goldenTable(kind).table;
      const first = caseKeys(table).next().value;
      assert(first, 'A converted suite must record observations');
      assert.throws(() => assertGolden(kind, first, { corrupted: true }), assert.AssertionError);
      const components = [
        ['status', /^(?:status|statusCode)$/],
        ['headers', /^(?:headers|cookies|cookie)$/],
        ['body', /^(?:body|bytes|text|value)$/],
        [
          'state',
          /^(?:saved|state|stored|effects|events|audits|calls|sessions|before|trace|providers|transitions|guards|persisted|data|auditDelta|disposed|diagnostics|rejected|error)$/,
        ],
      ] as const;
      const checked: string[] = [];
      for (const [component, names] of components) {
        for (const key of caseKeys(table)) {
          const value = structuredClone(golden(kind, key));
          const visited = new WeakSet<object>();
          function corrupt(node: unknown): boolean {
            if (!node || typeof node !== 'object') return false;
            if (visited.has(node)) return false;
            visited.add(node);
            for (const name of Object.keys(node)) {
              if (names.test(name)) {
                Reflect.set(node, name, component === 'status' ? 599 : '<corrupted-' + component + '>');
                return true;
              }
              if (corrupt(Reflect.get(node, name))) return true;
            }
            return false;
          }
          if (!corrupt(value)) continue;
          assert.throws(() => assertGolden(kind, key, value), assert.AssertionError, component);
          checked.push(component);
          break;
        }
      }
      // Some historical flows record their state directly (for example
      // { info: 200, old: 403, rotated: true }), without a named state envelope.
      // Corrupt a recorded value in that observation too.
      if (!checked.length) {
        const value = structuredClone(golden(kind, first));
        assert(value && typeof value === 'object', 'State observation must be structured: ' + kind);
        const name = Object.keys(value)[0];
        assert(name, 'State observation must contain recorded values: ' + kind);
        Reflect.set(value, name, '<corrupted-state>');
        assert.throws(() => assertGolden(kind, first, value), assert.AssertionError, 'state');
        checked.push('state');
      }
      console.log('FM043 assertion control ' + JSON.stringify({ kind, components: checked }));
    });
  });
}
