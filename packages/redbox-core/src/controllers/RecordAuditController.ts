import { Controllers as controllers } from '../CoreController';
import { RecordsService } from '../RecordsService';
import { firstValueFrom, Observable, of } from 'rxjs';
import { BrandingModel } from '../model/storage/BrandingModel';
import { FormAttributes } from '../waterline-models';
import { IntegrationAuditParams } from '../IntegrationAuditParams';
import { RecordAuditActionType } from '../model/storage/RecordAuditModel';
import { IntegrationAuditStatus } from '../model/storage/IntegrationAuditModel';

type AnyRecord = Record<string, unknown>;
type AuditPath = Array<string | number>;
type FormRecordConsistencyChange = {
  kind: 'add' | 'delete' | 'change';
  path: AuditPath;
  original: unknown;
  changed: unknown;
};
type IntegrationAuditLogResult = {
  rows: Record<string, unknown>[];
  total: number;
};
type AuditFieldChange = FormRecordConsistencyChange & {
  pathText: string;
  displayPath: string;
  label?: string;
  displayName: string;
};

const VALID_INTEGRATION_AUDIT_STATUSES = new Set<string>(Object.values(IntegrationAuditStatus));

declare const BrandingService: {
  getBrand(branding: string): BrandingModel;
  getDefault(): BrandingModel;
};
declare const FormsService: {
  getFormByName(formName: string, editMode: boolean, brandingId?: string): Observable<FormAttributes | null>;
};
declare const FormRecordConsistencyService: {
  compareRecords(original: unknown, changed: unknown, path?: AuditPath): FormRecordConsistencyChange[];
};
declare const IntegrationAuditService: {
  getAuditLog(params: IntegrationAuditParams): Promise<IntegrationAuditLogResult>;
};
declare const TranslationService: {
  t(key: string): string;
};

export namespace Controllers {
  export class RecordAudit extends controllers.Core.Controller {
    protected recordsService!: RecordsService;

    protected override _exportedMethods: string[] = [
      'render',
      'getAuditData',
      'getPermissionsData',
      'getIntegrationAuditData',
      'init',
    ];

    public init() {
      this.recordsService = sails.services.recordsservice as unknown as RecordsService;
    }

    public bootstrap() { }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private getReqBrand(req: Sails.Req): BrandingModel {
      const requestedBranding = String(req.param('branding') ?? req.session?.branding ?? '').trim();
      return BrandingService.getBrand(requestedBranding) ?? BrandingService.getDefault();
    }

    private getSafeRouteSegment(value: unknown): string {
      const segment = String(value ?? '').trim();
      return /^[A-Za-z0-9_-]+$/.test(segment) ? segment : '';
    }

    private resolveRouteSegment(...values: unknown[]): string {
      for (const value of values) {
        const segment = this.getSafeRouteSegment(value);
        if (!_.isEmpty(segment)) {
          return segment;
        }
      }
      return '';
    }

    private buildRawAuditUrl(req: Sails.Req, oid: string): string {
      const brand = this.getReqBrand(req);
      const branding = this.resolveRouteSegment(
        req.param('branding'),
        req.options?.locals?.branding,
        req.session?.branding,
        brand?.name,
        brand?.id,
      );
      const portal = this.resolveRouteSegment(req.param('portal'), req.options?.locals?.portal, req.session?.portal);

      if (_.isEmpty(branding) || _.isEmpty(portal)) {
        return '';
      }

      return `/${branding}/${portal}/api/records/audit/${encodeURIComponent(oid)}`;
    }

    protected hasViewAccess(brand: BrandingModel, user: AnyRecord | undefined, record: AnyRecord): Observable<boolean> {
      const currentUser = user ?? {};
      return of(this.recordsService.hasViewAccess(brand, currentUser, (currentUser['roles'] ?? []) as AnyRecord[], record));
    }

