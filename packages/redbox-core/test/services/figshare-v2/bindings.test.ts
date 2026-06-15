import { evaluateBinding } from '../../../src/services/figshare-v2/bindings';

let expect: Chai.ExpectStatic;

describe('figshare-v2 bindings', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  describe('path bindings', function () {
    const binding = {
      kind: 'path' as const,
      path: 'metadata.dataset-size',
      defaultValue: ''
    };

    it('uses the configured default for missing and null values', async function () {
      expect(await evaluateBinding(binding, { metadata: {} })).to.equal('');
      expect(await evaluateBinding(binding, { metadata: { 'dataset-size': null } })).to.equal('');
    });

    it('preserves explicit values', async function () {
      expect(await evaluateBinding(binding, { metadata: { 'dataset-size': '1 dataset, 10 MB' } }))
        .to.equal('1 dataset, 10 MB');
    });
  });
});
