import { FormConfig } from '@researchdatabox/sails-ng-common';
import { CheckboxInputComponent } from './checkbox-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { TestBed } from '@angular/core/testing';

describe('CheckboxInputComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      CheckboxInputComponent,
    ]);
  });

  it('should create component', () => {
    const fixture = TestBed.createComponent(CheckboxInputComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it('should render Checkbox input component', async () => {
    const formConfig: FormConfig = {
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'checkbox_test',
          model: {
            class: 'CheckboxInputModel',
            config: {
              defaultValue: 'b',
            },
          },
          component: {
            class: 'CheckboxInputComponent',
            config: {
              options: [
                { label: 'Alpha', value: 'a' },
                { label: 'Bravo', value: 'b' },
                { label: 'Charlie', value: 'c' },
              ],
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const selectEl = compiled.querySelector('input[type="checkbox"]:checked') as HTMLInputElement;
    expect(selectEl).toBeTruthy();
    const selectedText = selectEl.value;
    expect(selectedText).toEqual('b');
  });
});


