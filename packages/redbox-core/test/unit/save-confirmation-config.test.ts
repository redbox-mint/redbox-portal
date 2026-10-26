import { strict as assert } from 'node:assert';
import {
  FormConfigFrame,
  ReusableFormDefinitions,
  SaveButtonFieldComponentConfigOutline,
  consoleLogger as testingLogger,
} from '@researchdatabox/sails-ng-common';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { ClientFormConfigVisitor } from '../../src/visitor/client.visitor';
import { MigrationV4ToV5FormConfigVisitor } from '../../src/visitor/migrate-config-v4-v5.visitor';
import { TemplateFormConfigVisitor } from '../../src/visitor/template.visitor';

const confirmation = {
  confirmationTitle: '@rdmp-confirmActive-confirmationTitle',
  confirmationMessage: '@rdmp-confirmActive-confirmationMessage',
  confirmButtonMessage: '@rdmp-confirmActive-confirmButtonMessage',
  cancelButtonMessage: '@rdmp-confirmActive-cancelButtonMessage',
};

function assertConfirmation(config: object | undefined): void {
  for (const [key, value] of Object.entries(confirmation)) {
    assert.equal((config as Record<string, unknown>)[key], value, key);
  }
}

describe('SaveButton confirmation configuration', () => {
  it('retains all four native keys during construction', async () => {
    const config: FormConfigFrame = {
      name: 'confirmation',
      componentDefinitions: [
        {
          name: 'confirmActive',
          component: {
            class: 'SaveButtonComponent',
            config: {
              targetStep: 'active',
              operation: 'activate',
              closeOnSave: true,
              ...confirmation,
            },
          },
        },
      ],
    };
    const result = await new ConstructFormConfigVisitor(testingLogger).start({ data: config });
    assertConfirmation(result.componentDefinitions[0].component.config);
    assert.equal(
      (result.componentDefinitions[0].component.config as SaveButtonFieldComponentConfigOutline).targetStep,
      'active'
    );
    const client = await new ClientFormConfigVisitor(testingLogger).start({ form: result, formMode: 'edit' });
    assertConfirmation(JSON.parse(JSON.stringify(client)).componentDefinitions[0].component.config);
  });

  it('migrates legacy SaveButton definition keys and retains them on reconstruction', async () => {
    const migrated = await new MigrationV4ToV5FormConfigVisitor(testingLogger).start({
      data: {
        name: 'legacy-confirmation',
        fields: [
          {
            class: 'SaveButton',
            definition: {
              name: 'confirmActive',
              targetStep: 'active',
              closeOnSave: true,
              ...confirmation,
            },
          },
        ],
      },
    });
    assert.equal(migrated.componentDefinitions[0].component.class, 'SaveButtonComponent');
    assertConfirmation(migrated.componentDefinitions[0].component.config);
    const result = await new ConstructFormConfigVisitor(testingLogger).start({ data: migrated });
    assertConfirmation(result.componentDefinitions[0].component.config);
  });

  it('leaves unconfigured saves without confirmation keys', async () => {
    const result = await new ConstructFormConfigVisitor(testingLogger).start({
      data: {
        name: 'ordinary',
        componentDefinitions: [{ name: 'save', component: { class: 'SaveButtonComponent' } }],
      },
    });
    for (const key of Object.keys(confirmation)) {
      assert.equal((result.componentDefinitions[0].component.config as Record<string, unknown>)[key], undefined);
    }
  });

  it('inherits reusable confirmation defaults and applies each explicit override without changing the defaults', async () => {
    const reusableFormDefs: ReusableFormDefinitions = {
      workflowSave: [{ name: 'save', component: { class: 'SaveButtonComponent', config: confirmation } }],
    };
    const snapshot = JSON.stringify(reusableFormDefs);
    for (const overrides of [{}, { ...confirmation, confirmationTitle: 'Override title',
      confirmationMessage: '', confirmButtonMessage: 'Yes', cancelButtonMessage: 'No' }]) {
      const result = await new ConstructFormConfigVisitor(testingLogger).start({
        formMode: 'edit', reusableFormDefs,
        data: {
          name: 'reusable-save', componentDefinitions: [{
            name: 'actions', component: { class: 'ReusableComponent', config: {
              componentDefinitions: [{ name: 'save', component: { class: 'SaveButtonComponent', config: overrides } }],
            } }, overrides: { reusableFormName: 'workflowSave' },
          }],
        },
      });
      const client = await new ClientFormConfigVisitor(testingLogger).start({ form: result, formMode: 'edit' });
      const serialized: FormConfigFrame = JSON.parse(JSON.stringify(client));
      const expected = { ...confirmation, ...overrides };
      for (const [key, value] of Object.entries(expected)) {
        assert.equal((serialized.componentDefinitions[0].component.config as Record<string, unknown>)[key], value, key);
      }
      assert.equal(JSON.stringify(reusableFormDefs), snapshot);
    }
  });

  for (const message of ['', '   ', undefined]) {
    it(`preserves a legacy ${JSON.stringify(message)} message through reconstruction and client serialization`, async () => {
      const migrated = await new MigrationV4ToV5FormConfigVisitor(testingLogger).start({
        data: { name: 'legacy', fields: [{ class: 'SaveButton', definition: {
          name: 'save', ...confirmation, confirmationMessage: message,
        } }] },
      });
      const result = await new ConstructFormConfigVisitor(testingLogger).start({ data: migrated });
      const client = await new ClientFormConfigVisitor(testingLogger).start({ form: result, formMode: 'edit' });
      const serialized: FormConfigFrame = JSON.parse(JSON.stringify(client));
      const config = serialized.componentDefinitions[0].component.config as SaveButtonFieldComponentConfigOutline;
      assert.equal(config.confirmationMessage, message);
      assert.equal(config.confirmationTitle, confirmation.confirmationTitle);
      assert.equal(config.confirmButtonMessage, confirmation.confirmButtonMessage);
      assert.equal(config.cancelButtonMessage, confirmation.cancelButtonMessage);
    });
  }

  it('extracts only the redirect template and leaves confirmation translations intact for the client', async () => {
    const result = await new ConstructFormConfigVisitor(testingLogger).start({
      data: { name: 'templates', componentDefinitions: [{ name: 'save', component: {
        class: 'SaveButtonComponent', config: { ...confirmation, redirectLocation: '/record/{{oid}}' },
      } }] },
    });
    const templates = await new TemplateFormConfigVisitor(testingLogger).start({ form: result });
    assert.deepEqual(templates, [{
      key: ['componentDefinitions', '0', 'component', 'config', 'redirectLocation'],
      kind: 'handlebars', value: '/record/{{oid}}',
    }]);
    const client = await new ClientFormConfigVisitor(testingLogger).start({ form: result, formMode: 'edit' });
    assertConfirmation(JSON.parse(JSON.stringify(client)).componentDefinitions[0].component.config);
  });
});
