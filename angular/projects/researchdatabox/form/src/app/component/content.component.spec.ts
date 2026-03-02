import {FormConfigFrame, buildKeyString} from '@researchdatabox/sails-ng-common';
import {ContentComponent} from "./content.component";
import {SimpleInputComponent} from "./simple-input.component";
import {createFormAndWaitForReady, createTestbedModule, setUpDynamicAssets} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import { UtilityService, HandlebarsTemplateService, TranslationService } from "@researchdatabox/portal-ng-common";
import Handlebars from "handlebars";



describe('ContentComponent', () => {
  let utilityService: UtilityService;
  let translationService: any;
  let lastTemplateContext: any;
  const mockHandlebarsTemplateService = {
    getLibraries: () => ({ Handlebars })
  };

  beforeEach(async () => {
    lastTemplateContext = undefined;
    await createTestbedModule({
      declarations: {"ContentComponent": ContentComponent, "SimpleInputComponent": SimpleInputComponent},
      providers: {
        "UtilityService": null,
        "HandlebarsTemplateService": {provide: HandlebarsTemplateService, useValue: mockHandlebarsTemplateService}
      }
    });
    utilityService = TestBed.inject(UtilityService);
    translationService = TestBed.inject(TranslationService as any);
    translationService.translationMap['@dmpt-project-title'] = 'Project name';
    spyOn(translationService, 't').and.callFake((key: string) => translationService.translationMap[key] ?? key);

    setUpDynamicAssets({
      callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
        lastTemplateContext = context;
        if (keyStr.endsWith("__component__config__template")) {
          if (context?.content === 'USE_TRANSLATION_TEMPLATE') {
            return context?.translationService?.t?.('@dmpt-project-title') ?? '';
          }
          if (context?.content === 'USE_MISSING_TRANSLATION_TEMPLATE') {
            return context?.translationService?.t?.('@missing.translation.key') ?? '';
          }
          if (context?.content === 'title') {
            return `<h3>${Object.prototype.hasOwnProperty.call(context ?? {}, 'formData')}</h3>`;
          }
          return Handlebars.compile('<h3>{{content}}</h3>')(context);
        }
        throw new Error(`Unknown key: ${keyStr}`);
      }
    });
  });

  it('should create component', () => {
    let fixture = TestBed.createComponent(ContentComponent);
    let component = fixture.componentInstance;
    expect(utilityService.getDynamicImport).not.toHaveBeenCalled();
    expect(component).toBeDefined();
  });
  it('should render TextField component', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          component: {
            class: 'ContentComponent',
            config: {
              content: 'My first text block component!!!',
              template: '<h3>{{content}}</h3>'
            }
          }
        }
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    // assert
    expect(utilityService.getDynamicImport).toHaveBeenCalled();

    const compiled = fixture.nativeElement as HTMLElement;
    const element = compiled.querySelector('h3');
    expect((element as HTMLHeadingElement)?.textContent).toEqual('My first text block component!!!');
  });

  it('should render content as-is when contentIsTranslationCode is false', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          component: {
            class: 'ContentComponent',
            config: {
              content: '@dmpt-project-title',
              contentIsTranslationCode: false
            } as any
          }
        }
      ]
    };

    // act
    const {fixture} = await createFormAndWaitForReady(formConfig, { editMode: true } as any);

    // assert
    const compiled = fixture.nativeElement as HTMLElement;
    const element = compiled.querySelector('span');
    expect((element as HTMLSpanElement)?.textContent).toEqual('@dmpt-project-title');
  });

  it('should translate content when contentIsTranslationCode is true', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          component: {
            class: 'ContentComponent',
            config: {
              content: '@dmpt-project-title',
              contentIsTranslationCode: true
            } as any
          }
        }
      ]
    };

    // act
    const {fixture} = await createFormAndWaitForReady(formConfig);

    // assert
    const compiled = fixture.nativeElement as HTMLElement;
    const element = compiled.querySelector('span');
    expect((element as HTMLSpanElement)?.textContent).toEqual('Project name');
  });

  it('should pass translationService into template context', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          component: {
            class: 'ContentComponent',
            config: {
              content: 'USE_TRANSLATION_TEMPLATE',
              template: '{{t "@dmpt-project-title"}}'
            }
          }
        }
      ]
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const element = compiled.querySelector('span');
    expect((element as HTMLSpanElement)?.textContent).toEqual('Project name');
    expect(lastTemplateContext?.translationService).toBeDefined();
    expect(typeof lastTemplateContext?.translationService?.t).toEqual('function');
  });

  it('should fallback to translation key when template key is missing', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          component: {
            class: 'ContentComponent',
            config: {
              content: 'USE_MISSING_TRANSLATION_TEMPLATE',
              template: '{{t "@missing.translation.key"}}'
            }
          }
        }
      ]
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const element = compiled.querySelector('span');
    expect((element as HTMLSpanElement)?.textContent).toEqual('@missing.translation.key');
  });

  it('should expose formData in template context', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'title',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'Expected title value',
            },
          },
          component: {
            class: 'SimpleInputComponent',
          },
        },
        {
          name: 'text_1_event',
          component: {
            class: 'ContentComponent',
            config: {
              content: 'title',
              template: '<h3>{{get formData content ""}}</h3>'
            }
          }
        }
      ]
    };

    const {fixture} = await createFormAndWaitForReady(formConfig, { editMode: true } as any);
    const compiled = fixture.nativeElement as HTMLElement;
    const element = compiled.querySelector('h3');
    expect((element as HTMLHeadingElement)?.textContent).toEqual('true');
    expect(lastTemplateContext?.formData).toBeDefined();
  });

});
