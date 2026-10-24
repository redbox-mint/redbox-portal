import { RequestChronicleHelper } from '../../utilities/RequestChronicle';
import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Branding } from '../../branding/Branding';
import { mapBrandingError } from '../../branding/HttpErrors';
import { brandingApiRoutes, brandingPreviewRoute } from '../../api-routes/groups/branding';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { apiNoCacheHeaders, apiVersion, sendApiData, sendApiErrors, validationApiVersion } from './responses';

const api = brandingApiRoutes.filter(r => !['uploadFace', 'logo', 'favicon'].includes(r.action));
export const brandingOperationRoutes = [
  ...api,
  ...api
    .filter(r => r.action !== 'history')
    .map(r => ({
      ...r,
      path: r.path.replace('/api/branding/', '/app/branding/'),
      controller: 'BrandingAppController',
    })),
  {
    ...brandingPreviewRoute,
    path: '/:branding/:portal/preview',
    controller: 'BrandingController',
    action: 'createPreview',
  },
];
export interface BrandingOperationsHttpInput {
  readonly branding: Pick<
    Branding.Branding,
    | 'getAdminState'
    | 'listVersions'
    | 'saveDraft'
    | 'removeTypefaceFace'
    | 'useDefaultTypography'
    | 'revertTypefaceDraft'
    | 'preview'
    | 'previewVersion'
    | 'publish'
    | 'restore'
  >;
  audit(actor: { id: string; username: string }, action: string, context: { brandId: string }): Promise<unknown>;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect' | 'protect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
  readonly log: ILogger;
}
export function mountBrandingOperationRoutes(router: Router, input: BrandingOperationsHttpInput): void {
  const bindings = brandingOperationRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router[route.method](
      route.path,
      ...policies,
      ...(route.method === 'get' ? [] : [route.path.includes('/api/') ? input.csrf.apiProtect : input.csrf.protect]),
      httpAction(async (req, res) => {
        const { actor, brand, portal } = requestContext(req);
        if (!actor) {
          sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
          return;
        }
        if (!actor.roles.some(r => r.brandId === brand.id && r.name === 'Admin')) {
          sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
          return;
        }
        // The legacy read-only preview alias has no revision argument. Resolve
        // its current draft only after the owning administrator has authorized.
        const previewAlias =
          route.action === 'createPreview' &&
          (req.body === undefined || (req.body !== null && typeof req.body === 'object' && !Array.isArray(req.body)));
        const validated = validateApiRouteRequest(
          previewAlias
            ? {
                params: req.params,
                query: req.query,
                headers: req.headers,
                body: {
                  expectedDraftRevision: (await input.branding.getAdminState(brand.name ?? '')).draft.revision,
                  ...req.body,
                },
              }
            : req,
          route
        );
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
        const body = (validated.body ?? {}) as Record<string, unknown>;
        const branding = brand.name ?? '',
          versionId = String(validated.params.versionId ?? '');
        const expectedDraftRevision = body.expectedDraftRevision as number | undefined;
        const expectedVersion = body.expectedVersion as number | undefined;
        try {
          let data: unknown;
          switch (route.action) {
            case 'config':
              data = await input.branding.getAdminState(branding);
              break;
            case 'versions':
            case 'history':
              data = await input.branding.listVersions(branding);
              break;
            case 'draft':
              data = await input.branding.saveDraft({
                branding,
                variables: (body.variables ?? {}) as Record<string, string>,
                expectedDraftRevision,
                actor,
              });
              break;
            case 'deleteFace':
              data = await input.branding.removeTypefaceFace({
                branding,
                slot: String(validated.params.slot),
                expectedDraftRevision,
                actor,
              });
              break;
            case 'useDefault':
              data = await input.branding.useDefaultTypography({ branding, expectedDraftRevision, actor });
              break;
            case 'revert':
              data = await input.branding.revertTypefaceDraft({ branding, expectedDraftRevision, actor });
              break;
            case 'preview':
            case 'versionPreview':
            case 'createPreview': {
              const preview =
                route.action === 'versionPreview'
                  ? await input.branding.previewVersion({ branding, portal: portal ?? '', versionId })
                  : await input.branding.preview(
                      branding,
                      portal ?? '',
                      expectedDraftRevision ??
                        (route.action === 'createPreview'
                          ? (await input.branding.getAdminState(branding)).draft.revision
                          : undefined)
                    );
              RequestChronicleHelper.existing(req)?.addInfo({ brandingAppPreviewCreated: true });
              data =
                route.action === 'createPreview'
                  ? preview
                  : { ...preview, previewToken: preview.token, previewUrl: preview.url };
              break;
            }
            case 'publish':
            case 'restore':
            case 'rollback': {
              const result =
                route.action === 'publish'
                  ? await input.branding.publish(branding, portal ?? '', actor, {
                      expectedVersion,
                      expectedDraftRevision,
                    })
                  : await input.branding.restore({
                      branding,
                      versionId,
                      expectedVersion,
                      expectedDraftRevision,
                      actor,
                    });
              data = {
                ...result.state,
                version: result.version,
                hash: result.hash,
                ...('idempotent' in result && result.idempotent ? { idempotent: true } : {}),
              };
              if (route.action === 'rollback') res.set('Deprecation', 'true');
              break;
            }
          }
          if (route.method !== 'get') await input.audit(actor, 'branding-' + route.action, { brandId: brand.id });
          sendApiData(req, res, data);
        } catch (error) {
          const mapped = mapBrandingError(error);
          input.log.error('Branding operation failed: ' + mapped.code);
          const detail =
            mapped.status < 500 ? mapped.detail : 'Branding operation failed. Review current state before retrying.';
          res
            .set(apiNoCacheHeaders)
            .status(mapped.status)
            .json(
              apiVersion(req) === '2.0'
                ? {
                    errors: [{ code: mapped.code, detail }],
                    ...(mapped.current ? { data: { current: mapped.current } } : {}),
                    meta: {},
                  }
                : {
                    message: mapped.code,
                    details: detail ?? '',
                    ...(mapped.current ? { current: mapped.current } : {}),
                  }
            );
        }
      })
    );
}
