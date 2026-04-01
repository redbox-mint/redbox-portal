import { FormOverride } from '../../src/config/form-override.model';
import { ContentComponentName } from '../../src/config/component/content.outline';
import { ReusableComponentName } from '../../src/config/component/reusable.outline';
import { SimpleInputComponentName } from '../../src/config/component/simple-input.outline';
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
});
