import { TestBed } from "@angular/core/testing";
import { FormService } from "./form.service";
import {
  ConfigService,
  FormFieldCompMapEntry,
  getStubConfigService,
  getStubTranslationService,
  LoggerService,
  TranslationService,
  UtilityService
} from "@researchdatabox/portal-ng-common";
import { APP_BASE_HREF } from "@angular/common";
import { Title } from "@angular/platform-browser";
import { provideI18Next } from "angular-i18next";
import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { FormModesConfig, LineagePaths } from "@researchdatabox/sails-ng-common";


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
        provideI18Next(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ]
    });
    service = TestBed.inject(FormService);
    httpTesting = TestBed.inject(HttpTestingController);
  });
  it('should create an instance', () => {
    expect(service).toBeTruthy();
    httpTesting.verify();
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

      const source = service.getJSONataQuerySource([parentEntry]);

      expect(source.querySource.length).toBe(2);
      expect(source.querySource[0].name).toBe('parent');
      expect((source.jsonPointerSource as any)['0'].metadata.formFieldEntry).toBe(parentEntry);
      expect((source.jsonPointerSource as any)['0'].child.metadata.formFieldEntry).toBe(childEntry);
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
});
