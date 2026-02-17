import { Controllers as controllers } from '../../CoreController';
import { ListAPIResponse, ListAPISummary } from '../../model';
import { Services as VocabularyServiceModule } from '../../services/VocabularyService';

export namespace Controllers {
  export class Vocabulary extends controllers.Core.Controller {
    private asRecord(value: unknown): Record<string, unknown> | undefined {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
      return undefined;
    }

    private parseNumberParam(value: unknown, fallback: number): number {
      if (value === '' || typeof value === 'undefined' || value === null) {
        return fallback;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    protected override _exportedMethods: string[] = [
      'list',
      'get',
      'create',
      'update',
      'reorder',
      'delete',
      'import',
      'sync'
    ];

    public async list(req: Sails.Req, res: Sails.Res) {
      try {
        const limit = this.parseNumberParam(req.param('limit'), 25);
        const offset = this.parseNumberParam(req.param('offset'), 0);
        const result = await VocabularyService.list({
          q: req.param('q'),
          type: req.param('type'),
          source: req.param('source'),
          limit,
          offset,
          sort: req.param('sort'),
          branding: BrandingService.getBrand(BrandingService.getBrandNameFromReq(req)).id,
        });
        const response = new ListAPIResponse<unknown>();
        const summary = new ListAPISummary();
        summary.numFound = result.meta.total;
        summary.start = result.meta.offset;
        summary.page = result.meta.limit > 0 ? Math.floor(result.meta.offset / result.meta.limit) + 1 : 1;
        response.summary = summary;
        response.records = result.data;
        return this.sendResp(req, res, {
          data: response,
          headers: this.getNoCacheHeaders()
        });
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
          branding: BrandingService.getBrand(BrandingService.getBrandNameFromReq(req)).id
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

    public async reorder(req: Sails.Req, res: Sails.Res) {
      try {
        const id = String(req.param('id') || '').trim();
        const entryOrders = Array.isArray(req.body?.entryOrders) ? req.body.entryOrders : null;
        if (!id) {
          return this.sendResp(req, res, { status: 400, errors: [new Error('Missing required id')], headers: this.getNoCacheHeaders() });
        }
        if (!entryOrders) {
          return this.sendResp(req, res, { status: 400, errors: [new Error('entryOrders must be an array')], headers: this.getNoCacheHeaders() });
        }

        const normalized: Array<{ id: string; order: number }> = [];
        for (const item of entryOrders) {
          const itemRecord = item as { id?: unknown; order?: unknown };
          const entryId = String(itemRecord?.id ?? '').trim();
          const order = Number.parseInt(String(itemRecord?.order ?? ''), 10);
          if (!entryId || !Number.isInteger(order) || order < 0) {
            return this.sendResp(req, res, { status: 400, errors: [new Error('entryOrders must contain { id, order } with non-negative integer order')], headers: this.getNoCacheHeaders() });
          }
          normalized.push({ id: entryId, order });
        }

        const updated = await VocabularyService.reorderEntries(id, normalized);
        return this.sendResp(req, res, { data: { updated }, headers: this.getNoCacheHeaders() });
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
        const created = await RvaImportService.importRvaVocabulary(rvaId, versionId, BrandingService.getBrandFromReq(req).id);
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
