import { Controllers as controllers } from '../../CoreController';
import { getValidatedApiRequest, validateApiRouteFiles } from '../../api-routes/validation';
import { brandingFaceUploadRoute, brandingLogoRoute, brandingFaviconRoute } from '../../api-routes/groups/branding';
import { getBrandingPositiveInt } from '../../config/branding.config';
import { BRANDING_TYPEFACE_FACE_MAX_BYTES } from '../../model/BrandingTypeface';

export interface BrandingErrorMapping {
  status: number;
  code: string;
  detail?: string;
  current?: { version: number; draftRevision: number };
}

export function mapBrandingError(e: unknown): BrandingErrorMapping {
  const err = e as { message?: string; code?: string; current?: { version: number; draftRevision: number } };
  const msg = (typeof err?.message === 'string' ? err.message : String(e)) || '';
  const code = typeof err?.code === 'string' ? err.code : '';
  // Service errors carry both a typed `code` and a `code: detail` message;
  // match either so detail suffixes never fall through to 500.
  const known = (expected: string): boolean => code === expected || msg === expected || msg.startsWith(`${expected}:`);
  if (known('branding-conflict') || msg === 'publish-conflict') {
    return { status: 409, code: 'branding-conflict', detail: msg, current: err?.current };
  }
  if (msg === 'unauthorized') return { status: 403, code: 'forbidden' };
  if (known('branding-not-found')) return { status: 404, code: 'branding-not-found' };
  if (known('history-not-found')) return { status: 404, code: 'history-not-found' };
  if (known('branding-face-not-found')) return { status: 404, code: 'branding-face-not-found', detail: msg };
  if (known('preview-expired')) return { status: 404, code: 'preview-expired' };
  if (known('preview-not-found')) return { status: 404, code: 'preview-not-found' };
  if (known('typeface-not-found')) {
    return { status: 500, code: 'typeface-not-found', detail: msg };
  }
  if (known('typeface-corrupt') || known('typeface-storage-failed')) {
    return { status: 500, code: code || 'typeface-storage-failed', detail: msg };
  }
  if (known('typeface-face-too-large') || known('typeface-family-too-large')) {
    return { status: 413, code: code || 'typeface-face-too-large', detail: msg };
  }
  if (
    known('typeface-invalid-font') ||
    known('typeface-variable-font') ||
    known('typeface-invalid-slot') ||
    known('typeface-empty')
  ) {
    return { status: 400, code: code || 'typeface-invalid-font', detail: msg };
  }
  if (known('branding-invalid')) {
    return { status: 400, code: 'branding-invalid', detail: msg };
  }
  if (msg.startsWith('Invalid variable key') || msg.startsWith('Invalid variable value')) {
    return { status: 400, code: 'invalid-variable', detail: msg };
  }
  if (msg.startsWith('contrast-violation')) return { status: 400, code: 'contrast', detail: msg };
  if (msg.startsWith('logo-invalid')) return { status: 400, code: 'logo-invalid', detail: msg };
  if (msg.startsWith('favicon-invalid')) return { status: 400, code: 'favicon-invalid', detail: msg };
  return { status: 500, code: 'server-error', detail: msg };
}

interface SkipperUploadedFile {
  fd: string;
  filename?: string;
  type?: string;
  size?: number;
}

async function receiveSingleFile(req: Sails.Req, field: string, maxBytes: number): Promise<SkipperUploadedFile[]> {
  const reqObj = req as unknown as globalThis.Record<string, unknown>;
  if (!(reqObj._fileparser && typeof reqObj.file === 'function')) {
    throw Object.assign(new Error('no-file: multipart file upload is required'), { code: 'no-file' });
  }
  const fileFn = reqObj.file as (name: string) => {
    upload: (options: Record<string, unknown>, cb: (err: unknown, uploaded: SkipperUploadedFile[]) => void) => void;
  };
  return new Promise<SkipperUploadedFile[]>((resolve, reject) => {
    try {
      fileFn(field).upload({ maxBytes }, (err: unknown, uploaded) => (err ? reject(err) : resolve(uploaded ?? [])));
    } catch (error) {
      reject(error);
    }
  });
}

