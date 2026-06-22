import { Controllers as controllers } from '../../CoreController';
import { ListAPIResponse, ListAPISummary } from '../../model';
import { Services as VocabularyServiceModule } from '../../services/VocabularyService';
import { getValidatedApiRequest } from '../../api-routes/validation';
import {
  listVocabularyRoute,
  importVocabularyRoute,
  getVocabularyRoute,
  createVocabularyRoute,
  updateVocabularyRoute,
  reorderVocabularyRoute,
  deleteVocabularyRoute,
  syncVocabularyRoute,
} from '../../api-routes/groups/vocabulary';

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

    private statusForError(error: unknown): number {
      const message = this.asError(error).message;
      if (/not found/i.test(message)) {
        return 404;
      }
      if (/status code 400/i.test(message)) {
        return 409;
      }
      if (/status code 404/i.test(message)) {
        return 404;
      }
      if (/status code 429/i.test(message)) {
        return 409;
      }
      // State conflicts: the resource exists but the requested operation is incompatible
      // with its current state (e.g. syncing a vocabulary that was not RVA-imported).
      if (/cannot parent itself/i.test(message)) {
        return 409;
      }
      if (/duplicate|already exists|not an rva|not .*imported|conflict/i.test(message)) {
        return 409;
      }
      if (/invalid|required|must|belongs to|cannot|not supported|unsupported|does not support|not allowed|no current concept tree/i.test(message)) {
        return 400;
      }
      // External service timeouts (e.g. RVA Registry unreachable)
      if (/timeout/i.test(message)) {
        return 503;
      }
      return 500;
    }

    private sendError(req: Sails.Req, res: Sails.Res, error: unknown) {
      const err = this.asError(error);
      const status = this.statusForError(err);
      return this.sendResp(req, res, {
        status,
        errors: [err],
        displayErrors: [{ status: String(status), detail: err.message }],
        headers: this.getNoCacheHeaders(),
      });
    }

    protected override _exportedMethods: string[] = [
      'list',
      'get',
      'create',
      'update',
      'reorder',
      'delete',
      'import',
      'sync',
    ];

    public async list(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { query } = validated;
        const limit = this.parseNumberParam(query.limit, 25);
        const offset = this.parseNumberParam(query.offset, 0);
        const result = await VocabularyService.list({
          q: query.q as string | undefined,
          type: query.type as string | undefined,
          source: query.source as string | undefined,
          limit,
          offset,
          sort: query.sort as string | undefined,
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
          headers: this.getNoCacheHeaders(),
        });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async get(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params } = validated;
        const id = String(params.id || '');
        const vocabulary = await VocabularyService.getById(id);
        if (!vocabulary) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ title: 'Vocabulary not found' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const entries = await VocabularyService.getTree(id);
        return this.sendResp(req, res, { data: { vocabulary, entries }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async create(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { body } = validated;
        const bodyObj = body as Record<string, unknown>;
        if (!String(bodyObj.slug ?? '').trim()) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ title: 'body.slug', detail: 'Required' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        if (bodyObj.type === 'flat' && Array.isArray(bodyObj.entries)) {
          bodyObj.entries = (bodyObj.entries as Record<string, unknown>[]).map(entry => {
            const { parent, ...rest } = entry;
            return rest;
          });
        }
        const payload = {
          ...bodyObj,
          branding: BrandingService.getBrand(BrandingService.getBrandNameFromReq(req)).id,
        } as VocabularyServiceModule.VocabularyInput;
        const created = await VocabularyService.create(payload);
        return this.sendResp(req, res, { status: 201, data: created, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async update(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params, body } = validated;
        const id = String(params.id || '');
        const updated = await VocabularyService.update(id, body as Partial<VocabularyServiceModule.VocabularyInput>);
        return this.sendResp(req, res, { data: updated, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async reorder(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params, body } = validated;
        const id = String(params.id || '').trim();
        const bodyObj = body as Record<string, unknown>;
        const entryOrders = Array.isArray(bodyObj?.entryOrders)
          ? bodyObj.entryOrders
          : Array.isArray(bodyObj?.entries)
            ? bodyObj.entries
            : null;
        if (!id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Missing required id', status: '400' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        if (!entryOrders) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'entries must be an array', status: '400' }],
            headers: this.getNoCacheHeaders(),
          });
        }

        const normalized: Array<{ id: string; order: number }> = [];
        for (const item of entryOrders) {
          const itemRecord = item as { id?: unknown; order?: unknown };
          const entryId = String(itemRecord?.id ?? '').trim();
          const order = Number.parseInt(String(itemRecord?.order ?? ''), 10);
          if (!entryId || !Number.isInteger(order) || order < 0) {
            return this.sendResp(req, res, {
              status: 400,
              displayErrors: [{ detail: 'entries must contain { id, order } with non-negative integer order', status: '400' }],
              headers: this.getNoCacheHeaders(),
            });
          }
          normalized.push({ id: entryId, order });
        }

        const updated = await VocabularyService.reorderEntries(id, normalized);
        return this.sendResp(req, res, { data: { updated }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async delete(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params } = validated;
        const id = String(params.id || '');
        await VocabularyService.delete(id);
        return this.sendResp(req, res, { status: 204, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async import(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { body } = validated;
        const bodyObj = body as Record<string, unknown>;
        const rvaId = String(bodyObj?.rvaId || '');
        if (!rvaId.trim()) {
          return this.sendResp(req, res, {
            status: 400,
            errors: [new Error('rvaId is required')],
            headers: this.getNoCacheHeaders(),
          });
        }
        const versionId = bodyObj?.versionId ? String(bodyObj.versionId) : undefined;
        const created = await RvaImportService.importRvaVocabulary(
          rvaId,
          versionId,
          BrandingService.getBrandFromReq(req).id
        );
        return this.sendResp(req, res, { data: created, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async sync(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params, body } = validated;
        const id = String(params.id || '');
        const bodyObj = body as Record<string, unknown>;
        const versionId = bodyObj?.versionId ? String(bodyObj.versionId) : undefined;
        const result = await RvaImportService.syncRvaVocabulary(id, versionId);
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }
  }
}
