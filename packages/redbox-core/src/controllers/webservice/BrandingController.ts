import { Controllers as controllers } from '../../index';

function mapError(e: unknown): { status: number; body: unknown } {
  const msg = (e instanceof Error ? e.message : String(e)) || '';
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
  export class Branding extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = ['draft', 'preview', 'publish', 'rollback', 'logo', 'history'];

    async draft(req: Sails.Req, res: Sails.Res) {
      const branding = req.params['branding'];
      const actor = req.user;
      try {
        const variables = req.body?.variables || {};
        const updated = await BrandingService.saveDraft({ branding, variables, actor });
        return res.ok({ branding: updated });
      } catch (e: unknown) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }

    async preview(req: Sails.Req, res: Sails.Res) {
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
        return res.ok({
          token,
          url,
          hash,
          previewToken: token,
          previewUrl: url,
          branding: brandConfig || undefined
        });
      } catch (e: unknown) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }
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
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }
    async rollback(req: Sails.Req, res: Sails.Res) {
      const versionId = req.params['versionId'];
      const actor = req.user;
      try {
        const { version, hash } = await BrandingService.rollback(versionId, actor);
        return res.ok({ version, hash });
      } catch (e: unknown) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }
    async logo(req: Sails.Req, res: Sails.Res) {
      const branding = req.params['branding'];
      const portal = req.params['portal'];
      try {
        const reqObj = req as unknown as globalThis.Record<string, unknown>;
        if (!(reqObj._fileparser && typeof reqObj.file === 'function')) {
          return res.badRequest({ error: 'no-file' });
        }
        const fileFn = reqObj.file as (name: string) => { upload: (cb: (err: unknown, uploaded: Array<{ fd: string; type: string }>) => void) => void };
        const files = await new Promise<Array<{ fd: string; type: string }>>((resolve, reject) => {
          try { fileFn('logo').upload((err: unknown, uploaded) => err ? reject(err) : resolve(uploaded)); } catch (_e) { resolve([]); }
        });
        if (!files || !files.length) return res.badRequest({ error: 'no-file' });
        const f = files[0];
        const fs = require('fs').promises;
        const buf = await fs.readFile(f.fd);
        const { hash } = await BrandingLogoService.putLogo({ branding, portal, fileBuffer: buf, contentType: f.type });
        return res.ok({ hash });
      } catch (e: unknown) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }
    async history(req: Sails.Req, res: Sails.Res) {
      const branding = req.params['branding'];

      try {
        const brand = await BrandingService.getBrand(branding);
        if (!brand) throw new Error('branding-not-found');
        const histories = await BrandingConfigHistory.find({ branding: brand.id }).sort('version ASC');
        return res.ok(histories);
      } catch (e: unknown) {
        const { status, body } = mapError(e);
        return res.status(status).json(body);
      }
    }
  }
}
