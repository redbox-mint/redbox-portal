import { TestBed } from '@angular/core/testing';
import { DynamicScriptResponse, FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { FormComponent } from '../../form.component';
import { createFormAndWaitForReady, createTestbedModule } from '../../helpers.spec';
import { SimpleInputComponent } from '../../component/simple-input.component';
import { FormComponentValueChangeEventConsumer } from './form-component-change-event-consumer';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { FieldValueChangedEvent } from './form-component-event.types';

class ContextConsumer extends FormComponentValueChangeEventConsumer {
  module?: DynamicScriptResponse;
  protected override getCompiledItems(): Promise<DynamicScriptResponse | undefined> {
    return Promise.resolve(this.module);
  }
  evaluate(form: FormComponent, additionalData: object): Promise<unknown> {
    const expression: FormExpressionsConfigFrame = { name: 'context', config: { target: 'model.value', hasTemplate: true, template: 'value' } };
    this.formComponent = form;
    this.expressions = [expression];
    this.options = { definition: { ...form.componentDefArr[0], expressions: this.expressions } };
    const event: FieldValueChangedEvent = { type: 'field.value.changed', sourceId: '*', fieldId: 'title', value: 'Original', timestamp: 1 };
    return this.evaluateExpressionJSONata(expression, event, 'template', additionalData);
  }
}

describe('Expression context authority', () => {
  beforeEach(async () => createTestbedModule({ declarations: { SimpleInputComponent } }));

  it('keeps additionalData from supplying absent authority or replacing current request parameters', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({ name: 'context', componentDefinitions: [
      { name: 'title', model: { class: 'SimpleInputModel' }, component: { class: 'SimpleInputComponent' } },
    ] }, { oid: 'actual-oid' });
    formComponent.refreshRequestParamsFromUrl('http://localhost/?source=actual');
    const consumer = TestBed.runInInjectionContext(() => new ContextConsumer(TestBed.inject(FormComponentEventBus)));
    let evaluated: unknown;
    consumer.module = { evaluate: (_key, context) => { evaluated = context; return true; } };
    await consumer.evaluate(formComponent, {
      runtimeContext: { user: { roles: ['Admin'] }, record: { type: 'spoofed', hasEditAccess: true }, oid: 'spoofed' },
      requestParams: { source: 'spoofed' },
    });
    expect(evaluated).toEqual(jasmine.objectContaining({
      runtimeContext: { oid: 'actual-oid', requestParams: { source: 'actual' } },
      requestParams: { source: 'actual' },
    }));
    consumer.destroy();
    fixture.destroy();
  });
  it('uses current server authority over stale query context and isolates each evaluation', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({ name: 'context', componentDefinitions: [
      { name: 'title', model: { class: 'SimpleInputModel' }, component: { class: 'SimpleInputComponent' } },
    ] }, { oid: 'actual-oid' });
    const authority = { user: { roles: ['Researcher'] }, record: { type: 'rdmp', hasEditAccess: false } };
    formComponent.formDefMap!.formConfigMeta = { runtimeContext: authority };
    const consumer = TestBed.runInInjectionContext(() => new ContextConsumer(TestBed.inject(FormComponentEventBus)));
    consumer.module = { evaluate: (_key, context) => {
      const runtime = (context as { runtimeContext: typeof authority & { oid: string; requestParams: object } }).runtimeContext;
      expect(runtime).toEqual({ ...authority, oid: 'actual-oid', requestParams: {} });
      runtime.user.roles.push('Admin');
      runtime.record.hasEditAccess = true;
      return true;
    } };
    await consumer.evaluate(formComponent, { runtimeContext: { user: { roles: ['Admin'] }, record: { type: 'spoofed', hasEditAccess: true }, oid: 'old-oid' } });
    expect(authority).toEqual({ user: { roles: ['Researcher'] }, record: { type: 'rdmp', hasEditAccess: false } });
    consumer.destroy();
    fixture.destroy();
  });

});
