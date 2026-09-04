/**
 * Branding App Controller
 * Endpoints consumed by the Angular admin UI (session / cookie auth, CSRF enabled by default).
 * Mirrors the REST surface behaviour using the same BrandingService lifecycle.
 */
import { Controllers as controllers } from '../CoreController';
import * as BrandingServiceModule from '../services/BrandingService';
import * as BrandingLogoServiceModule from '../services/BrandingLogoService';
import { getBrandingPositiveInt } from '../config/branding.config';
import { BRANDING_TYPEFACE_FACE_MAX_BYTES } from '../model/BrandingTypeface';
import { getRouteParam } from '../utilities/RequestParamUtils';
import { mapBrandingError } from './webservice/BrandingController';

// sails is available globally via sails.ts
declare const BrandingService: BrandingServiceModule.Services.Branding;
declare const BrandingLogoService: BrandingLogoServiceModule.Services.BrandingLogo;

interface SkipperUploadedFile {
  fd: string;
  filename?: string;
  type?: string;
  size?: number;
}

export namespace Controllers {
  export class BrandingApp extends controllers.Core.Controller {
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
    ];

    private sendError(req: Sails.Req, res: Sails.Res, e: unknown) {
      const mapped = mapBrandingError(e);
      return this.sendResp(req, res, {
        status: mapped.status,
        displayErrors: [{ code: mapped.code, detail: mapped.detail }],
        ...(mapped.current ? { data: { current: mapped.current } } : {}),
        headers: this.getNoCacheHeaders(),
      });
    }

    private sendState(req: Sails.Req, res: Sails.Res, state: unknown, extra: Record<string, unknown> = {}) {
      return this.sendResp(req, res, {
        data: { ...(state as Record<string, unknown>), ...extra },
        headers: this.getNoCacheHeaders(),
      });
    }

