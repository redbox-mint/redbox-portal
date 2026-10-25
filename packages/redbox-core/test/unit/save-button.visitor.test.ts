import { strict as assert } from 'node:assert';
import { FormConfigFrame, SaveButtonFieldComponentConfigOutline } from '@researchdatabox/sails-ng-common';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { ClientFormConfigVisitor } from '../../src/visitor/client.visitor';
import { MigrationV4ToV5FormConfigVisitor } from '../../src/visitor/migrate-config-v4-v5.visitor';
import sinon from 'sinon';
import { createSinonStubLogger } from '../logger.test';
const logger = createSinonStubLogger(sinon);

describe('Save-button validation-attempt config', () => {
  const confirmation = {
    confirmationMessage: '@confirm-message', confirmationTitle: '@confirm-title',
    cancelButtonMessage: '@cancel', confirmButtonMessage: '@confirm',
  };

  it('preserves optional confirmation through construction and client output', async () => {
    const data: FormConfigFrame = { name: 'confirm-save', componentDefinitions: [{
      name: 'transition', component: { class: 'SaveButtonComponent', config: { targetStep: 'closed', ...confirmation } },
    }] };
    const form = await new ConstructFormConfigVisitor(logger).start({ data, formMode: 'edit' });
    const client = await new ClientFormConfigVisitor(logger).start({ form, formMode: 'edit', userRoles: ['Admin'] });
    for (const definition of [form, client]) {
      const config = definition.componentDefinitions[0].component.config as SaveButtonFieldComponentConfigOutline;
      for (const key of Object.keys(confirmation) as (keyof typeof confirmation)[]) assert.equal(config[key], confirmation[key]);
      assert.equal(config.targetStep, 'closed');
    }
  });

  it('migrates legacy action confirmations and keeps ordinary save confirmation optional', async () => {
    const migrated = await new MigrationV4ToV5FormConfigVisitor(logger).start({ data: {
      name: 'legacy-confirm-save', fields: [
        { class: 'SaveButton', definition: { name: 'transition', targetStep: 'closed', ...confirmation } },
        { class: 'SaveButton', definition: { name: 'ordinary' } },
      ],
    } });
    const transition = migrated.componentDefinitions.find(field => field.name === 'transition')!;
    const ordinary = migrated.componentDefinitions.find(field => field.name === 'ordinary')!;
    const config = transition.component.config as SaveButtonFieldComponentConfigOutline;
    for (const key of Object.keys(confirmation) as (keyof typeof confirmation)[]) {
      assert.equal(config[key], confirmation[key]);
      assert.equal((ordinary.component.config as SaveButtonFieldComponentConfigOutline)[key], undefined);
    }
  });
  for (const allowValidationAttempt of [undefined, false, true]) {
    it(`preserves the explicit opt-in (${allowValidationAttempt}) and validation groups through native construction/client output`, async () => {
      const data: FormConfigFrame = {
        name: 'forms-validation-attempt',
        enabledValidationGroups: ['all'],
        componentDefinitions: [{
          name: 'submit', component: { class: 'SaveButtonComponent', config: {
            label: 'Submit', targetStep: 'queued', enabledValidationGroups: ['all'], allowValidationAttempt
          } }
        }]
      };
      const form = await new ConstructFormConfigVisitor(logger).start({ data, formMode: 'edit' });
      const client = await new ClientFormConfigVisitor(logger).start({ form, formMode: 'edit', userRoles: ['Researcher'] });
      for (const definition of [form, client]) {
        const config = definition.componentDefinitions[0].component.config as SaveButtonFieldComponentConfigOutline;
        assert.equal(config.allowValidationAttempt, allowValidationAttempt);
        assert.equal(config.forceSave, undefined);
        assert.equal(config.targetStep, 'queued');
        assert.deepEqual(config.enabledValidationGroups, ['all']);
      }
    });
  }
});
