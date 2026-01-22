import { APIActionResponse, APIErrorResponse, BrandingModel, Controllers as controllers } from '../../index';

declare var sails: any;
declare var BrandingService: any;
declare var I18nEntriesService: any;
declare var TranslationService: any;
declare var _: any;

export module Controllers {
  /**
   * Webservice TranslationController: manage language content via REST.
   */
  export class Translation extends controllers.Core.Controller {
    protected _exportedMethods: any = [
      'listEntries',
      'getEntry',
      'setEntry',
      'deleteEntry',
      'getBundle',
      'setBundle',
      'updateBundleEnabled'
    ];

    public async listEntries(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const keyPrefix = req.param('keyPrefix');

        const entries = await I18nEntriesService.listEntries(branding, locale, namespace, keyPrefix);
        // Ensure metadata fields are included in the response
        return this.apiRespond(req, res, entries, 200);
      } catch (error) {
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    public async getEntry(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const key = req.param('key');

        const entry = await I18nEntriesService.getEntry(branding, locale, namespace, key);
        if (!entry) return this.apiFail(req, res, 404, new APIErrorResponse('Entry not found'));
        return this.apiRespond(req, res, entry, 200);
      } catch (error) {
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    public async setEntry(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const key = req.param('key');
        const value = req.body?.value;
        const category = req.body?.category;
        const description = req.body?.description;

        const saved = await I18nEntriesService.setEntry(branding, locale, namespace, key, value, { category, description });
        // Auto-refresh server-side i18n cache; best-effort and non-blocking
        try { TranslationService.reloadResources(); } catch (e) { sails.log.warn('[TranslationController.setEntry] reload failed', e?.message || e); }
        return this.apiRespond(req, res, saved, 200);
      } catch (error) {
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    public async deleteEntry(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const key = req.param('key');

        const ok = await I18nEntriesService.deleteEntry(branding, locale, namespace, key);
        if (!ok) return this.apiFail(req, res, 404, new APIErrorResponse('Entry not found'));
        // Refresh i18n cache after deletion
        try { TranslationService.reloadResources(); } catch (e) { sails.log.warn('[TranslationController.deleteEntry] reload failed', e?.message || e); }
        return this.apiRespond(req, res, new APIActionResponse('Deleted'), 200);
      } catch (error) {
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    public async getBundle(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';

        const bundle = await I18nEntriesService.getBundle(branding, locale, namespace);
        if (!bundle) return this.apiFail(req, res, 404, new APIErrorResponse('Bundle not found'));
        return this.apiRespond(req, res, bundle, 200);
      } catch (error) {
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    public async setBundle(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const data = req.body?.data || req.body;
        const splitToEntries = req.param('splitToEntries') === 'true' || req.body?.splitToEntries === true;
        const overwriteEntries = req.param('overwriteEntries') === 'true' || req.body?.overwriteEntries === true;

        const bundle = await I18nEntriesService.setBundle(branding, locale, namespace, data, undefined, { splitToEntries, overwriteEntries });
        // Refresh i18n cache after bundle update
        try { TranslationService.reloadResources(); } catch (e) { sails.log.warn('[TranslationController.setBundle] reload failed', e?.message || e); }
        return this.apiRespond(req, res, bundle, 200);
      } catch (error) {
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    public async updateBundleEnabled(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const enabled = req.param('enabled') === 'true' || req.body?.enabled === true;

        const bundle = await I18nEntriesService.updateBundleEnabled(branding, locale, namespace, enabled);
        // Refresh i18n cache after bundle update
        try { TranslationService.reloadResources(); } catch (e) { sails.log.warn('[TranslationController.updateBundleEnabled] reload failed', e?.message || e); }
        return this.ajaxRespond(req, res, bundle, 200);
      } catch (error) {
        return this.ajaxFail(req, res, error.message, null, false);
      }
    }
  }
}
