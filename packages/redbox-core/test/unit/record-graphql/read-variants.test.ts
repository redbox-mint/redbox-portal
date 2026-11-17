import assert from 'node:assert/strict';
import type {
  FormComponentDefinitionFrame,
  AvailableFormComponentDefinitionFrames,
  SimpleInputFormComponentDefinitionFrame,
  GroupFormComponentDefinitionFrame,
  RepeatableFormComponentDefinitionFrame,
  TabContentFormComponentDefinitionFrame,
  ReusableFormComponentDefinitionFrame,
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
  maxProperties = 10_000,
  reusableFormDefinitions?: Readonly<Record<string, readonly FormComponentDefinitionFrame[]>>
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
    reusableFormDefinitions,
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
  it('excludes view Content projections only when the resolved path has another owner', async () => {
    const person = { ...group('Researcher', [simple('name'), simple('email')]), name: 'contributor_ci' };
    const view = {
      ...simple('contributor_ci'),
      constraints: { allowModes: ['view' as const] },
      overrides: {
        formModeClasses: { view: { component: 'ContentComponent' as const, template: '{{content.name}}' } },
      },
    };
    for (const mode of ['read', 'edit'] as const) {
      const result = await compile([person, view], mode);
      assert.equal(result.kind, 'compiled', JSON.stringify(result));
      if (result.kind !== 'compiled') continue;
      const shape = fromTree(result.contract.root.properties.contributor_ci);
      assert.equal(shape.kind, 'object');
      if (shape.kind === 'object') assert.deepEqual(Object.keys(shape.properties), ['email', 'name']);
    }
    // A real scalar edit declaration still conflicts: hidden fields are not globally ignored.
    const conflict = await compile([
      person,
      { ...simple('contributor_ci'), constraints: { allowModes: ['edit'] } },
      view,
    ]);
    assert.equal(conflict.kind, 'compiled');
    if (conflict.kind === 'compiled')
      assert.equal(fromTree(conflict.contract.root.properties.contributor_ci).kind, 'json');
    const viewOnly = await compile([view]);
    assert.equal(viewOnly.kind, 'compiled');
    if (viewOnly.kind === 'compiled')
      assert.equal(fromTree(viewOnly.contract.root.properties.contributor_ci).kind, 'string');
  });
  it('preserves standalone view-only workflow fields and does not match names at different paths', async () => {
    const view = {
      ...simple('external_reference'),
      constraints: { allowModes: ['view' as const] },
      overrides: { formModeClasses: { view: { component: 'ContentComponent' as const, template: '{{content}}' } } },
    };
    for (const definitions of [[view], [group('Researcher', [simple('external_reference')]), view]]) {
      const result = await compile(definitions);
      assert.equal(result.kind, 'compiled', JSON.stringify(result));
      if (result.kind !== 'compiled') continue;
      assert.equal(fromTree(result.contract.root.properties.external_reference).kind, 'string');
      assert.equal(result.contract.completeness, 'complete');
    }
    const edit = await compile([view], 'edit');
    assert.equal(edit.kind, 'compiled');
    if (edit.kind === 'compiled') assert.deepEqual(edit.contract.root.properties, {});
  });
  it('resolves projection ownership across reusable renames and transparent containers in either order', async () => {
    const view = {
      ...simple('display_name'),
      constraints: { allowModes: ['view' as const] },
      overrides: {
        replaceName: 'contributor_ci',
        formModeClasses: { view: { component: 'ContentComponent' as const, template: '{{content.name}}' } },
      },
    };
    const person = {
      ...group('Researcher', [simple('name'), simple('email')]),
      overrides: { replaceName: 'contributor_ci' },
    };
    const reusable = (name: string): ReusableFormComponentDefinitionFrame => ({
      name,
      component: { class: 'ReusableComponent', config: { componentDefinitions: [] } },
      overrides: { reusableFormName: name },
    });
    for (const order of [
      [reusable('person'), reusable('display')],
      [reusable('display'), reusable('person')],
    ]) {
      const tabs: TabContentFormComponentDefinitionFrame[] = order.map((child, index) => ({
        name: 'tab' + index,
        component: { class: 'TabContentComponent', config: { componentDefinitions: [child] } },
      }));
      const result = await compile(tabs, 'read', 10_000, { person: [person], display: [view] });
      assert.equal(result.kind, 'compiled', JSON.stringify(result));
      if (result.kind !== 'compiled') continue;
      const node = result.contract.root.properties.contributor_ci;
      assert.equal(node.kind, 'object');
      if (node.kind === 'object') assert.deepEqual(Object.keys(node.properties), ['email', 'name']);
      assert.equal(result.contract.root.properties.display_name, undefined);
    }
    const standalone = await compile([reusable('display')], 'read', 10_000, { display: [view] });
    assert.equal(standalone.kind, 'compiled');
    if (standalone.kind === 'compiled')
      assert.equal(fromTree(standalone.contract.root.properties.contributor_ci).kind, 'string');
  });
  it('discovers reusable person children and translated labels through replaceName', async () => {
    const result = await compile(
      [
        {
          name: 'person',
          component: { class: 'ReusableComponent', config: {} },
          overrides: { reusableFormName: 'personGroup' },
        },
      ],
      'read',
      10_000,
      {
        personGroup: [
          {
            ...group('Researcher', [
              {
                name: 'personFields',
                component: { class: 'ReusableComponent', config: { componentDefinitions: [] } },
                overrides: { reusableFormName: 'personFields' },
              },
            ]),
            overrides: { replaceName: 'contributor_ci' },
            layout: { class: 'DefaultLayout', config: { label: '@chief-investigator' } },
          },
        ],
        personFields: [simple('name'), simple('email')],
      }
    );
    assert.equal(result.kind, 'compiled', JSON.stringify(result));
    if (result.kind !== 'compiled') return;
    const node = result.contract.root.properties.contributor_ci;
    assert.equal(node.kind, 'object');
    if (node.kind === 'object') assert.deepEqual(Object.keys(node.properties), ['email', 'name']);
    assert.equal(node.annotations?.extensions?.['x-redbox-label'], '@chief-investigator');
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
