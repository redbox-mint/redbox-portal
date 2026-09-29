import { expect } from 'chai';
import {
  Config,
  DEFAULT_RECORD_CONCURRENT_MODIFICATION_MODE,
  DEFAULT_RECORD_VALIDATION_TIMEOUT_MS,
  isInternalRecordValidationBypass,
  isRecordValidationBypassReason,
  RECORD_VALIDATION_BYPASS_REASONS,
  recordValidation,
  resolveRecordConcurrentModificationConfig,
} from '../../src';

describe('record-validation configuration', function () {
  it('defaults globally to five-second shadow validation', function () {
    expect(DEFAULT_RECORD_VALIDATION_TIMEOUT_MS).to.equal(5_000);
    expect(recordValidation).to.deep.equal({ mode: 'shadow', timeoutMs: 5_000 });
    expect(Config.recordValidation).to.equal(recordValidation);
  });

  it('exports the runtime validation-bypass contract from the public package entry point', function () {
    expect(RECORD_VALIDATION_BYPASS_REASONS).to.deep.equal([
      'historical-record-repair',
      'trusted-data-migration',
      'configuration-recovery',
    ]);
    expect(isRecordValidationBypassReason('trusted-data-migration')).to.equal(true);
    expect(
      isInternalRecordValidationBypass({
        mode: 'bypass',
        reason: 'trusted-data-migration',
        actor: { kind: 'service', id: 'MigrationService' },
      })
    ).to.equal(true);
  });

  it('exports the record-type concurrency default from the public package entry point', function () {
    expect(DEFAULT_RECORD_CONCURRENT_MODIFICATION_MODE).to.equal('last-write-wins');
    expect(resolveRecordConcurrentModificationConfig(undefined)).to.deep.equal({ mode: 'last-write-wins' });
  });
});
