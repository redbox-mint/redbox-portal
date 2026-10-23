import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Figshare } from '../../vocabulary/FigshareVocabulary';
import type { FigshareCategoryScope } from '../../services/figshare-v2/types';
import { FigshareVocabularyError } from '../../services/figshare-v2/vocabulary-errors';
import { toFigshareVocabularyErrorResponse } from '../../vocabulary/FigshareHttpErrors';
import { figshareCrosswalkApiRoutes } from '../../api-routes/groups/figshare-crosswalks';
import { figshareVocabularyApiRoutes } from '../../api-routes/groups/figshare-vocabulary';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { sendApiData, sendApiErrors, validationApiVersion } from './responses';
export const figshareAdministrationRoutes = [...figshareCrosswalkApiRoutes, ...figshareVocabularyApiRoutes];
export interface FigshareAdministrationHttpInput {
  readonly vocabulary: Figshare.FigshareVocabularyService;
  audit(actor: { id: string; username: string }, action: string, context: { brandId: string }): Promise<unknown>;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
  readonly log: ILogger;
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function asListResponse(result: { data: unknown[]; meta: { total: number; limit: number; offset: number } }) {
  return {
    summary: {
      numFound: result.meta.total,
      start: result.meta.offset,
      page: result.meta.limit > 0 ? Math.floor(result.meta.offset / result.meta.limit) + 1 : 1,
    },
    records: result.data,
  };
}
export function mountFigshareAdministrationRoutes(router: Router, input: FigshareAdministrationHttpInput): void {
  const bindings = figshareAdministrationRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router[route.method](
      route.path,
      ...policies,
      ...(route.method === 'get' ? [] : [input.csrf.apiProtect]),
      httpAction(async (req, res) => {
        const { actor, brand } = requestContext(req);
        if (!actor) {
          sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
          return;
        }
        if (!actor.roles.some(r => r.brandId === brand.id && r.name === 'Admin')) {
          sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
          return;
        }
        const validated = validateApiRouteRequest(req, route);
        if (!validated.valid) {
          sendApiErrors(
            req,
            res,
            400,
            validated.issues.map(i => ({ title: i.path, detail: i.message })),
            validationApiVersion(req)
          );
          return;
        }
        const { params, query, body } = validated;
        if (
          ['id', 'sourceId', 'runId'].some(
            key => params[key] !== undefined && !/^[a-f0-9]{24}$/i.test(String(params[key]))
          )
        ) {
          sendApiErrors(req, res, 400, [{ detail: 'Invalid resource identifier' }]);
          return;
        }
        const context = { brandId: brand.id, userId: actor.username };
        try {
          const perform = async (): Promise<{ data?: unknown; status?: number }> => {
            switch (route.action) {
              case 'list': {
                const result = await input.vocabulary.listCrosswalks(
                  {
                    q: query.q as string | undefined,
                    status: query.status as string | undefined,
                    localVocabularyId: query.localVocabularyId as string | undefined,
                    sourceId: query.sourceId as string | undefined,
                    limit: query.limit as unknown as number | undefined,
                    offset: query.offset as unknown as number | undefined,
                  },
                  context
                );
                return { data: asListResponse(result) };
              }
              case 'get': {
                const crosswalk = await input.vocabulary.getCrosswalk(String(params.id ?? ''), context);
                return { data: crosswalk };
              }
              case 'create': {
                const payload = asRecord(body);
                const crosswalk = await input.vocabulary.createCrosswalk(
                  {
                    name: String(payload.name ?? ''),
                    localVocabularyId: String(payload.localVocabularyId ?? ''),
                    sourceId: String(payload.sourceId ?? ''),
                  },
                  context
                );
                return { status: 201, data: crosswalk };
              }
              case 'usage': {
                const usage = await input.vocabulary.getCrosswalkUsage(String(params.id ?? ''), context);
                return { data: usage };
              }
              case 'listLocalEntries': {
                const result = await input.vocabulary.listCrosswalkLocalEntries(
                  String(params.id ?? ''),
                  {
                    q: query.q as string | undefined,
                    mapped: query.mapped as string | undefined,
                    revision: query.revision == null ? undefined : Number(query.revision),
                    limit: query.limit as unknown as number | undefined,
                    offset: query.offset as unknown as number | undefined,
                  },
                  context
                );
                return { data: asListResponse(result) };
              }
              case 'listMappings': {
                const result = await input.vocabulary.listCrosswalkMappings(
                  String(params.id ?? ''),
                  {
                    status: query.status as string | undefined,
                    q: query.q as string | undefined,
                    revision: query.revision == null ? undefined : Number(query.revision),
                    limit: query.limit as unknown as number | undefined,
                    offset: query.offset as unknown as number | undefined,
                  },
                  context
                );
                return { data: asListResponse(result) };
              }
              case 'saveMappings': {
                const payload = asRecord(body);
                const changes = Array.isArray(payload.changes)
                  ? payload.changes.map(entry => {
                      const change = asRecord(entry);
                      return {
                        op: change.op === 'remove' ? ('remove' as const) : ('add' as const),
                        localEntryId: String(change.localEntryId ?? ''),
                        figshareCategoryId: String(change.figshareCategoryId ?? ''),
                        matchType: change.matchType == null ? undefined : String(change.matchType),
                        status:
                          change.status == null
                            ? undefined
                            : (String(change.status) as 'proposed' | 'approved' | 'rejected'),
                      };
                    })
                  : [];
                const crosswalk = await input.vocabulary.saveMappings(
                  String(params.id ?? ''),
                  { revision: Number(payload.revision), changes },
                  context
                );
                return { data: crosswalk };
              }
              case 'approve': {
                const payload = asRecord(body);
                const crosswalk = await input.vocabulary.approveCrosswalk(
                  String(params.id ?? ''),
                  Number(payload.revision),
                  context
                );
                return { data: crosswalk };
              }
              case 'delete': {
                await input.vocabulary.deleteCrosswalk(String(params.id ?? ''), context);
                return { status: 204 };
              }
              case 'listCatalogues': {
                const taxonomies = await input.vocabulary.discoverTaxonomies(
                  { scope: String(query.scope ?? '') as FigshareCategoryScope },
                  context
                );
                return { data: taxonomies };
              }
              case 'listSources': {
                const result = await input.vocabulary.listSources(
                  {
                    q: query.q as string | undefined,
                    scope: query.scope as string | undefined,
                    limit: query.limit as unknown as number | undefined,
                    offset: query.offset as unknown as number | undefined,
                  },
                  context
                );
                return { data: asListResponse(result) };
              }
              case 'getSource': {
                const source = await input.vocabulary.getSource(String(params.sourceId ?? ''), context);
                return { data: source };
              }
              case 'listSourceCategories': {
                const result = await input.vocabulary.listSourceCategories(
                  String(params.sourceId ?? ''),
                  {
                    q: query.q as string | undefined,
                    includeHistorical: String(query.includeHistorical ?? '') === 'true',
                    selectableOnly: String(query.selectableOnly ?? '') === 'true',
                    limit: query.limit as unknown as number | undefined,
                    offset: query.offset as unknown as number | undefined,
                  },
                  context
                );
                return { data: asListResponse(result) };
              }
              case 'createSourcePreview': {
                const actor = context;
                const sourceId = String(params.sourceId ?? '');
                const source = (await input.vocabulary.getSource(sourceId, actor)) as {
                  scope: string;
                  taxonomyId: string;
                };
                const payload = asRecord(body);
                const preview = await input.vocabulary.createPreview(
                  {
                    scope: source.scope as FigshareCategoryScope,
                    taxonomyId: source.taxonomyId,
                    sourceId,
                    crosswalkId: payload.crosswalkId == null ? undefined : String(payload.crosswalkId),
                    localVocabularyId:
                      payload.localVocabularyId == null ? undefined : String(payload.localVocabularyId),
                  },
                  actor
                );
                return { status: 201, data: preview };
              }
              case 'cloneSource': {
                const payload = asRecord(body);
                const clone = await input.vocabulary.cloneMirror(
                  String(params.sourceId ?? ''),
                  {
                    name: String(payload.name ?? ''),
                    slug: payload.slug == null ? undefined : String(payload.slug),
                  },
                  context
                );
                return { status: 201, data: clone };
              }
              case 'listSyncRuns': {
                const result = await input.vocabulary.listSyncRuns(
                  {
                    sourceId: query.sourceId as string | undefined,
                    limit: query.limit as unknown as number | undefined,
                    offset: query.offset as unknown as number | undefined,
                  },
                  context
                );
                return { data: asListResponse(result) };
              }
              case 'createPreview': {
                const payload = asRecord(body);
                const preview = await input.vocabulary.createPreview(
                  {
                    scope: String(payload.scope ?? '') as FigshareCategoryScope,
                    taxonomyId: String(payload.taxonomyId ?? ''),
                    sourceId: payload.sourceId == null ? undefined : String(payload.sourceId),
                    crosswalkId: payload.crosswalkId == null ? undefined : String(payload.crosswalkId),
                    localVocabularyId:
                      payload.localVocabularyId == null ? undefined : String(payload.localVocabularyId),
                    createLocalClone: payload.createLocalClone === true,
                    localCloneName: payload.localCloneName == null ? undefined : String(payload.localCloneName),
                    localCloneSlug: payload.localCloneSlug == null ? undefined : String(payload.localCloneSlug),
                  },
                  context
                );
                return { status: 201, data: preview };
              }
              case 'getPreview': {
                const preview = await input.vocabulary.getPreview(
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
                  context
                );
                return { data: preview };
              }
              case 'applyPreview': {
                const payload = asRecord(body);
                const manualMappings = Array.isArray(payload.manualMappings)
                  ? payload.manualMappings.map(entry => {
                      const mapping = asRecord(entry);
                      return {
                        localEntryId: mapping.localEntryId == null ? undefined : String(mapping.localEntryId),
                        localEntryKey: mapping.localEntryKey == null ? undefined : String(mapping.localEntryKey),
                        figshareSourceIds: Array.isArray(mapping.figshareSourceIds)
                          ? mapping.figshareSourceIds.map(value => String(value))
                          : [],
                      };
                    })
                  : [];
                const result = await input.vocabulary.applyPreview(
                  String(params.runId ?? ''),
                  {
                    remoteHash: String(payload.remoteHash ?? ''),
                    expectedRevision: payload.expectedRevision == null ? undefined : Number(payload.expectedRevision),
                    approvedProposalIds: Array.isArray(payload.approvedProposalIds)
                      ? payload.approvedProposalIds.map(value => String(value))
                      : [],
                    manualMappings,
                  },
                  context
                );
                return { data: result };
              }
            }
            throw new Error('Missing Figshare operation');
          };
          const result = await perform();
          if (route.method !== 'get') await input.audit(actor, 'figshare-' + route.action, { brandId: brand.id });
          if (result.status === 204) res.status(204).end();
          else sendApiData(req, res, result.data, result.status);
        } catch (error) {
          input.log.error('Figshare vocabulary operation failed');
          const mapped =
            error instanceof FigshareVocabularyError
              ? toFigshareVocabularyErrorResponse(error)
              : { status: 500, title: 'Operation failed', detail: 'Review current state before retrying.' };
          sendApiErrors(req, res, mapped.status, [{ title: mapped.title, detail: mapped.detail }]);
        }
      })
    );
}
