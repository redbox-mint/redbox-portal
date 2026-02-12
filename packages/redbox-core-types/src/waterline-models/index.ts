export * from './AppConfig';
export * from './AsynchProgress';
export * from './BrandingConfig';
export * from './BrandingConfigHistory';
export * from './CacheEntry';
export * from './Counter';
export * from './DashboardType';
export * from './Form';
export * from './I18nBundle';
export * from './I18nTranslation';
export * from './NamedQuery';
export * from './PathRule';
export * from './RecordType';
export * from './RBReport';
export * from './Role';
export * from './ThemeConfig';
export * from './User';
export * from './UserAudit';
export * from './Vocabulary';
export * from './VocabularyEntry';
export * from './WorkflowStep';
export * from './WorkspaceApp';
export * from './WorkspaceAsync';
export * from './WorkspaceType';

// Re-export Waterline model definitions for convenience
import { AppConfigWLDef } from './AppConfig';
import { AsynchProgressWLDef } from './AsynchProgress';
import { BrandingConfigWLDef } from './BrandingConfig';
import { BrandingConfigHistoryWLDef } from './BrandingConfigHistory';
import { CacheEntryWLDef } from './CacheEntry';
import { CounterWLDef } from './Counter';
import { DashboardTypeWLDef } from './DashboardType';
import { FormWLDef } from './Form';
import { I18nBundleWLDef } from './I18nBundle';
import { I18nTranslationWLDef } from './I18nTranslation';
import { NamedQueryWLDef } from './NamedQuery';
import { PathRuleWLDef } from './PathRule';
import { RecordTypeWLDef } from './RecordType';
import { ReportWLDef } from './RBReport';
import { RoleWLDef } from './Role';
import { ThemeConfigWLDef } from './ThemeConfig';
import { UserWLDef } from './User';
import { UserAuditWLDef } from './UserAudit';
import { VocabularyWLDef } from './Vocabulary';
import { VocabularyEntryWLDef } from './VocabularyEntry';
import { WorkflowStepWLDef } from './WorkflowStep';
import { WorkspaceAppWLDef } from './WorkspaceApp';
import { WorkspaceAsyncWLDef } from './WorkspaceAsync';
import { WorkspaceTypeWLDef } from './WorkspaceType';

// Consolidated Models map for hook-based loader
// Note: Record, DeletedRecord, RecordAudit are provided by storage hooks
// and registered via the core-loader's registerModels() mechanism
export const WaterlineModels = {
  AppConfig: AppConfigWLDef,
  AsynchProgress: AsynchProgressWLDef,
  BrandingConfig: BrandingConfigWLDef,
  BrandingConfigHistory: BrandingConfigHistoryWLDef,
  CacheEntry: CacheEntryWLDef,
  Counter: CounterWLDef,
  DashboardType: DashboardTypeWLDef,
  Form: FormWLDef,
  I18nBundle: I18nBundleWLDef,
  I18nTranslation: I18nTranslationWLDef,
  NamedQuery: NamedQueryWLDef,
  PathRule: PathRuleWLDef,
  RecordType: RecordTypeWLDef,
  RBReport: ReportWLDef,
  Role: RoleWLDef,
  ThemeConfig: ThemeConfigWLDef,
  User: UserWLDef,
  UserAudit: UserAuditWLDef,
  Vocabulary: VocabularyWLDef,
  VocabularyEntry: VocabularyEntryWLDef,
  WorkflowStep: WorkflowStepWLDef,
  WorkspaceApp: WorkspaceAppWLDef,
  WorkspaceAsync: WorkspaceAsyncWLDef,
  WorkspaceType: WorkspaceTypeWLDef,
};
