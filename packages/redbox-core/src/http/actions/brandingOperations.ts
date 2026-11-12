import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Branding } from '../../branding/Branding';
import { mapBrandingError } from '../../branding/HttpErrors';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { validateApiRouteRequest } from '../../api-routes/validation';
import { referenceData, referenceValidationErrors, type ReferenceRequest, type ReferenceResult } from './reference';
import { integrationAdministratorPrelude } from './integrationGuard';
import type { AuthenticatedActor } from '../context';
type Contract = Pick<ApiRouteDefinition, 'request'>;
import { prepareReferenceRequest, type RequestPreparation } from './requestPreparation';
import { apiNoCacheHeaders, safeApiVersion } from '../apiResponses';
import { jsonResult } from './reference';
export interface BrandingOperationsInput {
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
  readonly log: ILogger;
}
class PreviewPreludeFailure {
  constructor(readonly cause: unknown) {}
}
export const brandingPreviewPreparation: RequestPreparation<BrandingOperationsInput> = {
  async run(input, req) {
    if (req.body !== undefined && (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)))
      return req;
    try {
      return {
        ...req,
        body: {
          expectedDraftRevision: (await input.branding.getAdminState(req.context.brand.name ?? '')).draft.revision,
          ...(req.body as Record<string, unknown>),
        },
      };
    } catch (error) {
      throw new PreviewPreludeFailure(error);
    }
  },
};
export function brandingOperationFailure(
  input: Pick<BrandingOperationsInput, 'log'>,
  req: ReferenceRequest,
  error: unknown
): ReferenceResult {
  if (error instanceof PreviewPreludeFailure) throw error.cause;
  const mapped = mapBrandingError(error);
  input.log.error('Branding operation failed: ' + mapped.code);
  const detail =
    mapped.status < 500 ? mapped.detail : 'Branding operation failed. Review current state before retrying.';
  return jsonResult(
    safeApiVersion(req) === '2.0'
      ? {
          errors: [{ code: mapped.code, detail }],
          ...(mapped.current ? { data: { current: mapped.current } } : {}),
          meta: {},
        }
      : { message: mapped.code, details: detail ?? '', ...(mapped.current ? { current: mapped.current } : {}) },
    mapped.status,
    apiNoCacheHeaders
  );
}
type Ready = {
  input: BrandingOperationsInput;
  req: ReferenceRequest;
  action: string;
  body: Record<string, unknown>;
  branding: string;
  portal: string | undefined;
  versionId: string;
  expectedVersion: number | undefined;
  expectedDraftRevision: number | undefined;
  actor: AuthenticatedActor;
  params: Record<string, unknown>;
};
async function administer(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract,
  action: string,
  run: (ready: Ready) => Promise<{ data: unknown; headers?: Record<string, string> }>,
  preparation?: RequestPreparation<BrandingOperationsInput>
): Promise<ReferenceResult> {
  const refusal = integrationAdministratorPrelude(req);
  if (refusal) return refusal;
  const { actor, brand, portal } = req.context;
  const request = preparation ? await prepareReferenceRequest(input, req, preparation) : req;
  const validated = validateApiRouteRequest(request, contract);
  if (!validated.valid) return referenceValidationErrors(req, validated.issues);
  const body = (validated.body ?? {}) as Record<string, unknown>;
  const result = await run({
    input,
    req,
    action,
    body,
    branding: brand.name ?? '',
    portal,
    versionId: String(validated.params.versionId ?? ''),
    expectedDraftRevision: body.expectedDraftRevision as number | undefined,
    expectedVersion: body.expectedVersion as number | undefined,
    actor: actor!,
    params: validated.params,
  });
  if (req.method !== 'GET' && req.method !== 'HEAD')
    await input.audit(actor!, 'branding-' + action, { brandId: brand.id });
  return referenceData(req, result.data, result.headers);
}
export function config(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'config', async ({ input, branding }) => {
    const data = await input.branding.getAdminState(branding);
    return { data };
  });
}
export function versions(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'versions', async ({ input, branding }) => {
    const data = await input.branding.listVersions(branding);
    return { data };
  });
}
export function history(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'history', async ({ input, branding }) => {
    const data = await input.branding.listVersions(branding);
    return { data };
  });
}
export function draft(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'draft', async ({ input, body, branding, expectedDraftRevision, actor }) => {
    const data = await input.branding.saveDraft({
      branding,
      variables: (body.variables ?? {}) as Record<string, string>,
      expectedDraftRevision,
      actor,
    });
    return { data };
  });
}
export function deleteFace(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(
    input,
    req,
    contract,
    'deleteFace',
    async ({ input, branding, expectedDraftRevision, actor, params }) => {
      const data = await input.branding.removeTypefaceFace({
        branding,
        slot: String(params.slot),
        expectedDraftRevision,
        actor,
      });
      return { data };
    }
  );
}
export function useDefault(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'useDefault', async ({ input, branding, expectedDraftRevision, actor }) => {
    const data = await input.branding.useDefaultTypography({ branding, expectedDraftRevision, actor });
    return { data };
  });
}
export function revert(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'revert', async ({ input, branding, expectedDraftRevision, actor }) => {
    const data = await input.branding.revertTypefaceDraft({ branding, expectedDraftRevision, actor });
    return { data };
  });
}

export function preview(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'preview', async ({ branding, portal, expectedDraftRevision }) => {
    const preview = await input.branding.preview(branding, portal ?? '', expectedDraftRevision);
    req.observe?.({ brandingAppPreviewCreated: true });
    return { data: { ...preview, previewToken: preview.token, previewUrl: preview.url } };
  });
}
export function versionPreview(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'versionPreview', async ({ branding, portal, versionId }) => {
    const preview = await input.branding.previewVersion({ branding, portal: portal ?? '', versionId });
    req.observe?.({ brandingAppPreviewCreated: true });
    return { data: { ...preview, previewToken: preview.token, previewUrl: preview.url } };
  });
}
export function createPreview(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(
    input,
    req,
    contract,
    'createPreview',
    async ({ branding, portal, expectedDraftRevision }) => {
      const preview = await input.branding.preview(
        branding,
        portal ?? '',
        expectedDraftRevision ?? (await input.branding.getAdminState(branding)).draft.revision
      );
      req.observe?.({ brandingAppPreviewCreated: true });
      return { data: preview };
    },
    brandingPreviewPreparation
  );
}
function publicationData(result: { state: object; version: number; hash: string; idempotent?: boolean }) {
  return {
    ...result.state,
    version: result.version,
    hash: result.hash,
    ...(result.idempotent ? { idempotent: true } : {}),
  };
}
export function publish(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(
    input,
    req,
    contract,
    'publish',
    async ({ branding, portal, actor, expectedVersion, expectedDraftRevision }) => ({
      data: publicationData(
        await input.branding.publish(branding, portal ?? '', actor, { expectedVersion, expectedDraftRevision })
      ),
    })
  );
}
export function restore(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(
    input,
    req,
    contract,
    'restore',
    async ({ branding, versionId, actor, expectedVersion, expectedDraftRevision }) => ({
      data: publicationData(
        await input.branding.restore({ branding, versionId, actor, expectedVersion, expectedDraftRevision })
      ),
    })
  );
}
export function rollback(
  input: BrandingOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(
    input,
    req,
    contract,
    'rollback',
    async ({ branding, versionId, actor, expectedVersion, expectedDraftRevision }) => ({
      data: publicationData(
        await input.branding.restore({ branding, versionId, actor, expectedVersion, expectedDraftRevision })
      ),
      headers: { Deprecation: 'true' },
    })
  );
}
