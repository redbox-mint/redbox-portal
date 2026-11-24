import { TestBed } from '@angular/core/testing';
import {
  CheckboxWithDetailsFormComponentDefinitionFrame,
  CheckboxWithDetailsRow,
  FormConfigFrame,
  TypeaheadOption,
} from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { createFormValidationGroupsChangeRequestEvent, FormComponentEventBus } from '../form-state';
import { TypeaheadDataService } from '../service/typeahead-data.service';
import { CheckboxDetailFieldDirective, CheckboxWithDetailsComponent } from './checkbox-with-details.component';
import { SimpleInputComponent } from './simple-input.component';
import { TextAreaComponent } from './text-area.component';
import { ValidationSummaryFieldComponent } from './validation-summary.component';

function field(
  name = 'formats',
  value: CheckboxWithDetailsRow[] = []
): CheckboxWithDetailsFormComponentDefinitionFrame {
  return {
    name,
    layout: { class: 'DefaultLayout', config: { label: name } },
    model: { class: 'CheckboxWithDetailsModel', config: { value } },
    component: {
      class: 'CheckboxWithDetailsComponent',
      config: {
        options: [
          { label: 'Tables', value: 'tabulated' },
          { label: 'Images', value: 'img' },
          { label: 'Other', value: 'other./~' },
        ],
        detailFields: [
          {
            name: 'volume',
            layout: { class: 'DefaultLayout', config: { label: 'Volume' } },
            model: { class: 'SimpleInputModel', config: { validators: [{ class: 'required' }] } },
            component: { class: 'SimpleInputComponent' },
          },
        ],
        detailFieldsByValue: {
          'other./~': [
            {
              name: 'description',
              layout: { class: 'DefaultLayout', config: { label: 'Describe' } },
              model: { class: 'TextAreaModel', config: { validators: [{ class: 'required' }] } },
              component: { class: 'TextAreaComponent' },
            },
          ],
        },
      },
    },
  };
}

function config(fields: FormConfigFrame['componentDefinitions']): FormConfigFrame {
  return {
    name: 'checkbox-details',
    type: 'rdmp',
    enabledValidationGroups: ['none'],
    validationGroups: {
      none: { description: 'No validation', initialMembership: 'none' },
      all: { description: 'All validators', initialMembership: 'all' },
    },
    componentDefinitions: [...fields, { name: 'summary', component: { class: 'ValidationSummaryComponent' } }],
  };
}

describe('CheckboxWithDetailsComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        CheckboxWithDetailsComponent,
        CheckboxDetailFieldDirective,
        SimpleInputComponent,
        TextAreaComponent,
        ValidationSummaryFieldComponent,
      },
    });
  });

  it('uses separate controls per code, preserves undo, and removes deselected rows from validation', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(config([field(), field('additional')]), {
      editMode: true,
    });
    const root: HTMLElement = fixture.nativeElement;
    const first = root.querySelector('redbox-checkbox-with-details')!;
    const checkboxes = Array.from(first.querySelectorAll<HTMLInputElement>('input[type=checkbox]'));
    const check = async (index: number) => {
      checkboxes[index].click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const form = formComponent.form!;

    checkboxes[0].focus();
    await check(0);
    expect(document.activeElement).toBe(checkboxes[0]);
    await check(1);
    await check(2);
    const inputs = Array.from(first.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'));
    expect(inputs.map(input => (input.tagName === 'TEXTAREA' ? 'textarea' : input.type))).toEqual([
      'checkbox',
      'text',
      'checkbox',
      'text',
      'checkbox',
      'text',
      'textarea',
    ]);
    expect(new Set(Array.from(root.querySelectorAll('input[id], textarea[id]')).map(input => input.id)).size).toBe(
      root.querySelectorAll('input[id], textarea[id]').length
    );

    form.get(['formats', 0, 'details', 'volume'])!.setValue('200 files');
    form.get(['formats', 2, 'details', 'volume'])!.setValue('3 TB');
    form.get(['formats', 2, 'details', 'description'])!.setValue('Instrument exports');
    expect(form.valid).toBeTrue();
    TestBed.inject(FormComponentEventBus).publish(
      createFormValidationGroupsChangeRequestEvent({
        initial: 'none',
        groups: { include: ['all'] },
      })
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(form.invalid).toBeTrue();

    await check(1);
    expect(form.valid).toBeTrue();
    expect(form.value.formats).toEqual([
      { value: 'tabulated', details: { volume: '200 files' } },
      { value: 'other./~', details: { volume: '3 TB', description: 'Instrument exports' } },
    ]);
    await check(0);
    await check(0);
    expect(form.value.formats[1]).toEqual({ value: 'tabulated', details: { volume: '200 files' } });
    expect(form.value.additional).toEqual([]);
  });

  it('hydrates deferred vocabulary without reassigning saved rows and shows a removed choice', async () => {
    const fieldDefinition = field('formats', [
      { value: 'removed', details: { volume: '1 TB' } },
      { value: 'other./~', details: { volume: '3 TB', description: 'Instrument exports' } },
    ]);
    delete fieldDefinition.component.config!.options;
    fieldDefinition.component.config!.vocabRef = 'formats';
    let resolveOptions!: (options: TypeaheadOption[]) => void;
    const vocabulary = spyOn(TestBed.inject(TypeaheadDataService), 'searchVocabularyEntries').and.returnValue(
      new Promise(resolve => {
        resolveOptions = resolve;
      })
    );
    const mounted = createFormAndWaitForReady(config([fieldDefinition]), { editMode: true });
    resolveOptions([
      { label: 'Other', value: 'other./~' },
      { label: 'Tabulated', value: 'tabulated' },
    ]);
    const { fixture, formComponent } = await mounted;

    expect(vocabulary).toHaveBeenCalledOnceWith('formats', '', 1000, 0, true);
    expect(formComponent.form?.value.formats).toEqual(fieldDefinition.model!.config!.value);
    expect(fixture.nativeElement.querySelector('redbox-checkbox-with-details').textContent).toContain('removed');
    expect(fixture.nativeElement.querySelector('textarea').value).toBe('Instrument exports');
  });
});
