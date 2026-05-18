import { firstValueFrom } from 'rxjs';
import { Controllers as controllers } from '../../CoreController';
import type { DashboardTableOverrideConfigData, WorkflowStateDashboardConfig } from '../../configmodels/DashboardTableOverrideConfig';
import { BrandingModel } from '../../model/storage/BrandingModel';

declare const DashboardConfigService: any;
declare const DashboardTypesService: any;
declare const BrandingService: any;

export namespace Controllers {
  export class DashboardConfig extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = [
      'getConfigInfo',
      'getDefaults',
      'getOverrides',
      'saveOverrides',
      'getDashboardTypes',
      'createDashboardType',
      'getDashboardType',
      'updateDashboardType',
      'deleteDashboardType',
      'saveWorkflowStateDashboardConfig',
      'saveDashboardViewStepConfig',
      'getMergedConfig',
      'getMergedViewConfig',
      'getMergedTypeFormatRules'
    ];

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private statusForError(error: unknown): number {
      const message = this.asError(error).message;
      if (/not found|was not found/i.test(message)) {
        return 404;
      }
      if (/system dashboard type|cannot be converted/i.test(message)) {
        return 403;
      }
      if (/already exists|is assigned/i.test(message)) {
        return 409;
      }
      if (/required|immutable|invalid/i.test(message)) {
        return 400;
      }
      return 500;
    }

