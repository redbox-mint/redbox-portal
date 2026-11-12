import { TypeaheadModule } from 'ngx-bootstrap/typeahead';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from './helpers.spec';
import { ActionRowLayoutComponent } from './component/action-row-layout.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './component/repeatable.component';
import { SimpleInputComponent } from './component/simple-input.component';
import { TypeaheadInputComponent } from './component/typeahead-input.component';
import { DateInputComponent } from './component/date-input.component';

describe('Form printing', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: { ActionRowLayoutComponent, RepeatableComponent, RepeatableElementLayoutComponent,
        SimpleInputComponent, TypeaheadInputComponent, DateInputComponent },
      imports: { TypeaheadModule: TypeaheadModule, BsDatepickerModule: BsDatepickerModule,
        NoopAnimationsModule },
    });
  });

  it('prints editable and readonly date values without their calendar controls', async () => {
    const { fixture } = await createFormAndWaitForReady({ name: 'print-dates', componentDefinitions: [
      { name: 'start', model: { class: 'DateInputModel', config: { dateOnly: true, value: '2026-12-01' } },
        component: { class: 'DateInputComponent', config: { dateFormat: 'YYYY/MM/DD' } } },
      { name: 'end', model: { class: 'DateInputModel', config: { value: new Date(2028, 11, 31) } },
        component: { class: 'DateInputComponent', config: { readonly: true, dateFormat: 'YYYY/MM/DD' } } },
    ] });
    const dates = Array.from(fixture.nativeElement.querySelectorAll('redbox-date-input')) as HTMLElement[];
    const inputs = dates.map(date => date.querySelector('input')!);
    const calendars = dates.map(date => date.querySelector('.input-group-append')!);
    const values = inputs.map(input => input.value);
    expect(values).toEqual(['2026/12/01', '2028/12/31']);
    calendars.forEach(calendar => expect(getComputedStyle(calendar).display).not.toBe('none'));
    const printRules = Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules))
      .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText === 'print');
    expect(printRules.length).toBeGreaterThan(0);
    try {
      printRules.forEach(rule => { rule.media.mediaText = 'all'; });
      calendars.forEach(calendar => expect(getComputedStyle(calendar).display).toBe('none'));
      inputs.forEach(input => expect(getComputedStyle(input).display).not.toBe('none'));
      expect(inputs.map(input => input.value)).toEqual(values);
    } finally {
      printRules.forEach(rule => { rule.media.mediaText = 'print'; });
      fixture.destroy();
    }
  });

  it('prints funding in repeatable layouts carrying legacy action classes while hiding action rows', async () => {
    const config: FormConfigFrame = { name: 'print-funding', componentDefinitions: [{
      name: 'funding', model: { class: 'RepeatableModel', config: {
        value: [{ 'provider-name': 'Research Foundation', 'provider-id': 'FUND-1' }],
      } },
      component: { class: 'RepeatableComponent', config: { readonly: true, disabled: true,
        elementTemplate: { name: '', model: { class: 'TypeaheadInputModel', config: {} },
          component: { class: 'TypeaheadInputComponent', config: { readonly: true, disabled: true,
            sourceType: 'static', valueMode: 'optionObject', labelField: 'provider-name', valueField: 'provider-id',
            optionObjectFields: { 'provider-name': 'provider-name', 'provider-id': 'provider-id' },
          } },
          layout: { class: 'RepeatableElementLayout', config: { hostCssClasses: 'rb-form-action-row-layout' } },
        },
      } },
    }, {
      name: 'actions', model: { class: 'SimpleInputModel' }, component: { class: 'SimpleInputComponent' },
      layout: { class: 'ActionRowLayout' },
    }] };
    const { fixture } = await createFormAndWaitForReady(config, { editMode: false });
    const row = fixture.nativeElement.querySelector('redbox-form-repeatable-component-layout') as HTMLElement;
    const input = row.querySelector('input')!;
    expect(input.value).toBe('Research Foundation');

    // Activate the compiled print rules in this browser test, then restore them.
    const printRules = Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules))
      .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText === 'print');
    expect(printRules.length).toBeGreaterThan(0);
    try {
      printRules.forEach(rule => { rule.media.mediaText = 'all'; });
      expect(getComputedStyle(row).display).not.toBe('none');
      expect(getComputedStyle(input).display).not.toBe('none');
      expect(getComputedStyle(fixture.nativeElement.querySelector('redbox-form-action-row-layout')).display).toBe('none');
    } finally {
      printRules.forEach(rule => { rule.media.mediaText = 'print'; });
      fixture.destroy();
    }
  });
});