    private isBrandAdmin(req: Sails.Req): boolean {
      const brand = this.getReqBrand(req);
      const roles = (req.user?.roles ?? []) as Array<{ name?: string; branding?: string | { id?: string } }>;
      return roles.some(role => {
        const roleBranding = role?.branding;
        const roleBrandId = typeof roleBranding === 'string' ? roleBranding : roleBranding?.id;
        return role?.name === 'Admin' && roleBrandId === brand.id;
      });
    }

    private getAuditSortValue(auditRecord: AnyRecord): number {
      const rawValue = auditRecord['createdAt'] ?? auditRecord['updatedAt'] ?? auditRecord['dateCreated'] ?? null;
      const parsed = rawValue == null ? Number.NaN : new Date(String(rawValue)).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    }

    private getActionLabelKey(action: string): string {
      return `@record-audit-action-${action}`;
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
        String(layout?.['config'] && _.isPlainObject(layout['config']) ? (layout['config'] as AnyRecord)['label'] ?? '' : '') ||
        String(component?.['config'] && _.isPlainObject(component['config']) ? (component['config'] as AnyRecord)['label'] ?? '' : '');

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
      const metaMetadata = (_.isPlainObject(record?.metaMetadata) ? (record.metaMetadata as AnyRecord) : {});
      const formName = String(metaMetadata['form'] ?? metaMetadata['formName'] ?? '').trim();
      if (_.isEmpty(formName)) {
        return new Map<string, string>();
      }

      const brandId = String(metaMetadata['brandId'] ?? brand.id ?? '');
      const form = await firstValueFrom(FormsService.getFormByName(formName, true, brandId));
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
      const timestamp = String(auditRecord['createdAt'] ?? auditRecord['updatedAt'] ?? auditRecord['dateCreated'] ?? '');
      return `${oid}:${timestamp}:${index}`;
    }

    private async getRecordOrSendNotFound(req: Sails.Req, res: Sails.Res, oid: string): Promise<AnyRecord | null> {
      const record = await this.recordsService.getMeta(oid);
      if (_.isEmpty(record)) {
        await this.sendResp(req, res, { status: 404, displayErrors: [{ detail: 'Record not found' }] });
        return null;
      }
      return record as unknown as AnyRecord;
    }

    private parsePositiveInt(value: unknown, defaultValue: number): number {
      const parsed = parseInt(String(value ?? ''), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
    }

    public async render(req: Sails.Req, res: Sails.Res) {
      const oid = String(req.param('oid') ?? '').trim();
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Record oid is required.' }] });
      }

      try {
        const record = await this.recordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return this.sendResp(req, res, { status: 404, displayErrors: [{ detail: 'Record not found' }] });
        }

        const brand = this.getReqBrand(req);
        const hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user ?? {}, record as unknown as AnyRecord));
        if (!hasViewAccess) {
          return this.sendResp(req, res, {
            status: 403,
            displayErrors: [{ code: 'view-error-no-permissions' }],
            v1: { message: TranslationService.t('view-error-no-permissions') },
          });
        }

