/**
 * Services index - exports all service classes and creates ServiceExports object
 * for consumption by redbox-loader.js shim generation
 */

// Import all service modules and re-export
import * as AgendaQueueServiceModule from './AgendaQueueService';
import * as AppConfigServiceModule from './AppConfigService';
import * as AsynchsServiceModule from './AsynchsService';
import * as BrandingLogoServiceModule from './BrandingLogoService';
import * as BrandingServiceModule from './BrandingService';
import * as CacheServiceModule from './CacheService';
import * as ConfigServiceModule from './ConfigService';
import * as ContrastServiceModule from './ContrastService';
import * as DashboardTypesServiceModule from './DashboardTypesService';
import * as DoiServiceModule from './DoiService';
import * as EmailServiceModule from './EmailService';
import * as FigshareServiceModule from './FigshareService';
import * as FormRecordConsistencyServiceModule from './FormRecordConsistencyService';
import * as FormsServiceModule from './FormsService';
import * as I18nEntriesServiceModule from './I18nEntriesService';
import * as NamedQueryServiceModule from './NamedQueryService';
import * as NavigationServiceModule from './NavigationService';
import * as OniServiceModule from './OniService';
import * as OrcidServiceModule from './OrcidService';
import * as PathRulesServiceModule from './PathRulesService';
import * as RaidServiceModule from './RaidService';
import * as RDMPServiceModule from './RDMPService';
import * as RecordsServiceModule from './RecordsService';
import * as RecordTypesServiceModule from './RecordTypesService';
import * as ReportsServiceModule from './ReportsService';
import * as RolesServiceModule from './RolesService';
import * as SassCompilerServiceModule from './SassCompilerService';
import * as SolrSearchServiceModule from './SolrSearchService';
import * as DomSanitizerServiceModule from './DomSanitizerService';
import * as TemplateServiceModule from './TemplateService';
import * as TranslationServiceModule from './TranslationService';
import * as TriggerServiceModule from './TriggerService';
import * as UsersServiceModule from './UsersService';
import * as ViewUtilsServiceModule from './ViewUtilsService';
import * as VocabServiceModule from './VocabService';
import * as VocabularyServiceModule from './VocabularyService';
import * as WorkflowStepsServiceModule from './WorkflowStepsService';
import * as WorkspaceAsyncServiceModule from './WorkspaceAsyncService';
import * as WorkspaceServiceModule from './WorkspaceService';
import * as WorkspaceTypesServiceModule from './WorkspaceTypesService';
import * as RvaImportServiceModule from './RvaImportService';
import * as StorageManagerServiceModule from './StorageManagerService';
import * as StandardDatastreamServiceModule from './StandardDatastreamService';

// Re-export all service namespaces
export { AgendaQueueServiceModule as AgendaQueueService };
export { AppConfigServiceModule as AppConfigService };
export { AsynchsServiceModule as AsynchsService };
export { BrandingLogoServiceModule as BrandingLogoService };
export { BrandingServiceModule as BrandingService };
export { CacheServiceModule as CacheService };
export { ConfigServiceModule as ConfigService };
export { ContrastServiceModule as ContrastService };
export { DashboardTypesServiceModule as DashboardTypesService };
export { DoiServiceModule as DoiService };
export { EmailServiceModule as EmailService };
export { FigshareServiceModule as FigshareService };
export { FormRecordConsistencyServiceModule as FormRecordConsistencyService };
export { FormsServiceModule as FormsService };
export { I18nEntriesServiceModule as I18nEntriesService };
export { NamedQueryServiceModule as NamedQueryService };
export { NavigationServiceModule as NavigationService };
export { OniServiceModule as OniService };
export { OrcidServiceModule as OrcidService };
export { PathRulesServiceModule as PathRulesService };
export { RaidServiceModule as RaidService };
export { RDMPServiceModule as RDMPService };
export { RecordsServiceModule as RecordsService };
export { RecordTypesServiceModule as RecordTypesService };
export { ReportsServiceModule as ReportsService };
export { RolesServiceModule as RolesService };
export { SassCompilerServiceModule as SassCompilerService };
export { SolrSearchServiceModule as SolrSearchService };
export { DomSanitizerServiceModule as DomSanitizerService };
export { TemplateServiceModule as TemplateService };
export { TranslationServiceModule as TranslationService };
export { TriggerServiceModule as TriggerService };
export { UsersServiceModule as UsersService };
export { ViewUtilsServiceModule as ViewUtilsService };
export { VocabServiceModule as VocabService };
export { VocabularyServiceModule as VocabularyService };
export { WorkflowStepsServiceModule as WorkflowStepsService };
export { WorkspaceAsyncServiceModule as WorkspaceAsyncService };
export { WorkspaceServiceModule as WorkspaceService };
export { WorkspaceTypesServiceModule as WorkspaceTypesService };
export { RvaImportServiceModule as RvaImportService };
export { StorageManagerServiceModule as StorageManagerService };
export { StandardDatastreamServiceModule as StandardDatastreamService };

