import { Controllers as controllers } from '../CoreController';
import { asGenerationError } from '../model/generation';
import { requireGenerationModelAdmin } from '../policies/generationModelAdmin';
import { getRouteParam } from '../utilities/RequestParamUtils';
import { parseAdminInput, publishModelSchema } from '../services/generation/model-admin-validation';
import { requireService } from '../services/generation/require-service';
import type { Services } from '../services/GenerationModelService';

export function mapGenerationModelAdminError(error: unknown) {
  const safe = asGenerationError(error);
  return { status: safe.status, body: { error: { code: safe.code,
    messageKey: `ai-models-provider-error-${safe.code.toLowerCase().replaceAll('_', '-')}`, retryable: safe.retryable } } };
}

export namespace Controllers {
  export class GenerationModelAdmin extends controllers.Core.Controller {
    protected override _exportedMethods = [
      'page', 'overview', 'createConnection', 'updateConnection', 'testConnection', 'createModel',
      'newVersion', 'updateDraft', 'publish', 'retire', 'tryPrompt', 'deleteConnection', 'discardDraft', 'deleteModel',
    ];
    private service() {
      return requireService<Services.GenerationModelService>('generationmodelservice', ['adminOverview']);
    }
    private async run(req: Sails.Req, res: Sails.Res, action: (brand: string, actor: string) => unknown) {
      res.set({ ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' });
      try {
        const brand = requireGenerationModelAdmin(req);
        const result = await action(String(brand.id), String(req.user!.id));
        return res.status(200).json(result);
      } catch (error) {
        const mapped = mapGenerationModelAdminError(error);
        this.updateChronicle(req, { generationModelAdminErrorCode: mapped.body.error.code });
        return res.status(mapped.status).json(mapped.body);
      }
    }
    public page(req: Sails.Req, res: Sails.Res) {
      res.set({ ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' });
      try {
        requireGenerationModelAdmin(req);
        return this.sendView(req, res, 'admin/ai-models', {
          pageTitleKey: 'ai-models-title', adminInitialStyles: true, generationEnabled: sails.config.generation.enabled,
        });
      } catch (error) {
        const mapped = mapGenerationModelAdminError(error);
        return res.status(mapped.status).json(mapped.body);
      }
    }
    public overview(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, brand => this.service().adminOverview(brand));
    }
    public createConnection(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, actor) => this.service().saveAdminConnection(brand, req.body, actor));
    }
    public updateConnection(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, actor) => this.service().saveAdminConnection(brand, req.body, actor, getRouteParam(req, 'connectionId')));
    }
    public testConnection(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, actor) => this.service().testConnectionDraft(brand, actor, req.body));
    }
    public createModel(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, actor) => this.service().createModel(brand, req.body, actor));
    }
    public newVersion(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, actor) => this.service().newDeploymentVersion(brand, getRouteParam(req, 'deploymentId'), actor));
    }
    public updateDraft(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, brand => this.service().updateDeploymentDraft(brand, getRouteParam(req, 'deploymentId'), req.body));
    }
    public publish(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, actor) => this.service().publishDeployment(brand, getRouteParam(req, 'deploymentId'), actor, parseAdminInput(publishModelSchema, req.body).expectedContentHash));
    }
    public retire(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, brand => this.service().retireDeployment(brand, getRouteParam(req, 'deploymentId')));
    }
    public deleteConnection(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, brand => this.service().deleteConnection(brand, getRouteParam(req, 'connectionId')));
    }
    public discardDraft(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, brand => this.service().discardDeployment(brand, getRouteParam(req, 'deploymentId')));
    }
    public deleteModel(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, brand => this.service().deleteModel(brand, getRouteParam(req, 'key')));
    }
    public tryPrompt(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, actor) => this.service().tryPrompt(brand, actor, req.body));
    }
  }
}