        const locals = (req.options?.locals ?? {}) as AnyRecord;
        locals['oid'] = oid;
        locals['appName'] = 'record-audit';
        locals['isAdmin'] = this.isBrandAdmin(req);
        return this.sendView(req, res, 'record/viewAudit');
      } catch (error) {
        return this.sendResp(req, res, {
          status: 500,
          errors: [this.asError(error)],
          displayErrors: [{ detail: 'Failed to load record audit page.' }],
        });
      }
    }

    public async getAuditData(req: Sails.Req, res: Sails.Res) {
      const oid = String(req.param('oid') ?? '').trim();
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Record oid is required.' }] });
      }

      try {
        const brand = this.getReqBrand(req);
        const record = await this.getRecordOrSendNotFound(req, res, oid);
        if (record == null) {
          return;
        }

        const hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user ?? {}, record));
        if (!hasViewAccess) {
          return this.sendResp(req, res, {
            status: 403,
            displayErrors: [{ code: 'view-error-no-permissions' }],
            v1: { message: TranslationService.t('view-error-no-permissions') },
          });
        }

        const fieldLabelMap = await this.buildFieldLabelMap(record, brand);
        const rawAudit = await this.recordsService.getRecordAudit({ oid, dateFrom: null, dateTo: null });
        const ascendingAudit = [...rawAudit].sort((a, b) => this.getAuditSortValue(a) - this.getAuditSortValue(b));
        const rowMap = new Map<string, AnyRecord>();

        ascendingAudit.forEach((auditRecord, index) => {
          const currentRecord = _.isPlainObject(auditRecord['record']) ? (auditRecord['record'] as AnyRecord) : {};
          const previousAudit = index > 0 ? ascendingAudit[index - 1] : null;
          const previousRecord = previousAudit && _.isPlainObject(previousAudit['record']) ? (previousAudit['record'] as AnyRecord) : null;
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
              const changes = FormRecordConsistencyService.compareRecords(previousMetadata, currentMetadata, ['metadata'])
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
            timestamp: auditRecord['createdAt'] ?? auditRecord['updatedAt'] ?? auditRecord['dateCreated'] ?? null,
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
          .sort((a, b) => Number(b['_sortValue'] ?? 0) - Number(a['_sortValue'] ?? 0))
          .map(row => {
            _.unset(row, '_sortValue');
            return row;
          });

        const rawAuditUrl = this.buildRawAuditUrl(req, oid);

        return this.sendResp(req, res, {
          data: {
            summary: { returnedCount: records.length },
            rawAuditUrl,
            records,
          },
        });
      } catch (error) {
        return this.sendResp(req, res, {
          status: 500,
          errors: [this.asError(error)],
          displayErrors: [{ detail: 'Failed to load record audit data.' }],
        });
      }
    }

    public async getPermissionsData(req: Sails.Req, res: Sails.Res) {
      const oid = String(req.param('oid') ?? '').trim();
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Record oid is required.' }] });
      }
      if (!this.isBrandAdmin(req)) {
        return this.sendResp(req, res, { status: 403, displayErrors: [{ code: 'view-error-no-permissions' }] });
      }

      try {
        const record = await this.getRecordOrSendNotFound(req, res, oid);
        if (record == null) {
          return;
        }
        const permissionsSummary = await this.recordsService.getResolvedPermissionsSummary(oid);
        return this.sendResp(req, res, { data: permissionsSummary });
      } catch (error) {
        return this.sendResp(req, res, {
          status: 500,
          errors: [this.asError(error)],
          displayErrors: [{ detail: 'Failed to load record permissions.' }],
        });
      }
    }

    public async getIntegrationAuditData(req: Sails.Req, res: Sails.Res) {
      const oid = String(req.param('oid') ?? '').trim();
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Record oid is required.' }] });
      }
      if (!this.isBrandAdmin(req)) {
        return this.sendResp(req, res, { status: 403, displayErrors: [{ code: 'view-error-no-permissions' }] });
      }

      try {
        const record = await this.getRecordOrSendNotFound(req, res, oid);
        if (record == null) {
          return;
        }

        const page = this.parsePositiveInt(req.param('page'), 1);
        const pageSize = Math.min(this.parsePositiveInt(req.param('pageSize'), 20), 100);
        const status = String(req.param('status') ?? '').trim();
        const params = new IntegrationAuditParams();
        params.oid = oid;
        params.page = page;
        params.pageSize = pageSize;
        if (!_.isEmpty(status)) {
          if (!VALID_INTEGRATION_AUDIT_STATUSES.has(status)) {
            return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Invalid integration audit status.' }] });
          }
          params.status = status as IntegrationAuditStatus;
        }

        const result = await IntegrationAuditService.getAuditLog(params);
        return this.sendResp(req, res, {
          data: {
            summary: {
              numFound: result.total,
              page,
              pageSize,
              totalPages: Math.ceil(result.total / pageSize),
            },
            records: result.rows.map((row, index) => ({
              id: String(row['id'] ?? `${oid}:${page}:${index}`),
              ...row,
            })),
          },
        });
      } catch (error) {
        return this.sendResp(req, res, {
          status: 500,
          errors: [this.asError(error)],
          displayErrors: [{ detail: 'Failed to load integration audit data.' }],
        });
      }
    }
  }
}
