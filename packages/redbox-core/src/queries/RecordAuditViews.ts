import _ from 'lodash';
import { firstValueFrom } from 'rxjs';
import type { diffRecordValues } from '@researchdatabox/sails-ng-common';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { UserModel } from '../model/storage/UserModel';
import type { RecordsService } from '../RecordsService';
import type { Forms } from '../forms/Forms';
import { IntegrationAuditParams } from '../IntegrationAuditParams';
import { getRecordAuditTimestamp, RecordAuditActionType } from '../model/storage/RecordAuditModel';
import { IntegrationAuditStatus } from '../model/storage/IntegrationAuditModel';
import type {
  Services as IntegrationDomain,
  IntegrationStatusRecordContext,
  IntegrationStatusSummary,
} from './IntegrationAudits';
type AnyRecord = Record<string, unknown>;
type AuditPath = Array<string | number>;
type FormRecordConsistencyChange = {
  kind: 'add' | 'delete' | 'change';
  path: AuditPath;
  original: unknown;
  changed: unknown;
};
type AuditFieldChange = FormRecordConsistencyChange & {
  pathText: string;
  displayPath: string;
  label?: string;
  displayName: string;
};

const VALID_INTEGRATION_AUDIT_STATUSES = new Set<string>(Object.values(IntegrationAuditStatus));