function isUploadSizeError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error).toLowerCase();
  return (
    message.includes('maxbytes') ||
    message.includes('exceed') ||
    message.includes('too large') ||
    message.includes('e_exceeds')
  );
}

export namespace Controllers {
  export class Branding extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = [
      'config',
      'draft',
      'uploadFace',
      'deleteFace',
      'useDefault',
      'revert',
      'preview',
      'versions',
      'versionPreview',
      'publish',
      'restore',
      'rollback',
      'logo',
      'favicon',
      'history',
    ];

    private sendBrandingError(req: Sails.Req, res: Sails.Res, e: unknown) {
      const mapped = mapBrandingError(e);
      return this.sendResp(req, res, {
        status: mapped.status,
        displayErrors: [{ code: mapped.code, detail: mapped.detail }],
        ...(mapped.current ? { data: { current: mapped.current } } : {}),
        headers: this.getNoCacheHeaders(),
      });
    }

    private sendAdminState(req: Sails.Req, res: Sails.Res, state: unknown, extra: Record<string, unknown> = {}) {
      return this.sendResp(req, res, {
        data: { ...(state as Record<string, unknown>), ...extra },
        headers: this.getNoCacheHeaders(),
      });
    }

    /** Active, draft, versions, limits, counters, warnings */
    async config(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params } = validated;
      const branding = params.branding as string;
      try {
        const state = await BrandingService.getAdminState(branding);
        return this.sendAdminState(req, res, state);
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }

    /** Replace validated colour draft with expected revision */
    async draft(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params, body } = validated;
      const branding = params.branding as string;
      const actor = req.user;
      try {
        const bodyObj = body as Record<string, unknown>;
        const variables = (bodyObj?.variables || {}) as Record<string, string>;
        const expectedDraftRevision = bodyObj?.expectedDraftRevision as number | undefined;
        const state = await BrandingService.saveDraft({ branding, variables, expectedDraftRevision, actor });
        return this.sendAdminState(req, res, state);
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }

