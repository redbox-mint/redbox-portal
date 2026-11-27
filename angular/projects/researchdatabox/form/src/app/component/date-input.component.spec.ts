import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { setControlValue } from '../form-state/custom-set-value.control';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { DateInputComponent, parseFreeTextDate } from './date-input.component';
import { GroupFieldComponent } from './group.component';
import { SaveButtonComponent } from './save-button.component';
import { SimpleInputComponent } from './simple-input.component';
import { TabComponent, TabContentComponent } from './tab.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { TestBed } from '@angular/core/testing';
import { ValidationErrors } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { FormComponentEventBus, FormComponentEventType } from '../form-state';

describe('parseFreeTextDate', () => {
  it('should parse exact match for configured format', () => {
    const result = parseFreeTextDate('2011/11/24', 'YYYY/MM/DD');
    expect(result instanceof Date).toBeTrue();
    expect(result!.getTime()).toEqual(new Date(Date.UTC(2011, 10, 24)).getTime());
  });

  it('should parse dash-separated date', () => {
    const result = parseFreeTextDate('2011-11-24', 'YYYY/MM/DD');
    expect(result instanceof Date).toBeTrue();
    expect(result!.getTime()).toEqual(new Date(Date.UTC(2011, 10, 24)).getTime());
  });

  it('should parse dot-separated date', () => {
    const result = parseFreeTextDate('2011.11.24', 'YYYY/MM/DD');
    expect(result instanceof Date).toBeTrue();
    expect(result!.getTime()).toEqual(new Date(Date.UTC(2011, 10, 24)).getTime());
  });

  it('should parse day-first date via token-order swap', () => {
    const result = parseFreeTextDate('24/11/2011', 'YYYY/MM/DD');
    expect(result instanceof Date).toBeTrue();
    expect(result!.getTime()).toEqual(new Date(Date.UTC(2011, 10, 24)).getTime());
  });

  it('should correctly parse 20/12/2012 as 2012-12-20 not 2020-12-20', () => {
    const result = parseFreeTextDate('20/12/2012', 'YYYY/MM/DD');
    expect(result instanceof Date).toBeTrue();
    expect(result!.getTime()).toEqual(new Date(Date.UTC(2012, 11, 20)).getTime());
  });

  it('should parse month-first date via disambiguation heuristic', () => {
    const result = parseFreeTextDate('11/24/2011', 'DD/MM/YYYY');
    expect(result instanceof Date).toBeTrue();
    expect(result!.getTime()).toEqual(new Date(Date.UTC(2011, 10, 24)).getTime());
  });

  it('should return undefined for unparseable date', () => {
    const result = parseFreeTextDate('13/13/2011', 'YYYY/MM/DD');
    expect(result).toBeUndefined();
  });

  it('should return null for empty input', () => {
    expect(parseFreeTextDate(null, 'YYYY/MM/DD')).toBeNull();
    expect(parseFreeTextDate('', 'YYYY/MM/DD')).toBeNull();
    expect(parseFreeTextDate('  ', 'YYYY/MM/DD')).toBeNull();
    expect(parseFreeTextDate(undefined, 'YYYY/MM/DD')).toBeNull();
  });
});

