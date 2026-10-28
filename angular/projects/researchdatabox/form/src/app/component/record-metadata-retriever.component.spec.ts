import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { EMPTY, Subject } from 'rxjs';
import { RecordMetadataRetrieverComponent } from './record-metadata-retriever.component';
import {createTestbedModule, ensureApplicationRefFormComponent} from '../helpers.spec';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { FieldValueChangedEvent, FormComponentEventType } from '../form-state/events/form-component-event.types';
import { RecordService, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import {FormComponent} from "../form.component";

describe('RecordMetadataRetrieverComponent', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let recordService: jasmine.SpyObj<RecordService>;
  let loggerService: jasmine.SpyObj<LoggerService>;

  beforeEach(async () => {
    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['publish', 'select$']);
    recordService = jasmine.createSpyObj<RecordService>('RecordService', ['getRecordMeta']);
    loggerService = jasmine.createSpyObj<LoggerService>('LoggerService', ['debug', 'warn', 'error']);
    eventBus.select$.and.returnValue(EMPTY);

    await createTestbedModule({
      declarations: { RecordMetadataRetrieverComponent },
      providers: {
        FormComponentEventBus: { provide: FormComponentEventBus, useValue: eventBus },
        RecordService: { provide: RecordService, useValue: recordService },
        LoggerService: { provide: LoggerService, useValue: loggerService },
      },
    });
  });

  function createComponent(): RecordMetadataRetrieverComponent {
    const fixture = TestBed.createComponent(RecordMetadataRetrieverComponent);
    const component = fixture.componentInstance;
    component.formFieldCompMapEntry = {
      lineagePaths: {
        angularComponentsJsonPointer: '/rdmpGetter',
      },
    } as never;
    return component;
  }

  function getPrivateComponent(component: RecordMetadataRetrieverComponent): {
    handleExpression: (event: unknown, expression: unknown) => Promise<void>;
    expressionConsumer?: jasmine.SpyObj<{
      destroy: () => void;
      evaluateTemplateExpression: (expression: unknown, event: unknown) => Promise<unknown>;
    }>;
  } {
    return component as unknown as {
      handleExpression: (event: unknown, expression: unknown) => Promise<void>;
      expressionConsumer?: jasmine.SpyObj<{
        destroy: () => void;
        evaluateTemplateExpression: (expression: unknown, event: unknown) => Promise<unknown>;
      }>;
    };
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
  }

  async function bindRealBus(expressions: FormExpressionsConfigFrame[], evaluate: jasmine.Spy) {
    TestBed.overrideProvider(FormComponentEventBus, { useFactory: () => new FormComponentEventBus(), deps: [] });
    const bus = TestBed.inject(FormComponentEventBus);
    const formFixture = TestBed.createComponent(FormComponent);
    ensureApplicationRefFormComponent(formFixture.componentRef);
    spyOn(formFixture.componentInstance, 'getRecordCompiledItems').and.resolveTo({ evaluate } as never);
    const fixture = TestBed.createComponent(RecordMetadataRetrieverComponent);
    const component = fixture.componentInstance;
    component.formFieldCompMapEntry = {
      lineagePaths: { angularComponentsJsonPointer: '/rdmpGetter', formConfig: ['getter'] }, expressions,
    } as never;
    await (component as unknown as { initEventHandlers(): Promise<void> }).initEventHandlers();
    const published: unknown[] = [];
    bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe(event => {
      if (event.fieldId === '/rdmpGetter') published.push(event.value);
    });
    const select = (oid: string) => bus.publish<FieldValueChangedEvent>({
      type: FormComponentEventType.FIELD_VALUE_CHANGED, fieldId: '/related', sourceId: '*', value: oid,
    });
    return { bus, fixture, component, published, select };
  }

  const selectionExpression = {
    name: 'selected', config: {
      operation: 'fetchMetadata', runOnFormReady: false,
      conditionKind: 'jsonata', condition: 'event.fieldId = "/related"',
      hasTemplate: true, template: 'event.value',
    },
  } as FormExpressionsConfigFrame;

  it('supersedes delayed event-bus matching before evaluating templates or fetching old metadata', async () => {
    const oldMatch = deferred<boolean>();
    const evaluate = jasmine.createSpy('evaluate').and.callFake((key, context) => {
      if (key.at(-1) === 'condition') {
        if (context.event.value === 'old') return oldMatch.promise;
        return Promise.resolve(context.event.fieldId === '/related');
      }
      return Promise.resolve(context.event.value);
    });
    const { select, published, component } = await bindRealBus([selectionExpression], evaluate);
    fakeAsync(() => {
      recordService.getRecordMeta.and.resolveTo({ title: 'Current' });
      select('old');
      flushMicrotasks();
      select('current');
      flushMicrotasks();
      oldMatch.resolve(true);
      flushMicrotasks();
      expect(recordService.getRecordMeta.calls.allArgs()).toEqual([['current']]);
      expect(published).toEqual([{ title: 'Current', oid: 'current' }]);
      expect(component.metadataLoading).toBeFalse();
      expect(evaluate.calls.allArgs().filter(args => args[0].at(-1) === 'template').length).toBe(1);
    })();
  });

  for (const phase of ['matching', 'template', 'fetch'] as const) {
    it(`stops event-bus work destroyed during ${phase}`, async () => {
      const pending = deferred<unknown>();
      const evaluate = jasmine.createSpy('evaluate').and.callFake((key, context) => {
        if (key.at(-1) === 'condition') return phase === 'matching' ? pending.promise : Promise.resolve(true);
        return phase === 'template' ? pending.promise : Promise.resolve(context.event.value);
      });
      const { select, published, component, fixture } = await bindRealBus([selectionExpression], evaluate);
      fakeAsync(() => {
        recordService.getRecordMeta.and.returnValue(pending.promise as Promise<Record<string, unknown>>);
        select('old');
        flushMicrotasks();
        fixture.destroy();
        pending.resolve(phase === 'matching' ? true : phase === 'template' ? 'old' : { title: 'Old' });
        flushMicrotasks();
        expect(recordService.getRecordMeta).toHaveBeenCalledTimes(phase === 'fetch' ? 1 : 0);
        expect(published).toEqual([]);
        expect(component.metadataLoading).toBeFalse();
        expect(component.metadataLoadWarning).toBeFalse();
      })();
    });
  }

  it('lets two matching expressions complete independently even when one publishes while the other is pending', async () => {
    const expressions = ['first', 'second'].map(name => ({
      ...selectionExpression, name, config: { ...selectionExpression.config, template: name },
    } as FormExpressionsConfigFrame));
    const evaluate = jasmine.createSpy('evaluate').and.callFake((key, context) => Promise.resolve(
      key.at(-1) === 'condition' ? context.event.fieldId === '/related' : expressions[key[2]].name
    ));
    const { select, published, component } = await bindRealBus(expressions, evaluate);
    fakeAsync(() => {
      const slow = deferred<Record<string, unknown>>();
      recordService.getRecordMeta.and.callFake(oid => oid === 'first' ? slow.promise : Promise.resolve({ title: oid }));
      select('selected');
      flushMicrotasks();
      expect(component.metadataLoading).toBeTrue();
      expect(published).toEqual([{ title: 'second', oid: 'second' }]);
      slow.reject(new Error('offline'));
      flushMicrotasks();
      expect(component.metadataLoadWarning).toBeTrue();
      recordService.getRecordMeta.calls.reset();
      recordService.getRecordMeta.and.resolveTo({ title: 'Recovered' });
      void component.retryMetadata();
      flushMicrotasks();
      expect(recordService.getRecordMeta.calls.allArgs()).toEqual([['first']]);
      expect(published).toEqual([{ title: 'second', oid: 'second' }, { title: 'Recovered', oid: 'first' }]);
      expect(component.metadataLoadWarning).toBeFalse();
    })();
  });

  it('keeps independent form-ready failures and retries only unresolved original expression/OID contexts', async () => {
    const expressions = ['first', 'second', 'success'].map(name => ({
      name, config: { operation: 'fetchMetadata', runOnFormReady: true, hasTemplate: true, template: name },
    } as FormExpressionsConfigFrame));
    const evaluate = jasmine.createSpy('evaluate').and.callFake(key => Promise.resolve(expressions[key[2]].name));
    const { bus, component, published } = await bindRealBus(expressions, evaluate);
    fakeAsync(() => {
      recordService.getRecordMeta.and.callFake(oid => oid === 'success'
        ? Promise.resolve({ title: oid }) : Promise.reject(new Error('offline')));
      bus.publish({ type: FormComponentEventType.FORM_DEFINITION_READY });
      flushMicrotasks();
      expect(component.metadataLoadWarning).toBeTrue();
      expect(published).toEqual([{ title: 'success', oid: 'success' }]);
      recordService.getRecordMeta.calls.reset();
      recordService.getRecordMeta.and.callFake(oid => oid === 'first'
        ? Promise.resolve({ title: oid }) : Promise.reject(new Error('still offline')));
      void component.retryMetadata();
      flushMicrotasks();
      expect(recordService.getRecordMeta.calls.allArgs()).toEqual([['first'], ['second']]);
      expect(component.metadataLoadWarning).toBeTrue();
      recordService.getRecordMeta.calls.reset();
      recordService.getRecordMeta.and.resolveTo({ title: 'Recovered' });
      void component.retryMetadata();
      flushMicrotasks();
      expect(recordService.getRecordMeta.calls.allArgs()).toEqual([['second']]);
      expect(component.metadataLoadWarning).toBeFalse();
      expect(published).toEqual([
        { title: 'success', oid: 'success' }, { title: 'first', oid: 'first' }, { title: 'Recovered', oid: 'second' },
      ]);
    })();
  });

  it('supersedes an event-bus retry with a newer selection without stale failure or publication', async () => {
    const evaluate = jasmine.createSpy('evaluate').and.callFake((key, context) => Promise.resolve(
      key.at(-1) === 'condition' ? context.event.fieldId === '/related' : context.event.value
    ));
    const { select, component, published } = await bindRealBus([selectionExpression], evaluate);
    fakeAsync(() => {
      recordService.getRecordMeta.and.rejectWith(new Error('offline'));
      select('old');
      flushMicrotasks();
      expect(component.metadataLoadWarning).toBeTrue();
      const retry = deferred<Record<string, unknown>>();
      recordService.getRecordMeta.and.returnValue(retry.promise);
      void component.retryMetadata();
      flushMicrotasks();
      recordService.getRecordMeta.and.resolveTo({ title: 'Current' });
      select('current');
      flushMicrotasks();
      retry.reject(new Error('stale retry'));
      flushMicrotasks();
      expect(published).toEqual([{ title: 'Current', oid: 'current' }]);
      expect(component.metadataLoadWarning).toBeFalse();
      void component.retryMetadata();
      flushMicrotasks();
      expect(recordService.getRecordMeta.calls.allArgs()).toEqual([['old'], ['old'], ['current']]);
    })();
  });

  it('warns without publishing a fallback and retries the original oid successfully', async () => {
    const component = createComponent();
    recordService.getRecordMeta.and.rejectWith(new Error('offline'));
    await component.fetchMetadata(' related-123 ');
    expect(component.metadataLoadWarning).toBeTrue();
    expect(component.metadataLoading).toBeFalse();
    expect(eventBus.publish).not.toHaveBeenCalled();
    recordService.getRecordMeta.and.resolveTo({ title: 'Recovered' });
    await component.retryMetadata();
    expect(recordService.getRecordMeta).toHaveBeenCalledWith('related-123');
    expect(eventBus.publish).toHaveBeenCalledOnceWith(jasmine.objectContaining({ value: { title: 'Recovered', oid: 'related-123' } }));
    expect(component.metadataLoadWarning).toBeFalse();
    expect(component.metadataLoading).toBeFalse();
  });

  it('renders an accessible retry for the previously invisible retriever', async () => {
    const fixture = TestBed.createComponent(RecordMetadataRetrieverComponent);
    const component = fixture.componentInstance;
    recordService.getRecordMeta.and.rejectWith(new Error('offline'));
    await component.fetchMetadata('related');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Existing field values');
    recordService.getRecordMeta.and.resolveTo({ title: 'Recovered' });
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    expect(recordService.getRecordMeta).toHaveBeenCalledWith('related');
  });

  it('does not publish stale metadata or revive a warning after selection changes', async () => {
    const component = createComponent();
    let resolveOld!: (value: Record<string, unknown>) => void;
    recordService.getRecordMeta.and.returnValue(new Promise<Record<string, unknown>>(resolve => { resolveOld = resolve; }));
    const old = component.fetchMetadata('old');
    recordService.getRecordMeta.and.resolveTo({ title: 'Current' });
    await component.fetchMetadata('current');
    resolveOld({ title: 'Stale' });
    await old;
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith(jasmine.objectContaining({ value: { title: 'Current', oid: 'current' } }));
    expect(component.metadataLoadWarning).toBeFalse();
    expect(component.metadataLoading).toBeFalse();
  });

  it('invalidates in-flight reads when selection is cleared or the component is destroyed', async () => {
    const component = createComponent();
    let resolveOld!: (value: Record<string, unknown>) => void;
    recordService.getRecordMeta.and.returnValue(new Promise<Record<string, unknown>>(resolve => { resolveOld = resolve; }));
    const old = component.fetchMetadata('old');
    await component.fetchMetadata('');
    resolveOld({ title: 'Stale' });
    await old;
    expect(eventBus.publish).not.toHaveBeenCalled();
    const destroyed = component.fetchMetadata('other');
    component.ngOnDestroy();
    resolveOld({ title: 'Destroyed' });
    await destroyed;
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('should create component', () => {
    expect(createComponent()).toBeDefined();
  });

  it('should re-emit fetched metadata as field.value.changed and preserve oid', async () => {
    const component = createComponent();
    recordService.getRecordMeta.and.resolveTo({ title: 'Project title' });

    await component.fetchMetadata('oid-123');

    expect(recordService.getRecordMeta).toHaveBeenCalledWith('oid-123');
    expect(eventBus.publish).toHaveBeenCalledWith(
      jasmine.objectContaining({
        type: 'field.value.changed',
        fieldId: '/rdmpGetter',
        sourceId: '/rdmpGetter',
        value: jasmine.objectContaining({
          title: 'Project title',
          oid: 'oid-123',
        }),
      })
    );
  });

  it('should not fetch metadata for empty or repeated oids', async () => {
    const component = createComponent();
    recordService.getRecordMeta.and.resolveTo({ title: 'Project title' });

    await component.fetchMetadata('   ');
    await component.fetchMetadata('oid-123');
    await component.fetchMetadata('oid-123');

    expect(recordService.getRecordMeta).toHaveBeenCalledTimes(1);
  });

  it('should defer form-ready fetch expressions until the form definition ready event', async () => {
    const formReady$ = new Subject<unknown>();
    eventBus.select$.and.callFake((eventType: any) =>
      (eventType === FormComponentEventType.FORM_DEFINITION_READY ? formReady$.asObservable() : EMPTY) as any
    );

    // FormComponent is required for setup of the component.
    const formComponentFixture = TestBed.createComponent(FormComponent);
    ensureApplicationRefFormComponent(formComponentFixture.componentRef);

    const component = createComponent();
    component.formFieldCompMapEntry = {
      ...component.formFieldCompMapEntry,
      expressions: [
        {
          name: 'fetchOnFormReady-rdmpOid',
          config: {
            operation: 'fetchMetadata',
            runOnFormReady: true,
            conditionKind: 'jsonata_query',
            condition: '$exists(runtimeContext.requestParams.rdmpOid)',
            hasTemplate: true,
            template: 'runtimeContext.requestParams.rdmpOid',
          },
        },
      ],
    } as never;

    (component as any).expressionConsumer = jasmine.createSpyObj('expressionConsumer', ['bind', 'destroy']);
    const runFormReadySpy = spyOn<any>(component, 'runFormReadyExpressions').and.resolveTo();

    await (component as any).initEventHandlers();
    expect(runFormReadySpy).not.toHaveBeenCalled();

    formReady$.next({ type: FormComponentEventType.FORM_DEFINITION_READY, timestamp: Date.now() });
    await Promise.resolve();

    expect(runFormReadySpy).toHaveBeenCalledTimes(1);
  });

  it('should invoke fetchMetadata from operation expressions using the evaluated template', async () => {
    const component = createComponent();
    const privateComponent = getPrivateComponent(component);
    const fetchSpy = spyOn(component, 'fetchMetadata').and.resolveTo();
    const expressionConsumer = jasmine.createSpyObj('expressionConsumer', ['destroy', 'evaluateTemplateExpression']);
    expressionConsumer.evaluateTemplateExpression.and.resolveTo('rdmp-001');
    privateComponent.expressionConsumer = expressionConsumer;

    await privateComponent.handleExpression(
      {
        type: 'field.value.changed',
        fieldId: '/rdmp',
        sourceId: '/rdmp',
        value: { redboxOid: 'rdmp-001' },
        timestamp: Date.now(),
      },
      {
        name: 'fetchOnRelatedObjectSelected-rdmp',
        config: {
          operation: 'fetchMetadata',
          hasTemplate: true,
          template: '$exists(event.value.redboxOid) ? event.value.redboxOid : event.value',
        },
      }
    );

    expect(fetchSpy).toHaveBeenCalledWith('rdmp-001', jasmine.any(Object));
  });

  it('should only run form-ready fetch expressions for the form-ready event', async () => {
    const component = createComponent();
    const privateComponent = getPrivateComponent(component);
    const fetchSpy = spyOn(component, 'fetchMetadata').and.resolveTo();
    const expressionConsumer = jasmine.createSpyObj('expressionConsumer', ['destroy', 'evaluateTemplateExpression']);
    expressionConsumer.evaluateTemplateExpression.and.resolveTo('163725301ce411f19d61ef3046509162');
    privateComponent.expressionConsumer = expressionConsumer;

    await privateComponent.handleExpression(
      {
        type: 'field.value.changed',
        fieldId: '/leadInvestigator',
        sourceId: '*',
        value: 'Local Admin',
        timestamp: Date.now(),
      },
      {
        name: 'fetchOnFormReady-rdmpOid',
        config: {
          operation: 'fetchMetadata',
          runOnFormReady: true,
          hasTemplate: true,
          template: 'runtimeContext.requestParams.rdmpOid',
        },
      }
    );

    expect(expressionConsumer.evaluateTemplateExpression).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should ignore other form-definition-ready field events for form-ready fetch expressions', async () => {
    const component = createComponent();
    const privateComponent = getPrivateComponent(component);
    const fetchSpy = spyOn(component, 'fetchMetadata').and.resolveTo();
    const expressionConsumer = jasmine.createSpyObj('expressionConsumer', ['destroy', 'evaluateTemplateExpression']);
    expressionConsumer.evaluateTemplateExpression.and.resolveTo('163725301ce411f19d61ef3046509162');
    privateComponent.expressionConsumer = expressionConsumer;

    await privateComponent.handleExpression(
      {
        type: 'field.value.changed',
        fieldId: '/mainTab/about/datatype',
        sourceId: 'form.definition.ready',
        value: 'dataset',
        timestamp: Date.now(),
      },
      {
        name: 'fetchOnFormReady-rdmpOid',
        config: {
          operation: 'fetchMetadata',
          runOnFormReady: true,
          hasTemplate: true,
          template: 'runtimeContext.requestParams.rdmpOid',
        },
      }
    );

    expect(expressionConsumer.evaluateTemplateExpression).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should ignore descendant field updates for jsonpointer fetch expressions', async () => {
    const component = createComponent();
    const privateComponent = getPrivateComponent(component);
    const fetchSpy = spyOn(component, 'fetchMetadata').and.resolveTo();
    const expressionConsumer = jasmine.createSpyObj('expressionConsumer', ['destroy', 'evaluateTemplateExpression']);
    expressionConsumer.evaluateTemplateExpression.and.resolveTo('child-value');
    privateComponent.expressionConsumer = expressionConsumer;

    await privateComponent.handleExpression(
      {
        type: 'field.value.changed',
        fieldId: '/rdmp/displayLabel',
        sourceId: '*',
        value: 'Local Admin',
        timestamp: Date.now(),
      },
      {
        name: 'fetchOnRelatedObjectSelected-rdmp',
        config: {
          operation: 'fetchMetadata',
          conditionKind: 'jsonpointer',
          runOnFormReady: false,
          condition: '/rdmp::field.value.changed',
          hasTemplate: true,
          template: '$exists(event.value.redboxOid) ? event.value.redboxOid : event.value',
        },
      }
    );

    expect(expressionConsumer.evaluateTemplateExpression).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should log errors and not publish updates when metadata retrieval fails', async () => {
    const component = createComponent();
    recordService.getRecordMeta.and.rejectWith(new Error('boom'));

    await component.fetchMetadata('oid-123');

    expect(loggerService.error).toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
