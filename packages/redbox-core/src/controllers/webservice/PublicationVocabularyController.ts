import { Controllers as controllers } from '../../CoreController';
import { getValidatedApiRequest } from '../../api-routes/validation';
import { PublicationVocabularyError } from '../../services/publication-vocabulary/contracts';
import type { PublicationCrosswalkMapping } from '../../services/publication-vocabulary/contracts';
import { getMatchedRoutePath, isRecord } from '../../api-routes/helpers';

export namespace Controllers {
  /** Shared vocabulary HTTP transport; use the documented REST route contracts. @internal */
  export class PublicationVocabulary extends controllers.Core.Controller {
    protected override _exportedMethods = [
      'sources',
      'capabilities',
      'sourceHistory',
      'localEntries',
      'terms',
      'importSource',
      'importFigshare',
      'crosswalks',
      'crosswalk',
      'createCrosswalk',
      'saveMappings',
      'approve',
    ];
    private actor(req: Sails.Req) {
      const brand = BrandingService.getBrand(BrandingService.getBrandNameFromReq(req));
      const user = req.user as { username?: string } | undefined;
      return { brandId: String(brand?.id ?? ''), userId: user?.username ?? '' };
    }
    private async sendResult(req: Sails.Req, res: Sails.Res, action: () => Promise<unknown>) {
      try {
        if (!['GET', 'HEAD', 'OPTIONS'].includes((req.method ?? '').toUpperCase())) {
          const path = getMatchedRoutePath(req) ?? '';
          const sessionRoute = /^\/[^/]+\/[^/]+\/publication-vocabularies(?:\/|$)/.test(path);
          if (!sessionRoute) {
            // API routes bypass CSRF. A cookie must never stand in for bearer authentication,
            // including when the general API policy has already accepted that cookie.
            if (!/^Bearer\s+\S+$/i.test(String(req.headers.authorization ?? '')))
              throw new PublicationVocabularyError('API mutations require bearer authentication', 403);
            const user = await new Promise<Record<string, unknown>>((resolve, reject) => {
              sails.config.passport.authenticate('bearer', { session: false }, (error, verified) => {
                if (error || !verified) reject(new PublicationVocabularyError('Invalid bearer authentication', 403));
                else resolve(verified);
              })(req, res, reject);
            });
            req.user = user;
          }
        }
        return this.sendResp(req, res, { data: await action(), headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, {
          status: error instanceof PublicationVocabularyError ? error.status : 500,
          displayErrors: [
            {
              title: 'Publication vocabulary',
              detail: error instanceof PublicationVocabularyError ? error.message : 'The vocabulary operation failed',
            },
          ],
          headers: this.getNoCacheHeaders(),
        });
      }
    }
    public async sources(req: Sails.Req, res: Sails.Res) {
      return this.sendResult(req, res, () => PublicationVocabularyService.listSources(this.actor(req)));
    }
    public async capabilities(req: Sails.Req, res: Sails.Res) {
      return this.sendResult(req, res, () => PublicationVocabularyService.administrationCapabilities(this.actor(req)));
    }
    public async sourceHistory(req: Sails.Req, res: Sails.Res) {
      return this.sendResult(req, res, () =>
        PublicationVocabularyService.sourceHistory(String(getValidatedApiRequest(req).params.id), this.actor(req))
      );
    }
    public async localEntries(req: Sails.Req, res: Sails.Res) {
      const { params, query } = getValidatedApiRequest(req);
      return this.sendResult(req, res, () =>
        PublicationVocabularyService.listLocalEntries(
          String(params.id),
          { q: String(query.q ?? ''), limit: Number(query.limit), offset: Number(query.offset) },
          this.actor(req)
        )
      );
    }
    public async crosswalks(req: Sails.Req, res: Sails.Res) {
      return this.sendResult(req, res, () => PublicationVocabularyService.listCrosswalks(this.actor(req)));
    }
    public async crosswalk(req: Sails.Req, res: Sails.Res) {
      return this.sendResult(req, res, () =>
        PublicationVocabularyService.getCrosswalk(String(getValidatedApiRequest(req).params.id), this.actor(req))
      );
    }
    public async terms(req: Sails.Req, res: Sails.Res) {
      const { params, query } = getValidatedApiRequest(req);
      return this.sendResult(req, res, () =>
        PublicationVocabularyService.listTargets(
          String(params.id),
          {
            q: String(query.q ?? ''),
            includeHistorical: query.includeHistorical === 'true',
            limit: Number(query.limit),
            offset: Number(query.offset),
          },
          this.actor(req)
        )
      );
    }
    public async importSource(req: Sails.Req, res: Sails.Res) {
      return this.sendResult(req, res, async () => {
        const { body } = getValidatedApiRequest(req);
        if (!isRecord(body) || !Array.isArray(body.terms))
          throw new PublicationVocabularyError('Invalid source import');
        const terms = body.terms.map(term => {
          if (!isRecord(term) || typeof term.selectable !== 'boolean')
            throw new PublicationVocabularyError('Invalid imported term');
          return {
            id: String(term.id ?? ''),
            namespace: String(term.namespace ?? ''),
            value: String(term.value ?? ''),
            sourceId: String(term.sourceId ?? ''),
            label: String(term.label ?? ''),
            selectable: term.selectable,
            ...(term.parentId ? { parentId: String(term.parentId) } : {}),
          };
        });
        return PublicationVocabularyService.importSource(
          {
            provider: String(body.provider ?? ''),
            scope: String(body.scope ?? ''),
            catalogueId: String(body.catalogueId ?? ''),
            namespace: String(body.namespace ?? ''),
            displayName: String(body.displayName ?? ''),
            importId: String(body.importId ?? ''),
            terms,
            ...(body.id ? { id: String(body.id) } : {}),
            ...(body.expectedVersion !== undefined ? { expectedVersion: Number(body.expectedVersion) } : {}),
          },
          this.actor(req)
        );
      });
    }
    public async importFigshare(req: Sails.Req, res: Sails.Res) {
      return this.sendResult(req, res, async () => {
        const { body } = getValidatedApiRequest(req);
        if (!isRecord(body) || (body.scope !== 'public' && body.scope !== 'account'))
          throw new PublicationVocabularyError('Invalid Figshare import');
        return PublicationVocabularyService.importFigshare(
          {
            scope: body.scope,
            taxonomyId: String(body.taxonomyId),
            importId: String(body.importId),
            ...(body.expectedVersion !== undefined ? { expectedVersion: Number(body.expectedVersion) } : {}),
          },
          this.actor(req)
        );
      });
    }
    public async createCrosswalk(req: Sails.Req, res: Sails.Res) {
      return this.sendResult(req, res, async () => {
        const { body } = getValidatedApiRequest(req);
        if (!isRecord(body)) throw new PublicationVocabularyError('Invalid crosswalk');
        const normalizer = body.normalizer === 'figshare-code-v1' ? 'figshare-code-v1' : 'exact-v1';
        return PublicationVocabularyService.createCrosswalk(
          {
            name: String(body.name),
            sourceId: String(body.sourceId),
            localVocabularyId: String(body.localVocabularyId),
            normalizer,
          },
          this.actor(req)
        );
      });
    }
    public async saveMappings(req: Sails.Req, res: Sails.Res) {
      return this.sendResult(req, res, async () => {
        const { body, params } = getValidatedApiRequest(req);
        if (!isRecord(body) || !Array.isArray(body.mappings)) throw new PublicationVocabularyError('Invalid mappings');
        const mappings: PublicationCrosswalkMapping[] = body.mappings.map(mapping => {
          if (!isRecord(mapping) || !['proposed', 'approved', 'rejected'].includes(String(mapping.status)))
            throw new PublicationVocabularyError('Invalid mapping status');
          return {
            id: String(mapping.id),
            localEntryId: String(mapping.localEntryId),
            targetId: String(mapping.targetId),
            status:
              mapping.status === 'approved' ? 'approved' : mapping.status === 'rejected' ? 'rejected' : 'proposed',
            matchType: String(mapping.matchType),
          };
        });
        return PublicationVocabularyService.saveMappings(
          String(params.id),
          { version: Number(body.version), mappings },
          this.actor(req)
        );
      });
    }
    public async approve(req: Sails.Req, res: Sails.Res) {
      return this.sendResult(req, res, async () => {
        const { body, params } = getValidatedApiRequest(req);
        if (!isRecord(body)) throw new PublicationVocabularyError('Invalid approval');
        return PublicationVocabularyService.approveCrosswalk(String(params.id), Number(body.version), this.actor(req));
      });
    }
  }
}
