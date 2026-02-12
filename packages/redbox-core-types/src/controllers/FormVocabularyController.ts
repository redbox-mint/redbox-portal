import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model';

export namespace Controllers {
  export class FormVocabulary extends controllers.Core.Controller {

    protected override _exportedMethods: string[] = [
      'get',
      'entries',
      'children',
      'getRecords'
    ];

    public async get(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      const branding = String(req.param('branding') ?? '').trim();
      const vocabIdOrSlug = String(req.param('vocabIdOrSlug') ?? '').trim();

      if (!vocabIdOrSlug) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'invalid-vocabulary-id-or-slug' }],
          headers: this.getNoCacheHeaders()
        });
      }

      let vocabulary: Awaited<ReturnType<typeof VocabularyService.getByIdOrSlug>> | null;
      try {
        vocabulary = await VocabularyService.getByIdOrSlug(branding, vocabIdOrSlug);
      } catch (error) {
        sails.log.verbose('Error getting vocabulary:');
        sails.log.verbose(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ code: 'vocabulary-service-error' }],
          headers: this.getNoCacheHeaders()
        });
      }

      if (!vocabulary) {
        return this.sendResp(req, res, {
          status: 404,
          displayErrors: [{ code: 'vocabulary-not-found' }],
          headers: this.getNoCacheHeaders()
        });
      }

      return this.sendResp(req, res, {
        data: {
          id: vocabulary.id,
          name: vocabulary.name,
          slug: vocabulary.slug
        },
        headers: this.getNoCacheHeaders()
      });
    }

    public async entries(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      const branding = String(req.param('branding') ?? '').trim();
      const vocabIdOrSlug = String(req.param('vocabIdOrSlug') ?? '').trim();
      if (!vocabIdOrSlug) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'invalid-vocabulary-id-or-slug' }],
          headers: this.getNoCacheHeaders()
        });
      }

      const rawLimit = req.param('limit');
      const rawOffset = req.param('offset');
      const search = String(req.param('search') ?? '').trim();

      const hasLimit = rawLimit !== undefined && rawLimit !== null && rawLimit !== '';
      const hasOffset = rawOffset !== undefined && rawOffset !== null && rawOffset !== '';
      const limit = hasLimit ? Number.parseInt(String(rawLimit), 10) : undefined;
      const offset = hasOffset ? Number.parseInt(String(rawOffset), 10) : undefined;

      if ((hasLimit && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) ||
        (hasOffset && (!Number.isInteger(offset) || (offset ?? -1) < 0))) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'invalid-query-params' }],
          headers: this.getNoCacheHeaders()
        });
      }

      let result: Awaited<ReturnType<typeof VocabularyService.getEntries>> | null;
      try {
        result = await VocabularyService.getEntries(branding, vocabIdOrSlug, {
          search,
          limit,
          offset,
        });
      } catch (error) {
        sails.log.verbose('Error getting vocabulary entries:');
        sails.log.verbose(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ code: 'internal-server-error' }],
          headers: this.getNoCacheHeaders()
        });
      }

      if (!result) {
        return this.sendResp(req, res, {
          status: 404,
          displayErrors: [{ code: 'vocabulary-not-found' }],
          headers: this.getNoCacheHeaders()
        });
      }

      return this.sendResp(req, res, {
        data: result.entries,
        meta: result.meta,
        headers: this.getNoCacheHeaders()
      });
    }

    public async children(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      const branding = String(req.param('branding') ?? '').trim();
      const vocabIdOrSlug = String(req.param('vocabIdOrSlug') ?? '').trim();
      if (!vocabIdOrSlug) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'invalid-vocabulary-id-or-slug' }],
          headers: this.getNoCacheHeaders()
        });
      }

      const parentId = String(req.param('parentId') ?? '').trim();
      try {
        const result = await VocabularyService.getChildren(branding, vocabIdOrSlug, parentId || undefined);
        if (!result) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ code: 'vocabulary-not-found' }],
            headers: this.getNoCacheHeaders()
          });
        }

        return this.sendResp(req, res, {
          data: result.entries,
          meta: result.meta,
          headers: this.getNoCacheHeaders()
        });
      } catch (error) {
        const errorCode = String((error as { code?: string } | null)?.code ?? '');
        if (errorCode === 'invalid-parent-id') {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ code: 'invalid-parent-id' }],
            headers: this.getNoCacheHeaders()
          });
        }
        sails.log.verbose('Error getting vocabulary children:');
        sails.log.verbose(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ code: 'vocabulary-children-failed' }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async getRecords(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      const queryId = String(req.param('queryId') ?? '').trim();
      const searchString = String(req.param('search') ?? '');

      const rawStart = req.param('start');
      const rawRows = req.param('rows');
      const hasStart = rawStart !== undefined && rawStart !== null && rawStart !== '';
      const hasRows = rawRows !== undefined && rawRows !== null && rawRows !== '';
      const start = Number(req.param('start'));
      const rows = Number(req.param('rows'));

      if (!queryId ||
        (hasStart && (!Number.isFinite(start) || start < 0)) ||
        (hasRows && (!Number.isFinite(rows) || rows <= 0))) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'invalid-query-params' }],
          headers: this.getNoCacheHeaders()
        });
      }

      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      try {
        const response = await VocabService.findRecords(
          queryId,
          brand,
          searchString,
          start,
          rows,
          req.user! as Parameters<typeof VocabService.findRecords>[5]
        );
        return this.sendResp(req, res, {
          data: response,
          headers: this.getNoCacheHeaders()
        });
      } catch (error) {
        sails.log.verbose('Error getting internal records:');
        sails.log.verbose(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ code: 'query-vocab-failed' }],
          headers: this.getNoCacheHeaders()
        });
      }
    }
  }
}