    private sendError(req: Sails.Req, res: Sails.Res, error: unknown) {
      return this.sendResp(req, res, { status: this.statusForError(error), errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
    }

    private resolveBrand(req: Sails.Req): BrandingModel {
      return BrandingService.getBrandFromReq(req as Sails.ReqParamProvider) ?? BrandingService.getDefault();
    }

    private getParam(req: Sails.Req, name: string): string {
      return String(req.param(name) || '').trim();
    }

    public async getConfigInfo(req: Sails.Req, res: Sails.Res) {
      try {
        const info = await DashboardConfigService.getDashboardConfigInfo(this.resolveBrand(req));
        return this.sendResp(req, res, { data: info, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async getDefaults(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const recordType = this.getParam(req, 'recordType');
        const workflowStage = this.getParam(req, 'workflowStage');
        const viewName = this.getParam(req, 'viewName');
        const stepName = this.getParam(req, 'stepName');
        const dashboardType = this.getParam(req, 'dashboardType');
        const defaults: Record<string, unknown> = {};

        if (recordType && workflowStage) {
          const merged = await DashboardConfigService.getMergedDashboardTableConfig(brand, recordType, workflowStage);
          defaults.recordType = merged;
        }

        if (viewName && stepName) {
          const merged = await DashboardConfigService.getMergedDashboardViewTableConfig(brand, viewName, stepName);
          defaults.view = merged;
        }

        if (dashboardType) {
          defaults.dashboardType = await firstValueFrom(DashboardTypesService.get(brand, dashboardType));
        }

        return this.sendResp(req, res, { data: defaults, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async getOverrides(req: Sails.Req, res: Sails.Res) {
      try {
        const overrides = await DashboardConfigService.getDashboardOverrides(this.resolveBrand(req));
        return this.sendResp(req, res, { data: overrides, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async saveOverrides(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const overrides = req.body as DashboardTableOverrideConfigData;
        const saved = await DashboardConfigService.saveDashboardOverrides(brand, overrides);
        return this.sendResp(req, res, { data: saved, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async getDashboardTypes(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const dashboardTypes = await DashboardTypesService.getAllDashboardTypeDefinitions(brand);
        return this.sendResp(req, res, { data: { dashboardTypes }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async createDashboardType(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const saved = await firstValueFrom(DashboardTypesService.createDashboardType(brand, req.body));
        return this.sendResp(req, res, { status: 201, data: saved, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async getDashboardType(req: Sails.Req, res: Sails.Res) {
      try {
        const dashboardType = this.getParam(req, 'dashboardType');
        if (!dashboardType) {
          return this.sendResp(req, res, { status: 400, errors: [new Error('dashboardType is required')], headers: this.getNoCacheHeaders() });
        }
        const brand = this.resolveBrand(req);
        const saved = await DashboardTypesService.getDashboardTypeDefinition(brand, dashboardType);
        if (!saved) {
          return this.sendResp(req, res, { status: 404, errors: [new Error(`Dashboard type '${dashboardType}' not found`)], headers: this.getNoCacheHeaders() });
        }
        return this.sendResp(req, res, { data: saved, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async updateDashboardType(req: Sails.Req, res: Sails.Res) {
      try {
        const dashboardType = this.getParam(req, 'dashboardType');
        if (!dashboardType) {
          return this.sendResp(req, res, { status: 400, errors: [new Error('dashboardType is required')], headers: this.getNoCacheHeaders() });
        }
        const brand = this.resolveBrand(req);
        const saved = await firstValueFrom(DashboardTypesService.updateDashboardType(brand, dashboardType, req.body));
        return this.sendResp(req, res, { data: saved, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async deleteDashboardType(req: Sails.Req, res: Sails.Res) {
      try {
        const dashboardType = this.getParam(req, 'dashboardType');
        if (!dashboardType) {
          return this.sendResp(req, res, { status: 400, errors: [new Error('dashboardType is required')], headers: this.getNoCacheHeaders() });
        }
        const brand = this.resolveBrand(req);
        const saved = await firstValueFrom(DashboardTypesService.deleteDashboardType(brand, dashboardType));
        return this.sendResp(req, res, { data: saved, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async saveWorkflowStateDashboardConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const recordType = this.getParam(req, 'recordType');
        const workflowStage = this.getParam(req, 'workflowStage');
        const saved = await DashboardConfigService.saveWorkflowStateDashboardConfig(brand, recordType, workflowStage, req.body as WorkflowStateDashboardConfig);
        return this.sendResp(req, res, { data: saved, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async saveDashboardViewStepConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const viewName = this.getParam(req, 'viewName');
        const stepName = this.getParam(req, 'stepName');
        const saved = await DashboardConfigService.saveDashboardViewStepConfig(brand, viewName, stepName, req.body as WorkflowStateDashboardConfig);
        return this.sendResp(req, res, { data: saved, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async getMergedConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const recordType = this.getParam(req, 'recordType');
        const workflowStage = this.getParam(req, 'workflowStage');
        if (!recordType || !workflowStage) {
          return this.sendResp(req, res, { status: 400, errors: [new Error('recordType and workflowStage are required')], headers: this.getNoCacheHeaders() });
        }
        const merged = await DashboardConfigService.getMergedDashboardTableConfig(this.resolveBrand(req), recordType, workflowStage);
        return this.sendResp(req, res, { data: merged, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async getMergedViewConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const viewName = this.getParam(req, 'viewName');
        const stepName = this.getParam(req, 'stepName');
        if (!viewName || !stepName) {
          return this.sendResp(req, res, { status: 400, errors: [new Error('viewName and stepName are required')], headers: this.getNoCacheHeaders() });
        }
        const merged = await DashboardConfigService.getMergedDashboardViewTableConfig(this.resolveBrand(req), viewName, stepName);
        return this.sendResp(req, res, { data: merged, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async getMergedTypeFormatRules(req: Sails.Req, res: Sails.Res) {
      try {
        const dashboardType = this.getParam(req, 'dashboardType');
        if (!dashboardType) {
          return this.sendResp(req, res, { status: 400, errors: [new Error('dashboardType is required')], headers: this.getNoCacheHeaders() });
        }
        const merged = await DashboardConfigService.getMergedDashboardTypeFormatRules(this.resolveBrand(req), dashboardType);
        return this.sendResp(req, res, { data: merged, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }
  }
}
