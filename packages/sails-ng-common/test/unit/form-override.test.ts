import { FormOverride } from '../../src/config/form-override.model';
import { ContentComponentName } from '../../src/config/component/content.outline';
import {
  RepeatableComponentName,
  RepeatableFieldComponentDefinitionFrame,
} from '../../src/config/component/repeatable.outline';
import { ReusableComponentName } from '../../src/config/component/reusable.outline';
import { SimpleInputComponentName } from '../../src/config/component/simple-input.outline';
import { isTypeFieldDefinitionName } from '../../src/config/form-types.outline';
import { ILogger } from '../../src/logger.interface';

let expect: Chai.ExpectStatic;

before(async () => {
  const chai = await import('chai');
  expect = chai.expect;
});

function createLogger(): ILogger {
  const noop = () => undefined;
  return {
    silly: noop,
    verbose: noop,
    trace: noop,
    debug: noop,
    log: noop,
    info: noop,
    warn: noop,
    error: noop,
    crit: noop,
    fatal: noop,
    silent: noop,
    blank: noop,
  };
}

function createExpression(name: string) {
  return {
    name,
    config: {
      template: name,
    },
  };
}

describe('FormOverride reusable expansion', () => {
  it('keeps wrapper expressions intact when reusable and additional items both define expressions', () => {
    const formOverride = new FormOverride(createLogger());
    const wrapperExpressions = [createExpression('wrapper-a'), createExpression('wrapper-b')];
    const reusableExpressions = [createExpression('reusable-a'), createExpression('reusable-b')];
    const additionalExpressions = [createExpression('additional-a'), createExpression('additional-b')];

    const result = formOverride.applyOverridesReusable(
      [
        {
          name: 'wrapper',
          component: {
            class: ReusableComponentName,
            config: {
              componentDefinitions: [
                {
                  name: 'shared-field',
                  component: {
                    class: SimpleInputComponentName,
                  },
                  expressions: additionalExpressions,
                },
              ],
            },
          },
          expressions: wrapperExpressions,
          overrides: {
            reusableFormName: 'shared-form',
          },
        } as never,
      ],
      {
        'shared-form': [
          {
            name: 'shared-field',
            component: {
              class: SimpleInputComponentName,
            },
            expressions: reusableExpressions,
          } as never,
        ],
      }
    );

    expect(result).to.have.length(1);
    expect(result[0].name).to.equal('shared-field');
    expect(result[0].expressions).to.deep.equal(wrapperExpressions);
  });

  it('replaces expression arrays instead of merging them by index', () => {
    const formOverride = new FormOverride(createLogger());
    const reusableExpressions = [createExpression('reusable-a'), createExpression('reusable-b')];
    const additionalExpressions = [createExpression('additional-a'), createExpression('additional-b')];

    const result = formOverride.applyOverridesReusable(
      [
        {
          name: 'wrapper',
          component: {
            class: ReusableComponentName,
            config: {
              componentDefinitions: [
                {
                  name: 'shared-field',
                  component: {
                    class: SimpleInputComponentName,
                  },
                  expressions: additionalExpressions,
                },
              ],
            },
          },
          overrides: {
            reusableFormName: 'shared-form',
          },
        } as never,
      ],
      {
        'shared-form': [
          {
            name: 'shared-field',
            component: {
              class: SimpleInputComponentName,
            },
            expressions: reusableExpressions,
          } as never,
        ],
      }
    );

    expect(result).to.have.length(1);
    expect(result[0].expressions).to.deep.equal(additionalExpressions);
  });

  it('preserves date formatting when rendering date content leaf values', () => {
    const formOverride = new FormOverride(createLogger());

    const result = (formOverride as any).renderLeafValue(
      {
        component: {
          class: ContentComponentName,
          config: {
            template: '<span data-value="{{content}}">{{formatDate content "DD/MM/YYYY"}}</span>',
          },
        },
      } as never,
      'project',
      ['startDate']
    );

    expect(result).to.equal('<span data-value="{{default (get project "startDate" "") ""}}">{{formatDate (get project "startDate" "") "DD/MM/YYYY"}}</span>');
  });

  it('expands contributor_dmp_permissions wrapper with replaceName, wrapper expressions, and syncSources', () => {
    const formOverride = new FormOverride(createLogger());
    const wrapperExpressions = [
      createExpression('projectType-sync'),
      createExpression('ciRhd-sync'),
      createExpression('ciNotRhd-sync'),
    ];
    const syncSourcesOverride = [
      { fieldName: 'contributor_ci_rhd', visibilityConditionField: 'project-type', visibilityConditionValues: ['rhd'] },
      { fieldName: 'contributor_ci_not_rhd', visibilityConditionField: 'project-type', visibilityConditionValues: ['staff'] },
    ];

    const result = formOverride.applyOverridesReusable(
      [
        {
          name: 'contributor_dmp_permissions',
          component: {
            class: ReusableComponentName,
            config: {
              componentDefinitions: [
                {
                  name: 'contributor_dmp_permissions_repeatable',
                  overrides: {
                    replaceName: 'contributor_dmp_permissions',
                  },
                  component: {
                    class: 'RepeatableComponent',
                    config: {
                      syncSources: syncSourcesOverride,
                    },
                  },
                },
              ],
            },
          },
          expressions: wrapperExpressions,
          overrides: {
            reusableFormName: 'contributor-dmp-permissions',
          },
        } as never,
      ],
      {
        'contributor-dmp-permissions': [
          {
            name: 'contributor_dmp_permissions_repeatable',
            component: {
              class: 'RepeatableComponent',
              config: {
                addButtonShow: true,
                allowZeroRows: true,
                hideWhenZeroRows: false,
                syncSources: [],
                elementTemplate: {
                  name: '',
                  component: { class: ReusableComponentName, config: { componentDefinitions: [] } },
                },
              },
            },
            model: { class: 'RepeatableModel' },
            layout: { class: 'DefaultLayout' },
          } as never,
        ],
      }
    );

    expect(result).to.have.length(1);
    expect(result[0].name).to.equal('contributor_dmp_permissions');
    expect(result[0].expressions).to.deep.equal(wrapperExpressions);

    if (!isTypeFieldDefinitionName<RepeatableFieldComponentDefinitionFrame>(result[0].component, RepeatableComponentName)) {
      throw new Error(`Expected RepeatableFieldComponentDefinitionFrame but got ${result[0].component?.class}`);
    }

    expect(result[0].component.config?.syncSources).to.deep.equal(syncSourcesOverride);
    expect(result[0].component.config?.addButtonShow).to.equal(true);
    expect(result[0].component.config?.elementTemplate).to.exist;
  });
});
