import { Controllers as controllers, IntegrationAuditParams, ListAPIResponse } from '../../index';
import { IntegrationAuditStatus } from '../../model/storage/IntegrationAuditModel';

type IntegrationAuditLogResult = {
  rows: Record<string, unknown>[];
  total: number;
};

const VALID_INTEGRATION_AUDIT_STATUSES = new Set<string>(Object.values(IntegrationAuditStatus));

declare const IntegrationAuditService: {
  getAuditLog: (params: IntegrationAuditParams) => Promise<IntegrationAuditLogResult>;
};

export namespace Controllers {
  export class IntegrationAudit extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = ['getAuditLog'];

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private parsePositiveInt(value: unknown): number | null {
      if (_.isEmpty(value)) {
        return null;
      }
      const parsed = parseInt(String(value), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    public async getAuditLog(req: Sails.Req, res: Sails.Res) {
      const oid = String(req.param('oid') ?? '').trim();
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Record oid is required.' }],
        });
      }

      const params = new IntegrationAuditParams();
      params.oid = oid;

      const status = String(req.param('status') ?? '').trim();
      if (!_.isEmpty(status)) {
        if (!VALID_INTEGRATION_AUDIT_STATUSES.has(status)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Invalid status parameter.' }],
          });
        }
        params.status = status as IntegrationAuditParams['status'];
      }

      const dateFrom = String(req.param('dateFrom') ?? '').trim();
      if (!_.isEmpty(dateFrom)) {
        const parsed = new Date(dateFrom);
        if (Number.isNaN(parsed.getTime())) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Invalid dateFrom parameter.' }],
          });
        }
        params.dateFrom = parsed;
      }

      const dateTo = String(req.param('dateTo') ?? '').trim();
      if (!_.isEmpty(dateTo)) {
        const parsed = new Date(dateTo);
        if (Number.isNaN(parsed.getTime())) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Invalid dateTo parameter.' }],
          });
        }
        params.dateTo = parsed;
      }

      const page = this.parsePositiveInt(req.param('page'));
      if (!_.isEmpty(req.param('page')) && page == null) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Invalid page parameter.' }],
        });
      }

      const pageSize = this.parsePositiveInt(req.param('pageSize'));
      if (!_.isEmpty(req.param('pageSize')) && pageSize == null) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Invalid pageSize parameter.' }],
        });
      }

      params.page = page ?? 1;
      params.pageSize = pageSize ?? 20;

      try {
        const audit = await IntegrationAuditService.getAuditLog(params);
        const response = new ListAPIResponse<Record<string, unknown>>();
        response.summary.numFound = audit.total;
        response.summary.page = params.page;
        response.records = audit.rows;
        return this.sendResp(req, res, { data: response });
      } catch (error) {
        return this.sendResp(req, res, {
          errors: [this.asError(error)],
          displayErrors: [{ detail: `Failed to list integration audit records for ${oid}.` }],
        });
      }
    }
  }
}
