import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { ClientFormConfigVisitor } from '../../src/visitor/client.visitor';

/** Both controller paths and the service use real construction and authorization. */
export async function buildNestedViewForm(data, formMode, userRoles, record) {
  const form = await new ConstructFormConfigVisitor(nothingLogger).start({ data, formMode, record });
  return new ClientFormConfigVisitor(nothingLogger).start({ form, formMode, userRoles });
}

export function nestedViewFixture(retainContainers: boolean) {
  const leaf = (name: string, extra = {}) => ({
    name,
    component: { class: 'SimpleInputComponent', config: {} },
    model: { class: 'SimpleInputModel', config: {} },
    ...extra,
  });
  const children = () => [
    leaf('public'),
    leaf('restricted', { constraints: { authorization: { allowRoles: ['Admin'] } } }),
    leaf('editOnly', { constraints: { allowModes: ['edit'] } }),
  ];
  const group = (name: string, componentDefinitions) => ({
    name,
    component: { class: 'GroupComponent', config: { componentDefinitions } },
    model: { class: 'GroupModel', config: {} },
    ...(retainContainers ? { constraints: { allowModes: ['view', 'edit'] } } : {}),
  });
  const objectLeaf = {
    ...leaf('servicenow_teams_result', { constraints: { authorization: { allowRoles: ['Admin'] } } }),
    component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
  };
  const row = (prefix: string) => ({
    public: `${prefix}-visible`,
    restricted: `${prefix}-role-secret`,
    editOnly: `${prefix}-mode-secret`,
    serverOnly: `${prefix}-server-secret`,
  });
  const metadata = {
    parent: { ...row('parent'), nested: row('nested') },
    rows: [0, 1].map(i => ({ ...row(`row${i}`), nested: row(`row${i}-nested`) })),
    'storage-data-requirements': ['teams', 'irds'],
    objectLeaf: {
      arbitrary: { nested: ['intact', { value: true }] },
      name: 'serverOnly',
      component: { class: 'ContentComponent' },
    },
    servicenow_teams_result: { result: { sys_id: 'service-result', teams: ['one', 'two'] } },
    servicenow_irds_result: { result: { sys_id: 'irds-result', data: { status: 'success' } } },
    // A nested component name must not select this top-level field.
    public: 'top-level-secret',
    serverOnly: 'top-level-server-secret',
  };
  const data = {
    name: 'nested-authorization',
    type: 'dataset',
    componentDefinitions: [
      group('parent', [...children(), group('nested', children())]),
      {
        name: 'rows',
        component: {
          class: 'RepeatableComponent',
          config: {
            elementTemplate: group('', [...children(), group('nested', children())]),
          },
        },
        model: { class: 'RepeatableModel', config: {} },
        ...(retainContainers ? { constraints: { allowModes: ['view', 'edit'] } } : {}),
      },
      {
        name: 'storage-data-requirements',
        component: {
          class: 'CheckboxInputComponent',
          config: {
            options: [
              { value: 'teams', label: 'Teams' },
              { value: 'irds', label: 'IRDS' },
            ],
          },
        },
        model: { class: 'CheckboxInputModel', config: {} },
      },
      leaf('objectLeaf', retainContainers ? { constraints: { allowModes: ['view', 'edit'] } } : {}),
      objectLeaf,
      { ...objectLeaf, name: 'servicenow_irds_result' },
      leaf('visibilityTarget', {
        expressions: ['layout.visible', 'component.visible', 'field.visible'].map(target => ({
          name: target,
          config: { target, runInViewMode: true, template: '$exists(formData.`storage-data-requirements`)' },
        })),
      }),
    ],
  };
  const expected = (roles: string[]) => {
    const allowedRow = value => ({
      public: value.public,
      ...(roles.includes('Admin') ? { restricted: value.restricted } : {}),
    });
    return {
      parent: { ...allowedRow(metadata.parent), nested: allowedRow(metadata.parent.nested) },
      rows: metadata.rows.map(value => ({ ...allowedRow(value), nested: allowedRow(value.nested) })),
      'storage-data-requirements': metadata['storage-data-requirements'],
      objectLeaf: metadata.objectLeaf,
      ...(roles.includes('Admin')
        ? {
            servicenow_teams_result: metadata.servicenow_teams_result,
            servicenow_irds_result: metadata.servicenow_irds_result,
          }
        : {}),
    };
  };
  return { data, metadata, expected };
}
