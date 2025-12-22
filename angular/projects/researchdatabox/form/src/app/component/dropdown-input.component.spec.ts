import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { DropdownInputComponent } from './dropdown-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { TestBed } from '@angular/core/testing';

describe('DropdownInputComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({declarations: {"DropdownInputComponent": DropdownInputComponent}});
  });

  it('should create component', () => {
    const fixture = TestBed.createComponent(DropdownInputComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it('should render Dropdown input component', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'dropdown_test',
          model: {
            class: 'DropdownInputModel',
            config: {
              value: 'b',
            },
          },
          component: {
            class: 'DropdownInputComponent',
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
    const selectEl = compiled.querySelector('select') as HTMLSelectElement;
    expect(selectEl).toBeTruthy();
    const selectedText = selectEl.options[selectEl.selectedIndex]?.text;
    expect(selectedText).toEqual('Bravo');
  });
});


