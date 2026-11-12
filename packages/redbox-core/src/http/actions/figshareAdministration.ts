import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Figshare } from '../../vocabulary/FigshareVocabulary';
import type { FigshareCategoryScope } from '../../services/figshare-v2/types';
import { FigshareVocabularyError } from '../../services/figshare-v2/vocabulary-errors';
import { toFigshareVocabularyErrorResponse } from '../../vocabulary/FigshareHttpErrors';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { validateApiRouteRequest } from '../../api-routes/validation';
import {
  referenceData,
  referenceErrors,
  referenceValidationErrors,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';
import { integrationAdministratorPrelude } from './integrationGuard';
type Contract = Pick<ApiRouteDefinition, 'request'>;
export interface FigshareAdministrationInput {
  readonly vocabulary: Figshare.FigshareVocabularyService;
  audit(actor: { id: string; username: string }, action: string, context: { brandId: string }): Promise<unknown>;
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

export function figshareAdministrationFailure(
  input: Pick<FigshareAdministrationInput, 'log'>,
  req: ReferenceRequest,
  error: unknown
): ReferenceResult {
  input.log.error('Figshare vocabulary operation failed');
  const mapped =
    error instanceof FigshareVocabularyError
      ? toFigshareVocabularyErrorResponse(error)
      : { status: 500, title: 'Operation failed', detail: 'Review current state before retrying.' };
  return referenceErrors(req, mapped.status, [{ title: mapped.title, detail: mapped.detail }]);
}
type Ready = {
  input: FigshareAdministrationInput;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
  paging: Record<string, number | undefined>;
  context: { brandId: string; userId: string };
};
async function administer(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract,
  action: string,
  run: (ready: Ready) => Promise<{ data?: unknown; status?: number }>
): Promise<ReferenceResult> {
  const refusal = integrationAdministratorPrelude(req);
  if (refusal) return refusal;
  const { actor, brand } = req.context;
  const validated = validateApiRouteRequest(req, contract);
  if (!validated.valid) return referenceValidationErrors(req, validated.issues);
  const { params, query, body } = validated;
  if (
    ['id', 'sourceId', 'runId'].some(key => params[key] !== undefined && !/^[a-f0-9]{24}$/i.test(String(params[key])))
  ) {
    return referenceErrors(req, 400, [{ detail: 'Invalid resource identifier' }]);
  }
  const paging: Record<string, number | undefined> = {};
  for (const key of ['limit', 'offset', 'revision']) {
    const value = query[key];
    if (value === undefined) continue;
    const parsed = Number(value);
    if (
      typeof value !== 'string' ||
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(parsed) ||
      parsed < (key === 'limit' ? 1 : 0) ||
      parsed > 1000000
    ) {
      return referenceErrors(req, 400, [{ detail: 'Invalid pagination or revision parameter' }]);
    }
    paging[key] = parsed;
  }
  const context = { brandId: brand.id, userId: actor!.username };

  const result = await run({ input, params, query, body, paging, context });
  if (req.method !== 'GET' && req.method !== 'HEAD')
    await input.audit(actor!, 'figshare-' + action, { brandId: brand.id });
  return result.status === 204
    ? { kind: 'empty', status: 204, headers: {}, body: undefined }
    : { ...referenceData(req, result.data), status: result.status ?? 200 };
}
export function list(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'list', async ({ input, query, paging, context }) => {
    const result = await input.vocabulary.listCrosswalks(
      {
        q: query.q as string | undefined,
        status: query.status as string | undefined,
        localVocabularyId: query.localVocabularyId as string | undefined,
        sourceId: query.sourceId as string | undefined,
        limit: paging.limit,
        offset: paging.offset,
      },
      context
    );
    return { data: asListResponse(result) };
  });
}
export function get(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'get', async ({ input, params, context }) => {
    const crosswalk = await input.vocabulary.getCrosswalk(String(params.id ?? ''), context);
    return { data: crosswalk };
  });
}
export function create(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'create', async ({ input, body, context }) => {
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
  });
}
export function usage(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'usage', async ({ input, params, context }) => {
    const usage = await input.vocabulary.getCrosswalkUsage(String(params.id ?? ''), context);
    return { data: usage };
  });
}
export function listLocalEntries(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'listLocalEntries', async ({ input, params, query, paging, context }) => {
    const result = await input.vocabulary.listCrosswalkLocalEntries(
      String(params.id ?? ''),
      {
        q: query.q as string | undefined,
        mapped: query.mapped as string | undefined,
        revision: paging.revision,
        limit: paging.limit,
        offset: paging.offset,
      },
      context
    );
    return { data: asListResponse(result) };
  });
}
export function listMappings(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'listMappings', async ({ input, params, query, paging, context }) => {
    const result = await input.vocabulary.listCrosswalkMappings(
      String(params.id ?? ''),
      {
        status: query.status as string | undefined,
        q: query.q as string | undefined,
        revision: paging.revision,
        limit: paging.limit,
        offset: paging.offset,
      },
      context
    );
    return { data: asListResponse(result) };
  });
}
export function saveMappings(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'saveMappings', async ({ input, params, body, context }) => {
    const payload = asRecord(body);
    const changes = Array.isArray(payload.changes)
      ? payload.changes.map(entry => {
          const change = asRecord(entry);
          return {
            op: change.op === 'remove' ? ('remove' as const) : ('add' as const),
            localEntryId: String(change.localEntryId ?? ''),
            figshareCategoryId: String(change.figshareCategoryId ?? ''),
            matchType: change.matchType == null ? undefined : String(change.matchType),
            status: change.status == null ? undefined : (String(change.status) as 'proposed' | 'approved' | 'rejected'),
          };
        })
      : [];
    const crosswalk = await input.vocabulary.saveMappings(
      String(params.id ?? ''),
      { revision: Number(payload.revision), changes },
      context
    );
    return { data: crosswalk };
  });
}
export function approve(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'approve', async ({ input, params, body, context }) => {
    const payload = asRecord(body);
    const crosswalk = await input.vocabulary.approveCrosswalk(
      String(params.id ?? ''),
      Number(payload.revision),
      context
    );
    return { data: crosswalk };
  });
}
export function deleteCrosswalk(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'delete', async ({ input, params, context }) => {
    await input.vocabulary.deleteCrosswalk(String(params.id ?? ''), context);
    return { status: 204 };
  });
}
export function listCatalogues(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'listCatalogues', async ({ input, query, context }) => {
    const taxonomies = await input.vocabulary.discoverTaxonomies(
      { scope: String(query.scope ?? '') as FigshareCategoryScope },
      context
    );
    return { data: taxonomies };
  });
}
export function listSources(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'listSources', async ({ input, query, paging, context }) => {
    const result = await input.vocabulary.listSources(
      {
        q: query.q as string | undefined,
        scope: query.scope as string | undefined,
        limit: paging.limit,
        offset: paging.offset,
      },
      context
    );
    return { data: asListResponse(result) };
  });
}
export function getSource(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'getSource', async ({ input, params, context }) => {
    const source = await input.vocabulary.getSource(String(params.sourceId ?? ''), context);
    return { data: source };
  });
}
export function listSourceCategories(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'listSourceCategories', async ({ input, params, query, paging, context }) => {
    const result = await input.vocabulary.listSourceCategories(
      String(params.sourceId ?? ''),
      {
        q: query.q as string | undefined,
        includeHistorical: String(query.includeHistorical ?? '') === 'true',
        selectableOnly: String(query.selectableOnly ?? '') === 'true',
        limit: paging.limit,
        offset: paging.offset,
      },
      context
    );
    return { data: asListResponse(result) };
  });
}
export function createSourcePreview(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'createSourcePreview', async ({ input, params, body, context }) => {
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
        localVocabularyId: payload.localVocabularyId == null ? undefined : String(payload.localVocabularyId),
      },
      actor
    );
    return { status: 201, data: preview };
  });
}
export function cloneSource(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'cloneSource', async ({ input, params, body, context }) => {
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
  });
}
export function listSyncRuns(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'listSyncRuns', async ({ input, query, paging, context }) => {
    const result = await input.vocabulary.listSyncRuns(
      {
        sourceId: query.sourceId as string | undefined,
        limit: paging.limit,
        offset: paging.offset,
      },
      context
    );
    return { data: asListResponse(result) };
  });
}
export function createPreview(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'createPreview', async ({ input, body, context }) => {
    const payload = asRecord(body);
    const preview = await input.vocabulary.createPreview(
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
      context
    );
    return { status: 201, data: preview };
  });
}
export function getPreview(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'getPreview', async ({ input, params, query, paging, context }) => {
    const preview = await input.vocabulary.getPreview(
      String(params.runId ?? ''),
      {
        view: query.view === 'diff' ? 'diff' : 'proposals',
        changeClass: query.changeClass as string | undefined,
        matchType: query.matchType as string | undefined,
        q: query.q as string | undefined,
        unresolvedOnly: String(query.unresolvedOnly ?? '') === 'true',
        historicalOnly: String(query.historicalOnly ?? '') === 'true',
        limit: paging.limit,
        offset: paging.offset,
      },
      context
    );
    return { data: preview };
  });
}
export function applyPreview(
  input: FigshareAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'applyPreview', async ({ input, params, body, context }) => {
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
  });
}
