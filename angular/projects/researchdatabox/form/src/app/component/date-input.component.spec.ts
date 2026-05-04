import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { DateInputComponent } from './date-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { TestBed } from '@angular/core/testing';

describe('DateInputComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: [DateInputComponent]
     ,imports: [BsDatepickerModule.forRoot()]
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
              value: new Date('2025-08-10T10:00:00Z')
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {
            },
          },
        },
      ],
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);
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
              value: new Date('2025-08-10T10:00:00Z')
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {
            },
          },
        },
      ],
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);
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
              value: '2025-08-10T10:00:00.000Z' as unknown as Date
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {
            },
          },
        },
      ],
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);
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

    const {fixture} = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]') as HTMLInputElement;

    expect(inputElement.placeholder).toEqual('yyyy/mm/dd');
  });

  it('marks the form dirty and touched when only the time value changes', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_time_dirty',
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
              value: new Date('2025-08-10T10:00:00Z')
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {
              enableTimePicker: true,
            },
          },
        },
      ],
    };

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const timeInput = compiled.querySelector('input[type="time"]') as HTMLInputElement;
    const control = formComponent.form?.get('date_test');

    expect(timeInput).toBeTruthy();
    expect(control?.dirty).toBeFalse();
    expect(control?.touched).toBeFalse();

    timeInput.value = '11:30';
    timeInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();

    expect(control?.dirty).toBeTrue();
    expect(control?.touched).toBeTrue();
    expect(formComponent.form?.dirty).toBeTrue();
  });

});
