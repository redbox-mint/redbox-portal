import { By } from '@angular/platform-browser';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { CheckboxInputComponent } from './checkbox-input.component';
import { RadioInputComponent } from './radio-input.component';
import { DropdownInputComponent } from './dropdown-input.component';

describe('enabledOptionValues', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: { CheckboxInputComponent, RadioInputComponent, DropdownInputComponent },
    });
  });

  for (const [className, componentType, selector] of [
    ['CheckboxInputComponent', CheckboxInputComponent, 'input[type="checkbox"]'],
    ['RadioInputComponent', RadioInputComponent, 'input[type="radio"]'],
    ['DropdownInputComponent', DropdownInputComponent, 'option[value]'],
  ] as const) {
    it(`updates ${className} restrictions from config and preserves static disabled options`, async () => {
      const optionConfig = {
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
          { label: 'C', value: 'c', disabled: true },
        ],
        enabledOptionValues: ['b'],
      };
      const config: FormConfigFrame = {
        name: 'options',
        componentDefinitions: [
          className === 'CheckboxInputComponent'
            ? {
                name: 'choice',
                component: { class: className, config: optionConfig },
                model: { class: 'CheckboxInputModel', config: { value: 'a' } },
              }
            : className === 'RadioInputComponent'
              ? {
                  name: 'choice',
                  component: { class: className, config: optionConfig },
                  model: { class: 'RadioInputModel', config: { value: 'a' } },
                }
              : {
                  name: 'choice',
                  component: { class: className, config: optionConfig },
                  model: { class: 'DropdownInputModel', config: { value: 'a' } },
                },
        ],
      };
      const { fixture } = await createFormAndWaitForReady(config, { editMode: true });
      const component = fixture.debugElement.query(By.directive(componentType)).componentInstance as
        | CheckboxInputComponent
        | RadioInputComponent
        | DropdownInputComponent;
      const disabled = () =>
        Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement | HTMLOptionElement>(
            selector,
          ),
        )
          .filter((el) => el.value !== '')
          .map((el) => el.disabled);
      expect(disabled()).toEqual([true, false, true]);
      component.setProperty('enabledOptionValues', []);
      fixture.detectChanges();
      expect(disabled()).toEqual([true, true, true]);
      component.setProperty('enabledOptionValues', null);
      fixture.detectChanges();
      expect(disabled()).toEqual([false, false, true]);
      component.setProperty('readonly', true);
      fixture.detectChanges();
      expect(component.isOptionDisabled({ value: 'b', label: 'B' })).toBeTrue();
      fixture.destroy();
    });
  }
});
