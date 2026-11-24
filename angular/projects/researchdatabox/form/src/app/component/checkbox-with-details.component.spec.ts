import { TestBed } from '@angular/core/testing';
import {
  CheckboxWithDetailsFormComponentDefinitionFrame,
  CheckboxWithDetailsRow,
  FormConfigFrame,
  TypeaheadOption,
} from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { createFormValidationGroupsChangeRequestEvent, FormComponentEventBus } from '../form-state';
import { setControlValue } from '../form-state/custom-set-value.control';
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

  it('initializes newly selected text fields from defaults without backfilling saved rows', async () => {
    const definition = field('formats', [{ value: 'tabulated', details: {} }]);
    definition.component.config!.detailFields![0].model!.config!.value = '10 GB';
    definition.component.config!.detailFieldsByValue!['other./~'][0].model!.config!.value = 'Default notes';
    const { fixture, formComponent } = await createFormAndWaitForReady(config([definition]), { editMode: true });
    const root: HTMLElement = fixture.nativeElement;
    const checkboxes = root.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(formComponent.form?.value.formats).toEqual([{ value: 'tabulated', details: { volume: null } }]);
    checkboxes[2].click();
    expect(formComponent.form?.value.formats).toEqual([
      { value: 'tabulated', details: { volume: null } },
      { value: 'other./~', details: { volume: '10 GB', description: 'Default notes' } },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('discards cached undo answers after authoritative array, model and parent form writes', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(
      config([field('formats', [{ value: 'tabulated', details: { volume: 'Old estimate' } }])]),
      { editMode: true }
    );
    const form = formComponent.form!;
    const model = formComponent.getComponentDefByName('formats')!.model!;
    const control = model.formControl!;
    const checkboxes = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    const table = checkboxes[0];

    table.click();
    table.click();
    expect(control.value).toEqual([{ value: 'tabulated', details: { volume: 'Old estimate' } }]);
    const image = { value: 'img', details: { volume: 'New estimate' } };

    for (const [replace, expected] of [
      [() => setControlValue(control, []), []],
      [() => form.setValue({ formats: [] }), []],
      [() => form.patchValue({ formats: [image] }), [image]],
      [() => form.reset({ formats: [image] }), [image]],
    ] as const) {
      control.setValue([{ value: 'tabulated', details: { volume: 'Old estimate' } }]);
      fixture.detectChanges();
      table.click();
      await replace();
      fixture.detectChanges();
      expect(table.checked).toBeFalse();
      expect(form.value.formats).toEqual([...expected]);
      table.click();
      expect(form.value.formats).toEqual([...expected, { value: 'tabulated', details: { volume: null } }]);
    }

    form.reset();
    expect(control.value).toEqual([]);
    expect(control.pristine).toBeTrue();
    expect(control.untouched).toBeTrue();
    expect(form.pristine).toBeTrue();
    expect(form.untouched).toBeTrue();
    const emitted = jasmine.createSpy('valueChanges');
    control.valueChanges.subscribe(emitted);
    model.setValue([image], { emitEvent: false });
    expect(control.value).toEqual([image]);
    expect(emitted).not.toHaveBeenCalled();
  });

  it('hydrates deferred vocabulary without reassigning saved rows and shows a removed choice', async () => {
    const fieldDefinition = field('formats', [
      { value: 'removed', details: { volume: '1 TB', retiredMemo: 'Original notes' } },
      { value: 'other./~', details: { volume: '3 TB', description: 'Instrument exports' } },
    ]);
    delete fieldDefinition.component.config!.options;
    fieldDefinition.component.config!.vocabRef = 'formats';
    fieldDefinition.component.config!.detailFieldsByValue!['removed'] = [
      {
        name: 'retiredMemo',
        layout: { class: 'DefaultLayout', config: { label: 'Original estimate notes' } },
        component: { class: 'TextAreaComponent' },
      },
    ];
    let resolveOptions!: (options: TypeaheadOption[]) => void;
    const vocabulary = spyOn(TestBed.inject(TypeaheadDataService), 'searchVocabularyEntries').and.returnValue(
      new Promise(resolve => {
        resolveOptions = resolve;
      })
    );
    const { fixture, formComponent } = await createFormAndWaitForReady(config([fieldDefinition]), { editMode: true });
    resolveOptions([
      { label: 'Other', value: 'other./~' },
      { label: 'Tabulated', value: 'tabulated' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(vocabulary).toHaveBeenCalledOnceWith('formats', '', 1000, 0, true);
    expect(formComponent.form?.value.formats).toEqual(fieldDefinition.model!.config!.value);
    expect(fixture.nativeElement.querySelector('redbox-checkbox-with-details').textContent).toContain('removed');
    expect(fixture.nativeElement.querySelector('redbox-checkbox-with-details').textContent).toContain(
      'Original estimate notes'
    );
    expect(fixture.nativeElement.querySelector('redbox-checkbox-with-details').textContent).toContain('Original notes');
    expect(fixture.nativeElement.querySelector('textarea').value).toBe('Instrument exports');
  });

  it('allows only removals during a lookup, including retry, and respects locked selections', async () => {
    const stored = ['tabulated', 'img', 'other./~', 'locked'].map(value => ({ value, details: { volume: '1 TB' } }));
    const editable = field('formats', stored);
    const readOnly = field('readonlyFormats', [stored[0]]);
    const historicalLocked = field('retiredFormats', [stored[0]]);
    const disabled = field('disabledFormats', [stored[0]]);
    for (const definition of [editable, readOnly, historicalLocked, disabled]) {
      const definitionConfig = definition.component.config!;
      delete definitionConfig.options;
      definitionConfig.vocabRef = definition.name!;
    }
    editable.component.config!.enabledOptionValues = ['tabulated', 'img', 'other./~'];
    readOnly.component.config!.readonly = true;
    disabled.layout!.config!.disabled = true;
    historicalLocked.component.config!.historicalVocabMode = 'disable';
    const confirmed = field('confirmedFormats', [stored[0]]);
    confirmed.component.config!.options = [{ value: 'tabulated', label: 'Retired tables', historical: true }];
    confirmed.component.config!.historicalVocabMode = 'disable';
    let reject!: (reason: Error) => void;
    let resolve!: (options: TypeaheadOption[]) => void;
    const initialLookup = new Promise<TypeaheadOption[]>((_, rejectRequest) => { reject = rejectRequest; });
    const retryLookup = new Promise<TypeaheadOption[]>(resolveRequest => { resolve = resolveRequest; });
    let attempts = 0;
    spyOn(TestBed.inject(TypeaheadDataService), 'searchVocabularyEntries').and.callFake(ref =>
      ref === 'formats' && ++attempts > 1 ? retryLookup : initialLookup
    );
    const { fixture, formComponent } = await createFormAndWaitForReady(
      config([editable, readOnly, historicalLocked, disabled, confirmed]), { editMode: true }
    );
    const root: HTMLElement = fixture.nativeElement;
    const [editableSection, readOnlySection, historicalSection, disabledSection, confirmedSection] =
      Array.from(root.querySelectorAll('redbox-checkbox-with-details'));
    const [first, second, third, locked] =
      Array.from(editableSection.querySelectorAll<HTMLInputElement>('input[type=checkbox]'));
    const selection = formComponent.form!.get('formats')!;

    expect(editableSection.querySelector('dl')?.textContent).toContain('1 TB');
    expect(editableSection.querySelector('input[type=text], textarea')).toBeNull();
    expect(first.disabled).toBeFalse();
    expect(locked.disabled).toBeFalse();
    expect(readOnlySection.querySelector('fieldset')?.disabled).toBeTrue();
    const unresolved = historicalSection.querySelector<HTMLInputElement>('input')!;
    expect(unresolved.disabled).toBeFalse();
    expect(confirmedSection.querySelector<HTMLInputElement>('input')!.disabled).toBeTrue();
    expect(disabledSection.querySelector('fieldset')?.disabled).toBeTrue();
    first.click();
    fixture.detectChanges();
    expect(first.disabled).toBeTrue();
    first.click();
    expect(selection.value).toEqual(stored.slice(1));

    reject(new Error('Synthetic missing lookup'));
    await fixture.whenStable();
    fixture.detectChanges();
    unresolved.click();
    fixture.detectChanges();
    expect(unresolved.checked).toBeFalse();
    expect(unresolved.disabled).toBeTrue();
    expect(second.disabled).toBeFalse();
    second.click();
    fixture.detectChanges();
    expect(second.disabled).toBeTrue();

    editableSection.querySelector('button')!.click();
    third.click();
    expect(selection.value).toEqual(stored.slice(3));
    // The last stored code was deleted and is also excluded by enabledOptionValues.
    resolve(stored.slice(0, 3).map(({ value }) => ({ value, label: value })));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(selection.value).toEqual(stored.slice(3));
    expect(formComponent.form!.get('readonlyFormats')!.getRawValue()).toEqual([stored[0]]);
    expect(formComponent.form!.get('retiredFormats')!.getRawValue()).toEqual([]);
    expect(Array.from(editableSection.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))
      .map(option => option.checked)).toEqual([false, false, false, true]);
    const deleted = editableSection.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[3];
    expect(deleted.disabled).toBeFalse();
    deleted.click();
    fixture.detectChanges();
    expect(selection.value).toEqual([]);
    expect(deleted.disabled).toBeTrue();
  });

  it('blocks enabled child validation while lookup is pending or failed and validates the latest rows after retry', async () => {
    const saved = { value: 'other./~', details: { volume: '3 TB' } };
    const definition = field('formats', [saved]);
    const fieldConfig = definition.component.config!;
    fieldConfig.vocabRef = 'formats';
    delete fieldConfig.options;
    fieldConfig.detailFieldsByValue!['other./~'][0].model!.config!.validators![0].groups = { include: ['release'] };
    const formConfig = config([definition]);
    formConfig.validationGroups!['release'] = { description: 'Release details', initialMembership: 'none' };
    let reject!: (reason: Error) => void;
    let resolve!: (options: TypeaheadOption[]) => void;
    const vocabulary = spyOn(TestBed.inject(TypeaheadDataService), 'searchVocabularyEntries').and.returnValues(
      new Promise((_, rejectRequest) => { reject = rejectRequest; }),
      new Promise(resolveRequest => { resolve = resolveRequest; })
    );
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true });
    const form = formComponent.form!;
    const selection = form.get('formats')!;
    const changeGroups = (group: string) => TestBed.inject(FormComponentEventBus).publish(
      createFormValidationGroupsChangeRequestEvent({ initial: 'none', groups: { include: [group] } })
    );
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('fieldset')?.getAttribute('aria-busy')).toBe('true');
    expect(form.valid).toBeTrue();
    expect(selection.value).toEqual([saved]);
    changeGroups('release');
    expect(selection.getError('checkboxDetailsOptions')?.message).toBe('checkbox-details-loading');
    expect(form.invalid).toBeTrue();

    reject(new Error('Synthetic lookup failure'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(selection.getError('checkboxDetailsOptions')?.message).toBe('checkbox-details-load-failed');
    changeGroups('none');
    expect(form.valid).toBeTrue();

    root.querySelector<HTMLButtonElement>('redbox-checkbox-with-details button')!.click();
    expect(vocabulary).toHaveBeenCalledTimes(2);
    const updated = { value: 'other./~', details: { volume: '5 TB' } };
    form.patchValue({ formats: [updated] });
    changeGroups('release');
    expect(form.invalid).toBeTrue();
    resolve([{ label: 'Other', value: 'other./~' }]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(selection.errors).toBeNull();
    expect(selection.value).toEqual([{ ...updated, details: { volume: '5 TB', description: null } }]);
    const description = form.get(['formats', 0, 'details', 'description'])!;
    expect(description.hasError('required')).toBeTrue();
    expect(form.invalid).toBeTrue();
    description.setValue('Instrument exports');
    expect(form.valid).toBeTrue();
  });
});
