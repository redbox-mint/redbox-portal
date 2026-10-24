import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Vocabulary } from '../../vocabulary/Vocabulary';
import type { Services as FormVocabulary } from '../../vocabulary/FormVocabulary';
import type { Services as Users } from '../../identity/Users';
import { BrandingModel } from '../../model/storage/BrandingModel';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction, singleHttpResult } from './middleware';
import { apiVersion, apiNoCacheHeaders, sendApiErrors } from './responses';
const definitions = [
  ['get', '/vocab/:vocabIdOrSlug', 'get'],
  ['get', '/vocab/:vocabIdOrSlug/entries', 'entries'],
  ['get', '/vocab/:vocabIdOrSlug/children', 'children'],
  ['get', '/vocab/:vocabIdOrSlug/expandPath', 'expandPath'],
  ['get', '/query/vocab/:queryId', 'getRecords'],
  ['post', '/external/vocab/:provider', 'externalEntries'],
  ['post', '/service/vocab/:serviceId', 'serviceEntries'],
] as const;
export const formVocabularyRoutes = [
  ...definitions.map(([method, path, action]) => ({
    method,
    path: '/:branding/:portal' + path,
    controller: 'FormVocabularyController',
    action,
  })),
  { method: 'get' as const, path: '/:branding/:portal/user/find', controller: 'UserController', action: 'find' },
];
export interface FormVocabularyHttpInput {
  readonly vocabulary: Pick<
    Vocabulary.VocabularyService,
    'getByIdOrSlug' | 'getEntries' | 'getChildren' | 'expandPaths'
  >;
  readonly lookups: Pick<
    FormVocabulary.FormVocabulary,
    'findRecords' | 'findInExternalService' | 'findInServiceLookup'
  >;
  readonly users: Pick<Users.Users, 'findUsersWithName'>;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
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
export function mountFormVocabularyRoutes(router: Router, input: FormVocabularyHttpInput): void {
  const bindings = formVocabularyRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router[route.method](
      route.path,
      ...policies,
      ...(route.method === 'post' ? [input.csrf.protect] : []),
      httpAction(async (req, res) => {
        try {
          const { actor, brand, portal } = requestContext(req);
          if (!actor) throw new VocabularyLookupError(401, 'Authentication required');
          if (!actor.roles.some(r => r.brandId === brand.id)) throw new VocabularyLookupError(403, 'Access Denied');
          const body: Record<string, unknown> = req.body ?? {};
          if (typeof body !== 'object' || Array.isArray(body))
            throw new VocabularyLookupError(400, 'invalid-query-params');
          const q = req.query,
            id = text(req.params.vocabIdOrSlug);
          const user = { ...actor, roles: actor.roles.map(role => ({ ...role, branding: { id: role.brandId } })) };
          let data: unknown,
            meta: unknown = {};
          switch (route.action) {
            case 'get': {
              const v = await input.vocabulary.getByIdOrSlug(brand.id, id);
              if (!v) throw new VocabularyLookupError(404, 'vocabulary-not-found');
              data = { id: v.id, name: v.name, slug: v.slug };
              break;
            }
            case 'entries': {
              const result = await input.vocabulary.getEntries(brand.id, id, {
                search: text(q.search),
                limit: integer(q.limit, 200, 1),
                offset: integer(q.offset, 0),
                includeHistoricalValues: text(q.includeHistoricalValues) === 'true',
              });
              if (!result) throw new VocabularyLookupError(404, 'vocabulary-not-found');
              data = result.entries;
              meta = result.meta;
              break;
            }
            case 'children': {
              const result = await input.vocabulary.getChildren(brand.id, id, text(q.parentId) || null);
              if (!result) throw new VocabularyLookupError(404, 'vocabulary-not-found');
              data = result.entries;
              meta = result.meta;
              break;
            }
            case 'expandPath': {
              const raw = q.notation;
              const notations = (Array.isArray(raw) ? raw.map(v => text(v)) : text(raw).split(','))
                .map(v => v.trim())
                .filter(Boolean);
              if (!notations.length) throw new VocabularyLookupError(400, 'invalid-query-params');
              if (notations.length > 100) throw new VocabularyLookupError(400, 'too-many-notations');
              const result = await input.vocabulary.expandPaths(brand.id, id, notations);
              if (!result) throw new VocabularyLookupError(404, 'vocabulary-not-found');
              data = result.paths;
              meta = result.meta;
              break;
            }
            case 'getRecords':
              data = await input.lookups.findRecords(
                text(req.params.queryId),
                Object.assign(new BrandingModel(), brand),
                text(q.search),
                integer(q.start, 0),
                integer(q.rows, 25, 1),
                user
              );
              break;
            case 'externalEntries': {
              if (
                body.options !== undefined &&
                (!body.options || typeof body.options !== 'object' || Array.isArray(body.options))
              )
                throw new VocabularyLookupError(400, 'invalid-query-params');
              data = await input.lookups.findInExternalService(text(req.params.provider), {
                options: (body.options as Record<string, unknown>) ?? {},
                postBody: body.postBody,
              });
              break;
            }
            case 'serviceEntries': {
              const result = await input.lookups.findInServiceLookup(text(req.params.serviceId), {
                search: text(body.search ?? q.search),
                start: integer(body.start ?? q.start, 0),
                rows: integer(body.rows ?? q.rows, 25, 1),
                branding: brand.name ?? '',
                portal: portal ?? '',
                brand: Object.assign(new BrandingModel(), brand),
                user,
              });
              data = result.data;
              meta = result.meta;
              break;
            }
            case 'find': {
              const users = await singleHttpResult(
                input.users.findUsersWithName(text(q.name), brand.id, text(q.source) || null)
              );
              data = users.map(u => ({ name: u.name, id: u.id, username: u.username }));
              break;
            }
          }
          res.set(apiNoCacheHeaders).json(apiVersion(req) === '2.0' ? { data, meta } : data);
        } catch (error) {
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
                : domainCode === 'invalid-parent-id' && route.action === 'children'
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
                    )[route.action] ?? 'vocabulary-lookup-failed');
          const status =
            error instanceof VocabularyLookupError
              ? error.status
              : code === 'invalid-parent-id'
                ? 400
                : code.endsWith('-not-configured')
                  ? 404
                  : 500;
          sendApiErrors(req, res, status, [
            { code, title: code, detail: status < 500 ? code : 'Vocabulary lookup failed' },
          ]);
        }
      })
    );
}
