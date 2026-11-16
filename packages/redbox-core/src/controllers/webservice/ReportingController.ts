import { Controllers as controllers } from '../../CoreController';
import { getValidatedApiRequest } from '../../api-routes';
import { resolveReportingPrincipal } from '../../reporting/runtime';
import { ReportingError } from '../../reporting/types';
import type { ReportingQuery } from '../../reporting/query';

export namespace Controllers {
  export class Reporting extends controllers.Core.Controller {
    protected override _exportedMethods = ['schema', 'query'];
    private async run(
      req: Sails.Req,
      res: Sails.Res,
      action: (principal: Awaited<ReturnType<typeof resolveReportingPrincipal>>) => Promise<unknown>
    ) {
      try {
        const principal = await resolveReportingPrincipal(
          String(req.options?.locals?.branding ?? req.session?.branding ?? ''),
          String(req.user?.id ?? '')
        );
        return this.sendResp(req, res, { data: await action(principal), headers: this.getNoCacheHeaders() });
      } catch (error) {
        const code = error instanceof ReportingError ? error.code : 'UNAVAILABLE';
        const status = {
          INVALID_QUERY: 400,
          AUTHENTICATION_REQUIRED: 401,
          FORBIDDEN: 403,
          NOT_FOUND: 404,
          UNAVAILABLE: 503,
          LIMIT_EXCEEDED: 413,
        }[code];
        return this.sendResp(req, res, {
          status,
          displayErrors: [{ code, detail: 'Reporting request could not be completed.' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }
    public async schema(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, principal =>
        ReportingService.getReportingSchema(
          principal,
          { recordType: String(getValidatedApiRequest(req)?.params?.recordType ?? '') },
          { channel: 'rest' }
        )
      );
    }
    public async query(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, principal =>
        ReportingService.execute(principal, getValidatedApiRequest(req)?.body as ReportingQuery, { channel: 'rest' })
      );
    }
  }
}
