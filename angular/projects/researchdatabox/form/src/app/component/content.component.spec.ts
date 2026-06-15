import {FormConfigFrame, buildKeyString} from '@researchdatabox/sails-ng-common';
import {ContentComponent} from "./content.component";
import {SimpleInputComponent} from "./simple-input.component";
import {createFormAndWaitForReady, createTestbedModule, DynamicAssetOptions, setUpDynamicAssets} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import { UtilityService, HandlebarsTemplateService, TranslationService } from "@researchdatabox/portal-ng-common";
import Handlebars from "handlebars";



describe('ContentComponent', () => {
  let utilityService: UtilityService;
  let translationService: any;
  let lastTemplateContext: any;
  let dynamicAssetOptions: DynamicAssetOptions
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
    translationService.translationMap['@html-like-plain'] = '<strong>Project name</strong>';
    translationService.translationMap['@html-content'] = '<strong>Project name</strong>';
    spyOn(translationService, 't').and.callFake((key: string) => translationService.translationMap[key] ?? key);

    dynamicAssetOptions = {
      entries: [{
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-",
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          lastTemplateContext = context;
          switch (keyStr) {
            case "componentDefinitions__0__component__config__template":
              if (context?.content === 'USE_TRANSLATION_TEMPLATE') {
                return context?.translationService?.t?.('@dmpt-project-title') ?? '';
              }
              if (context?.content === 'USE_MISSING_TRANSLATION_TEMPLATE') {
                return context?.translationService?.t?.('@missing.translation.key') ?? '';
              }
              if (context?.content === 'USE_MARKDOWN_TEMPLATE') {
                return context?.outputFormat === 'markdown'
                  ? '<h2>Hi <strong>How does this render</strong></h2><table><tbody><tr><td>and</td><td>not</td><td>something</td></tr></tbody></table>'
                  : context?.content;
              }
              return Handlebars.compile('<h3>{{content}}</h3>')(context);
            default:
              throw new Error(`Unknown key: ${keyStr}`);
          }
        }
      }]
    };
  });

  it('should create component', () => {
    setUpDynamicAssets();
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
    const {fixture, formComponent} = await createFormAndWaitForReady(
      formConfig, undefined, undefined, dynamicAssetOptions);

    // assert
    expect(utilityService.getDynamicImport).toHaveBeenCalled();

    const compiled = fixture.nativeElement as HTMLElement;
    const element = compiled.querySelector('h3');
    expect((element as HTMLHeadingElement)?.textContent).toEqual('My first text block component!!!');
    expect(compiled.querySelector('.rb-form-content')?.classList.contains('rb-form-rich-text-content')).toBeFalse();
  });

  it('should expose outputFormat to content templates for markdown rich text view rendering', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'markdown_content',
          component: {
            class: 'ContentComponent',
            config: {
              content: 'USE_MARKDOWN_TEMPLATE',
              outputFormat: 'markdown',
              template: '{{{markdownToHtml content outputFormat}}}'
            }
          }
        }
      ]
    };

    const {fixture} = await createFormAndWaitForReady(
      formConfig, undefined, undefined, dynamicAssetOptions);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(lastTemplateContext?.outputFormat).toEqual('markdown');
    expect(compiled.querySelector('.rb-form-content')?.classList.contains('rb-form-rich-text-content')).toBeTrue();
    expect(compiled.querySelector('h2')?.innerHTML).toContain('<strong>How does this render</strong>');
    expect(compiled.querySelector('table td')?.textContent).toEqual('and');
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
    const {fixture} = await createFormAndWaitForReady(
      formConfig, { editMode: true } as any, undefined, dynamicAssetOptions);

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
    const {fixture} = await createFormAndWaitForReady(
      formConfig, undefined, undefined, dynamicAssetOptions);

    // assert
    const compiled = fixture.nativeElement as HTMLElement;
    const element = compiled.querySelector('span');
    expect((element as HTMLSpanElement)?.textContent).toEqual('Project name');
  });

  it('should escape translated plain text that contains HTML-like content', async () => {
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
              content: '@html-like-plain',
              contentIsTranslationCode: true,
              translationContentFormat: 'plain'
            } as any
          }
        }
      ]
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);

    const compiled = fixture.nativeElement as HTMLElement;
    const element = compiled.querySelector('span') as HTMLSpanElement;
    expect(element.textContent).toEqual('<strong>Project name</strong>');
    expect(element.querySelector('strong')).toBeNull();
  });

  it('should render translated HTML when translationContentFormat is html', async () => {
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
              content: '@html-content',
              contentIsTranslationCode: true,
              translationContentFormat: 'html'
            } as any
          }
        }
      ]
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);

    const compiled = fixture.nativeElement as HTMLElement;
    const element = compiled.querySelector('span') as HTMLSpanElement;
    expect(element.textContent).toEqual('Project name');
    expect(element.querySelector('strong')?.textContent).toEqual('Project name');
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

    const {fixture} = await createFormAndWaitForReady(
      formConfig, undefined, undefined, dynamicAssetOptions);
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

    const {fixture} = await createFormAndWaitForReady(
      formConfig, undefined, undefined, dynamicAssetOptions);
    const compiled = fixture.nativeElement as HTMLElement;
    const element = compiled.querySelector('span');
    expect((element as HTMLSpanElement)?.textContent).toEqual('@missing.translation.key');
  });

});
