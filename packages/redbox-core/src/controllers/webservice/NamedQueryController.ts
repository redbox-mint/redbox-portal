import { Controllers as controllers } from '../../CoreController';
import type { NamedQueryDefinition } from '../../config/namedQuery.config';
import { BrandingModel } from '../../model/storage/BrandingModel';

export namespace Controllers {
  export class NamedQuery extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = [
      'listQueries',
      'getCollections',
      'getQuery',
      'createQuery',
      'updateQuery',
      'deleteQuery'
    ];

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private statusForError(error: unknown): number {
      const message = this.asError(error).message;
      if (/Named query .*not found/i.test(message)) {
        return 404;
      }
      if (/already exists/i.test(message)) {
        return 409;
      }
      if (/required|invalid/i.test(message)) {
        return 400;
      }
      return 500;
    }

    private sendError(req: Sails.Req, res: Sails.Res, error: unknown) {
      return this.sendResp(req, res, { status: this.statusForError(error), errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
    }

    private resolveBrand(req: Sails.Req): BrandingModel {
      return BrandingService.getBrand(req.session.branding as string);
    }

    public async listQueries(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const queries = await NamedQueryService.list(brand);
        return this.sendResp(req, res, { data: queries, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async getCollections(req: Sails.Req, res: Sails.Res) {
      try {
        const collections = NamedQueryService.getSupportedCollections();
        return this.sendResp(req, res, { data: collections, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async getQuery(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const name = req.param('name');
        if (!name) {
          return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'name is required', status: '400' }], headers: this.getNoCacheHeaders() });
        }
        const query = await NamedQueryService.getNamedQueryConfig(brand, name);
        if (!query) {
          return this.sendResp(req, res, { status: 404, displayErrors: [{ detail: `Named query '${name}' not found`, status: '404' }], headers: this.getNoCacheHeaders() });
        }
        return this.sendResp(req, res, { data: query, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async createQuery(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const body = (req.body as Record<string, unknown>) || {};
        const name = body['name'] as string;
        if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) {
          return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'name is required and must be URL safe', status: '400' }], headers: this.getNoCacheHeaders() });
        }
        if (name === 'collections') {
          return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: "'collections' is a reserved name and cannot be used", status: '400' }], headers: this.getNoCacheHeaders() });
        }
        await NamedQueryService.create(brand, name, body as unknown as NamedQueryDefinition);
        return this.sendResp(req, res, { status: 201, data: { name }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async updateQuery(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const name = req.param('name');
        if (!name) {
          return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'name is required', status: '400' }], headers: this.getNoCacheHeaders() });
        }
        const body = (req.body as Record<string, unknown>) || {};
        if (body['name'] && body['name'] !== name) {
          return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Named query name cannot be changed', status: '400' }], headers: this.getNoCacheHeaders() });
        }
        await NamedQueryService.update(brand, name, body as unknown as NamedQueryDefinition);
        return this.sendResp(req, res, { data: { name }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async deleteQuery(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const name = req.param('name');
        if (!name) {
          return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'name is required', status: '400' }], headers: this.getNoCacheHeaders() });
        }
        await NamedQueryService.delete(brand, name);
        return this.sendResp(req, res, { data: { name }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }
  }
}
