import { Controllers as controllers } from '../../CoreController';
import { ListAPIResponse, ListAPISummary } from '../../model';
import { getValidatedApiRequest } from '../../api-routes/validation';
import { Services as FigshareVocabularyServiceModule } from '../../services/FigshareVocabularyService';
import { toFigshareVocabularyErrorResponse } from './figshare-vocabulary-errors';
import type { FigshareCategoryScope } from '../../services/figshare-v2/types';

export namespace Controllers {
  export class FigshareVocabulary extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = [
      'listCatalogues',
      'listSources',
      'getSource',
      'listSourceCategories',
      'createSourcePreview',
      'cloneSource',
      'listSyncRuns',
      'createPreview',
      'getPreview',
      'applyPreview',
    ];

    private getActor(req: Sails.Req): FigshareVocabularyServiceModule.ActorContext {
      const brand = BrandingService.getBrandFromReq(req);
      const user = req.user as { id?: string | number; username?: string } | undefined;
      return {
        brandId: String(brand?.id ?? ''),
        userId: String(user?.username ?? user?.id ?? 'unknown'),
      };
    }

    private asRecord(value: unknown): Record<string, unknown> {
      return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    }

    private asListResponse(result: { data: unknown[]; meta: { total: number; limit: number; offset: number } }) {
      const response = new ListAPIResponse<unknown>();
      const summary = new ListAPISummary();
      summary.numFound = result.meta.total;
      summary.start = result.meta.offset;
      summary.page = result.meta.limit > 0 ? Math.floor(result.meta.offset / result.meta.limit) + 1 : 1;
      response.summary = summary;
      response.records = result.data;
      return response;
    }

    private fail(req: Sails.Req, res: Sails.Res, error: unknown) {
      const mapped = toFigshareVocabularyErrorResponse(error);
      return this.sendResp(req, res, {
        status: mapped.status,
        displayErrors: [{ title: mapped.title, detail: mapped.detail }],
        headers: this.getNoCacheHeaders(),
      });
    }

