import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { By } from '@angular/platform-browser';
import { CheckboxInputComponent } from './checkbox-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { TestBed } from '@angular/core/testing';

describe('CheckboxInputComponent', () => {
  let translationService: any;

  beforeEach(async () => {
    ({ translationService } = await createTestbedModule({ declarations: { "CheckboxInputComponent": CheckboxInputComponent } }));
    translationService.getCurrentLanguage = jasmine.createSpy('getCurrentLanguage').and.returnValue('en');
  });

  it('should create component', () => {
    const fixture = TestBed.createComponent(CheckboxInputComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it('should render Checkbox input component', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: false,
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
              value: ['b'],
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

  it('should allow selecting multiple options when multipleValues is enabled', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'checkbox_test_multiple',
          model: {
            class: 'CheckboxInputModel',
            config: {
              value: [],
            },
          },
          component: {
            class: 'CheckboxInputComponent',
            config: {
              multipleValues: true,
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
    const checkboxEls = compiled.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');

    checkboxEls[0].checked = true;
    checkboxEls[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();

    checkboxEls[1].checked = true;
    checkboxEls[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const checked = compiled.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
    expect(checked.length).toEqual(2);
  });

  it('should resolve language-map labels for options', async () => {
    translationService.translationMap = translationService.translationMap || {};
    translationService.translationMap['@checkbox-language-label'] = 'English Label';
    spyOn(translationService, 't').and.callFake((key: string) => translationService.translationMap[key] ?? key);
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'checkbox_lang_test',
          model: {
            class: 'CheckboxInputModel',
            config: {
              value: [],
            },
          },
          component: {
            class: 'CheckboxInputComponent',
            config: {
              options: [
                { label: '@checkbox-language-label', value: 'en' },
              ],
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const labels = compiled.querySelectorAll<HTMLLabelElement>('label');
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0].getAttribute('for')).toEqual('checkbox_lang_test-en');
  });

  it('should render disabled options and not toggle them', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      componentDefinitions: [
        {
          name: 'checkbox_disabled_test',
          model: {
            class: 'CheckboxInputModel',
            config: {
              value: ['legacy'],
            },
          },
          component: {
            class: 'CheckboxInputComponent',
            config: {
              options: [
                { label: 'Active', value: 'active' },
                { label: 'Legacy', value: 'legacy', disabled: true },
              ],
            },
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const legacyInput = compiled.querySelector<HTMLInputElement>('#checkbox_disabled_test-legacy');
    expect(legacyInput).toBeTruthy();
    if (!legacyInput) {
      throw new Error('Expected legacy input to be present');
    }
    expect(legacyInput?.disabled).toBeTrue();
    expect(legacyInput?.checked).toBeTrue();

    legacyInput.checked = false;
    legacyInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect((formComponent as any).form.value?.checkbox_disabled_test).toEqual(['legacy']);
  });

  it('should disable all options when the field is disabled', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      componentDefinitions: [
        {
          name: 'checkbox_field_disabled_test',
          model: {
            class: 'CheckboxInputModel',
            config: {
              value: ['legacy'],
            },
          },
          component: {
            class: 'CheckboxInputComponent',
            config: {
              options: [
                { label: 'Active', value: 'active' },
                { label: 'Legacy', value: 'legacy' },
              ],
            },
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const component = fixture.debugElement.query(By.directive(CheckboxInputComponent)).componentInstance as CheckboxInputComponent;
    const compiled = fixture.nativeElement as HTMLElement;
    const activeInput = compiled.querySelector<HTMLInputElement>('#checkbox_field_disabled_test-active');
    const legacyInput = compiled.querySelector<HTMLInputElement>('#checkbox_field_disabled_test-legacy');

    component.setDisabled(true, { emitEvent: false, onlySelf: true });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isDisabled).toBeTrue();
    expect((formComponent as any).form.get('checkbox_field_disabled_test')?.disabled).toBeTrue();
    expect(activeInput?.disabled).toBeTrue();
    expect(legacyInput?.disabled).toBeTrue();

    component.onOptionChange(true, { label: 'Active', value: 'active' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect((formComponent as any).form.get('checkbox_field_disabled_test')?.value).toEqual(['legacy']);
  });
});
