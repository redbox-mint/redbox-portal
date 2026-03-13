import { TestBed } from '@angular/core/testing';
import { EMPTY, Subject } from 'rxjs';
import { RecordMetadataRetrieverComponent } from './record-metadata-retriever.component';
import { createTestbedModule } from '../helpers.spec';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { FormComponentEventType } from '../form-state/events/form-component-event.types';
import { RecordService, LoggerService } from '@researchdatabox/portal-ng-common';

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
      evaluateExpressionJSONata: (
        expression: unknown,
        event: unknown,
        propertyName: string
      ) => Promise<unknown>;
    }>;
  } {
    return component as unknown as {
      handleExpression: (event: unknown, expression: unknown) => Promise<void>;
      expressionConsumer?: jasmine.SpyObj<{
        destroy: () => void;
        evaluateExpressionJSONata: (
          expression: unknown,
          event: unknown,
          propertyName: string
        ) => Promise<unknown>;
      }>;
    };
  }

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
    spyOn(component as any, 'getFormComponentFromAppRef').and.returnValue({ instance: {} });
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
    const expressionConsumer = jasmine.createSpyObj('expressionConsumer', ['destroy', 'evaluateExpressionJSONata']);
    expressionConsumer.evaluateExpressionJSONata.and.resolveTo('rdmp-001');
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

    expect(fetchSpy).toHaveBeenCalledWith('rdmp-001');
  });

  it('should only run form-ready fetch expressions for the form-ready event', async () => {
    const component = createComponent();
    const privateComponent = getPrivateComponent(component);
    const fetchSpy = spyOn(component, 'fetchMetadata').and.resolveTo();
    const expressionConsumer = jasmine.createSpyObj('expressionConsumer', ['destroy', 'evaluateExpressionJSONata']);
    expressionConsumer.evaluateExpressionJSONata.and.resolveTo('163725301ce411f19d61ef3046509162');
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

    expect(expressionConsumer.evaluateExpressionJSONata).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should ignore other form-definition-ready field events for form-ready fetch expressions', async () => {
    const component = createComponent();
    const privateComponent = getPrivateComponent(component);
    const fetchSpy = spyOn(component, 'fetchMetadata').and.resolveTo();
    const expressionConsumer = jasmine.createSpyObj('expressionConsumer', ['destroy', 'evaluateExpressionJSONata']);
    expressionConsumer.evaluateExpressionJSONata.and.resolveTo('163725301ce411f19d61ef3046509162');
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

    expect(expressionConsumer.evaluateExpressionJSONata).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should ignore descendant field updates for jsonpointer fetch expressions', async () => {
    const component = createComponent();
    const privateComponent = getPrivateComponent(component);
    const fetchSpy = spyOn(component, 'fetchMetadata').and.resolveTo();
    const expressionConsumer = jasmine.createSpyObj('expressionConsumer', ['destroy', 'evaluateExpressionJSONata']);
    expressionConsumer.evaluateExpressionJSONata.and.resolveTo('child-value');
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

    expect(expressionConsumer.evaluateExpressionJSONata).not.toHaveBeenCalled();
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
