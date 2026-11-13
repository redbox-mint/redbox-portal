import { publishedExplorations } from '../services/named-query/explorer-links';
import { z } from 'zod';
import { Controllers as controllers } from '../CoreController';
import { getRouteParam } from '../utilities/RequestParamUtils';
import { SavedGridError, savedGridId, savedGridRevision } from '../services/SavedGridService';

const createBody = z.strictObject({ definition: z.unknown() });
const updateBody = createBody.extend({ revision: savedGridRevision });
const deleteBody = z.strictObject({ revision: savedGridRevision });
/** Require a browser session and this route brand's Admin role, independently of path rules. */
export function savedGridContext(req: Sails.Req) {
  const brand = BrandingService.getBrand(getRouteParam(req, 'branding'));
  const portal = getRouteParam(req, 'portal');
  const admin = brand && RolesService.getAdmin(brand);
  const roles = req.user?.roles;
  if (
    !brand ||
    !portal ||
    !admin ||
    !req.isAuthenticated() ||
    !Array.isArray(roles) ||
    !roles.some(role => role && typeof role === 'object' && String(role.id) === String(admin.id))
  )
    throw new SavedGridError(403, 'auth-required');
  return { scope: { brandId: String(brand.id), portal }, caller: { brand, portal, user: req.user, roles } };
}
export namespace Controllers {
  export class SavedGrid extends controllers.Core.Controller {
    protected override _exportedMethods = ['list', 'read', 'create', 'update', 'remove', 'stages', 'schema'];
    private async run(req: Sails.Req, res: Sails.Res, action: () => Promise<unknown>) {
      try {
        const result = await action();
        return this.sendResp(req, res, { data: result, headers: { 'Cache-Control': 'no-store' } });
      } catch (error) {
        const known = error instanceof SavedGridError;
        const status = known ? error.status : 500;
        const code = known ? error.code : 'persistence-failed';
        return this.sendResp(req, res, {
          status,
          displayErrors: [{ status: String(status), code, title: code }],
          headers: { 'Cache-Control': 'no-store' },
        });
      }
    }
    private parse<T>(schema: z.ZodType<T>, value: unknown): T {
      const result = schema.safeParse(value);
      if (!result.success) throw new SavedGridError(400, 'invalid-definition');
      return result.data;
    }
    public list(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, async () => {
        const { scope } = savedGridContext(req);
        const page = await SavedGridService.list(scope, req.query.after === undefined ? undefined : this.parse(savedGridId, req.query.after));
        return { ...page, grids: await publishedExplorations(scope, page.grids) };
      });
    }
    public schema(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, () => SavedGridService.schema(savedGridContext(req).caller));
    }
    public stages(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, () =>
        SavedGridService.stages(
          savedGridContext(req).caller,
          this.parse(z.string().min(1).max(120), getRouteParam(req, 'recordType'))
        )
      );
    }
    public read(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, async () => {
        const { scope } = savedGridContext(req);
        const grid = await SavedGridService.read(scope, this.parse(savedGridId, getRouteParam(req, 'gridId')));
        return (await publishedExplorations(scope, [grid]))[0];
      });
    }
    public create(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, async () => {
        const { scope, caller } = savedGridContext(req);
        const grid = await SavedGridService.create(scope, this.parse(createBody, req.body).definition, caller);
        return (await publishedExplorations(scope, [grid]))[0];
      });
    }
    public update(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, async () => {
        const { scope, caller } = savedGridContext(req);
        const body = this.parse(updateBody, req.body);
        const grid = await SavedGridService.update(
          scope,
          this.parse(savedGridId, getRouteParam(req, 'gridId')),
          body.revision,
          body.definition,
          caller
        );
        return (await publishedExplorations(scope, [grid]))[0];
      });
    }
    public remove(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, () =>
        SavedGridService.remove(
          savedGridContext(req).scope,
          this.parse(savedGridId, getRouteParam(req, 'gridId')),
          this.parse(deleteBody, req.body).revision
        )
      );
    }
  }
}
