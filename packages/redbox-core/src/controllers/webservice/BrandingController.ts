import {
  Controllers as controllers,
  getValidatedApiRequest,
  validateApiRouteFiles,
  brandingDraftRoute,
  brandingPreviewRoute,
  brandingPublishRoute,
  brandingRollbackRoute,
  brandingLogoRoute,
  brandingHistoryRoute,
} from '../../index';

function mapError(e: unknown): { status: number; displayErrors: Array<{ code?: string; title?: string; detail?: string }> } {
  const msg = (e instanceof Error ? e.message : String(e)) || '';
  if (msg === 'unauthorized') return { status: 403, displayErrors: [{ code: 'forbidden' }] };
  if (msg.startsWith('Invalid variable key')) return { status: 400, displayErrors: [{ code: 'invalid-variable', detail: msg }] };
  if (msg.startsWith('contrast-violation')) return { status: 400, displayErrors: [{ code: 'contrast', detail: msg }] };
  if (msg === 'branding-not-found') return { status: 404, displayErrors: [{ code: 'branding-not-found' }] };
  if (msg === 'history-not-found') return { status: 404, displayErrors: [{ code: 'history-not-found' }] };
  if (msg === 'publish-conflict') return { status: 409, displayErrors: [{ code: 'publish-conflict' }] };
  if (msg.startsWith('logo-invalid')) return { status: 400, displayErrors: [{ code: 'logo-invalid', detail: msg }] };
  return { status: 500, displayErrors: [{ code: 'server-error', detail: msg }] };
}

function toValidationDisplayErrors(issues: Array<{ path: string; message: string }>) {
  return issues.map(issue => ({ title: issue.path, detail: issue.message }));
}

export namespace Controllers {
  export class Branding extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = ['draft', 'preview', 'publish', 'rollback', 'logo', 'history'];

    async draft(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params, body } = validated;
      const branding = params.branding as string;
      const actor = req.user;
      try {
        const bodyObj = body as Record<string, unknown>;
        const variables = (bodyObj?.variables || {}) as Record<string, string>;
        const updated = await BrandingService.saveDraft({ branding, variables, actor });
        return this.apiRespond(req, res, { branding: updated }, 200);
      } catch (e: unknown) {
        const { status, displayErrors } = mapError(e);
        return this.sendResp(req, res, {
          status,
          displayErrors,
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    async preview(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const branding = BrandingService.getBrandNameFromReq(req);
      const portal = req.params['portal'];
      try {
        const { token, url, hash } = await BrandingService.preview(branding, portal);
        // Fetch current draft (variables) so response matches test expectation body.branding.variables
        let brandConfig: unknown = null;
        try {
          // Prefer a service helper if available; fallback to direct model query
          if (typeof BrandingService.getBrand === 'function') {
            brandConfig = await BrandingService.getBrand(branding);
          }
        } catch (_e) {
          sails.log.debug('Failed to fetch brand config for preview:', _e);
        }
        // Provide both legacy (token/url) and expected (previewToken/previewUrl) keys
        return this.apiRespond(req, res, {
          token,
          url,
          hash,
          previewToken: token,
          previewUrl: url,
          branding: brandConfig || undefined,
        }, 200);
      } catch (e: unknown) {
        const { status, displayErrors } = mapError(e);
        return this.sendResp(req, res, {
          status,
          displayErrors,
          headers: this.getNoCacheHeaders(),
        });
      }
    }
    async publish(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params, body } = validated;
      const branding = params.branding as string;
      const portal = params.portal as string;
      const actor = req.user;
      try {
        const bodyObj = body as Record<string, unknown>;
        const expectedVersion = bodyObj?.expectedVersion as number | undefined;
        const { version, hash, idempotent } = await BrandingService.publish(branding, portal, actor, {
          expectedVersion,
        });
        const respBody: globalThis.Record<string, unknown> = { version, hash };
        if (idempotent) respBody.idempotent = true;
        return this.apiRespond(req, res, respBody, 200);
      } catch (e: unknown) {
        const { status, displayErrors } = mapError(e);
        return this.sendResp(req, res, {
          status,
          displayErrors,
          headers: this.getNoCacheHeaders(),
        });
      }
    }
    async rollback(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params } = validated;
      const versionId = params.versionId as string;
      const actor = req.user;
      try {
        const { version, hash } = await BrandingService.rollback(versionId, actor);
        return this.apiRespond(req, res, { version, hash }, 200);
      } catch (e: unknown) {
        const { status, displayErrors } = mapError(e);
        return this.sendResp(req, res, {
          status,
          displayErrors,
          headers: this.getNoCacheHeaders(),
        });
      }
    }
    async logo(req: Sails.Req, res: Sails.Res) {
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
        const fileValidation = validateApiRouteFiles(brandingLogoRoute, { logo: files });
        if (!fileValidation.valid) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: toValidationDisplayErrors(fileValidation.issues),
            headers: this.getNoCacheHeaders(),
          });
        }
        const validated = getValidatedApiRequest(req);
        req.apiRequest = { ...validated, files: { logo: files } };
        const { params } = validated;
        const branding = params.branding as string;
        const portal = params.portal as string;
        const f = files[0];
        const fs = require('fs').promises;
        const buf = await fs.readFile(f.fd);
        const { hash } = await BrandingLogoService.putLogo({ branding, portal, fileBuffer: buf, contentType: f.type });
        return this.apiRespond(req, res, { hash }, 200);
      } catch (e: unknown) {
        const { status, displayErrors } = mapError(e);
        return this.sendResp(req, res, {
          status,
          displayErrors,
          headers: this.getNoCacheHeaders(),
        });
      }
    }
    async history(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { params } = validated;
      const branding = params.branding as string;

      try {
        const brand = await BrandingService.getBrand(branding);
        if (!brand) throw new Error('branding-not-found');
        const histories = await BrandingConfigHistory.find({ branding: brand.id }).sort('version ASC');
        return this.apiRespond(req, res, histories, 200);
      } catch (e: unknown) {
        const { status, displayErrors } = mapError(e);
        return this.sendResp(req, res, {
          status,
          displayErrors,
          headers: this.getNoCacheHeaders(),
        });
      }
    }
  }
}
