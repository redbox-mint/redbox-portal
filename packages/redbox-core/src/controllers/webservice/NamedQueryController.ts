import { namedQueryExplorerSources } from '../../services/named-query/explorer-links';
import { savedGridId, savedGridListOptions } from '../../services/SavedGridService';
import { savedGridContext } from '../SavedGridController';
import { SavedGridError } from '../../services/SavedGridService';
import { NamedQueryUpdateConfirmationError, NamedQueryUpdateConflictError } from '../../services/named-query/update-review';
import { NamedQueryInUseError } from '../../services/named-query/usage';
import type {
  NamedQueryDraftRequest,
  NamedQueryPreviewRequest,
  NamedQueryGuidance,
  EditorDiagnostic,
} from '@researchdatabox/sails-ng-common';
import type { FormRecordAccessContext } from '../../services/FormsService';
import {
  boundedJsonBytes,
  NAMED_QUERY_PREVIEW_LIMITS,
  NamedQueryAssistanceError,
} from '../../utilities/NamedQueryPreview';
import { FieldDescriptionError } from '../../services/FieldDescriptionsService';
import { Controllers as controllers } from '../../CoreController';
import { NamedQueryDefinitionError } from '../../services/named-query/definition';
import { GraphqlNamedQueryExecutionError } from '../../services/named-query/graphql-execution';
import { GraphqlNamedQueryInputError } from '../../services/named-query/graphql-input';
import { GraphqlNamedQueryValidationError, graphqlDiagnostic } from '../../services/named-query/graphql-validation';
import type { ReadCaller } from '../../record-graphql/read-record';
import { BrandingModel } from '../../model/storage/BrandingModel';

export namespace Controllers {
  export class NamedQuery extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = [
      'preparePromotion',
      'savedExplorations',
      'prepareSavedExploration',
      'listQueries',
      'getCollections',
      'getQuery',
      'createQuery',
      'updateQuery',
      'deleteQuery',
      'schemaTargets',
      'graphqlSchema',
      'reviewUpdate',
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
          error instanceof NamedQueryAssistanceError ||
          error instanceof GraphqlNamedQueryExecutionError ||
          error instanceof FieldDescriptionError ||
          error instanceof GraphqlNamedQueryInputError ||
          error instanceof GraphqlNamedQueryValidationError
            ? error.code
            : 'ASSISTANCE_UNAVAILABLE';
        const status =
          error instanceof NamedQueryAssistanceError || error instanceof GraphqlNamedQueryExecutionError
            ? error.status
            : error instanceof GraphqlNamedQueryValidationError
              ? 422
              : error instanceof GraphqlNamedQueryInputError
                ? 400
                : error instanceof FieldDescriptionError
                  ? error.code === 'FORBIDDEN'
                    ? 403
                    : 400
                  : 500;
        const diagnostics =
          error instanceof GraphqlNamedQueryValidationError
            ? error.diagnostics
            : error instanceof GraphqlNamedQueryInputError
              ? [graphqlDiagnostic(error.code, error.field, 'Provide a value that satisfies the declared input type.')]
              : undefined;
        return this.sendResp(req, res, {
          status,
          displayErrors: [
            {
              code,
              status: String(status),
              ...(diagnostics ? { detail: this.graphqlDiagnosticDetail(diagnostics) } : {}),
            },
          ],
          ...(diagnostics ? { meta: { diagnostics } } : {}),
          headers: { ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' },
        });
      }
    }