    public async listCatalogues(req: Sails.Req, res: Sails.Res) {
      try {
        const { query } = getValidatedApiRequest(req);
        const taxonomies = await FigshareVocabularyService.discoverTaxonomies(
          { scope: String(query.scope ?? '') as FigshareCategoryScope },
          this.getActor(req)
        );
        return this.sendResp(req, res, { data: taxonomies, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async listSources(req: Sails.Req, res: Sails.Res) {
      try {
        const { query } = getValidatedApiRequest(req);
        const result = await FigshareVocabularyService.listSources(
          {
            q: query.q as string | undefined,
            scope: query.scope as string | undefined,
            limit: query.limit as unknown as number | undefined,
            offset: query.offset as unknown as number | undefined,
          },
          this.getActor(req)
        );
        return this.sendResp(req, res, { data: this.asListResponse(result), headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async getSource(req: Sails.Req, res: Sails.Res) {
      try {
        const { params } = getValidatedApiRequest(req);
        const source = await FigshareVocabularyService.getSource(String(params.sourceId ?? ''), this.getActor(req));
        return this.sendResp(req, res, { data: source, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async listSourceCategories(req: Sails.Req, res: Sails.Res) {
      try {
        const { params, query } = getValidatedApiRequest(req);
        const result = await FigshareVocabularyService.listSourceCategories(
          String(params.sourceId ?? ''),
          {
            q: query.q as string | undefined,
            includeHistorical: String(query.includeHistorical ?? '') === 'true',
            selectableOnly: String(query.selectableOnly ?? '') === 'true',
            limit: query.limit as unknown as number | undefined,
            offset: query.offset as unknown as number | undefined,
          },
          this.getActor(req)
        );
        return this.sendResp(req, res, { data: this.asListResponse(result), headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async createSourcePreview(req: Sails.Req, res: Sails.Res) {
      try {
        const { params, body } = getValidatedApiRequest(req);
        const actor = this.getActor(req);
        const sourceId = String(params.sourceId ?? '');
        const source = (await FigshareVocabularyService.getSource(sourceId, actor)) as {
          scope: string;
          taxonomyId: string;
        };
        const payload = this.asRecord(body);
        const preview = await FigshareVocabularyService.createPreview(
          {
            scope: source.scope as FigshareCategoryScope,
            taxonomyId: source.taxonomyId,
            sourceId,
            crosswalkId: payload.crosswalkId == null ? undefined : String(payload.crosswalkId),
            localVocabularyId: payload.localVocabularyId == null ? undefined : String(payload.localVocabularyId),
          },
          actor
        );
        return this.sendResp(req, res, { status: 201, data: preview, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async cloneSource(req: Sails.Req, res: Sails.Res) {
      try {
        const { params, body } = getValidatedApiRequest(req);
        const payload = this.asRecord(body);
        const clone = await FigshareVocabularyService.cloneMirror(
          String(params.sourceId ?? ''),
          {
            name: String(payload.name ?? ''),
            slug: payload.slug == null ? undefined : String(payload.slug),
          },
          this.getActor(req)
        );
        return this.sendResp(req, res, { status: 201, data: clone, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async listSyncRuns(req: Sails.Req, res: Sails.Res) {
      try {
        const { query } = getValidatedApiRequest(req);
        const result = await FigshareVocabularyService.listSyncRuns(
          {
            sourceId: query.sourceId as string | undefined,
            limit: query.limit as unknown as number | undefined,
            offset: query.offset as unknown as number | undefined,
          },
          this.getActor(req)
        );
        return this.sendResp(req, res, { data: this.asListResponse(result), headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async createPreview(req: Sails.Req, res: Sails.Res) {
      try {
        const { body } = getValidatedApiRequest(req);
        const payload = this.asRecord(body);
        const preview = await FigshareVocabularyService.createPreview(
          {
            scope: String(payload.scope ?? '') as FigshareCategoryScope,
            taxonomyId: String(payload.taxonomyId ?? ''),
            sourceId: payload.sourceId == null ? undefined : String(payload.sourceId),
            crosswalkId: payload.crosswalkId == null ? undefined : String(payload.crosswalkId),
            localVocabularyId: payload.localVocabularyId == null ? undefined : String(payload.localVocabularyId),
            createLocalClone: payload.createLocalClone === true,
            localCloneName: payload.localCloneName == null ? undefined : String(payload.localCloneName),
            localCloneSlug: payload.localCloneSlug == null ? undefined : String(payload.localCloneSlug),
          },
          this.getActor(req)
        );
        return this.sendResp(req, res, { status: 201, data: preview, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async getPreview(req: Sails.Req, res: Sails.Res) {
      try {
        const { params, query } = getValidatedApiRequest(req);
        const preview = await FigshareVocabularyService.getPreview(
          String(params.runId ?? ''),
          {
            view: query.view === 'diff' ? 'diff' : 'proposals',
            changeClass: query.changeClass as string | undefined,
            matchType: query.matchType as string | undefined,
            q: query.q as string | undefined,
            unresolvedOnly: String(query.unresolvedOnly ?? '') === 'true',
            historicalOnly: String(query.historicalOnly ?? '') === 'true',
            limit: query.limit as unknown as number | undefined,
            offset: query.offset as unknown as number | undefined,
          },
          this.getActor(req)
        );
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async applyPreview(req: Sails.Req, res: Sails.Res) {
      try {
        const { params, body } = getValidatedApiRequest(req);
        const payload = this.asRecord(body);
        const manualMappings = Array.isArray(payload.manualMappings)
          ? payload.manualMappings.map(entry => {
              const mapping = this.asRecord(entry);
              return {
                localEntryId: mapping.localEntryId == null ? undefined : String(mapping.localEntryId),
                localEntryKey: mapping.localEntryKey == null ? undefined : String(mapping.localEntryKey),
                figshareSourceIds: Array.isArray(mapping.figshareSourceIds)
                  ? mapping.figshareSourceIds.map(value => String(value))
                  : [],
              };
            })
          : [];
        const result = await FigshareVocabularyService.applyPreview(
          String(params.runId ?? ''),
          {
            remoteHash: String(payload.remoteHash ?? ''),
            expectedRevision: payload.expectedRevision == null ? undefined : Number(payload.expectedRevision),
            approvedProposalIds: Array.isArray(payload.approvedProposalIds)
              ? payload.approvedProposalIds.map(value => String(value))
              : [],
            manualMappings,
          },
          this.getActor(req)
        );
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }
  }
}
