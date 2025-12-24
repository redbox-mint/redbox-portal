/**
 * Branding App Controller
 * Endpoints consumed by the Angular admin UI (session / cookie auth, CSRF enabled by default)
 */
import type { Request, Response } from 'sails';
import { Controllers as controllers } from '@researchdatabox/redbox-core-types';
import type { Services as BrandingServices } from '../services/BrandingService';
import type { Services as BrandingLogoServices } from '../services/BrandingLogoService';

declare const sails: any;


declare const BrandingConfig: any;

function mapError(e: Error): { status: number; body: any } {
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

export module Controllers {
  export class BrandingApp extends controllers.Core.Controller {
    protected _exportedMethods: any = ['config', 'draft', 'preview', 'publish', 'logo'];

    /** 9.1 Return current draft/active branding config + logo meta */
    async config(req: Request, res: Response) {
      try {
        const branding = req.params['branding'];
        const brand = BrandingService.getBrand(branding);
        if (!brand) return res.status(404).json({ error: 'branding-not-found' });
        return res.ok({ branding: brand });
      } catch (e: any) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }

    /** 9.2 Save draft variables */
    async draft(req: Request, res: Response) {
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
      } catch (e: any) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }

    /** 9.3 Create preview token */
    async preview(req: Request, res: Response) {
      const branding = req.params['branding'];
      const portal = req.params['portal'];
      try {
        const { token, url, hash } = await BrandingService.preview(branding, portal);
        let brandConfig: any = null;
        try {
          brandConfig = await BrandingService.getBrandingFromDB(branding);

        } catch (_e) {
          sails.log.warn('Failed to fetch brand config for preview:', _e);
        }

        return res.ok({ token, url, hash, previewToken: token, previewUrl: url, branding: brandConfig || undefined });
      } catch (e: any) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }

    /** 9.4 Publish draft */
    async publish(req: Request, res: Response) {
      const branding = req.params['branding'];
      const portal = req.params['portal'];
      const actor = req.user;
      try {
        const expectedVersion = req.body?.expectedVersion;
        const { version, hash, idempotent } = await BrandingService.publish(branding, portal, actor, { expectedVersion });
        const body: any = { version, hash };
        if (idempotent) body.idempotent = true;
        return res.ok(body);
      } catch (e: any) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }

    /** 9.5 Upload logo */
    async logo(req: Request, res: Response) {
      const branding = req.params['branding'];
      const portal = req.params['portal'];
      try {
        if (!(req._fileparser && typeof (req as any).file === 'function')) {
          return res.badRequest({ error: 'no-file' });
        }
        const files = await new Promise<any[]>((resolve, reject) => {
          try { (req as any).file('logo').upload((err, uploaded) => err ? reject(err) : resolve(uploaded)); } catch (e) { resolve([]); }
        });
        if (!files || !files.length) return res.badRequest({ error: 'no-file' });
        const f = files[0];
        const fs = require('fs').promises;
        const buf = await fs.readFile(f.fd);
        try {
          const { hash } = await BrandingLogoService.putLogo({ branding, portal, fileBuffer: buf, contentType: f.type });
          await fs.unlink(f.fd);
          return res.ok({ hash });
        } catch (e) {
          await fs.unlink(f.fd);
          throw e;
        }
      } catch (e: any) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }
  }
}

module.exports = new Controllers.BrandingApp().exports();
