import type { Services as Users } from '../../identity/Users';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import { toBoolean } from '@researchdatabox/sails-ng-common';
import type { Services as Vocabulary } from '../../vocabulary/Vocabulary';
import type { Services as FormVocabulary } from '../../vocabulary/FormVocabulary';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { referenceErrors, type ReferenceRequest, type ReferenceResult } from './reference';
import { apiNoCacheHeaders, safeApiVersion } from '../apiResponses';
import { jsonResult, referenceValue } from './reference';
export interface FormVocabularyInput {
  readonly vocabulary: Pick<
    Vocabulary.VocabularyService,
    'getByIdOrSlug' | 'getEntries' | 'getChildren' | 'expandPaths'
  >;
  readonly lookups: Pick<
    FormVocabulary.FormVocabulary,
    'findRecords' | 'findInExternalService' | 'findInServiceLookup'
  >;
  readonly users: Pick<Users.Users, 'findUsersWithName'>;
  readonly log: ILogger;
}
class VocabularyLookupError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
function text(value: unknown, fallback = ''): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > 8192) throw new VocabularyLookupError(400, 'invalid-query-params');
  return value;
}
function integer(value: unknown, fallback: number, minimum = 0): number {
  if (value === undefined || value === '') return fallback;
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > 1000000)
    throw new VocabularyLookupError(400, 'invalid-query-params');
  return parsed;
}

