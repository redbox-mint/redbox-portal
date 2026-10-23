import { RecordAuditViews, AuditReadError, auditActionLabelKey } from '../queries/RecordAuditViews';
import type { UserModel } from '../model/storage/UserModel';
import { figshareLiveSummary } from '../services/figshare-v2/status';
import { Controllers as controllers } from '../CoreController';
import { RecordsService } from '../RecordsService';
import { firstValueFrom, Observable, of } from 'rxjs';
import { BrandingModel } from '../model/storage/BrandingModel';

type AnyRecord = Record<string, unknown>;

export namespace Controllers {
  export class RecordAudit extends controllers.Core.Controller {
    protected recordsService!: RecordsService;

    protected override _exportedMethods: string[] = [
      'render',
      'getAuditData',
      'getPermissionsData',
      'getIntegrationAuditData',
      'getIntegrationStatusData',
      'init',
    ];

    public init() {
      this.recordsService = sails.services.recordsservice as unknown as RecordsService;
    }

    public bootstrap() {}

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
        brand?.id
      );
      const portal = this.resolveRouteSegment(req.param('portal'), req.options?.locals?.portal, req.session?.portal);

      if (_.isEmpty(branding) || _.isEmpty(portal)) {
        return '';
      }

      return `/${branding}/${portal}/api/records/audit/${encodeURIComponent(oid)}`;
    }

    protected hasViewAccess(brand: BrandingModel, user: AnyRecord | undefined, record: AnyRecord): Observable<boolean> {
      const currentUser = user ?? {};
      return of(
        this.recordsService.hasViewAccess(brand, currentUser, (currentUser['roles'] ?? []) as AnyRecord[], record)
      );
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

    private async getRecordOrSendNotFound(req: Sails.Req, res: Sails.Res, oid: string): Promise<AnyRecord | null> {
      const record = await this.recordsService.getMeta(oid);
      if (_.isEmpty(record)) {
        await this.sendResp(req, res, { status: 404, displayErrors: [{ detail: 'Record not found' }] });
        return null;
      }
      return record as unknown as AnyRecord;
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
        const hasViewAccess = await firstValueFrom(
          this.hasViewAccess(brand, req.user ?? {}, record as unknown as AnyRecord)
        );
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

    private getActionLabelKey(action: string): string {
      return auditActionLabelKey(action);
    }

    private views(): RecordAuditViews {
      return new RecordAuditViews({
        records: this.recordsService,
        forms: FormsService,
        compareRecords: (...args) => FormRecordConsistencyService.compareRecords(...args),
        integrations: IntegrationAuditService,
        canView: async (brand, user, record) => firstValueFrom(this.hasViewAccess(brand, user, record)),
        configuration: brand => sails.config.brandingAware(brand),
        figshareStatus: figshareLiveSummary,
      });
    }
    private async readData(
      req: Sails.Req,
      res: Sails.Res,
      action: 'audit' | 'permissions' | 'integrationStatus' | 'integrationAudit'
    ) {
      const oid = String(req.param('oid') ?? '').trim();
      const brand = this.getReqBrand(req);
      const filters = Object.fromEntries(
        ['action', 'workflowState', 'dateFrom', 'dateTo', 'page', 'pageSize', 'status', 'integrationName'].map(name => [
          name,
          req.param(name),
        ])
      );
      try {
        const user = req.user as unknown as UserModel;
        const views = this.views();
        const data =
          action === 'permissions'
            ? await views.permissions(brand, user, oid)
            : action === 'audit'
              ? await views.audit(brand, user, oid, filters, this.buildRawAuditUrl(req, oid))
              : action === 'integrationStatus'
                ? await views.integrationStatus(brand, user, oid, filters)
                : await views.integrationAudit(brand, user, oid, filters);
        return this.sendResp(req, res, { data });
      } catch (error) {
        const status = error instanceof AuditReadError ? error.status : 500;
        const detail =
          error instanceof AuditReadError
            ? error.message
            : action === 'permissions'
              ? 'Failed to load record permissions.'
              : action === 'audit'
                ? 'Failed to load record audit data.'
                : action === 'integrationStatus'
                  ? 'Failed to load integration status data.'
                  : 'Failed to load integration audit data.';
        return this.sendResp(req, res, {
          status,
          ...(status === 500 ? { errors: [this.asError(error)] } : {}),
          displayErrors: [{ detail, ...(status === 403 ? { code: 'view-error-no-permissions' } : {}) }],
          ...(status === 403 && (action === 'audit' || action === 'integrationStatus')
            ? { v1: { message: TranslationService.t('view-error-no-permissions') } }
            : {}),
        });
      }
    }
    public getAuditData(req: Sails.Req, res: Sails.Res) {
      return this.readData(req, res, 'audit');
    }
    public getPermissionsData(req: Sails.Req, res: Sails.Res) {
      return this.readData(req, res, 'permissions');
    }
    public getIntegrationStatusData(req: Sails.Req, res: Sails.Res) {
      return this.readData(req, res, 'integrationStatus');
    }
    public getIntegrationAuditData(req: Sails.Req, res: Sails.Res) {
      return this.readData(req, res, 'integrationAudit');
    }
  }
}
