import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { ExpressionsConditionKind } from '@researchdatabox/sails-ng-common';
import { BehaviourCompiledTemplateEvaluator } from './behaviour-compiled-template-evaluator';
import { matchBehaviourCondition } from './behaviour-condition-matcher';
import { FormComponentEventType } from '../events/form-component-event.types';

/**
 * Covers the condition semantics called out in the implementation plan, notably
 * JSONPointer broadcast matching and the broadcast-only gating for JSONata.
 */
describe('matchBehaviourCondition', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [LoggerService] });
  });

  function createEvaluator(result: unknown) {
    const logger = TestBed.inject(LoggerService);
    return new BehaviourCompiledTemplateEvaluator(
      { evaluate: jasmine.createSpy('evaluate').and.resolveTo(result) },
      logger
    );
  }

  it('matches jsonpointer conditions for broadcast field events', async () => {
    const evaluator = createEvaluator(false);
    const result = await matchBehaviourCondition(
      '/main/title::field.value.changed',
      ExpressionsConditionKind.JSONPointer,
      {
        type: FormComponentEventType.FIELD_VALUE_CHANGED,
        fieldId: '/main/title',
        sourceId: '*',
        value: 'hello',
        timestamp: Date.now(),
      } as any,
      {
        name: 'copy-title',
        condition: '/main/title::field.value.changed',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        actions: [],
      },
      {
        behaviourIndex: 0,
        compiledTemplateEvaluator: evaluator,
        formValue: {},
        requestParams: {},
        querySource: {
          queryOrigSource: [],
          querySource: [],
          jsonPointerSource: { main: { title: {} } },
          event: { type: FormComponentEventType.FIELD_VALUE_CHANGED, timestamp: Date.now() },
        },
      }
    );

    expect(result).toBeTrue();
  });

  it('rejects jsonata conditions for scoped non-broadcast events', async () => {
    const evaluator = createEvaluator(true);
    const result = await matchBehaviourCondition(
      '$exists(event.value)',
      ExpressionsConditionKind.JSONata,
      {
        type: FormComponentEventType.FIELD_VALUE_CHANGED,
        fieldId: '/main/title',
        sourceId: '/main/title',
        value: 'hello',
        timestamp: Date.now(),
      } as any,
      {
        name: 'jsonata-behaviour',
        condition: '$exists(event.value)',
        conditionKind: ExpressionsConditionKind.JSONata,
        actions: [],
      },
      {
        behaviourIndex: 0,
        compiledTemplateEvaluator: evaluator,
        formValue: {},
        requestParams: {},
        querySource: undefined,
      }
    );

    expect(result).toBeFalse();
  });

  it('evaluates jsonata_query conditions for form ready when enabled', async () => {
    const evaluator = createEvaluator(true);
    const evaluateSpy = spyOn(evaluator, 'evaluate').and.resolveTo(true);
    const result = await matchBehaviourCondition(
      '$exists(runtimeContext.requestParams.rdmpOid)',
      ExpressionsConditionKind.JSONataQuery,
      {
        type: FormComponentEventType.FORM_DEFINITION_READY,
        sourceId: FormComponentEventType.FORM_DEFINITION_READY,
        timestamp: Date.now(),
      } as any,
      {
        name: 'jsonata-query-behaviour',
        condition: '$exists(runtimeContext.requestParams.rdmpOid)',
        conditionKind: ExpressionsConditionKind.JSONataQuery,
        runOnFormReady: true,
        actions: [],
      },
      {
        behaviourIndex: 2,
        compiledTemplateEvaluator: evaluator,
        formValue: { title: 'x' },
        requestParams: { rdmpOid: 'oid-1' },
        querySource: {
          queryOrigSource: [],
          querySource: [{ name: 'title' }],
          jsonPointerSource: {},
          runtimeContext: { requestParams: { rdmpOid: 'oid-1' } },
          event: { type: FormComponentEventType.FORM_DEFINITION_READY, timestamp: Date.now() },
        },
      }
    );

    expect(result).toBeTrue();
    expect(evaluateSpy).toHaveBeenCalledWith(
      2,
      ['condition'],
      jasmine.objectContaining({
        querySource: [{ name: 'title' }],
        runtimeContext: { requestParams: { rdmpOid: 'oid-1' } },
      })
    );
  });
});
