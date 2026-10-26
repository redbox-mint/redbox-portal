import type { RecordContractEffectiveForm } from '../../../../packages/redbox-core/src/record-contract/record-contract-context';
import draft from '../../../../packages/redbox-hook-dev/src/form-config/dataPublication-1.0-draft';
import queued from '../../../../packages/redbox-hook-dev/src/form-config/dataPublication-1.0-queued';
import published from '../../../../packages/redbox-hook-dev/src/form-config/dataPublication-1.0-published';
import { recordSchema } from '../../../../packages/redbox-core/src/config/recordSchema.config';
import { createCoreRecordContractContributors } from '../../../../packages/redbox-core/src/record-contract/core-contributors';
import {
  RecordContractContributorRegistry,
  type RecordContractComponentContributor,
} from '../../../../packages/redbox-core/src/record-contract/contributor-registry';
import { RecordContractCompiler } from '../../../../packages/redbox-core/src/record-contract/record-contract-compiler';
import { recordContractPointer } from '../../../../packages/redbox-core/src/record-contract/json-pointer';
import type {
  ContractNode,
  RecordContract,
  RecordContractPublicContext,
} from '../../../../packages/redbox-core/src/record-contract/types';
import { createRecordContractFixture } from '../../../../packages/redbox-core/test/fixtures/record-contract.fixtures';
import type { BrandingModel } from '../../../../packages/redbox-core/src/model/storage/BrandingModel';
import type { ReadCaller, ReadRecord } from './access';
import { fromTree, type ReadShape } from './renderer';

const scalar = (scalarType: 'string' | 'number' | 'integer' | 'boolean'): ContractNode => ({
  kind: 'scalar',
  nullable: false,
  scalarType,
});

export const hookContributors: readonly RecordContractComponentContributor[] = [
  {
    kind: 'component',
    key: 'investigation.hook',
    version: '1',
    componentType: 'ExampleHookComponent',
    ownedPointers: [''],
    nullability: 'non-null',
    compile: () => ({
      kind: 'node',
      node: {
        kind: 'object',
        nullable: false,
        unknownProperties: 'allow',
        properties: { 'owner-id': scalar('integer'), value: scalar('string') },
      },
    }),
  },
  {
    kind: 'component',
    key: 'investigation.conditional',
    version: '1',
    componentType: 'ConditionalHookComponent',
    ownedPointers: [''],
    nullability: 'non-null',
    compile: () => ({
      kind: 'node',
      node: {
        kind: 'conditional',
        nullable: false,
        condition: { kind: 'equals', pointer: recordContractPointer('/is_public'), value: true },
        thenNode: {
          kind: 'object',
          nullable: false,
          unknownProperties: 'allow',
          properties: { explanation: scalar('string') },
        },
        elseNode: {
          kind: 'object',
          nullable: false,
          unknownProperties: 'allow',
          properties: { review_score: scalar('number') },
        },
      },
    }),
  },
];

export function registry(withHook = true): RecordContractContributorRegistry {
  return new RecordContractContributorRegistry([
    ...createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' as const })),
    ...(withHook
      ? hookContributors.map(contributor => ({
          contributor,
          source: 'hook' as const,
          packageName: '@example/investigation-hook',
        }))
      : []),
  ]);
}

export async function compileForm(
  form: RecordContractEffectiveForm,
  workflowStep: string,
  withHook = true
): Promise<RecordContract> {
  const fixture = createRecordContractFixture();
  const context: RecordContractPublicContext = {
    brand: 'default',
    portal: 'rdmp',
    kind: 'update',
    recordType: form.type ?? 'dataPublication',
    workflowStep,
    form: form.name,
    operation: 'strict-all',
    unknownProperties: 'allow',
    enforcement: 'shadow',
  };
  const result = await new RecordContractCompiler(registry(withHook), recordSchema.limits).compile({
    form,
    context,
    reusableFormDefinitions: fixture.reusableFormDefinitions,
  });
  if (result.kind !== 'compiled')
    throw new Error(`Fixture compilation failed: ${form.name}: ${JSON.stringify(result.diagnostics)}`);
  return result.contract;
}

export function richForm(step: string): RecordContractEffectiveForm {
  const fixture = createRecordContractFixture();
  return {
    ...fixture.form,
    name: `investigation-publication-1.0-${step}`,
    type: 'dataPublication',
    componentDefinitions: [
      ...fixture.form.componentDefinitions,
      ...['dc:title', 'dc/title', '9start', '__private', 'rb_64633a7469746c65'].map(name => ({
        name,
        component: { class: 'SimpleInputComponent' as const },
        model: { class: 'SimpleInputModel' as const, config: {} },
      })),
      {
        name: 'conditional_details',
        component: { class: 'ConditionalHookComponent' },
        model: { class: 'ConditionalHookModel', config: {} },
      },
      ...(step === 'queued'
        ? [
            {
              name: 'queue_note',
              component: { class: 'SimpleInputComponent' as const },
              model: { class: 'SimpleInputModel' as const, config: {} },
            },
          ]
        : []),
      ...(step === 'published'
        ? [
            {
              name: 'doi',
              component: { class: 'SimpleInputComponent' as const },
              model: { class: 'SimpleInputModel' as const, config: {} },
            },
          ]
        : []),
    ],
  };
}

export async function fixtureContracts(): Promise<RecordContract[]> {
  const contracts: RecordContract[] = [];
  for (const [step, form] of [
    ['draft', draft],
    ['queued', queued],
    ['published', published],
  ] as const) {
    contracts.push(await compileForm(form, step));
    contracts.push(await compileForm(richForm(step), step));
  }
  return contracts;
}

export const brand: BrandingModel = {
  id: 'brand-default',
  name: 'default',
  css: '',
  roles: [],
};

export const caller: ReadCaller = {
  brand,
  portal: 'rdmp',
  user: { id: 'viewer-id', username: 'reader', roles: [{ id: 'viewer-role', name: 'Viewer' }] },
};

function sample(shape: ReadShape): unknown {
  switch (shape.kind) {
    case 'object':
      return Object.fromEntries(Object.entries(shape.properties).map(([key, node]) => [key, sample(node)]));
    case 'array':
      return [sample(shape.items), sample(shape.items)];
    case 'string':
      return 'Stored historical value';
    case 'number':
      return 1.25;
    case 'integer':
      return 3_000_000_000;
    case 'boolean':
      return true;
    case 'json':
      return { arbitrary: ['historical', 42] };
  }
}

export function recordFor(contract: RecordContract, oid = contract.context.workflowStep): ReadRecord {
  const metadata = sample(fromTree(contract.root));
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata))
    throw new Error('Expected metadata object.');
  return {
    redboxOid: oid,
    metadata: { ...metadata, legacy_unconfigured: 'x'.repeat(8_192) },
    metaMetadata: { brandId: 'brand-default', type: contract.context.recordType, form: contract.context.form },
    workflow: { stage: contract.context.workflowStep },
    authorization: { view: ['reader'], edit: [], viewRoles: [], editRoles: [] },
  };
}