export function formVocabularyPrelude(req: ReferenceRequest) {
  const { actor, brand } = req.context;
  if (!actor) throw new VocabularyLookupError(401, 'Authentication required');
  if (!actor.roles.some(r => r.brandId === brand.id)) throw new VocabularyLookupError(403, 'Access Denied');
  const body = req.body ?? {};
  if (typeof body !== 'object' || Array.isArray(body)) throw new VocabularyLookupError(400, 'invalid-query-params');
}
export function formVocabularyFailure(
  input: { readonly log: Pick<ILogger, 'error'> },
  req: ReferenceRequest,
  error: unknown,
  action: string
): ReferenceResult {
  input.log.error('Form vocabulary lookup failed');
  const known = new Set([
    'query-vocab-not-configured',
    'service-lookup-not-configured',
    'external-vocab-not-configured',
    'query-vocab-invalid-config',
    'service-lookup-invalid-target',
    'service-lookup-invalid-response',
    'external-vocab-invalid-config',
  ]);
  const domainCode = error instanceof Error && 'code' in error ? String(error.code) : undefined;
  const code =
    error instanceof VocabularyLookupError
      ? error.message
      : domainCode && known.has(domainCode)
        ? domainCode
        : domainCode === 'invalid-parent-id' && action === 'children'
          ? domainCode
          : ((
              {
                get: 'vocabulary-service-error',
                entries: 'internal-server-error',
                children: 'vocabulary-children-failed',
                expandPath: 'vocabulary-expand-path-failed',
                getRecords: 'query-vocab-failed',
                externalEntries: 'query-vocab-failed',
                serviceEntries: 'query-vocab-failed',
              } as Record<string, string>
            )[action] ?? 'vocabulary-lookup-failed');
  const status =
    error instanceof VocabularyLookupError
      ? error.status
      : code === 'invalid-parent-id'
        ? 400
        : code.endsWith('-not-configured')
          ? 404
          : 500;
  return referenceErrors(req, status, [
    { code, title: code, detail: status < 500 ? code : 'Vocabulary lookup failed' },
  ]);
}
type Ready = {
  input: FormVocabularyInput;
  req: ReferenceRequest;
  body: Record<string, unknown>;
  q: Record<string, unknown>;
  id: string;
  brand: ReferenceRequest['context']['brand'];
  portal: string | undefined;
  user: Record<string, unknown>;
};
async function lookup(
  input: FormVocabularyInput,
  req: ReferenceRequest,
  run: (ready: Ready) => Promise<{ data: unknown; meta?: unknown }>
): Promise<ReferenceResult> {
  formVocabularyPrelude(req);
  const { actor, brand, portal } = req.context;
  const body = (req.body ?? {}) as Record<string, unknown>,
    q = req.query,
    id = text(req.params.vocabIdOrSlug);
  const user = { ...actor!, roles: actor!.roles.map(role => ({ ...role, branding: { id: role.brandId } })) };
  const { data, meta = {} } = await run({ input, req, body, q, id, brand, portal, user });
  return jsonResult(safeApiVersion(req) === '2.0' ? { data, meta } : data, 200, apiNoCacheHeaders);
}
export function get(input: FormVocabularyInput, req: ReferenceRequest): Promise<ReferenceResult> {
  return lookup(input, req, async ({ input, id, brand }) => {
    const v = await input.vocabulary.getByIdOrSlug(brand.id, id);
    if (!v) throw new VocabularyLookupError(404, 'vocabulary-not-found');
    const data = { id: v.id, name: v.name, slug: v.slug };
    return { data };
  });
}
export function entries(input: FormVocabularyInput, req: ReferenceRequest): Promise<ReferenceResult> {
  return lookup(input, req, async ({ input, q, id, brand }) => {
    const result = await input.vocabulary.getEntries(brand.id, id, {
      search: text(q.search),
      limit: integer(q.limit, 200, 1),
      offset: integer(q.offset, 0),
      includeHistoricalValues: toBoolean(text(q.includeHistoricalValues)),
    });
    if (!result) throw new VocabularyLookupError(404, 'vocabulary-not-found');
    const data = result.entries;
    const meta = result.meta;
    return { data, meta };
  });
}
export function children(input: FormVocabularyInput, req: ReferenceRequest): Promise<ReferenceResult> {
  return lookup(input, req, async ({ input, q, id, brand }) => {
    const result = await input.vocabulary.getChildren(brand.id, id, text(q.parentId) || null);
    if (!result) throw new VocabularyLookupError(404, 'vocabulary-not-found');
    const data = result.entries;
    const meta = result.meta;
    return { data, meta };
  });
}
export function expandPath(input: FormVocabularyInput, req: ReferenceRequest): Promise<ReferenceResult> {
  return lookup(input, req, async ({ input, q, id, brand }) => {
    const raw = q.notation;
    const notations = Array.from(
      new Set(
        (Array.isArray(raw) ? raw : [raw])
          .flatMap(value => text(value).split(','))
          .map(value => value.trim())
          .filter(Boolean)
      )
    );
    if (!notations.length) throw new VocabularyLookupError(400, 'invalid-query-params');
    if (notations.length > 100) throw new VocabularyLookupError(400, 'too-many-notations');
    const result = await input.vocabulary.expandPaths(brand.id, id, notations);
    if (!result) throw new VocabularyLookupError(404, 'vocabulary-not-found');
    const data = result.paths;
    const meta = result.meta;
    return { data, meta };
  });
}
export function getRecords(input: FormVocabularyInput, req: ReferenceRequest): Promise<ReferenceResult> {
  return lookup(input, req, async ({ input, req, q, brand, user }) => {
    const data = await input.lookups.findRecords(
      text(req.params.queryId),
      Object.assign(new BrandingModel(), brand),
      text(q.search),
      integer(q.start, 0),
      integer(q.rows, 25, 1),
      user
    );
    return { data };
  });
}
export function externalEntries(input: FormVocabularyInput, req: ReferenceRequest): Promise<ReferenceResult> {
  return lookup(input, req, async ({ input, req, body }) => {
    if (
      body.options !== undefined &&
      (!body.options || typeof body.options !== 'object' || Array.isArray(body.options))
    )
      throw new VocabularyLookupError(400, 'invalid-query-params');
    const data = await input.lookups.findInExternalService(text(req.params.provider), {
      options: (body.options as Record<string, unknown>) ?? {},
      postBody: body.postBody,
    });
    return { data };
  });
}
export function serviceEntries(input: FormVocabularyInput, req: ReferenceRequest): Promise<ReferenceResult> {
  return lookup(input, req, async ({ input, req, body, q, brand, portal, user }) => {
    const result = await input.lookups.findInServiceLookup(text(req.params.serviceId), {
      search: text(body.search ?? q.search),
      start: integer(body.start ?? q.start, 0),
      rows: integer(body.rows ?? q.rows, 25, 1),
      branding: brand.name ?? '',
      portal: portal ?? '',
      brand: Object.assign(new BrandingModel(), brand),
      user,
    });
    const data = result.data;
    const meta = result.meta;
    return { data, meta };
  });
}
export function find(input: FormVocabularyInput, req: ReferenceRequest): Promise<ReferenceResult> {
  return lookup(input, req, async ({ input, q, brand }) => {
    const users = await referenceValue(input.users.findUsersWithName(text(q.name), brand.id, text(q.source) || null));
    const data = users.map(u => ({ name: u.name, id: u.id, username: u.username }));
    return { data };
  });
}
