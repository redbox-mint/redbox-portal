import { Controllers as controllers } from '../../CoreController';
import { Services as VocabularyServiceModule } from '../../services/VocabularyService';

type BrandingServiceApi = {
  getBrandFromReq: (req: { params?: Record<string, unknown>; body?: Record<string, unknown>; session?: Record<string, unknown> }) => string;
  getBrand: (nameOrId: string) => { id?: string | number } | null;
};

type VocabularyServiceApi = {
  list: (options: VocabularyServiceModule.VocabularyListOptions) => Promise<{ data: unknown[]; meta: { total: number; limit: number; offset: number } }>;
  getById: (id: string) => Promise<unknown>;
  getTree: (id: string) => Promise<unknown[]>;
  create: (input: VocabularyServiceModule.VocabularyInput) => Promise<unknown>;
  update: (id: string, input: Partial<VocabularyServiceModule.VocabularyInput>) => Promise<unknown>;
  delete: (id: string) => Promise<void>;
};

type RvaImportServiceApi = {
  importRvaVocabulary: (rvaId: string, versionId?: string, branding?: string) => Promise<unknown>;
  syncRvaVocabulary: (vocabularyId: string, versionId?: string) => Promise<{ updated: number; created: number; skipped: number; lastSyncedAt: string }>;
};

declare const BrandingService: BrandingServiceApi;
declare const VocabularyService: VocabularyServiceApi;
declare const RvaImportService: RvaImportServiceApi;

export namespace Controllers {
  export class Vocabulary extends controllers.Core.Controller {
    private parseNumberParam(value: unknown, fallback: number): number {
      if (value === '' || typeof value === 'undefined' || value === null) {
        return fallback;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    private resolveBrandingId(req: Sails.Req): string {
      const brandingNameOrId = BrandingService.getBrandFromReq(req as unknown as {
        params?: Record<string, unknown>;
        body?: Record<string, unknown>;
        session?: Record<string, unknown>;
      });
      const branding = BrandingService.getBrand(brandingNameOrId);
      return String(branding?.id ?? brandingNameOrId);
    }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    protected override _exportedMethods: string[] = [
      'list',
      'get',
      'create',
      'update',
      'delete',
      'import',
      'sync'
    ];

    public async list(req: Sails.Req, res: Sails.Res) {
      try {
        const limit = this.parseNumberParam(req.param('limit'), 25);
        const offset = this.parseNumberParam(req.param('offset'), 0);
        const response = await VocabularyService.list({
          q: req.param('q'),
          type: req.param('type'),
          source: req.param('source'),
          limit,
          offset,
          sort: req.param('sort'),
          branding: this.resolveBrandingId(req)
        });
        return this.sendResp(req, res, { data: response, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 500, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async get(req: Sails.Req, res: Sails.Res) {
      try {
        const id = String(req.param('id') || '');
        const vocabulary = await VocabularyService.getById(id);
        if (!vocabulary) {
          return this.sendResp(req, res, { status: 404, displayErrors: [{ title: 'Vocabulary not found' }], headers: this.getNoCacheHeaders() });
        }
        const entries = await VocabularyService.getTree(id);
        return this.sendResp(req, res, { data: { vocabulary, entries }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 500, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async create(req: Sails.Req, res: Sails.Res) {
      try {
        const payload = {
          ...req.body,
          branding: this.resolveBrandingId(req)
        } as VocabularyServiceModule.VocabularyInput;
        const created = await VocabularyService.create(payload);
        return this.sendResp(req, res, { status: 201, data: created, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 400, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async update(req: Sails.Req, res: Sails.Res) {
      try {
        const id = String(req.param('id') || '');
        const updated = await VocabularyService.update(id, req.body as Partial<VocabularyServiceModule.VocabularyInput>);
        return this.sendResp(req, res, { data: updated, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 400, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async delete(req: Sails.Req, res: Sails.Res) {
      try {
        const id = String(req.param('id') || '');
        await VocabularyService.delete(id);
        return this.sendResp(req, res, { status: 204, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 400, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async import(req: Sails.Req, res: Sails.Res) {
      try {
        const rvaId = String(req.body?.rvaId || '');
        if (!rvaId.trim()) {
          return this.sendResp(req, res, { status: 400, errors: [new Error('rvaId is required')], headers: this.getNoCacheHeaders() });
        }
        const versionId = req.body?.versionId ? String(req.body.versionId) : undefined;
        const created = await RvaImportService.importRvaVocabulary(rvaId, versionId, this.resolveBrandingId(req));
        return this.sendResp(req, res, { data: created, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 400, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async sync(req: Sails.Req, res: Sails.Res) {
      try {
        const id = String(req.param('id') || '');
        const versionId = req.body?.versionId ? String(req.body.versionId) : undefined;
        const result = await RvaImportService.syncRvaVocabulary(id, versionId);
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 400, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }
  }
}
