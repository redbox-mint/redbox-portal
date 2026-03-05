import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { DropdownInputComponent } from './dropdown-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { TestBed } from '@angular/core/testing';
import i18next from 'i18next';

describe('DropdownInputComponent', () => {
  let translationService: any;

  beforeEach(async () => {
    ({ translationService } = await createTestbedModule({ declarations: { "DropdownInputComponent": DropdownInputComponent } }));
    translationService.getCurrentLanguage = jasmine.createSpy('getCurrentLanguage').and.returnValue('en');
    translationService.translationMap = translationService.translationMap || {};
    translationService.t = jasmine.createSpy('t').and.callFake((key: string) => translationService.translationMap[key] ?? key);
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

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const selectEl = compiled.querySelector('select') as HTMLSelectElement;
    expect(selectEl).toBeTruthy();
    expect(formComponent.form?.get('dropdown_test')?.value).toEqual('b');
  });

  it('should translate placeholder and option labels', async () => {
    if (!i18next.isInitialized) {
      await i18next.init({
        lng: 'en',
        fallbackLng: 'en',
        returnEmptyString: false,
        resources: {
          en: {
            translation: {},
          },
        },
      });
    }
    i18next.addResourceBundle('en', 'translation', {
      '@dropdown-placeholder': 'Choose one',
      '@dropdown-label-en': 'English Label',
    }, true, true);
    await i18next.changeLanguage('en');

    translationService.translationMap['@dropdown-placeholder'] = 'Choose one';
    translationService.translationMap['@dropdown-label-en'] = 'English Label';

    const formConfig: FormConfigFrame = {
      name: 'testing_dropdown_translation',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'dropdown_lang_test',
          model: {
            class: 'DropdownInputModel',
            config: {
              value: 'en',
            },
          },
          component: {
            class: 'DropdownInputComponent',
            config: {
              placeholder: '@dropdown-placeholder',
              options: [
                { label: '@dropdown-label-en', value: 'en' },
              ],
            },
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const selectEl = compiled.querySelector('select') as HTMLSelectElement;
    expect(selectEl.options.length).toBe(2);
    expect(selectEl.options[0].text).toBe('Choose one');
    expect(selectEl.options[1].text).toBe('English Label');
    expect(formComponent.form?.get('dropdown_lang_test')?.value).toEqual('en');
  });
});
