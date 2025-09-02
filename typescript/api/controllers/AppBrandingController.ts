/**
 * App Branding Controller (Task 9)
 * Endpoints consumed by the Angular admin UI (session / cookie auth, CSRF enabled by default)
 */
import type { Request, Response } from 'sails';
import { Controllers as controllers } from '@researchdatabox/redbox-core-types';

declare const sails: any;
declare const BrandingService: any;
declare const BrandingLogoService: any;
declare const BrandingConfig: any;
declare const BrandingConfigHistory: any;

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

// Authorization for these endpoints is now handled via the configured policy rules
// in config/auth.js (pattern: /:branding/:portal/app/branding/*). We only map errors here.

export module Controllers {
  export class AppBranding extends controllers.Core.Controller {
    protected _exportedMethods: any = ['config','draft','preview','publish','logo'];

    /** 9.1 Return current draft/active branding config + logo meta */
    async config(req: Request, res: Response) {
      try {
        const branding = req.params['branding'];
        const brand = await BrandingConfig.findOne({ name: branding });
        if (!brand) return res.status(404).json({ error: 'branding-not-found' });
        return res.ok({ branding: brand });
      } catch(e:any) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }

    /** 9.2 Save draft variables */
  async draft(req: Request, res: Response) {
      const branding = req.params['branding'];
      try {
    const actor = (req as any).user || (req as any).session?.user; // policy should guarantee admin
        const variables = req.body?.variables || {};
        const updated = await BrandingService.saveDraft({ branding, variables, actor });
        return res.ok({ branding: updated });
      } catch(e:any) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }

    /** 9.3 Create preview token */
  async preview(req: Request, res: Response) {
      const branding = req.params['branding'];
      const portal = req.params['portal'];
      try {
    const actor = (req as any).user || (req as any).session?.user;
        const { token, url, hash } = await BrandingService.preview(branding, portal, actor);
        let brandConfig: any = null;
        try { brandConfig = await BrandingService.getBrand(branding); } catch(_e){}
        return res.ok({ token, url, hash, previewToken: token, previewUrl: url, branding: brandConfig || undefined });
      } catch(e:any) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }

    /** 9.4 Publish draft */
  async publish(req: Request, res: Response) {
      const branding = req.params['branding'];
      const portal = req.params['portal'];
      try {
    const actor = (req as any).user || (req as any).session?.user;
        const expectedVersion = req.body?.expectedVersion;
        const { version, hash, idempotent } = await BrandingService.publish(branding, portal, actor, { expectedVersion });
        const body: any = { version, hash };
        if (idempotent) body.idempotent = true;
        return res.ok(body);
      } catch(e:any) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }

    /** 9.5 Upload logo */
  async logo(req: Request, res: Response) {
      const branding = req.params['branding'];
      const portal = req.params['portal'];
      try {
    const actor = (req as any).user || (req as any).session?.user;
        if (!(req._fileparser && typeof (req as any).file === 'function')) {
          return res.badRequest({ error: 'no-file' });
        }
        const files = await new Promise<any[]>((resolve, reject) => {
          try { (req as any).file('logo').upload((err, uploaded) => err ? reject(err) : resolve(uploaded)); } catch(e) { resolve([]); }
        });
        if (!files || !files.length) return res.badRequest({ error: 'no-file' });
        const f = files[0];
        const fs = require('fs');
        const buf = fs.readFileSync(f.fd);
        const { hash } = await BrandingLogoService.putLogo({ branding, portal, fileBuffer: buf, contentType: f.type, actor });
        return res.ok({ hash });
      } catch(e:any) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }
  }
}

module.exports = new Controllers.AppBranding().exports();
