import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accessionProvider } from '../examples/publication-provider';

const configuration = {
  connection: { endpoint: 'https://accession.example.test/', repository: 'research', token: 'example-secret' },
  writeBack: { url: 'metadata.accession.url' },
};
describe('publication provider documentation (PUB-17)', () => {
  it('keeps registration guidance identical to the compile-checked executable hook', () => {
    const source = readFileSync('support/documentation/examples/publication-provider.ts', 'utf8');
    const documentation = readFileSync('support/documentation/examples/publication-provider.md', 'utf8');
    const example = documentation.match(
      /<!-- publication-provider-registration:start -->\s*```typescript\n([\s\S]*?)\n```\s*<!-- publication-provider-registration:end -->/
    );
    assert.ok(example);
    assert.equal(example[1].trim(), source.slice(source.indexOf('export class AccessionPublication')).trim());
  });
  it('narrows malformed configuration, state and sealed dossiers without discarding unknown evidence', () => {
    for (const value of [
      null,
      {},
      { connection: {} },
      { ...configuration, connection: { ...configuration.connection, endpoint: 'https://user:secret@example.test/' } },
    ])
      assert.equal(accessionProvider.validateConfiguration(value).valid, false);
    const evidence = { phase: 'future', accession: 'ACC-1', receipt: { retain: true } };
    const original = structuredClone(evidence);
    assert.equal(accessionProvider.decodeState(evidence, 2).valid, false);
    assert.equal(accessionProvider.upgradeState(evidence, 2).valid, false);
    assert.deepEqual(evidence, original);
    assert.equal(accessionProvider.decodePreparedSource({ title: '' }).valid, false);
    assert.equal(accessionProvider.decodeState({}, 1).valid, true);
  });
  it('keeps credential rotation out of target identity while distinguishing repositories', () => {
    const config = accessionProvider.validateConfiguration(configuration);
    assert.ok(config.valid);
    const target = accessionProvider.targetFingerprint(config.value);
    assert.equal(
      accessionProvider.targetFingerprint({
        ...config.value,
        connection: { ...config.value.connection, token: 'rotated' },
      }),
      target
    );
    assert.notEqual(
      accessionProvider.targetFingerprint({
        ...config.value,
        connection: { ...config.value.connection, repository: 'other' },
      }),
      target
    );
    assert.deepEqual(accessionProvider.secretPaths, ['connection.token']);
  });
  it('validates the dossier locally without requiring a remote service or using credentials', async () => {
    const config = accessionProvider.validateConfiguration(configuration);
    assert.ok(config.valid);
    const result = await accessionProvider.prepareSource({
      brandId: 'brand',
      oid: 'record',
      destinationId: 'accession',
      configuration: config.value,
      record: { metadata: { title: 'Approved dossier' } },
      generatedValues: {},
      requester: { username: 'requester', userType: 'local' },
      approver: { username: 'approver', userType: 'local' },
    });
    assert.deepEqual(result, { valid: true, value: { title: 'Approved dossier' } });
  });
});
