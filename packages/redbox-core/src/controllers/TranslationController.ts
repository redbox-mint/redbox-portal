// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { Controllers as controllers } from '../CoreController';
import { toParamString } from '../utilities/RequestParamUtils';

export namespace Controllers {
  /**
   * TranslationController - serves i18next namespace JSON for http-backend.
   */
  export class Translation extends controllers.Core.Controller {
    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'getNamespace',
      'getLanguages',
      'listEntriesApp',
      'setEntryApp',
      'getBundleApp',
      'setBundleApp',
    ];

    public async getNamespace(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = toParamString(req.params.branding);
        const lng = toParamString(req.params.lng);
        const ns = toParamString(req.params.ns, 'translation');

        const branding = BrandingService.getBrand(brandingName);
        this.updateChronicle(req, {
          translationBranding: brandingName,
          translationBrandingId: branding?.id,
          translationLng: lng,
          translationNs: ns,
        });
        if (!branding) {
          this.updateChronicle(req, { translationBrandingUnknown: true });
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }

        const payload = await I18nEntriesService.getNamespace(branding, lng, ns);
        if (payload === null) return res.notFound({ message: 'Namespace not found' });
        return res.json(payload);
      } catch (err) {
        this.updateChronicle(req, { translationGetNamespaceFailed: true });
        return res.serverError(err);
      }
    }

    /**
     * Return the list of supported languages for the current branding/portal.
     * Combines configured languages with any detected from DB bundles.
     * Returns a list of objects with code, displayName, and enabled.
     */
    public async getLanguages(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = toParamString(req.params.branding);
        const branding = BrandingService.getBrand(brandingName);
        this.updateChronicle(req, { translationBranding: brandingName, translationBrandingId: branding?.id });
        if (!branding) {
          this.updateChronicle(req, { translationBrandingUnknown: true });
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }

        return res.json(await I18nEntriesService.listLanguages(branding));
      } catch (err) {
        this.updateChronicle(req, { translationGetLanguagesFailed: true });
        return res.serverError(err);
      }
    }

    /**
     * Angular app endpoints (CSRF-enabled by default)
     */
    public async listEntriesApp(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = toParamString(req.params.branding);
        const branding = BrandingService.getBrand(brandingName);
        this.updateChronicle(req, { translationBranding: brandingName, translationBrandingId: branding?.id });
        if (!branding) {
          this.updateChronicle(req, { translationBrandingUnknown: true });
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const keyPrefix = req.param('keyPrefix');
        this.updateChronicle(req, {
          translationLocale: locale,
          translationNamespace: namespace,
          translationKeyPrefix: keyPrefix,
        });
        const entries = await I18nEntriesService.listEntries(branding, locale, namespace, keyPrefix);
        this.updateChronicle(req, { translationListEntriesSuccess: true });
        return res.json(entries);
      } catch (err) {
        this.updateChronicle(req, { translationListEntriesFailed: true });
        return res.serverError(err);
      }
    }

    public async setEntryApp(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = toParamString(req.params.branding);
        const branding = BrandingService.getBrand(brandingName);
        this.updateChronicle(req, { translationBranding: brandingName, translationBrandingId: branding?.id });
        if (!branding) {
          this.updateChronicle(req, { translationBrandingUnknown: true });
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const key = req.param('key');
        const value = req.body?.value;
        const category = req.body?.category;
        const contentFormat = req.body?.contentFormat;
        const description = req.body?.description;
        this.updateChronicle(req, {
          translationLocale: locale,
          translationNamespace: namespace,
          translationKey: key,
          translationCategory: category,
        });
        const saved = await I18nEntriesService.setEntry(branding, locale, namespace, key, value, {
          category,
          contentFormat,
          description,
        });
        try {
          await TranslationService.reloadResources();
        } catch (e) {
          this.updateChronicle(req, { translationReloadFailed: true }, [e]);
        }
        this.updateChronicle(req, { translationSetEntrySuccess: true });
        return res.json(saved);
      } catch (err) {
        this.updateChronicle(req, { translationSetEntryFailed: true });
        return res.serverError(err);
      }
    }

    public async getBundleApp(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = toParamString(req.params.branding);
        const branding = BrandingService.getBrand(brandingName);
        this.updateChronicle(req, { translationBranding: brandingName, translationBrandingId: branding?.id });
        if (!branding) {
          this.updateChronicle(req, { translationBrandingUnknown: true });
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        this.updateChronicle(req, { translationLocale: locale, translationNamespace: namespace });
        const bundle = await I18nEntriesService.getBundle(branding, locale, namespace);
        if (!bundle) {
          this.updateChronicle(req, { translationBundleNotFound: true });
          return res.notFound({ message: 'Bundle not found' });
        }
        this.updateChronicle(req, { translationGetBundleSuccess: true });
        return res.json(bundle);
      } catch (err) {
        this.updateChronicle(req, { translationGetBundleFailed: true });
        return res.serverError(err);
      }
    }

    public async setBundleApp(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = toParamString(req.params.branding);
        const branding = BrandingService.getBrand(brandingName);
        this.updateChronicle(req, { translationBranding: brandingName, translationBrandingId: branding?.id });
        if (!branding) {
          this.updateChronicle(req, { translationBrandingUnknown: true });
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const data = req.body?.data || req.body;
        const displayName = req.body?.displayName;
        this.updateChronicle(req, {
          translationLocale: locale,
          translationNamespace: namespace,
          translationDisplayName: displayName,
        });
        const bundle = await I18nEntriesService.setBundle(branding, locale, namespace, data, displayName);
        try {
          await TranslationService.reloadResources();
        } catch (e) {
          this.updateChronicle(req, { translationReloadFailed: true }, [e]);
        }
        this.updateChronicle(req, { translationSetBundleSuccess: true });
        return res.json(bundle);
      } catch (err) {
        this.updateChronicle(req, { translationSetBundleFailed: true });
        return res.serverError(err);
      }
    }
  }
}
