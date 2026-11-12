import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Vocabulary } from '../../vocabulary/Vocabulary';
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
import type { AuthenticatedActor } from '../context';
type Contract = Pick<ApiRouteDefinition, 'request'>;
import { apiNoCacheHeaders } from '../apiResponses';
export interface VocabularyAdministrationInput {
  readonly vocabulary: Pick<
    Vocabulary.VocabularyService,
    'list' | 'getById' | 'getTree' | 'create' | 'update' | 'reorderEntries' | 'delete'
  >;
  audit(
    actor: { id: string; username: string },
    action: string,
    context: { brandId: string; vocabularyId: string }
  ): Promise<unknown>;
  readonly log: ILogger;
}
class VocabularyRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
function sanitizeEntries(raw: unknown): Vocabulary.VocabularyEntryInput[] {
  if (!Array.isArray(raw)) throw new VocabularyRequestError(400, 'entries must be an array');
  return raw.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new VocabularyRequestError(400, 'Every vocabulary entry must be an object');
    const entry = value as Record<string, unknown>;
    const sanitized: Partial<Vocabulary.VocabularyEntryInput> = {};
    for (const key of ['id', 'parent', 'label', 'value', 'identifier'] as const) {
      if (entry[key] !== undefined && entry[key] !== null) sanitized[key] = String(entry[key]).trim();
    }
    if (entry.order !== undefined) {
      const order = Number.parseInt(String(entry.order), 10);
      if (!Number.isInteger(order) || order < 0)
        throw new VocabularyRequestError(400, 'Entry order must be a non-negative integer');
      sanitized.order = order;
    }
    if (entry.historical !== undefined) {
      if (typeof entry.historical !== 'boolean')
        throw new VocabularyRequestError(400, 'Entry historical must be a boolean');
      sanitized.historical = entry.historical;
    }
    if (entry.children !== undefined) sanitized.children = sanitizeEntries(entry.children);
    return sanitized as Vocabulary.VocabularyEntryInput;
  });
}

export function vocabularyAdministrationFailure(
  input: Pick<VocabularyAdministrationInput, 'log'>,
  req: ReferenceRequest,
  error: unknown,
  browser = false
): ReferenceResult {
  input.log.error('Vocabulary request failed');
  return referenceErrors(
    req,
    error instanceof VocabularyRequestError
      ? error.status
      : browser || req.method === 'GET' || req.method === 'HEAD'
        ? 500
        : 400,
    [
      {
        detail:
          error instanceof VocabularyRequestError
            ? error.message
            : 'Vocabulary operation failed. Review current state before retrying.',
      },
    ]
  );
}
type Ready = {
  input: VocabularyAdministrationInput;
  req: ReferenceRequest;
  id: string;
  body: Record<string, unknown>;
  query: Record<string, unknown>;
  brand: ReferenceRequest['context']['brand'];
  actor: AuthenticatedActor;
};
async function administer(
  input: VocabularyAdministrationInput,
  req: ReferenceRequest,
  contract: Contract,
  action: string,
  run: (ready: Ready) => Promise<{ data?: unknown; status?: number }>
): Promise<ReferenceResult> {
  const refusal = integrationAdministratorPrelude(req);
  if (refusal) {
    input.log.error('Vocabulary request failed');
    return refusal;
  }
  const validated = validateApiRouteRequest(req, contract);
  if (!validated.valid) return referenceValidationErrors(req, validated.issues);
  const { actor, brand } = req.context;
  const id = String(validated.params.id ?? '');
  if (id) {
    const vocabulary = await input.vocabulary.getById(id);
    if (!vocabulary || vocabulary.branding !== brand.id) throw new VocabularyRequestError(404, 'Vocabulary not found');
  }
  const body = { ...((validated.body as Record<string, unknown>) ?? {}) };
  if (body.entries !== undefined) body.entries = sanitizeEntries(body.entries);
  const result = await run({ input, req, id, body, query: validated.query, brand, actor: actor! });
  if (req.method !== 'GET' && req.method !== 'HEAD')
    await input.audit(actor!, action + '-vocabulary', {
      brandId: brand.id,
      vocabularyId: id || String((result.data as { id?: string })?.id ?? ''),
    });
  return result.status === 204
    ? { kind: 'empty', status: 204, headers: apiNoCacheHeaders, body: undefined }
    : { ...referenceData(req, result.data), status: result.status ?? 200 };
}
export function list(
  input: VocabularyAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'list', async ({ input, req, query, brand }) => {
    const q = query;
    const offset = q.offset === undefined ? 0 : Number(q.offset),
      limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new VocabularyRequestError(400, 'Invalid pagination');
    const result = await input.vocabulary.list({ ...q, branding: brand.id, offset, limit });
    const data = {
      summary: {
        numFound: result.meta.total,
        start: result.meta.offset,
        page: result.meta.limit > 0 ? Math.floor(result.meta.offset / result.meta.limit) + 1 : 1,
      },
      records: result.data,
    };
    return { data };
  });
}
export function get(
  input: VocabularyAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'get', async ({ input, id }) => {
    const data = { vocabulary: await input.vocabulary.getById(id), entries: await input.vocabulary.getTree(id) };
    return { data };
  });
}
export function create(
  input: VocabularyAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'create', async ({ input, body, brand }) => {
    if (typeof body.name !== 'string' || !body.name.trim())
      throw new VocabularyRequestError(400, 'Vocabulary name is required');
    const data = await input.vocabulary.create({
      ...body,
      name: body.name,
      branding: brand.id,
    } as Vocabulary.VocabularyInput);
    return { data, status: 201 };
  });
}
export function update(
  input: VocabularyAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'update', async ({ input, id, body, brand }) => {
    const data = await input.vocabulary.update(id, { ...body, branding: brand.id });
    return { data };
  });
}
export function reorder(
  input: VocabularyAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'reorder', async ({ input, id, body }) => {
    if (!Array.isArray(body.entryOrders)) throw new VocabularyRequestError(400, 'entryOrders must be an array');
    const orders: { id: string; order: number }[] = [];
    for (const item of body.entryOrders) {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.id !== 'string' ||
        !Number.isSafeInteger(item.order) ||
        item.order < 0
      )
        throw new VocabularyRequestError(400, 'Invalid entry order');
      orders.push({ id: item.id, order: item.order });
    }
    const data = { updated: await input.vocabulary.reorderEntries(id, orders) };
    return { data };
  });
}
export function deleteVocabulary(
  input: VocabularyAdministrationInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'delete', async ({ input, id }) => {
    await input.vocabulary.delete(id);
    return { status: 204 };
  });
}
