import { GroupFieldComponent } from '../../component/group.component';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { FormConfigFrame, FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { LoggerService, RecordService } from '@researchdatabox/portal-ng-common';
import { SimpleInputComponent } from '../../component/simple-input.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from '../../component/repeatable.component';
import { createFormAndWaitForReady, createTestbedModule } from '../../helpers.spec';
import { FormComponentValueChangeEventConsumer } from '../events/form-component-change-event-consumer';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import { createFieldValueChangedEvent } from '../events/form-component-event.types';
import { BehaviourHandler } from '../behaviours/behaviour-handler';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const expression: FormExpressionsConfigFrame = { name: 'populate', config: {
  conditionKind: 'jsonpointer', condition: '/source::field.value.changed', runOnFormReady: false,
  target: 'model.value', hasTemplate: true, template: 'value',
} };

function config(rowExpression = false): FormConfigFrame {
  return { name: 'readiness-lifecycle', relatedRecords: { displayTargets: [], relations: [], sources: [{
    relationId: 'activities', componentPointer: '/source', referenceTokens: ['selection'],
  }] }, componentDefinitions: [{ name: 'titles', component: { class: 'RepeatableComponent', config: {
    allowZeroRows: true, elementTemplate: rowExpression
      ? { name: '', component: { class: 'GroupComponent', config: { componentDefinitions: [
          { name: 'title', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' }, expressions: [expression] },
        ] } }, model: { class: 'GroupModel' } }
      : { name: '', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' } },
  } }, model: { class: 'RepeatableModel', config: { value: rowExpression ? [{ title: 'Original' }] : ['Original'] } } }] };
}

class DelayedMatchingConsumer extends FormComponentValueChangeEventConsumer {
  readonly matching = deferred<FormExpressionsConfigFrame[]>();
  protected override getMatchedExpressions() { return this.matching.promise; }
}

describe('Related readiness work ownership', () => {
  beforeEach(async () => createTestbedModule({ declarations: {
    GroupFieldComponent, SimpleInputComponent, RepeatableComponent, RepeatableElementLayoutComponent,
  } }));

  function create(rowExpression = false, evaluate?: () => unknown) {
    let result!: Awaited<ReturnType<typeof createFormAndWaitForReady>>;
    void createFormAndWaitForReady(config(rowExpression), undefined, undefined, { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/',
      callable: () => evaluate?.() ?? false,
    }] }).then(value => { result = value; });
    flushMicrotasks(); tick();
    result.formComponent.relatedDataState.result('/source', false, { status: 'empty', records: [], issues: [] });
    return result;
  }

  function publish() {
    TestBed.inject(FormComponentEventBus).publish(createFieldValueChangedEvent({
      fieldId: '/source', sourceId: '/source', value: ['Current title'],
    }));
  }

  for (const destroy of [false, true]) {
    it(`${destroy ? 'releases destroyed behaviour target work' : 'waits for a real behaviour and delayed repeatable setter'}`, fakeAsync(() => {
      const { fixture, formComponent } = create();
      const gate = deferred<void>();
      const titles = formComponent.form!.get('titles') as any;
      const original = titles.setCustomValue.bind(titles);
      const setter = spyOn(titles, 'setCustomValue').and.callFake(async (value: unknown, options: unknown) => {
        await gate.promise;
        await original(value, options);
      });
      const handler = new BehaviourHandler({ name: 'populate', conditionKind: 'jsonpointer',
        condition: '/source::field.value.changed', actions: [
          { type: 'setUIProperty', config: { fieldPath: '/titles', target: 'model.value' } },
          { type: 'setUIProperty', config: { fieldPath: '/titles', target: 'field.disabled', value: true } },
        ] }, 0, { formComponent, eventBus: TestBed.inject(FormComponentEventBus),
        logger: TestBed.inject(LoggerService), recordService: TestBed.inject(RecordService) });
      handler.activate();
      publish();
      expect(formComponent.relatedState).toBe('pending');
      flushMicrotasks();
      expect(setter).toHaveBeenCalled();
      expect(formComponent.relatedState).toBe('pending');
      if (destroy) {
        handler.destroy();
        expect(formComponent.relatedState).toBe('ready');
      }
      gate.resolve(); flushMicrotasks(); tick();
      expect(formComponent.relatedState).toBe('ready');
      expect(titles.value).toEqual(['Current title']);
      expect(titles.disabled).toBe(!destroy);
      handler.destroy(); fixture.destroy();
    }));
  }

  it('accounts for replaced debounced events and releases them on destroy', fakeAsync(() => {
    const { fixture, formComponent } = create();
    const handler = new BehaviourHandler({ name: 'debounced', debounceMs: 50,
      condition: '/source::field.value.changed', actions: [
        { type: 'setUIProperty', config: { fieldPath: '/titles', target: 'field.disabled', value: true } },
      ],
    }, 0, { formComponent, eventBus: TestBed.inject(FormComponentEventBus),
      logger: TestBed.inject(LoggerService), recordService: TestBed.inject(RecordService) });
    handler.activate();
    publish(); tick(20); publish(); tick(49);
    expect(formComponent.relatedState).toBe('pending');
    expect(formComponent.form!.get('titles')!.disabled).toBeFalse();
    handler.destroy();
    expect(formComponent.relatedState).toBe('ready');
    tick(50); flushMicrotasks();
    expect(formComponent.form!.get('titles')!.disabled).toBeFalse();
    fixture.destroy();
  }));

  it('cancels a destroyed behaviour while awaiting its condition and ignores its late target', fakeAsync(() => {
    const gate = deferred<boolean>();
    const { fixture, formComponent } = create(false, () => gate.promise);
    const handler = new BehaviourHandler({ name: 'condition', conditionKind: 'jsonata', condition: 'true',
      actions: [{ type: 'setUIProperty', config: { fieldPath: '/titles', target: 'field.disabled', value: true } }],
    }, 0, { formComponent, eventBus: TestBed.inject(FormComponentEventBus),
      logger: TestBed.inject(LoggerService), recordService: TestBed.inject(RecordService) });
    handler.activate();
    TestBed.inject(FormComponentEventBus).publish(createFieldValueChangedEvent({ fieldId: '/source', sourceId: '*', value: [] }));
    flushMicrotasks();
    expect(formComponent.relatedState).toBe('pending');
    handler.destroy();
    expect(formComponent.relatedState).toBe('ready');
    gate.resolve(true); flushMicrotasks();
    expect(formComponent.form!.get('titles')!.disabled).toBeFalse();
    expect(formComponent.relatedState).toBe('ready');
    fixture.destroy();
  }));

  it('releases destroyed expression matching and prevents its late write after rebind', fakeAsync(() => {
    const { fixture, formComponent } = create();
    const consumer = TestBed.runInInjectionContext(() => new DelayedMatchingConsumer(TestBed.inject(FormComponentEventBus)));
    consumer.formComponent = formComponent;
    const entry = formComponent.componentDefArr[0];
    consumer.bind({ definition: { ...entry, expressions: [expression] }, component: entry.component });
    publish(); flushMicrotasks();
    expect(formComponent.relatedState).toBe('pending');
    consumer.destroy();
    expect(formComponent.relatedState).toBe('ready');
    consumer.bind({ definition: { ...entry, expressions: [expression] }, component: entry.component });
    consumer.matching.resolve([expression]); flushMicrotasks();
    expect(formComponent.form!.get('titles')!.value).toEqual(['Original']);
    expect(formComponent.relatedState).toBe('ready');
    consumer.destroy(); fixture.destroy();
  }));

  it('releases a removed repeatable row awaiting population and never writes its detached control', fakeAsync(() => {
    const gate = deferred<string>();
    const { fixture, formComponent } = create(true, () => gate.promise);
    const repeatable = formComponent.componentDefArr[0].component as RepeatableComponent;
    const row = (repeatable as any).compDefMapEntries[0];
    const control = row.defEntry.model.formControl.get('title');
    publish(); flushMicrotasks();
    expect(formComponent.relatedState).toBe('pending');
    repeatable.removeElementFn(row)(); flushMicrotasks();
    expect(formComponent.relatedState).toBe('ready');
    gate.resolve('Obsolete'); flushMicrotasks(); tick();
    expect(control.value).toBe('Original');
    expect(formComponent.form!.get('titles')!.value).toEqual([]);
    expect(formComponent.relatedState).toBe('ready');
    fixture.destroy();
  }));
});
