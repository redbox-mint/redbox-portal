import {
  FormConfigFrame,
  RecordPermissionsFieldComponentConfig,
  RecordPermissionsFormComponentDefinition,
} from '@researchdatabox/sails-ng-common';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { ClientFormConfigVisitor } from '../../src/visitor/client.visitor';
import { DataValueFormConfigVisitor } from '../../src/visitor/data-value.visitor';
import { JsonTypeDefSchemaFormConfigVisitor } from '../../src/visitor/json-type-def.visitor';
import { TemplateFormConfigVisitor } from '../../src/visitor/template.visitor';
import { MigrationV4ToV5FormConfigVisitor } from '../../src/visitor/migrate-config-v4-v5.visitor';
import sinon from 'sinon';
import { createSinonStubLogger } from '../logger.test';
const logger = createSinonStubLogger(sinon);
let expect: Chai.ExpectStatic;
import('chai').then(mod => {
  expect = mod.expect;
});

const config = (): FormConfigFrame => ({
  name: 'forms-permissions',
  componentDefinitions: [
    {
      name: 'permissions',
      constraints: { authorization: { allowRoles: ['Admin', 'Librarians'] }, allowModes: ['edit'] },
      component: { class: 'RecordPermissionsComponent', config: { visible: true, label: '@record-permissions-tab' } },
    },
  ],
});

describe('Record permissions native visitors', () => {
  it('constructs the display without a model and excludes it from record values/schema/templates', async () => {
    const form = await new ConstructFormConfigVisitor(logger).start({
      data: config(),
      formMode: 'edit',
      record: { permissions: { editRoles: ['unexpected-metadata'] } },
    });
    const field = form.componentDefinitions[0];
    expect(field).to.be.instanceOf(RecordPermissionsFormComponentDefinition);
    expect(field.component.config).to.be.instanceOf(RecordPermissionsFieldComponentConfig);
    expect(field.component.config?.label).to.equal('@record-permissions-tab');
    expect(field.model).to.equal(undefined);
    expect(await new DataValueFormConfigVisitor(logger).start({ form })).to.deep.equal({});
    const schema = await new JsonTypeDefSchemaFormConfigVisitor(logger).start({ form });
    expect(JSON.stringify(schema)).not.to.contain('permissions');
    expect(await new TemplateFormConfigVisitor(logger).start({ form })).to.deep.equal([]);
  });

  for (const roles of [['Admin'], ['Librarians'], ['Researcher'], []]) {
    for (const mode of ['edit', 'view'] as const) {
      it(`filters the summary for ${roles.join(',') || 'anonymous'} in ${mode} mode`, async () => {
        const form = await new ConstructFormConfigVisitor(logger).start({ data: config(), formMode: mode });
        const client = await new ClientFormConfigVisitor(logger).start({ form, formMode: mode, userRoles: roles });
        const allowed = mode === 'edit' && roles.some(role => ['Admin', 'Librarians'].includes(role));
        expect(client.componentDefinitions ?? []).to.have.length(allowed ? 1 : 0);
      });
    }
  }

  it('migrates the exact tagged RecordPermissionsField as a model-less read-only component', async () => {
    const form = await new MigrationV4ToV5FormConfigVisitor(logger).start({
      data: {
        name: 'forms-v4-permissions',
        fields: [
          {
            class: 'RecordPermissionsField',
            showHeader: true,
            editOnly: true,
            roles: ['Admin', 'Librarians'],
            definition: { name: 'permissions' },
          },
        ],
      },
    });
    const field = form.componentDefinitions[0];
    expect(field.name).to.equal('permissions');
    expect(field.component.class).to.equal('RecordPermissionsComponent');
    expect(field.model).to.equal(undefined);
    expect(field.constraints?.authorization?.allowRoles).to.deep.equal(['Admin', 'Librarians']);
    expect(field.constraints?.allowModes).to.deep.equal(['edit']);
  });
});
