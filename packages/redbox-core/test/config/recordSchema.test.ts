import { expect } from 'chai';
import {
  Config,
  DEFAULT_RECORD_SCHEMA_CACHE_MAX_ENTRIES,
  DEFAULT_RECORD_SCHEMA_CONTRIBUTOR_TIMEOUT_MS,
  DEFAULT_RECORD_SCHEMA_MAX_DEPTH,
  DEFAULT_RECORD_SCHEMA_MAX_DIAGNOSTICS,
  DEFAULT_RECORD_SCHEMA_MAX_DOCUMENT_BYTES,
  DEFAULT_RECORD_SCHEMA_MAX_PROPERTIES,
  DEFAULT_RECORD_SCHEMA_MINIMUM_AGE_DAYS,
  RECORD_CONTRACT_FORMAT_V1,
  RECORD_SCHEMA_PROBLEM_CODES,
  RecordTypeModel,
  WaterlineModels,
  recordSchema,
  resolveRecordSchemaUnknownProperties,
  validateRecordSchemaConfig,
  validateRecordTypeRecordSchemaConfig,
} from '../../src';
import type { RecordTypeDefinition } from '../../src';

function withConfigValue(path: string, value: unknown): unknown {
  const candidate: Record<string, unknown> = structuredClone({ ...recordSchema });
  const segments = path.split('.');
  let cursor = candidate;

  for (const segment of segments.slice(0, -1)) {
    const next = cursor[segment];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      throw new Error(`Fixture path '${path}' does not resolve to an object.`);
    }
    cursor = next as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
  return candidate;
}

function withoutConfigValue(path: string): unknown {
  const candidate = withConfigValue(path, null) as Record<string, unknown>;
  const segments = path.split('.');
  let cursor = candidate;

  for (const segment of segments.slice(0, -1)) {
    cursor = cursor[segment] as Record<string, unknown>;
  }
  delete cursor[segments[segments.length - 1]];
  return candidate;
}

function expectInvalidAt(value: unknown, path: string, reason: string): void {
  const result = validateRecordSchemaConfig(value);
  expect(result.valid).to.equal(false);
  if (result.valid) {
    throw new Error(`Expected '${path}' to be invalid.`);
  }
  expect(result.problems).to.deep.include({
    code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
    path: `recordSchema.${path}`,
    reason,
  });
}

