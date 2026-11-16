import { executeBehaviourAction, BehaviourActionExecutionContext } from '../form-state/behaviours/behaviour-actions';
import { BehaviourPipelineContext } from '../form-state/behaviours/behaviour-processors';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { withExpressionValueNotifications } from '../form-state/control-value-notifications';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { createFieldValueChangedEvent } from '../form-state/events/form-component-event.types';
import { By } from '@angular/platform-browser';
import {FormConfigFrame, handlebarsCompile, handlebarsInstance, handlebarsTemplate} from '@researchdatabox/sails-ng-common';
import { PublishDataLocationRefreshComponent } from './publish-data-location-refresh.component';
import {ContentComponent} from "./content.component";
import { FormService } from "../form.service";
import {SimpleInputComponent} from "./simple-input.component";
import {createFormAndWaitForReady, createTestbedModule, DynamicAssetOptions, setUpDynamicAssets} from "../helpers.spec";
import {TestBed, fakeAsync, flushMicrotasks, tick} from "@angular/core/testing";
import { UtilityService, HandlebarsTemplateService, TranslationService } from "@researchdatabox/portal-ng-common";



describe('ContentComponent', () => {
  let utilityService: UtilityService;
  let translationService: any;
  let lastTemplateContext: {
    content?: unknown;
    outputFormat?: string;
    translationService?: Pick<TranslationService, 't'>;
    runtimeContext?: { record?: { hasEditAccess?: boolean } };
  } | undefined;
  let dynamicAssetOptions: DynamicAssetOptions
  const mockHandlebarsTemplateService = {};

  beforeEach(async () => {
    lastTemplateContext = undefined;
    await createTestbedModule({
      declarations: {"ContentComponent": ContentComponent, "SimpleInputComponent": SimpleInputComponent, PublishDataLocationRefreshComponent},
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
              return handlebarsCompile('<h3>{{content}}</h3>')(context);
            default:
              throw new Error(`Unknown key: ${keyStr}`);
          }
        }
      }]
    };
  });

  for (const hasEditAccess of [undefined, false, true]) {
    it(`renders the authoritative record-edit context (${hasEditAccess}) without changing view mode`, async () => {
      const template = '{{#if runtimeContext.record.hasEditAccess}}<a href="/record/edit/{{oid}}">Edit</a>{{/if}}';
      const formConfig: FormConfigFrame = {
        name: 'testing', componentDefinitions: [
          { name: 'edit_link', component: { class: 'ContentComponent', config: { content: {}, template } } }
        ]
      };
      // Supply API metadata before child components render, as a real form load does.
      const service = TestBed.inject(FormService);
      const createMap = service.createFormComponentsMap.bind(service);
      spyOn(service, 'createFormComponentsMap').and.callFake((config, paths, meta, mode, concurrency) =>
        createMap(config, paths, {
          ...meta,
          runtimeContext: { user: { roles: ['Researcher', 'Admin'] }, record: { hasEditAccess } }
        }, mode, concurrency));
      const assets: DynamicAssetOptions = { entries: [{
        urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-',
        callable: (_keyString, _key, context) => {
          lastTemplateContext = context;
          return handlebarsCompile(template)(context);
        }
      }] };
      const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, undefined, undefined, assets);
      const link = (fixture.nativeElement as HTMLElement).querySelector('a');
      expect(lastTemplateContext?.runtimeContext?.record?.hasEditAccess).toBe(hasEditAccess);
      expect(!!link).toBe(hasEditAccess === true);
      expect(formComponent.editMode()).toBeFalse();
      if (hasEditAccess) expect(link?.getAttribute('href')).toContain(formComponent.oid());
    });
  }

  async function createPeopleSummary(refreshValue?: Promise<string>) {
    const template = '{{formData.person}}';
    let contentReady!: () => void;
    const ready = new Promise<void>(resolve => { contentReady = resolve; });
    const render = jasmine.createSpy('render').and.callFake((_key, path, context) => {
      if (path[0] === 'behaviours') return refreshValue;
      const output = handlebarsCompile(template)(context);
      if (context.formData?.person === 'before') contentReady();
      return output;
    });
    const config: FormConfigFrame = { name: 'testing', behaviours: refreshValue ? [{
      name: 'refresh-person', condition: '/refresh::field.value.changed', conditionKind: 'jsonpointer', runOnFormReady: false,
      processors: [{ type: 'jsonataTransform', config: { hasTemplate: true } }],
      actions: [
        { type: 'setValue', config: { fieldPath: '/person' } },
        { type: 'emitEvent', config: { eventType: 'field.value.changed', fieldId: '/person', sourceId: '*' } }
      ]
    }] : [], componentDefinitions: [
      { name: 'refresh', component: { class: 'PublishDataLocationRefreshComponent' } },
      { name: 'summary', component: { class: 'ContentComponent', config: { content: {}, template } } },
      { name: 'person', component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
        model: { class: 'SimpleInputModel', config: { value: 'before' } } }
    ] };
    const assets: DynamicAssetOptions = { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-', callable: render
    }] };
    const result = await createFormAndWaitForReady(config, undefined, undefined, assets);
    await ready;
    return { ...result, render, control: result.formComponent.form!.get('person')!,
      content: result.fixture.debugElement.query(By.directive(ContentComponent)).componentInstance as ContentComponent };
  }

  it('refreshes asynchronously populated content without requiring a root value-change event', async () => {
    const { fixture, formComponent, control, content } = await createPeopleSummary();
    fakeAsync(() => {
      expect(content.content).toBe('before');
      const rootChanged = jasmine.createSpy('rootChanged');
      const sub = formComponent.form!.valueChanges.subscribe(rootChanged);
      void withExpressionValueNotifications(control, async options => control.setValue('after <script>', options));
      flushMicrotasks();
      tick(0);
      fixture.detectChanges();
      expect(rootChanged).not.toHaveBeenCalled();
      expect(content.content).toBe('after &lt;script&gt;');
      expect(fixture.nativeElement.textContent).toContain('after <script>');
      expect(formComponent.form!.pristine).toBeTrue();
      expect(formComponent.form!.untouched).toBeTrue();
      sub.unsubscribe();
    })();
  });

  it('refreshes content after a silent behaviour write and explicit emitEvent action', async () => {
    const { fixture, formComponent, content } = await createPeopleSummary();
    fakeAsync(() => {
      const rootChanged = jasmine.createSpy('rootChanged');
      const sub = formComponent.form!.valueChanges.subscribe(rootChanged);
      const context: BehaviourActionExecutionContext = {
        behaviourIndex: 0, behaviourChain: [0], actionIndex: 0, listName: 'actions',
        eventBus: TestBed.inject(FormComponentEventBus), logger: TestBed.inject(LoggerService),
        fieldResolverContext: { formComponent }, getLogicalFieldEntry: () => undefined
      };
      const pipeline: BehaviourPipelineContext = {
        value: 'behaviour <value>', event: undefined, formData: {}, requestParams: {}, runtimeContext: {}
      };
      void executeBehaviourAction({ type: 'setValue', config: { fieldPath: '/person' } }, pipeline, context);
      flushMicrotasks();
      expect(formComponent.form!.get('person')!.value).toBe('behaviour <value>');
      expect(content.content).toBe('before');
      expect(rootChanged).not.toHaveBeenCalled();
      void executeBehaviourAction({ type: 'emitEvent', config: { eventType: 'field.value.changed', fieldId: '/person', sourceId: '*' } }, pipeline, context);
      flushMicrotasks();
      tick(0);
      fixture.detectChanges();
      expect(content.content).toBe('behaviour &lt;value&gt;');
      expect(fixture.nativeElement.textContent).toContain('behaviour <value>');
      expect(rootChanged).not.toHaveBeenCalled();
      sub.unsubscribe();
    })();
  });

  it('renders ordinary root value changes synchronously', async () => {
    const { control, content } = await createPeopleSummary();
    control.setValue('immediate <value>');
    expect(content.content).toBe('immediate &lt;value&gt;');
  });

  it('refreshes content after an asynchronous refresh behaviour finishes its silent write', async () => {
    let complete!: (value: string) => void;
    const value = new Promise<string>(resolve => { complete = resolve; });
    const { fixture, formComponent, content } = await createPeopleSummary(value);
    const refresh = fixture.debugElement.query(By.directive(PublishDataLocationRefreshComponent)).componentInstance as PublishDataLocationRefreshComponent;
    fakeAsync(() => {
      const rootChanged = jasmine.createSpy('rootChanged');
      const sub = formComponent.form!.valueChanges.subscribe(rootChanged);
      refresh.onClick();
      flushMicrotasks();
      tick(0);
      expect(content.content).toBe('before');
      complete('refreshed <value>');
      flushMicrotasks();
      tick(0);
      expect(content.content).toBe('refreshed &lt;value&gt;');
      expect(rootChanged).not.toHaveBeenCalled();
      sub.unsubscribe();
    })();
  });

  it('coalesces field notifications, ignores other forms and cancels pending refresh on destroy', async () => {
    const { fixture, formComponent, control, content, render } = await createPeopleSummary();
    fakeAsync(() => {
      const bus = TestBed.inject(FormComponentEventBus);
      const publish = (formScopeId: string) => bus.publish(createFieldValueChangedEvent({
        fieldId: '/person', sourceId: '*', value: control.value, formScopeId
      }));
      render.calls.reset();
      control.setValue('after', { emitEvent: false, onlySelf: true });
      publish('another-form');
      tick(0);
      expect(render).not.toHaveBeenCalled();
      for (const name of ['first', 'second', 'final']) {
        control.setValue(name, { emitEvent: false, onlySelf: true });
        publish(formComponent.eventScopeId);
      }
      tick(0);
      expect(render).toHaveBeenCalledTimes(1);
      expect(content.content).toBe('final');
      render.calls.reset();
      publish(formComponent.eventScopeId);
      fixture.destroy();
      tick(0);
      expect(render).not.toHaveBeenCalled();
    })();
  });

  it('awaits explicit content refresh without a form control change', async () => {
    const config: FormConfigFrame = { name: 'testing', componentDefinitions: [{ name: 'content',
      component: { class: 'ContentComponent', config: { content: 'before', template: '{{content}}' } } }] };
    const assets: DynamicAssetOptions = { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-',
      callable: (_key, _path, context) => handlebarsCompile('{{content}}')(context),
    }] };
    const { fixture } = await createFormAndWaitForReady(config, undefined, undefined, assets);
    const component = fixture.debugElement.query(By.directive(ContentComponent)).componentInstance as ContentComponent;
    (component.componentDefinition!.config as { content: string }).content = 'after';
    await (component as any).refreshContent();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('after');
    component.ngOnDestroy();
    (component.componentDefinition!.config as { content: string }).content = 'late';
    await (component as any).refreshContent();
    expect(component.content).toBe('after');
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
