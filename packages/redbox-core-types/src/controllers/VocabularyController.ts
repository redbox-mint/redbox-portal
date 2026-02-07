import { Controllers as controllers } from '../CoreController';
import { Services as VocabularyServiceModule } from '../services/VocabularyService';
import { Services as RvaImportServiceModule } from '../services/RvaImportService';

type VocabularyServiceApi = {
  list: VocabularyServiceModule.Vocabulary['list'];
  getById: VocabularyServiceModule.Vocabulary['getById'];
  create: VocabularyServiceModule.Vocabulary['create'];
  update: VocabularyServiceModule.Vocabulary['update'];
  delete: VocabularyServiceModule.Vocabulary['delete'];
  getTree: VocabularyServiceModule.Vocabulary['getTree'];
};

type RvaImportServiceApi = {
  importRvaVocabulary: RvaImportServiceModule.RvaImport['importRvaVocabulary'];
  syncRvaVocabulary: RvaImportServiceModule.RvaImport['syncRvaVocabulary'];
};

export namespace Controllers {
  export class Vocabulary extends controllers.Core.Controller {
    private get brandingService() {
      return sails.services['brandingservice'] as Sails.DynamicService & {
        getBrandFromReq: (req: Sails.Req) => string;
        getBrand: (nameOrId: string) => { id?: string | number } | null;
      };
    }

    private resolveBrandingId(req: Sails.Req): string {
      const brandingNameOrId = this.brandingService.getBrandFromReq(req);
      const branding = this.brandingService.getBrand(brandingNameOrId);
      return String(branding?.id ?? brandingNameOrId);
    }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    protected override _exportedMethods: string[] = [
      'manager',
      'list',
      'get',
      'create',
      'update',
      'delete',
      'import',
      'sync'
    ];

    private get vocabularyService(): VocabularyServiceApi {
      return sails.services['vocabularyservice'] as Sails.DynamicService & VocabularyServiceApi;
    }

    private get rvaImportService(): RvaImportServiceApi {
      return sails.services['rvaimportservice'] as Sails.DynamicService & RvaImportServiceApi;
    }

    public async manager(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'admin/vocabulary');
    }

    public async list(req: Sails.Req, res: Sails.Res) {
      try {
        const response = await this.vocabularyService.list({
          q: req.param('q'),
          type: req.param('type'),
          source: req.param('source'),
          limit: Number(req.param('limit') || 25),
          offset: Number(req.param('offset') || 0),
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
        const vocabulary = await this.vocabularyService.getById(id);
        if (!vocabulary) {
          return this.sendResp(req, res, { status: 404, displayErrors: [{ title: 'Vocabulary not found' }], headers: this.getNoCacheHeaders() });
        }
        const entries = await this.vocabularyService.getTree(id);
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
        const created = await this.vocabularyService.create(payload);
        return this.sendResp(req, res, { status: 201, data: created, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 400, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async update(req: Sails.Req, res: Sails.Res) {
      try {
        const id = String(req.param('id') || '');
        const updated = await this.vocabularyService.update(id, req.body as Partial<VocabularyServiceModule.VocabularyInput>);
        return this.sendResp(req, res, { data: updated, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 400, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async delete(req: Sails.Req, res: Sails.Res) {
      try {
        const id = String(req.param('id') || '');
        await this.vocabularyService.delete(id);
        return this.sendResp(req, res, { status: 204, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 400, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async import(req: Sails.Req, res: Sails.Res) {
      try {
        const rvaId = String(req.body?.rvaId || '');
        const versionId = req.body?.versionId ? String(req.body.versionId) : undefined;
        const created = await this.rvaImportService.importRvaVocabulary(rvaId, versionId, this.resolveBrandingId(req));
        return this.sendResp(req, res, { data: created, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 400, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }

    public async sync(req: Sails.Req, res: Sails.Res) {
      try {
        const id = String(req.param('id') || '');
        const versionId = req.body?.versionId ? String(req.body.versionId) : undefined;
        const result = await this.rvaImportService.syncRvaVocabulary(id, versionId);
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 400, errors: [this.asError(error)], headers: this.getNoCacheHeaders() });
      }
    }
  }
}
