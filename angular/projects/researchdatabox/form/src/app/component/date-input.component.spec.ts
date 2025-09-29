import { FormConfig } from '@researchdatabox/sails-ng-common';
import { DateInputComponent } from './date-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { TestBed } from '@angular/core/testing';

describe('DateInputComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      DateInputComponent,
    ]);
  });

  it('should create component', () => {
    const fixture = TestBed.createComponent(DateInputComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it('should render Date input component', async () => {
    const formConfig: FormConfig = {
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
              defaultValue: '10/08/2025'
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


