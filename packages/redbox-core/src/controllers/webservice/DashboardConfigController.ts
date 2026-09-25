import { Controllers as controllers } from '../../CoreController';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { Services as DashboardConfigServices } from '../../services/DashboardConfigService';

const RETIRED_OPERATION_GUIDANCE =
  'Dashboard profiles, defaults and overrides were replaced by independent settings for each workflow stage and dashboard-view step. ' +
  'Use GET /api/dashboard-config/targets, GET|PUT /api/dashboard-config/workflows/:recordType/:stage, ' +
  'GET|PUT /api/dashboard-config/views/:view/:step and the /api/dashboard-config/copy operations.';

export namespace Controllers {
  /**
   * Independent dashboard configuration API. Controllers resolve the brand,
   * validate the request envelope and delegate to DashboardConfigService.
   */
  export class DashboardConfig extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = [
      'listTargets',
      'getWorkflowTarget',
      'saveWorkflowTarget',
      'getViewTarget',
      'saveViewTarget',
      'validateSettings',
      'previewCopy',
      'applyCopy',
      'migrationPreflight',
      'retiredOperation'
    ];

    private sendError(req: Sails.Req, res: Sails.Res, error: unknown) {
      if (error instanceof DashboardConfigServices.DashboardConfigError) {
        return this.sendResp(req, res, {
          status: error.status,
          displayErrors: [{ status: String(error.status), code: error.code, title: error.code, detail: error.message, meta: error.details }],
          meta: error.details,
          headers: this.getNoCacheHeaders()
        });
      }
      return this.sendResp(req, res, {
        status: 500,
        errors: [error instanceof Error ? error : new Error(String(error))],
        headers: this.getNoCacheHeaders()
      });
    }

    /** The brand comes from the route; never fall back to the default brand. */
    private resolveBrand(req: Sails.Req): BrandingModel {
      const brandName = String(req.param('branding') ?? '').trim();
      const brand = brandName ? BrandingService.getBrand(brandName) : null;
      if (!brand) {
        throw new DashboardConfigServices.DashboardConfigError('target-not-found', `Brand "${brandName}" was not found.`);
      }
      return brand;
    }

    private param(req: Sails.Req, name: string): string {
      return String(req.param(name) ?? '').trim();
    }

    private body(req: Sails.Req): Record<string, unknown> {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new DashboardConfigServices.DashboardConfigError('invalid-request', 'Request body must be a JSON object.');
      }
      return body as Record<string, unknown>;
    }

    private async run(req: Sails.Req, res: Sails.Res, work: (brand: BrandingModel) => Promise<unknown>) {
      try {
        const data = await work(this.resolveBrand(req));
        return this.sendResp(req, res, { data, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async listTargets(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, async (brand) => {
        const catalogue = await DashboardConfigService.getTargetCatalogue(brand);
        return { targets: catalogue.targets, catalogueFingerprint: catalogue.fingerprint };
      });
    }

    public async getWorkflowTarget(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand) => DashboardConfigService.getTargetSettings(brand, { kind: 'workflow', recordType: this.param(req, 'recordType'), stage: this.param(req, 'stage') }));
    }

    public async saveWorkflowTarget(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand) => DashboardConfigService.saveTargetSettings(brand, { kind: 'workflow', recordType: this.param(req, 'recordType'), stage: this.param(req, 'stage') }, this.body(req) as unknown as DashboardConfigServices.DashboardSaveRequest));
    }

    public async getViewTarget(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand) => DashboardConfigService.getTargetSettings(brand, { kind: 'view', view: this.param(req, 'view'), step: this.param(req, 'step') }));
    }

    public async saveViewTarget(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand) => DashboardConfigService.saveTargetSettings(brand, { kind: 'view', view: this.param(req, 'view'), step: this.param(req, 'step') }, this.body(req) as unknown as DashboardConfigServices.DashboardSaveRequest));
    }

    public async validateSettings(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand) => {
        const body = this.body(req);
        return DashboardConfigService.validateTargetSettings(brand, body.target, body.expectedRevision, body.settings);
      });
    }

    public async previewCopy(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand) => DashboardConfigService.previewCopy(brand, this.body(req) as unknown as DashboardConfigServices.DashboardCopyRequest));
    }

    public async applyCopy(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand) => DashboardConfigService.applyCopy(brand, this.body(req) as unknown as DashboardConfigServices.DashboardCopyApplyRequest));
    }

    /** Read-only legacy migration preflight: JSON report plus readable summary. */
    public async migrationPreflight(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, async () => ({ reports: await DashboardConfigService.preflightLegacyMigration() }));
    }

    /** Retired profile/default/override operations. Authentication has already run. */
    public async retiredOperation(req: Sails.Req, res: Sails.Res) {
      return this.sendError(req, res, new DashboardConfigServices.DashboardConfigError('legacy-operation-retired', `This dashboard configuration operation has been retired. ${RETIRED_OPERATION_GUIDANCE}`, { replacement: '/api/dashboard-config/targets' }));
    }
  }
}
