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

import { translationTarget, translationDisplayNameBody, revertTranslationBody, translationImportBody, translationImportApplyBody, translationImportMaxBytes } from '../api-routes/groups/admin-translation';
import { Controllers as controllers } from '../CoreController';
import * as path from 'node:path';
import * as fs from 'node:fs';
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
      'previewImport', 'applyImport', 'exportBundle',
      'languageSummaries', 'editorEntries', 'revertEntry',
      'updateDisplayName',
      'getNamespace',
      'getLanguages',
      'listEntriesApp',
      'setEntryApp',
      'getBundleApp',
      'setBundleApp'
    ];

    private adminBrand(req: Sails.Req, res: Sails.Res) {
      const brand = BrandingService.getBrand(toParamString(req.params.branding));
      if (!brand) { res.badRequest({ message: 'Unknown branding' }); return null; }
      const admin = RolesService.getAdminFromBrand(brand);
      if (!req.user || !admin || !UsersService.hasRole(req.user, admin)) {
        res.forbidden({ message: 'Brand Admin permission required' });
        return null;
      }
      return brand;
    }

    public async languageSummaries(req: Sails.Req, res: Sails.Res) {
      const brand = this.adminBrand(req, res);
      if (!brand) return;
      try { return res.json(await I18nEntriesService.languageSummaries(brand)); }
      catch (_error) { return res.serverError({ message: 'Unable to load language counts' }); }
    }

    public async editorEntries(req: Sails.Req, res: Sails.Res) {
      const brand = this.adminBrand(req, res);
      if (!brand) return;
      const target = translationTarget.safeParse(req.params);
      if (!target.success) return res.badRequest({ message: 'Invalid language' });
      try {
        const rows = await I18nEntriesService.editorEntries(brand, target.data.locale, target.data.namespace);
        return rows ? res.json(rows) : res.notFound({ message: 'Bundle not found' });
      } catch (_error) { return res.serverError({ message: 'Unable to load translation provenance' }); }
    }

    public async revertEntry(req: Sails.Req, res: Sails.Res) {
      const brand = this.adminBrand(req, res);
      if (!brand) return;
      const target = translationTarget.safeParse(req.params);
      const body = revertTranslationBody.safeParse(req.body);
      if (!target.success || !body.success) return res.badRequest({ message: 'Invalid revert request' });
      try {
        const result = await I18nEntriesService.revertEntry(brand, target.data.locale, target.data.namespace, body.data.key);
        return result ? res.json(result) : res.notFound({ message: 'Bundle or default key not found' });
      } catch (_error) { return res.serverError({ message: 'Unable to revert translation' }); }
    }

    public async exportBundle(req: Sails.Req, res: Sails.Res) {
      const brand = this.adminBrand(req, res);
      if (!brand) return;
      const target = translationTarget.safeParse(req.params);
      if (!target.success || (req.query?.overridesOnly !== undefined && !['true', 'false'].includes(String(req.query.overridesOnly)))) {
        return res.badRequest({ message: 'Invalid export request' });
      }
      try {
        const { locale, namespace } = target.data;
        const data = await I18nEntriesService.exportBundle(brand, locale, namespace, req.query?.overridesOnly === 'true');
        if (!data) return res.notFound({ message: 'Bundle not found' });
        res.set('Content-Disposition', `attachment; filename="translations-${locale}-${namespace}.json"`);
        res.set('X-Content-Type-Options', 'nosniff');
        return res.json(data);
      } catch (_error) { return res.serverError({ message: 'Unable to export translations' }); }
    }

    private async importRequest(req: Sails.Req, res: Sails.Res, apply: boolean) {
      const brand = this.adminBrand(req, res);
      if (!brand) return;
      const target = translationTarget.safeParse(req.params);
      if (typeof req.body?.json === 'string' && Buffer.byteLength(req.body.json, 'utf8') > translationImportMaxBytes) {
        return res.status(413).json({ message: 'Import exceeds 2 MiB' });
      }
      const body = (apply ? translationImportApplyBody : translationImportBody).safeParse(req.body);
      if (!target.success || !body.success) return res.badRequest({ message: 'Invalid import request' });
      try {
        const { locale, namespace } = target.data;
        const { json, keepUnknown } = body.data;
        const result = apply
          ? await I18nEntriesService.applyImport(brand, locale, namespace, json, keepUnknown, req.body.previewToken)
          : await I18nEntriesService.previewImport(brand, locale, namespace, json, keepUnknown);
        return res.json(result);
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (typeof status === 'number' && [400, 404, 409, 413].includes(status)) return res.status(status).json({ message: (error as Error).message });
        return res.serverError({ message: 'Unable to process translation import' });
      }
    }

    public async previewImport(req: Sails.Req, res: Sails.Res) { return this.importRequest(req, res, false); }
    public async applyImport(req: Sails.Req, res: Sails.Res) { return this.importRequest(req, res, true); }

    public async updateDisplayName(req: Sails.Req, res: Sails.Res) {
      const brand = this.adminBrand(req, res);
      if (!brand) return;
      const target = translationTarget.safeParse(req.params);
      const body = translationDisplayNameBody.safeParse(req.body);
      if (!target.success || !body.success) return res.badRequest({ message: 'Invalid language metadata' });
      try {
        const result = await I18nEntriesService.updateDisplayName(brand, target.data.locale, target.data.namespace, body.data.displayName);
        return result ? res.json(result) : res.notFound({ message: 'Bundle not found' });
      } catch (_error) {
        return res.serverError({ message: 'Unable to rename language' });
      }
    }

    public async getNamespace(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = toParamString(req.params.branding);
        const lng = toParamString(req.params.lng);
        const ns = toParamString(req.params.ns, 'translation');

        const branding = BrandingService.getBrand(brandingName);
        this.updateChronicle(req, {translationBranding: brandingName, translationBrandingId: branding?.id, translationLng: lng, translationNs: ns});
        if (!branding) {
          this.updateChronicle(req, {translationBrandingUnknown: true});
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }

        let bundle = await I18nEntriesService.getBundle(branding, lng, ns);

        if (!bundle) {
          const entries = await I18nEntriesService.listEntries(branding, lng, ns);
          if (entries && entries.length > 0) {
            bundle = { data: I18nEntriesService.composeNamespace(entries) } as NonNullable<typeof bundle>;
          }
        }

        if (!bundle) {
          const filepath = path.join(sails.config.appPath, 'language-defaults', lng, `${ns}.json`);
          if (fs.existsSync(filepath)) {
            const json = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            this.updateChronicle(req, {translationBundleFromDisk: true, translationFile: filepath});
            return res.json(json);
          }
          this.updateChronicle(req, {translationNamespaceNotFound: true});
          return res.notFound({ message: 'Namespace not found' });
        }

        // If bundle contains metadata at _meta, do not include that when serving i18next namespace
        const payload = bundle.data || {};
        if (payload && typeof payload === 'object' && payload._meta) {
          try {
            const { _meta, ...rest } = payload;
            this.updateChronicle(req, {translationRemoveMetaSuccess: true});
            return res.json(rest);
          } catch (e) {
            this.updateChronicle(req, {translationRemoveMetaFailed: true}, [e]);
          }
        }
        this.updateChronicle(req, {translationGetNamespaceSuccess: true});
        return res.json(payload);
      } catch (err) {
        this.updateChronicle(req, {translationGetNamespaceFailed: true});
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
        this.updateChronicle(req, {translationBranding: brandingName, translationBrandingId: branding?.id});
        if (!branding) {
          this.updateChronicle(req, {translationBrandingUnknown: true});
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }

        const langCodes = new Set<string>();
        const configured = sails?.config?.i18n?.next?.init?.supportedLngs;
        if (Array.isArray(configured)) configured.forEach((l: string) => l && langCodes.add(l));

        // From DB bundles using I18nEntriesService
        const bundles = await I18nEntriesService.listBundles(branding);
        bundles.forEach((b) => b?.locale && langCodes.add(b.locale));

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
        this.updateChronicle(req, {translationGetLanguagesSuccess: true, translationLanguageCount: list.length});
        return res.json(list);
      } catch (err) {
        this.updateChronicle(req, {translationGetLanguagesFailed: true});
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
        this.updateChronicle(req, {translationBranding: brandingName, translationBrandingId: branding?.id});
        if (!branding) {
          this.updateChronicle(req, {translationBrandingUnknown: true});
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
        this.updateChronicle(req, {translationListEntriesSuccess: true});
        return res.json(entries);
      } catch (err) {
        this.updateChronicle(req, {translationListEntriesFailed: true});
        return res.serverError(err);
      }
    }

    public async setEntryApp(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = toParamString(req.params.branding);
        const branding = BrandingService.getBrand(brandingName);
        this.updateChronicle(req, {translationBranding: brandingName, translationBrandingId: branding?.id});
        if (!branding) {
          this.updateChronicle(req, {translationBrandingUnknown: true});
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
        const saved = await I18nEntriesService.setEntry(branding, locale, namespace, key, value, { category, contentFormat,description });
        try {
          await TranslationService.reloadResources();
        } catch (e) {
          this.updateChronicle(req, {translationReloadFailed: true}, [e]);
        }
        this.updateChronicle(req, {translationSetEntrySuccess: true});
        try {
          const defaults = await I18nEntriesService.defaultValues(locale, namespace);
          const hasDefault = Object.prototype.hasOwnProperty.call(defaults, key);
          const valueForProvenance = String(saved?.value ?? '');
          return res.json({ ...saved, hasDefault, provenance: hasDefault && !valueForProvenance.trim() ? 'missing'
            : hasDefault && valueForProvenance === defaults[key] ? 'default' : 'override' });
        } catch (_error) {
          // A secondary provenance read must not turn a committed save into a failure.
          this.updateChronicle(req, { translationProvenanceUnavailable: true });
          return res.json(saved);
        }
      } catch (err) {
        this.updateChronicle(req, {translationSetEntryFailed: true});
        return res.serverError(err);
      }
    }

    public async getBundleApp(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = toParamString(req.params.branding);
        const branding = BrandingService.getBrand(brandingName);
        this.updateChronicle(req, {translationBranding: brandingName, translationBrandingId: branding?.id});
        if (!branding) {
          this.updateChronicle(req, {translationBrandingUnknown: true});
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        this.updateChronicle(req, {translationLocale: locale, translationNamespace: namespace});
        const bundle = await I18nEntriesService.getBundle(branding, locale, namespace);
        if (!bundle) {
          this.updateChronicle(req, {translationBundleNotFound: true});
          return res.notFound({ message: 'Bundle not found' });
        }
        this.updateChronicle(req, {translationGetBundleSuccess: true});
        return res.json(bundle);
      } catch (err) {
        this.updateChronicle(req, {translationGetBundleFailed: true});
        return res.serverError(err);
      }
    }

    public async setBundleApp(req: Sails.Req, res: Sails.Res) {
      try {
        const brandingName = toParamString(req.params.branding);
        const branding = BrandingService.getBrand(brandingName);
        this.updateChronicle(req, {translationBranding: brandingName, translationBrandingId: branding?.id});
        if (!branding) {
          this.updateChronicle(req, {translationBrandingUnknown: true});
          return res.badRequest({ message: `Unknown branding: ${brandingName}` });
        }
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const data = req.body?.data || req.body;
        const displayName = req.body?.displayName;
        this.updateChronicle(req, {translationLocale: locale, translationNamespace: namespace, translationDisplayName: displayName});
        const bundle = await I18nEntriesService.setBundle(branding, locale, namespace, data, displayName);
        try {
          await TranslationService.reloadResources();
        } catch (e) {
          this.updateChronicle(req, {translationReloadFailed: true}, [e]);
        }
        this.updateChronicle(req, {translationSetBundleSuccess: true});
        return res.json(bundle);
      } catch (err) {
        this.updateChronicle(req, {translationSetBundleFailed: true});
        return res.serverError(err);
      }
    }
  }
}
