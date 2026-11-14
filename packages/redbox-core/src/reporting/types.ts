import type { BrandingModel, RoleModel, UserModel } from '../model';
import type { ReportingQuery, MongoReportingQuery } from './query';

export type ReportingUser = Record<string, unknown> &
  Pick<UserModel, 'id' | 'username' | 'type' | 'roles'> &
  Partial<Pick<UserModel, 'loginDisabled' | 'effectiveLoginDisabled' | 'accountLinkState' | 'linkedPrimaryUserId'>>;
export interface ReportingPrincipal {
  readonly brand: BrandingModel;
  readonly user: ReportingUser;
  readonly roles: RoleModel[];
}
export type ReportingOperation = 'filter' | 'group' | 'histogram' | 'sum' | 'average' | 'read';
export interface ReportingFieldDefinition {
  id: string;
  label: string;
  description?: string;
  /** Trusted configuration only. Never included in public schema/results. */
  path: string;
  type: 'category' | 'date' | 'boolean' | 'number' | 'text';
  operations: ReportingOperation[];
  array?: boolean;
  enabled?: boolean;
  allowedRoles?: string[];
}
export interface RecordTypeReportingConfig {
  enabled: boolean;
  allowedRoles: string[];
  /** Explicit authoritative forms covered by metadata analytics. */
  forms?: string[];
  searchCore?: string;
  /** Opt in only after verifying every indexed field is visible to all allowed reporting roles. */
  searchFullTextVisibleToAllReportingRoles?: boolean;
  fields: ReportingFieldDefinition[];
}
export interface ReportingLimits {
  maxPageSize: number;
  maxGroups: number;
  maxOffset: number;
  maxFilters: number;
  maxGroupDimensions: number;
  maxDateRangeDays: number;
  aggregationTimeoutMs: number;
  maxSearchResults: number;
  maxOutputBytes: number;
}
export interface ReportingSchema {
  recordType: string;
  fields: Array<Omit<ReportingFieldDefinition, 'path' | 'allowedRoles' | 'enabled'>>;
  limits: ReportingLimits;
  dateSemantics: string;
  metadataFormCoverage: string[];
}
export type ReportingValue = string | number | boolean | null | ReportingValue[];
export interface ReportingRecord {
  oid: string;
  recordType: string;
  fields: Record<string, ReportingValue>;
}
export interface ReportingPage<T> {
  total: number | null;
  returned: number;
  /** Null means completeness cannot be established safely from the search index. */
  truncated: boolean | null;
  offset: number;
  items: T[];
}
export interface ReportingGroup {
  dimensions: Record<string, ReportingValue>;
  metrics: Record<string, number | null>;
}
export type ReportingResult =
  | { count: number }
  | ReportingPage<ReportingGroup>
  | ReportingPage<ReportingRecord>
  | ReportingRecord;
export interface ReportingProvider {
  /** Provider must independently validate the principal, registry, query and authorization. */
  executeReporting(
    principal: ReportingPrincipal,
    query: MongoReportingQuery
  ): Promise<{ count: number } | ReportingPage<ReportingGroup> | ReportingPage<string>>;
}
export interface ReportingApi {
  getReportingSchema(
    principal: ReportingPrincipal,
    input: { recordType: string },
    audit?: ReportingAuditContext
  ): Promise<ReportingSchema>;
  execute(
    principal: ReportingPrincipal,
    input: ReportingQuery,
    audit?: ReportingAuditContext
  ): Promise<ReportingResult>;
}
export interface ReportingAuditContext {
  channel: 'direct' | 'rest' | 'mcp';
  tool?:
    | 'get_reporting_schema'
    | 'count_records'
    | 'group_records'
    | 'time_series'
    | 'search_records'
    | 'get_record'
    | 'list_records';
}
export class ReportingError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_QUERY'
      | 'AUTHENTICATION_REQUIRED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'UNAVAILABLE'
      | 'LIMIT_EXCEEDED'
  ) {
    super(code);
    this.name = 'ReportingError';
  }
}