    private async promotionResponse(req: Sails.Req, res: Sails.Res, action: (caller: ReadCaller) => Promise<unknown>) {
      try {
        const { caller } = savedGridContext(req);
        const data = await action(caller);
        return this.sendResp(req, res, { data, headers: { ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' } });
      } catch (error) {
        const status = error instanceof SavedGridError || error instanceof NamedQueryAssistanceError ? error.status : 500;
        const code = error instanceof SavedGridError || error instanceof NamedQueryAssistanceError ? error.code : 'PROMOTION_UNAVAILABLE';
        if (status === 500) {
          // Never log the exception, its message, request body, document or values.
          const errorClass = error instanceof TypeError ? 'TypeError' : error instanceof RangeError ? 'RangeError' :
            error instanceof SyntaxError ? 'SyntaxError' : error instanceof Error ? 'Error' : 'UnknownError';
          sails.log.error('Named-query promotion preparation failed', { code: 'PROMOTION_UNAVAILABLE', errorClass });
        }
        return this.sendResp(req, res, { status, displayErrors: [{ code, title: code, status: String(status) }], headers: { ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' } });
      }
    }

    public preparePromotion(req: Sails.Req, res: Sails.Res) {
      return this.promotionResponse(req, res, caller => NamedQueryEditorService.preparePromotion(
        (req.body as { exploration?: unknown })?.exploration, caller));
    }
    public prepareSavedExploration(req: Sails.Req, res: Sails.Res) {
      return this.promotionResponse(req, res, caller => NamedQueryEditorService.prepareSavedExploration(req.body, caller));
    }
    public savedExplorations(req: Sails.Req, res: Sails.Res) {
      return this.promotionResponse(req, res, caller => {
        const options = savedGridListOptions.safeParse({ q: req.query.q, mode: req.query.mode });
        const after = req.query.after;
        if (!options.success || (after !== undefined && !savedGridId.safeParse(after).success))
          throw new SavedGridError(400, 'invalid-definition');
        return NamedQueryEditorService.savedExplorations(caller, typeof after === 'string' ? after : undefined, options.data);
      });
    }

    public graphqlSchema(req: Sails.Req, res: Sails.Res) {
      return this.assistance(req, res, (brand, portal, caller) => NamedQueryEditorService.graphqlSchema(brand, portal, caller));
    }
    public async reviewUpdate(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const name = String(req.param('name'));
        return this.sendResp(req, res, { data: await NamedQueryService.reviewUpdate(brand, name,
          (req.body as NamedQueryDraftRequest).definition, this.validationCaller(req, brand)),
          headers: { ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' } });
      } catch (error) { return this.sendError(req, res, error); }
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
      if (error instanceof SavedGridError) return error.status;
      if (error instanceof NamedQueryInUseError) return 409;
      if (error instanceof NamedQueryDefinitionError || error instanceof GraphqlNamedQueryValidationError) return 400;
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

    private validationCaller(req: Sails.Req, brand: BrandingModel): ReadCaller | undefined {
      if (!req.isAuthenticated?.() || !req.user?.username) return undefined;
      return {
        brand,
        portal: String(req.param('portal') ?? ''),
        user: req.user,
        roles: Array.isArray(req.user.roles)
          ? req.user.roles.filter((role): role is object => role !== null && typeof role === 'object')
          : [],
      };
    }

    private graphqlDiagnosticDetail(diagnostics: readonly EditorDiagnostic[]): string {
      const diagnostic = diagnostics[0];
      // These diagnostics contain curated correction text, never GraphQL's raw
      // input errors. Keep one bounded description for the v1 error envelope.
      return diagnostic
        ? `${diagnostic.field.slice(0, 256)}: ${diagnostic.reason.slice(0, 512)}`
        : 'Repair the GraphQL named query definition using current schema assistance.';
    }

    private sendError(req: Sails.Req, res: Sails.Res, error: unknown) {
      if (error instanceof SavedGridError) return this.sendResp(req, res, {
        status: error.status, displayErrors: [{ code: error.code, title: error.code, status: String(error.status) }], headers: this.getNoCacheHeaders(),
      });
      if (error instanceof NamedQueryUpdateConfirmationError || error instanceof NamedQueryUpdateConflictError) {
        return this.sendResp(req, res, { status: 409,
          ...(error instanceof NamedQueryUpdateConfirmationError ? { meta: { review: error.review } } : {}),
          displayErrors: [{ code: error.code, detail: error.message, status: '409' }], headers: this.getNoCacheHeaders() });
      }
      if (error instanceof GraphqlNamedQueryValidationError) {
        return this.sendResp(req, res, {
          status: 400,
          meta: { diagnostics: error.diagnostics },
          displayErrors: [{ code: error.code, detail: this.graphqlDiagnosticDetail(error.diagnostics), status: '400' }],
          headers: this.getNoCacheHeaders(),
        });
      }
      if (error instanceof NamedQueryInUseError) {
        return this.sendResp(req, res, { status: 409, meta: { usedBy: error.consumers },
          displayErrors: [{ detail: error.message, status: '409' }], headers: this.getNoCacheHeaders() });
      }
      const status = this.statusForError(error);
      const detail = error instanceof NamedQueryDefinitionError
        ? error.message
        : status === 404 ? 'Named query not found'
          : status === 409 ? 'Named query already exists' : undefined;
      return this.sendResp(req, res, { status,
        ...(detail
          ? { displayErrors: [{ detail, status: String(status) }] }
          : { errors: [this.asError(error)], ...(status < 500
            ? { displayErrors: [{ detail: 'Invalid named query request', status: String(status) }] } : {}) }),
        headers: this.getNoCacheHeaders() });
    }

    private resolveBrand(req: Sails.Req): BrandingModel {
      return BrandingService.getBrand(req.session.branding as string);
    }

    public async listQueries(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        const queries = await namedQueryExplorerSources({ brandId: String(brand.id), portal: String(req.param?.('portal') ?? '') }, await NamedQueryService.list(brand));
        const usage = await NamedQueryService.getUsage(brand);
        return this.sendResp(req, res, { data: queries.map(query => ({ ...query, usedBy: usage[query.name ?? ''] ?? [] })), headers: this.getNoCacheHeaders() });
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
        const usage = await NamedQueryService.getUsage(brand);
        return this.sendResp(req, res, { data: { ...(await namedQueryExplorerSources({ brandId: String(brand.id), portal: String(req.param?.('portal') ?? '') }, [query]))[0], usedBy: usage[name] ?? [] }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendError(req, res, error);
      }
    }

    public async createQuery(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.resolveBrand(req);
        if (!req.isAuthenticated?.() || !NamedQueryEditorService.canCreate(brand, String(req.param('portal') ?? ''), req.user)) {
          return this.sendResp(req, res, { status: 403, displayErrors: [{ code: 'NAMED_QUERY_CREATE_FORBIDDEN', status: '403' }], headers: this.getNoCacheHeaders() });
        }
        const body = (req.body as Record<string, unknown>) || {};
        const name = body['name'] as string;
        if (typeof name !== 'string' || !name || name.length > 120 || !/^[A-Za-z0-9_-]+$/.test(name)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'name is required, must be URL safe and at most 120 characters', status: '400' }],
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
        await NamedQueryService.create(brand, name, body, this.validationCaller(req, brand));
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
        await NamedQueryService.update(brand, name, body, this.validationCaller(req, brand), req.get?.('X-ReDBox-Named-Query-Confirmation') || undefined);
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
