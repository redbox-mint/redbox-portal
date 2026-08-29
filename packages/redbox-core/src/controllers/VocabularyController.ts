import { Controllers as controllers } from '../CoreController';
import { ListAPIResponse, ListAPISummary } from '../model';
import { Services as VocabularyServiceModule } from '../services/VocabularyService';
import { requireRequestResourceAuthorization } from '../api-routes';
import { sendAuthorizationResourceError } from '../policies/authorization-response';

const VALID_VOCAB_TYPES = new Set(['flat', 'tree']);
const VALID_VOCAB_SOURCES = new Set(['local', 'rva', 'external']);

export namespace Controllers {
  export class Vocabulary extends controllers.Core.Controller {
    private get brandingService() {
      return sails.services['brandingservice'] as Sails.DynamicService & {
        getBrandNameFromReq: (req: Sails.Req) => string;
        getBrand: (nameOrId: string) => { id?: string | number } | null;
        getBrandFromReq: (req: Sails.Req) => { id?: string | number };
      };
    }

    private resolveBrandingId(req: Sails.Req): string {
      return String(this.brandingService.getBrandFromReq(req).id ?? '');
    }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private parseNonNegativeIntegerParam(value: unknown, fallback: number, max?: number): number {
      const parsed = Number.parseInt(String(value ?? ''), 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return fallback;
      }
      if (typeof max === 'number') {
        return Math.min(parsed, max);
      }
      return parsed;
    }

    private asRecord(value: unknown): Record<string, unknown> {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
      return {};
    }

    private sanitizeEntry(
      raw: unknown,
      errors: string[],
      path: string
    ): VocabularyServiceModule.VocabularyEntryInput | null {
      const entry = this.asRecord(raw);
      if (Object.keys(entry).length === 0 && raw !== null && typeof raw !== 'object') {
        errors.push(`${path} must be an object`);
        return null;
      }

      const sanitized: Partial<VocabularyServiceModule.VocabularyEntryInput> = {};

      if (typeof entry.id !== 'undefined') {
        sanitized.id = String(entry.id).trim();
      }
      if (typeof entry.parent !== 'undefined' && entry.parent !== null) {
        sanitized.parent = String(entry.parent).trim();
      }
      if (typeof entry.label !== 'undefined') {
        sanitized.label = String(entry.label).trim();
      }
      if (typeof entry.value !== 'undefined') {
        sanitized.value = String(entry.value).trim();
      }
      if (typeof entry.identifier !== 'undefined') {
        sanitized.identifier = String(entry.identifier).trim();
      }
      if (typeof entry.order !== 'undefined') {
        const order = Number.parseInt(String(entry.order), 10);
        if (!Number.isInteger(order) || order < 0) {
          errors.push(`${path}.order must be a non-negative integer`);
        } else {
          sanitized.order = order;
        }
      }
      if (typeof entry.historical !== 'undefined') {
        if (typeof entry.historical !== 'boolean') {
          errors.push(`${path}.historical must be a boolean`);
        } else {
          sanitized.historical = entry.historical;
        }
      }
      if (typeof entry.children !== 'undefined') {
        if (!Array.isArray(entry.children)) {
          errors.push(`${path}.children must be an array`);
        } else {
          sanitized.children = entry.children
            .map((child, index) => this.sanitizeEntry(child, errors, `${path}.children[${index}]`))
            .filter((child): child is VocabularyServiceModule.VocabularyEntryInput => child !== null);
        }
      }

      return sanitized as VocabularyServiceModule.VocabularyEntryInput;
    }

    private sanitizeCreatePayload(req: Sails.Req): {
      payload?: VocabularyServiceModule.VocabularyInput;
      errors: Error[];
    } {
      const errors: string[] = [];
      const body = this.asRecord(req.body);
      const payload: Partial<VocabularyServiceModule.VocabularyInput> = {
        branding: this.resolveBrandingId(req),
      };

      const name = String(body.name ?? '').trim();
      if (!name) {
        errors.push('Missing required name');
      } else {
        payload.name = name;
      }

      if (typeof body.slug !== 'undefined') {
        payload.slug = String(body.slug).trim();
      }
      if (typeof body.description !== 'undefined') {
        payload.description = String(body.description).trim();
      }
      if (typeof body.type !== 'undefined') {
        const type = String(body.type).trim().toLowerCase();
        if (!VALID_VOCAB_TYPES.has(type)) {
          errors.push('type must be one of: flat, tree');
        } else {
          payload.type = type as VocabularyServiceModule.VocabularyInput['type'];
        }
      }
      if (typeof body.source !== 'undefined') {
        const source = String(body.source).trim().toLowerCase();
        if (!VALID_VOCAB_SOURCES.has(source)) {
          errors.push('source must be one of: local, rva, external');
        } else {
          payload.source = source as VocabularyServiceModule.VocabularyInput['source'];
        }
      }
      if (typeof body.sourceId !== 'undefined') {
        payload.sourceId = String(body.sourceId).trim();
      }
      if (typeof body.sourceVersionId !== 'undefined') {
        payload.sourceVersionId = String(body.sourceVersionId).trim();
      }
      if (typeof body.lastSyncedAt !== 'undefined') {
        payload.lastSyncedAt = String(body.lastSyncedAt).trim();
      }
      if (typeof body.owner !== 'undefined') {
        payload.owner = String(body.owner).trim();
      }
      if (typeof body.entries !== 'undefined') {
        if (!Array.isArray(body.entries)) {
          errors.push('entries must be an array');
        } else {
          payload.entries = body.entries
            .map((entry, index) => this.sanitizeEntry(entry, errors, `entries[${index}]`))
            .filter((entry): entry is VocabularyServiceModule.VocabularyEntryInput => entry !== null);
        }
      }

      return {
        payload: errors.length === 0 ? (payload as VocabularyServiceModule.VocabularyInput) : undefined,
        errors: errors.map(error => this.asError(error)),
      };
    }

