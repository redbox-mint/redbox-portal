import { TestBed } from "@angular/core/testing";
import { FormService } from "./form.service";
import {
  ConfigService,
  FormFieldCompMapEntry,
  getStubConfigService,
  getStubTranslationService,
  LoggerService,
  providePortalI18nTesting,
  TranslationService,
  UtilityService
} from "@researchdatabox/portal-ng-common";
import { APP_BASE_HREF } from "@angular/common";
import { Title } from "@angular/platform-browser";
import { HttpContext, provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import {
  FormConfigFrame,
  FormFieldValidationGroup,
  formValidatorsSharedDefinitions,
  FormModesConfig,
  FormValidationGroups,
  FormValidatorConfig,
  FormValidatorSummaryErrors,
  LineagePaths
} from "@researchdatabox/sails-ng-common";
import { FormValidationGroupsChangeInitial } from "./form-state";
import { VocabTreeService } from "./service/vocab-tree.service";
import { setUpDynamicAssets } from "./helpers.spec";
import { FormControl } from "@angular/forms";


describe('The FormService', () => {
  const configService = getStubConfigService();
  const translationService = getStubTranslationService();
  let service: FormService;
  let httpTesting: HttpTestingController;
  const waitForAsyncValidation = () => new Promise(resolve => setTimeout(resolve, 0));
  beforeEach(() => {
    (window as any).redboxClientScript = { formValidatorDefinitions: formValidatorsSharedDefinitions };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'http://localhost'
        },
        LoggerService,
        UtilityService,
        {
          provide: TranslationService,
          useValue: translationService
        },
        {
          provide: ConfigService,
          useValue: configService
        },
        Title,
        FormService,
        VocabTreeService,
        providePortalI18nTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ]
    });
    service = TestBed.inject(FormService);
    httpTesting = TestBed.inject(HttpTestingController);
    (service as any).brandingAndPortalUrl = "http://localhost/default/rdmp";
    (service as any).httpContext = new HttpContext();
  });

  afterEach(() => {
    if (httpTesting) {
      httpTesting.verify();
    }
  });

  it('should create an instance', () => {
    expect(service).toBeTruthy();
  });

  it('should resolve accordion component classes from static map', async () => {
    const componentDefinitions = [
      {
        name: 'accordion_1',
        component: { class: 'AccordionComponent', config: { panels: [] } },
        layout: { class: 'AccordionLayout' },
      },
      {
        name: 'accordion_panel_1',
        component: { class: 'AccordionPanelComponent', config: { componentDefinitions: [] } },
        layout: { class: 'AccordionPanelLayout' },
      },
    ] as any;

    const lineagePaths: LineagePaths = service.buildLineagePaths({
      angularComponents: [],
      dataModel: [],
      formConfig: [],
      layout: []
    });

    const entries = await service.resolveFormComponentClasses(componentDefinitions, lineagePaths);

    expect(entries.length).toBe(2);
    expect(entries[0].componentClass?.name).toBe('AccordionComponent');
    expect(entries[1].componentClass?.name).toBe('AccordionPanelComponent');
  });

  describe('JSONata helpers', () => {
    const createEntry = (
      name: string,
      pointer: string,
      children: FormFieldCompMapEntry[] = []
    ): FormFieldCompMapEntry => ({
      compConfigJson: { name },
      lineagePaths: { angularComponentsJsonPointer: pointer } as any,
      component: { formFieldCompMapEntries: children } as any
    } as unknown as FormFieldCompMapEntry);

    it('transformIntoJSONataProperty should include nested children metadata', () => {
      const childEntry = createEntry('child', '/components/0/child');
      const parentEntry = createEntry('parent', '/components/0', [childEntry]);

      const property = service.transformIntoJSONataProperty(parentEntry);

      expect(property.name).toBe('parent');
      expect(property.jsonPointer).toBe('/components/0');
      expect(property.children?.length).toBe(1);
      expect(property.children?.[0].name).toBe('child');
      expect(property.children?.[0].jsonPointer).toBe('/components/0/child');
    });

    it('transformJSONataEntryToJSONPointerSource should build JSON pointer metadata tree', () => {
      const childEntry = createEntry('child', '/components/0/child');
      const parentEntry = createEntry('parent', '/components/0', [childEntry]);
      const property = service.transformIntoJSONataProperty(parentEntry);

      const result = service.transformJSONataEntryToJSONPointerSource({}, parentEntry, property);
      const parentPointer = (result as any)['0'];
      const childPointer = parentPointer?.child;

      expect(parentPointer?.metadata?.formFieldEntry?.compConfigJson?.name).toBe('parent');
      expect(childPointer?.metadata?.formFieldEntry?.compConfigJson?.name).toBe('child');
    });

    it('getPropertyNameFromJSONPointerAsNumber should return numeric segments or fallback names', () => {
      const getProp = (service as any).getPropertyNameFromJSONPointerAsNumber.bind(service);

      expect(getProp('/components/3', 'component')).toBe('3');
      expect(getProp('/components/child', 'childName')).toBe('childName');
    });

    it('getJSONataQuerySource should map entries and pointer metadata', () => {
      const childEntry = createEntry('child', '/components/0/child');
      const parentEntry = createEntry('parent', '/components/0', [childEntry]);

      const source = service.getJSONataQuerySource([parentEntry], {
        requestParams: {
          workspace: 'active'
        }
      });

      expect(source.querySource.length).toBe(2);
      expect(source.querySource[0].name).toBe('parent');
      expect((source.jsonPointerSource as any)['0'].metadata.formFieldEntry).toBe(parentEntry);
      expect((source.jsonPointerSource as any)['0'].child.metadata.formFieldEntry).toBe(childEntry);
      expect(source.runtimeContext?.requestParams).toEqual({
        workspace: 'active'
      });
    });

    it('should evaluate jsonata-expression validator as part of suggested validation errors', async () => {
      const expression = "$ = 45";
      const mapEntry: FormFieldCompMapEntry = {
        // @ts-ignore
        model: {
          formControl: new FormControl("hello world 2!"),
          validators: [{
            class: 'jsonata-expression',
            config: {
              description: "the description",
              expression: expression,
            },
          },],
        },
        compConfigJson: {
          name: "text_7",
          component: {
            class: "SimpleInputComponent"
          }
        },
        lineagePaths: {
          formConfig: ["componentDefinitions", "0"],
          dataModel: ["text_7"],
          angularComponents: ["text_7"],
          angularComponentsJsonPointer: "/text_7",
          layout: ["text_7-layout"],
          layoutJsonPointer: "/text_7-layout",
        },
      };
      const enabledValidationGroups: string[] = ["all"];
      const validationGroups: FormValidationGroups = {};
      const expected: FormValidatorSummaryErrors[] = [
        {
          errors: [
            {
              message: "@validator-error-jsonata-expression",
              class: "jsonata-expression",
              params: {
                actual: "hello world 2!",
                description: "the description",
                expression: expression,
              },
            },
          ],
          id: "form-item-id-text-7",
          message: null,
          lineagePaths: {
            formConfig: ["componentDefinitions", "0"],
            dataModel: ["text_7"],
            angularComponents: ["text_7"],
            angularComponentsJsonPointer: "/text_7",
            layout: ["text_7-layout"],
            layoutJsonPointer: "/text_7-layout",
          },
        }
      ];
      const actual = await service.getSuggestedValidatorSummaryErrors(mapEntry, enabledValidationGroups, validationGroups);
      expect(actual).toEqual(expected);
    });

    it('should attach jsonata-expression as a hard async validator failure', async () => {
      const control = new FormControl("hello world 2!");
      const validators: FormValidatorConfig[] = [{
        class: 'jsonata-expression',
        config: {
          description: "the description",
          expression: "$ = 45",
        },
      }];
      const mapEntry = {
        lineagePaths: {
          formConfig: ["componentDefinitions", "0"],
        },
      } as unknown as FormFieldCompMapEntry;

      service.setValidators(control, validators, ["all"], {}, { doUpdate: true }, mapEntry);
      await waitForAsyncValidation();

      expect(control.invalid).toBeTrue();
      expect(control.errors?.['jsonata-expression']).toEqual({
        message: "@validator-error-jsonata-expression",
        params: {
          actual: "hello world 2!",
          description: "the description",
          expression: "$ = 45",
        },
      });
    });

    it('should attach jsonata-expression as a hard async validator pass', async () => {
      const control = new FormControl(45);
      const validators: FormValidatorConfig[] = [{
        class: 'jsonata-expression',
        config: {
          description: "the description",
          expression: "$ = 45",
        },
      }];
      const mapEntry = {
        lineagePaths: {
          formConfig: ["componentDefinitions", "0"],
        },
      } as unknown as FormFieldCompMapEntry;

      service.setValidators(control, validators, ["all"], {}, { doUpdate: true }, mapEntry);
      await waitForAsyncValidation();

      expect(control.valid).toBeTrue();
      expect(control.errors).toBeNull();
    });

    it('should keep both errors when the same validator class is used twice on one control', async () => {
      const control = new FormControl("hello world 2!");
      const validators: FormValidatorConfig[] = [
        { class: 'pattern', message: "@must-start-with-prefix", config: { pattern: "^prefix.*$", description: "must start with prefix" } },
        { class: 'pattern', message: "@must-end-with-suffix", config: { pattern: ".*suffix$", description: "must end with suffix" } },
      ];
      const mapEntry = {
        lineagePaths: {
          formConfig: ["componentDefinitions", "0"],
        },
      } as unknown as FormFieldCompMapEntry;

      service.setValidators(control, validators, ["all"], {}, { doUpdate: true }, mapEntry);
      await waitForAsyncValidation();

      expect(control.invalid).toBeTrue();
      // Both validators kept their own entry in the merged errors object (no collision).
      expect(Object.keys(control.errors ?? {}).sort()).toEqual(["pattern#0", "pattern#1"]);

      // The real class is recovered for display, so both appear as 'pattern'.
      const componentErrors = service.getFormValidatorComponentErrors(control);
      expect(componentErrors.map(e => e.class)).toEqual(["pattern", "pattern"]);
      expect(componentErrors.map(e => e.message).sort()).toEqual(["@must-end-with-suffix", "@must-start-with-prefix"]);
    });
  });

  describe('getDynamicImportFormCompiledItems', () => {
    beforeEach(() => {
      (service as any).brandingAndPortalUrl = 'http://localhost/default/rdmp';
    });

    it('should use the provided recordType when building the dynamic asset path', async () => {
      const utilityService = TestBed.inject(UtilityService);
      const getDynamicImportSpy = spyOn(utilityService, 'getDynamicImport').and.resolveTo({ evaluate: () => '' } as any);

      await service.getDynamicImportFormCompiledItems('rdmp', 'oid-123', 'view');

      expect(getDynamicImportSpy).toHaveBeenCalledWith(
        'http://localhost/default/rdmp',
        ['dynamicAsset', 'formCompiledItems', 'rdmp', 'oid-123'],
        undefined
      );
    });

    it('should fall back to auto recordType for existing records when the recordType is blank', async () => {
      const utilityService = TestBed.inject(UtilityService);
      const getDynamicImportSpy = spyOn(utilityService, 'getDynamicImport').and.resolveTo({ evaluate: () => '' } as any);

      await service.getDynamicImportFormCompiledItems('', 'oid-123', 'view');

      expect(getDynamicImportSpy).toHaveBeenCalledWith(
        'http://localhost/default/rdmp',
        ['dynamicAsset', 'formCompiledItems', 'auto', 'oid-123'],
        undefined
      );
    });

    it('should preserve edit mode query params with the auto recordType fallback', async () => {
      const utilityService = TestBed.inject(UtilityService);
      const getDynamicImportSpy = spyOn(utilityService, 'getDynamicImport').and.resolveTo({ evaluate: () => '' } as any);

      await service.getDynamicImportFormCompiledItems('', 'oid-123', 'edit' as FormModesConfig);

      expect(getDynamicImportSpy).toHaveBeenCalledWith(
        'http://localhost/default/rdmp',
        ['dynamicAsset', 'formCompiledItems', 'auto', 'oid-123'],
        { edit: 'true' }
      );
    });

    it('should use the provided form mode when building compiled validator imports', async () => {
      const getDynamicImportFormCompiledItemsSpy = spyOn(service, 'getDynamicImportFormCompiledItems').and.resolveTo({ evaluate: () => '' } as any);
      const formConfig: FormConfigFrame = {
        name: 'testing',
        type: 'rdmp',
        componentDefinitions: []
      };
      const parentLineagePaths = service.buildLineagePaths({
        angularComponents: [],
        dataModel: [],
        formConfig: [],
        layout: []
      });

      await service.createFormComponentsMap(formConfig, parentLineagePaths, undefined, 'view');

      expect(getDynamicImportFormCompiledItemsSpy).toHaveBeenCalledWith('rdmp', undefined, 'view');
    });
  });

  describe('calculate enabled validation groups', async () => {
    const cases: {
      title: string;
      args: {
        currentValidationGroups: string[],
        validationGroups: FormValidationGroups,
        initial?: FormValidationGroupsChangeInitial,
        groups?: FormFieldValidationGroup
      };
      expected: string[];
    }[] = [
        {
          title: "be empty with empty parameters",
          args: { currentValidationGroups: [], validationGroups: {} },
          expected: [],
        },
        {
          title: "add included group to current groups",
          args: {
            currentValidationGroups: ["none"],
            validationGroups: {
              "none": { description: "", initialMembership: "none" },
              "tester": { description: "" }
            },
            initial: "current",
            groups: { include: ["tester"] },
          },
          expected: ["none", "tester"],
        },
        {
          title: "remove excluded group from current groups",
          args: {
            currentValidationGroups: ["none"],
            validationGroups: {
              "none": { description: "", initialMembership: "none" },
              "tester": { description: "" }
            },
            initial: "current",
            groups: { exclude: ["none"] },
          },
          expected: [],
        },
        {
          title: "remove excluded group from all groups",
          args: {
            currentValidationGroups: [],
            validationGroups: {
              "none": { description: "", initialMembership: "none" },
              "tester": { description: "" }
            },
            initial: "all",
            groups: { exclude: ["tester"] },
          },
          expected: ["none"],
        },
        {
          title: "set included group with initial none",
          args: {
            currentValidationGroups: ["none"],
            validationGroups: {
              "none": { description: "", initialMembership: "none" },
              "tester": { description: "" }
            },
            initial: "none",
            groups: { include: ["tester"] },
          },
          expected: ["tester"],
        },
      ];
    cases.forEach(({ title, args, expected }) => {
      it(`should ${title}`, async function () {
        const results = service.calculateValidationGroups(args.currentValidationGroups, args.validationGroups, args.initial, args.groups);
        expect(results).toEqual(expected);
      });
    });
  });

  it("should download form components and form config meta", async function () {
    const basicFormConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'form-control'
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'test_field',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'initial value'
            }
          },
          component: {
            class: 'SimpleInputComponent',
            config: {
              type: 'text',
              label: 'Test Field'
            }
          }
        }
      ]
    };
    const meta: Record<string, unknown> = {
      workflow: { stage: 'draft', stageLabel: 'Draft' },
      contextVariables: { 'one': 1 },
    };
    setUpDynamicAssets();
    const oid = "oid", recordType = "auto", editMode = false, formName = "", modulePaths: string[] = [];
    const result = service.downloadFormComponents(oid, recordType, editMode, formName, modulePaths);
    const req = httpTesting.expectOne((request) =>
      request.url.startsWith(`http://localhost/default/rdmp/record/form/${recordType}/${oid}`));
    expect(req.request.method).toBe('GET');
    req.flush({ data: basicFormConfig, meta: meta });
    expect((await result).formConfigMeta).toEqual(meta);
  });

  it("should seed vocab-tree prehydrate payload before creating form components", async function () {
    const basicFormConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      componentDefinitions: []
    };
    const vocabTreeService = TestBed.inject(VocabTreeService);
    const seedVocabSpy = spyOn(vocabTreeService, 'seedFromPayload');
    const createSpy = spyOn(service, 'createFormComponentsMap').and.resolveTo({ formConfigMeta: {} } as any);

    const promise = service.downloadFormComponents('oid', 'auto', false, '', []);
    const req = httpTesting.expectOne((request) =>
      request.url.startsWith('http://localhost/default/rdmp/record/form/auto/oid'));
    req.flush({
      data: basicFormConfig,
      meta: {},
      prehydrate: { vocabTrees: { access: { childrenByParentId: {}, selectedNotations: [] } } }
    });
    await promise;

    expect(seedVocabSpy).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalled();
    expect(seedVocabSpy).toHaveBeenCalledWith({ vocabTrees: { access: { childrenByParentId: {}, selectedNotations: [] } } });
  });

  it("should find nested component", async function () {
    const entryTwo: FormFieldCompMapEntry = {
      // @ts-ignore
      compConfigJson: {name: "two"},
      // @ts-ignore
      lineagePaths: {dataModel: ["one", "two"]},
      // @ts-ignore
      component: {formFieldCompMapEntries: []},
    };
    const entryOne: FormFieldCompMapEntry = {
      // @ts-ignore
      compConfigJson: {name: "one"},
      // @ts-ignore
      lineagePaths: {dataModel: ["one"]},
      // @ts-ignore
      component: {formFieldCompMapEntries: [entryTwo]},
    };
    const entries: FormFieldCompMapEntry[] = [entryOne];
    const actual = service.getFormFieldCompMapEntry({dataModel: ["one", "two"]}, entries);
    expect(actual).toEqual(entryTwo);
  });

  it("should not find nested component with incorrect query", async function () {
    const entryTwo: FormFieldCompMapEntry = {
      // @ts-ignore
      compConfigJson: {name: "two"},
      // @ts-ignore
      lineagePaths: {dataModel: ["one", "two"]},
      // @ts-ignore
      component: {formFieldCompMapEntries: []},
    };
    const entryOne: FormFieldCompMapEntry = {
      // @ts-ignore
      compConfigJson: {name: "one"},
      // @ts-ignore
      lineagePaths: {dataModel: ["one"]},
      // @ts-ignore
      component: {formFieldCompMapEntries: [entryTwo]},
    };
    const entries: FormFieldCompMapEntry[] = [entryOne];
    const actual = service.getFormFieldCompMapEntry({dataModel: ["two"]}, entries);
    expect(actual).toEqual(undefined);
  });
});
