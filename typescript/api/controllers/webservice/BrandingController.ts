/**
 * Webservice BrandingController
 * Machine-to-machine endpoints for managing branding draft, preview, publish, rollback, logo.
 */
import type { Request, Response } from 'sails';
import { Controllers as controllers, BrandingService as BrandingServiceModule, BrandingLogoService as BrandingLogoServiceModule } from '@researchdatabox/redbox-core-types';

declare const sails: any;
declare const BrandingService: BrandingServiceModule.Services.Branding;
declare const BrandingLogoService: BrandingLogoServiceModule.Services.BrandingLogo;
declare const BrandingConfig: any;
declare const BrandingConfigHistory: any;
declare const BrandingVersion: any;

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
  export class Branding extends controllers.Core.Controller {
    protected _exportedMethods: any = [ 'draft','preview','publish','rollback','logo','history' ];

    async draft(req: Request, res: Response) {
      const branding = req.params['branding'];
      const actor = req.user;
      try {
        const variables = req.body?.variables || {};
        const updated = await BrandingService.saveDraft({ branding, variables, actor });
        return res.ok({ branding: updated });
      } catch(e: any){
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }

    async preview(req: Request, res: Response) {
      const branding = BrandingService.getBrandFromReq(req);
      const portal = req.params['portal'];
      try {
        const { token, url, hash } = await BrandingService.preview(branding, portal);
        // Fetch current draft (variables) so response matches test expectation body.branding.variables
        let brandConfig: any = null;
        try {
          // Prefer a service helper if available; fallback to direct model query
          if (typeof BrandingService.getBrand === 'function') {
            brandConfig = await BrandingService.getBrand(branding);
          }
        
        } catch (_e) {
          sails.log.debug('Failed to fetch brand config for preview:', _e);
        }
        // Provide both legacy (token/url) and expected (previewToken/previewUrl) keys
        return res.ok({
          token,
          url,
            hash,
          previewToken: token,
          previewUrl: url,
          branding: brandConfig || undefined
        });
      } catch(e: any){
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }
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
      } catch(e: any){
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }
    async rollback(req: Request, res: Response) {
      const versionId = req.params['versionId'];
      const actor = req.user;
      try {
        const { version, hash } = await BrandingService.rollback(versionId, actor);
        return res.ok({ version, hash });
      } catch(e: any){
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }
    async logo(req: Request, res: Response) {
      const branding = req.params['branding'];
      const portal = req.params['portal'];
      try {
        if (!(req._fileparser && typeof req.file === 'function')) {
          return res.badRequest({ error: 'no-file' });
        }
        const files = await new Promise<any[]>((resolve, reject) => {
          try { req.file('logo').upload((err, uploaded) => err ? reject(err) : resolve(uploaded)); } catch(e) { resolve([]); }
        });
        if (!files || !files.length) return res.badRequest({ error: 'no-file' });
        const f = files[0];
        const fs = require('fs').promises;
        const buf = await fs.readFile(f.fd);
        const { hash } = await BrandingLogoService.putLogo({ branding, portal, fileBuffer: buf, contentType: f.type });
        return res.ok({ hash });
      } catch(e: any){
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }
    async history(req: Request, res: Response){
      const branding = req.params['branding'];
      
      try {
        const brand = await BrandingService.getBrand(branding);
        if(!brand) throw new Error('branding-not-found');
        const histories = await BrandingConfigHistory.find({ branding: brand.id }).sort('version ASC');
        return res.ok(histories);
      } catch(e:any){
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }
  }
}

module.exports = new Controllers.Branding().exports();
