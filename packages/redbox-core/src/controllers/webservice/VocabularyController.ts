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
import { requireRequestResourceAuthorization } from '../../api-routes';
import { sendAuthorizationResourceError } from '../../policies/authorization-response';

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
      'sync',
    ];

    public async list(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { query } = validated;
        const limit = this.parseNumberParam(query.limit, 25);
        const offset = this.parseNumberParam(query.offset, 0);
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        const result = await VocabularyService.listAuthorized(context, requiredScope, {
          q: query.q as string | undefined,
          type: query.type as string | undefined,
          source: query.source as string | undefined,
          limit,
          offset,
          sort: query.sort as string | undefined,
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
        if (sendAuthorizationResourceError(req, res, error)) return;
        return this.sendResp(req, res, {
          status: 500,
          errors: [this.asError(error)],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async get(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params } = validated;
        const id = String(params.id || '');
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        const { vocabulary, entries } = await VocabularyService.getAuthorizedTree(context, requiredScope, id);
        return this.sendResp(req, res, { data: { vocabulary, entries }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        return this.sendResp(req, res, {
          status: 500,
          errors: [this.asError(error)],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async create(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { body } = validated;
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        const payload = body as VocabularyServiceModule.VocabularyInput;
        const created = await VocabularyService.createAuthorized(context, requiredScope, payload);
        return this.sendResp(req, res, { status: 201, data: created, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        const detail = this.asError(error).message;
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail }], headers: this.getNoCacheHeaders() });
      }
    }

    public async update(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params, body } = validated;
        const id = String(params.id || '');
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        const updated = await VocabularyService.updateAuthorized(
          context,
          requiredScope,
          id,
          body as Partial<VocabularyServiceModule.VocabularyInput>
        );
        return this.sendResp(req, res, { data: updated, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        const detail = this.asError(error).message;
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail }], headers: this.getNoCacheHeaders() });
      }
    }

    public async reorder(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params, body } = validated;
        const id = String(params.id || '').trim();
        const bodyObj = body as Record<string, unknown>;
        const entryOrders = Array.isArray(bodyObj?.entryOrders) ? bodyObj.entryOrders : null;
        if (!id) {
          return this.sendResp(req, res, {
            status: 400,
            errors: [new Error('Missing required id')],
            headers: this.getNoCacheHeaders(),
          });
        }
        if (!entryOrders) {
          return this.sendResp(req, res, {
            status: 400,
            errors: [new Error('entryOrders must be an array')],
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
              errors: [new Error('entryOrders must contain { id, order } with non-negative integer order')],
              headers: this.getNoCacheHeaders(),
            });
          }
          normalized.push({ id: entryId, order });
        }

        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        const updated = await VocabularyService.reorderEntriesAuthorized(context, requiredScope, id, normalized);
        return this.sendResp(req, res, { data: { updated }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        const detail = this.asError(error).message;
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail }], headers: this.getNoCacheHeaders() });
      }
    }

    public async delete(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params } = validated;
        const id = String(params.id || '');
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        await VocabularyService.deleteAuthorized(context, requiredScope, id);
        return this.sendResp(req, res, { status: 204, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        const detail = this.asError(error).message;
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail }], headers: this.getNoCacheHeaders() });
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
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        const brandId = VocabularyService.requireAuthorizedBrandOperation(context, requiredScope);
        const created = await RvaImportService.importRvaVocabulary(rvaId, versionId, brandId);
        return this.sendResp(req, res, { data: created, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        const detail = this.asError(error).message;
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail }], headers: this.getNoCacheHeaders() });
      }
    }

    public async sync(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params, body } = validated;
        const id = String(params.id || '');
        const bodyObj = body as Record<string, unknown>;
        const versionId = bodyObj?.versionId ? String(bodyObj.versionId) : undefined;
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        const vocabulary = await VocabularyService.getAuthorizedByIdOrSlug(context, requiredScope, id);
        const result = await RvaImportService.syncRvaVocabulary(String(vocabulary.id), versionId, context.brand?.id);
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        const detail = this.asError(error).message;
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail }], headers: this.getNoCacheHeaders() });
      }
    }
  }
}
