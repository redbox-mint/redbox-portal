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

declare var module;
declare var sails;
declare var BrandingService;
declare var I18nBundle;
declare var I18nTranslation;
declare var I18nEntriesService;
declare var TranslationService;

import { Controllers as controllers, PopulateExportedMethods } from '@researchdatabox/redbox-core-types';
import * as path from 'node:path';
import * as fs from 'node:fs';

export module Controllers {
  /**
   * TranslationController - serves i18next namespace JSON for http-backend.
   */
  @PopulateExportedMethods
  export class Translation extends controllers.Core.Controller {
  

    public async getNamespace(req, res) {
      try {
        const brandingName = req.params.branding;
        const lng = req.params.lng;
        const ns = req.params.ns || 'translation';

        const branding = BrandingService.getBrand(brandingName);
        if (!branding) {
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }

        let bundle = await I18nBundle.findOne({ branding: branding.id, locale: lng, namespace: ns });

        if (!bundle) {
          const entries = await I18nTranslation.find({ branding: branding.id, locale: lng, namespace: ns });
          if (entries && entries.length > 0) {
            const flat = {} as any;
            for (const e of entries) flat[e.key] = e.value;
            bundle = { data: this.unflatten(flat) } as any;
          }
        }

        if (!bundle) {
          const filepath = path.join(sails.config.appPath, 'language-defaults', lng, `${ns}.json`);
          if (fs.existsSync(filepath)) {
            const json = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            return res.json(json);
          }
          return res.notFound({ message: 'Namespace not found' });
        }

        // If bundle contains metadata at _meta, do not include that when serving i18next namespace
        const payload = bundle.data || {};
        if (payload && typeof payload === 'object' && payload._meta) {
          try {
            const { _meta, ...rest } = payload;
            return res.json(rest);
          } catch (_e) {
            // fallback
          }
        }
        return res.json(payload);
      } catch (err) {
        sails.log.error('Error in TranslationController.getNamespace:', err);
        return res.serverError(err);
      }
    }

    /**
     * Return the list of supported languages for the current branding/portal.
     * Combines configured languages with any detected from DB bundles and assets/locales.
     */
    public async getLanguages(req, res) {
      try {
        const brandingName = req.params.branding;
        const branding = BrandingService.getBrand(brandingName);
        if (!branding) {
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }

        const langs = new Set<string>();
        const configured = sails?.config?.i18n?.next?.init?.supportedLngs;
        if (Array.isArray(configured)) configured.forEach((l: string) => l && langs.add(l));

        // From DB bundles
        try {
          const bundles = await I18nBundle.find({ branding: branding.id });
          bundles.forEach((b: any) => b?.locale && langs.add(b.locale));
        } catch (e) {
          sails.log.verbose('getLanguages: skipping DB scan due to error:', e?.message || e);
        }

        // From language-defaults directory
        try {
          const localesDir = path.join(sails.config.appPath, 'language-defaults');
          if (fs.existsSync(localesDir)) {
            const entries = fs.readdirSync(localesDir, { withFileTypes: true });
            entries.filter(d => d.isDirectory()).forEach(d => langs.add(d.name));
          }
        } catch (e) {
          sails.log.verbose('getLanguages: skipping filesystem scan due to error:', e?.message || e);
        }

        const list = Array.from(langs);
        list.sort();
        return res.json(list);
      } catch (err) {
        sails.log.error('Error in TranslationController.getLanguages:', err);
        return res.serverError(err);
      }
    }

    private unflatten(flatObj: any): any {
      const result: any = {};
      Object.keys(flatObj || {}).forEach(flatKey => {
        const parts = flatKey.split('.');
        let cursor = result;
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (i === parts.length - 1) {
            cursor[p] = flatObj[flatKey];
          } else {
            if (cursor[p] == null || typeof cursor[p] !== 'object') cursor[p] = {};
            cursor = cursor[p];
          }
        }
      });
      return result;
    }

    /**
     * Angular app endpoints (CSRF-enabled by default)
     */
    public async listEntriesApp(req, res) {
      try {
        const brandingName = req.params.branding;
        const branding = BrandingService.getBrand(brandingName);
        if (!branding) return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const keyPrefix = req.param('keyPrefix');
        const entries = await I18nEntriesService.listEntries(branding, locale, namespace, keyPrefix);
        return res.json(entries);
      } catch (err) {
        sails.log.error('Error in TranslationController.listEntriesApp:', err);
        return res.serverError(err);
      }
    }

    public async setEntryApp(req, res) {
      try {
        const brandingName = req.params.branding;
        const branding = BrandingService.getBrand(brandingName);
        if (!branding) return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const key = req.param('key');
        const value = req.body?.value;
        const category = req.body?.category;
        const description = req.body?.description;
        const saved = await I18nEntriesService.setEntry(branding, locale, namespace, key, value, { category, description });
        try { TranslationService.reloadResources(); } catch (e) { sails.log.warn('[TranslationController.setEntryApp] reload failed', e?.message || e); }
        return res.json(saved);
      } catch (err) {
        sails.log.error('Error in TranslationController.setEntryApp:', err);
        return res.serverError(err);
      }
    }

    public async getBundleApp(req, res) {
      try {
        const brandingName = req.params.branding;
        const branding = BrandingService.getBrand(brandingName);
        if (!branding) return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const bundle = await I18nEntriesService.getBundle(branding, locale, namespace);
        if (!bundle) return res.notFound({ message: 'Bundle not found' });
        return res.json(bundle);
      } catch (err) {
        sails.log.error('Error in TranslationController.getBundleApp:', err);
        return res.serverError(err);
      }
    }

    public async setBundleApp(req, res) {
      try {
        const brandingName = req.params.branding;
        const branding = BrandingService.getBrand(brandingName);
        if (!branding) return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const data = req.body?.data || req.body;
        const displayName = req.body?.displayName;
        const bundle = await I18nEntriesService.setBundle(branding, locale, namespace, data, displayName);
        try { TranslationService.reloadResources(); } catch (e) { sails.log.warn('[TranslationController.setBundleApp] reload failed', e?.message || e); }
        return res.json(bundle);
      } catch (err) {
        sails.log.error('Error in TranslationController.setBundleApp:', err);
        return res.serverError(err);
      }
    }
  }
}

module.exports = new Controllers.Translation().exports();
