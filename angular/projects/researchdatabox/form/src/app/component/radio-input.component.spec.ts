import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { RadioInputComponent } from "./radio-input.component";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { TestBed } from "@angular/core/testing";

describe('RadioInputComponent', () => {
  let translationService: any;

  beforeEach(async () => {
    ({ translationService } = await createTestbedModule({ declarations: { "RadioInputComponent": RadioInputComponent } }));
    translationService.getCurrentLanguage = jasmine.createSpy('getCurrentLanguage').and.returnValue('en');
  });

  it('should create component', () => {
    let fixture = TestBed.createComponent(RadioInputComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it('should render RadioInput component with options', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'radio_test',
          model: {
            class: 'RadioInputModel',
            config: {
              value: 'option1'
            }
          },
          component: {
            class: 'RadioInputComponent',
            config: {
              options: [
                { label: 'Option 1', value: 'option1' },
                { label: 'Option 2', value: 'option2' },
                { label: 'Option 3', value: 'option3' }
              ]
            }
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);

    const compiled = fixture.nativeElement as HTMLElement;

    // Check that the first option is selected by default
    const checkedRadio = compiled.querySelector('input[type="radio"]:checked') as HTMLInputElement;
    expect(checkedRadio).toBeTruthy();
    expect(checkedRadio.id).toEqual('radio_test-option1');

    // Check that all options have proper label bindings
    const radioInputs = compiled.querySelectorAll('input[type="radio"]');
    expect(radioInputs.length).toEqual(3);
    const labels = compiled.querySelectorAll<HTMLLabelElement>('label');
    expect(labels.length).toEqual(3);
    expect(labels[0].getAttribute('for')).toEqual('radio_test-option1');
    expect(labels[1].getAttribute('for')).toEqual('radio_test-option2');
    expect(labels[2].getAttribute('for')).toEqual('radio_test-option3');
  });

  it('should resolve language-map labels for options', async () => {
    translationService.translationMap = translationService.translationMap || {};
    translationService.translationMap['@radio-language-label'] = 'English Label';
    spyOn(translationService, 't').and.callFake((key: string) => translationService.translationMap[key] ?? key);
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'radio_lang_test',
          model: {
            class: 'RadioInputModel',
            config: {
              value: 'option1'
            }
          },
          component: {
            class: 'RadioInputComponent',
            config: {
              options: [
                { label: '@radio-language-label', value: 'option1' }
              ]
            }
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const labels = compiled.querySelectorAll<HTMLLabelElement>('label');
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0].getAttribute('for')).toEqual('radio_lang_test-option1');
  });

  it('should render disabled options', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      componentDefinitions: [
        {
          name: 'radio_disabled_test',
          model: {
            class: 'RadioInputModel',
            config: {
              value: 'legacy'
            }
          },
          component: {
            class: 'RadioInputComponent',
            config: {
              options: [
                { label: 'Active', value: 'active' },
                { label: 'Legacy', value: 'legacy', disabled: true }
              ]
            }
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const legacyInput = compiled.querySelector<HTMLInputElement>('#radio_disabled_test-legacy');
    const activeInput = compiled.querySelector<HTMLInputElement>('#radio_disabled_test-active');

    expect(legacyInput).toBeTruthy();
    if (!legacyInput) {
      throw new Error('Expected legacy radio input to be present');
    }

    expect(legacyInput?.disabled).toBeTrue();
    expect(legacyInput?.checked).toBeTrue();

    expect(activeInput).toBeTruthy();
    if (!activeInput) {
      throw new Error('Expected active radio input to be present');
    }

    legacyInput.checked = false;
    legacyInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect((formComponent as any).form.get('radio_disabled_test')?.value).toBe('legacy');

    activeInput.checked = true;
    activeInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect((formComponent as any).form.get('radio_disabled_test')?.value).toBe('active');
  });
});
