import assert from 'node:assert/strict';
import { printSchema } from 'graphql';
import { buildCatalogue } from '../../../src/record-graphql/catalogue';
import { formatRecordFormFingerprint } from '../../../src/RecordFormFingerprint';
import { gridEnvironment, gridHarness } from '../../fixtures/record-grid.fixtures';
import { scuGridContracts } from '../../fixtures/scu-grid.fixtures';

describe('SCU deployed multi-stage read catalogue regression', () => {
  it('retains all 16 variants and exact single-stage catalogue cardinalities', () => {
    const contracts = scuGridContracts();
    assert.equal(contracts.length, 16);
    assert.deepEqual(
      ['draft', 'hdrapproval', 'submitted', 'active', 'ended', 'closed', 'abandoned'].map(
        stage => buildCatalogue(contracts, 'rdmp', [stage], gridEnvironment()).catalogue.fields.length
      ),
      [224, 224, 228, 228, 230, 230, 230]
    );
    assert.equal(buildCatalogue(contracts, 'dataPublication', [], gridEnvironment()).catalogue.fields.length, 166);
  });
  it('discovers seven stages within bounded fingerprints and invalidates on contract changes', () => {
    const contracts = scuGridContracts();
    const environment = gridEnvironment();
    const first = buildCatalogue(contracts, 'rdmp', [], environment).catalogue;
    assert.equal(first.fields.length, 234);
    assert.equal(first.variants.length, 7);
    assert.equal(formatRecordFormFingerprint(first), undefined, 'catalogue alone exceeds the old one-form byte budget');
    assert.equal(buildCatalogue(contracts, 'rdmp', [], environment).catalogue.revision, first.revision);
    Object.assign(contracts[0].root.properties, {
      new_field: { kind: 'scalar', scalarType: 'string', nullable: true },
    });
    assert.notEqual(buildCatalogue(contracts, 'rdmp', [], environment).catalogue.revision, first.revision);
  });
  it('executes the audited minimal HTTP query with authoritative unique record OIDs', async () => {
    const h = gridHarness(['record-oid-one', 'record-oid-two'], scuGridContracts());
    for (const [oid, record] of h.records)
      h.records.set(oid, {
        ...record,
        metaMetadata: { ...record.metaMetadata, type: 'rdmp', form: 'default-1.0-draft' },
      });
    const response = await h.query('{records(recordType:"rdmp",first:2){nodes{oid workflowStep} hasNextPage}}');
    assert.equal(response.status, 200);
    assert.equal(response.body.errors, undefined, JSON.stringify(response.body.errors));
    assert.deepEqual(
      response.body.data?.records?.nodes.map(node => node.oid),
      ['record-oid-one', 'record-oid-two']
    );
    assert.equal(new Set(response.body.data?.records?.nodes.map(node => node.oid)).size, 2);
  });
  it('reproduces global SDL size failure while each real type fits the editor bound', () => {
    const contracts = scuGridContracts();
    assert.ok(Buffer.byteLength(printSchema(gridHarness([], contracts).schema)) > 262144);
    for (const type of ['rdmp', 'dataPublication'])
      assert.ok(
        Buffer.byteLength(
          printSchema(
            gridHarness(
              [],
              contracts.filter(c => c.context.recordType === type)
            ).schema
          )
        ) < 262144
      );
  });
});
