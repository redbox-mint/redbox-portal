export * from './AppConfig';
export * from './AsynchProgress';
export * from './BrandingConfig';
export * from './BrandingConfigHistory';
export * from './CacheEntry';
export * from './Counter';
export * from './DashboardType';
export * from './DeletedRecord';
export * from './Form';
export * from './I18nBundle';
export * from './I18nTranslation';
export * from './NamedQuery';
export * from './PathRule';
export * from './Record';
export * from './RecordAudit';
export * from './RecordType';
export * from './Report';
export * from './Role';
export * from './ThemeConfig';
export * from './User';
export * from './UserAudit';
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
import { DeletedRecordWLDef } from './DeletedRecord';
import { FormWLDef } from './Form';
import { I18nBundleWLDef } from './I18nBundle';
import { I18nTranslationWLDef } from './I18nTranslation';
import { NamedQueryWLDef } from './NamedQuery';
import { PathRuleWLDef } from './PathRule';
import { RecordWLDef } from './Record';
import { RecordAuditWLDef } from './RecordAudit';
import { RecordTypeWLDef } from './RecordType';
import { ReportWLDef } from './Report';
import { RoleWLDef } from './Role';
import { ThemeConfigWLDef } from './ThemeConfig';
import { UserWLDef } from './User';
import { UserAuditWLDef } from './UserAudit';
import { WorkflowStepWLDef } from './WorkflowStep';
import { WorkspaceAppWLDef } from './WorkspaceApp';
import { WorkspaceAsyncWLDef } from './WorkspaceAsync';
import { WorkspaceTypeWLDef } from './WorkspaceType';

// Consolidated Models map for hook-based loader
export const WaterlineModels = {
  AppConfig: AppConfigWLDef,
  AsynchProgress: AsynchProgressWLDef,
  BrandingConfig: BrandingConfigWLDef,
  BrandingConfigHistory: BrandingConfigHistoryWLDef,
  CacheEntry: CacheEntryWLDef,
  Counter: CounterWLDef,
  DashboardType: DashboardTypeWLDef,
  DeletedRecord: DeletedRecordWLDef,
  Form: FormWLDef,
  I18nBundle: I18nBundleWLDef,
  I18nTranslation: I18nTranslationWLDef,
  NamedQuery: NamedQueryWLDef,
  PathRule: PathRuleWLDef,
  Record: RecordWLDef,
  RecordAudit: RecordAuditWLDef,
  RecordType: RecordTypeWLDef,
  Report: ReportWLDef,
  Role: RoleWLDef,
  ThemeConfig: ThemeConfigWLDef,
  User: UserWLDef,
  UserAudit: UserAuditWLDef,
  WorkflowStep: WorkflowStepWLDef,
  WorkspaceApp: WorkspaceAppWLDef,
  WorkspaceAsync: WorkspaceAsyncWLDef,
  WorkspaceType: WorkspaceTypeWLDef,
};
