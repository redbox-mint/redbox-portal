import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  DateInputFormComponentDefinitionFrame,
  FormConfigFrame,
  TypeaheadInputFormComponentDefinitionFrame,
} from '@researchdatabox/sails-ng-common';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { TypeaheadModule } from 'ngx-bootstrap/typeahead';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { FormComponentEventBus, createFormSaveRequestedEvent } from '../form-state';
import { SimpleInputComponent } from './simple-input.component';
import { DateInputComponent } from './date-input.component';
import { TypeaheadInputComponent } from './typeahead-input.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './repeatable.component';

const input = (name: string, layout: 'DefaultLayout' | 'InlineLayout') => ({
  name,
  component: { class: 'SimpleInputComponent' as const },
  model: { class: 'SimpleInputModel' as const, config: { validators: [{ class: 'required' as const }] } },
  layout: { class: layout, config: { label: name } },
});

describe('Inline validation visibility', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        SimpleInputComponent,
        DateInputComponent,
        TypeaheadInputComponent,
        RepeatableComponent,
        RepeatableElementLayoutComponent,
      },
      imports: { BsDatepickerModule: BsDatepickerModule, TypeaheadModule: TypeaheadModule, NoopAnimationsModule },
    });
  });

  type FeedbackInput = DateInputFormComponentDefinitionFrame | TypeaheadInputFormComponentDefinitionFrame;
  const customInputs: { label: string; field: FeedbackInput }[] = [
    {
      label: 'timestamp date',
      field: {
        name: '',
        component: { class: 'DateInputComponent' },
        model: { class: 'DateInputModel', config: { value: null, validators: [{ class: 'required' }] } },
      },
    },
    {
      label: 'calendar date',
      field: {
        name: '',
        component: { class: 'DateInputComponent' },
        model: {
          class: 'DateInputModel',
          config: { dateOnly: true, value: null, validators: [{ class: 'required' }] },
        },
      },
    },
    {
      label: 'typeahead',
      field: {
        name: '',
        component: {
          class: 'TypeaheadInputComponent',
          config: {
            sourceType: 'static',
            staticOptions: [{ label: 'Known person', value: 'known' }],
            requireSelection: true,
          },
        },
        model: { class: 'TypeaheadInputModel', config: { value: null, validators: [{ class: 'required' }] } },
      },
    },
  ];

  for (const { label, field } of customInputs) {
    for (const action of ['blur', 'save'] as const) {
      it(`${label} reveals ${action === 'blur' ? 'only the blurred field' : 'untouched fields on save'} in messages and borders`, async () => {
        const { fixture, formComponent } = await createFormAndWaitForReady(
          {
            name: 'custom-input-errors',
            componentDefinitions: ['target', 'sibling'].map<FeedbackInput>(name => ({
              ...structuredClone(field),
              name,
              layout: { class: 'DefaultLayout', config: { label: name } },
            })),
          },
          { oid: '', editMode: true }
        );
        const element: HTMLElement = fixture.nativeElement;
        const inputs = element.querySelectorAll<HTMLInputElement>('input');
        const target = formComponent.form!.get('target')!;
        const sibling = formComponent.form!.get('sibling')!;
        expect(inputs.length).toBe(2);
        expect(target.invalid).toBeTrue();
        expect(sibling.invalid).toBeTrue();
        expect(target.untouched && sibling.untouched).toBeTrue();
        expect(element.querySelector('.rb-form-field-error-summary, .is-invalid')).toBeNull();

        if (action === 'blur') {
          inputs[0].dispatchEvent(new Event('blur'));
        } else {
          spyOn(formComponent, 'saveForm').and.resolveTo();
          TestBed.inject(FormComponentEventBus).publish(
            createFormSaveRequestedEvent({ formScopeId: formComponent.eventScopeId })
          );
        }
        await fixture.whenStable();
        fixture.detectChanges();

        expect(target.touched).toBe(action === 'blur');
        expect(sibling.untouched).toBeTrue();
        expect(element.querySelectorAll('.rb-form-field-error-summary').length).toBe(action === 'blur' ? 1 : 2);
        expect(inputs[0].classList.contains('is-invalid')).toBeTrue();
        expect(inputs[1].classList.contains('is-invalid')).toBe(action === 'save');
        expect(target.invalid && sibling.invalid).toBeTrue();
      });
    }
  }

  for (const layout of ['DefaultLayout', 'InlineLayout'] as const) {
    it(`${layout} waits for each field to be touched and keeps validation active`, async () => {
      const { fixture, formComponent } = await createFormAndWaitForReady(
        { name: 'inline-errors', componentDefinitions: [input('project', layout), input('ci', layout)] },
        { oid: '', editMode: true }
      );
      const element: HTMLElement = fixture.nativeElement;
      const controls = element.querySelectorAll<HTMLInputElement>('input');
      const project = formComponent.form!.get('project')!;
      expect(formComponent.form!.invalid).toBeTrue();
      expect(element.querySelector('.rb-form-field-error-summary, .is-invalid')).toBeNull();
      // An edit without blur is dirty, but is not a touch.
      controls[0].value = '';
      controls[0].dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(project.dirty).toBeTrue();
      expect(project.touched).toBeFalse();
      expect(element.querySelector('.rb-form-field-error-summary, .is-invalid')).toBeNull();
      controls[0].dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(project.touched).toBeTrue();
      expect(element.querySelectorAll('.rb-form-field-error-summary').length).toBe(1);
      expect(controls[0].classList.contains('is-invalid')).toBeTrue();
      expect(controls[1].classList.contains('is-invalid')).toBeFalse();
      controls[0].value = 'Project';
      controls[0].dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(element.querySelector('.rb-form-field-error-summary, .is-invalid')).toBeNull();
      expect(formComponent.form!.invalid).toBeTrue(); // CI still missing.
    });

    it(`${layout} reveals untouched errors on a save request for this form only`, async () => {
      const { fixture, formComponent } = await createFormAndWaitForReady(
        { name: 'save-errors', componentDefinitions: [input('project', layout), input('ci', layout)] },
        { oid: '', editMode: true }
      );
      // Isolate display handling from the adapter that promotes requests to save commands.
      spyOn(formComponent, 'saveForm').and.resolveTo();
      const bus = TestBed.inject(FormComponentEventBus);
      bus.publish(createFormSaveRequestedEvent({ formScopeId: 'another-form' }));
      fixture.detectChanges();
      expect(formComponent.saveAttempted()).toBeFalse();
      expect(fixture.nativeElement.querySelector('.rb-form-field-error-summary')).toBeNull();
      bus.publish(createFormSaveRequestedEvent({ formScopeId: formComponent.eventScopeId }));
      fixture.detectChanges();
      expect(formComponent.saveAttempted()).toBeTrue();
      expect(formComponent.form!.untouched).toBeTrue();
      expect(fixture.nativeElement.querySelectorAll('.rb-form-field-error-summary').length).toBe(2);
      expect(fixture.nativeElement.querySelectorAll('.is-invalid').length).toBe(2);
      formComponent.form!.markAsPristine();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.rb-form-field-error-summary').length).toBe(2);
      formComponent.editMode.set(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.rb-form-field-error-summary')).toBeNull();
    });
  }

  it('reveals errors when saveForm is called directly', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(
      { name: 'direct-save', componentDefinitions: [input('project', 'DefaultLayout')] },
      { oid: '', editMode: true }
    );
    await formComponent.saveForm({ force: true });
    fixture.detectChanges();
    expect(formComponent.saveAttempted()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.rb-form-field-error-summary')).not.toBeNull();
  });

  it('resets save-attempt feedback when the host loads another record', async () => {
    const config: FormConfigFrame = {
      name: 'reloaded-errors',
      componentDefinitions: [input('project', 'DefaultLayout')],
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(config, { oid: '', editMode: true });
    await formComponent.saveForm({ force: true });
    expect(formComponent.saveAttempted()).toBeTrue();
    formComponent.oid.set('another-record');
    await formComponent.downloadAndCreateFormComponents(config);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(formComponent.saveAttempted()).toBeFalse();
    expect(formComponent.form!.invalid).toBeTrue();
    expect(fixture.nativeElement.querySelector('.rb-form-field-error-summary, .is-invalid')).toBeNull();
  });

  it('applies the rule to repeatable rows, including rows added after a save attempt', async () => {
    const config: FormConfigFrame = {
      name: 'repeatable-errors',
      componentDefinitions: [
        {
          name: 'people',
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: { ...input('', 'DefaultLayout'), layout: { class: 'RepeatableElementLayout' } },
            },
          },
          model: { class: 'RepeatableModel', config: { defaultValue: [''] } },
        },
      ],
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(config, { oid: '', editMode: true });
    expect(fixture.nativeElement.querySelector('.rb-form-field-error-summary, .is-invalid')).toBeNull();
    TestBed.inject(FormComponentEventBus).publish(
      createFormSaveRequestedEvent({ formScopeId: formComponent.eventScopeId })
    );
    fixture.detectChanges();
    const before = fixture.nativeElement.querySelectorAll('.rb-form-field-error-summary').length;
    expect(before).toBeGreaterThan(0);
    await (formComponent.componentDefArr[0].component as RepeatableComponent).appendNewElement();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.rb-form-field-error-summary').length).toBeGreaterThan(before);
  });
});