    private sanitizeUpdatePayload(req: Sails.Req): {
      payload?: Partial<VocabularyServiceModule.VocabularyInput>;
      errors: Error[];
    } {
      const errors: string[] = [];
      const body = this.asRecord(req.body);
      const payload: Partial<VocabularyServiceModule.VocabularyInput> = {};

      if (typeof body.name !== 'undefined') {
        const name = String(body.name).trim();
        if (!name) {
          errors.push('name must not be empty');
        } else {
          payload.name = name;
        }
      }
      if (typeof body.slug !== 'undefined') {
        payload.slug = String(body.slug).trim();
      }
      if (typeof body.description !== 'undefined') {
        payload.description = String(body.description).trim();
      }
      if (typeof body.type !== 'undefined') {
        const type = String(body.type).trim().toLowerCase();
        if (!VALID_VOCAB_TYPES.has(type)) {
          errors.push('type must be one of: flat, tree');
        } else {
          payload.type = type as VocabularyServiceModule.VocabularyInput['type'];
        }
      }
      if (typeof body.source !== 'undefined') {
        const source = String(body.source).trim().toLowerCase();
        if (!VALID_VOCAB_SOURCES.has(source)) {
          errors.push('source must be one of: local, rva, external');
        } else {
          payload.source = source as VocabularyServiceModule.VocabularyInput['source'];
        }
      }
      if (typeof body.sourceId !== 'undefined') {
        payload.sourceId = String(body.sourceId).trim();
      }
      if (typeof body.sourceVersionId !== 'undefined') {
        payload.sourceVersionId = String(body.sourceVersionId).trim();
      }
      if (typeof body.lastSyncedAt !== 'undefined') {
        payload.lastSyncedAt = String(body.lastSyncedAt).trim();
      }
      if (typeof body.owner !== 'undefined') {
        payload.owner = String(body.owner).trim();
      }
      // Branding is intentionally ignored on update; the immutable request
      // context owns the tenant boundary.
      if (typeof body.entries !== 'undefined') {
        if (!Array.isArray(body.entries)) {
          errors.push('entries must be an array');
        } else {
          payload.entries = body.entries
            .map((entry, index) => this.sanitizeEntry(entry, errors, `entries[${index}]`))
            .filter((entry): entry is VocabularyServiceModule.VocabularyEntryInput => entry !== null);
        }
      }

      return { payload: errors.length === 0 ? payload : undefined, errors: errors.map(error => this.asError(error)) };
    }

    protected override _exportedMethods: string[] = [
      'manager',
      'list',
      'get',
      'create',
      'update',
      'delete',
      'import',
      'sync',
    ];

    public async manager(req: Sails.Req, res: Sails.Res) {
      try {
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        VocabularyService.requireAuthorizedBrandOperation(context, requiredScope);
        return this.sendView(req, res, 'admin/vocabulary');
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        return this.sendResp(req, res, { status: 500, errors: [this.asError(error)] });
      }
    }

    public async list(req: Sails.Req, res: Sails.Res) {
      try {
        const limit = this.parseNonNegativeIntegerParam(req.param('limit'), 25, 200);
        const offset = this.parseNonNegativeIntegerParam(req.param('offset'), 0);
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        const result = await VocabularyService.listAuthorized(context, requiredScope, {
          q: req.param('q'),
          type: req.param('type'),
          source: req.param('source'),
          limit,
          offset,
          sort: req.param('sort'),
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
        const id = String(req.param('id') || '');
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
        const { payload, errors } = this.sanitizeCreatePayload(req);
        if (errors.length > 0 || !payload) {
          return this.sendResp(req, res, { status: 400, errors, headers: this.getNoCacheHeaders() });
        }
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        const created = await VocabularyService.createAuthorized(context, requiredScope, payload);
        return this.sendResp(req, res, { status: 201, data: created, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        return this.sendResp(req, res, {
          status: 500,
          errors: [this.asError(error)],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async update(req: Sails.Req, res: Sails.Res) {
      try {
        const id = String(req.param('id') || '');
        const { payload, errors } = this.sanitizeUpdatePayload(req);
        if (errors.length > 0 || !payload) {
          return this.sendResp(req, res, { status: 400, errors, headers: this.getNoCacheHeaders() });
        }
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        const updated = await VocabularyService.updateAuthorized(context, requiredScope, id, payload);
        return this.sendResp(req, res, { data: updated, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        return this.sendResp(req, res, {
          status: 500,
          errors: [this.asError(error)],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async delete(req: Sails.Req, res: Sails.Res) {
      try {
        const id = String(req.param('id') || '');
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        await VocabularyService.deleteAuthorized(context, requiredScope, id);
        return this.sendResp(req, res, { status: 204, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        return this.sendResp(req, res, {
          status: 500,
          errors: [this.asError(error)],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async import(req: Sails.Req, res: Sails.Res) {
      try {
        const rvaId = String(req.body?.rvaId || '');
        if (!rvaId.trim()) {
          return this.sendResp(req, res, {
            status: 400,
            errors: [new Error('rvaId is required')],
            headers: this.getNoCacheHeaders(),
          });
        }
        const versionId = req.body?.versionId ? String(req.body.versionId) : undefined;
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
        const id = String(req.param('id') || '');
        if (!id.trim()) {
          return this.sendResp(req, res, {
            status: 400,
            errors: [this.asError(new Error('Missing required id'))],
            headers: this.getNoCacheHeaders(),
          });
        }
        const versionId = req.body?.versionId ? String(req.body.versionId) : undefined;
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
