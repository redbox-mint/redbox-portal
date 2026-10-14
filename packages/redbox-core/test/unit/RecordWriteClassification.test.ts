let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
const { classifyRecordWrite, recordWriteRequiresFormValidation } = require('../../src/RecordWriteClassification');

describe('RecordWriteClassification', () => {
  const baseRecord = () => ({
    redboxOid: 'record-1',
    metadata: { title: 'Original' },
    metaMetadata: {
      brandId: 'brand-1',
      type: 'rdmp',
      form: 'rdmp-1.0-draft',
      lastSaveDate: '2026-01-01T00:00:00.000Z',
    },
    workflow: { stage: 'draft' },
    authorization: { edit: ['owner'], view: [], editRoles: [], viewRoles: [] },
  });

  it('classifies each supported complete-candidate mutation shape', () => {
    const cases = [
      {
        scenario: 'record metadata',
        mutate: (record: ReturnType<typeof baseRecord>) => {
          record.metadata.title = 'Changed';
        },
        expected: 'record-metadata',
        validates: true,
      },
      {
        scenario: 'workflow and form context',
        mutate: (record: ReturnType<typeof baseRecord>) => {
          record.metaMetadata.form = 'rdmp-1.0-published';
          record.workflow.stage = 'published';
        },
        expected: 'form-relevant-object-metadata',
        validates: true,
      },
      {
        scenario: 'authorization only',
        mutate: (record: ReturnType<typeof baseRecord>) => {
          record.authorization.edit.push('editor');
        },
        expected: 'authorization-only',
        validates: false,
      },
      {
        scenario: 'non-form system metadata',
        mutate: (record: ReturnType<typeof baseRecord>) => {
          record.metaMetadata.lastSaveDate = '2026-02-01T00:00:00.000Z';
          (record.metaMetadata as Record<string, unknown>).sourceMetadata = 'harvest';
        },
        expected: 'non-form-system-metadata',
        validates: false,
      },
    ] as const;

    for (const testCase of cases) {
      const before = baseRecord();
      const after = structuredClone(before);
      testCase.mutate(after);
      const classification = classifyRecordWrite(before, after);
      expect(classification, testCase.scenario).to.equal(testCase.expected);
      expect(recordWriteRequiresFormValidation(classification), testCase.scenario).to.equal(testCase.validates);
    }
  });

  it('gives record metadata precedence over simultaneous authorization and system changes', () => {
    const before = baseRecord();
    const after = structuredClone(before);
    after.metadata.title = 'Changed';
    after.authorization.edit.push('editor');
    after.metaMetadata.lastSaveDate = '2026-03-01T00:00:00.000Z';

    expect(classifyRecordWrite(before, after)).to.equal('record-metadata');
  });

  it('reports no change for equivalent complete candidates', () => {
    const before = baseRecord();
    expect(classifyRecordWrite(before, structuredClone(before))).to.equal('no-change');
  });
});
