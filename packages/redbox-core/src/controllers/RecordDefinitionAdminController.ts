import { Controllers as Core } from '../CoreController';
import type { Services as Branding } from '../services/BrandingService';
import type { Services as Admin, RecordDefinitionAdminAction } from '../services/RecordDefinitionAdminService';
import { getRouteParam } from '../utilities/RequestParamUtils';
import type { RuntimeValue } from '../runtimeValues';

declare const BrandingService: Branding.Branding;
declare const RecordDefinitionAdminService: Admin.RecordDefinitionAdmin;

export namespace Controllers {
  export class RecordDefinitionAdmin extends Core.Core.Controller {
    protected override _exportedMethods = [
      'list',
      'clone',
      'get',
      'draft',
      'save',
      'discard',
      'validate',
      'publish',
      'revisions',
      'revision',
      'rollback',
      'retire',
      'unretire',
      'actions',
      'writeSecret',
      'clearSecret',
    ];
    // No Sails-dependent construction: inherited exports() initializes once before dispatch.
    private async sendAdminResponse(
      action: RecordDefinitionAdminAction,
      req: Sails.Req,
      res: Sails.Res
    ): Promise<void> {
      try {
        if (!req.isAuthenticated() || !req.user) {
          res.status(401).json({ error: 'authentication-required' });
          return;
        }
        const brand = BrandingService.getBrand(getRouteParam(req, 'branding'));
        if (!brand) {
          res.status(404).json({ error: 'branding-not-found' });
          return;
        }
        const roles = (req.user.roles ?? []) as { name?: string; branding?: string | { id?: string } }[];
        if (
          !Array.isArray(roles) ||
          !roles.some(
            role =>
              role?.name === 'Admin' &&
              (typeof role.branding === 'string' ? role.branding : role.branding?.id) === brand.id
          )
        ) {
          res.status(403).json({ error: 'forbidden' });
          return;
        }
        const id = req.user.id;
        if (typeof id !== 'string' || id.length === 0) {
          res.status(403).json({ error: 'forbidden' });
          return;
        }
        const result = await RecordDefinitionAdminService.handle(action, {
          brandId: brand.id,
          actor: { id },
          key: getRouteParam(req, action === 'clone' ? 'sourceKey' : 'key'),
          revision: getRouteParam(req, 'revision'),
          bindingId: getRouteParam(req, 'bindingId'),
          parameter: getRouteParam(req, 'parameter'),
          body: (req.body ?? {}) as RuntimeValue,
          query: req.query as RuntimeValue,
        });
        if (result.status === 200) res.ok(result.data);
        else res.status(result.status).json(result.data);
      } catch {
        res.status(500).json({ error: 'server-error' });
      }
    }
    public list(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('list', req, res);
    }
    public clone(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('clone', req, res);
    }
    public get(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('get', req, res);
    }
    public draft(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('draft', req, res);
    }
    public save(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('save', req, res);
    }
    public discard(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('discard', req, res);
    }
    public validate(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('validate', req, res);
    }
    public publish(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('publish', req, res);
    }
    public revisions(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('revisions', req, res);
    }
    public revision(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('revision', req, res);
    }
    public rollback(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('rollback', req, res);
    }
    public retire(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('retire', req, res);
    }
    public unretire(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('unretire', req, res);
    }
    public actions(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('actions', req, res);
    }
    public writeSecret(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('writeSecret', req, res);
    }
    public clearSecret(req: Sails.Req, res: Sails.Res): Promise<void> {
      return this.sendAdminResponse('clearSecret', req, res);
    }
  }
}
