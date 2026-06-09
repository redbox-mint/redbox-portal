import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { TemplateFormConfigVisitor } from '../../src/visitor/template.visitor';
import { ClientFormConfigVisitor } from '../../src/visitor/client.visitor';
import { logger } from './helpers';

let expect!: Chai.ExpectStatic;

/**
 * Visitor-level regression coverage for the form behaviours v1 config pipeline.
 *
 * These tests intentionally stay focused on the server compilation contract:
 * - construct keeps top-level behaviour config intact
 * - template extraction emits the expected compiled keys
 * - client stripping removes raw JSONata source and leaves marker flags behind
 */
describe('Form behaviour visitors', () => {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  const formConfig = {
    name: 'behaviour-form',
    behaviours: [
      {
        name: 'copy-title',
        condition: '$exists(event.value)',
        conditionKind: 'jsonata',
        processors: [
          {
            type: 'jsonataTransform',
            config: {
              template: 'value.title',
            },
          },
        ],
        actions: [
          {
            type: 'setValue',
            config: {
              fieldPath: '$substringBefore(event.fieldId, "/title") & "/description"',
              fieldPathKind: 'jsonata',
              valueTemplate: 'value & "!"',
            },
          },
        ],
        onError: [
          {
            type: 'emitEvent',
            config: {
              eventType: 'field.value.changed',
              fieldId: '/title',
              sourceId: '/title',
              valueTemplate: '"error"',
            },
          },
        ],
      },
    ],
    componentDefinitions: [
      {
        name: 'title',
        component: { class: 'SimpleInputComponent', config: {} },
        model: { class: 'SimpleInputModel', config: {} },
      },
    ],
  } as FormConfigFrame & { behaviours: unknown[] };

  it('construct visitor preserves behaviours on form config', async () => {
    const visitor = new ConstructFormConfigVisitor(logger);
    const constructed = await visitor.start({ data: formConfig, formMode: 'edit' });

    expect((constructed as any).behaviours).to.deep.equal(formConfig.behaviours);
  });

  it('template visitor extracts compiled behaviour templates', async () => {
    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = await constructor.start({ data: formConfig, formMode: 'edit' });
    const visitor = new TemplateFormConfigVisitor(logger);

    const actual = await visitor.start({ form: constructed });

    expect(actual).to.deep.equal([
      {
        key: ['behaviours', '0', 'condition'],
        kind: 'jsonata',
        value: '$exists(event.value)',
      },
      {
        key: ['behaviours', '0', 'processors', '0', 'config', 'template'],
        kind: 'jsonata',
        value: 'value.title',
      },
      {
        key: ['behaviours', '0', 'actions', '0', 'config', 'valueTemplate'],
        kind: 'jsonata',
        value: 'value & "!"',
      },
      {
        key: ['behaviours', '0', 'actions', '0', 'config', 'fieldPath'],
        kind: 'jsonata',
        value: '$substringBefore(event.fieldId, "/title") & "/description"',
      },
      {
        key: ['behaviours', '0', 'onError', '0', 'config', 'valueTemplate'],
        kind: 'jsonata',
        value: '"error"',
      },
    ]);
  });

  it('client visitor strips behaviour template source and sets flags', async () => {
    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = await constructor.start({ data: formConfig, formMode: 'edit' });
    const visitor = new ClientFormConfigVisitor(logger);

    const actual = await visitor.start({ form: constructed });
    const behaviour = (actual as any).behaviours?.[0];
    const processor = behaviour?.processors?.[0];
    const action = behaviour?.actions?.[0];
    const onErrorAction = behaviour?.onError?.[0];

    expect(behaviour?.condition).to.equal(undefined);
    expect(behaviour?.hasCondition).to.equal(true);
    expect(processor?.config?.template).to.equal(undefined);
    expect(processor?.config?.hasTemplate).to.equal(true);
    expect(action?.config?.valueTemplate).to.equal(undefined);
    expect(action?.config?.hasValueTemplate).to.equal(true);
    expect(action?.config?.fieldPath).to.equal(undefined);
    expect(action?.config?.hasFieldPathTemplate).to.equal(true);
    expect(onErrorAction?.config?.valueTemplate).to.equal(undefined);
    expect(onErrorAction?.config?.hasValueTemplate).to.equal(true);
  });
});

