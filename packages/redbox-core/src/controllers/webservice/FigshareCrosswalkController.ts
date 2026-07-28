import { Controllers as controllers } from '../../CoreController';
import { ListAPIResponse, ListAPISummary } from '../../model';
import { getValidatedApiRequest } from '../../api-routes/validation';
import { Services as FigshareVocabularyServiceModule } from '../../services/FigshareVocabularyService';
import { toFigshareVocabularyErrorResponse } from './figshare-vocabulary-errors';

export namespace Controllers {
  export class FigshareCrosswalk extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = [
      'list',
      'get',
      'create',
      'usage',
      'listMappings',
      'saveMappings',
      'approve',
      'delete',
    ];

    private getActor(req: Sails.Req): FigshareVocabularyServiceModule.ActorContext {
      const brand = BrandingService.getBrand(BrandingService.getBrandNameFromReq(req));
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

    public async list(req: Sails.Req, res: Sails.Res) {
      try {
        const { query } = getValidatedApiRequest(req);
        const result = await FigshareVocabularyService.listCrosswalks(
          {
            q: query.q as string | undefined,
            status: query.status as string | undefined,
            localVocabularyId: query.localVocabularyId as string | undefined,
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

    public async get(req: Sails.Req, res: Sails.Res) {
      try {
        const { params } = getValidatedApiRequest(req);
        const crosswalk = await FigshareVocabularyService.getCrosswalk(String(params.id ?? ''), this.getActor(req));
        return this.sendResp(req, res, { data: crosswalk, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async create(req: Sails.Req, res: Sails.Res) {
      try {
        const { body } = getValidatedApiRequest(req);
        const payload = this.asRecord(body);
        const crosswalk = await FigshareVocabularyService.createCrosswalk(
          {
            name: String(payload.name ?? ''),
            localVocabularyId: String(payload.localVocabularyId ?? ''),
            sourceId: String(payload.sourceId ?? ''),
          },
          this.getActor(req)
        );
        return this.sendResp(req, res, { status: 201, data: crosswalk, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async usage(req: Sails.Req, res: Sails.Res) {
      try {
        const { params } = getValidatedApiRequest(req);
        const usage = await FigshareVocabularyService.getCrosswalkUsage(String(params.id ?? ''), this.getActor(req));
        return this.sendResp(req, res, { data: usage, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async listMappings(req: Sails.Req, res: Sails.Res) {
      try {
        const { params, query } = getValidatedApiRequest(req);
        const result = await FigshareVocabularyService.listCrosswalkMappings(
          String(params.id ?? ''),
          {
            status: query.status as string | undefined,
            q: query.q as string | undefined,
            revision: query.revision == null ? undefined : Number(query.revision),
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

    public async saveMappings(req: Sails.Req, res: Sails.Res) {
      try {
        const { params, body } = getValidatedApiRequest(req);
        const payload = this.asRecord(body);
        const changes = Array.isArray(payload.changes)
          ? payload.changes.map((entry) => {
            const change = this.asRecord(entry);
            return {
              op: change.op === 'remove' ? ('remove' as const) : ('add' as const),
              localEntryId: String(change.localEntryId ?? ''),
              figshareCategoryId: String(change.figshareCategoryId ?? ''),
              matchType: change.matchType == null ? undefined : String(change.matchType),
              status: change.status == null
                ? undefined
                : (String(change.status) as 'proposed' | 'approved' | 'rejected'),
            };
          })
          : [];
        const crosswalk = await FigshareVocabularyService.saveMappings(
          String(params.id ?? ''),
          { revision: Number(payload.revision), changes },
          this.getActor(req)
        );
        return this.sendResp(req, res, { data: crosswalk, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async approve(req: Sails.Req, res: Sails.Res) {
      try {
        const { params, body } = getValidatedApiRequest(req);
        const payload = this.asRecord(body);
        const crosswalk = await FigshareVocabularyService.approveCrosswalk(
          String(params.id ?? ''),
          Number(payload.revision),
          this.getActor(req)
        );
        return this.sendResp(req, res, { data: crosswalk, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }

    public async delete(req: Sails.Req, res: Sails.Res) {
      try {
        const { params } = getValidatedApiRequest(req);
        await FigshareVocabularyService.deleteCrosswalk(String(params.id ?? ''), this.getActor(req));
        return this.sendResp(req, res, { status: 204, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.fail(req, res, error);
      }
    }
  }
}
