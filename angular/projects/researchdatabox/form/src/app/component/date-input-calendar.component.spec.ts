import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Validators } from '@angular/forms';
import { BsDatepickerConfig, BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { DateInputComponent } from './date-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { setControlValue } from '../form-state/custom-set-value.control';
import { firstValueFrom } from 'rxjs';
import { ApplicationRef } from '@angular/core';
import { FormComponentEventBus, FormComponentEventType } from '../form-state';

describe('DateInputComponent calendar dates', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: [DateInputComponent],
      imports: [BsDatepickerModule],
    });
  });

  async function createDateField(value: string | null = null, bsFullConfig: Partial<BsDatepickerConfig> = {}, robustParsing = true) {
    const result = await createFormAndWaitForReady({
      name: 'calendar-date-test',
      componentDefinitions: [{
        name: 'date',
        model: { class: 'DateInputModel', config: { dateOnly: true, value } },
        component: { class: 'DateInputComponent', config: { dateFormat: 'DD/MM/YYYY', bsFullConfig, robustParsing } },
      }],
    });
    const component = result.fixture.debugElement.query(By.directive(DateInputComponent)).componentInstance as DateInputComponent;
    const input = result.fixture.nativeElement.querySelector('input') as HTMLInputElement;
    return { ...result, component, input, control: component.formControl };
  }

  it('keeps successive calendar selections as date-only strings without recursion', async () => {
    const { fixture, component, input, control, formComponent } = await createDateField();
    const changes: unknown[] = [];
    control.valueChanges.subscribe(value => changes.push(value));
    for (const [year, month, day] of [[2026, 9, 17], [2026, 10, 4], [2027, 1, 1]]) {
      component.datepicker.bsValue = new Date(year, month - 1, day);
      fixture.detectChanges();
      await fixture.whenStable();
      const expected = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      expect(control.value).toBe(expected);
      expect(input.value).toBe(`${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`);
      expect(JSON.parse(JSON.stringify(formComponent.form?.value)).date).toBe(expected);
    }
    expect(changes.length).toBe(3);
    expect(control.dirty).toBeTrue();
    expect(control.touched).toBeTrue();
  });

  for (const month of ['2026-10', '2027-04']) {
    for (const [from, day] of [[3, 4], [4, 5], [5, 3]]) {
      it(`keeps real calendar selection ${month}-0${from} to day ${day} as a date-only string`, async () => {
        const { fixture, component, input, control } = await createDateField(`${month}-0${from}`);
        const shown = firstValueFrom(component.datepicker.onShown);
        (fixture.nativeElement.querySelector('.date-input-addon') as HTMLElement).click();
        await shown;
        fixture.detectChanges();
        fixture.debugElement.injector.get(ApplicationRef).tick();
        const target = Array.from(document.querySelectorAll<HTMLElement>('bs-datepicker-container td span:not(.is-other-month)'))
          .find(element => element.textContent?.trim() === String(day))!;
        expect(target).withContext(`day ${day}: ${document.querySelector('bs-datepicker-container')?.textContent}`).toBeDefined();
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        target.click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(control.value).toBe(`${month}-0${day}`);
        expect(input.value).toBe(`0${day}/${month.slice(5)}/${month.slice(0, 4)}`);
        expect(control.dirty).toBeTrue();
        expect(control.touched).toBeTrue();
      }, 15_000);
    }
  }

  it('loads saved and legacy dates and accepts silent model writes without marking edits', async () => {
    const { fixture, control, input } = await createDateField('2026-09-17T00:00:00.000Z');
    expect(control.value).toBe('2026-09-17');
    expect(input.value).toBe('17/09/2026');
    control.setValue('2026-09-30', { emitEvent: false });
    fixture.detectChanges();
    expect(input.value).toBe('30/09/2026');
    expect(control.pristine).toBeTrue();
    control.disable({ emitEvent: false });
    fixture.detectChanges();
    expect(input.disabled).toBeTrue();
    control.enable({ emitEvent: false });
    fixture.detectChanges();
    expect(input.disabled).toBeFalse();
  });

  it('parses typed dates, restores invalid text, and saves a cleared date as null', async () => {
    const { fixture, input, control } = await createDateField('2026-09-17');
    for (const [text, expected, displayed] of [
      ['04/10/2026', '2026-10-04', '04/10/2026'],
      ['29-02-2028', '2028-02-29', '29/02/2028'],
      ['2028-02-29', '2028-02-29', '29/02/2028'],
      ['2028-02-29T00:00:00+10:00', '2028-02-29', '29/02/2028'],
      ['not a date', '2028-02-29', '29/02/2028'],
      ['', null, ''],
    ]) {
      input.value = text!;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
      expect(control.value).toBe(expected);
      expect(input.value).toBe(displayed!);
    }
    expect(control.dirty).toBeTrue();
    expect(control.touched).toBeTrue();
  });

  it('updates and clears dynamic bounds without replacing an existing calendar value', async () => {
    const { fixture, component, control, formComponent, input } = await createDateField('2026-01-09');
    component.setProperty('bsFullConfig.minDate', '2026-01-10');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.datepicker.minDate?.getDate()).toBe(10);
    expect(control.value).toBe('2026-01-09');
    expect(input.value).toBe('09/01/2026');
    expect(control.hasError('dateMin')).toBeTrue();
    expect(formComponent.form?.invalid).toBeTrue();
    // Native validation-group changes must not discard the date bound.
    control.setValidators([Validators.required]);
    control.updateValueAndValidity();
    expect(control.hasError('dateMin')).toBeTrue();
    component.setProperty('bsFullConfig.minDate', '2026-01-08');
    fixture.detectChanges();
    expect(control.valid).toBeTrue();
    component.setProperty('bsFullConfig.minDate', null);
    fixture.detectChanges();
    expect(component.datepicker.minDate).toBeUndefined();
    expect(control.value).toBe('2026-01-09');
    expect(control.pristine).toBeTrue();
  });

  it('notifies control and form status subscribers without publishing answer changes or repeating notifications', async () => {
    const { fixture, component, control, formComponent } = await createDateField('2026-01-09');
    const statuses: string[] = [];
    const formStatuses: string[] = [];
    const answerEvents: unknown[] = [];
    const subscriptions = [
      control.statusChanges.subscribe(status => statuses.push(status)),
      formComponent.form!.statusChanges.subscribe(status => formStatuses.push(status)),
      TestBed.inject(FormComponentEventBus).select$(FormComponentEventType.FIELD_VALUE_CHANGED)
        .subscribe(event => answerEvents.push(event)),
    ];
    for (const [bound, status] of [['2026-01-10', 'INVALID'], ['2026-01-08', 'VALID'],
      ['2026-01-12', 'INVALID'], [null, 'VALID']] as const) {
      component.setProperty('bsFullConfig.minDate', bound);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(control.status).toBe(status);
      expect(statuses.at(-1)).toBe(status);
      expect(formStatuses.at(-1)).toBe(status);
      expect(formComponent.form?.getRawValue()).toEqual({ date: '2026-01-09' });
      expect(control.pristine && control.untouched).toBeTrue();
      const counts = [statuses.length, formStatuses.length];
      // Equivalent replacement config must not keep restarting validation or expressions.
      component.setProperty('bsFullConfig', { minDate: bound, showWeekNumbers: true });
      fixture.detectChanges();
      await fixture.whenStable();
      expect([statuses.length, formStatuses.length]).toEqual(counts);
    }
    expect(statuses).toEqual(['INVALID', 'VALID', 'INVALID', 'VALID']);
    expect(answerEvents).toEqual([]);
    subscriptions.forEach(subscription => subscription.unsubscribe());
  });

  it('notifies asynchronous validation completion after removing a date bound', async () => {
    const { component, control, formComponent } = await createDateField('2026-01-09');
    component.setProperty('bsFullConfig.minDate', '2026-01-10');
    let finish!: (errors: null) => void;
    const validate = jasmine.createSpy('async date validator').and.callFake(() =>
      new Promise<null>(resolve => { finish = resolve; }));
    control.setAsyncValidators(validate);
    const statuses: string[] = [];
    const formStatuses: string[] = [];
    const subscriptions = [
      control.statusChanges.subscribe(status => statuses.push(status)),
      formComponent.form!.statusChanges.subscribe(status => formStatuses.push(status)),
    ];
    component.setProperty('bsFullConfig', {});
    expect(control.pending).toBeTrue();
    expect(formComponent.form?.pending).toBeTrue();
    expect(statuses).toEqual(['PENDING']);
    expect(formStatuses).toEqual(['PENDING']);
    component.setProperty('bsFullConfig', { showWeekNumbers: true });
    expect(validate).toHaveBeenCalledTimes(1);
    finish(null);
    await Promise.resolve();
    expect(statuses).toEqual(['PENDING', 'VALID']);
    expect(formStatuses).toEqual(['PENDING', 'VALID']);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(control.value).toBe('2026-01-09');
    expect(control.pristine).toBeTrue();
    subscriptions.forEach(subscription => subscription.unsubscribe());
  });

  it('prevents readonly and disabled fields from opening the calendar through the input or addon', async () => {
    const { fixture, component, control, input } = await createDateField('2026-01-09');
    const addon = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.date-input-addon')!;
    for (const state of ['readonly', 'disabled']) {
      component.setProperty(state, true);
      fixture.detectChanges();
      input.click();
      fixture.detectChanges();
      expect(component.datepicker.isOpen).withContext(`${state} input`).toBeFalse();
      component.datepicker.hide();
      addon.click();
      fixture.detectChanges();
      expect(component.datepicker.isOpen).withContext(state).toBeFalse();
      expect(component.datepicker.isDisabled).withContext(state).toBeTrue();
      component.datepicker.hide();
      component.setProperty('bsFullConfig.minDate', '2026-01-10');
      component.datepicker.bsValue = new Date(2026, 0, 11);
      expect(control.value).toBe('2026-01-09');
      expect(control.pristine && control.untouched).toBeTrue();
      component.setProperty(state, false);
      fixture.detectChanges();
      expect(component.datepicker.isDisabled).toBeFalse();
    }
    addon.click();
    expect(component.datepicker.isOpen).toBeTrue();
    component.datepicker.hide();
    expect(control.hasError('dateMin')).toBeTrue();
  });

  it('selects inclusive minimum and maximum days through native calendar clicks without accepting disabled days', async () => {
    const { fixture, component, control, input } = await createDateField('2026-01-11', {
      minDate: new Date(2026, 0, 10, 18), maxDate: new Date(2026, 0, 20, 8),
    });
    const changes: unknown[] = [];
    control.valueChanges.subscribe(value => changes.push(value));
    for (const [day, expected, disabled] of [[9, '2026-01-11', true], [10, '2026-01-10', false],
      [21, '2026-01-10', true], [20, '2026-01-20', false]] as const) {
      if (!component.datepicker.isOpen) input.click();
      fixture.detectChanges();
      await fixture.whenStable();
      const cell = Array.from(document.querySelectorAll<HTMLElement>('bs-datepicker-container .bs-datepicker-body td span'))
        .find(element => element.textContent?.trim() === String(day))!;
      expect(cell).toBeDefined();
      expect(cell.classList.contains('disabled')).toBe(disabled);
      cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      cell.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(control.value).toBe(expected);
      expect(control.valid).toBeTrue();
    }
    expect(changes).toEqual(['2026-01-10', '2026-01-20']);
    expect(control.dirty && control.touched).toBeTrue();
    component.datepicker.hide();
  });

  it('preserves bounds, answers and validation across component reinitialization and input recreation', async () => {
    const { fixture, component, control, formComponent } = await createDateField('2026-01-09', {
      minDate: new Date(2026, 0, 10), maxDate: new Date(2026, 0, 20),
    });
    const changes: unknown[] = [];
    control.valueChanges.subscribe(value => changes.push(value));
    await component.initComponent(component.formFieldCompMapEntry);
    component.setProperty('visible', false);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('input')).toBeNull();
    component.setProperty('visible', true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.datepicker.minDate).toEqual(new Date(2026, 0, 10));
    expect(component.datepicker.maxDate).toEqual(new Date(2026, 0, 20));
    expect(component.dateInputEl.nativeElement.value).toBe('09/01/2026');
    expect(control.value).toBe('2026-01-09');
    expect(control.hasError('dateMin')).toBeTrue();
    expect(formComponent.form?.invalid).toBeTrue();
    expect(control.pristine && control.untouched).toBeTrue();
    expect(changes).toEqual([]);
  });

  it('disables earlier calendar days and prevents typed dates bypassing the bound', async () => {
    const { fixture, component, input, control } = await createDateField('2026-01-11');
    component.setProperty('bsFullConfig', { minDate: '2026-01-10' });
    fixture.detectChanges();
    component.datepicker.show();
    fixture.detectChanges();
    await fixture.whenStable();
    const ninth = Array.from(document.querySelectorAll('bs-datepicker-container .bs-datepicker-body span'))
      .filter(element => element.textContent?.trim() === '9');
    expect(ninth.some(element => element.classList.contains('disabled'))).toBeTrue();
    component.datepicker.hide();
    input.value = '09/01/2026';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(control.value === '2026-01-09' && control.valid).toBeFalse();
    expect(typeof control.value).toBe('string');
  });

  it('enforces inclusive maximum bounds, disables later days, and preserves saved answers', async () => {
    const { fixture, component, control, input } = await createDateField('2026-01-11', {
      maxDate: new Date(2026, 0, 10),
    });
    expect(control.hasError('dateMax')).toBeTrue();
    expect(control.value).toBe('2026-01-11');
    expect(input.value).toBe('11/01/2026');
    expect(control.pristine).toBeTrue();
    component.datepicker.show();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(Array.from(document.querySelectorAll('bs-datepicker-container .bs-datepicker-body span'))
      .some(element => element.textContent?.trim() === '11' && element.classList.contains('disabled'))).toBeTrue();
    component.datepicker.hide();
    control.setValidators(Validators.required);
    control.updateValueAndValidity();
    expect(control.hasError('dateMax')).toBeTrue();
    component.setProperty('bsFullConfig.maxDate', '2026-01-11T23:00:00-10:00');
    fixture.detectChanges();
    expect(component.datepicker.maxDate).toEqual(new Date(2026, 0, 11));
    expect(control.valid).toBeTrue();
    component.setProperty('bsFullConfig.maxDate', '2026-01-10');
    fixture.detectChanges();
    input.value = '12/01/2026';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    fixture.detectChanges();
    expect(control.value).toBe('2026-01-12');
    expect(control.hasError('dateMax')).toBeTrue();
    component.setProperty('bsFullConfig', { minDate: '2026-01-12', maxDate: '2026-01-12' });
    fixture.detectChanges();
    expect(control.valid).toBeTrue();
  });

  it('removes missing and invalid bounds without changing values or unrelated validators', async () => {
    const { fixture, component, control } = await createDateField('2026-01-09');
    const customValidator = () => ({ customError: true });
    control.setValidators(customValidator);
    control.updateValueAndValidity();
    for (const bound of ['minDate', 'maxDate'] as const) {
      for (const value of [undefined, null, '', 'not a date', '2026-02-30', new Date(NaN)]) {
        component.setProperty(`bsFullConfig.${bound}`, value);
        fixture.detectChanges();
        expect(component.datepicker[bound]).toBeUndefined();
        expect(control.hasError('dateMin')).toBeFalse();
        expect(control.hasError('dateMax')).toBeFalse();
        expect(control.hasError('customError')).toBeTrue();
        expect(control.value).toBe('2026-01-09');
        expect(control.pristine).toBeTrue();
      }
    }
    component.setProperty('bsFullConfig', { minDate: '2026-01-10', maxDate: '2026-01-08' });
    control.setValue(null);
    expect(control.hasError('dateMin') || control.hasError('dateMax')).toBeFalse();
    expect(control.hasError('customError')).toBeTrue();
  });

  it('normalizes timestamp bounds while preserving the timestamp value and picker options', async () => {
    const saved = '2026-01-11T12:30:00.000Z';
    const { fixture } = await createFormAndWaitForReady({
      name: 'timestamp-bounds',
      componentDefinitions: [{ name: 'date',
        model: { class: 'DateInputModel', config: { value: saved } },
        component: { class: 'DateInputComponent', config: { bsFullConfig: {
          dateInputFormat: 'DD/MM/YYYY', useUtc: true,
        } } },
      }],
    });
    const component = fixture.debugElement.query(By.directive(DateInputComponent)).componentInstance as DateInputComponent;
    const originalValue = component.formControl.value;
    component.setProperty('bsFullConfig.minDate', '2026-01-10T09:15:00Z');
    component.setProperty('bsFullConfig.maxDate', '2026-01-12T17:45:00Z');
    fixture.detectChanges();
    expect(component.datepicker.minDate).toEqual(new Date('2026-01-10T09:15:00Z'));
    expect(component.datepicker.maxDate).toEqual(new Date('2026-01-12T17:45:00Z'));
    expect(component.bsConfig.useUtc).toBeTrue();
    expect(component.formControl.value).toBe(originalValue);
    expect(component.formControl.pristine).toBeTrue();
    component.setProperty('bsFullConfig.minDate', '2026-02-30');
    component.setProperty('bsFullConfig.maxDate', 'invalid');
    fixture.detectChanges();
    expect(component.datepicker.minDate).toBeUndefined();
    expect(component.datepicker.maxDate).toBeUndefined();
    expect(component.formControl.value).toBe(originalValue);
    component.setProperty('bsFullConfig', {});
    fixture.detectChanges();
    expect(component.datepicker.minDate).toBeUndefined();
    expect(component.datepicker.maxDate).toBeUndefined();
  });

  it('keeps timestamp forms binding and programmatic writes when calendar interaction is readonly', async () => {
    const { fixture } = await createFormAndWaitForReady({
      name: 'readonly-timestamp', componentDefinitions: [{ name: 'date',
        model: { class: 'DateInputModel', config: { value: '2026-01-11T12:30:00.000Z' } },
        component: { class: 'DateInputComponent', config: { readonly: true,
          bsFullConfig: { dateInputFormat: 'DD/MM/YYYY', useUtc: true } } },
      }],
    });
    const component: DateInputComponent = fixture.debugElement.query(By.directive(DateInputComponent)).componentInstance;
    const control = component.formControl;
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    const original = control.value;
    input.click();
    component.toggleDatepicker();
    expect(component.datepicker.isOpen).toBeFalse();
    expect(component.datepicker.isDisabled).toBeTrue();
    expect(control.value).toBe(original);
    const updated = new Date('2026-01-12T12:30:00.000Z');
    await setControlValue(control, updated, { emitEvent: false });
    fixture.detectChanges();
    expect(control.value).toEqual(updated);
    expect(input.value).toBe('12/01/2026');
    expect(control.pristine && control.untouched).toBeTrue();
    component.setProperty('readonly', false);
    fixture.detectChanges();
    input.click();
    expect(component.datepicker.isOpen).toBeTrue();
    component.datepicker.hide();
  });

  for (const robustParsing of [true, false]) {
    it(`uses the picker format for typed calendar dates with robust parsing ${robustParsing}`, async () => {
      const { fixture, component, input, control } = await createDateField(
        '2026-10-04', { dateInputFormat: 'MM/DD/YYYY' }, robustParsing,
      );
      expect(component.bsConfig.dateInputFormat).toBe('MM/DD/YYYY');
      expect(input.value).toBe('10/04/2026');

      for (const [text, expected, displayed] of [
        ['10/04/2026', '2026-10-04', '10/04/2026'],
        ['11/05/2026', '2026-11-05', '11/05/2026'],
        ['not a date', '2026-11-05', '11/05/2026'],
        ['', null, ''],
      ]) {
        input.value = text!;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        expect(control.value).toBe(expected);
        expect(input.value).toBe(displayed!);
      }
    });
  }

  it('accepts dates from form expressions without shifting the day or marking edits', async () => {
    const { fixture, input, control } = await createDateField('2026-09-17');
    await setControlValue(control, '2026-10-04T00:00:00+10:00', { emitEvent: false });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(control.value).toBe('2026-10-04');
    expect(input.value).toBe('04/10/2026');
    expect(control.pristine).toBeTrue();
  });

  it('rejects invalid calendar values and resets the picker with the record control', async () => {
    const { fixture, input, control } = await createDateField('2026-09-17');
    for (const invalid of ['2026-02-30', '2026-09-17Tinvalid', 'not a date']) {
      expect(() => control.setValue(invalid)).toThrowError(TypeError);
      expect(control.value).toBe('2026-09-17');
    }
    control.reset({ value: '2026-10-04', disabled: true });
    fixture.detectChanges();
    expect(input.value).toBe('04/10/2026');
    expect(input.disabled).toBeTrue();
    expect(control.pristine).toBeTrue();
    control.reset();
    fixture.detectChanges();
    expect(input.value).toBe('');
    expect(control.value).toBeNull();
  });

  it('uses local picker dates even when legacy configuration requests UTC', async () => {
    const { fixture, component, input, control } = await createDateField(null, { useUtc: true });
    expect(component.bsConfig.useUtc).toBeFalse();
    component.datepicker.bsValue = new Date(2026, 9, 4);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('04/10/2026');
    expect(control.value).toBe('2026-10-04');
  });

  it('does not recurse for timestamp fields using UTC picker configuration', async () => {
    const { fixture } = await createFormAndWaitForReady({
      name: 'timestamp-date-test',
      componentDefinitions: [{
        name: 'date',
        model: { class: 'DateInputModel', config: { value: null } },
        component: { class: 'DateInputComponent', config: {
          bsFullConfig: { dateInputFormat: 'DD/MM/YYYY', useUtc: true },
        } },
      }],
    });
    const component = fixture.debugElement.query(By.directive(DateInputComponent)).componentInstance as DateInputComponent;
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    for (const day of [17, 18, 19]) {
      const selected = new Date(2026, 8, day);
      component.datepicker.bsValue = selected;
      fixture.detectChanges();
      await fixture.whenStable();
      expect(input.value).toBe(`${day}/09/2026`);
      expect(component.formControl.value).toEqual(selected);
    }
  });

  it('keeps required and picker validation when form validators change', async () => {
    const { component, control } = await createDateField();
    control.setValidators(Validators.required);
    control.updateValueAndValidity();
    expect(control.hasError('required')).toBeTrue();
    component.datepicker.bsValue = new Date(2026, 8, 17);
    expect(control.valid).toBeTrue();
    component.inputControl.setErrors({ bsDate: { invalid: true } });
    expect(control.hasError('bsDate')).toBeTrue();
    control.setValidators([]);
    control.updateValueAndValidity();
    expect(control.hasError('bsDate')).toBeTrue();
  });
});
