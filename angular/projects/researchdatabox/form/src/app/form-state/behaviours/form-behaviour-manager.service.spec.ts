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

  it('binds behaviours and silently updates target field values', fakeAsync(() => {
    const targetControl = new FormControl('');
    const formComponent = {
      form: { value: { source: 'source', target: '' } },
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
          },
        },
      }),
      requestParams: () => ({}),
      broadcastFormStatus: jasmine.createSpy('broadcastFormStatus'),
    } as any;

    const setValueSpy = spyOn(targetControl, 'setValue').and.callThrough();
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
    expect(formComponent.broadcastFormStatus).toHaveBeenCalledTimes(1);
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

  /**
   * Coverage for the extended action types: `setValues`, `runTemplate`,
   * `setUIProperty`, and `setUIProperties`.
   */
  describe('extended action types', () => {
    interface TestFieldEntry {
      control: FormControl;
      setDisabled: jasmine.Spy;
      componentSetProperty: jasmine.Spy;
      layoutSetProperty: jasmine.Spy;
    }

    /** Build a `FormFieldCompMapEntry`-shaped stub addressable by pointer. */
    const createFieldEntry = (pointer: string, initialValue: unknown = ''): TestFieldEntry & { entry: any } => {
      const control = new FormControl<unknown>(initialValue);
      const setDisabled = jasmine.createSpy(`setDisabled:${pointer}`);
      const componentSetProperty = jasmine.createSpy(`componentSetProperty:${pointer}`);
      const layoutSetProperty = jasmine.createSpy(`layoutSetProperty:${pointer}`);
      return {
        control,
        setDisabled,
        componentSetProperty,
        layoutSetProperty,
        entry: {
          model: { formControl: control, setDisabled },
          component: { setProperty: componentSetProperty },
          layout: { setProperty: layoutSetProperty },
          lineagePaths: { angularComponentsJsonPointer: pointer },
        },
      };
    };

    /**
     * Build the form component stub. `fields` maps field names under `/main/`
     * to entries; `compiledEvaluate` backs the compiled-items module so tests
     * can answer template evaluations per compiled key.
     */
    const createFormComponent = (
      behaviours: unknown[],
      fields: Record<string, { entry: any }>,
      compiledEvaluate: jasmine.Spy = jasmine.createSpy('evaluate').and.resolveTo('unused')
    ) => {
      const main: Record<string, unknown> = {};
      for (const [name, field] of Object.entries(fields)) {
        main[name] = { metadata: { formFieldEntry: field.entry } };
      }
      return {
        form: { value: {} },
        formDefMap: { formConfig: { behaviours } },
        getFormCompiledItems: jasmine.createSpy('getFormCompiledItems').and.resolveTo({ evaluate: compiledEvaluate }),
        getQuerySource: () => ({
          queryOrigSource: [],
          querySource: [],
          jsonPointerSource: { main },
        }),
        requestParams: () => ({}),
        broadcastFormStatus: jasmine.createSpy('broadcastFormStatus'),
      } as any;
    };

    const sourceChangedEvent = (value: unknown) =>
      ({
        type: FormComponentEventType.FIELD_VALUE_CHANGED,
        fieldId: '/main/source',
        sourceId: '*',
        value,
        timestamp: Date.now(),
      }) as any;

    it('setValues updates several fields from one action', fakeAsync(() => {
      const title = createFieldEntry('/main/title');
      const description = createFieldEntry('/main/description');
      const compiledEvaluate = jasmine.createSpy('evaluate').and.callFake(async (key: (string | number)[]) => {
        expect(key).toEqual(['behaviours', 0, 'actions', 0, 'config', 'values', 0, 'valueTemplate']);
        return 'templated-title';
      });
      const formComponent = createFormComponent(
        [
          {
            name: 'set-many',
            condition: '/main/source::field.value.changed',
            conditionKind: 'jsonpointer',
            actions: [
              {
                type: 'setValues',
                config: {
                  values: [
                    { fieldPath: '/main/title', hasValueTemplate: true },
                    { fieldPath: '/main/description' },
                  ],
                },
              },
            ],
          },
        ],
        { title, description },
        compiledEvaluate
      );

      manager.bind(formComponent);
      fieldEvents$.next(sourceChangedEvent('copied'));
      tick();

      expect(title.control.value).toBe('templated-title');
      expect(description.control.value).toBe('copied');
    }));

    it('runTemplate stores its result under resultKey for later actions', fakeAsync(() => {
      const target = createFieldEntry('/main/target');
      const compiledEvaluate = jasmine.createSpy('evaluate').and.callFake(
        async (key: (string | number)[], context: Record<string, unknown>) => {
          if (key.join('.') === 'behaviours.0.actions.0.config.template') {
            return 'COMPUTED';
          }
          if (key.join('.') === 'behaviours.0.actions.1.config.valueTemplate') {
            // Proves the resultKey extra persisted across the per-action
            // pipeline context rebuild.
            return context['computedValue'];
          }
          throw new Error(`Unexpected compiled key: ${key.join('.')}`);
        }
      );
      const formComponent = createFormComponent(
        [
          {
            name: 'compute-then-set',
            condition: '/main/source::field.value.changed',
            conditionKind: 'jsonpointer',
            actions: [
              {
                type: 'runTemplate',
                config: { hasTemplate: true, resultKey: 'computedValue' },
              },
              {
                type: 'setValue',
                config: { fieldPath: '/main/target', hasValueTemplate: true },
              },
            ],
          },
        ],
        { target },
        compiledEvaluate
      );

      manager.bind(formComponent);
      fieldEvents$.next(sourceChangedEvent('raw'));
      tick();

      expect(target.control.value).toBe('COMPUTED');
    }));

    it('runTemplate without resultKey replaces the pipeline value', fakeAsync(() => {
      const target = createFieldEntry('/main/target');
      const compiledEvaluate = jasmine.createSpy('evaluate').and.resolveTo('REPLACED');
      const formComponent = createFormComponent(
        [
          {
            name: 'replace-value',
            condition: '/main/source::field.value.changed',
            conditionKind: 'jsonpointer',
            actions: [
              { type: 'runTemplate', config: { hasTemplate: true } },
              { type: 'setValue', config: { fieldPath: '/main/target' } },
            ],
          },
        ],
        { target },
        compiledEvaluate
      );

      manager.bind(formComponent);
      fieldEvents$.next(sourceChangedEvent('raw'));
      tick();

      expect(target.control.value).toBe('REPLACED');
    }));

    it('runTemplate applyResults applies value and UI-target instructions and skips invalid ones', fakeAsync(() => {
      const target = createFieldEntry('/main/target');
      const ui = createFieldEntry('/main/ui');
      const compiledEvaluate = jasmine.createSpy('evaluate').and.resolveTo([
        { fieldPath: '/main/target', value: 'set-via-instruction' },
        { fieldPath: '/main/ui', target: 'component.visible', value: false },
        { fieldPath: '/main/missing', value: 'never-set' },
        'not-an-object',
      ]);
      const formComponent = createFormComponent(
        [
          {
            name: 'apply-instructions',
            condition: '/main/source::field.value.changed',
            conditionKind: 'jsonpointer',
            actions: [{ type: 'runTemplate', config: { hasTemplate: true, applyResults: true } }],
          },
        ],
        { target, ui },
        compiledEvaluate
      );

      manager.bind(formComponent);
      fieldEvents$.next(sourceChangedEvent('raw'));
      tick();

      expect(target.control.value).toBe('set-via-instruction');
      expect(ui.componentSetProperty).toHaveBeenCalledWith('visible', false);
      // One warn for the unresolvable pointer and one for the non-object entry.
      expect(logger.warn).toHaveBeenCalledTimes(2);
    }));

    it('skips runTemplate actions with reserved resultKeys at bind time but still runs siblings', fakeAsync(() => {
      const target = createFieldEntry('/main/target');
      const compiledEvaluate = jasmine.createSpy('evaluate');
      const formComponent = createFormComponent(
        [
          {
            name: 'reserved-result-key',
            condition: '/main/source::field.value.changed',
            conditionKind: 'jsonpointer',
            actions: [
              { type: 'runTemplate', config: { hasTemplate: true, resultKey: 'formData' } },
              { type: 'setValue', config: { fieldPath: '/main/target' } },
            ],
          },
        ],
        { target },
        compiledEvaluate
      );

      manager.bind(formComponent);

      expect(logger.warn).toHaveBeenCalledWith(
        jasmine.stringContaining('resultKey is reserved or not a valid identifier'),
        jasmine.objectContaining({ resultKey: 'formData' })
      );

      fieldEvents$.next(sourceChangedEvent('copied'));
      tick();

      expect(compiledEvaluate).not.toHaveBeenCalled();
      expect(target.control.value).toBe('copied');
    }));

    it('setUIProperty applies expression targets to the resolved field', fakeAsync(() => {
      const ui = createFieldEntry('/main/ui');
      const formComponent = createFormComponent(
        [
          {
            name: 'toggle-ui',
            condition: '/main/source::field.value.changed',
            conditionKind: 'jsonpointer',
            actions: [
              {
                type: 'setUIProperty',
                config: { fieldPath: '/main/ui', target: 'field.visible', value: false },
              },
              {
                type: 'setUIProperty',
                config: { fieldPath: '/main/ui', target: 'model.disabled', value: true },
              },
            ],
          },
        ],
        { ui }
      );

      manager.bind(formComponent);
      fieldEvents$.next(sourceChangedEvent('anything'));
      tick();

      expect(ui.componentSetProperty).toHaveBeenCalledWith('visible', false);
      expect(ui.layoutSetProperty).toHaveBeenCalledWith('visible', false);
      expect(ui.setDisabled).toHaveBeenCalledWith(true, { emitEvent: false, onlySelf: true });
    }));

    it('setUIProperties uses the action-level default fieldPath with per-entry overrides and warns on unresolved entries', fakeAsync(() => {
      const ui = createFieldEntry('/main/ui');
      const other = createFieldEntry('/main/other');
      const formComponent = createFormComponent(
        [
          {
            name: 'bulk-ui',
            condition: '/main/source::field.value.changed',
            conditionKind: 'jsonpointer',
            actions: [
              {
                type: 'setUIProperties',
                config: {
                  fieldPath: '/main/ui',
                  properties: [
                    { target: 'component.disabled', value: true },
                    { fieldPath: '/main/other', target: 'component.disabled', value: true },
                    { fieldPath: '/main/missing', target: 'component.disabled', value: true },
                  ],
                },
              },
            ],
          },
        ],
        { ui, other }
      );

      manager.bind(formComponent);
      fieldEvents$.next(sourceChangedEvent('anything'));
      tick();

      expect(ui.componentSetProperty).toHaveBeenCalledWith('disabled', true);
      expect(other.componentSetProperty).toHaveBeenCalledWith('disabled', true);
      expect(logger.warn).toHaveBeenCalledWith(
        jasmine.stringContaining('setUIProperty: target field did not resolve'),
        jasmine.objectContaining({ target: 'component.disabled' })
      );
    }));

    it('skips logical setValues entries in onError but still runs sibling entries', fakeAsync(() => {
      const fallback = createFieldEntry('/main/fallback');
      const formComponent = createFormComponent(
        [
          {
            name: 'error-fallback',
            condition: '/main/source::field.value.changed',
            conditionKind: 'jsonpointer',
            processors: [{ type: 'fetchMetadata' }],
            actions: [],
            onError: [
              {
                type: 'setValues',
                config: {
                  values: [
                    { fieldPath: '/main/fallback', fieldPathKind: 'logical' },
                    { fieldPath: '/main/fallback' },
                  ],
                },
              },
            ],
          },
        ],
        { fallback }
      );
      recordService.getRecordMeta.and.rejectWith(new Error('boom'));

      manager.bind(formComponent);

      expect(logger.warn).toHaveBeenCalledWith(
        jasmine.stringContaining('logical fieldPathKind is not supported in onError actions'),
        jasmine.objectContaining({ entryIndex: 0 })
      );

      fieldEvents$.next(sourceChangedEvent('oid-1'));
      tick();

      expect(fallback.control.value).toBe('oid-1');
    }));
  });
});
