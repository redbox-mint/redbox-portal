import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model';
import { toBoolean } from '@researchdatabox/sails-ng-common';

type FormVocabularyUserContext = Record<string, unknown>;
type FormVocabularyExternalServiceParams = Parameters<typeof FormVocabularyService.findInExternalService>[1];

export namespace Controllers {
  export class FormVocabulary extends controllers.Core.Controller {

    protected override _exportedMethods: string[] = [
      'get',
      'entries',
      'children',
      'getRecords',
      'externalEntries',
      'serviceEntries'
    ];

    public async get(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      const branding = String(req.param('branding') ?? '').trim();
      const vocabIdOrSlug = String(req.param('vocabIdOrSlug') ?? '').trim();
      this.updateChronicle(req, {formVocabularyBranding: branding, formVocabularyId: vocabIdOrSlug});

      if (!vocabIdOrSlug) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'invalid-vocabulary-id-or-slug' }],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyIdInvalid: true},
        });
      }

      let vocabulary: Awaited<ReturnType<typeof VocabularyService.getByIdOrSlug>> | null;
      try {
        vocabulary = await VocabularyService.getByIdOrSlug(branding, vocabIdOrSlug);
      } catch (error) {
        return this.sendResp(req, res, {
          status: 500,
          errors: [error],
          displayErrors: [{ code: 'vocabulary-service-error' }],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyRetrieveError: true},
        });
      }

      if (!vocabulary) {
        return this.sendResp(req, res, {
          status: 404,
          displayErrors: [{ code: 'vocabulary-not-found' }],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyNotFound: true},
        });
      }

      return this.sendResp(req, res, {
        data: {
          id: vocabulary.id,
          name: vocabulary.name,
          slug: vocabulary.slug
        },
        headers: this.getNoCacheHeaders(),
        chronicle: {formVocabularyDetails: vocabulary},
      });
    }

    public async entries(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      const branding = String(req.param('branding') ?? '').trim();
      const vocabIdOrSlug = String(req.param('vocabIdOrSlug') ?? '').trim();
      this.updateChronicle(req, {formVocabularyBranding: branding, formVocabularyId: vocabIdOrSlug});

      if (!vocabIdOrSlug) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'invalid-vocabulary-id-or-slug' }],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyIdInvalid: true},
        });
      }

      const rawLimit = req.param('limit');
      const rawOffset = req.param('offset');
      const search = String(req.param('search') ?? '').trim();
      const includeHistoricalValues = toBoolean(req.param('includeHistoricalValues'));

      const hasLimit = rawLimit !== undefined && rawLimit !== null && rawLimit !== '';
      const hasOffset = rawOffset !== undefined && rawOffset !== null && rawOffset !== '';
      const limit = hasLimit ? Number.parseInt(String(rawLimit), 10) : undefined;
      const offset = hasOffset ? Number.parseInt(String(rawOffset), 10) : undefined;
      this.updateChronicle(req, {formVocabularyPagingLimit: limit, formVocabularyPagingOffset: offset});

      if ((hasLimit && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) ||
        (hasOffset && (!Number.isInteger(offset) || (offset ?? -1) < 0))) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'invalid-query-params' }],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyInvalidQuery: true},
        });
      }

      let result: Awaited<ReturnType<typeof VocabularyService.getEntries>> | null;
      try {
        result = await VocabularyService.getEntries(branding, vocabIdOrSlug, {
          search,
          limit,
          offset,
          includeHistoricalValues,
        });
      } catch (error) {
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ code: 'internal-server-error' }],
          errors: [error],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyRetrieveError: true},
        });
      }

      if (!result) {
        return this.sendResp(req, res, {
          status: 404,
          displayErrors: [{ code: 'vocabulary-not-found' }],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyNotFound: true},
        });
      }

      return this.sendResp(req, res, {
        data: result.entries,
        meta: result.meta,
        headers: this.getNoCacheHeaders(),
        chronicle: {formVocabularyDetails: {...result.meta, count: result.entries?.length ?? 0}},
      });
    }

    public async children(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      const branding = String(req.param('branding') ?? '').trim();
      const vocabIdOrSlug = String(req.param('vocabIdOrSlug') ?? '').trim();
      this.updateChronicle(req, {formVocabularyBranding: branding, formVocabularyId: vocabIdOrSlug});

      if (!vocabIdOrSlug) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'invalid-vocabulary-id-or-slug' }],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyIdInvalid: true},
        });
      }

      const parentId = String(req.param('parentId') ?? '').trim();
      this.updateChronicle(req, {formVocabularyParentId: parentId});
      try {
        const result = await VocabularyService.getChildren(branding, vocabIdOrSlug, parentId || undefined);
        if (!result) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ code: 'vocabulary-not-found' }],
            headers: this.getNoCacheHeaders(),
            chronicle: {formVocabularyNotFound: true},
          });
        }

        return this.sendResp(req, res, {
          data: result.entries,
          meta: result.meta,
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyDetails: {...result.meta, count: result.entries?.length ?? 0}},
        });
      } catch (error) {
        const errorCode = String((error as { code?: string } | null)?.code ?? '');
        if (errorCode === 'invalid-parent-id') {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ code: 'invalid-parent-id' }],
            errors: [error],
            headers: this.getNoCacheHeaders(),
            chronicle: {formVocabularyInvalidParentId: true},
          });
        }
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ code: 'vocabulary-children-failed' }],
          errors: [error],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyRetrieveError: true},
        });
      }
    }

    public async getRecords(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      const queryId = String(req.param('queryId') ?? '').trim();
      const searchString = String(req.param('search') ?? '');
      this.updateChronicle(req, {formVocabularyQueryId: queryId, formVocabularySearch: searchString});

      const rawStart = req.param('start');
      const rawRows = req.param('rows');
      const hasStart = rawStart !== undefined && rawStart !== null && rawStart !== '';
      const hasRows = rawRows !== undefined && rawRows !== null && rawRows !== '';
      const start = Number(req.param('start'));
      const rows = Number(req.param('rows'));
      this.updateChronicle(req, {formVocabularyPagingStart: start, formVocabularyPagingRows: rows});

      if (!queryId ||
        (hasStart && (!Number.isFinite(start) || start < 0)) ||
        (hasRows && (!Number.isFinite(rows) || rows <= 0))) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'invalid-query-params' }],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyInvalidQuery: true},
        });
      }

      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      try {
        const response = await FormVocabularyService.findRecords(
          queryId,
          brand,
          searchString,
          start,
          rows,
          req.user! as FormVocabularyUserContext
        );
        return this.sendResp(req, res, {
          data: response,
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyRetrieveSuccess: true},
        });
      } catch (error) {
        const errorCode = String((error as { code?: string } | null)?.code ?? '');
        if (errorCode === 'query-vocab-not-configured') {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ code: errorCode }],
            headers: this.getNoCacheHeaders(),
            chronicle: {formVocabularyRetrieveError: true},
          });
        }
        if (errorCode === 'query-vocab-invalid-config') {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ code: errorCode }],
            headers: this.getNoCacheHeaders(),
            chronicle: {formVocabularyRetrieveError: true},
          });
        }

        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ code: 'query-vocab-failed' }],
          errors: [error],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyRetrieveError: true},
        });
      }
    }

    public async externalEntries(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      const provider = String(req.param('provider') ?? '').trim();
      this.updateChronicle(req, {formVocabularyProvider: provider});

      if (!provider) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'invalid-query-params' }],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyInvalidQuery: true},
        });
      }

      try {
        const response = await FormVocabularyService.findInExternalService(
          provider,
          req.body as FormVocabularyExternalServiceParams
        );
        return this.sendResp(req, res, {
          data: response,
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyRetrieveSuccess: true},
        });
      } catch (error) {
        const errorCode = String((error as { code?: string } | null)?.code ?? '');
        if (errorCode === 'external-vocab-not-configured') {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ code: errorCode }],
            headers: this.getNoCacheHeaders(),
            chronicle: {formVocabularyRetrieveError: true},
          });
        }
        if (errorCode === 'external-vocab-invalid-config') {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ code: errorCode }],
            headers: this.getNoCacheHeaders(),
            chronicle: {formVocabularyRetrieveError: true},
          });
        }

        sails.log.verbose('Error getting external vocabulary entries:');
        sails.log.verbose(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ code: 'query-vocab-failed' }],
          errors: [error],
          headers: this.getNoCacheHeaders(),
          chronicle: {formVocabularyRetrieveError: true},
        });
      }
    }

    public async serviceEntries(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      const serviceId = String(req.param('serviceId') ?? '').trim();
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body as Record<string, unknown>
        : {};
      const rawStart = body['start'] ?? req.param('start') ?? 0;
      const rawRows = body['rows'] ?? req.param('rows') ?? 25;
      const search = String(body['search'] ?? req.param('search') ?? '');
      const start = rawStart === '' ? 0 : Number(rawStart);
      const rows = rawRows === '' ? 25 : Number(rawRows);

      if (!serviceId || !Number.isInteger(start) || start < 0 || !Number.isInteger(rows) || rows <= 0) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'invalid-query-params' }],
          headers: this.getNoCacheHeaders()
        });
      }

      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        const response = await FormVocabularyService.findInServiceLookup(serviceId, {
          search,
          start,
          rows,
          branding: String(req.param('branding') ?? req.session.branding ?? ''),
          portal: String(req.param('portal') ?? ''),
          brand,
          user: req.user && typeof req.user === 'object' ? req.user as Record<string, unknown> : {}
        });
        return this.sendResp(req, res, {
          data: response.data,
          meta: response.meta,
          headers: this.getNoCacheHeaders()
        });
      } catch (error) {
        const errorCode = String((error as { code?: string } | null)?.code ?? '');
        if (errorCode === 'service-lookup-not-configured') {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ code: errorCode }],
            headers: this.getNoCacheHeaders()
          });
        }
        if (errorCode === 'service-lookup-invalid-target' || errorCode === 'service-lookup-invalid-response') {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ code: errorCode }],
            headers: this.getNoCacheHeaders()
          });
        }

        sails.log.verbose('Error getting service vocabulary entries:');
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
