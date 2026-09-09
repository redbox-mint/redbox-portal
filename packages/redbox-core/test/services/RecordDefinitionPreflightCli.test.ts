import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInThisContext } from 'node:vm';
import { ObjectId } from 'mongodb';

// Execute the actual CLI with its built validators. Only Mongo transport and
// the service entry point are replaced so reader failures cannot be masked by
// later service validation. Native integration tests cover complete preflight.
const cliPath = resolve(__dirname, '../../../../support/integration-testing/record-definition-preflight.cjs');
const cliRequire = createRequire(cliPath);
const migrationPath = '../../packages/redbox-core/dist/services/RecordDefinitionMigrationService.js';
const migration = cliRequire(migrationPath);

async function readHistories(makeRow: (index: number) => object, count: number) {
  let fetched = 0;
  let cursorClosed = 0;
  let clientClosed = 0;
  let retained: object[] | undefined;
  let stdout = '';
  let stderr = '';
  const processStub = {
    env: { RECORD_DEFINITION_PREFLIGHT_MONGO_URL: 'mongodb://test-only' },
    exitCode: 0,
    stdout: { write: (value: string) => (stdout += value) },
    stderr: { write: (value: string) => (stderr += value) },
  };
  const cursor = {
    sort: (criteria: object) => {
      assert.deepEqual(criteria, { _id: 1 });
      return cursor;
    },
    limit: (limit: number) => {
      assert.equal(limit, 513);
      return cursor;
    },
    maxTimeMS: (milliseconds: number) => {
      assert.equal(milliseconds, 10000);
      return cursor;
    },
    batchSize: (size: number) => {
      assert.equal(size, 1);
      return cursor;
    },
    close: async () => {
      cursorClosed++;
    },
    async *[Symbol.asyncIterator]() {
      for (let index = 0; index < count; index++) {
        fetched++;
        yield makeRow(index);
      }
    },
  };
  let finish!: () => void;
  const finished = new Promise<void>(resolve => {
    finish = resolve;
  });
  class MongoClient {
    async connect() {}
    db() {
      return {
        collection(name: string) {
          assert.equal(name, 'recorddefinitionhistory');
          return { find: () => cursor };
        },
      };
    }
    async close() {
      clientClosed++;
      finish();
    }
  }
  class ReaderProbe {
    constructor(private reader: { histories(id: string): Promise<object[]> }) {}
    async preflight() {
      retained = await this.reader.histories('legacy-a');
      return { count: retained.length };
    }
  }
  const wrapped = runInThisContext(`(function(require, process) {\n${readFileSync(cliPath, 'utf8')}\n})`, {
    filename: cliPath,
  });
  wrapped((name: string) => {
    if (name === 'mongodb') return { MongoClient, ObjectId };
    if (name === migrationPath) return { ...migration, RecordDefinitionMigrationService: ReaderProbe };
    return cliRequire(name);
  }, processStub);
  await finished;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cursorClosed, 1);
  assert.equal(clientClosed, 1);
  return { fetched, retained, stdout, stderr, exitCode: processStub.exitCode };
}

describe('B11 actual CLI bounded history reader', () => {
  const row = (index: number) => ({ _id: `history-${index}`, recordType: 'legacy-a', note: 'accepted' });
  for (const [name, extra, code] of [
    ['unsupported property', { forged: 'CLI-SECRET' }, 'invalid-history-property'],
    ['forbidden property', JSON.parse('{"__proto__":"CLI-SECRET"}'), 'unsafe-storage-property'],
    ['forbidden nested property', { actor: { constructor: 'CLI-SECRET' } }, 'unsafe-property'],
    ['malformed timestamp', { createdAt: null }, 'invalid-artifact-timestamp'],
    ['non-JSON property', { note: undefined }, 'non-json-data'],
    ['oversized first row', { note: 'CLI-SECRET'.repeat(4000) }, 'unsafe-or-unbounded-data'],
  ] as const) {
    it(`rejects ${name} before fetching another row`, async () => {
      const result = await readHistories(index => ({ ...row(index), ...(index === 0 ? extra : {}) }), 512);
      assert.equal(result.fetched, 1);
      assert.equal(result.retained, undefined);
      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, '');
      assert.ok(result.stderr.includes(code), result.stderr);
      assert.ok(result.stderr.length < 256);
      assert.ok(!result.stderr.includes('CLI-SECRET'));
    });
  }

  it('enforces cumulative UTF-8 bytes before returning rows', async () => {
    const makeRow = (index: number) => ({ ...row(index), note: 'é'.repeat(16000) });
    let bytes = 0;
    let expectedFetched = 0;
    while (bytes <= 8_000_000) {
      const { _id, ...value } = makeRow(expectedFetched++);
      bytes += Buffer.byteLength(JSON.stringify({ ...value, id: _id }), 'utf8');
    }
    const result = await readHistories(makeRow, 512);
    assert.equal(result.fetched, expectedFetched);
    assert.ok(result.fetched < 512);
    assert.equal(result.retained, undefined);
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /database-byte-limit/);
    assert.ok(result.stderr.length < 256);
  });

  it('returns exactly 512 normalized rows', async () => {
    const date = new Date('2026-09-08T00:00:00.000Z');
    const brand = new ObjectId();
    const result = await readHistories(
      index => ({ ...row(index), branding: brand, occurredAt: date, createdAt: date }),
      512
    );
    assert.equal(result.fetched, 512);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(
      result.retained,
      Array.from({ length: 512 }, (_, index) => ({
        id: `history-${index}`,
        recordType: 'legacy-a',
        note: 'accepted',
        branding: brand.toHexString(),
        occurredAt: date.toISOString(),
      }))
    );
    assert.deepEqual(JSON.parse(result.stdout), { count: 512 });
  });

  it('rejects the 513th row at the retained-count boundary', async () => {
    const result = await readHistories(index => {
      // The boundary must reject even before normalizing the overflow row.
      if (index === 512) return { ...row(index), occurredAt: new Date(NaN) };
      return row(index);
    }, 514);
    assert.equal(result.fetched, 513);
    assert.equal(result.retained, undefined);
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /database-row-limit/);
    assert.ok(result.stderr.length < 256);
  });
});
