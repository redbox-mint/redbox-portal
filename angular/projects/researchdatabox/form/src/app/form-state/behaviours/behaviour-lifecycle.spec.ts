import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { jsonataEvaluateFunc } from '@researchdatabox/sails-ng-common';
import { BehaviourHandler } from './behaviour-handler';
import { FormBehaviourManager } from './form-behaviour-manager.service';
import { matchBehaviourCondition } from './behaviour-condition-matcher';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import { FormComponentValueChangeEventProducer } from '../events/form-component-change-event-producer';
import { createFormDefinitionReadyEvent, createFormSaveSuccessEvent } from '../events/form-component-event.types';

const ready = { ...createFormDefinitionReadyEvent({}), timestamp: 1 } as any;
// A synthetic notification only: no save request or backend operation.
const saved = {
  ...createFormSaveSuccessEvent({ oid: 'mock-oid', savedData: {}, response: { success: true } } as any),
  timestamp: 1,
} as any;
const field = (fieldId: string, sourceId: string) => ({
  type: 'field.value.changed' as const,
  fieldId,
  sourceId,
  value: 'x',
  timestamp: 1,
});
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('explicit form lifecycle behaviours', () => {
  function context(event: any, evaluate = jasmine.createSpy('evaluate').and.resolveTo(true)) {
    return {
      behaviourIndex: 0,
      compiledTemplateEvaluator: { evaluate } as any,
      formValue: {},
      requestParams: {},
      querySource: { event, jsonPointerSource: { main: { source: {} } }, querySource: [], queryOrigSource: [] },
    };
  }

  it('matches only named root lifecycle subscriptions, respecting false and legacy readiness', async () => {
    for (const runOnFormReady of [undefined, false, true]) {
      for (const event of [ready, saved, { ...ready, sourceId: 'form.definition.ready' }]) {
        const condition = `::${event.type}`;
        expect(
          await matchBehaviourCondition(
            condition,
            'jsonpointer',
            event,
            { name: 'exact', condition, runOnFormReady, actions: [] },
            context(event)
          )
        )
          .withContext(`${event.type}, ${event.sourceId}, ${runOnFormReady}`)
          .toBe(event.type !== ready.type || runOnFormReady !== false);
      }
      for (const event of [
        ready,
        saved,
        { type: 'field.value.changed', timestamp: 1 },
        { type: 'custom.event', timestamp: 1 },
        { type: 'form.custom.event', timestamp: 1 },
      ]) {
        for (const condition of [
          '::*',
          '/main::*',
          '/main/source::*',
          '::field.value.changed',
          '/main/source::field.value.changed',
          '/main::form.definition.ready',
          '::custom.event',
          '::form.custom.event',
        ]) {
          expect(
            await matchBehaviourCondition(
              condition,
              'jsonpointer',
              event,
              { name: 'field', condition, runOnFormReady, actions: [] },
              context(event)
            )
          )
            .withContext(`${condition}, ${event.type}, ${runOnFormReady}`)
            .toBeFalse();
        }
      }
    }
  });

  it('requires explicit true for native JSONata readiness and retains field-ready and broadcast gates', async () => {
    for (const kind of ['jsonata', 'jsonata_query'] as const)
      for (const runOnFormReady of [undefined, false, true]) {
        for (const event of [
          ready,
          saved,
          field('/main/source', 'form.definition.ready'),
          field('/main/source', '*'),
          field('/main/source', '/main/source'),
          { ...ready, sourceId: 'form.definition.ready' },
        ]) {
          const evaluate = jasmine.createSpy('evaluate').and.resolveTo(true);
          const expected =
            event.sourceId === 'form.definition.ready'
              ? runOnFormReady !== false
              : event === ready
                ? runOnFormReady === true
                : event.sourceId === '*' && runOnFormReady !== true;
          expect(
            await matchBehaviourCondition(
              'true',
              kind,
              event,
              { name: 'gate', condition: 'true', runOnFormReady, actions: [] },
              context(event, evaluate)
            )
          )
            .withContext(`${kind}, ${event.type}, ${event.sourceId}, ${runOnFormReady}`)
            .toBe(expected);
          expect(evaluate.calls.count()).toBe(expected ? 1 : 0);
        }
      }
  });

  it('counts pipeline calls without widening ordinary or wildcard field scope', async () => {
    const logger = jasmine.createSpyObj('logger', ['debug', 'warn', 'error']);
    TestBed.configureTestingModule({
      providers: [FormComponentEventBus, { provide: LoggerService, useValue: logger }],
    });
    const bus = TestBed.inject(FormComponentEventBus);
    const control = new FormControl('');
    const setter = spyOn(control, 'setValue').and.callThrough();
    const form: any = {
      broadcastFormStatus: () => {},
      form: { value: {} },
      requestParams: () => ({}),
      getRecordCompiledItems: async () => ({ evaluate: async () => true }),
      getQuerySource: () => ({
        jsonPointerSource: {
          main: { source: {}, target: { metadata: { formFieldEntry: { model: { formControl: control } } } } },
        },
        querySource: [],
        queryOrigSource: [],
      }),
    };
    for (const runOnFormReady of [undefined, false, true])
      for (const condition of [
        '::form.definition.ready',
        '::form.save.success',
        '/main/source::field.value.changed',
        '/main::field.value.changed',
        '::*',
        '/main/source::*',
        '/main::*',
      ]) {
        const handler = new BehaviourHandler(
          {
            name: 'count',
            condition,
            runOnFormReady,
            actions: [{ type: 'setValue', config: { fieldPath: '/main/target' } }],
          },
          0,
          { eventBus: bus, formComponent: form, logger, recordService: {} as any }
        );
        handler.activate();
        setter.calls.reset();
        const events = [
          ready,
          saved,
          field('/main/source', 'form.definition.ready'),
          field('/main/source', '/main/source'),
          field('/main/source', '*'),
          field('/other', '/other'),
          field('/other', '*'),
        ];
        for (const event of events) {
          bus.publish(event);
          await settle();
        }
        const expected =
          condition === '::form.definition.ready'
            ? runOnFormReady === false
              ? 0
              : 1
            : condition === '::form.save.success'
              ? 1
              : condition === '/main/source::field.value.changed' || condition === '/main/source::*'
                ? runOnFormReady === false
                  ? 2
                  : 3
                : condition === '::*'
                  ? runOnFormReady === false
                    ? 2
                    : 3
                  : runOnFormReady === false
                    ? 1
                    : 2;
        expect(setter.calls.count()).withContext(`${condition}, ${runOnFormReady}`).toBe(expected);
        handler.destroy();
      }
    expect(logger.error).not.toHaveBeenCalled();
  });

  for (const conditionKind of ['jsonata', 'jsonata_query'] as const) for (const nativeFirst of [true, false]) {
    it(`executes a ready initializer once with concurrent notifications (${conditionKind}, native first: ${nativeFirst})`, async () => {
      const logger = jasmine.createSpyObj('logger', ['debug', 'warn', 'error']);
      TestBed.configureTestingModule({
        providers: [FormComponentEventBus, { provide: LoggerService, useValue: logger }],
      });
      const bus = TestBed.inject(FormComponentEventBus);
      let release!: () => void;
      const pending = new Promise<void>(resolve => (release = resolve));
      const evaluate = jasmine.createSpy('evaluate').and.callFake(async (key: any) => {
        if (key.at(-1) === 'template') await pending;
        return true;
      });
      const form: any = {
        broadcastFormStatus: () => {},
        form: { value: {} },
        requestParams: () => ({}),
        getRecordCompiledItems: async () => ({ evaluate }),
        getQuerySource: () => ({ jsonPointerSource: {}, querySource: [], queryOrigSource: [] }),
      };
      const handler = new BehaviourHandler(
        {
          name: 'once',
          condition: 'true',
          conditionKind,
          runOnFormReady: true,
          actions: [{ type: 'runTemplate', config: { template: 'true', hasTemplate: true } }],
        } as any,
        0,
        { eventBus: bus, formComponent: form, logger, recordService: {} as any }
      );
      handler.activate();
      const initial = Array.from({ length: 87 }, (_, i) => field(`/main/field-${i}`, 'form.definition.ready'));
      for (const event of nativeFirst ? [ready, ...initial] : [...initial, ready]) bus.publish(event);
      await settle();
      release();
      await settle();
      bus.publish(ready);
      bus.publish(field('/main/source', '*'));
      await settle();
      expect(evaluate.calls.allArgs().filter(([key]) => key.at(-1) === 'template').length).toBe(1);
      expect(logger.error).not.toHaveBeenCalled();
      handler.destroy();
    });
  }

  it('keeps the originating-field predicate at one pipeline across 87 initial notifications', async () => {
    const logger = jasmine.createSpyObj('logger', ['debug', 'warn', 'error']);
    TestBed.configureTestingModule({
      providers: [FormComponentEventBus, { provide: LoggerService, useValue: logger }],
    });
    const bus = TestBed.inject(FormComponentEventBus);
    for (const condition of [
      "event.fieldId = '/main/selector' and event.sourceId = 'form.definition.ready'",
      'event.type = "form.definition.ready" and $exists(runtimeContext.requestParams.rdmpOid) and runtimeContext.requestParams.rdmpOid != ""',
    ]) {
      const calls: any[] = [];
      const form: any = {
        broadcastFormStatus: () => {},
        form: { value: {} },
        requestParams: () => ({ rdmpOid: 'mock-source' }),
        getQuerySource: () => ({
          jsonPointerSource: {},
          querySource: [],
          queryOrigSource: [],
          runtimeContext: { requestParams: { rdmpOid: 'mock-source' } },
        }),
        getRecordCompiledItems: async () => ({
          evaluate: async (key: any, ctx: any) => {
            if (key.at(-1) === 'condition') return jsonataEvaluateFunc(condition)(ctx);
            calls.push(ctx.event);
            return true;
          },
        }),
      };
      const handler = new BehaviourHandler(
        {
          name: 'initializer',
          condition,
          conditionKind: 'jsonata_query',
          runOnFormReady: true,
          actions: [{ type: 'runTemplate', config: { template: 'true', hasTemplate: true } }],
        } as any,
        0,
        { eventBus: bus, formComponent: form, logger, recordService: {} as any }
      );
      handler.activate();
      bus.publish(ready);
      for (let i = 0; i < 87; i++)
        bus.publish(field(i === 43 ? '/main/selector' : `/main/field-${i}`, 'form.definition.ready'));
      await settle();
      await settle();
      bus.publish(field('/main/selector', '*'));
      bus.publish(saved);
      await settle();
      expect(calls.length).withContext(condition).toBe(1);
      expect(calls[0].type).toBe(condition.includes('event.type') ? 'form.definition.ready' : 'field.value.changed');
      handler.destroy();
    }
  });

  for (const conditionKind of ['jsonpointer', 'jsonata', 'jsonata_query'] as const) {
    it(`keeps debounced native readiness through real field fan-out and later status events (${conditionKind})`, fakeAsync(() => {
      const logger = jasmine.createSpyObj('logger', ['debug', 'warn', 'error']);
      TestBed.configureTestingModule({ providers: [FormComponentEventBus, { provide: LoggerService, useValue: logger }] });
      const bus = TestBed.inject(FormComponentEventBus);
      const action = jasmine.createSpy('action');
      const form: any = {
        eventScopeId: 'owner', form: { value: {} }, requestParams: () => ({}),
        getQuerySource: () => ({ jsonPointerSource: {}, querySource: [], queryOrigSource: [] }),
        getRecordCompiledItems: async () => ({ evaluate: async (key: any, ctx: any) => {
          if (key.at(-1) === 'condition') return ctx.event.type === ready.type;
          action(ctx.event.type);
          return true;
        } }),
      };
      // Field producers subscribe before the manager, and re-enter the bus synchronously.
      const producers = Array.from({ length: 87 }, (_, i) => {
        const producer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventProducer(bus));
        producer.bind({ definition: {
          model: { formControl: new FormControl('initial') },
          lineagePaths: { angularComponentsJsonPointer: `/main/field-${i}` },
        } as any });
        return producer;
      });
      const handler = new BehaviourHandler({
        name: 'debounced-ready', conditionKind, runOnFormReady: true, debounceMs: 10,
        condition: conditionKind === 'jsonpointer' ? '::form.definition.ready' : 'event.type = "form.definition.ready"',
        actions: [{ type: 'runTemplate', config: { hasTemplate: true } }],
      } as any, 0, { eventBus: bus, formComponent: form, logger, recordService: {} as any });
      handler.activate();
      bus.publish(ready);
      bus.publish({ type: 'form.status.changed', status: 'VALID' } as any);
      tick(9);
      expect(action).not.toHaveBeenCalled();
      tick(1);
      expect(action).toHaveBeenCalledOnceWith(ready.type);
      expect(logger.error).not.toHaveBeenCalled();
      handler.destroy();
      producers.forEach(producer => producer.destroy());
    }));
  }

  it('ignores another form save before debounce and executes each owned save', fakeAsync(() => {
    const logger = jasmine.createSpyObj('logger', ['debug', 'warn', 'error']);
    TestBed.configureTestingModule({ providers: [FormComponentEventBus, { provide: LoggerService, useValue: logger }] });
    const bus = TestBed.inject(FormComponentEventBus);
    const action = jasmine.createSpy('action');
    const form: any = {
      eventScopeId: 'owner', form: { value: {} }, requestParams: () => ({}),
      getQuerySource: () => ({ jsonPointerSource: {}, querySource: [], queryOrigSource: [] }),
      getRecordCompiledItems: async () => ({ evaluate: async (_key: any, ctx: any) => action(ctx.event.formScopeId) }),
    };
    const handler = new BehaviourHandler({
      name: 'saved', condition: '::form.save.success', debounceMs: 10,
      actions: [{ type: 'runTemplate', config: { hasTemplate: true } }],
    } as any, 0, { eventBus: bus, formComponent: form, logger, recordService: {} as any });
    handler.activate();
    bus.publish({ ...saved, formScopeId: 'other' });
    tick(10);
    expect(action).not.toHaveBeenCalled();
    action.calls.reset();
    for (let i = 0; i < 2; i++) {
      bus.publish({ ...saved, formScopeId: 'owner' });
      bus.publish({ ...saved, formScopeId: 'other' });
      tick(10);
    }
    expect(action.calls.allArgs()).toEqual([['owner'], ['owner']]);
    handler.destroy();
  }));


  for (const fails of [false, true]) {
    it(`reserves native initialization before an asynchronous lookup (fails: ${fails})`, async () => {
      const logger = jasmine.createSpyObj('logger', ['debug', 'warn', 'error']);
      TestBed.configureTestingModule({ providers: [FormComponentEventBus, { provide: LoggerService, useValue: logger }] });
      const bus = TestBed.inject(FormComponentEventBus);
      let resolve!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      const lookup = new Promise((res, rej) => { resolve = res; reject = rej; });
      const recordService = jasmine.createSpyObj('recordService', ['getRecordMeta']);
      recordService.getRecordMeta.and.returnValue(lookup);
      const actions: string[] = [];
      const form: any = {
        form: { value: {} }, requestParams: () => ({ rdmpOid: 'source-oid' }),
        getQuerySource: () => ({ jsonPointerSource: {}, querySource: [], queryOrigSource: [] }),
        getRecordCompiledItems: async () => ({ evaluate: async (key: any, ctx: any) => {
          if (key[2] === 'condition') return true;
          if (key[2] === 'processors') return ctx.requestParams.rdmpOid;
          actions.push(key[2]);
          return true;
        } }),
      };
      const handler = new BehaviourHandler({
        name: 'lookup-once', conditionKind: 'jsonata_query', condition: 'true', runOnFormReady: true,
        processors: [{ type: 'jsonataTransform', config: { hasTemplate: true } }, { type: 'fetchMetadata' }],
        actions: [{ type: 'runTemplate', config: { hasTemplate: true } }],
        onError: [{ type: 'runTemplate', config: { hasTemplate: true } }],
      } as any, 0, { eventBus: bus, formComponent: form, logger, recordService });
      handler.activate();
      bus.publish(ready);
      for (let i = 0; i < 87; i++) bus.publish(field(`/main/field-${i}`, 'form.definition.ready'));
      await settle();
      expect(recordService.getRecordMeta).toHaveBeenCalledOnceWith('source-oid');
      if (fails) reject(new Error('lookup failed'));
      else resolve({ title: 'loaded' });
      await settle();
      bus.publish(ready);
      bus.publish(field('/main/source', 'form.definition.ready'));
      await settle();
      expect(actions).toEqual([fails ? 'onError' : 'actions']);
      expect(recordService.getRecordMeta.calls.count()).toBe(1);
      expect(logger.error.calls.count()).toBe(fails ? 1 : 0);
      handler.destroy();
    });
  }

  it('starts a fresh initializer on rebind and cancels an old awaited action', async () => {
    const logger = jasmine.createSpyObj('logger', ['debug', 'warn', 'error']);
    TestBed.configureTestingModule({ providers: [FormComponentEventBus, { provide: LoggerService, useValue: logger }] });
    const bus = TestBed.inject(FormComponentEventBus);
    const manager = new FormBehaviourManager(bus, logger, {} as any);
    let release!: (value: string) => void;
    const pending = new Promise<string>(resolve => release = resolve);
    const oldControl = new FormControl('old');
    const newControl = new FormControl('new');
    const form = (control: FormControl, value: Promise<string>) => ({
      form: { value: {} }, requestParams: () => ({}), broadcastFormStatus: () => {},
      formDefMap: { formConfig: { behaviours: [{
        name: 'on-load', condition: '::form.definition.ready', runOnFormReady: true,
        actions: [{ type: 'setValue', config: { fieldPath: '/target', hasValueTemplate: true } }],
      }] } },
      getQuerySource: () => ({
        jsonPointerSource: { target: { metadata: { formFieldEntry: { model: { formControl: control } } } } },
        querySource: [], queryOrigSource: [],
      }),
      getRecordCompiledItems: async () => ({ evaluate: async () => value }),
    } as any);
    manager.bind(form(oldControl, pending));
    bus.publish(ready);
    await settle();
    manager.bind(form(newControl, Promise.resolve('initialized')));
    bus.publish(ready);
    await settle();
    release('stale');
    await settle();
    expect(oldControl.value).toBe('old');
    expect(newControl.value).toBe('initialized');
    expect(logger.error).not.toHaveBeenCalled();
    manager.destroy();
  });

});
