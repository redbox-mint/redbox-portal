import { Controllers as controllers } from '../CoreController';
import { asGenerationError } from '../model/generation';
import { requireGenerationModelAdmin } from '../policies/generationModelAdmin';
import { getRouteParam } from '../utilities/RequestParamUtils';
import { requireService } from '../services/generation/require-service';
import type { Services } from '../services/GenerationProfileAdminService';

export namespace Controllers {
  export class GenerationProfileAdmin extends controllers.Core.Controller {
    protected override _exportedMethods = ['page', 'overview', 'create', 'save', 'publish', 'newVersion', 'duplicate', 'discard', 'remove', 'retire', 'runTests'];
    private async run(req: Sails.Req, res: Sails.Res, action: (service: Services.GenerationProfileAdminService, brand: string, actor: string) => unknown) {
      res.set({ ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' });
      try {
        const brand = requireGenerationModelAdmin(req);
        const result = await action(requireService<Services.GenerationProfileAdminService>('generationprofileadminservice', ['overview']), String(brand.id), String(req.user!.id));
        return res.headersSent ? result : res.status(200).json(result);
      } catch (error) {
        const safe = asGenerationError(error);
        return res.status(safe.status).json({ error: { code: safe.code, messageKey: 'ai-profiles-error-' + safe.code.toLowerCase().replaceAll('_', '-'), retryable: safe.retryable } });
      }
    }
    public page(req: Sails.Req, res: Sails.Res) {
      res.set({ ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' });
      try {
        requireGenerationModelAdmin(req);
        return this.sendView(req, res, 'admin/ai-profiles', { pageTitleKey: 'ai-profiles-title', adminInitialStyles: true, generationEnabled: sails.config.generation.enabled });
      } catch (error) {
        const safe = asGenerationError(error);
        return res.status(safe.status).json({ error: { code: safe.code, messageKey: 'ai-profiles-error-' + safe.code.toLowerCase().replaceAll('_', '-'), retryable: safe.retryable } });
      }
    }
    public overview(req: Sails.Req, res: Sails.Res) { return this.run(req, res, (s, b) => s.overview(b)); }
    public create(req: Sails.Req, res: Sails.Res) { return this.run(req, res, (s, b, a) => s.create(b, req.body, a)); }
    public save(req: Sails.Req, res: Sails.Res) { return this.run(req, res, (s, b, a) => s.save(b, getRouteParam(req, 'versionId'), req.body, a)); }
    public publish(req: Sails.Req, res: Sails.Res) { return this.run(req, res, (s, b, a) => s.publish(b, getRouteParam(req, 'versionId'), req.body, a)); }
    public newVersion(req: Sails.Req, res: Sails.Res) { return this.run(req, res, (s, b, a) => s.newVersion(b, getRouteParam(req, 'versionId'), a)); }
    public duplicate(req: Sails.Req, res: Sails.Res) { return this.run(req, res, (s, b, a) => s.duplicate(b, getRouteParam(req, 'key'), req.body, a)); }
    public discard(req: Sails.Req, res: Sails.Res) { return this.run(req, res, (s, b) => s.discard(b, getRouteParam(req, 'versionId'))); }
    public remove(req: Sails.Req, res: Sails.Res) { return this.run(req, res, (s, b) => s.remove(b, getRouteParam(req, 'key'))); }
    public retire(req: Sails.Req, res: Sails.Res) { return this.run(req, res, (s, b, a) => s.retire(b, getRouteParam(req, 'versionId'), a)); }
    public runTests(req: Sails.Req, res: Sails.Res) { return this.run(req, res, (s, b, a) => s.runTests(b, getRouteParam(req, 'versionId'), a)); }
  }
}
