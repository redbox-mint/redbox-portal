import { TestBed } from '@angular/core/testing';
import { RecordService } from '@researchdatabox/portal-ng-common';
import { FormBehaviourActionConfig, FormBehaviourConfigFrame, FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { SimpleInputComponent } from '../../component/simple-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../../helpers.spec';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import { createFieldValueChangedEvent } from '../events/form-component-event.types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function config(value: string, behaviour?: FormBehaviourConfigFrame): FormConfigFrame {
  return { name: value, behaviours: behaviour ? [behaviour] : [], componentDefinitions: [
    { name: 'source', model: { class: 'SimpleInputModel' }, component: { class: 'SimpleInputComponent' } },
    { name: 'title', model: { class: 'SimpleInputModel', config: { value } }, component: { class: 'SimpleInputComponent' } },
  ] };
}

const setTitle: FormBehaviourActionConfig = { type: 'setValue', config: { fieldPath: '/title' } };
const emitObsolete: FormBehaviourActionConfig = { type: 'emitEvent', config: {
  eventType: 'field.value.changed', fieldId: '/obsolete', sourceId: '*',
} };
const behaviour = (overrides: Partial<FormBehaviourConfigFrame> = {}): FormBehaviourConfigFrame => ({
  name: 'related-record', condition: '/source::field.value.changed', conditionKind: 'jsonpointer', runOnFormReady: false,
  actions: [setTitle, emitObsolete], onError: [setTitle, emitObsolete], ...overrides,
});
function trigger(eventBus: FormComponentEventBus) {
  eventBus.publish(createFieldValueChangedEvent({ fieldId: '/source', sourceId: '*', value: 'related-old' }));
}

describe('Behaviour lifecycle across record reloads', () => {
  beforeEach(async () => createTestbedModule({ declarations: { SimpleInputComponent } }));

  for (const outcome of ['success', 'failure']) {
    for (const lifecycle of ['reload', 'destroy']) {
      it(`discards metadata ${outcome} after ${lifecycle} and leaves replacement handlers usable`, async () => {
        const lookup = deferred<object>();
        const started = deferred<void>();
        const metadata = spyOn(TestBed.inject(RecordService), 'getRecordMeta').and.callFake(() => {
          started.resolve();
          return lookup.promise;
        });
        const lookupBehaviour = behaviour({ processors: [{ type: 'fetchMetadata' }] });
        const { fixture, formComponent } = await createFormAndWaitForReady(config('Older', lookupBehaviour), { oid: 'older-oid' }, undefined, { entries: [{
          urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/', callable: () => false,
        }] });
        const eventBus = TestBed.inject(FormComponentEventBus);
        const obsoleteEvents: unknown[] = [];
        const subscription = eventBus.select$('field.value.changed').subscribe(event => {
          if (event.fieldId === '/obsolete') obsoleteEvents.push(event.value);
        });
        trigger(eventBus);
        await started.promise;
        if (lifecycle === 'reload') {
          formComponent.oid.set('newer-oid');
          await formComponent.downloadAndCreateFormComponents(config('Newer', lookupBehaviour));
        } else {
          fixture.destroy();
        }
        const title = formComponent.form!.get('title')!;
        if (outcome === 'success') lookup.resolve({ title: 'Stale metadata' });
        else lookup.reject(new Error('Old metadata failed'));
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        await fixture.whenStable();
        expect(title.value).toBe(lifecycle === 'reload' ? 'Newer' : 'Older');
        expect(title.dirty).toBeFalse();
        expect(obsoleteEvents).toEqual([]);
        if (lifecycle === 'reload') {
          metadata.and.resolveTo({ title: 'Current metadata' });
          trigger(eventBus);
          await new Promise<void>(resolve => setTimeout(resolve, 0));
          await fixture.whenStable();
          expect(title.value).toEqual({ title: 'Current metadata', oid: 'related-old' });
          expect(obsoleteEvents.length).toBe(1);
          fixture.destroy();
        }
        subscription.unsubscribe();
      });
    }
  }

  const stages: { name: string; setup: Partial<FormBehaviourConfigFrame>; result: unknown }[] = [
    { name: 'condition', setup: { condition: 'compiled condition', conditionKind: 'jsonata' }, result: true },
    { name: 'processor', setup: { processors: [{ type: 'jsonataTransform', config: { hasTemplate: true } }] }, result: 'Stale processor' },
    { name: 'field path', setup: { actions: [{ type: 'setValue', config: { fieldPath: 'compiled path', fieldPathKind: 'jsonata', hasFieldPathTemplate: true } }, emitObsolete] }, result: '/title' },
    { name: 'value template', setup: { actions: [{ type: 'setValue', config: { fieldPath: '/title', hasValueTemplate: true } }, emitObsolete] }, result: 'Stale value' },
    { name: 'event template', setup: { actions: [{ ...emitObsolete, config: { ...emitObsolete.config, hasValueTemplate: true } }] }, result: 'Stale event' },
    { name: 'instruction template', setup: { actions: [{ type: 'runTemplate', config: { hasTemplate: true, applyResults: true } }, emitObsolete] }, result: [
      { fieldPath: '/title', value: 'Stale instruction' }, { target: 'form.enabledValidationGroups', value: { groups: { include: ['stale'] } } },
    ] },
    { name: 'UI template', setup: { actions: [{ type: 'setUIProperty', config: { fieldPath: '/title', target: 'field.disabled', hasValueTemplate: true } }, emitObsolete] }, result: true },
  ];
  for (const stage of stages) {
    it(`discards a delayed ${stage.name} after the next record loads`, async () => {
      const pending = deferred<unknown>();
      const started = deferred<void>();
      const { fixture, formComponent } = await createFormAndWaitForReady(config('Older', behaviour(stage.setup)), { oid: 'older-oid' }, undefined, { entries: [{
        urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/',
        callable: (_key, _path, context) => {
          if (context.event?.sourceId !== '*') return false;
          started.resolve();
          return pending.promise;
        },
      }] });
      const eventBus = TestBed.inject(FormComponentEventBus);
      const staleEvents: unknown[] = [];
      const subscription = eventBus.selectAll$().subscribe(event => {
        if (event.type === 'form.validation.change.request' || ('fieldId' in event && event.fieldId === '/obsolete')) staleEvents.push(event);
      });
      trigger(eventBus);
      await started.promise;
      formComponent.oid.set('newer-oid');
      await formComponent.downloadAndCreateFormComponents(config('Newer'));
      pending.resolve(stage.result);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(formComponent.form!.get('title')!.value).toBe('Newer');
      expect(formComponent.form!.get('title')!.dirty).toBeFalse();
      expect(formComponent.form!.get('title')!.disabled).toBeFalse();
      expect(staleEvents).toEqual([]);
      subscription.unsubscribe();
      fixture.destroy();
    });
  }
});
