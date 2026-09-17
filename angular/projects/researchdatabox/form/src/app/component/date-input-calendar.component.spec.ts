import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { Validators } from '@angular/forms';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { DateInputComponent } from './date-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { setControlValue } from '../form-state/custom-set-value.control';

describe('DateInputComponent calendar dates', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: [DateInputComponent],
      imports: [BsDatepickerModule.forRoot(), NoopAnimationsModule],
    });
  });

  async function createDateField(value: string | null = null, bsFullConfig: { useUtc?: boolean } = {}) {
    const result = await createFormAndWaitForReady({
      name: 'calendar-date-test',
      componentDefinitions: [{
        name: 'date',
        model: { class: 'DateInputModel', config: { dateOnly: true, value } },
        component: { class: 'DateInputComponent', config: { dateFormat: 'DD/MM/YYYY', bsFullConfig } },
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