    /** Canonical Admin state: active, draft, versions, limits, counters, warnings */
    async config(req: Sails.Req, res: Sails.Res) {
      try {
        const branding = getRouteParam(req, 'branding');
        const state = await BrandingService.getAdminState(branding);
        return this.sendState(req, res, state);
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }

    /** Replace validated colour draft with expected revision */
    async draft(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const actor = req.user;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const variablesInput = body.variables;
      if (variablesInput !== undefined && variablesInput !== null) {
        if (typeof variablesInput !== 'object' || Array.isArray(variablesInput)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ code: 'invalid-variable', detail: 'Invalid variables in request body' }],
            headers: this.getNoCacheHeaders(),
          });
        }
      }
      try {
        const state = await BrandingService.saveDraft({
          branding,
          variables: ((variablesInput || {}) as Record<string, string>) || {},
          expectedDraftRevision: body.expectedDraftRevision as number | undefined,
          actor,
        });
        return this.sendState(req, res, state);
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }

    /** Multipart face upload (`face`) with expected revision field */
    async uploadFace(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const slot = getRouteParam(req, 'slot');
      const actor = req.user;
      const maxBytes = getBrandingPositiveInt('typefaceFaceMaxBytes', BRANDING_TYPEFACE_FACE_MAX_BYTES);
      let files: SkipperUploadedFile[] = [];
      const receive = async (): Promise<SkipperUploadedFile[]> => {
        const reqObj = req as unknown as globalThis.Record<string, unknown>;
        if (!(reqObj._fileparser && typeof reqObj.file === 'function')) {
          return [];
        }
        const fileFn = reqObj.file as (name: string) => {
          upload: (
            options: Record<string, unknown>,
            cb: (err: unknown, uploaded: SkipperUploadedFile[]) => void
          ) => void;
        };
        return new Promise<SkipperUploadedFile[]>((resolve, reject) => {
          try {
            fileFn('face').upload({ maxBytes }, (err: unknown, uploaded) =>
              err ? reject(err) : resolve(uploaded ?? [])
            );
          } catch (error) {
            reject(error);
          }
        });
      };
      try {
        files = await receive();
        if (files.length === 0) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ code: 'no-file' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const fs = require('fs').promises;
        try {
          const body = (req.body ?? {}) as Record<string, unknown>;
          const expectedDraftRevision = Number(body.expectedDraftRevision);
          const buf = await fs.readFile(files[0].fd);
          const state = await BrandingService.uploadTypefaceFace({
            branding,
            slot,
            bytes: buf,
            originalFilename: files[0].filename,
            expectedDraftRevision: Number.isFinite(expectedDraftRevision) ? expectedDraftRevision : undefined,
            actor,
          });
          return this.sendState(req, res, state);
        } finally {
          await Promise.all(files.map(file => fs.unlink(file.fd).catch(() => undefined)));
        }
      } catch (e: unknown) {
        const message = String((e as { message?: unknown })?.message ?? e).toLowerCase();
        if (message.includes('maxbytes') || message.includes('exceed') || message.includes('too large')) {
          return this.sendResp(req, res, {
            status: 413,
            displayErrors: [
              { code: 'typeface-face-too-large', detail: `Face exceeds the configured maximum of ${maxBytes} bytes` },
            ],
            headers: this.getNoCacheHeaders(),
          });
        }
        return this.sendError(req, res, e);
      }
    }

    /** Remove one draft face */
    async deleteFace(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const slot = getRouteParam(req, 'slot');
      const actor = req.user;
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const state = await BrandingService.removeTypefaceFace({
          branding,
          slot,
          expectedDraftRevision: body.expectedDraftRevision as number | undefined,
          actor,
        });
        return this.sendState(req, res, state);
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }

    /** Set draft typeface to Default Typography */
    async useDefault(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const actor = req.user;
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const state = await BrandingService.useDefaultTypography({
          branding,
          expectedDraftRevision: body.expectedDraftRevision as number | undefined,
          actor,
        });
        return this.sendState(req, res, state);
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }

    /** Copy active typeface to draft only */
    async revert(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const actor = req.user;
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const state = await BrandingService.revertTypefaceDraft({
          branding,
          expectedDraftRevision: body.expectedDraftRevision as number | undefined,
          actor,
        });
        return this.sendState(req, res, state);
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }

    /** Create a single-use CSS preview for the exact draft revision */
    async preview(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const portal = getRouteParam(req, 'portal');
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const preview = await BrandingService.preview(
          branding,
          portal,
          body.expectedDraftRevision as number | undefined
        );
        return this.sendResp(req, res, {
          data: { ...preview, previewToken: preview.token, previewUrl: preview.url },
          headers: this.getNoCacheHeaders(),
        });
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }

    /** List newest retained versions */
    async versions(req: Sails.Req, res: Sails.Res) {
      try {
        const branding = getRouteParam(req, 'branding');
        const versions = await BrandingService.listVersions(branding);
        return this.sendResp(req, res, { data: versions, headers: this.getNoCacheHeaders() });
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }

    /** Preview a retained version without mutating draft */
    async versionPreview(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const portal = getRouteParam(req, 'portal');
      const versionId = getRouteParam(req, 'versionId');
      try {
        const preview = await BrandingService.previewVersion({ branding, portal, versionId });
        return this.sendResp(req, res, {
          data: { ...preview, previewToken: preview.token, previewUrl: preview.url },
          headers: this.getNoCacheHeaders(),
        });
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }

    /** Publish the draft using both expected counters */
    async publish(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const portal = getRouteParam(req, 'portal');
      const actor = req.user;
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const result = await BrandingService.publish(branding, portal, actor, {
          expectedVersion: body.expectedVersion as number | undefined,
          expectedDraftRevision: body.expectedDraftRevision as number | undefined,
        });
        return this.sendState(req, res, result.state, {
          version: result.version,
          hash: result.hash,
          ...(result.idempotent ? { idempotent: true } : {}),
        });
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }

    /** Immediately restore a retained version as a new version */
    async restore(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const versionId = getRouteParam(req, 'versionId');
      const actor = req.user;
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const result = await BrandingService.restore({
          branding,
          versionId,
          expectedVersion: body.expectedVersion as number | undefined,
          expectedDraftRevision: body.expectedDraftRevision as number | undefined,
          actor,
        });
        return this.sendState(req, res, result.state, { version: result.version, hash: result.hash });
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }

    /**
     * Deprecated one-major-release alias with restore semantics.
     * Returns a Deprecation header; removal is scheduled for the next major release.
     */
    async rollback(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const versionId = getRouteParam(req, 'versionId');
      const actor = req.user;
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const result = await BrandingService.restore({
          branding,
          versionId,
          expectedVersion: body.expectedVersion as number | undefined,
          expectedDraftRevision: body.expectedDraftRevision as number | undefined,
          actor,
        });
        return this.sendResp(req, res, {
          data: { ...(result.state as unknown as Record<string, unknown>), version: result.version, hash: result.hash },
          headers: { ...this.getNoCacheHeaders(), Deprecation: 'true' },
        });
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }

    /** Upload logo */
    async logo(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const portal = getRouteParam(req, 'portal');
      try {
        if (!(req._fileparser && typeof (req as globalThis.Record<string, unknown>).file === 'function')) {
          return res.badRequest({ error: 'no-file' });
        }
        const files = await new Promise<globalThis.Record<string, unknown>[]>((resolve, reject) => {
          try {
            (
              (req as globalThis.Record<string, unknown>).file as (name: string) => {
                upload: (cb: (err: unknown, uploaded: globalThis.Record<string, unknown>[]) => void) => void;
              }
            )('logo').upload((err: unknown, uploaded: globalThis.Record<string, unknown>[]) =>
              err ? reject(err) : resolve(uploaded)
            );
          } catch (_e) {
            resolve([]);
          }
        });
        if (!files || !files.length) return res.badRequest({ error: 'no-file' });
        const f = files[0];
        const fs = require('fs').promises;
        const buf = await fs.readFile(f.fd);
        try {
          const { hash } = await BrandingLogoService.putLogo({
            branding,
            portal,
            fileBuffer: buf,
            contentType: f.type as string,
          });
          await fs.unlink(f.fd);
          return res.ok({ hash });
        } catch (e) {
          await fs.unlink(f.fd);
          throw e;
        }
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }

    /** Upload favicon */
    async favicon(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const portal = getRouteParam(req, 'portal');
      try {
        if (!(req._fileparser && typeof (req as globalThis.Record<string, unknown>).file === 'function')) {
          return res.badRequest({ error: 'no-file' });
        }
        const files = await new Promise<globalThis.Record<string, unknown>[]>((resolve, reject) => {
          try {
            (
              (req as globalThis.Record<string, unknown>).file as (name: string) => {
                upload: (cb: (err: unknown, uploaded: globalThis.Record<string, unknown>[]) => void) => void;
              }
            )('favicon').upload((err: unknown, uploaded: globalThis.Record<string, unknown>[]) =>
              err ? reject(err) : resolve(uploaded)
            );
          } catch (_e) {
            resolve([]);
          }
        });
        if (!files || !files.length) return res.badRequest({ error: 'no-file' });
        const f = files[0];
        const fs = require('fs').promises;
        const buf = await fs.readFile(f.fd);
        try {
          const { hash } = await BrandingLogoService.putFavicon({
            branding,
            portal,
            fileBuffer: buf,
            contentType: f.type as string,
          });
          await fs.unlink(f.fd);
          return res.ok({ hash });
        } catch (e) {
          await fs.unlink(f.fd);
          throw e;
        }
      } catch (e: unknown) {
        return this.sendError(req, res, e);
      }
    }
  }
}
