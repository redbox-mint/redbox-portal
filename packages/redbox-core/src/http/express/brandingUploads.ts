import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Branding } from '../../branding/Branding';
import type { Services as Logo } from '../../branding/BrandingLogo';
import type { Services as Disks } from '../../storage/StorageManager';
import { mapBrandingError } from '../../branding/HttpErrors';
import { brandingFaceUploadRoute, brandingLogoRoute, brandingFaviconRoute } from '../../api-routes/groups/branding';
import { validateApiRouteRequest, validateApiRouteFiles } from '../../api-routes/validation';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { sendApiData, sendApiErrors } from './responses';
import { StreamingMultipart, MultipartError } from './multipart';
const api = [brandingFaceUploadRoute, brandingLogoRoute, brandingFaviconRoute];
export const brandingUploadRoutes = [
  ...api,
  ...api.map(r => ({
    ...r,
    path: r.path.replace('/api/branding/', '/app/branding/'),
    controller: 'BrandingAppController',
  })),
];
export function mountBrandingUploadRoutes(
  router: Router,
  input: {
    readonly branding: Pick<Branding.Branding, 'uploadTypefaceFace'>;
    readonly logos: Pick<Logo.BrandingLogo, 'putLogo' | 'putFavicon'>;
    readonly multipart: StreamingMultipart;
    readonly staging: Pick<Disks.IDisk, 'getBytes'>;
    audit(actor: { id: string; username: string }, action: string, context: { brandId: string }): Promise<unknown>;
    readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect' | 'protect'>;
    readonly policies: Readonly<Record<string, RequestHandler>>;
    readonly policyConfiguration: PoliciesConfig;
    readonly log: ILogger;
  }
): void {
  const bindings = brandingUploadRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router[route.method](
      route.path,
      ...policies,
      route.path.includes('/api/') ? input.csrf.apiProtect : input.csrf.protect,
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
        try {
          await input.multipart
            .receive(req, async received => {
              const field = route.action === 'uploadFace' ? 'face' : route.action;
              if (received.files.length !== 1 || received.files[0]!.field !== field)
                throw new MultipartError(400, 'Exactly one ' + field + ' file is required');
              const file = received.files[0]!;
              const files = validateApiRouteFiles(route, {
                [field]: [{ fd: file.key, filename: file.filename, type: file.mimeType, size: file.size }],
              });
              if (!files.valid) throw new MultipartError(400, 'Invalid ' + field + ' upload');
              const body = {
                ...received.fields,
                ...(received.fields.expectedDraftRevision === undefined
                  ? {}
                  : { expectedDraftRevision: Number(received.fields.expectedDraftRevision) }),
              };
              const validated = validateApiRouteRequest(
                { params: req.params, query: req.query, headers: req.headers, body },
                route
              );
              if (!validated.valid) throw new MultipartError(400, 'Invalid upload fields');
              const bytes = Buffer.from(await input.staging.getBytes(file.key));
              let data: unknown;
              if (route.action === 'uploadFace')
                data = await input.branding.uploadTypefaceFace({
                  branding: brand.name ?? '',
                  slot: String(validated.params.slot),
                  bytes,
                  originalFilename: file.filename,
                  expectedDraftRevision: Reflect.get(body, 'expectedDraftRevision'),
                  actor,
                });
              else {
                const options = {
                  branding: brand.name ?? '',
                  portal: portal ?? '',
                  fileBuffer: bytes,
                  contentType: file.mimeType,
                };
                const result =
                  route.action === 'logo' ? await input.logos.putLogo(options) : await input.logos.putFavicon(options);
                data = { hash: result.hash };
              }
              await input.audit(actor, 'branding-upload-' + field, { brandId: brand.id });
              return data;
            })
            .then(data => sendApiData(req, res, data));
        } catch (error) {
          input.log.error('Branding upload failed');
          const mapped = mapBrandingError(error);
          sendApiErrors(req, res, error instanceof MultipartError ? error.status : mapped.status, [
            {
              ...(error instanceof MultipartError ? {} : { title: mapped.code, code: mapped.code }),
              detail:
                error instanceof MultipartError
                  ? error.message
                  : mapped.status < 500
                    ? (mapped.detail ?? mapped.code)
                    : 'Branding upload failed. Review current state before retrying.',
            },
          ]);
        }
      })
    );
}
