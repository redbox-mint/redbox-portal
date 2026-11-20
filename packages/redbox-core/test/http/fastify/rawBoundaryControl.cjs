// One compiler lifetime per bounded control process. Keep whole-program
// negative scans out of the long-lived Mocha heap.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const directory = path.resolve(__dirname, '../../../../../support/specs/fastify-migration/evidence');
const { inventory, checkInventory } = require(path.join(directory, 'reconcile-FM-036.cjs'));
// The suite's first case verifies this complete baseline against a fresh scan.
// Reuse its fixture data here so each bounded child owns one compiler program.
const baseline = () => readFileSync(path.join(directory, 'FM-036.raw-boundaries.json'), 'utf8');

switch (process.argv[2]) {
  case 'headers-fixture':
    assert.throws(() => checkInventory('', { omitFixtureOperation: 'setHeader' }), /Missing raw fixture boundary/);
    break;
  case 'header-unowned':
    assert.throws(
      () =>
        checkInventory('', {
          overrides: {
            '000-fm036-probe.ts':
              "import type { FastifyReply } from 'fastify'; declare const reply: FastifyReply; reply.raw.setHeader('X-Unclassified', 'present');",
          },
        }),
      /Unclassified raw boundary:[\s\S]*reply.raw.setHeader/
    );
    break;
  case 'header-drift': {
    const file = 'http/fastify/readStreams.ts';
    const source = readFileSync(path.resolve(directory, '../../../../packages/redbox-core/src', file), 'utf8');
    assert.throws(
      () =>
        checkInventory(baseline(), {
          overrides: {
            [file]:
              source + "\ndeclare const fm036Reply: FastifyReply; fm036Reply.raw.setHeader('X-Drift', 'present');",
          },
        }),
      /FM-036 raw inventory drift/
    );
    break;
  }
  case 'interfaces-generation':
  case 'interfaces-check': {
    const overrides = {
      'http/000-unclassified-emitter.ts':
        "interface EmitterLike { on(event: string, listener: () => void): void; } declare const receiver: EmitterLike; receiver.on('terminal', () => {});",
      'storage/000-unclassified-stream.ts':
        "declare const source: NodeJS.ReadableStream; source.once('end', () => {});",
    };
    const unclassified = error => {
      assert.match(error.message, /Unclassified raw boundary:/);
      assert.match(error.message, /http\/000-unclassified-emitter.ts[\s\S]*receiver.on/);
      assert.match(error.message, /storage\/000-unclassified-stream.ts[\s\S]*source.once/);
      return true;
    };
    assert.throws(
      () =>
        process.argv[2] === 'interfaces-generation' ? inventory({ overrides }) : checkInventory('', { overrides }),
      unclassified
    );
    break;
  }
  case 'consumption-generation':
  case 'consumption-check': {
    const result = JSON.parse(baseline());
    const file = Object.keys(result.scannerFixtures).find(file => file.endsWith('/consumption-matrix.json.fixture'));
    const declarations = readFileSync(path.resolve(__dirname, 'fixtures/raw-boundaries/context.d.ts.fixture'), 'utf8');
    const cases = [
      ...result.scannerFixtures[file].cases,
      ...Object.entries(result.scannerFixtures)
        .filter(([file]) => file.endsWith('/type-recognition.json.fixture'))
        .flatMap(([, fixture]) => fixture.cases),
    ];
    const overrides = Object.fromEntries(
      cases.map(fixture => [
        `${fixture.scope ?? 'http'}/000-consumption/${fixture.id ?? fixture.family + '.' + fixture.form}.ts`,
        declarations + '\n' + fixture.source,
      ])
    );
    const failsEveryForm = error => {
      assert.match(error.message, /Unclassified raw boundary:/);
      const lines = error.message.split('\n');
      for (const fixture of cases) {
        const prefix = `${fixture.scope ?? 'http'}/000-consumption/${fixture.id ?? fixture.family + '.' + fixture.form}.ts:`;
        const marker = `[${fixture.expectedKind}|${fixture.operation}]`;
        assert(
          lines.some(line => line.startsWith(prefix) && line.includes(marker)),
          prefix + marker
        );
      }
      return true;
    };
    assert.throws(
      () =>
        process.argv[2] === 'consumption-generation' ? inventory({ overrides }) : checkInventory('', { overrides }),
      failsEveryForm
    );
    break;
  }
  case 'iteration-fixture':
    assert.throws(() => checkInventory('', { omitFixtureForm: 'for-await' }), /Missing raw fixture boundary/);
    break;
  default:
    throw new Error('Unknown raw boundary control: ' + process.argv[2]);
}
