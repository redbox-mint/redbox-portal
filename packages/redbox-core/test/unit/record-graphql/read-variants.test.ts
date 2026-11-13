import assert from 'node:assert/strict';
import type {
  FormComponentDefinitionFrame,
  AvailableFormComponentDefinitionFrames,
  SimpleInputFormComponentDefinitionFrame,
  GroupFormComponentDefinitionFrame,
  RepeatableFormComponentDefinitionFrame,
} from '@researchdatabox/sails-ng-common';
import {
  RecordContractCompiler,
  RecordContractContributorRegistry,
  createCoreRecordContractContributors,
  type RecordContractPublicContext,
} from '../../../src/record-contract';
import { recordSchema } from '../../../src/config/recordSchema.config';
import { reusableRelatedObjectsFormDefinitions } from '../../../src/config/reusableRelatedObjectsFormDefinitions.config';
import { fromTree } from '../../../src/record-graphql/renderer';

const context: RecordContractPublicContext = {
  brand: 'default',
  portal: 'rdmp',
  kind: 'update',
  recordType: 'publication',
  workflowStep: 'draft',
  form: 'read-variants',
  operation: 'strict-all',
  unknownProperties: 'allow',
  enforcement: 'shadow',
};
const simple = (name: string, number = false): SimpleInputFormComponentDefinitionFrame => ({
  name,
  component: { class: 'SimpleInputComponent', config: { type: number ? 'number' : 'text' } },
  model: { class: 'SimpleInputModel', config: {} },
});
const group = (
  role: string,
  children: AvailableFormComponentDefinitionFrames[]
): GroupFormComponentDefinitionFrame => ({
  name: 'details',
  constraints: { authorization: { allowRoles: [role] } },
  component: { class: 'GroupComponent', config: { componentDefinitions: children } },
  model: { class: 'GroupModel', config: {} },
});
async function compile(
  definitions: readonly FormComponentDefinitionFrame[],
  fieldMode: 'edit' | 'read' = 'read',
  maxProperties = 10_000
) {
  const compiler = new RecordContractCompiler(
    new RecordContractContributorRegistry(
      createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' as const }))
    ),
    { ...recordSchema.limits, maxProperties }
  );
  return compiler.compile({
    form: { name: 'read-variants', type: 'publication', componentDefinitions: definitions },
    context,
    fieldMode,
  });
}

describe('Read contract UI variants', () => {
  it('preserves configured layout labels for read discovery without changing write contracts', async () => {
    const title = { ...simple('title'), layout: { class: 'DefaultLayout' as const, config: { label: '@title' } } };
    for (const mode of ['read', 'edit'] as const) {
      const result = await compile([title], mode);
      assert.equal(result.kind, 'compiled');
      if (result.kind === 'compiled')
        assert.equal(
          result.contract.root.properties.title.annotations?.extensions?.['x-redbox-label'],
          mode === 'read' ? '@title' : undefined
        );
    }
  });
  it('compiles the checked-in edit/view related URL definitions in both modes', async () => {
    const definitions = reusableRelatedObjectsFormDefinitions['related-objects-field-url'];
    for (const mode of ['read', 'edit'] as const) {
      const result = await compile(definitions, mode);
      assert.equal(result.kind, 'compiled', JSON.stringify(result));
      if (result.kind === 'compiled') {
        assert.equal(result.contract.root.properties.related_url.kind, 'scalar');
        assert.equal(fromTree(result.contract.root.properties.related_url).kind, 'string');
      }
    }
  });
  it('merges nested fields across role variants while preserving first-variant write semantics', async () => {
    const definitions = [
      group('Researcher', [simple('title')]),
      group('Admin', [simple('title'), simple('admin_note')]),
    ];
    for (const mode of ['read', 'edit'] as const) {
      const result = await compile(definitions, mode);
      assert.equal(result.kind, 'compiled', JSON.stringify(result));
      if (result.kind !== 'compiled') continue;
      const node = result.contract.root.properties.details;
      assert.equal(node.kind, 'object');
      if (node.kind === 'object')
        assert.deepEqual(Object.keys(node.properties).sort(), mode === 'read' ? ['admin_note', 'title'] : ['title']);
    }
  });
  it('merges repeatable role variants and marks incompatible leaves explicitly opaque', async () => {
    const repeatable = (
      role: string,
      children: AvailableFormComponentDefinitionFrames[]
    ): RepeatableFormComponentDefinitionFrame => ({
      name: 'rows',
      constraints: { authorization: { allowRoles: [role] } },
      component: { class: 'RepeatableComponent', config: { elementTemplate: group(role, children) } },
      model: { class: 'RepeatableModel', config: {} },
    });
    const result = await compile([
      repeatable('Researcher', [simple('value')]),
      repeatable('Admin', [simple('value', true), simple('admin_note')]),
    ]);
    assert.equal(result.kind, 'compiled', JSON.stringify(result));
    if (result.kind !== 'compiled') return;
    assert.equal(result.contract.completeness, 'partial');
    const shape = fromTree(result.contract.root.properties.rows);
    assert.equal(shape.kind, 'array');
    if (shape.kind !== 'array' || shape.items.kind !== 'object') throw new Error('Expected repeatable objects.');
    assert.equal(shape.items.properties.admin_note.kind, 'string');
    assert.deepEqual(shape.items.properties.value, { kind: 'json', reason: 'incompatible-read-variants' });
  });
  it('retains duplicate ownership failures for unrestricted write definitions and bounds read variants', async () => {
    const definitions = [simple('title'), simple('title')];
    assert.equal((await compile(definitions, 'edit')).kind, 'failed');
    assert.equal((await compile(definitions, 'read')).kind, 'compiled');
    const overLimit = await compile(definitions, 'read', 1);
    assert.equal(overLimit.kind, 'failed');
    if (overLimit.kind === 'failed') assert.equal(overLimit.failureKind, 'limit-exceeded');
  });
});
