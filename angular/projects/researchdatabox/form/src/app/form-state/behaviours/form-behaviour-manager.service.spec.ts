import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { LoggerService, RecordService } from '@researchdatabox/portal-ng-common';
import { FormBehaviourManager } from './form-behaviour-manager.service';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import { FormComponentEvent, FormComponentEventType } from '../events/form-component-event.types';

/**
 * Integration-style unit coverage for binding, happy-path action execution, and
 * processor failure -> `onError` fallback handling.
 */
describe('FormBehaviourManager', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let logger: jasmine.SpyObj<LoggerService>;
  let recordService: jasmine.SpyObj<RecordService>;
  let allEvents$: Subject<FormComponentEvent>;
  let fieldEvents$: Subject<FormComponentEvent>;
  let manager: FormBehaviourManager;

  beforeEach(() => {
    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', [
      'select$',
      'selectAll$',
      'publish',
    ]);
    logger = jasmine.createSpyObj<LoggerService>('LoggerService', ['debug', 'warn', 'error']);
    recordService = jasmine.createSpyObj<RecordService>('RecordService', ['getRecordMeta']);
    allEvents$ = new Subject<FormComponentEvent>();
    fieldEvents$ = new Subject<FormComponentEvent>();
    eventBus.selectAll$.and.returnValue(allEvents$.asObservable());
    eventBus.select$.and.callFake((eventType: string) => {
      if (eventType === FormComponentEventType.FIELD_VALUE_CHANGED) {
        return fieldEvents$.asObservable() as any;
      }
      return allEvents$.asObservable() as any;
    });

    TestBed.configureTestingModule({
      providers: [
        FormBehaviourManager,
        { provide: FormComponentEventBus, useValue: eventBus },
        { provide: LoggerService, useValue: logger },
        { provide: RecordService, useValue: recordService },
      ],
    });
    manager = TestBed.inject(FormBehaviourManager);
  });

  afterEach(() => {
    manager.destroy();
  });

  it('binds behaviours and queues one status broadcast after silent target field updates', fakeAsync(() => {
    const targetControl = new FormControl('');
    const secondTargetControl = new FormControl('');
    const formComponent = {
      form: { value: { source: 'source', target: '', secondTarget: '' } },
      formDefMap: {
        formConfig: {
          behaviours: [
            {
              name: 'copy-source',
              condition: '/main/source::field.value.changed',
              conditionKind: 'jsonpointer',
              actions: [
                {
                  type: 'setValue',
                  config: {
                    fieldPath: '/main/target',
                    fieldPathKind: 'componentJsonPointer',
                  },
                },
                {
                  type: 'setValue',
                  config: {
                    fieldPath: '/main/secondTarget',
                    fieldPathKind: 'componentJsonPointer',
                  },
                },
              ],
            },
          ],
        },
      },
      getFormCompiledItems: jasmine.createSpy('getFormCompiledItems').and.resolveTo({
        evaluate: jasmine.createSpy('evaluate').and.resolveTo('unused'),
      }),
      getQuerySource: () => ({
        queryOrigSource: [],
        querySource: [],
        jsonPointerSource: {
          main: {
            source: { metadata: { formFieldEntry: { model: { formControl: new FormControl('source') } } } },
            target: {
              metadata: {
                formFieldEntry: {
                  model: { formControl: targetControl },
                  lineagePaths: { angularComponentsJsonPointer: '/main/target' },
                },
              },
            },
            secondTarget: {
              metadata: {
                formFieldEntry: {
                  model: { formControl: secondTargetControl },
                  lineagePaths: { angularComponentsJsonPointer: '/main/secondTarget' },
                },
              },
            },
          },
        },
      }),
      requestParams: () => ({}),
      queueFormStatusBroadcast: jasmine.createSpy('queueFormStatusBroadcast'),
    } as any;

    const setValueSpy = spyOn(targetControl, 'setValue').and.callThrough();
    const secondSetValueSpy = spyOn(secondTargetControl, 'setValue').and.callThrough();
    manager.bind(formComponent);

    fieldEvents$.next({
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: '/main/source',
      sourceId: '*',
      value: 'copied',
      timestamp: Date.now(),
    } as any);
    tick();

    expect(setValueSpy).toHaveBeenCalledWith('copied', { emitEvent: false });
    expect(secondSetValueSpy).toHaveBeenCalledWith('copied', { emitEvent: false });
    expect(formComponent.queueFormStatusBroadcast).toHaveBeenCalledTimes(1);
  }));

  it('runs fetchMetadata processors and emits onError actions when a processor fails', fakeAsync(() => {
    const formComponent = {
      form: { value: { source: 'oid-1' } },
      formDefMap: {
        formConfig: {
          behaviours: [
            {
              name: 'fetch-and-handle-error',
              condition: '/main/source::field.value.changed',
              conditionKind: 'jsonpointer',
              processors: [{ type: 'fetchMetadata' }],
              actions: [],
              onError: [
                {
                  type: 'emitEvent',
                  config: {
                    eventType: 'field.value.changed',
                    fieldId: '/main/error',
                    sourceId: '/main/error',
                  },
                },
              ],
            },
          ],
        },
      },
      getFormCompiledItems: jasmine.createSpy('getFormCompiledItems').and.resolveTo({
        evaluate: jasmine.createSpy('evaluate').and.resolveTo('unused'),
      }),
      getQuerySource: () => ({ queryOrigSource: [], querySource: [], jsonPointerSource: {} }),
      requestParams: () => ({}),
    } as any;
    recordService.getRecordMeta.and.rejectWith(new Error('boom'));

    manager.bind(formComponent);

    fieldEvents$.next({
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: '/main/source',
      sourceId: '*',
      value: 'oid-1',
      timestamp: Date.now(),
    } as any);
    tick();

    expect(eventBus.publish).toHaveBeenCalledWith(
      jasmine.objectContaining({
        type: FormComponentEventType.FIELD_VALUE_CHANGED,
        fieldId: '/main/error',
        sourceId: '/main/error',
      })
    );
  }));

  it('runs form-ready behaviours once even when they emit broadcast events', fakeAsync(() => {
    eventBus.publish.and.callFake(event => {
      allEvents$.next(event as unknown as FormComponentEvent);
    });

    const formComponent = {
      form: { value: {} },
      formDefMap: {
        formConfig: {
          behaviours: [
            {
              name: 'fetch-on-ready',
              condition: '$exists(runtimeContext.requestParams.rdmpOid)',
              conditionKind: 'jsonata_query',
              runOnFormReady: true,
              actions: [
                {
                  type: 'emitEvent',
                  config: {
                    eventType: 'field.value.changed',
                    fieldId: '/main/rdmpGetter',
                    sourceId: '*',
                  },
                },
              ],
            },
          ],
        },
      },
      getFormCompiledItems: jasmine.createSpy('getFormCompiledItems').and.resolveTo({
        evaluate: jasmine.createSpy('evaluate').and.resolveTo(true),
      }),
      getQuerySource: () => ({ queryOrigSource: [], querySource: [], jsonPointerSource: {} }),
      requestParams: () => ({ rdmpOid: 'oid-1' }),
    } as any;

    manager.bind(formComponent);

    allEvents$.next({
      type: FormComponentEventType.FORM_DEFINITION_READY,
      sourceId: FormComponentEventType.FORM_DEFINITION_READY,
      timestamp: Date.now(),
    } as any);
    tick();

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith(
      jasmine.objectContaining({
        type: FormComponentEventType.FIELD_VALUE_CHANGED,
        fieldId: '/main/rdmpGetter',
        sourceId: '*',
      })
    );
  }));
});
