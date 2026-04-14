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
import {HttpContext, provideHttpClient} from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import {
  FormConfigFrame,
  FormFieldValidationGroup,
  FormModesConfig,
  FormValidationGroups,
  LineagePaths
} from "@researchdatabox/sails-ng-common";
import {FormValidationGroupsChangeInitial} from "./form-state";


describe('The FormService', () => {
  const configService = getStubConfigService();
  const translationService = getStubTranslationService();
  let service: FormService;
  let httpTesting: HttpTestingController;
  beforeEach(() => {
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
    }[] =[
      {
        title: "be empty with empty parameters",
        args: {currentValidationGroups:[], validationGroups: {} },
        expected: [],
      },
      {
        title: "add included group to current groups",
        args: {
          currentValidationGroups: ["none"],
          validationGroups: {
            "none": {description: "", initialMembership:"none"},
            "tester": {description: ""}
          },
          initial: "current",
          groups:{include: ["tester"]},
        },
        expected: ["none", "tester"],
      },
      {
        title: "remove excluded group from current groups",
        args: {
          currentValidationGroups: ["none"],
          validationGroups: {
            "none": {description: "", initialMembership:"none"},
            "tester": {description: ""}
          },
          initial: "current",
          groups:{exclude: ["none"]},
        },
        expected: [],
      },
      {
        title: "remove excluded group from all groups",
        args: {
          currentValidationGroups: [],
          validationGroups: {
            "none": {description: "", initialMembership:"none"},
            "tester": {description: ""}
          },
          initial: "all",
          groups:{exclude: ["tester"]},
        },
        expected: ["none"],
      },
      {
        title: "set included group with initial none",
        args: {
          currentValidationGroups: ["none"],
          validationGroups: {
            "none": {description: "", initialMembership:"none"},
            "tester": {description: ""}
          },
          initial: "none",
          groups:{include: ["tester"]},
        },
        expected: ["tester"],
      },
    ];
    cases.forEach(({title, args, expected}) => {
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
      workflow: {stage: 'draft', stageLabel: 'Draft'},
      contextVariables: {'one': 1},
    };
    const oid = "oid", recordType = "auto", editMode = false, formName = "", modulePaths: string[] = [];
    const result = service.downloadFormComponents(oid, recordType, editMode, formName, modulePaths);
    const req = httpTesting.expectOne((request) =>
      request.url.startsWith(`http://localhost/default/rdmp/record/form/${recordType}/${oid}`));
    expect(req.request.method).toBe('GET');
    req.flush({data: basicFormConfig, meta: meta});
    expect((await result).formConfigMeta).toEqual(meta);
  });
});
