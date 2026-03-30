/**
 * Controllers index - exports all controller classes
 */

// API controller imports
import * as ActionControllerModule from './ActionController';
import * as AdminControllerModule from './AdminController';
import * as AppConfigControllerModule from './AppConfigController';
import * as AsynchControllerModule from './AsynchController';
import * as BrandingAppControllerModule from './BrandingAppController';
import * as BrandingControllerModule from './BrandingController';
import * as DynamicAssetControllerModule from './DynamicAssetController';
import * as EmailControllerModule from './EmailController';
import * as ExportControllerModule from './ExportController';
import * as RecordAuditControllerModule from './RecordAuditController';
import * as RecordControllerModule from './RecordController';
import * as RenderViewControllerModule from './RenderViewController';
import * as ReportControllerModule from './ReportController';
import * as ReportsControllerModule from './ReportsController';
import * as TranslationControllerModule from './TranslationController';
import * as UserControllerModule from './UserController';
import * as VocabControllerModule from './VocabController';
import * as VocabularyControllerModule from './VocabularyController';
import * as WorkspaceAsyncControllerModule from './WorkspaceAsyncController';
import * as WorkspaceTypesControllerModule from './WorkspaceTypesController';
import * as FormVocabularyControllerModule from './FormVocabularyController';

// Webservice controller imports
import * as WSAdminControllerModule from './webservice/AdminController';
import * as WSAppConfigControllerModule from './webservice/AppConfigController';
import * as WSBrandingControllerModule from './webservice/BrandingController';
import * as WSExportControllerModule from './webservice/ExportController';
import * as WSFormManagementControllerModule from './webservice/FormManagementController';
import * as WSRecordControllerModule from './webservice/RecordController';
import * as WSRecordTypeControllerModule from './webservice/RecordTypeController';
import * as WSReportControllerModule from './webservice/ReportController';
import * as WSSearchControllerModule from './webservice/SearchController';
import * as WSTranslationControllerModule from './webservice/TranslationController';
import * as WSUserManagementControllerModule from './webservice/UserManagementController';
import * as WSVocabularyControllerModule from './webservice/VocabularyController';

// Lazy instantiation cache
const controllerCache: Record<string, unknown> = {};
function getOrCreate(name: string, factory: () => unknown): unknown {
    if (!controllerCache[name]) controllerCache[name] = factory();
    return controllerCache[name];
}

// API Controllers export
export const ControllerExports: Record<string, unknown> = {
    get ActionController() { return getOrCreate('ActionController', () => new ActionControllerModule.Controllers.Action().exports()); },
    get AdminController() { return getOrCreate('AdminController', () => new AdminControllerModule.Controllers.Admin().exports()); },
    get AppConfigController() { return getOrCreate('AppConfigController', () => new AppConfigControllerModule.Controllers.AppConfig().exports()); },
    get AsynchController() { return getOrCreate('AsynchController', () => new AsynchControllerModule.Controllers.Asynch().exports()); },
    get BrandingAppController() { return getOrCreate('BrandingAppController', () => new BrandingAppControllerModule.Controllers.BrandingApp().exports()); },
    get BrandingController() { return getOrCreate('BrandingController', () => new BrandingControllerModule.Controllers.Branding().exports()); },
    get DynamicAssetController() { return getOrCreate('DynamicAssetController', () => new DynamicAssetControllerModule.Controllers.DynamicAsset().exports()); },
    get EmailController() { return getOrCreate('EmailController', () => new EmailControllerModule.Controllers.Email().exports()); },
    get ExportController() { return getOrCreate('ExportController', () => new ExportControllerModule.Controllers.Export().exports()); },
    get RecordAuditController() { return getOrCreate('RecordAuditController', () => new RecordAuditControllerModule.Controllers.RecordAudit().exports()); },
    get RecordController() { return getOrCreate('RecordController', () => new RecordControllerModule.Controllers.Record().exports()); },
    get RenderViewController() { return getOrCreate('RenderViewController', () => new RenderViewControllerModule.Controllers.RenderView().exports()); },
    get ReportController() { return getOrCreate('ReportController', () => new ReportControllerModule.Controllers.Report().exports()); },
    get ReportsController() { return getOrCreate('ReportsController', () => new ReportsControllerModule.Controllers.Reports().exports()); },
    get TranslationController() { return getOrCreate('TranslationController', () => new TranslationControllerModule.Controllers.Translation().exports()); },
    get UserController() { return getOrCreate('UserController', () => new UserControllerModule.Controllers.User().exports()); },
    get VocabController() { return getOrCreate('VocabController', () => new VocabControllerModule.Controllers.Vocab().exports()); },
    get VocabularyController() { return getOrCreate('VocabularyController', () => new VocabularyControllerModule.Controllers.Vocabulary().exports()); },
    get WorkspaceAsyncController() { return getOrCreate('WorkspaceAsyncController', () => new WorkspaceAsyncControllerModule.Controllers.WorkspaceAsync().exports()); },
    get WorkspaceTypesController() { return getOrCreate('WorkspaceTypesController', () => new WorkspaceTypesControllerModule.Controllers.WorkspaceTypes().exports()); },
    get FormVocabularyController() { return getOrCreate('FormVocabularyController', () => new FormVocabularyControllerModule.Controllers.FormVocabulary().exports()); },
};