describe('DateInputComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: [DateInputComponent, GroupFieldComponent, SaveButtonComponent, SimpleInputComponent,
        TabComponent, TabContentComponent],
      imports: [BsDatepickerModule.forRoot(), NoopAnimationsModule],
    });
  });

  function timeDateField() {
    return {
      name: 'date',
      component: { class: 'DateInputComponent' as const, config: { enableTimePicker: true } },
      model: { class: 'DateInputModel' as const, config: { value: new Date(2026, 9, 4, 12) } },
    };
  }

  function setTime(root: HTMLElement): void {
    const input = root.querySelector<HTMLInputElement>('input[type="time"]')!;
    input.value = '18:45';
    input.dispatchEvent(new Event('change'));
  }

  function createTabbedTimeForm(displayName: 'date' | 'relatedTitle') {
    return createFormAndWaitForReady({
      name: 'tabbed-date',
      relatedRecords: {
        displayTargets: [{ metadataPointer: `/${displayName}`, relationId: 'activity' }],
        relations: [{ relationId: 'activity', referenceTokens: ['reference'] }],
        sources: [],
      },
      componentDefinitions: [
        { name: 'reference', component: { class: 'SimpleInputComponent' },
          model: { class: 'SimpleInputModel', config: { value: 'activity-oid' } } },
        { name: 'relatedTitle', component: { class: 'SimpleInputComponent' },
          model: { class: 'SimpleInputModel', config: { value: 'Related title' } } },
        {
          name: 'main_tab',
          component: { class: 'TabComponent', config: { tabs: [{
            name: 'tab2',
            component: { class: 'TabContentComponent', config: { componentDefinitions: [timeDateField()] } },
          }] } },
        },
        { name: 'save', component: { class: 'SaveButtonComponent' } },
      ],
    }, { editMode: true, oid: 'oid-123' });
  }

  it('should create component', () => {
    const fixture = TestBed.createComponent(DateInputComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  for (const serverDay of [3, 4]) {
    it(`keeps the datepicker valid and displays the saved day ${serverDay} after ISO writeback`, async () => {
      const original = new Date(2026, 9, 3);
      const saved = new Date(2026, 9, serverDay);
      const { fixture, formComponent } = await createFormAndWaitForReady({
        name: 'date-writeback', componentDefinitions: [{ name: 'date',
          model: { class: 'DateInputModel', config: { value: original } },
          component: { class: 'DateInputComponent' },
        }],
      });
      const control = formComponent.form!.get('date')!;
      const changes: unknown[] = [];
      control.valueChanges.subscribe(value => changes.push(value));
      await setControlValue(control, saved.toISOString(), { emitEvent: false });
      fixture.detectChanges();
      await fixture.whenStable();
      const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      expect(changes).toEqual([]);
      expect(control.value).toEqual(saved);
      expect(control.valid).toBeTrue();
      expect(control.pristine).toBeTrue();
      expect(input.value).toBe(`2026/10/0${serverDay}`);
      // bsValue is a write-only input; verify the rendered calendar selection.
      (fixture.nativeElement.querySelector('.date-input-addon') as HTMLElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      const selectedDay = document.querySelector('bs-datepicker-container .bs-datepicker-body .selected');
      expect(selectedDay?.textContent?.trim()).toBe(String(serverDay));
    });
  }

  it('marks a populated date dirty after a time-only edit and keeps programmatic writes pristine', async () => {
    const initialDate = new Date(2026, 9, 3, 12);
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'date-time-edit',
      componentDefinitions: [{
        name: 'date',
        model: { class: 'DateInputModel', config: { value: initialDate } },
        component: { class: 'DateInputComponent', config: { enableTimePicker: true } },
      }],
    }, { editMode: true });
    const date = formComponent.form!.get('date')!;
    await setControlValue(date, new Date(2026, 9, 4, 12), { emitEvent: false });
    expect(date.pristine).toBeTrue();
    expect(formComponent.hasChangesToSave()).toBeFalse();

    setTime(fixture.nativeElement);

    expect(date.value).toEqual(new Date('2026-10-04T18:45:00.000Z'));
    expect(date.dirty).toBeTrue();
    expect(formComponent.hasChangesToSave()).toBeTrue();
    const unload = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    formComponent.protectUnresolvedConflictNavigation(unload);
    expect(unload.defaultPrevented).toBeTrue();
  });

  for (const datePath of ['date', 'schedule.date']) {
    it(`enables Save after a time-only edit to ${datePath} when a related display control is already dirty`, async () => {
      const displayName = datePath === 'date' ? 'relatedTitle' : 'date';
      const dateField = timeDateField();
      const { fixture, formComponent } = await createFormAndWaitForReady({
        name: 'date-time-with-related-display',
        relatedRecords: {
          displayTargets: [{ metadataPointer: `/${displayName}`, relationId: 'activity' }],
          relations: [{ relationId: 'activity', referenceTokens: ['reference'] }],
          sources: [],
        },
        componentDefinitions: [
          { name: 'reference', component: { class: 'SimpleInputComponent' },
            model: { class: 'SimpleInputModel', config: { value: 'activity-oid' } } },
          { name: displayName, component: { class: 'SimpleInputComponent' },
            model: { class: 'SimpleInputModel', config: { value: 'Related title' } } },
          datePath === 'date' ? dateField : {
            name: 'schedule', model: { class: 'GroupModel' },
            component: { class: 'GroupComponent', config: { componentDefinitions: [dateField] } },
          },
          { name: 'save', component: { class: 'SaveButtonComponent', config: { disableWhenPristine: true } } },
        ],
      }, { editMode: true, oid: 'oid-123' });
      const form = formComponent.form!;
      const date = form.get(datePath)!;
      const root = fixture.nativeElement as HTMLElement;
      const saveButton = root.querySelector<HTMLButtonElement>('redbox-form-save-button button')!;
      form.get(displayName)!.markAsDirty();
      fixture.detectChanges();

      expect(form.dirty).toBeTrue();
      expect(date.pristine).toBeTrue();
      expect(saveButton.disabled).toBeTrue();

      setTime(root);
      fixture.detectChanges();

      expect(date.dirty).toBeTrue();
      expect(saveButton.disabled).toBeFalse();
    });
  }

  it('keeps the default Save button disabled after a time-only edit to an active related display date in a tab', async () => {
    const { fixture, formComponent } = await createTabbedTimeForm('date');
    const root = fixture.nativeElement as HTMLElement;
    const date = formComponent.form!.get('date')!;
    const originalValue = date.value;
    const saveButton = root.querySelector<HTMLButtonElement>('redbox-form-save-button button')!;
    expect(saveButton.disabled).toBeTrue();

    setTime(root);
    fixture.detectChanges();

    expect(date.value).not.toEqual(originalValue);
    expect(formComponent.hasChangesToSave()).toBeFalse();
    expect(saveButton.disabled).toBeTrue();
    const unload = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    formComponent.protectUnresolvedConflictNavigation(unload);
    expect(unload.defaultPrevented).toBeFalse();
  });

  it('enables Save for a time-only persisted date edit in a tab while a related display control is dirty', async () => {
    const { fixture, formComponent } = await createTabbedTimeForm('relatedTitle');
    const form = formComponent.form!;
    const date = form.get('date')!;
    const originalValue = date.value;
    const root = fixture.nativeElement as HTMLElement;
    const saveButton = root.querySelector<HTMLButtonElement>('redbox-form-save-button button')!;
    form.get('relatedTitle')!.markAsDirty();
    fixture.detectChanges();
    expect(form.dirty).toBeTrue();
    expect(date.pristine).toBeTrue();
    expect(saveButton.disabled).toBeTrue();

    setTime(root);
    fixture.detectChanges();

    expect(date.dirty).toBeTrue();
    expect(saveButton.disabled).toBeFalse();

    date.markAsPristine();
    date.setValue(originalValue);
    fixture.detectChanges();

    expect(form.dirty).toBeTrue();
    expect(saveButton.disabled).toBeTrue();
  });

  it('enables only the edited form’s Save button after a time-only edit', async () => {
    const save = { name: 'save', component: { class: 'SaveButtonComponent' as const } };
    const edited = await createFormAndWaitForReady({
      name: 'edited-time-form', componentDefinitions: [timeDateField(), save],
    }, { editMode: true, oid: 'edited-oid' });
    const other = await createFormAndWaitForReady({
      name: 'other-time-form', componentDefinitions: [timeDateField(), save],
    }, { editMode: true, oid: 'other-oid' });
    const otherDate = other.formComponent.form!.get('date')!;
    const editedRoot = edited.fixture.nativeElement as HTMLElement;
    const otherRoot = other.fixture.nativeElement as HTMLElement;
    const editedSave = editedRoot.querySelector<HTMLButtonElement>('redbox-form-save-button button')!;
    const otherSave = otherRoot.querySelector<HTMLButtonElement>('redbox-form-save-button button')!;
    expect(otherDate.pristine).toBeTrue();
    expect(editedSave.disabled).toBeTrue();
    expect(otherSave.disabled).toBeTrue();

    setTime(editedRoot);
    edited.fixture.detectChanges();
    other.fixture.detectChanges();

    expect(edited.formComponent.form!.get('date')!.dirty).toBeTrue();
    expect(otherDate.pristine).toBeTrue();
    expect(other.formComponent.form!.pristine).toBeTrue();
    expect(editedSave.disabled).toBeFalse();
    expect(otherSave.disabled).toBeTrue();
  });

  it('enables Save when async validation succeeds after a time-only edit', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'async-time-form',
      componentDefinitions: [timeDateField(), { name: 'save', component: { class: 'SaveButtonComponent' } }],
    }, { editMode: true, oid: 'async-oid' });
    const form = formComponent.form!;
    const validation = new Subject<ValidationErrors | null>();
    form.get('date')!.setAsyncValidators(() => validation);
    const root = fixture.nativeElement as HTMLElement;
    const saveButton = root.querySelector<HTMLButtonElement>('redbox-form-save-button button')!;

    setTime(root);
    fixture.detectChanges();
    expect(form.pending).toBeTrue();
    expect(saveButton.disabled).toBeTrue();

    validation.next(null);
    validation.complete();
    fixture.detectChanges();

    expect(form.valid).toBeTrue();
    expect(formComponent.hasChangesToSave()).toBeTrue();
    expect(saveButton.disabled).toBeFalse();
  });

  it('should render Date input component from default value', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {
              value: new Date('2025-08-10T10:00:00Z'),
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect((inputElement as HTMLInputElement).value).toEqual('2025/08/10');
  });

  it('should render Date input component from value', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {
              value: new Date('2025-08-10T10:00:00Z'),
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect((inputElement as HTMLInputElement).value).toEqual('2025/08/10');
  });

  it('should render Date input component from ISO8601 string value', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_iso_string',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {
              value: '2025-08-10T10:00:00.000Z' as unknown as Date,
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect((inputElement as HTMLInputElement).value).toEqual('2025/08/10');
  });

  it('should render a date-only ISO string without timezone shifting', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_iso_date_only_string',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {
              value: '2017-02-03' as unknown as Date,
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect((inputElement as HTMLInputElement).value).toEqual('2017/02/03');
  });

  it('should render the default placeholder for empty values', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_empty',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {},
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]') as HTMLInputElement;

    expect(inputElement.placeholder).toEqual('yyyy/mm/dd');
  });

  it('should parse alternative separator and reformat on blur', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_blur',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {},
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]') as HTMLInputElement;

    expect(inputElement.value).toEqual('');

    inputElement.value = '2011-11-24';
    inputElement.dispatchEvent(new Event('input'));
    inputElement.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(inputElement.value).toEqual('2011/11/24');
    const dateInputDebug = fixture.debugElement.query(By.directive(DateInputComponent));
    const dateInputComp = dateInputDebug.componentInstance as DateInputComponent;
    expect(dateInputComp.model?.formControl?.value).toEqual(new Date(Date.UTC(2011, 10, 24)));
  });

  it('should revert to last valid value on blur when text cannot be parsed', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_revert',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {
              value: new Date('2025-08-10T10:00:00Z'),
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]') as HTMLInputElement;

    expect(inputElement.value).toEqual('2025/08/10');

    inputElement.value = 'not a date';
    inputElement.dispatchEvent(new Event('input'));
    inputElement.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();

    const dateInputDebug = fixture.debugElement.query(By.directive(DateInputComponent));
    const dateInputComp = dateInputDebug.componentInstance as DateInputComponent;

    expect(inputElement.value).toEqual('2025/08/10');
    expect(dateInputComp.model?.formControl?.value).toEqual(new Date('2025-08-10T10:00:00Z'));
  });

  it('should not parse alternative formats when robustParsing is disabled', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_optout',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {},
          },
          component: {
            class: 'DateInputComponent',
            config: {
              robustParsing: false,
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]') as HTMLInputElement;

    inputElement.value = '2011-11-24';
    inputElement.dispatchEvent(new Event('input'));
    inputElement.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(inputElement.value).toEqual('2011-11-24');
    const dateInputDebug = fixture.debugElement.query(By.directive(DateInputComponent));
    const dateInputComp = dateInputDebug.componentInstance as DateInputComponent;
    expect(dateInputComp.model?.formControl?.value as unknown).toEqual('2011-11-24');
  });

  it('should allow clearing the date value without reverting', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_clear',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {
              value: new Date('2025-08-10T10:00:00Z'),
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]') as HTMLInputElement;

    expect(inputElement.value).toEqual('2025/08/10');

    inputElement.value = '';
    inputElement.dispatchEvent(new Event('input'));
    inputElement.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();

    const dateInputDebug = fixture.debugElement.query(By.directive(DateInputComponent));
    const dateInputComp = dateInputDebug.componentInstance as DateInputComponent;

    expect(inputElement.value).toEqual('');
    expect(dateInputComp.model?.formControl?.value).toBeNull();
  });

  it('should clear the input on blur when invalid text is entered with no prior value', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_clear_invalid_no_value',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {},
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]') as HTMLInputElement;

    expect(inputElement.value).toEqual('');

    inputElement.value = 'abcde';
    inputElement.dispatchEvent(new Event('input'));
    inputElement.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(inputElement.value).toEqual('');
    const dateInputDebug = fixture.debugElement.query(By.directive(DateInputComponent));
    const dateInputComp = dateInputDebug.componentInstance as DateInputComponent;
    expect(dateInputComp.model?.formControl?.value).toBeNull();
  });

  it('should revert when bsDatepicker pushes an invalid Date directly to the form control', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_invalid_date_push',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {
              value: new Date('2025-08-10T10:00:00Z'),
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]') as HTMLInputElement;

    expect(inputElement.value).toEqual('2025/08/10');

    const dateInputDebug = fixture.debugElement.query(By.directive(DateInputComponent));
    const dateInputComp = dateInputDebug.componentInstance as DateInputComponent;

    dateInputComp.model?.formControl?.setValue(new Date('not a date'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(dateInputComp.model?.formControl?.value).toEqual(new Date('2025-08-10T10:00:00Z'));
    expect(inputElement.value).toEqual('2025/08/10');
  });

  it('should emit a value change when typed text is normalized to a Date', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_emit_normalized_text',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {},
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const inputElement = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    const dateInputDebug = fixture.debugElement.query(By.directive(DateInputComponent));
    const dateInputComp = dateInputDebug.componentInstance as DateInputComponent;
    const emittedValues: unknown[] = [];
    dateInputComp.model?.formControl?.valueChanges.subscribe(value => emittedValues.push(value));

    inputElement.value = '2026/06/10';
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(emittedValues.some(value => value instanceof Date && value.getUTCFullYear() === 2026)).toBeTrue();
  });

  it('should ignore blur caused by a datepicker click and accept the selected date', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_deferred_blur',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {
              value: new Date('2026-06-09T00:00:00Z'),
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const inputElement = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    const dateInputDebug = fixture.debugElement.query(By.directive(DateInputComponent));
    const dateInputComp = dateInputDebug.componentInstance as DateInputComponent;

    inputElement.focus();
    spyOnProperty(dateInputComp.datepicker, 'isOpen').and.returnValue(true);
    dateInputComp.onDocumentMouseDown({
      target: {
        closest: (selector: string) => selector === 'bs-datepicker-container, .bs-datepicker' ? {} : null,
      },
    } as unknown as MouseEvent);
    inputElement.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    dateInputComp.onDatepickerValueChange(new Date(Date.UTC(2026, 5, 10)));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(dateInputComp.model?.formControl?.value).toEqual(new Date(Date.UTC(2026, 5, 10)));
  });

  it('should mark the form dirty when a date is selected from the datepicker', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_datepicker_dirty',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {},
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const dateInputDebug = fixture.debugElement.query(By.directive(DateInputComponent));
    const dateInputComp = dateInputDebug.componentInstance as DateInputComponent;
    const eventBus = TestBed.inject(FormComponentEventBus) as FormComponentEventBus;
    const emittedEvents: any[] = [];
    const subscription = eventBus.select$(FormComponentEventType.FORM_STATUS_DIRTY_REQUEST).subscribe((event: unknown) => {
      emittedEvents.push(event);
    });

    expect(formComponent.form?.dirty).toBeFalse();
    expect(dateInputComp.model?.formControl?.dirty).toBeFalse();

    spyOnProperty(dateInputComp.datepicker, 'isOpen').and.returnValue(true);
    dateInputComp.onDocumentMouseDown({
      target: {
        closest: (selector: string) => selector === 'bs-datepicker-container, .bs-datepicker' ? {} : null,
      },
    } as unknown as MouseEvent);
    dateInputComp.onDatepickerValueChange(new Date(Date.UTC(2026, 5, 10)));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(dateInputComp.model?.formControl?.value).toEqual(new Date(Date.UTC(2026, 5, 10)));
    expect(dateInputComp.model?.formControl?.dirty).toBeTrue();
    expect(formComponent.form?.dirty).toBeTrue();
    const datepickerDirtyEvent = emittedEvents.find(
      event => event.fieldId === 'date_test' && event.reason === 'datepicker.selection'
    );
    expect(datepickerDirtyEvent?.type).toBe(FormComponentEventType.FORM_STATUS_DIRTY_REQUEST);
    subscription.unsubscribe();
  });

  it('should not leave ignoreNextBlur stuck after icon-opened datepicker flow', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_icon_blur',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {
              value: new Date('2026-06-09T00:00:00Z'),
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {},
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const inputElement = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    const dateInputDebug = fixture.debugElement.query(By.directive(DateInputComponent));
    const dateInputComp = dateInputDebug.componentInstance as DateInputComponent;

    spyOnProperty(dateInputComp.datepicker, 'isOpen').and.returnValue(true);

    // Simulate the icon-opened flow: the input blurs before the datepicker opens,
    // so when the user later clicks a date the input is already unfocused.
    dateInputComp.onDocumentMouseDown({
      target: {
        closest: (selector: string) => selector === 'bs-datepicker-container, .bs-datepicker' ? {} : null,
      },
    } as unknown as MouseEvent);

    dateInputComp.onDatepickerValueChange(new Date(Date.UTC(2026, 5, 10)));
    expect(dateInputComp.model?.formControl?.value).toEqual(new Date(Date.UTC(2026, 5, 10)));

    // A subsequent manual blur should still be processed.
    inputElement.value = '2026/06/11';
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(dateInputComp.model?.formControl?.value).toEqual(new Date(Date.UTC(2026, 5, 11)));
  });

  it('should accept datepicker selection when robustParsing is disabled', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_datepicker_non_robust',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {
              value: new Date('2025-08-10T10:00:00Z'),
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {
              robustParsing: false,
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const dateInputDebug = fixture.debugElement.query(By.directive(DateInputComponent));
    const dateInputComp = dateInputDebug.componentInstance as DateInputComponent;

    dateInputComp.onDatepickerValueChange(new Date(Date.UTC(2026, 5, 10)));
    expect(dateInputComp.model?.formControl?.value).toEqual(new Date(Date.UTC(2026, 5, 10)));
  });
});
