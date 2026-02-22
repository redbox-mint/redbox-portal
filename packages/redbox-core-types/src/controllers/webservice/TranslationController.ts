import { APIActionResponse, APIErrorResponse, BrandingModel, Controllers as controllers } from '../../index';

export namespace Controllers {
  /**
   * Webservice TranslationController: manage language content via REST.
   */
  export class Translation extends controllers.Core.Controller {
    private asError(err: unknown): Error {
      return err instanceof Error ? err : new Error(String(err));
    }
    protected override _exportedMethods: string[] = [
      'listEntries',
      'getEntry',
      'setEntry',
      'deleteEntry',
      'getBundle',
      'setBundle',
      'updateBundleEnabled'
    ];

    public async listEntries(req: Sails.Req, res: Sails.Res) {
      try {
        const brandName: string = BrandingService.getBrandNameFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const keyPrefix = req.param('keyPrefix');

        const entries = await I18nEntriesService.listEntries(branding, locale, namespace, keyPrefix);
        // Ensure metadata fields are included in the response
        return this.apiRespond(req, res, entries, 200);
      } catch (error) {
        const err = this.asError(error);
        const errorResponse = new APIErrorResponse(err.message);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async getEntry(req: Sails.Req, res: Sails.Res) {
      try {
        const brandName: string = BrandingService.getBrandNameFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const key = req.param('key');

        const entry = await I18nEntriesService.getEntry(branding, locale, namespace, key);
        if (!entry) {
          const errorResponse = new APIErrorResponse('Entry not found');
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders()
          });
        }
        return this.apiRespond(req, res, entry, 200);
      } catch (error) {
        const err = this.asError(error);
        const errorResponse = new APIErrorResponse(err.message);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async setEntry(req: Sails.Req, res: Sails.Res) {
      try {
        const brandName: string = BrandingService.getBrandNameFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const key = req.param('key');
        const value = req.body?.value;
        const category = req.body?.category;
        const description = req.body?.description;

        const saved = await I18nEntriesService.setEntry(branding, locale, namespace, key, value, { category, description });
        // Auto-refresh server-side i18n cache; best-effort and non-blocking
        try { TranslationService.reloadResources(); } catch (e) { const err = this.asError(e); sails.log.warn('[TranslationController.setEntry] reload failed', err.message); }
        return this.apiRespond(req, res, saved, 200);
      } catch (error) {
        const err = this.asError(error);
        const errorResponse = new APIErrorResponse(err.message);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async deleteEntry(req: Sails.Req, res: Sails.Res) {
      try {
        const brandName: string = BrandingService.getBrandNameFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const key = req.param('key');

        const ok = await I18nEntriesService.deleteEntry(branding, locale, namespace, key);
        if (!ok) {
          const errorResponse = new APIErrorResponse('Entry not found');
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders()
          });
        }
        // Refresh i18n cache after deletion
        try { TranslationService.reloadResources(); } catch (e) { const err = this.asError(e); sails.log.warn('[TranslationController.deleteEntry] reload failed', err.message); }
        return this.apiRespond(req, res, new APIActionResponse('Deleted'), 200);
      } catch (error) {
        const err = this.asError(error);
        const errorResponse = new APIErrorResponse(err.message);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async getBundle(req: Sails.Req, res: Sails.Res) {
      try {
        const brandName: string = BrandingService.getBrandNameFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';

        const bundle = await I18nEntriesService.getBundle(branding, locale, namespace);
        if (!bundle) {
          const errorResponse = new APIErrorResponse('Bundle not found');
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders()
          });
        }
        return this.apiRespond(req, res, bundle, 200);
      } catch (error) {
        const err = this.asError(error);
        const errorResponse = new APIErrorResponse(err.message);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async setBundle(req: Sails.Req, res: Sails.Res) {
      try {
        const brandName: string = BrandingService.getBrandNameFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const data = req.body?.data || req.body;
        const splitToEntries = req.param('splitToEntries') === 'true' || req.body?.splitToEntries === true;
        const overwriteEntries = req.param('overwriteEntries') === 'true' || req.body?.overwriteEntries === true;

        const bundle = await I18nEntriesService.setBundle(branding, locale, namespace, data, undefined, { splitToEntries, overwriteEntries });
        // Refresh i18n cache after bundle update
        try { TranslationService.reloadResources(); } catch (e) { const err = this.asError(e); sails.log.warn('[TranslationController.setBundle] reload failed', err.message); }
        return this.apiRespond(req, res, bundle, 200);
      } catch (error) {
        const err = this.asError(error);
        const errorResponse = new APIErrorResponse(err.message);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async updateBundleEnabled(req: Sails.Req, res: Sails.Res) {
      try {
        const brandName: string = BrandingService.getBrandNameFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const enabled = req.param('enabled') === 'true' || req.body?.enabled === true;

        const bundle = await I18nEntriesService.updateBundleEnabled(branding, locale, namespace, enabled);
        // Refresh i18n cache after bundle update
        try { TranslationService.reloadResources(); } catch (e) { const err = this.asError(e); sails.log.warn('[TranslationController.updateBundleEnabled] reload failed', err.message); }
        return this.sendResp(req, res, { data: bundle, headers: this.getNoCacheHeaders() });
      } catch (error) {
        const err = this.asError(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: err.message }],
          headers: this.getNoCacheHeaders()
        });
      }
    }
  }
}
