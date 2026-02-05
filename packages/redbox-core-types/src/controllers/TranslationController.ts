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
import * as path from 'node:path';
import * as fs from 'node:fs';


export namespace Controllers {
  /**
   * TranslationController - serves i18next namespace JSON for http-backend.
   */
  export class Translation extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: any = [
      'getNamespace',
      'getLanguages',
      'listEntriesApp',
      'setEntryApp',
      'getBundleApp',
      'setBundleApp'
    ];

    public async getNamespace(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = req.params.branding;
        const lng = req.params.lng;
        const ns = req.params.ns || 'translation';

        const branding = BrandingService.getBrand(brandingName);
        if (!branding) {
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }

        let bundle = await I18nEntriesService.getBundle(branding, lng, ns);

        if (!bundle) {
          const entries = await I18nEntriesService.listEntries(branding, lng, ns);
          if (entries && entries.length > 0) {
            bundle = { data: I18nEntriesService.composeNamespace(entries) } as any;
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
     * Combines configured languages with any detected from DB bundles.
     * Returns a list of objects with code, displayName, and enabled.
     */
    public async getLanguages(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = req.params.branding;
        const branding = BrandingService.getBrand(brandingName);
        if (!branding) {
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }

        const langCodes = new Set<string>();
        const configured = sails?.config?.i18n?.next?.init?.supportedLngs;
        if (Array.isArray(configured)) configured.forEach((l: string) => l && langCodes.add(l));

        // From DB bundles using I18nEntriesService
        const bundles: any[] = await I18nEntriesService.listBundles(branding);
        bundles.forEach((b: any) => b?.locale && langCodes.add(b.locale));

        const codes = Array.from(langCodes);
        const bundleMap = new Map(bundles.map(b => [b.locale, b]));

        const list = await Promise.all(codes.map(async code => {
          const bundle = bundleMap.get(code);
          return {
            code: code,
            displayName: bundle?.displayName || await I18nEntriesService.getLanguageDisplayName(code),
            enabled: bundle?.enabled !== false // defaults to true if not set
          };
        }));

        list.sort((a, b) => a.displayName.localeCompare(b.displayName));
        return res.json(list);
      } catch (err) {
        sails.log.error('Error in TranslationController.getLanguages:', err);
        return res.serverError(err);
      }
    }

    /**
     * Angular app endpoints (CSRF-enabled by default)
     */
    public async listEntriesApp(req: Sails.Req, res: Sails.Res) {
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

    public async setEntryApp(req: Sails.Req, res: Sails.Res) {
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
        try { TranslationService.reloadResources(); } catch (e: unknown) { sails.log.warn('[TranslationController.setEntryApp] reload failed', e instanceof Error ? e.message : String(e)); }
        return res.json(saved);
      } catch (err) {
        sails.log.error('Error in TranslationController.setEntryApp:', err);
        return res.serverError(err);
      }
    }

    public async getBundleApp(req: Sails.Req, res: Sails.Res) {
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

    public async setBundleApp(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = req.params.branding;
        const branding = BrandingService.getBrand(brandingName);
        if (!branding) return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const data = req.body?.data || req.body;
        const displayName = req.body?.displayName;
        const bundle = await I18nEntriesService.setBundle(branding, locale, namespace, data, displayName);
        try { TranslationService.reloadResources(); } catch (e: unknown) { sails.log.warn('[TranslationController.setBundleApp] reload failed', e instanceof Error ? e.message : String(e)); }
        return res.json(bundle);
      } catch (err) {
        sails.log.error('Error in TranslationController.setBundleApp:', err);
        return res.serverError(err);
      }
    }
  }
}
