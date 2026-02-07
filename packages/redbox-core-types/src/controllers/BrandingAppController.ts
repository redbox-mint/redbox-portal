/**
 * Branding App Controller
 * Endpoints consumed by the Angular admin UI (session / cookie auth, CSRF enabled by default)
 */
import { Controllers as controllers } from '../CoreController';
import * as BrandingServiceModule from '../services/BrandingService';
import * as BrandingLogoServiceModule from '../services/BrandingLogoService';

// sails is available globally via sails.ts
declare const BrandingService: BrandingServiceModule.Services.Branding;
declare const BrandingLogoService: BrandingLogoServiceModule.Services.BrandingLogo;
declare const BrandingConfig: unknown;

function mapError(e: Error): { status: number; body: unknown } {
  const msg = e.message || '';
  if (msg === 'unauthorized') return { status: 403, body: { error: 'forbidden' } };
  if (msg.startsWith('Invalid variable key')) return { status: 400, body: { error: 'invalid-variable', detail: msg } };
  if (msg.startsWith('contrast-violation')) return { status: 400, body: { error: 'contrast', detail: msg } };
  if (msg === 'branding-not-found') return { status: 404, body: { error: 'branding-not-found' } };
  if (msg === 'history-not-found') return { status: 404, body: { error: 'history-not-found' } };
  if (msg === 'publish-conflict') return { status: 409, body: { error: 'publish-conflict' } };
  if (msg.startsWith('logo-invalid')) return { status: 400, body: { error: 'logo-invalid', detail: msg } };
  return { status: 500, body: { error: 'server-error', detail: msg } };
}

export namespace Controllers {
  export class BrandingApp extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = ['config', 'draft', 'preview', 'publish', 'logo'];

    /** 9.1 Return current draft/active branding config + logo meta */
    async config(req: Sails.Req, res: Sails.Res) {
      try {
        const branding = req.params['branding'];
        const brand = BrandingService.getBrand(branding);
        if (!brand) return res.status(404).json({ error: 'branding-not-found' });
        return res.ok({ branding: brand });
      } catch (e: unknown) {
        const { status, body } = mapError(e as Error);
        return res.status(status).json(body);
      }
    }

    /** 9.2 Save draft variables */
    async draft(req: Sails.Req, res: Sails.Res) {
      const branding = req.params['branding'];
      const actor = req.user;
      // Validate variables if provided
      const variablesInput = req.body?.variables;
      if (variablesInput !== undefined && variablesInput !== null) {
        if (typeof variablesInput !== 'object' || Array.isArray(variablesInput)) {
          return res.status(400).json({ error: 'Invalid variables in request body' });
        }
      }
      
      // Coerce variables to empty object if missing
      const variables = variablesInput || {};
      
      try {
        const updated = await BrandingService.saveDraft({ branding, variables, actor });
        return res.ok({ branding: updated });
      } catch (e: unknown) {
        const { status, body } = mapError(e as Error);
        return res.status(status).json(body);
      }
    }

    /** 9.3 Create preview token */
    async preview(req: Sails.Req, res: Sails.Res) {
      const branding = req.params['branding'];
      const portal = req.params['portal'];
      try {
        const { token, url, hash } = await BrandingService.preview(branding, portal);
        let brandConfig: unknown = null;
        try {
          brandConfig = await BrandingService.getBrandingFromDB(branding);

        } catch (_e) {
          sails.log.warn('Failed to fetch brand config for preview:', _e);
        }

        return res.ok({ token, url, hash, previewToken: token, previewUrl: url, branding: brandConfig || undefined });
      } catch (e: unknown) {
        const { status, body } = mapError(e as Error);
        return res.status(status).json(body);
      }
    }

    /** 9.4 Publish draft */
    async publish(req: Sails.Req, res: Sails.Res) {
      const branding = req.params['branding'];
      const portal = req.params['portal'];
      const actor = req.user;
      try {
        const expectedVersion = req.body?.expectedVersion;
        const { version, hash, idempotent } = await BrandingService.publish(branding, portal, actor, { expectedVersion });
        const body: globalThis.Record<string, unknown> = { version, hash };
        if (idempotent) body.idempotent = true;
        return res.ok(body);
      } catch (e: unknown) {
        const { status, body } = mapError(e as Error);
        return res.status(status).json(body);
      }
    }

    /** 9.5 Upload logo */
    async logo(req: Sails.Req, res: Sails.Res) {
      const branding = req.params['branding'];
      const portal = req.params['portal'];
      try {
        if (!(req._fileparser && typeof (req as globalThis.Record<string, unknown>).file === 'function')) {
          return res.badRequest({ error: 'no-file' });
        }
        const files = await new Promise<globalThis.Record<string, unknown>[]>((resolve, reject) => {
          try { ((req as globalThis.Record<string, unknown>).file as (name: string) => { upload: (cb: (err: unknown, uploaded: globalThis.Record<string, unknown>[]) => void) => void })('logo').upload((err: unknown, uploaded: globalThis.Record<string, unknown>[]) => err ? reject(err) : resolve(uploaded)); } catch (e) { resolve([]); }
        });
        if (!files || !files.length) return res.badRequest({ error: 'no-file' });
        const f = files[0];
        const fs = require('fs').promises;
        const buf = await fs.readFile(f.fd);
        try {
          const { hash } = await BrandingLogoService.putLogo({ branding, portal, fileBuffer: buf, contentType: f.type as string });
          await fs.unlink(f.fd);
          return res.ok({ hash });
        } catch (e) {
          await fs.unlink(f.fd);
          throw e;
        }
      } catch (e: unknown) {
        const { status, body } = mapError(e as Error);
        return res.status(status).json(body);
      }
    }
  }
}
