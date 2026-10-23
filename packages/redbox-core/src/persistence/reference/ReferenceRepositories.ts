import type { DashboardTableConfig } from '../../config/workflow.config';
/** Plain reference definitions. BSON identities and loaded models stay in adapters. */
export interface Definition extends Record<string, unknown> {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface BrandedDefinition extends Definition {
  branding: string;
  key?: string;
}
export type DefinitionValues = Record<string, unknown>;
interface WorkflowFields extends Definition {
  recordType: string | null;
  config: Record<string, unknown>;
  starting: boolean;
  hidden: boolean;
}
export interface WorkflowDefinition extends WorkflowFields {
  form: string | null;
}
export interface FormDefinition extends BrandedDefinition {
  configuration?: unknown;
}
export interface DashboardDefinition extends BrandedDefinition {
  formatRules: Record<string, unknown>;
  tableConfig: DashboardTableConfig;
  searchable: boolean;
  system: boolean;
}
export interface NamedQueryDefinitionRow extends BrandedDefinition {
  mongoQuery: string;
  queryParams: string;
  collectionName: string;
  resultObjectMapping: string;
  brandIdFieldPath?: string;
  sort?: string;
  expandRelations?: boolean;
  relatedRecordFilters?: string;
}
export interface ReportDefinitionRow extends BrandedDefinition {
  title: string;
  columns: Array<{ label: string; property: string; template?: string; exportTemplate?: string; hide?: boolean }>;
}
export interface WorkflowWithForm extends WorkflowFields {
  form: FormDefinition | null;
}

export interface ThemeRepository {
  list(): Promise<Definition[]>;
  findByName(name: string): Promise<Definition | null>;
  createDefinition(values: DefinitionValues): Promise<Definition>;
  reviseDefinition(id: string, values: DefinitionValues): Promise<Definition | null>;
}
export interface FormRepository {
  list(branding?: string): Promise<FormDefinition[]>;
  listByName(name: string | null, branding: string): Promise<FormDefinition[]>;
  findByName(name: string | null, branding?: string): Promise<FormDefinition | null>;
  findByIds(ids: readonly string[]): Promise<FormDefinition[]>;
  createDefinition(values: DefinitionValues): Promise<FormDefinition>;
  removeByName(name: string, branding: string): Promise<void>;
}
export interface RecordTypeRepository {
  listForBrand(branding: string, fields?: readonly string[] | null): Promise<BrandedDefinition[]>;
  findByName(branding: string, name: string, fields?: readonly string[] | null): Promise<BrandedDefinition | null>;
  findByKey(key: string): Promise<BrandedDefinition | null>;
  createDefinition(values: DefinitionValues): Promise<BrandedDefinition>;
  reviseDefinition(id: string, values: DefinitionValues): Promise<BrandedDefinition | null>;
  removeForBrand(branding: string): Promise<void>;
}
export interface WorkflowRepository {
  listAll(): Promise<WorkflowDefinition[]>;
  listForRecordType(recordType: string, includeHidden?: boolean): Promise<WorkflowDefinition[]>;
  findByName(recordType: string, name: string): Promise<WorkflowDefinition | null>;
  findStarting(recordType: string): Promise<WorkflowDefinition | null>;
  createDefinition(values: DefinitionValues): Promise<WorkflowDefinition>;
  attachForm(id: string, form: string): Promise<WorkflowDefinition[]>;
  removeAllForBootstrap(): Promise<void>;
}
export interface DashboardTypeRepository {
  listForBrand(branding: string): Promise<DashboardDefinition[]>;
  findByName(branding: string, name: string): Promise<DashboardDefinition | null>;
  createDefinition(values: DefinitionValues): Promise<DashboardDefinition>;
  reviseDefinition(branding: string, name: string, values: DefinitionValues): Promise<DashboardDefinition | null>;
  removeForBrand(branding: string, name?: string): Promise<void>;
}
export interface ReportRepository {
  listForBrand(branding: string): Promise<ReportDefinitionRow[]>;
  findByKey(key: string): Promise<ReportDefinitionRow | null>;
  createDefinition(values: DefinitionValues): Promise<ReportDefinitionRow>;
  reviseDefinition(key: string, values: DefinitionValues): Promise<ReportDefinitionRow | null>;
  removeByKey(key: string): Promise<void>;
}
export interface NamedQueryRepository {
  listForBrand(branding: string): Promise<NamedQueryDefinitionRow[]>;
  findByKey(key: string): Promise<NamedQueryDefinitionRow | null>;
  createDefinition(values: DefinitionValues): Promise<NamedQueryDefinitionRow>;
  reviseDefinition(key: string, values: DefinitionValues): Promise<NamedQueryDefinitionRow | null>;
  removeByKey(key: string): Promise<NamedQueryDefinitionRow | null>;
}
export interface WorkspaceTypeRepository {
  listForBrand(branding: string): Promise<BrandedDefinition[]>;
  findByName(branding: string, name: string): Promise<BrandedDefinition | null>;
  createDefinition(values: DefinitionValues): Promise<BrandedDefinition>;
  setLogo(id: string, logo: string): Promise<void>;
  removeForBrand(branding: string): Promise<void>;
}
export interface ReferenceRepositories {
  themes: ThemeRepository;
  forms: FormRepository;
  recordTypes: RecordTypeRepository;
  workflows: WorkflowRepository;
  dashboardTypes: DashboardTypeRepository;
  reports: ReportRepository;
  namedQueries: NamedQueryRepository;
  workspaceTypes: WorkspaceTypeRepository;
  /** Many stages, one form per stage; missing/dangling form is null. Two batched reads. */
  workflowForms(recordType: string): Promise<WorkflowWithForm[]>;
}
