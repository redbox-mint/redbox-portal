import { strict as assert } from 'node:assert';
import {
  FormConfigFrame,
  SaveButtonFieldComponentConfigOutline,
  consoleLogger as testingLogger,
} from '@researchdatabox/sails-ng-common';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { ClientFormConfigVisitor } from '../../src/visitor/client.visitor';
import { MigrationV4ToV5FormConfigVisitor } from '../../src/visitor/migrate-config-v4-v5.visitor';

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
});
