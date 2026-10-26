import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Vocabulary } from '../../vocabulary/Vocabulary';
import { vocabularyApiRoutes } from '../../api-routes/groups/vocabulary';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { sendApiData, sendApiErrors, apiNoCacheHeaders, sendApiValidationErrors } from './responses';
const apiRoutes = vocabularyApiRoutes.filter(r => !['import', 'sync'].includes(r.action));
export const vocabularyAdministrationRoutes = [
  ...apiRoutes,
  ...apiRoutes
    .filter(r => r.action !== 'reorder')
    .map(r => ({ ...r, path: r.path.replace('/api/', '/admin/'), controller: 'VocabularyController' })),
];
export interface VocabularyAdministrationHttpInput {
  readonly vocabulary: Pick<
    Vocabulary.VocabularyService,
    'list' | 'getById' | 'getTree' | 'create' | 'update' | 'reorderEntries' | 'delete'
  >;
  audit(
    actor: { id: string; username: string },
    action: string,
    context: { brandId: string; vocabularyId: string }
  ): Promise<unknown>;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
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
export function mountVocabularyAdministrationRoutes(router: Router, input: VocabularyAdministrationHttpInput): void {
  const bindings = vocabularyAdministrationRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router[route.method](
      route.path,
      ...policies,
      ...(route.method === 'get' ? [] : [route.path.includes('/api/') ? input.csrf.apiProtect : input.csrf.protect]),
      httpAction(async (req, res) => {
        try {
          const { actor, brand } = requestContext(req);
          if (!actor) throw new VocabularyRequestError(401, 'Authentication required');
          if (!actor.roles.some(r => r.brandId === brand.id && r.name === 'Admin'))
            throw new VocabularyRequestError(403, 'Access Denied');
          const validated = validateApiRouteRequest(req, route);
          if (!validated.valid) {
            sendApiValidationErrors(req, res, validated.issues);
            return;
          }
          const id = String(validated.params.id ?? '');
          if (id) {
            const vocabulary = await input.vocabulary.getById(id);
            if (!vocabulary || vocabulary.branding !== brand.id)
              throw new VocabularyRequestError(404, 'Vocabulary not found');
          }
          const body = (validated.body as Record<string, unknown>) ?? {};
          let data: unknown,
            status = 200;
          switch (route.action) {
            case 'list': {
              const q = validated.query;
              const offset = q.offset === undefined ? 0 : Number(q.offset),
                limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
              if (
                !Number.isSafeInteger(offset) ||
                offset < 0 ||
                !Number.isSafeInteger(limit) ||
                limit < 1 ||
                limit > 1000
              )
                throw new VocabularyRequestError(400, 'Invalid pagination');
              const result = await input.vocabulary.list({ ...q, branding: brand.id, offset, limit });
              data = {
                summary: {
                  numFound: result.meta.total,
                  start: result.meta.offset,
                  page: result.meta.limit > 0 ? Math.floor(result.meta.offset / result.meta.limit) + 1 : 1,
                },
                records: result.data,
              };
              break;
            }
            case 'get':
              data = { vocabulary: await input.vocabulary.getById(id), entries: await input.vocabulary.getTree(id) };
              break;
            case 'create':
              if (typeof body.name !== 'string' || !body.name.trim())
                throw new VocabularyRequestError(400, 'Vocabulary name is required');
              data = await input.vocabulary.create({
                ...body,
                name: body.name,
                branding: brand.id,
              } as Vocabulary.VocabularyInput);
              status = 201;
              break;
            case 'update':
              data = await input.vocabulary.update(id, { ...body, branding: brand.id });
              break;
            case 'reorder': {
              if (!Array.isArray(body.entryOrders))
                throw new VocabularyRequestError(400, 'entryOrders must be an array');
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
              data = { updated: await input.vocabulary.reorderEntries(id, orders) };
              break;
            }
            case 'delete':
              await input.vocabulary.delete(id);
              status = 204;
              break;
          }
          if (route.method !== 'get')
            await input.audit(actor, route.action + '-vocabulary', {
              brandId: brand.id,
              vocabularyId: id || String((data as { id?: string })?.id ?? ''),
            });
          if (status === 204) res.set(apiNoCacheHeaders).status(204).end();
          else sendApiData(req, res, data, status);
        } catch (error) {
          input.log.error('Vocabulary request failed');
          sendApiErrors(
            req,
            res,
            error instanceof VocabularyRequestError
              ? error.status
              : route.controller === 'VocabularyController' || route.method === 'get'
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
      })
    );
}
