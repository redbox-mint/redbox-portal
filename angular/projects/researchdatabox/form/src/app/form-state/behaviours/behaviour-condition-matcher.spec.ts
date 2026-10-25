import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { ExpressionsConditionKind } from '@researchdatabox/sails-ng-common';
import { BehaviourCompiledTemplateEvaluator } from './behaviour-compiled-template-evaluator';
import { matchBehaviourCondition } from './behaviour-condition-matcher';
import { createFormDefinitionReadyEvent, FormComponentEvent, FormComponentEventType } from '../events/form-component-event.types';

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

  it('matches explicit lifecycle subscriptions without treating them as wildcard field broadcasts', async () => {
    for (const type of [FormComponentEventType.FORM_DEFINITION_READY, FormComponentEventType.FORM_SAVE_SUCCESS]) {
      const event: FormComponentEvent = { type, timestamp: 1 };
      const ctx = {
        behaviourIndex: 0, compiledTemplateEvaluator: createEvaluator(false), formValue: {}, requestParams: {},
        querySource: { queryOrigSource: [], querySource: [], jsonPointerSource: {}, event },
      };
      const behaviour = { name: 'lifecycle', condition: `::${type}`, conditionKind: ExpressionsConditionKind.JSONPointer, actions: [] };
      expect(await matchBehaviourCondition(behaviour.condition, behaviour.conditionKind, event, behaviour, ctx)).toBeTrue();
      expect(await matchBehaviourCondition('::*', behaviour.conditionKind, event, { ...behaviour, condition: '::*' }, ctx)).toBeFalse();
      expect(await matchBehaviourCondition('/title::' + type, behaviour.conditionKind, event, behaviour, ctx)).toBeFalse();
      if (type === FormComponentEventType.FORM_DEFINITION_READY) {
        expect(await matchBehaviourCondition(behaviour.condition, behaviour.conditionKind, event, { ...behaviour, runOnFormReady: false }, ctx)).toBeFalse();
      }
    }
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
      { ...createFormDefinitionReadyEvent({}), timestamp: Date.now() },
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

  for (const conditionKind of [ExpressionsConditionKind.JSONata, ExpressionsConditionKind.JSONataQuery]) {
    it(`honours actual and legacy readiness without broadening scoped ${conditionKind} events`, async () => {
      const evaluator = createEvaluator(true);
      const evaluateSpy = spyOn(evaluator, 'evaluate').and.resolveTo(true);
      const actualReady = { ...createFormDefinitionReadyEvent({}), timestamp: 1 };
      expect(actualReady.sourceId).toBeUndefined();
      const legacyReady: FormComponentEvent = {
        type: FormComponentEventType.FIELD_VALUE_CHANGED,
        sourceId: FormComponentEventType.FORM_DEFINITION_READY,
        fieldId: '/main/source', value: null, timestamp: 1,
      };
      const scoped: FormComponentEvent = { ...legacyReady, sourceId: '/main/source' };
      const broadcast: FormComponentEvent = { ...legacyReady, sourceId: '*' };
      const ctx = {
        behaviourIndex: 0, compiledTemplateEvaluator: evaluator, formValue: {}, requestParams: {},
        querySource: undefined,
      };
      for (const runOnFormReady of [true, undefined, false]) {
        const behaviour = { name: 'ready', condition: 'true', conditionKind, runOnFormReady, actions: [] };
        for (const event of [actualReady, legacyReady]) {
          evaluateSpy.calls.reset();
          expect(await matchBehaviourCondition('true', conditionKind, event, behaviour, ctx))
            .withContext(`ready ${event.type}, runOnFormReady=${runOnFormReady}`)
            .toBe(runOnFormReady !== false);
          expect(evaluateSpy.calls.count()).toBe(runOnFormReady === false ? 0 : 1);
        }
        expect(await matchBehaviourCondition('true', conditionKind, scoped, behaviour, ctx)).toBeFalse();
        expect(await matchBehaviourCondition('true', conditionKind, broadcast, behaviour, ctx))
          .toBe(runOnFormReady !== true);
      }
    });
  }
});