// Webservice Controllers export (separate object, not prefixed)
export const WebserviceControllerExports: Record<string, unknown> = {
    get AdminController() { return getOrCreate('WS_AdminController', () => new WSAdminControllerModule.Controllers.Admin().exports()); },
    get AppConfigController() { return getOrCreate('WS_AppConfigController', () => new WSAppConfigControllerModule.Controllers.AppConfig().exports()); },
    get BrandingController() { return getOrCreate('WS_BrandingController', () => new WSBrandingControllerModule.Controllers.Branding().exports()); },
    get ExportController() { return getOrCreate('WS_ExportController', () => new WSExportControllerModule.Controllers.Export().exports()); },
    get FormManagementController() { return getOrCreate('WS_FormManagementController', () => new WSFormManagementControllerModule.Controllers.FormManagement().exports()); },
    get RecordController() { return getOrCreate('WS_RecordController', () => new WSRecordControllerModule.Controllers.Record().exports()); },
    get RecordTypeController() { return getOrCreate('WS_RecordTypeController', () => new WSRecordTypeControllerModule.Controllers.RecordType().exports()); },
    get ReportController() { return getOrCreate('WS_ReportController', () => new WSReportControllerModule.Controllers.Report().exports()); },
    get SearchController() { return getOrCreate('WS_SearchController', () => new WSSearchControllerModule.Controllers.Search().exports()); },
    get TranslationController() { return getOrCreate('WS_TranslationController', () => new WSTranslationControllerModule.Controllers.Translation().exports()); },
    get UserManagementController() { return getOrCreate('WS_UserManagementController', () => new WSUserManagementControllerModule.Controllers.UserManagement().exports()); },
    get VocabularyController() { return getOrCreate('WS_VocabularyController', () => new WSVocabularyControllerModule.Controllers.Vocabulary().exports()); },
};

// Export controller names without instantiating (used by redbox-loader shim generation)
export const ControllerNames = [
    'ActionController',
    'AdminController',
    'AppConfigController',
    'AsynchController',
    'BrandingAppController',
    'BrandingController',
    'DynamicAssetController',
    'EmailController',
    'ExportController',
    'FormVocabularyController',
    'RecordAuditController',
    'RecordController',
    'RenderViewController',
    'ReportController',
    'ReportsController',
    'TranslationController',
    'UserController',
    'VocabController',
    'VocabularyController',
    'WorkspaceAsyncController',
    'WorkspaceTypesController',
];

export const WebserviceControllerNames = [
    'AdminController',
    'AppConfigController',
    'BrandingController',
    'ExportController',
    'FormManagementController',
    'RecordController',
    'RecordTypeController',
    'ReportController',
    'SearchController',
    'TranslationController',
    'UserManagementController',
    'VocabularyController',
];
