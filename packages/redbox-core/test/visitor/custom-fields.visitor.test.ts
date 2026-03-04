let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import type { ILogger } from '../../src/Logger';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { CustomFieldsFormConfigVisitor } from '../../src/visitor/custom-fields.visitor';

describe('CustomFieldsFormConfigVisitor', () => {
  const logger: ILogger = {
    silly: () => undefined,
    verbose: () => undefined,
    trace: () => undefined,
    debug: () => undefined,
    log: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    crit: () => undefined,
    fatal: () => undefined,
    silent: () => undefined,
    blank: () => undefined,
  };

  it('replaces tokens only in scoped fields and supports overlapping keys', () => {
    const input: FormConfigFrame = {
      name: 'test',
      expressions: [{
        name: 'unchanged',
        config: {
          template: '@user_name should stay here'
        }
      }],
      componentDefinitions: [
        {
          name: 'content_1',
          component: {
            class: 'ContentComponent',
            config: {
              content: 'Hello @user_name / @user'
            }
          }
        },
        {
          name: 'input_1',
          component: {
            class: 'SimpleInputComponent',
            config: {
              label: '@user_name label should not change'
            }
          },
          model: {
            class: 'SimpleInputModel',
            config: {
              defaultValue: '@user_name|@user'
            }
          }
        },
        {
          name: 'group_default_object',
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: []
            }
          },
          model: {
            class: 'GroupModel',
            config: {
              defaultValue: {
                name: '@user_name',
                email: '@user_email',
                nested: {
                  text_full_name: '@user_name'
                }
              }
            }
          }
        },
        {
          name: 'group_1',
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'nested_textarea',
                  component: {
                    class: 'TextAreaComponent',
                    config: {
                      rows: 3,
                      cols: 40
                    }
                  },
                  model: {
                    class: 'TextAreaModel',
                    config: {
                      defaultValue: 'Nested @user_name'
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    };

    const constructor = new ConstructFormConfigVisitor(logger as any);
    const constructed = constructor.start({ data: input, formMode: 'edit' });

    const visitor = new CustomFieldsFormConfigVisitor(logger);
    visitor.applyCustomFields(constructed, { '@user': 'U', '@user_name': 'User Name', '@user_email': 'user@example.com' });

    const content = constructed.componentDefinitions?.[0]?.component?.config as { content?: string };
    const inputComponent = constructed.componentDefinitions?.[1] as {
      component?: { config?: { label?: string } };
      model?: { config?: { value?: string } };
    };
    const groupComponent = constructed.componentDefinitions?.[2] as {
      model?: { config?: { value?: { name?: string; email?: string; nested?: { text_full_name?: string } } } };
    };
    const objectGroupComponent = constructed.componentDefinitions?.[3] as {
      component?: {
        config?: {
          componentDefinitions?: Array<{
            model?: { config?: { value?: string } }
          }>
        }
      }
    };
    const nestedComponent = (objectGroupComponent.component?.config?.componentDefinitions ?? [])[0];

    expect(content.content).to.equal('Hello User Name / U');
    expect(inputComponent.model?.config?.value).to.equal('User Name|U');
    expect(inputComponent.component?.config?.label).to.equal('@user_name label should not change');
    expect(groupComponent.model?.config?.value?.name).to.equal('User Name');
    expect(groupComponent.model?.config?.value?.email).to.equal('user@example.com');
    expect(groupComponent.model?.config?.value?.nested?.text_full_name).to.equal('User Name');
    expect(nestedComponent.model?.config?.value).to.equal('Nested User Name');
    expect(constructed.expressions?.[0]?.config?.template).to.equal('@user_name should stay here');
  });
});
