let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));

import { formatRecordFormFingerprint, formatRecordFormCatalogueFingerprint } from '../../src/RecordFormFingerprint';

describe('RecordFormFingerprint', function () {
  it('is stable across object insertion order and changes with the form contract', function () {
    const first = formatRecordFormFingerprint({
      recordType: 'rdmp',
      form: { name: 'default', configuration: { fields: ['title'], version: 1 } },
      currentWorkflow: { stage: 'draft', form: 'default' },
    });
    const same = formatRecordFormFingerprint({
      currentWorkflow: { form: 'default', stage: 'draft' },
      form: { configuration: { version: 1, fields: ['title'] }, name: 'default' },
      recordType: 'rdmp',
    });
    const changed = formatRecordFormFingerprint({
      recordType: 'rdmp',
      form: { name: 'default', configuration: { fields: ['title', 'description'], version: 1 } },
      currentWorkflow: { stage: 'draft', form: 'default' },
    });

    expect(first).to.match(/^sha256:[0-9a-f]{64}$/);
    expect(same).to.equal(first);
    expect(changed).not.to.equal(first);
  });

  it('does not invoke accessors and fails closed for oversized contracts', function () {
    let accessorInvoked = false;
    const configuration: Record<string, unknown> = { fields: ['title'] };
    Object.defineProperty(configuration, 'secretProviderValue', {
      enumerable: true,
      get: () => {
        accessorInvoked = true;
        return 'secret';
      },
    });

    expect(formatRecordFormFingerprint({ form: { configuration } })).to.match(/^sha256:[0-9a-f]{64}$/);
    expect(accessorInvoked).to.equal(false);
    expect(formatRecordFormFingerprint({ form: { configuration: 'x'.repeat(1_048_577) } })).to.equal(undefined);
  });
});

describe('Record form catalogue fingerprint', function () {
  it('composes a catalogue larger than one form while retaining each form bound', function () {
    const forms = [{ configuration: 'a'.repeat(600_000) }, { configuration: 'b'.repeat(600_000) }];
    const fingerprint = formatRecordFormCatalogueFingerprint(forms, {});
    expect(fingerprint).to.match(/^sha256:[0-9a-f]{64}$/);
    expect(formatRecordFormCatalogueFingerprint(forms, {})).to.equal(fingerprint);
    expect(formatRecordFormCatalogueFingerprint([...forms].reverse(), {})).not.to.equal(fingerprint);
    expect(formatRecordFormCatalogueFingerprint([{ configuration: 'a'.repeat(1_048_577) }], {})).to.equal(undefined);
    expect(formatRecordFormCatalogueFingerprint(forms, { definition: 'a'.repeat(1_048_577) })).to.equal(undefined);
    expect(formatRecordFormCatalogueFingerprint(Array(101).fill({}), {})).to.equal(undefined);
  });
});
