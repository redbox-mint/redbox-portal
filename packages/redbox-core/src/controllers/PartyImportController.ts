import { randomUUID } from 'node:crypto';
import { Controllers as controllers } from '../CoreController';
import { partyImportInput } from '../api-routes/groups/party-import';
import { PartyImportError, partyImportHash } from '../services/PartyImportService';

type Ticket = { token: string; hash: string; expires: number };
export namespace Controllers {
  export class PartyImport extends controllers.Core.Controller {
    protected override _exportedMethods = ['inspect', 'preview', 'apply'];
    private actor(req: Sails.Req) {
      const brand = BrandingService.getBrand(String(req.params.branding ?? ''));
      const role = brand && RolesService.getRoleByName(brand, 'Admin');
      if (!brand?.id || !req.session || !req.isAuthenticated() || !role || !req.user || !UsersService.hasRole(req.user, role)) throw new PartyImportError(403, 'forbidden');
      return { brand, user: req.user };
    }
    private async handle(action: 'inspect' | 'preview' | 'apply', req: Sails.Req, res: Sails.Res) {
      try {
        const { brand, user } = this.actor(req);
        const body = req.body as { csv: string; mapping: unknown; token?: string };
        const session = req.session as unknown as { partyImport?: Ticket };
        let data: unknown;
        if (action === 'inspect') data = await PartyImportService.inspect(body.csv);
        else {
          const input = partyImportInput.parse({ csv: body.csv, mapping: body.mapping });
          const hash = partyImportHash(input, String(brand.id), String(user.id));
          if (action === 'preview') {
            data = await PartyImportService.preview(input.csv, input.mapping, brand, user);
            const token = randomUUID();
            await CacheEntry.destroy({ name: { startsWith: 'party-import:' }, ts_added: { '<': Date.now() - 15 * 60 * 1000 } });
            await CacheEntry.create({ name: `party-import:${token}`, ts_added: Date.now(), data: { hash } });
            session.partyImport = { token, hash, expires: Date.now() + 15 * 60 * 1000 };
            data = { ...(data as object), token };
          } else {
            const ticket = session.partyImport;
            if (!ticket || ticket.expires < Date.now() || ticket.token !== body.token || ticket.hash !== hash) throw new PartyImportError(409, 'preview-required');
            const claimed = await CacheEntry.destroyOne({ name: `party-import:${ticket.token}` });
            if (!claimed) throw new PartyImportError(409, 'preview-required');
            delete session.partyImport;
            // Persist consumption before the first record write. A lost response
            // must not turn the same preview into a second batch of creations.
            await new Promise<void>((resolve, reject) => req.session!.save(error => error ? reject(error) : resolve()));
            data = await PartyImportService.apply(input.csv, input.mapping, brand, user);
          }
        }
        return this.sendResp(req, res, { data, headers: this.getNoCacheHeaders() });
      } catch (error) {
        const status = error instanceof PartyImportError ? error.status : 400;
        return this.sendResp(req, res, { status, v1: { code: error instanceof PartyImportError ? error.code : 'import-failed' }, displayErrors: [{ code: error instanceof PartyImportError ? error.code : 'import-failed' }], headers: this.getNoCacheHeaders() });
      }
    }
    public inspect(req: Sails.Req, res: Sails.Res) { return this.handle('inspect', req, res); }
    public preview(req: Sails.Req, res: Sails.Res) { return this.handle('preview', req, res); }
    public apply(req: Sails.Req, res: Sails.Res) { return this.handle('apply', req, res); }
  }
}