describe('Form behaviour visitors: extended action types', () => {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  const buildFormConfig = () =>
    ({
      name: 'behaviour-form-extended',
      behaviours: [
        {
          name: 'extended-actions',
          condition: '/title::field.value.changed',
          actions: [
            {
              type: 'runTemplate',
              config: {
                template: '$uppercase(value)',
                resultKey: 'upperTitle',
              },
            },
            {
              type: 'setValues',
              config: {
                values: [
                  {
                    fieldPath: '/description',
                    valueTemplate: 'upperTitle & "!"',
                  },
                  {
                    fieldPath: '$substringBefore(event.fieldId, "/title") & "/summary"',
                    fieldPathKind: 'jsonata',
                  },
                ],
              },
            },
            {
              type: 'setUIProperty',
              config: {
                fieldPath: '/description',
                target: 'field.visible',
                valueTemplate: '$exists(value)',
              },
            },
            {
              type: 'setUIProperties',
              config: {
                fieldPath: '$substringBefore(event.fieldId, "/title") & "/summary"',
                fieldPathKind: 'jsonata',
                properties: [
                  {
                    target: 'component.disabled',
                    valueTemplate: 'value = ""',
                  },
                  {
                    fieldPath: '/title',
                    target: 'layout.cssClasses',
                    value: 'highlight',
                  },
                ],
              },
            },
          ],
          onError: [
            {
              type: 'runTemplate',
              config: {
                template: '"failed"',
              },
            },
          ],
        },
      ],
      componentDefinitions: [
        {
          name: 'title',
          component: { class: 'SimpleInputComponent', config: {} },
          model: { class: 'SimpleInputModel', config: {} },
        },
      ],
    }) as FormConfigFrame & { behaviours: unknown[] };

  it('construct visitor preserves the new action configs on form config', async () => {
    const formConfig = buildFormConfig();
    const visitor = new ConstructFormConfigVisitor(logger);
    const constructed = await visitor.start({ data: formConfig, formMode: 'edit' });

    expect((constructed as any).behaviours).to.deep.equal(formConfig.behaviours);
  });

  it('template visitor extracts templates from runTemplate and nested values/properties entries', async () => {
    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = await constructor.start({ data: buildFormConfig(), formMode: 'edit' });
    const visitor = new TemplateFormConfigVisitor(logger);

    const actual = await visitor.start({ form: constructed });

    expect(actual).to.deep.equal([
      {
        key: ['behaviours', '0', 'actions', '0', 'config', 'template'],
        kind: 'jsonata',
        value: '$uppercase(value)',
      },
      {
        key: ['behaviours', '0', 'actions', '1', 'config', 'values', '0', 'valueTemplate'],
        kind: 'jsonata',
        value: 'upperTitle & "!"',
      },
      {
        key: ['behaviours', '0', 'actions', '1', 'config', 'values', '1', 'fieldPath'],
        kind: 'jsonata',
        value: '$substringBefore(event.fieldId, "/title") & "/summary"',
      },
      {
        key: ['behaviours', '0', 'actions', '2', 'config', 'valueTemplate'],
        kind: 'jsonata',
        value: '$exists(value)',
      },
      {
        key: ['behaviours', '0', 'actions', '3', 'config', 'fieldPath'],
        kind: 'jsonata',
        value: '$substringBefore(event.fieldId, "/title") & "/summary"',
      },
      {
        key: ['behaviours', '0', 'actions', '3', 'config', 'properties', '0', 'valueTemplate'],
        kind: 'jsonata',
        value: 'value = ""',
      },
      {
        key: ['behaviours', '0', 'onError', '0', 'config', 'template'],
        kind: 'jsonata',
        value: '"failed"',
      },
    ]);
  });

  it('client visitor strips new action templates and leaves literals untouched', async () => {
    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = await constructor.start({ data: buildFormConfig(), formMode: 'edit' });
    const visitor = new ClientFormConfigVisitor(logger);

    const actual = await visitor.start({ form: constructed });
    const behaviour = (actual as any).behaviours?.[0];
    const [runTemplateAction, setValuesAction, setUIPropertyAction, setUIPropertiesAction] = behaviour?.actions ?? [];
    const onErrorRunTemplate = behaviour?.onError?.[0];

    // runTemplate: template stripped, marker set, resultKey untouched.
    expect(runTemplateAction?.config?.template).to.equal(undefined);
    expect(runTemplateAction?.config?.hasTemplate).to.equal(true);
    expect(runTemplateAction?.config?.resultKey).to.equal('upperTitle');

    // setValues entries: per-entry stripping and markers.
    const [firstValue, secondValue] = setValuesAction?.config?.values ?? [];
    expect(firstValue?.valueTemplate).to.equal(undefined);
    expect(firstValue?.hasValueTemplate).to.equal(true);
    expect(firstValue?.fieldPath).to.equal('/description');
    expect(secondValue?.fieldPath).to.equal(undefined);
    expect(secondValue?.hasFieldPathTemplate).to.equal(true);

    // setUIProperty: stripped like a setValue config; target untouched.
    expect(setUIPropertyAction?.config?.valueTemplate).to.equal(undefined);
    expect(setUIPropertyAction?.config?.hasValueTemplate).to.equal(true);
    expect(setUIPropertyAction?.config?.target).to.equal('field.visible');

    // setUIProperties: action-level jsonata fieldPath stripped; entries handled
    // individually; literal value/target pass through untouched.
    expect(setUIPropertiesAction?.config?.fieldPath).to.equal(undefined);
    expect(setUIPropertiesAction?.config?.hasFieldPathTemplate).to.equal(true);
    const [firstProperty, secondProperty] = setUIPropertiesAction?.config?.properties ?? [];
    expect(firstProperty?.valueTemplate).to.equal(undefined);
    expect(firstProperty?.hasValueTemplate).to.equal(true);
    expect(firstProperty?.target).to.equal('component.disabled');
    expect(secondProperty?.fieldPath).to.equal('/title');
    expect(secondProperty?.value).to.equal('highlight');
    expect(secondProperty?.target).to.equal('layout.cssClasses');

    expect(onErrorRunTemplate?.config?.template).to.equal(undefined);
    expect(onErrorRunTemplate?.config?.hasTemplate).to.equal(true);
  });
});
