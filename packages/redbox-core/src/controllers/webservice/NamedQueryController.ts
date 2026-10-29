import type {
  NamedQueryDraftRequest,
  NamedQueryPreviewRequest,
  NamedQueryGuidance,
} from '@researchdatabox/sails-ng-common';
import type { FormRecordAccessContext } from '../../services/FormsService';
import {
  boundedJsonBytes,
  NAMED_QUERY_PREVIEW_LIMITS,
  NamedQueryAssistanceError,
} from '../../utilities/NamedQueryPreview';
import { FieldDescriptionError } from '../../services/FieldDescriptionsService';
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
      'deleteQuery',
      'schemaTargets',
      'describeFields',
      'validateDraft',
      'describeDraft',
      'describeSaved',
      'previewDraft',
    ];

    private async assistance(
      req: Sails.Req,
      res: Sails.Res,
      action: (brand: BrandingModel, portal: string, caller: FormRecordAccessContext) => Promise<unknown>
    ) {
      try {
        const brand = this.resolveBrand(req);
        const caller = { brand, user: req.user } as unknown as FormRecordAccessContext;
        const data = await action(brand, String(req.param('portal') ?? ''), caller);
        if (
          boundedJsonBytes({ data }, NAMED_QUERY_PREVIEW_LIMITS.responseBytes) >
          NAMED_QUERY_PREVIEW_LIMITS.responseBytes
        )
          throw new NamedQueryAssistanceError('RESPONSE_LIMIT', 413);
        const serialized = JSON.stringify({ data });
        // Validation is a completed operation even when diagnostics block execution.
        // Keep the DTO available on both API versions (4xx envelopes discard supplied data).
        return this.sendResp(req, res, {
          status: 200,
          data: (JSON.parse(serialized) as { data: unknown }).data,
          headers: { ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' },
        });
      } catch (error) {
        const code =
          error instanceof NamedQueryAssistanceError || error instanceof FieldDescriptionError
            ? error.code
            : 'ASSISTANCE_UNAVAILABLE';
        const status =
          error instanceof NamedQueryAssistanceError
            ? error.status
            : error instanceof FieldDescriptionError
              ? error.code === 'FORBIDDEN'
                ? 403
                : 400
              : 500;
        return this.sendResp(req, res, {
          status,
          displayErrors: [{ code, status: String(status) }],
          headers: { ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' },
        });
      }
    }

    public schemaTargets(req: Sails.Req, res: Sails.Res) {
      return this.assistance(req, res, (brand, _portal, caller) =>
        NamedQueryEditorService.schemaTargets(brand, caller)
      );
    }
    public describeFields(req: Sails.Req, res: Sails.Res) {
      return this.assistance(req, res, (brand, portal, caller) =>
        NamedQueryEditorService.describeFields(brand, portal, caller, {
          collectionName: req.query['collectionName'],
          recordType: req.query['recordType'],
          stage: req.query['stage'],
        } as unknown as NamedQueryGuidance)
      );
    }
    public validateDraft(req: Sails.Req, res: Sails.Res) {
      return this.assistance(req, res, (brand, portal, caller) =>
        NamedQueryEditorService.validateDraft(brand, portal, caller, req.body as NamedQueryDraftRequest)
      );
    }
    public describeDraft(req: Sails.Req, res: Sails.Res) {
      return this.assistance(req, res, (brand, portal, caller) =>
        NamedQueryEditorService.describeDraft(brand, portal, caller, req.body as NamedQueryDraftRequest)
      );
    }
    public describeSaved(req: Sails.Req, res: Sails.Res) {
      return this.assistance(req, res, (brand, portal, caller) =>
        NamedQueryEditorService.describeSaved(
          brand,
          portal,
          caller,
          String(req.param('name')),
          req.query['recordType']
            ? ({
                recordType: req.query['recordType'],
                stage: req.query['stage'],
              } as unknown as NamedQueryDraftRequest['guidance'])
            : undefined
        )
      );
    }
    public previewDraft(req: Sails.Req, res: Sails.Res) {
      return this.assistance(req, res, (brand, portal, caller) =>
        NamedQueryEditorService.previewDraft(brand, portal, caller, req.body as NamedQueryPreviewRequest)
      );
    }

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
      return this.sendResp(req, res, {
        status: this.statusForError(error),
        errors: [this.asError(error)],
        headers: this.getNoCacheHeaders(),
      });
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
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'name is required', status: '400' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const query = await NamedQueryService.getNamedQueryConfig(brand, name);
        if (!query) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: `Named query '${name}' not found`, status: '404' }],
            headers: this.getNoCacheHeaders(),
          });
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
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'name is required and must be URL safe', status: '400' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        if (name === 'collections') {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: "'collections' is a reserved name and cannot be used", status: '400' }],
            headers: this.getNoCacheHeaders(),
          });
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
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'name is required', status: '400' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const body = (req.body as Record<string, unknown>) || {};
        if (body['name'] && body['name'] !== name) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Named query name cannot be changed', status: '400' }],
            headers: this.getNoCacheHeaders(),
          });
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
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'name is required', status: '400' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        await NamedQueryService.delete(brand, name);
        return this.sendResp(req, res, { data: { name }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }
  }
}
