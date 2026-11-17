import { nothingLogger, type FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { ConstructFormConfigVisitor } from '../../../src/visitor/construct.visitor';
import assert from 'node:assert/strict';
import { GraphQLObjectType, GraphQLSchema, graphql } from 'graphql';
import {
  RecordContractCompiler,
  RecordContractContributorRegistry,
  createCoreRecordContractContributors,
  type RecordContract,
  type RecordContractEffectiveForm,
} from '../../../src/record-contract';
import { recordSchema } from '../../../src/config/recordSchema.config';
import { fromTree, renderMetadata } from '../../../src/record-graphql/renderer';
import { buildCatalogue } from '../../../src/record-graphql/catalogue';
import { applyReadPresentationHints } from '../../../src/record-graphql/read-contract';
import { compileMetadataReadShape, retainReadPrivacy } from '../../../src/record-contract/read-authoring';
import { gridEnvironment } from '../../fixtures/record-grid.fixtures';
import { authoringFixture, carrier, contactReadShape } from '../../fixtures/read-authoring.fixtures';
async function compile(
  form: RecordContractEffectiveForm,
  mode: 'read' | 'edit' = 'read',
  recordType = 'publication',
  reusableFormDefinitions = {}
) {
  return new RecordContractCompiler(
    new RecordContractContributorRegistry(
      createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' }))
    ),
    recordSchema.limits
  ).compile({
    form,
    reusableFormDefinitions,
    fieldMode: mode,
    context: {
      brand: 'default',
      portal: 'example',
      kind: 'update',
      recordType,
      workflowStep: 'draft',
      form: form.name,
      operation: 'strict-all',
      enforcement: 'shadow',
      unknownProperties: 'allow',
    },
  });
}
function compiled(result: Awaited<ReturnType<typeof compile>>): RecordContract {
  assert.equal(result.kind, 'compiled', JSON.stringify(result));
  if (result.kind !== 'compiled') throw new Error('compile failed');
  return result.contract;
}
async function read(contract: RecordContract, stored: unknown, source: string) {
  const { type } = renderMetadata(fromTree(contract.root), 'ReadFixture');
  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({ name: 'Query', fields: { metadata: { type, resolve: () => stored } } }),
  });
  return graphql({ schema, source, contextValue: { consumeUnits: () => {}, consumeBytes: () => {} } });
}
describe('Explicit persisted metadata read authoring', () => {
  it('reproduces hidden expression carrier failures without opt-ins through reusables', async () => {
    const f = authoringFixture(false);
    const result = await read(
      compiled(await compile(f.form, 'read', 'publication', f.reusableFormDefinitions)),
      f.stored,
      '{ metadata { owner members outcomeDetails } }'
    );
    assert.equal(result.errors?.length, 3);
    assert.ok(result.errors.every(error => error.extensions.code === 'HISTORICAL_VALUE_TYPE'));
  });
  it('reads declared object/list carriers and native question answers without raw siblings', async () => {
    const f = authoringFixture(true);
    const contract = compiled(await compile(f.form, 'read', 'publication', f.reusableFormDefinitions));
    const result = await read(
      contract,
      f.stored,
      '{ metadata { owner { name email directoryId } members { name } outcomeDetails { classification metadataTag } questionnaire { published personal categories } } }'
    );
    assert.equal(result.errors, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(result.data)), {
      metadata: {
        owner: { name: 'Example Person', email: 'person@example.invalid', directoryId: 'example-1' },
        members: [{ name: 'Example Person' }],
        outcomeDetails: [{ classification: 'Public', metadataTag: null }],
        questionnaire: { published: 'yes', personal: 'no', categories: ['a'] },
      },
    });
    assert.equal((await read(contract, f.stored, '{ metadata { owner { secret } unrestricted } }')).errors?.length, 2);
  });
  it('leaves write contracts unchanged by readShape and readMetadata', async () => {
    const f = authoringFixture(true);
    const form = {
      ...f.form,
      readMetadata: { publication: { properties: { lookup: { type: 'string' as const } }, identity: 'lookup' } },
    };
    const contract = compiled(await compile(form, 'edit', 'publication', f.reusableFormDefinitions));
    assert.equal(contract.root.properties.owner.kind, 'scalar');
    assert.equal(contract.root.properties.lookup, undefined);
  });
  it('rejects malformed, open, empty or excessive read shapes', async () => {
    for (const shape of [
      { type: 'json' },
      { type: 'object', properties: {} },
      { type: 'object', properties: { name: { type: 'string' } }, additionalProperties: true },
      { type: 'array' },
    ]) {
      const form = JSON.parse(
        JSON.stringify({ name: 'invalid', componentDefinitions: [{ ...carrier('owner'), readShape: shape }] })
      );
      assert.equal((await compile(form)).kind, 'failed');
    }
    assert.throws(() => compileMetadataReadShape(contactReadShape, { ...recordSchema.limits, maxProperties: 2 }));
    assert.throws(() =>
      compileMetadataReadShape(
        { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        { ...recordSchema.limits, maxDepth: 1 }
      )
    );
  });
  it('rejects ignored shape declarations on unsupported or non-persisting components', async () => {
    for (const component of [
      { name: 'display', readShape: contactReadShape, component: { class: 'ContentComponent' } },
      { name: 'custom', readShape: contactReadShape, component: { class: 'UnknownHookComponent' } },
      {
        name: 'usage',
        readShape: contactReadShape,
        component: { class: 'ReusableComponent' },
        overrides: { reusableFormName: 'shared' },
      },
    ]) {
      assert.equal((await compile({ name: 'invalid', componentDefinitions: [component] })).kind, 'failed');
    }
  });
  it('retains contributor privacy, including incompatible topology', () => {
    const declared = compileMetadataReadShape(contactReadShape, recordSchema.limits);
    const privateNode = {
      kind: 'scalar' as const,
      scalarType: 'string' as const,
      nullable: true,
      annotations: { writeOnly: true },
    };
    assert.equal(
      retainReadPrivacy(declared, { kind: 'array', nullable: true, items: privateNode }).annotations?.writeOnly,
      true
    );
    const nested = retainReadPrivacy(declared, {
      kind: 'object',
      nullable: true,
      unknownProperties: 'allow',
      properties: { email: privateNode },
    });
    if (nested.kind === 'object') assert.equal(nested.properties.email.annotations?.writeOnly, true);
  });
  it('authors identity/defaults for exact types sharing a generated view', async () => {
    const form = {
      name: 'generated-view',
      componentDefinitions: [carrier('title')],
      readMetadata: {
        person: {
          properties: { fullName: { type: 'string' as const, label: 'Full name' }, email: { type: 'string' as const } },
          identity: 'fullName',
          defaultColumns: ['fullName', 'email'],
        },
        provider: {
          properties: { providerName: { type: 'string' as const } },
          identity: 'providerName',
          defaultColumns: ['providerName'],
        },
      },
    };
    const person = compiled(await compile(form, 'read', 'person'));
    assert.equal(person.root.properties.providerName, undefined);
    assert.equal(compiled(await compile(form, 'read', 'provider')).root.properties.fullName, undefined);
    assert.deepEqual(Object.keys(compiled(await compile(form, 'read', 'other')).root.properties), ['title']);
    const catalogue = buildCatalogue([person], 'person', [], gridEnvironment()).catalogue;
    applyReadPresentationHints(catalogue, [person]);
    assert.equal(catalogue.fields.find(field => field.path === '/fullName')?.identity, true);
    assert.equal(catalogue.fields.find(field => field.path === '/email')?.defaultColumn, 1);
    assert.equal(
      (await read(person, { fullName: 'Example Person' }, '{ metadata { fullName email } }')).errors,
      undefined
    );
    const later = {
      ...person,
      context: { ...person.context, workflowStep: 'later' },
      root: {
        ...person.root,
        properties: {
          ...person.root.properties,
          fullName: { kind: 'scalar' as const, scalarType: 'string' as const, nullable: true },
        },
      },
    };
    const mixed = buildCatalogue([person, later], 'person', [], gridEnvironment()).catalogue;
    applyReadPresentationHints(mixed, [person, later]);
    assert.equal(mixed.fields.find(field => field.path === '/fullName')?.identity, false);
    assert.equal(mixed.fields.find(field => field.path === '/fullName')?.defaultColumn, undefined);
  });
  it('preserves authoring through production construct visitors and view transforms', async () => {
    const data: FormConfigFrame = {
      name: 'constructed',
      readMetadata: {
        publication: {
          properties: { identity: { type: 'string' } },
          identity: 'identity',
          defaultColumns: ['identity'],
        },
      },
      componentDefinitions: [
        {
          name: 'owner',
          readShape: contactReadShape,
          component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
          model: { class: 'SimpleInputModel', config: {} },
          overrides: { formModeClasses: { view: { component: 'ContentComponent' } } },
        },
      ],
    };
    for (const formMode of ['edit', 'view'] as const) {
      const result = await new ConstructFormConfigVisitor(nothingLogger).start({ data, formMode });
      assert.deepEqual(result.readMetadata, data.readMetadata);
      assert.deepEqual(result.componentDefinitions[0].readShape, contactReadShape);
    }
  });
  it('rejects undeclared/non-scalar defaults and unknown authoring options', async () => {
    for (const config of [
      { properties: {}, identity: 'missing' },
      { properties: { owner: contactReadShape }, identity: 'owner' },
      { properties: {}, defaultColumns: ['title', 'title'] },
      { properties: {}, additionalProperties: true },
    ]) {
      const form = JSON.parse(
        JSON.stringify({
          name: 'invalid',
          componentDefinitions: [carrier('title')],
          readMetadata: { publication: config },
        })
      );
      assert.equal((await compile(form)).kind, 'failed');
    }
  });
});
