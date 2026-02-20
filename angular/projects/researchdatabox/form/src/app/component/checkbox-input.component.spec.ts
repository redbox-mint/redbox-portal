import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { CheckboxInputComponent } from './checkbox-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { TestBed } from '@angular/core/testing';

describe('CheckboxInputComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({declarations: {"CheckboxInputComponent": CheckboxInputComponent}});
  });

  it('should create component', () => {
    const fixture = TestBed.createComponent(CheckboxInputComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it('should render Checkbox input component', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
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
              value: 'b',
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
    const selectEls = compiled.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
    expect(selectEls.length).toEqual(1);
    const selectedText = selectEls[0].id;
    expect(selectedText).toEqual('checkbox_test-b');
  });
});