/**
 * ServiceExports - Object containing lazy-instantiated service exports for use by redbox-loader.js
 * This follows the same pattern as WaterlineModels, Policies, etc.
 *
 * Each service is instantiated via `new ServiceClass().exports()` which provides
 * the method binding and exported method filtering that Sails services expect.
 *
 * Using getters for lazy instantiation to avoid issues during testing and before
 * sails globals are available.
 */
const serviceCache: Record<string, unknown> = {};

function getOrCreateService(name: string, factory: () => unknown): unknown {
  if (!serviceCache[name]) {
    serviceCache[name] = factory();
  }
  return serviceCache[name];
}

export const ServiceExports = {
  get AgendaQueueService() {
    return getOrCreateService('AgendaQueueService', () =>
      new AgendaQueueServiceModule.Services.AgendaQueue().exports()
    );
  },
  get AppConfigService() {
    return getOrCreateService('AppConfigService', () => new AppConfigServiceModule.Services.AppConfigs().exports());
  },
  get AsynchsService() {
    return getOrCreateService('AsynchsService', () => new AsynchsServiceModule.Services.Asynchs().exports());
  },
  get BrandingLogoService() {
    return getOrCreateService('BrandingLogoService', () =>
      new BrandingLogoServiceModule.Services.BrandingLogo().exports()
    );
  },
  get BrandingService() {
    return getOrCreateService('BrandingService', () => new BrandingServiceModule.Services.Branding().exports());
  },
  get CacheService() {
    return getOrCreateService('CacheService', () => new CacheServiceModule.Services.Cache().exports());
  },
  get ConfigService() {
    return getOrCreateService('ConfigService', () => new ConfigServiceModule.Services.Config().exports());
  },
  get ContrastService() {
    return getOrCreateService('ContrastService', () => new ContrastServiceModule.Services.Contrast().exports());
  },
  get DashboardTypesService() {
    return getOrCreateService('DashboardTypesService', () =>
      new DashboardTypesServiceModule.Services.DashboardTypes().exports()
    );
  },
  get DoiService() {
    return getOrCreateService('DoiService', () => new DoiServiceModule.Services.Doi().exports());
  },
  get EmailService() {
    return getOrCreateService('EmailService', () => new EmailServiceModule.Services.Email().exports());
  },
  get FigshareService() {
    return getOrCreateService('FigshareService', () => new FigshareServiceModule.Services.FigshareService().exports());
  },
  get FormRecordConsistencyService() {
    return getOrCreateService('FormRecordConsistencyService', () =>
      new FormRecordConsistencyServiceModule.Services.FormRecordConsistency().exports()
    );
  },
  get FormsService() {
    return getOrCreateService('FormsService', () => new FormsServiceModule.Services.Forms().exports());
  },
  get I18nEntriesService() {
    return getOrCreateService('I18nEntriesService', () =>
      new I18nEntriesServiceModule.Services.I18nEntries().exports()
    );
  },
  get NamedQueryService() {
    return getOrCreateService('NamedQueryService', () =>
      new NamedQueryServiceModule.Services.NamedQueryService().exports()
    );
  },
  get NavigationService() {
    return getOrCreateService('NavigationService', () => new NavigationServiceModule.Services.Navigation().exports());
  },
  get OniService() {
    return getOrCreateService('OniService', () => new OniServiceModule.Services.OniService().exports());
  },
  get OrcidService() {
    return getOrCreateService('OrcidService', () => new OrcidServiceModule.Services.Orcids().exports());
  },
  get PathRulesService() {
    return getOrCreateService('PathRulesService', () => new PathRulesServiceModule.Services.PathRules().exports());
  },
  get RaidService() {
    return getOrCreateService('RaidService', () => new RaidServiceModule.Services.Raid().exports());
  },
  get RDMPService() {
    return getOrCreateService('RDMPService', () => new RDMPServiceModule.Services.RDMPS().exports());
  },
  get RecordsService() {
    return getOrCreateService('RecordsService', () => new RecordsServiceModule.Services.Records().exports());
  },
  get RecordTypesService() {
    return getOrCreateService('RecordTypesService', () =>
      new RecordTypesServiceModule.Services.RecordTypes().exports()
    );
  },
  get ReportsService() {
    return getOrCreateService('ReportsService', () => new ReportsServiceModule.Services.Reports().exports());
  },
  get RolesService() {
    return getOrCreateService('RolesService', () => new RolesServiceModule.Services.Roles().exports());
  },
  get SassCompilerService() {
    return getOrCreateService('SassCompilerService', () =>
      new SassCompilerServiceModule.Services.SassCompiler().exports()
    );
  },
  get SolrSearchService() {
    return getOrCreateService('SolrSearchService', () =>
      new SolrSearchServiceModule.Services.SolrSearchService().exports()
    );
  },
  get DomSanitizerService() {
    return getOrCreateService('DomSanitizerService', () =>
      new DomSanitizerServiceModule.Services.DomSanitizer().exports()
    );
  },
  get TemplateService() {
    return getOrCreateService('TemplateService', () => new TemplateServiceModule.Services.Template().exports());
  },
  get TranslationService() {
    return getOrCreateService('TranslationService', () =>
      new TranslationServiceModule.Services.Translation().exports()
    );
  },
  get TriggerService() {
    return getOrCreateService('TriggerService', () => new TriggerServiceModule.Services.Trigger().exports());
  },
  get UsersService() {
    return getOrCreateService('UsersService', () => new UsersServiceModule.Services.Users().exports());
  },
  get ViewUtilsService() {
    return getOrCreateService('ViewUtilsService', () => new ViewUtilsServiceModule.Services.ViewUtils().exports());
  },
  get VocabService() {
    return getOrCreateService('VocabService', () => new VocabServiceModule.Services.Vocab().exports());
  },
  get VocabularyService() {
    return getOrCreateService('VocabularyService', () =>
      new VocabularyServiceModule.Services.VocabularyService().exports()
    );
  },
  get RvaImportService() {
    return getOrCreateService('RvaImportService', () => new RvaImportServiceModule.Services.RvaImport().exports());
  },
  get WorkflowStepsService() {
    return getOrCreateService('WorkflowStepsService', () =>
      new WorkflowStepsServiceModule.Services.WorkflowSteps().exports()
    );
  },
  get WorkspaceAsyncService() {
    return getOrCreateService('WorkspaceAsyncService', () =>
      new WorkspaceAsyncServiceModule.Services.WorkspaceAsyncService().exports()
    );
  },
  get WorkspaceService() {
    return getOrCreateService('WorkspaceService', () =>
      new WorkspaceServiceModule.Services.WorkspaceService().exports()
    );
  },
  get WorkspaceTypesService() {
    return getOrCreateService('WorkspaceTypesService', () =>
      new WorkspaceTypesServiceModule.Services.WorkspaceTypes().exports()
    );
  },
  get StorageManagerService() {
    return getOrCreateService('StorageManagerService', () =>
      new StorageManagerServiceModule.Services.StorageManager().exports()
    );
  },
  get StandardDatastreamService() {
    return getOrCreateService('StandardDatastreamService', () =>
      new StandardDatastreamServiceModule.Services.StandardDatastream().exports()
    );
  },
};
