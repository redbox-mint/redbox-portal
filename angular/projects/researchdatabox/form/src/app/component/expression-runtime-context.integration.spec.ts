import { TestBed } from '@angular/core/testing';
import { FormConfigFrame, jsonataCompile } from '@researchdatabox/sails-ng-common';
import { FormService } from '../form.service';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { SimpleInputComponent } from './simple-input.component';

// The role/status template is the SCU submitted-record field lock. The source
// pointer is local to this minimal fixture; lifecycle matching is unchanged.
const template = '($not(("Admin" in runtimeContext.user.roles or "Librarians" in runtimeContext.user.roles)) and formData.scu_rdmp_editable_status = "view")';

describe('Expression runtime context integration', () => {
  beforeEach(async () => {
    await createTestbedModule({ declarations: { SimpleInputComponent } });
  });

  for (const roles of [[], ['Researcher'], ['Admin'], ['Librarians']]) {
    it(`uses server roles ${JSON.stringify(roles)} for initial and later field expressions`, async () => {
      const authority = { user: { roles }, record: { type: 'rdmp', hasEditAccess: true } };
      const service = TestBed.inject(FormService);
      const createMap = service.createFormComponentsMap.bind(service);
      spyOn(service, 'createFormComponentsMap').and.callFake((config, paths, meta, mode, concurrency) =>
        createMap(config, paths, { ...meta, runtimeContext: authority }, mode, concurrency));
      const config: FormConfigFrame = { name: 'runtime-context', componentDefinitions: [
        { name: 'scu_rdmp_editable_status', model: { class: 'SimpleInputModel', config: { value: 'view' } }, component: { class: 'SimpleInputComponent', config: { type: 'hidden' } } },
        { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Loaded title' } }, component: { class: 'SimpleInputComponent' }, expressions: [{ name: 'role-lock', config: {
          conditionKind: 'jsonpointer', condition: '/scu_rdmp_editable_status::field.value.changed', target: 'field.disabled', hasTemplate: true, template, runOnFormReady: true,
        } }] },
      ] };
      const contexts: unknown[] = [];
      const { fixture, formComponent } = await createFormAndWaitForReady(config, {
        oid: 'current-oid', recordType: 'rdmp', editMode: true, formName: 'runtime-context', downloadAndCreateOnInit: false,
      }, undefined, { entries: [{
        urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/current-oid',
        callable: (_keyString, _key, context) => {
          contexts.push(structuredClone(context.runtimeContext));
          return jsonataCompile(template).evaluate(context);
        },
      }] });
      // Drain asynchronous compiled-expression evaluation before inspecting the DOM.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      await fixture.whenStable();
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
      const initiallyLocked = !roles.some(role => ['Admin', 'Librarians'].includes(role));
      expect(input.disabled).toBe(initiallyLocked);
      expect(contexts.length).toBeGreaterThan(0);
      expect(contexts[0]).toEqual({ ...authority, oid: 'current-oid', requestParams: {} });

      formComponent.form!.get('scu_rdmp_editable_status')!.setValue('edit');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(input.disabled).toBeFalse();
      const afterEditCount = contexts.length;
      formComponent.form!.get('scu_rdmp_editable_status')!.setValue('view');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(input.disabled).toBe(initiallyLocked);
      expect(contexts.length).toBeGreaterThan(afterEditCount);
      expect(contexts.every(context => JSON.stringify(context) === JSON.stringify(contexts[0]))).toBeTrue();
      expect(formComponent.form!.get('title')!.value).toBe('Loaded title');
    });
  }
});
