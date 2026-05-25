/**
 * Branding App Controller
 * Endpoints consumed by the Angular admin UI (session / cookie auth, CSRF enabled by default)
 */
import { Controllers as controllers } from '../CoreController';
import * as BrandingServiceModule from '../services/BrandingService';
import * as BrandingLogoServiceModule from '../services/BrandingLogoService';
import { getRouteParam } from '../utilities/RequestParamUtils';
import {BrandingModel} from "../model";

// sails is available globally via sails.ts
declare const BrandingService: BrandingServiceModule.Services.Branding;
declare const BrandingLogoService: BrandingLogoServiceModule.Services.BrandingLogo;

function mapError(e: Error): { status: number; body: {error?: string, detail?: string} } {
  const msg = e.message || '';
  if (msg === 'unauthorized') return { status: 403, body: { error: 'forbidden' } };
  if (msg.startsWith('Invalid variable key') || msg.startsWith('Invalid variable value')) return { status: 400, body: { error: 'invalid-variable', detail: msg } };
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
        const branding = getRouteParam(req, 'branding');
        this.updateChronicle(req, {brandingAppBranding: branding});
        const brand = BrandingService.getBrand(branding);
        if (!brand) {
          this.updateChronicle(req, {brandingAppBrandMissing: true});
          return res.status(404).json({ error: 'branding-not-found' });
        }
        this.updateChronicle(req, {brandingAppRetrieveSuccess: true});
        return res.ok({ branding: brand });
      } catch (e: unknown) {
        const { status, body } = mapError(e as Error);
        this.updateChronicle(req, {brandingAppErrorCode: body?.error}, [e]);
        return res.status(status).json(body);
      }
    }

    /** 9.2 Save draft variables */
    async draft(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      this.updateChronicle(req, {brandingAppBranding: branding});
      const actor = req.user;
      // Validate variables if provided
      const variablesInput = req.body?.variables;
      if (variablesInput !== undefined && variablesInput !== null) {
        if (typeof variablesInput !== 'object' || Array.isArray(variablesInput)) {
          this.updateChronicle(req, {brandingAppInvalidVariables: variablesInput}, ['Invalid variables in request body']);
          return res.status(400).json({ error: 'Invalid variables in request body' });
        }
      }

      // Coerce variables to empty object if missing
      const variables = variablesInput || {};

      try {
        const updated = await BrandingService.saveDraft({ branding, variables, actor });
        this.updateChronicle(req, {brandingAppRetrieveSuccess: true});
        return res.ok({ branding: updated });
      } catch (e: unknown) {
        const { status, body } = mapError(e as Error);
        this.updateChronicle(req, {brandingAppErrorCode: body?.error}, [e]);
        return res.status(status).json(body);
      }
    }

    /** 9.3 Create preview token */
    async preview(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const portal = getRouteParam(req, 'portal');
      this.updateChronicle(req, {brandingAppBranding: branding, brandingAppPortal: portal});
      try {
        const { token, url, hash } = await BrandingService.preview(branding, portal);
        this.updateChronicle(req, {brandingAppPreviewUrl: url});
        let brandConfig: BrandingModel | undefined = undefined;
        try {
          brandConfig = await BrandingService.getBrandingFromDB(branding);
          this.updateChronicle(req, {brandingAppPreviewConfigId: brandConfig?.id});
        } catch (e) {
          this.updateChronicle(req, {brandingAppPreviewError: true}, [e]);
        }
        this.updateChronicle(req, {brandingAppRetrieveSuccess: true});
        return res.ok({ token, url, hash, previewToken: token, previewUrl: url, branding: brandConfig || undefined });
      } catch (e: unknown) {
        const { status, body } = mapError(e as Error);
        this.updateChronicle(req, {brandingAppErrorCode: body?.error}, [e]);
        return res.status(status).json(body);
      }
    }

    /** 9.4 Publish draft */
    async publish(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const portal = getRouteParam(req, 'portal');
      this.updateChronicle(req, {brandingAppBranding: branding, brandingAppPortal: portal});
      const actor = req.user;
      try {
        const expectedVersion = req.body?.expectedVersion;
        this.updateChronicle(req, {brandingAppExpectedVersion: expectedVersion});
        const { version, hash, idempotent } = await BrandingService.publish(branding, portal, actor, { expectedVersion });
        const body: globalThis.Record<string, unknown> = { version, hash };
        if (idempotent) body.idempotent = true;
        this.updateChronicle(req, {brandingAppRetrieveSuccess: true, brandingAppVersion: version, brandingAppIdempotent: idempotent});
        return res.ok(body);
      } catch (e: unknown) {
        const { status, body } = mapError(e as Error);
        this.updateChronicle(req, {brandingAppErrorCode: body?.error}, [e]);
        return res.status(status).json(body);
      }
    }

    /** 9.5 Upload logo */
    async logo(req: Sails.Req, res: Sails.Res) {
      const branding = getRouteParam(req, 'branding');
      const portal = getRouteParam(req, 'portal');
      this.updateChronicle(req, {brandingAppBranding: branding, brandingAppPortal: portal});
      try {
        if (!(req._fileparser && typeof (req as globalThis.Record<string, unknown>).file === 'function')) {
          this.updateChronicle(req, {brandingAppErrorCode: 'no-file'}, ['no-file']);
          return res.badRequest({ error: 'no-file' });
        }
        const files = await new Promise<globalThis.Record<string, unknown>[]>((resolve, reject) => {
          try {
            const func = (req as globalThis.Record<string, unknown>).file as (name: string) => { upload: (cb: (err: unknown, uploaded: globalThis.Record<string, unknown>[]) => void) => void };
            const funcResult = func('logo');
            funcResult.upload((err: unknown, uploaded: globalThis.Record<string, unknown>[]) => err ? reject(err) : resolve(uploaded));
          } catch (_e) {
            resolve([]);
          }
        });
        this.updateChronicle(req, {brandingAppLogsFiles: files});
        if (!files || !files.length) {
          this.updateChronicle(req, {brandingAppErrorCode: 'no-file'}, ['no-file']);
          return res.badRequest({ error: 'no-file' });
        }
        const f = files[0];
        const fs = require('fs').promises;
        const buf = await fs.readFile(f.fd);
        try {
          const { hash } = await BrandingLogoService.putLogo({ branding, portal, fileBuffer: buf, contentType: f.type as string });
          await fs.unlink(f.fd);
          this.updateChronicle(req, {brandingAppRetrieveSuccess: true, brandingAppLogoHash: hash});
          return res.ok({ hash });
        } catch (e) {
          await fs.unlink(f.fd);
          throw e;
        }
      } catch (e: unknown) {
        const { status, body } = mapError(e as Error);
        this.updateChronicle(req, {brandingAppErrorCode: body?.error}, [e]);
        return res.status(status).json(body);
      }
    }
  }
}
