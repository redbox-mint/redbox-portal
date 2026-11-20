import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Branding } from '../../branding/Branding';
import type { Services as Logo } from '../../branding/BrandingLogo';
import type { Services as Disks } from '../../storage/StorageManager';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { BRANDING_TYPEFACE_FACE_MAX_BYTES } from '../../model/BrandingTypeface';
import { mapBrandingError } from '../../branding/HttpErrors';
import { validateApiRouteRequest, validateApiRouteFiles } from '../../api-routes/validation';
import { administratorRefusal } from '../actors';
import { StreamingMultipart, MultipartError, type MultipartResult } from '../integrations/multipart';
import { actionApiData, actionApiErrors, type ActionRequest, type JsonOutput } from './jsonOutput';
export interface BrandingUploadInput {
  readonly branding: Pick<Branding.Branding, 'uploadTypefaceFace'>;
  readonly logos: Pick<Logo.BrandingLogo, 'putLogo' | 'putFavicon'>;
  readonly multipart: StreamingMultipart;
  readonly faceMaxBytes?: number;
  readonly staging: Pick<Disks.IDisk, 'getBytes'>;
  audit(actor: { id: string; username: string }, action: string, context: { brandId: string }): Promise<unknown>;
  readonly log: ILogger;
}
export function brandingUploadActorPrelude(req: ActionRequest, res: JsonOutput) {
  const { actor, brand, portal } = req.context();
  const refusal = administratorRefusal(actor, brand.id);
  if (refusal) {
    actionApiErrors(req, res, refusal.status, [{ detail: refusal.detail }]);
    return;
  }
  return { actor: actor!, brand, portal };
}
export function validateBrandingUpload(
  input: BrandingUploadInput,
  req: ActionRequest,
  route: Pick<ApiRouteDefinition, 'action' | 'request'>,
  received: MultipartResult
) {
  const field = route.action === 'uploadFace' ? 'face' : route.action;
  if (received.files.length !== 1 || received.files[0]!.field !== field)
    throw new MultipartError(400, 'Exactly one ' + field + ' file is required');
  const file = received.files[0]!;
  if (field === 'face' && file.size > (input.faceMaxBytes ?? BRANDING_TYPEFACE_FACE_MAX_BYTES))
    throw new MultipartError(413, 'Typeface face size limit exceeded');
  const files = validateApiRouteFiles(
    route,
    {
      [field]: [{ fd: file.key, filename: file.filename, type: file.mimeType, size: file.size }],
    },
    {
      maxBytesOverrides:
        field === 'face' ? { face: input.faceMaxBytes ?? BRANDING_TYPEFACE_FACE_MAX_BYTES } : undefined,
    }
  );
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
  return { field, file, body, validated };
}
export function rejectBrandingUpload(input: BrandingUploadInput, req: ActionRequest, res: JsonOutput, error: unknown) {
  input.log.error('Branding upload failed');
  const mapped = mapBrandingError(error);
  actionApiErrors(req, res, error instanceof MultipartError ? error.status : mapped.status, [
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
export async function executeBrandingUpload(
  input: BrandingUploadInput,
  req: ActionRequest,
  res: JsonOutput,
  route: Pick<ApiRouteDefinition, 'action' | 'request'>,
  receive: <T>(consume: (received: MultipartResult) => Promise<T>) => Promise<T>
) {
  const identity = brandingUploadActorPrelude(req, res);
  if (!identity) return;
  const { actor, brand, portal } = identity;
  try {
    const data = await receive(async received => {
      const { file, field, body, validated } = validateBrandingUpload(input, req, route, received);
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
    });
    actionApiData(req, res, data);
  } catch (error) {
    rejectBrandingUpload(input, req, res, error);
  }
}
