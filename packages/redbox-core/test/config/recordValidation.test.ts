import { expect } from 'chai';
import {
  Config,
  DEFAULT_RECORD_VALIDATION_TIMEOUT_MS,
  isInternalRecordValidationBypass,
  isRecordValidationBypassReason,
  RECORD_VALIDATION_BYPASS_REASONS,
  recordValidation,
} from '../../src';

describe('record-validation configuration', function () {
  it('defaults globally to five-second shadow validation', function () {
    expect(DEFAULT_RECORD_VALIDATION_TIMEOUT_MS).to.equal(5_000);
    expect(recordValidation).to.deep.equal({ mode: 'shadow', timeoutMs: 5_000, shadowReportMaxSeries: 1_000 });
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
});
