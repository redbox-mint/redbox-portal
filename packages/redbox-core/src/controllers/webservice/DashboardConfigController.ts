import { firstValueFrom } from 'rxjs';
import { Controllers as controllers } from '../../CoreController';
import type { DashboardTableOverrideConfigData } from '../../configmodels/DashboardTableOverrideConfig';
import type { DashboardTableConfig, DashboardFormatRules } from '../../config/workflow.config';
import { BrandingModel } from '../../model/storage/BrandingModel';

export namespace Controllers {
  export class DashboardConfig extends controllers.Core.Controller {
    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    protected override _exportedMethods: string[] = [
      'getConfigInfo',
      'getDefaults',
      'getOverrides',
      'saveOverrides',
      'getMergedConfig',
      'getMergedViewConfig',
      'getMergedTypeFormatRules'
    ];

    private resolveBrand(req: Sails.Req): BrandingModel {
      return BrandingService.getBrandFromReq(req as Sails.ReqParamProvider) ?? BrandingService.getDefault();
    }

    public async getConfigInfo(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const info = await DashboardConfigService.getDashboardConfigInfo(brand);
        return this.sendResp(req, res, { data: info, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 500, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async getDefaults(req: Sails.Req, res: Sails.Res) {
      try {
        const recordType = String(req.param('recordType') || '');
        const workflowStage = String(req.param('workflowStage') || '');
        const viewName = String(req.param('viewName') || '');
        const stepName = String(req.param('stepName') || '');
        const dashboardType = String(req.param('dashboardType') || '');

        const brand = this.resolveBrand(req);
        const defaults: Record<string, unknown> = {};

        if (recordType && workflowStage) {
          const recType = await firstValueFrom(RecordTypesService.get(brand, recordType));
          if (recType) {
            const workflowStep = await firstValueFrom(WorkflowStepsService.get(recType, workflowStage));
            if (workflowStep) {
              const tableConfig = _.get(workflowStep, 'config.dashboard.table');
              defaults.tableConfig = _.isEmpty(tableConfig) ? DashboardConfigService.getDefaultDashboardTableConfig() : tableConfig;
            }
          }
        }

        if (viewName && stepName) {
          const viewDef = sails.config.dashboardview?.[viewName];
          const stepDef = viewDef?.steps?.find((s: { name: string }) => s.name === stepName);
          defaults.viewTableConfig = stepDef?.dashboardTable ?? null;
        }

        if (dashboardType) {
          const dtModel = await firstValueFrom(DashboardTypesService.get(brand, dashboardType));
          defaults.formatRules = dtModel?.formatRules ?? null;
        }

        return this.sendResp(req, res, { data: defaults, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 500, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async getOverrides(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const overrides = await DashboardConfigService.getDashboardOverrides(brand);
        return this.sendResp(req, res, { data: overrides, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 500, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async saveOverrides(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const overrides = req.body as DashboardTableOverrideConfigData;
        const saved = await DashboardConfigService.saveDashboardOverrides(brand, overrides);
        return this.sendResp(req, res, { data: saved, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 500, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async getMergedConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const recordType = String(req.param('recordType') || '');
        const workflowStage = String(req.param('workflowStage') || '');
        if (!recordType || !workflowStage) {
          return this.sendResp(req, res, { status: 400, errors: [new Error('recordType and workflowStage are required')], headers: this.getNoCacheHeaders() });
        }
        const brand = this.resolveBrand(req);
        const merged = await DashboardConfigService.getMergedDashboardTableConfig(brand, recordType, workflowStage);
        return this.sendResp(req, res, { data: merged, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 500, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async getMergedViewConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const viewName = String(req.param('viewName') || '');
        const stepName = String(req.param('stepName') || '');
        if (!viewName || !stepName) {
          return this.sendResp(req, res, { status: 400, errors: [new Error('viewName and stepName are required')], headers: this.getNoCacheHeaders() });
        }
        const brand = this.resolveBrand(req);
        const merged = await DashboardConfigService.getMergedDashboardViewTableConfig(brand, viewName, stepName);
        return this.sendResp(req, res, { data: merged, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 500, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async getMergedTypeFormatRules(req: Sails.Req, res: Sails.Res) {
      try {
        const dashboardType = String(req.param('dashboardType') || '');
        if (!dashboardType) {
          return this.sendResp(req, res, { status: 400, errors: [new Error('dashboardType is required')], headers: this.getNoCacheHeaders() });
        }
        const brand = this.resolveBrand(req);
        const merged = await DashboardConfigService.getMergedDashboardTypeFormatRules(brand, dashboardType);
        return this.sendResp(req, res, { data: merged, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 500, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }
  }
}