export function auditActionLabelKey(action: string): string {
  return `@record-audit-action-${action}`;
}
export class AuditReadError extends Error {
  public constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
export interface RecordAuditViewsInput {
  readonly records: Pick<RecordsService, 'getMeta' | 'getRecordAudit' | 'getResolvedPermissionsSummary'>;
  compareRecords(
    original: unknown,
    changed: unknown,
    path?: Array<string | number>
  ): ReturnType<typeof diffRecordValues>;
  readonly forms: Pick<Forms, 'getFormByName'>;
  readonly integrations: Pick<
    IntegrationDomain.IntegrationAuditService,
    'getAuditLog' | 'getTraceAuditLog' | 'getStatusSummaryWithOutcomes'
  >;
  canView(brand: BrandingModel, user: AnyRecord, record: AnyRecord): Promise<boolean>;
  configuration(brand: string): unknown;
  figshareStatus(oid: string, record: AnyRecord): Promise<IntegrationStatusSummary | null>;
}
export class RecordAuditViews {
  public constructor(private readonly input: RecordAuditViewsInput) {}
  private async record(brand: BrandingModel, user: UserModel, oid: string, admin = false): Promise<AnyRecord> {
    if (!oid.trim()) throw new AuditReadError(400, 'Record oid is required.');
    if (
      admin &&
      !(user.roles ?? []).some(
        role =>
          role.name === 'Admin' && (typeof role.branding === 'object' ? role.branding?.id : role.branding) === brand.id
      )
    )
      throw new AuditReadError(403, 'view-error-no-permissions');
    const loaded = await this.input.records.getMeta(oid);
    if (_.isEmpty(loaded)) throw new AuditReadError(404, 'Record not found');
    const record = loaded as unknown as AnyRecord;
    if (
      _.get(record, 'metaMetadata.brandId') !== brand.id ||
      (!admin && !(await this.input.canView(brand, user as unknown as AnyRecord, record)))
    )
      throw new AuditReadError(403, 'view-error-no-permissions');
    return record;
  }
  private getAuditSortValue(auditRecord: AnyRecord): number {
    const rawValue = getRecordAuditTimestamp(auditRecord);
    const parsed = rawValue == null ? Number.NaN : new Date(String(rawValue)).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private getActionLabelKey(action: string): string {
    return auditActionLabelKey(action);
  }

  private toPathText(path: AuditPath): string {
    return path.reduce<string>((value, segment, index) => {
      if (typeof segment === 'number') {
        return `${value}[${segment}]`;
      }
      if (index === 0) {
        return String(segment);
      }
      return `${value}.${String(segment)}`;
    }, '');
  }

  private getDisplayPath(pathText: string): string {
    return pathText.startsWith('metadata.') ? pathText.slice('metadata.'.length) : pathText;
  }

  private normalizePathForLookup(path: AuditPath): string[] {
    return path
      .filter(segment => segment !== 'metadata' && typeof segment !== 'number')
      .map(segment => String(segment));
  }

  private collectLabelMappings(item: unknown, mappings: Map<string, string>, parentPath: string[] = []): void {
    if (!_.isPlainObject(item) && !Array.isArray(item)) {
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(child => this.collectLabelMappings(child, mappings, parentPath));
      return;
    }

    const itemRecord = item as AnyRecord;
    const layout = _.isPlainObject(itemRecord['layout']) ? (itemRecord['layout'] as AnyRecord) : undefined;
    const component = _.isPlainObject(itemRecord['component']) ? (itemRecord['component'] as AnyRecord) : undefined;
    const itemName = String(itemRecord['name'] ?? component?.['name'] ?? layout?.['name'] ?? '').trim();
    const nextPath = itemName ? [...parentPath, itemName] : parentPath;
    const label =
      String(
        layout?.['config'] && _.isPlainObject(layout['config']) ? ((layout['config'] as AnyRecord)['label'] ?? '') : ''
      ) ||
      String(
        component?.['config'] && _.isPlainObject(component['config'])
          ? ((component['config'] as AnyRecord)['label'] ?? '')
          : ''
      );

    if (itemName && label) {
      mappings.set(nextPath.join('.'), label);
    }

    const children = [
      itemRecord['children'],
      itemRecord['fields'],
      itemRecord['items'],
      itemRecord['components'],
      layout?.['children'],
      component?.['children'],
    ];

    children.forEach(child => {
      if (Array.isArray(child)) {
        child.forEach(entry => this.collectLabelMappings(entry, mappings, nextPath));
      }
    });
  }

  private async buildFieldLabelMap(record: AnyRecord, brand: BrandingModel): Promise<Map<string, string>> {
    const metaMetadata = _.isPlainObject(record?.metaMetadata) ? (record.metaMetadata as AnyRecord) : {};
    const formName = String(metaMetadata['form'] ?? metaMetadata['formName'] ?? '').trim();
    if (_.isEmpty(formName)) {
      return new Map<string, string>();
    }

    const brandId = String(metaMetadata['brandId'] ?? brand.id ?? '');
    const form = await firstValueFrom(this.input.forms.getFormByName(formName, true, brandId));
    const configuration = form?.configuration;
    const labelMap = new Map<string, string>();
    if (configuration != null) {
      this.collectLabelMappings(configuration, labelMap);
    }
    return labelMap;
  }

  private resolveFieldLabel(path: AuditPath, fieldLabelMap: Map<string, string>): string | undefined {
    const normalizedPath = this.normalizePathForLookup(path);
    if (normalizedPath.length === 0) {
      return undefined;
    }

    for (let start = 0; start < normalizedPath.length; start++) {
      for (let end = normalizedPath.length; end > start; end--) {
        const candidate = normalizedPath.slice(start, end).join('.');
        const label = fieldLabelMap.get(candidate);
        if (label) {
          return label;
        }
      }
    }
    return undefined;
  }

  private mapChange(change: FormRecordConsistencyChange, fieldLabelMap: Map<string, string>): AuditFieldChange {
    const pathText = this.toPathText(change.path);
    const displayPath = this.getDisplayPath(pathText);
    const label = this.resolveFieldLabel(change.path, fieldLabelMap);
    return {
      ...change,
      pathText,
      displayPath,
      label,
      displayName: label ?? displayPath,
    };
  }

  private mapActor(user: unknown) {
    const auditUser = _.isPlainObject(user) ? (user as AnyRecord) : {};
    const username = String(auditUser['username'] ?? '');
    const name = String(auditUser['name'] ?? '');
    const email = String(auditUser['email'] ?? '');
    return {
      username,
      name,
      email,
      displayName: name || username || 'Unknown',
    };
  }

  private buildAuditRowId(auditRecord: AnyRecord, index: number): string {
    const persistedId = String(auditRecord['id'] ?? '').trim();
    if (!_.isEmpty(persistedId)) {
      return persistedId;
    }
    const oid = String(auditRecord['redboxOid'] ?? '');
    const timestamp = String(getRecordAuditTimestamp(auditRecord) ?? '');
    return `${oid}:${timestamp}:${index}`;
  }

  private parsePositiveInt(value: unknown, defaultValue: number): number {
    const parsed = parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  }

  private parseDateBoundary(value: unknown, boundary: 'start' | 'end'): Date | null {
    const raw = String(value ?? '').trim();
    if (_.isEmpty(raw)) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split('-').map(part => parseInt(part, 10));
      const date =
        boundary === 'start'
          ? new Date(year, month - 1, day, 0, 0, 0, 0)
          : new Date(year, month - 1, day, 23, 59, 59, 999);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  public async audit(brand: BrandingModel, user: UserModel, oid: string, filters: AnyRecord, rawAuditUrl: string) {
    const record = await this.record(brand, user, oid);
    const fieldLabelMap = await this.buildFieldLabelMap(record, brand);
    const action = String(filters['action'] ?? '').trim();
    const workflowState = String(filters['workflowState'] ?? '').trim();
    const rawDateFrom = filters['dateFrom'];
    const rawDateTo = filters['dateTo'];
    const dateFrom = this.parseDateBoundary(rawDateFrom, 'start');
    const dateTo = this.parseDateBoundary(rawDateTo, 'end');
    if (!_.isNil(rawDateFrom) && !_.isEmpty(String(rawDateFrom).trim()) && dateFrom == null) {
      throw new AuditReadError(400, 'Invalid audit start date.');
    }
    if (!_.isNil(rawDateTo) && !_.isEmpty(String(rawDateTo).trim()) && dateTo == null) {
      throw new AuditReadError(400, 'Invalid audit end date.');
    }
    if (dateFrom != null && dateTo != null && dateFrom.getTime() > dateTo.getTime()) {
      throw new AuditReadError(400, 'Audit start date must be before end date.');
    }

    // Filter event dates after resolving legacy snapshot timestamps and computing diffs.
    const rawAudit = await this.input.records.getRecordAudit({
      oid,
      action: !_.isEmpty(action) ? action : undefined,
      workflowState: !_.isEmpty(workflowState) ? workflowState : undefined,
    });
    const ascendingAudit = [...rawAudit].sort((a, b) => this.getAuditSortValue(a) - this.getAuditSortValue(b));
    const rowMap = new Map<string, AnyRecord>();

    ascendingAudit.forEach((auditRecord, index) => {
      const currentRecord = _.isPlainObject(auditRecord['record']) ? (auditRecord['record'] as AnyRecord) : {};
      const previousAudit = index > 0 ? ascendingAudit[index - 1] : null;
      const previousRecord =
        previousAudit && _.isPlainObject(previousAudit['record']) ? (previousAudit['record'] as AnyRecord) : null;
      const action = String(auditRecord['action'] ?? '');
      const currentMetadata = currentRecord['metadata'];
      const previousMetadata = previousRecord?.['metadata'];
      let changeSummary: AnyRecord = {
        available: false,
        count: 0,
        changes: [],
        note: '@record-audit-note-update-only',
      };

      if (action === RecordAuditActionType.updated) {
        if (previousRecord == null) {
          changeSummary = {
            available: false,
            count: 0,
            changes: [],
            note: '@record-audit-note-no-previous-snapshot',
          };
        } else {
          const changes = this.input
            .compareRecords(previousMetadata, currentMetadata, ['metadata'])
            .map(change => this.mapChange(change, fieldLabelMap));
          changeSummary = {
            available: true,
            count: changes.length,
            changes,
          };
        }
      }

      const rowId = this.buildAuditRowId(auditRecord, index);
      rowMap.set(rowId, {
        id: rowId,
        timestamp: getRecordAuditTimestamp(auditRecord),
        action,
        actionLabelKey: this.getActionLabelKey(action),
        workflowStageLabel: String(_.get(auditRecord, 'record.workflow.stageLabel', '')),
        actor: this.mapActor(auditRecord['user']),
        changeSummary,
        rawRecord: _.isPlainObject(currentRecord) ? currentRecord : null,
        _sortValue: this.getAuditSortValue(auditRecord),
      });
    });

    const records = Array.from(rowMap.values())
      .filter(row => {
        if ((dateFrom != null || dateTo != null) && row['timestamp'] == null) {
          return false;
        }
        const timestamp = Number(row['_sortValue']);
        return (
          (dateFrom == null || timestamp >= dateFrom.getTime()) && (dateTo == null || timestamp <= dateTo.getTime())
        );
      })
      .sort((a, b) => Number(b['_sortValue'] ?? 0) - Number(a['_sortValue'] ?? 0))
      .map(row => {
        _.unset(row, '_sortValue');
        return row;
      });

    return { summary: { returnedCount: records.length }, rawAuditUrl, records };
  }
  public async permissions(brand: BrandingModel, user: UserModel, oid: string) {
    await this.record(brand, user, oid, true);
    return this.input.records.getResolvedPermissionsSummary(oid);
  }
  public async integrationStatus(brand: BrandingModel, user: UserModel, oid: string, filters: AnyRecord) {
    const record = await this.record(brand, user, oid);
    const integrationName = String(filters['integrationName'] ?? '').trim();
    const params = new IntegrationAuditParams();
    params.oid = oid;
    if (!_.isEmpty(integrationName)) {
      params.integrationName = integrationName;
    }

    const brandConfig = this.input.configuration(brand.name);
    const citationDoiPath = String(
      _.get(brandConfig, 'doiPublishing.writeBack.citationDoiPath') ?? 'metadata.citation_doi'
    );

    // Build record context for outcome derivation.
    const recordContext: IntegrationStatusRecordContext = {
      citationDoi: (() => {
        const val = _.get(record, citationDoiPath);
        return typeof val === 'string' && val.trim() ? val.trim() : undefined;
      })(),
      workflowStage: (() => {
        const val = _.get(record, 'workflow.stage');
        return typeof val === 'string' && val.trim() ? val.trim() : undefined;
      })(),
    };

    const integrations = await this.input.integrations.getStatusSummaryWithOutcomes(params, recordContext);
    if (
      !integrationName ||
      integrationName
        .split(',')
        .map(name => name.trim().toLowerCase())
        .includes('figshare')
    ) {
      const live = await this.input.figshareStatus(oid, record);
      if (live) {
        const index = integrations.findIndex(item => item.integrationName.toLowerCase() === 'figshare');
        if (index >= 0) integrations[index] = live;
        else integrations.push(live);
      }
    }
    return { integrations };
  }
  public async integrationAudit(brand: BrandingModel, user: UserModel, oid: string, filters: AnyRecord) {
    await this.record(brand, user, oid, true);
    const page = this.parsePositiveInt(filters['page'], 1);
    const pageSize = Math.min(this.parsePositiveInt(filters['pageSize'], 20), 100);
    const status = String(filters['status'] ?? '').trim();
    const integrationName = String(filters['integrationName'] ?? '').trim();
    const rawDateFrom = filters['dateFrom'];
    const rawDateTo = filters['dateTo'];
    const dateFrom = this.parseDateBoundary(rawDateFrom, 'start');
    const dateTo = this.parseDateBoundary(rawDateTo, 'end');
    const params = new IntegrationAuditParams();
    params.oid = oid;
    params.page = page;
    params.pageSize = pageSize;
    if (!_.isNil(rawDateFrom) && !_.isEmpty(String(rawDateFrom).trim()) && dateFrom == null) {
      throw new AuditReadError(400, 'Invalid integration audit start date.');
    }
    if (!_.isNil(rawDateTo) && !_.isEmpty(String(rawDateTo).trim()) && dateTo == null) {
      throw new AuditReadError(400, 'Invalid integration audit end date.');
    }
    if (dateFrom != null && dateTo != null && dateFrom.getTime() > dateTo.getTime()) {
      throw new AuditReadError(400, 'Integration audit start date must be before end date.');
    }
    if (!_.isEmpty(integrationName)) {
      params.integrationName = integrationName;
    }
    if (dateFrom != null) {
      params.dateFrom = dateFrom;
    }
    if (dateTo != null) {
      params.dateTo = dateTo;
    }
    if (!_.isEmpty(status)) {
      if (!VALID_INTEGRATION_AUDIT_STATUSES.has(status)) {
        throw new AuditReadError(400, 'Invalid integration audit status.');
      }
      params.status = status as IntegrationAuditStatus;
    }

    const result = await this.input.integrations.getTraceAuditLog(params);
    return {
      summary: {
        numFound: result.total,
        page,
        pageSize,
        totalPages: Math.ceil(result.total / pageSize),
      },
      records: result.rows.map((row, traceIndex) => ({
        ...row,
        id: String(row.id ?? row.traceId ?? `${oid}:trace:${page}:${traceIndex}`),
        events: (row.events ?? []).map((event, eventIndex) => ({
          ...event,
          id: String(event['id'] ?? `${row.traceId ?? oid}:event:${eventIndex}`),
        })),
      })),
    };
  }
  public async integrationLog(brand: BrandingModel, user: UserModel, oid: string, params: IntegrationAuditParams) {
    await this.record(brand, user, oid, true);
    return this.input.integrations.getAuditLog(params);
  }
}