    /** Multipart face upload (`face`) with expected revision field */
    async uploadFace(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params } = validated;
      const branding = params.branding as string;
      const slot = params.slot as string;
      const actor = req.user;
      const maxBytes = getBrandingPositiveInt('typefaceFaceMaxBytes', BRANDING_TYPEFACE_FACE_MAX_BYTES);
      let files: SkipperUploadedFile[] = [];
      try {
        files = await receiveSingleFile(req, 'face', maxBytes);
        const fs = require('fs').promises;
        try {
          const fileValidation = validateApiRouteFiles(
            brandingFaceUploadRoute,
            { face: files },
            { maxBytesOverrides: { face: maxBytes } }
          );
          if (!fileValidation.valid) {
            const oversized = fileValidation.issues.some(issue => issue.message.includes('maxBytes'));
            return this.sendResp(req, res, {
              status: oversized ? 413 : 400,
              displayErrors: fileValidation.issues.map(issue => ({ title: issue.path, detail: issue.message })),
              headers: this.getNoCacheHeaders(),
            });
          }
          if (files.length === 0) {
            return this.sendResp(req, res, {
              status: 400,
              displayErrors: [{ code: 'no-file' }],
              headers: this.getNoCacheHeaders(),
            });
          }
          const bodyObj = (req.body ?? {}) as Record<string, unknown>;
          const expectedDraftRevision = Number(bodyObj.expectedDraftRevision);
          const uploaded = files[0];
          const buf = await fs.readFile(uploaded.fd);
          const state = await BrandingService.uploadTypefaceFace({
            branding,
            slot,
            bytes: buf,
            originalFilename: uploaded.filename,
            expectedDraftRevision: Number.isFinite(expectedDraftRevision) ? expectedDraftRevision : undefined,
            actor,
          });
          return this.sendAdminState(req, res, state);
        } finally {
          await Promise.all(files.map(file => fs.unlink(file.fd).catch(() => undefined)));
        }
      } catch (e: unknown) {
        if (isUploadSizeError(e)) {
          return this.sendResp(req, res, {
            status: 413,
            displayErrors: [
              { code: 'typeface-face-too-large', detail: `Face exceeds the configured maximum of ${maxBytes} bytes` },
            ],
            headers: this.getNoCacheHeaders(),
          });
        }
        return this.sendBrandingError(req, res, e);
      }
    }

    /** Remove one draft face */
    async deleteFace(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params, body } = validated;
      const branding = params.branding as string;
      const slot = params.slot as string;
      const actor = req.user;
      try {
        const bodyObj = (body ?? {}) as Record<string, unknown>;
        const state = await BrandingService.removeTypefaceFace({
          branding,
          slot,
          expectedDraftRevision: bodyObj?.expectedDraftRevision as number | undefined,
          actor,
        });
        return this.sendAdminState(req, res, state);
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }

    /** Set draft typeface to Default Typography */
    async useDefault(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params, body } = validated;
      const branding = params.branding as string;
      const actor = req.user;
      try {
        const bodyObj = (body ?? {}) as Record<string, unknown>;
        const state = await BrandingService.useDefaultTypography({
          branding,
          expectedDraftRevision: bodyObj?.expectedDraftRevision as number | undefined,
          actor,
        });
        return this.sendAdminState(req, res, state);
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }

    /** Copy active typeface to draft only */
    async revert(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params, body } = validated;
      const branding = params.branding as string;
      const actor = req.user;
      try {
        const bodyObj = (body ?? {}) as Record<string, unknown>;
        const state = await BrandingService.revertTypefaceDraft({
          branding,
          expectedDraftRevision: bodyObj?.expectedDraftRevision as number | undefined,
          actor,
        });
        return this.sendAdminState(req, res, state);
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }

    /** Create a single-use CSS preview for the exact draft revision */
    async preview(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params, body } = validated;
      const branding = params.branding as string;
      const portal = params.portal as string;
      try {
        const bodyObj = (body ?? {}) as Record<string, unknown>;
        const preview = await BrandingService.preview(
          branding,
          portal,
          bodyObj?.expectedDraftRevision as number | undefined
        );
        return this.sendResp(req, res, {
          data: { ...preview, previewToken: preview.token, previewUrl: preview.url },
          headers: this.getNoCacheHeaders(),
        });
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }

    /** List newest retained versions */
    async versions(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params } = validated;
      const branding = params.branding as string;
      try {
        const versions = await BrandingService.listVersions(branding);
        return this.sendResp(req, res, { data: versions, headers: this.getNoCacheHeaders() });
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }

    /** Preview a retained version without mutating draft */
    async versionPreview(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params } = validated;
      const branding = params.branding as string;
      const portal = params.portal as string;
      const versionId = params.versionId as string;
      try {
        const preview = await BrandingService.previewVersion({ branding, portal, versionId });
        return this.sendResp(req, res, {
          data: { ...preview, previewToken: preview.token, previewUrl: preview.url },
          headers: this.getNoCacheHeaders(),
        });
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }

    async publish(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params, body } = validated;
      const branding = params.branding as string;
      const portal = params.portal as string;
      const actor = req.user;
      try {
        const bodyObj = (body ?? {}) as Record<string, unknown>;
        const result = await BrandingService.publish(branding, portal, actor, {
          expectedVersion: bodyObj?.expectedVersion as number | undefined,
          expectedDraftRevision: bodyObj?.expectedDraftRevision as number | undefined,
        });
        return this.sendAdminState(req, res, result.state, {
          version: result.version,
          hash: result.hash,
          ...(result.idempotent ? { idempotent: true } : {}),
        });
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }

    /** Immediately restore a retained version as a new version */
    async restore(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params, body } = validated;
      const branding = params.branding as string;
      const versionId = params.versionId as string;
      const actor = req.user;
      try {
        const bodyObj = (body ?? {}) as Record<string, unknown>;
        const result = await BrandingService.restore({
          branding,
          versionId,
          expectedVersion: bodyObj?.expectedVersion as number | undefined,
          expectedDraftRevision: bodyObj?.expectedDraftRevision as number | undefined,
          actor,
        });
        return this.sendAdminState(req, res, result.state, { version: result.version, hash: result.hash });
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }

    /**
     * Deprecated one-major-release alias with restore semantics.
     * Returns a Deprecation header; removal is scheduled for the next major release.
     */
    async rollback(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params, body } = validated;
      const branding = params.branding as string;
      const versionId = params.versionId as string;
      const actor = req.user;
      try {
        const bodyObj = (body ?? {}) as Record<string, unknown>;
        const result = await BrandingService.restore({
          branding,
          versionId,
          expectedVersion: bodyObj?.expectedVersion as number | undefined,
          expectedDraftRevision: bodyObj?.expectedDraftRevision as number | undefined,
          actor,
        });
        return this.sendResp(req, res, {
          data: { ...(result.state as unknown as Record<string, unknown>), version: result.version, hash: result.hash },
          headers: { ...this.getNoCacheHeaders(), Deprecation: 'true' },
        });
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }
    async logo(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params } = validated;
      const branding = params.branding as string;
      const portal = params.portal as string;
      try {
        const reqObj = req as unknown as globalThis.Record<string, unknown>;
        if (!(reqObj._fileparser && typeof reqObj.file === 'function')) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ code: 'no-file' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const fileFn = reqObj.file as (name: string) => {
          upload: (cb: (err: unknown, uploaded: Array<{ fd: string; type: string }>) => void) => void;
        };
        const files = await new Promise<Array<{ fd: string; type: string }>>((resolve, reject) => {
          try {
            fileFn('logo').upload((err: unknown, uploaded) => (err ? reject(err) : resolve(uploaded)));
          } catch (_e) {
            resolve([]);
          }
        });
        const fs = require('fs').promises;
        try {
          const fileValidation = validateApiRouteFiles(brandingLogoRoute, { logo: files });
          if (!fileValidation.valid) {
            return this.sendResp(req, res, {
              status: 400,
              displayErrors: toValidationDisplayErrors(fileValidation.issues),
              headers: this.getNoCacheHeaders(),
            });
          }
          req.apiRequest = { ...validated, files: { logo: files } };
          const f = files[0];
          const buf = await fs.readFile(f.fd);
          const { hash } = await BrandingLogoService.putLogo({
            branding,
            portal,
            fileBuffer: buf,
            contentType: f.type,
          });
          return this.sendResp(req, res, { data: { hash }, headers: this.getNoCacheHeaders() });
        } finally {
          await Promise.all(files.map(file => fs.unlink(file.fd).catch(() => undefined)));
        }
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }
    async favicon(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params } = validated;
      const branding = params.branding as string;
      const portal = params.portal as string;
      try {
        const reqObj = req as unknown as globalThis.Record<string, unknown>;
        if (!(reqObj._fileparser && typeof reqObj.file === 'function')) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ code: 'no-file' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const fileFn = reqObj.file as (name: string) => {
          upload: (cb: (err: unknown, uploaded: Array<{ fd: string; type: string }>) => void) => void;
        };
        const files = await new Promise<Array<{ fd: string; type: string }>>((resolve, reject) => {
          try {
            fileFn('favicon').upload((err: unknown, uploaded) => (err ? reject(err) : resolve(uploaded)));
          } catch (_e) {
            resolve([]);
          }
        });
        const fs = require('fs').promises;
        try {
          const fileValidation = validateApiRouteFiles(brandingFaviconRoute, { favicon: files });
          if (!fileValidation.valid) {
            return this.sendResp(req, res, {
              status: 400,
              displayErrors: toValidationDisplayErrors(fileValidation.issues),
              headers: this.getNoCacheHeaders(),
            });
          }
          req.apiRequest = { ...validated, files: { favicon: files } };
          const f = files[0];
          const buf = await fs.readFile(f.fd);
          const { hash } = await BrandingLogoService.putFavicon({
            branding,
            portal,
            fileBuffer: buf,
            contentType: f.type,
          });
          return this.sendResp(req, res, { data: { hash }, headers: this.getNoCacheHeaders() });
        } finally {
          await Promise.all(files.map(file => fs.unlink(file.fd).catch(() => undefined)));
        }
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }
    /** Compatibility alias of versions */
    async history(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params } = validated;
      const branding = params.branding as string;
      try {
        const versions = await BrandingService.listVersions(branding);
        return this.sendResp(req, res, { data: versions, headers: this.getNoCacheHeaders() });
      } catch (e: unknown) {
        return this.sendBrandingError(req, res, e);
      }
    }
  }
}

function toValidationDisplayErrors(issues: Array<{ path: string; message: string }>) {
  return issues.map(issue => ({ title: issue.path, detail: issue.message }));
}
