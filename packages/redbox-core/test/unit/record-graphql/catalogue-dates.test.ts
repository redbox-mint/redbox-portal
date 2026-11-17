import assert from 'node:assert/strict';
import type { DateInputFormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';
import {
  createCoreRecordContractContributors,
  RecordContractCompiler,
  RecordContractContributorRegistry,
  recordContractPointer,
  renderRecordJsonSchema,
  type ContractNode,
  type RecordContract,
} from '../../../src/record-contract';
import { recordSchema } from '../../../src/config/recordSchema.config';
import { buildCatalogue } from '../../../src/record-graphql/catalogue';
import { queryPlan } from '../../../src/record-graphql/collection';
import { gridContracts, object } from '../../fixtures/record-grid.fixtures';

const date: ContractNode = {
  kind: 'scalar',
  scalarType: 'string',
  nullable: true,
  annotations: { extensions: { 'x-redbox-format': 'date-time' } },
};
const calendar: ContractNode = { ...date, annotations: { extensions: { 'x-redbox-format': 'date' } } };
const text: ContractNode = { kind: 'scalar', scalarType: 'string', nullable: true };
const conditional = (left: ContractNode, right: ContractNode): ContractNode => ({
  kind: 'conditional',
  nullable: true,
  condition: { kind: 'exists', pointer: recordContractPointer('/switch') },
  thenNode: left,
  elseNode: right,
});

describe('Collection date declaration compatibility', () => {
  it('exposes incompatible conditional scalar semantics in either branch order and at nested paths', () => {
    for (const other of [text, calendar, { kind: 'scalar', scalarType: 'number', nullable: true } as const]) {
      for (const [left, right] of [
        [date, other],
        [other, date],
      ]) {
        for (const root of [
          object({ eventDate: conditional(left, right) }),
          conditional(object({ eventDate: left }), object({ eventDate: right })),
        ]) {
          const contracts = gridContracts().map(contract => ({ ...contract, root: object({ details: root }) }));
          const snapshot = buildCatalogue(contracts, 'grid-fixture', []);
          const field = snapshot.catalogue.fields.find(field => field.id === 'metadata:/details/eventDate')!;
          assert.equal(field.scalarType, 'MIXED');
          assert.equal(field.selectable, false);
          assert.equal(field.filterable, false);
          assert.equal(field.sortable, false);
          assert.equal(snapshot.bindings.has(field.id), false);
          assert.throws(() =>
            queryPlan({ recordType: 'grid-fixture', filters: [{ field: field.id, exists: true }] }, snapshot)
          );
        }
      }
    }
  });

  it('keeps matching conditional dates queryable', () => {
    for (const node of [date, calendar]) {
      const contracts = gridContracts().map(contract => ({
        ...contract,
        root: object({ eventDate: conditional(node, node) }),
      }));
      const field = buildCatalogue(contracts, 'grid-fixture', []).catalogue.fields.find(
        field => field.id === 'metadata:/eventDate'
      )!;
      assert.equal(field.scalarType, 'DATETIME');
      assert.equal(field.filterable, true);
    }
  });

  it('requires a narrower workflow scope when date meanings differ across forms', () => {
    for (const other of [text, calendar]) {
      const contracts: RecordContract[] = gridContracts().map((contract, index) => ({
        ...contract,
        root: object({ eventDate: index ? other : date }),
      }));
      const field = buildCatalogue(contracts, 'grid-fixture', []).catalogue.fields.find(
        field => field.id === 'metadata:/eventDate'
      )!;
      assert.equal(field.scalarType, 'MIXED');
      assert.equal(field.filterable, false);
      const narrowed = buildCatalogue(contracts, 'grid-fixture', ['draft']).catalogue.fields.find(
        field => field.path === '/eventDate'
      )!;
      assert.equal(narrowed.scalarType, 'DATETIME');
      assert.equal(narrowed.filterable, true);
    }
  });

  it('compiles persisted date formats from model.dateOnly, independently of display format and time picker', async () => {
    const compiler = new RecordContractCompiler(
      new RecordContractContributorRegistry(
        createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' }))
      ),
      { ...recordSchema.limits, contributorTimeoutMs: 500 }
    );
    for (const dateOnly of [false, true]) {
      const component: DateInputFormComponentDefinitionFrame = {
        name: 'eventDate',
        component: { class: 'DateInputComponent', config: { dateFormat: 'DD/MM/YYYY', enableTimePicker: true } },
        model: { class: 'DateInputModel', config: { dateOnly } },
      };
      const result = await compiler.compile({
        context: gridContracts()[0].context,
        fieldMode: 'read',
        form: {
          name: 'date-contract',
          componentDefinitions: [component],
        },
      });
      assert.equal(result.kind, 'compiled');
      if (result.kind !== 'compiled') throw new Error('Date contract failed to compile');
      const schema = renderRecordJsonSchema(result.contract);
      assert.equal(schema.properties!.eventDate['x-redbox-format'], dateOnly ? 'date' : 'date-time');
      assert.deepEqual(schema.properties!.eventDate.type, ['string', 'null']);
    }
  });

  it('retains format conflicts when the read compiler merges duplicate UI declarations', async () => {
    const compiler = new RecordContractCompiler(
      new RecordContractContributorRegistry(
        createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' }))
      ),
      { ...recordSchema.limits, contributorTimeoutMs: 500 }
    );
    const variants = [
      { name: 'eventDate', component: { class: 'DateInputComponent' }, model: { class: 'DateInputModel' } },
      { name: 'eventDate', component: { class: 'SimpleInputComponent' } },
    ];
    for (const componentDefinitions of [variants, [...variants].reverse()]) {
      const result = await compiler.compile({
        context: gridContracts()[0].context,
        fieldMode: 'read',
        form: { name: 'date-conflict', componentDefinitions },
      });
      assert.equal(result.kind, 'compiled');
      if (result.kind !== 'compiled') throw new Error('Merged contract failed to compile');
      const schema = renderRecordJsonSchema(result.contract).properties!.eventDate;
      assert.equal(schema['x-redbox-format'], undefined);
      assert.equal(schema['x-redbox-format-conflict'], true);
      const field = buildCatalogue([result.contract], 'grid-fixture', []).catalogue.fields.find(
        field => field.path === '/eventDate'
      )!;
      assert.equal(field.scalarType, 'MIXED');
      assert.equal(field.filterable, false);
    }
  });
});