describe('record-schema configuration', function () {
  it('exports disabled, compatibility-first bounded defaults', function () {
    expect(recordSchema).to.deep.equal({
      enabled: false,
      unknownProperties: 'allow',
      contractFormat: RECORD_CONTRACT_FORMAT_V1,
      cacheMaxEntries: DEFAULT_RECORD_SCHEMA_CACHE_MAX_ENTRIES,
      limits: {
        maxDepth: DEFAULT_RECORD_SCHEMA_MAX_DEPTH,
        maxProperties: DEFAULT_RECORD_SCHEMA_MAX_PROPERTIES,
        maxDocumentBytes: DEFAULT_RECORD_SCHEMA_MAX_DOCUMENT_BYTES,
        maxDiagnostics: DEFAULT_RECORD_SCHEMA_MAX_DIAGNOSTICS,
        contributorTimeoutMs: DEFAULT_RECORD_SCHEMA_CONTRIBUTOR_TIMEOUT_MS,
      },
      retention: {
        minimumAgeDays: DEFAULT_RECORD_SCHEMA_MINIMUM_AGE_DAYS,
      },
    });
    expect(recordSchema).to.deep.include({
      enabled: false,
      unknownProperties: 'allow',
      contractFormat: 'redbox-record-contract/1',
      cacheMaxEntries: 128,
    });
    expect(recordSchema.limits).to.deep.equal({
      maxDepth: 64,
      maxProperties: 10_000,
      maxDocumentBytes: 1_048_576,
      maxDiagnostics: 1_000,
      contributorTimeoutMs: 1_000,
    });
    expect(recordSchema.retention.minimumAgeDays).to.equal(365);
    expect(Config.recordSchema).to.equal(recordSchema);
    expect(validateRecordSchemaConfig(structuredClone(recordSchema))).to.deep.equal({
      valid: true,
      config: recordSchema,
    });
  });

  const numericPaths = [
    'cacheMaxEntries',
    'limits.maxDepth',
    'limits.maxProperties',
    'limits.maxDocumentBytes',
    'limits.maxDiagnostics',
    'limits.contributorTimeoutMs',
    'retention.minimumAgeDays',
  ];

  for (const path of numericPaths) {
    it(`rejects non-positive, non-integral, non-finite, and non-number ${path} values`, function () {
      for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expectInvalidAt(withConfigValue(path, value), path, 'positive-integer');
      }
      expectInvalidAt(withConfigValue(path, '1'), path, 'type');
    });
  }

  it('rejects unsupported and malformed global values without coercion', function () {
    expectInvalidAt(withConfigValue('enabled', 'true'), 'enabled', 'type');
    expectInvalidAt(withConfigValue('unknownProperties', 'strip'), 'unknownProperties', 'unsupported-value');
    expectInvalidAt(
      withConfigValue('contractFormat', 'redbox-record-contract/2'),
      'contractFormat',
      'unsupported-value'
    );
    expectInvalidAt(withConfigValue('integrationPins', {}), 'integrationPins', 'type');
    expectInvalidAt(withConfigValue('integrationPins', [{}]), 'integrationPins.0', 'type');
    expect(validateRecordSchemaConfig(null)).to.deep.equal({
      valid: false,
      problems: [{ code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID, path: 'recordSchema', reason: 'type' }],
    });
  });

  it('reports absent required settings without supplying fallback values', function () {
    for (const path of [
      'enabled',
      'unknownProperties',
      'contractFormat',
      'cacheMaxEntries',
      'limits.maxDepth',
      'limits.maxProperties',
      'limits.maxDocumentBytes',
      'limits.maxDiagnostics',
      'limits.contributorTimeoutMs',
      'retention.minimumAgeDays',
    ]) {
      expectInvalidAt(withoutConfigValue(path), path, 'required');
    }
    expectInvalidAt(withoutConfigValue('limits'), 'limits', 'required');
    expectInvalidAt(withoutConfigValue('retention'), 'retention', 'required');
  });

  it('uses the record-type override before the global default', function () {
    expect(resolveRecordSchemaUnknownProperties('allow', { unknownProperties: 'declared' })).to.equal('declared');
    expect(resolveRecordSchemaUnknownProperties('declared', {})).to.equal('declared');
    expect(resolveRecordSchemaUnknownProperties('allow')).to.equal('allow');
  });

  it('rejects unsupported record-type values without affecting record validation typing', function () {
    expect(
      validateRecordTypeRecordSchemaConfig({ unknownProperties: 'strip' }, 'recordtype.dataset.recordSchema')
    ).to.deep.equal([
      {
        code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        path: 'recordtype.dataset.recordSchema.unknownProperties',
        reason: 'unsupported-value',
      },
    ]);

    const definition: RecordTypeDefinition = {
      packageType: 'dataset',
      recordValidation: { mode: 'shadow', operations: { publish: { mode: 'enforce' } } },
      recordSchema: { unknownProperties: 'declared' },
    };
    expect(definition.recordValidation).to.deep.equal({
      mode: 'shadow',
      operations: { publish: { mode: 'enforce' } },
    });
    expect(definition.recordSchema).to.deep.equal({ unknownProperties: 'declared' });
  });

  it('mirrors the override in Waterline and storage record-type representations', function () {
    expect(WaterlineModels.RecordType.attributes.recordSchema).to.deep.include({ type: 'json' });

    const storedRecordType = new RecordTypeModel();
    storedRecordType.recordValidation = { mode: 'shadow' };
    storedRecordType.recordSchema = { unknownProperties: 'declared' };
    expect(storedRecordType).to.deep.include({
      recordValidation: { mode: 'shadow' },
      recordSchema: { unknownProperties: 'declared' },
    });
  });
});
