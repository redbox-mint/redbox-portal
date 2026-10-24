import type { RequestHandler, Router } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Rva } from '../../vocabulary/RvaImport';
import type { Services as Vocabulary } from '../../vocabulary/Vocabulary';
import { importVocabularyRoute, syncVocabularyRoute } from '../../api-routes/groups/vocabulary';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, requestContext, resolveEffectivePolicies } from './policies';
import { httpAction, recordHttpFailure } from './middleware';
import { sendApiData, sendApiErrors, validationApiVersion } from './responses';

export const vocabularyIntegrationRoutes = [
  importVocabularyRoute,
  syncVocabularyRoute,
  ...[importVocabularyRoute, syncVocabularyRoute].map(route => ({
    ...route,
    path: route.path.replace('/api/', '/admin/'),
    controller: 'VocabularyController',
  })),
];
export interface VocabularyIntegrationHttpInput {
  readonly rva: Pick<Rva.RvaImport, 'importRvaVocabulary' | 'syncRvaVocabulary'>;
  readonly vocabulary: Pick<Vocabulary.VocabularyService, 'getById'>;
  audit(
    actor: { id: string; username: string },
    action: string,
    context: { brandId: string; vocabularyId: string }
  ): Promise<unknown>;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly log: ILogger;
}
/** Provider requests are admitted only after authentication, tenant/role and owned CSRF checks. */
export function mountVocabularyIntegrationRoutes(router: Router, input: VocabularyIntegrationHttpInput): void {
  for (const route of vocabularyIntegrationRoutes)
    router.post(
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      route.path.includes('/api/') ? input.csrf.apiProtect : input.csrf.protect,
      httpAction(async (req, res) => {
        const { actor, brand } = requestContext(req);
        if (!actor) {
          sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
          return;
        }
        if (!actor.roles.some(role => role.brandId === brand.id && role.name === 'Admin')) {
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
        const body = validated.body as { rvaId?: string; versionId?: string };
        if (
          (route.action === 'import' && !body.rvaId?.trim()) ||
          (body.versionId !== undefined && !/^\d+$/.test(body.versionId))
        ) {
          sendApiErrors(req, res, 400, [{ detail: 'Invalid RVA vocabulary or version id' }]);
          return;
        }
        try {
          const id = validated.params.id as string | undefined;
          if (id) {
            const vocabulary = await input.vocabulary.getById(id);
            if (!vocabulary || vocabulary.branding !== brand.id) {
              sendApiErrors(req, res, 404, [{ detail: 'Vocabulary not found' }]);
              return;
            }
          }
          const result = id
            ? await input.rva.syncRvaVocabulary(id, body.versionId)
            : await input.rva.importRvaVocabulary(body.rvaId!, body.versionId, brand.id);
          const vocabularyId = id ?? String(Reflect.get(result, 'id'));
          await input.audit(actor, route.action === 'import' ? 'import-vocabulary' : 'sync-vocabulary', {
            brandId: brand.id,
            vocabularyId,
          });
          sendApiData(req, res, result);
        } catch {
          recordHttpFailure(req, input.log, 'Vocabulary import or sync failed');
          // Existing provider errors are 400; keep credentials and native database details private.
          sendApiErrors(req, res, 400, [
            {
              detail:
                'Vocabulary import or sync failed. Earlier steps may have applied; retry after reviewing the vocabulary.',
            },
          ]);
        }
      })
    );
}
