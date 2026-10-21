import {FormConfigFrame, FormFieldComponentStatus, handlebarsCompile, handlebarsPrecompile, handlebarsTemplate, loadMarkdownParser} from '@researchdatabox/sails-ng-common';
import {ContentComponent} from "./content.component";
import {SimpleInputComponent} from "./simple-input.component";
import {createFormAndWaitForReady, createTestbedModule, DynamicAssetOptions, setUpDynamicAssets} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import { UtilityService, HandlebarsTemplateService, TranslationService } from "@researchdatabox/portal-ng-common";
import { FormControl, FormGroup } from '@angular/forms';



describe('ContentComponent', () => {
  let utilityService: UtilityService;
  let translationService: any;
  let lastTemplateContext: any;
  let dynamicAssetOptions: DynamicAssetOptions
  let mockHandlebarsTemplateService: jasmine.SpyObj<HandlebarsTemplateService>;

  beforeEach(async () => {
    lastTemplateContext = undefined;
    mockHandlebarsTemplateService = jasmine.createSpyObj('HandlebarsTemplateService', ['prepareTemplates']);
    mockHandlebarsTemplateService.prepareTemplates.and.callFake(templates =>
      HandlebarsTemplateService.prototype.prepareTemplates.call({ loadMarkdownParser } as any, templates));
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
              if (context?.outputFormat === 'markdown') {
                const spec = new Function('return ' + handlebarsPrecompile('{{{markdownToHtml content outputFormat}}}'))();
                return extra?.libraries?.handlebars?.(spec)(context);
              }
              return handlebarsCompile('<h3>{{content}}</h3>')(context);
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

  function createMarkdownContent(template = '{{{markdownToHtml content outputFormat}}}') {
    const fixture = TestBed.createComponent(ContentComponent);
    const component = fixture.componentInstance;
    component.componentDefinition = { class: 'ContentComponent', config: {
      content: '**first**', outputFormat: 'markdown', template,
    } };
    const spec = new Function('return ' + handlebarsPrecompile(template))();
    const evaluate = jasmine.createSpy('evaluate').and.callFake((_key, context, extra) =>
      extra.libraries.handlebars(spec)(context));
    const form = new FormGroup({ description: new FormControl('**initial**') });
    const formComponent = {
      getRecordCompiledItems: async () => ({ evaluate }), form, formConfigMeta: {},
      trimmedParams: { oid: () => 'oid', branding: () => 'default', portal: () => 'rdmp' },
    };
    Object.defineProperty(component, 'getFormComponent', { get: () => formComponent });
    Object.defineProperty(component, 'formComponent', { get: () => formComponent });
    return { fixture, component, evaluate, form };
  }

  it('keeps initial content blank and busy until the parser is ready, then renders HTML', async () => {
    let ready!: () => void;
    mockHandlebarsTemplateService.prepareTemplates.and.returnValue(new Promise<void>(resolve => ready = resolve));
    const { component, evaluate, fixture } = createMarkdownContent();
    const initialisation = (component as any).initData();
    expect(component.isContentLoading()).toBeTrue();
    expect(component.content).toBe('');
    expect(evaluate).not.toHaveBeenCalled();
    await loadMarkdownParser();
    ready();
    await initialisation;
    fixture.detectChanges();
    expect(component.isContentLoading()).toBeFalse();
    expect(fixture.nativeElement.querySelector('strong')?.textContent).toBe('first');
  });

  it('prepares literal Markdown templates without an outputFormat and rerenders form values', async () => {
    const { component, form } = createMarkdownContent('{{{markdownToHtml formData.description "markdown"}}}');
    delete (component.componentDefinition!.config as any).outputFormat;
    await (component as any).initData();
    expect(component.content).toContain('<strong>initial</strong>');
    form.controls.description.setValue('**updated**');
    expect(component.content).toContain('<strong>updated</strong>');
    component.ngOnDestroy();
    form.controls.description.setValue('**destroyed**');
    expect(component.content).toContain('<strong>updated</strong>');
  });

  it('reports parser errors without publishing raw Markdown and permits reinitialisation', async () => {
    const { component, evaluate } = createMarkdownContent();
    mockHandlebarsTemplateService.prepareTemplates.and.rejectWith(new Error('chunk unavailable'));
    await expectAsync((component as any).initData()).toBeRejectedWithError('chunk unavailable');
    expect(component.status()).toBe(FormFieldComponentStatus.ERROR);
    expect(component.content).toBe('');
    expect(component.isContentLoading()).toBeFalse();
    expect(evaluate).not.toHaveBeenCalled();
    mockHandlebarsTemplateService.prepareTemplates.and.callFake(() => loadMarkdownParser());
    await (component as any).initData();
    expect(component.content).toContain('<strong>first</strong>');
  });

  it('does not render or subscribe after destruction during a pending parser load', async () => {
    let ready!: () => void;
    mockHandlebarsTemplateService.prepareTemplates.and.returnValue(new Promise<void>(resolve => ready = resolve));
    const { component, fixture, evaluate } = createMarkdownContent();
    const initialisation = (component as any).initData();
    fixture.destroy();
    ready();
    await initialisation;
    expect(evaluate).not.toHaveBeenCalled();
    expect(component.content).toBe('');
  });

  it('does not replace newer content when an older preparation completes later', async () => {
    let ready!: () => void;
    mockHandlebarsTemplateService.prepareTemplates.and.returnValue(new Promise<void>(resolve => ready = resolve));
    const { component, evaluate } = createMarkdownContent();
    const olderInitialisation = (component as any).initData();
    component.componentDefinition = { class: 'ContentComponent', config: { content: 'Newer content' } };
    await (component as any).initData();
    ready();
    await olderInitialisation;
    expect(component.content).toBe('Newer content');
    expect(component.isContentLoading()).toBeFalse();
    expect(evaluate).not.toHaveBeenCalled();
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

  for (const content of [0, false]) {
    it(`should render falsy content ${JSON.stringify(content)} through a template`, async () => {
      const formConfig: FormConfigFrame = {
        name: 'testing',
        componentDefinitions: [
          {
            name: 'falsy_content',
            component: {
              class: 'ContentComponent',
              config: {
                content,
                template: '<h3>{{content}}</h3>'
              }
            }
          }
        ]
      };

      const {fixture} = await createFormAndWaitForReady(
        formConfig, undefined, undefined, dynamicAssetOptions);

      expect(lastTemplateContext?.content).toBe(content);
      expect(fixture.nativeElement.querySelector('h3')?.textContent).toBe(String(content));
    });
  }

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
              content: '## Hi **How does this render**\n\n| a | b | c |\n| --- | --- | --- |\n| and | not | something |',
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
