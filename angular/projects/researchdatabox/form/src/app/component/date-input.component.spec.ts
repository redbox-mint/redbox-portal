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
    expect((inputElement as HTMLInputElement).value).toEqual('10/08/2025');
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
    expect((inputElement as HTMLInputElement).value).toEqual('10/08/2025');
  });

});


