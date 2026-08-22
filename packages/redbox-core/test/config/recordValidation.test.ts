import { expect } from 'chai';
import { Config, DEFAULT_RECORD_VALIDATION_TIMEOUT_MS, recordValidation } from '../../src';

describe('record-validation configuration', function () {
  it('defaults globally to five-second shadow validation', function () {
    expect(DEFAULT_RECORD_VALIDATION_TIMEOUT_MS).to.equal(5_000);
    expect(recordValidation).to.deep.equal({ mode: 'shadow', timeoutMs: 5_000 });
    expect(Config.recordValidation).to.equal(recordValidation);
  });
});
