import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { DateInputComponent, parseFreeTextDate } from './date-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

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
      declarations: [DateInputComponent],
      imports: [BsDatepickerModule.forRoot()],
    });
  });

  it('should create component', () => {
    const fixture = TestBed.createComponent(DateInputComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
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
});
