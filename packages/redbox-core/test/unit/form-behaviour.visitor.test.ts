import { expect } from 'chai';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { TemplateFormConfigVisitor } from '../../src/visitor/template.visitor';
import { ClientFormConfigVisitor } from '../../src/visitor/client.visitor';
import { logger } from './helpers';

/**
 * Visitor-level regression coverage for the form behaviours v1 config pipeline.
 *
 * These tests intentionally stay focused on the server compilation contract:
 * - construct keeps top-level behaviour config intact
 * - template extraction emits the expected compiled keys
 * - client stripping removes raw JSONata source and leaves marker flags behind
 */
describe('Form behaviour visitors', () => {
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

  it('construct visitor preserves behaviours on form config', () => {
    const visitor = new ConstructFormConfigVisitor(logger);
    const constructed = visitor.start({ data: formConfig, formMode: 'edit' });

    expect((constructed as any).behaviours).to.deep.equal(formConfig.behaviours);
  });

  it('template visitor extracts compiled behaviour templates', () => {
    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({ data: formConfig, formMode: 'edit' });
    const visitor = new TemplateFormConfigVisitor(logger);

    const actual = visitor.start({ form: constructed });

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

  it('client visitor strips behaviour template source and sets flags', () => {
    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({ data: formConfig, formMode: 'edit' });
    const visitor = new ClientFormConfigVisitor(logger);

    const actual = visitor.start({ form: constructed });
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
