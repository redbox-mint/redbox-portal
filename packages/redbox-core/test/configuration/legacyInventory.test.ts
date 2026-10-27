import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPortalConfiguration } from '../../src/configuration/portal';
import { baselineConfigurationFixtures } from './legacyInventoryTypes';

const evidence = resolve(__dirname, '../../../../test/fixtures/sails-retirement');
const inventory = JSON.parse(readFileSync(resolve(evidence, 'configuration-inventory.json'), 'utf8'));
const ledger = JSON.parse(readFileSync(resolve(evidence, 'configuration-acceptance.json'), 'utf8'));
const env = { REDBOX_SESSION_SECRET: 'configuration-inventory-synthetic-secret' };
const load = (config: Record<string, unknown>) =>
  loadPortalConfiguration({
    env,
    extensions: { providers: [{ name: 'baseline-inventory', root: '.', declaration: { apiVersion: 1, config } }] },
  });

describe('complete source-derived baseline configuration inventory', () => {
  it('accounts for every source path, fixture, expression, environment read and excluded file', () => {
    assert.equal(inventory.baseline, 'a49366803164429f9d8bdd249dadcdf856c9d13e');
    assert.equal(ledger.entries.length, inventory.entries.length);
    assert.equal(ledger.fixtures.length, inventory.fixtures.length);
    assert.equal(ledger.unresolved.length, inventory.unresolved.length);
    assert.equal(ledger.environmentReads.length, inventory.environmentReads.length);
    assert.equal(ledger.excludedFiles.length, inventory.excludedFiles.length);
    for (const [index, cell] of ledger.entries.entries()) {
      assert.deepEqual(cell.path, inventory.entries[index].path);
      assert(cell.classification && cell.reason, cell.path.join('.'));
      assert(inventory.entries[index].provenance.length, cell.path.join('.'));
      if (cell.classification === 'retained') assert(cell.schema && cell.typed, cell.path.join('.'));
      if (cell.classification === 'migrated' || cell.classification === 'retired')
        assert.equal(cell.references.length, 2);
    }
    for (const cell of ledger.fixtures) assert(cell.classification && cell.reason, String(cell.index));
    for (const cell of [...ledger.unresolved, ...ledger.environmentReads, ...ledger.excludedFiles])
      assert(cell.owner && cell.disposition, cell.file);
    for (const cell of ledger.strictShapes) assert.equal(cell.references.length, 2);
    assert(ledger.strictShapes.some((cell: { path: string[] }) => cell.path.join('.') === 'api.max_requests'));
    assert.equal(baselineConfigurationFixtures.length, ledger.counts.fixtures.retained);
    assert.equal(ledger.typingBacklog.length, 5);
    for (const cell of ledger.typingBacklog) {
      assert.equal(cell.classification, 'B');
      assert(cell.baseline.file && cell.baseline.line && cell.baseline.declaration);
    }
    for (const cell of ledger.typingDiagnostics) {
      assert.equal(cell.classification, 'B');
      assert(ledger.typingBacklog.some((backlog: { key: string }) => backlog.key === cell.key));
    }
  });

  let typedIndex = 0;
  for (const fixture of ledger.fixtures) {
    if (fixture.classification !== 'retained') continue;
    const typed = baselineConfigurationFixtures[typedIndex++];
    it(`accepts baseline fixture ${fixture.index}: ${fixture.file} [${fixture.name}]`, async () => {
      const original = inventory.fixtures[fixture.index];
      assert.deepEqual(typed, { [original.name]: original.sample });
      await load(typed);
    });
  }

  for (const [name, config] of Object.entries({
    'API numeric string': { api: { max_requests: '20' } },
    'SVG numeric string': { record: { form: { svgMaxBytes: '1024' } } },
    'prehydrate numeric string': { form: { prehydrate: { maxVocabSelections: '50' } } },
    'native session numeric string': { redboxSession: { ttl: '3600' } },
    'SMTP numeric string': { emailnotification: { settings: { serverOptions: { port: '1025' } } } },
    'native boolean string': { redboxSession: { stringify: 'false' } },
    'structured URL': { server: { publicUrl: { value: 'https://example.invalid' } } },
    'Mongo Map key': { storage: { mongodb: { indices: [{ key: new Map([['redboxOid', 1]]) }] } } },
    'Mongo entry array key': { storage: { mongodb: { indices: [{ key: [['redboxOid', 1]] }] } } },
    'unregistered executable': { api: { additionalClientConfig: { evaluate: () => true } } },
  })) {
    it(`documents and rejects ${name}`, async () => {
      await assert.rejects(load(config));
    });
  }
});
