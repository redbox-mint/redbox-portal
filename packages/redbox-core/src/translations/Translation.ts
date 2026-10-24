import type { ConfigurationRepositories } from '../persistence/configuration/ConfigurationRepositories';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { InitOptions } from 'i18next';
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

import { BrandingModel } from '../model/storage/BrandingModel';
import i18next, { type i18n as I18nInstance } from 'i18next';

export interface TranslationInput {
  readonly repository: Pick<ConfigurationRepositories, 'bundles'>;
  readonly log: ILogger;
  readonly config: { i18n: { next: { init: InitOptions & { supportedLngs?: string[] } } } };
  readonly getBrand: (name: string) => BrandingModel;
  readonly availableBrands: () => string[];
}

export namespace Services {
  /**
   * Translation services...
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Translation {
    public async close(): Promise<void> {
      this.i18nextInstances = {};
    }

    public constructor(protected readonly input: TranslationInput) {}

    // Map of i18next instances per branding
    private i18nextInstances: Record<string, I18nInstance> = {};

    /**
     * Get or create an i18next instance for a specific branding
     */
    protected async getI18nextForBranding(branding: BrandingModel): Promise<I18nInstance> {
      if (!branding) {
        branding = this.input.getBrand('default');
      }
      const brandingId = branding?.id;

      if (this.i18nextInstances[brandingId]) {
        return this.i18nextInstances[brandingId];
      }

      // Create new i18next instance for this branding
      const i18nextInstance = i18next.createInstance();
      const initBase = this.input.config.i18n.next.init || {};
      const resources = await this._fetchResourcesFromDb(branding);

      // Get available languages for this branding (includes both config and DB languages)
      const availableLanguages = await this.getAvailableLanguagesForBranding(branding);

      // Debug logging
      this.input.log.debug(`Initializing i18next for branding ${branding?.id || 'default'}`);
      this.input.log.debug(`Available languages: ${JSON.stringify(availableLanguages)}`);
      this.input.log.debug(`Resources keys: ${JSON.stringify(Object.keys(resources))}`);
      // Log a sample of the resources structure
      for (const lng of Object.keys(resources)) {
        const namespaces = Object.keys(resources[lng] || {});
        this.input.log.debug(`Language '${lng}' has namespaces: ${JSON.stringify(namespaces)}`);
        for (const ns of namespaces) {
          const resourceKeys = Object.keys(resources[lng][ns] || {});
          const keyCount = resourceKeys.length;
          this.input.log.debug(`Namespace '${ns}' in '${lng}' has ${keyCount} keys`);
          if (keyCount > 0) {
            // Show first few keys as examples
            const sampleKeys = resourceKeys.slice(0, 5);
            this.input.log.debug(`Sample keys in '${lng}.${ns}': ${JSON.stringify(sampleKeys)}`);
          }
        }
      }
      this.input.log.debug(`InitBase supportedLngs: ${JSON.stringify(initBase.supportedLngs)}`);

      const initConfig = {
        ...initBase,
        lng: availableLanguages[0] ?? 'en', // Set primary language
        supportedLngs: availableLanguages, // Use the complete list of available languages
        preload: availableLanguages, // Preload all available languages
        resources,
        fallbackLng: availableLanguages, // Set fallback language
        // Ensure i18next doesn't filter out languages
        nonExplicitSupportedLngs: false,
        // Make sure all languages are loaded
        initImmediate: false,
        // Force i18next to load all languages during init
        load: 'all' as const,
      };

      this.input.log.debug('Translation initialization configuration prepared.');

      await i18nextInstance.init(initConfig);

      // After initialization, try to activate all available languages
      // by calling changeLanguage for each one to ensure they're recognized
      for (const lng of availableLanguages) {
        if (resources[lng] && Object.keys(resources[lng]).length > 0) {
          try {
            // Temporarily change to each language to activate it
            await i18nextInstance.changeLanguage(lng);
            this.input.log.debug(`Activated language: ${lng}`);
          } catch {
            this.input.log.warn(`Failed to activate language ${lng}:`);
          }
        }
      }

      // Change back to the primary language
      await i18nextInstance.changeLanguage(availableLanguages[0] ?? 'en');

      // Test translation functionality for each language
      for (const lng of availableLanguages) {
        try {
          // Get some actual keys from the resources to test with
          const namespaces = Object.keys(resources[lng] || {});
          if (namespaces.length > 0) {
            const ns = namespaces[0]; // Use first namespace
            const keys = Object.keys(resources[lng][ns] || {});
            if (keys.length > 0) {
              const testKey = keys[0]; // Use first available key
              i18nextInstance.getFixedT(lng)(testKey);
              this.input.log.debug('Translation lookup succeeded.');
            } else {
              this.input.log.debug(`No keys found for ${lng} in namespace ${ns}`);
            }
          } else {
            this.input.log.debug(`No namespaces found for ${lng}`);
          }
        } catch {
          this.input.log.debug(`Test translation failed for ${lng}:`);
        }
      }

      // Debug the initialized instance
      this.input.log.debug(`i18next languages after init: ${JSON.stringify(i18nextInstance.languages)}`);
      this.input.log.debug(`i18next options.supportedLngs: ${JSON.stringify(i18nextInstance.options.supportedLngs)}`);
      this.input.log.debug(`i18next options.preload: ${JSON.stringify(i18nextInstance.options.preload)}`);

      this.input.log.debug(`Final i18next languages: ${JSON.stringify(i18nextInstance.languages)}`);

      this.i18nextInstances[brandingId] = i18nextInstance;
      this.input.log.debug(`i18next instance created for branding: ${brandingId}`);

      return i18nextInstance;
    }

    /**
     * Clear and reinitialize i18next instances (useful for config changes)
     */
    public async clearInstances(brandingId?: string) {
      if (brandingId) {
        delete this.i18nextInstances[brandingId];
        this.input.log.debug(`Cleared i18next instance for branding: ${brandingId}`);
      } else {
        this.i18nextInstances = {};
        this.input.log.debug('Cleared all i18next instances');
      }
    }

    public async bootstrap() {
      this.input.log.debug('TranslationService initialising from DB...');

      // Initialize the default branding instance
      const availableBrandings = this.input.availableBrands();
      for (const availableBranding of availableBrandings) {
        const branding = this.input.getBrand(availableBranding);
        await this.getI18nextForBranding(branding);
      }

      this.input.log.debug('**************************');
      const initBase = this.input.config.i18n.next.init || {};
      const fallback = Array.isArray(initBase.fallbackLng) ? initBase.fallbackLng[0] : initBase.fallbackLng;
      this.input.log.debug(`i18next initialised (DB), default: '${fallback}', supported: ${initBase.supportedLngs}`);
      this.input.log.debug('**************************');
    }

    private async _fetchResourcesFromDb(
      brand: BrandingModel | null = null
    ): Promise<Record<string, Record<string, Record<string, unknown>>>> {
      if (!brand) {
        brand = this.input.getBrand('default');
      }
      if (!brand) {
        this.input.log.warn('Default brand not found; resources will be empty');
        return {};
      }
      const supported = await this.getAvailableLanguagesForBranding(brand);
      const brandingId = brand.id || 'default';
      const namespaces: string[] = (this.input.config?.i18n?.next?.init?.ns as string[]) || ['translation'];

      const resources: Record<string, Record<string, Record<string, unknown>>> = {};
      for (const lng of supported) {
        resources[lng] = {};
        for (const ns of namespaces) {
          try {
            // Prefer explicit fields query
            let bundle = await this.input.repository.bundles.findForLocale(brandingId, lng, ns);
            if (!bundle) {
              // Fallback to uid-based lookup if needed
              const uid = `${brandingId}:${lng}:${ns}`;
              bundle = await this.input.repository.bundles.findByUid(uid);
            }
            const data =
              bundle?.data && typeof bundle.data === 'object' ? { ...(bundle.data as Record<string, unknown>) } : {};
            if (data && typeof data === 'object' && '_meta' in data) {
              // strip metadata from runtime resources
              delete (data as Record<string, unknown>)._meta;
            }
            resources[lng][ns] = data || {};
          } catch {
            // Note: Keeping this as verbose since it's already a low-level diagnostic message
            this.input.log.verbose('[TranslationService] Failed to load bundle', brandingId, lng, ns);
            resources[lng][ns] = {};
          }
        }
      }
      return resources;
    }

    public t(
      key: string,
      context: Record<string, unknown> | undefined = undefined,
      langCode: string = 'en',
      brandingName: string = 'default'
    ) {
      const brand = this.input.getBrand(brandingName);

      const i18nextInstance = this.i18nextInstances[brand.id];

      if (!i18nextInstance) {
        this.input.log.warn(
          `No i18next instance found for brand name: ${brandingName}, branding id: ${brand.id}, falling back to key`
        );
        return key;
      }
      const resolvedLang = langCode || 'en';
      if (context === undefined) {
        return i18nextInstance.getFixedT(resolvedLang)(key);
      }
      return i18nextInstance.getFixedT(resolvedLang)(key, context);
    }

    public tInter(key: string, context: Record<string, unknown> | null = null, langCode: string = 'en') {
      return this.t(key, context ?? undefined, langCode);
    }

    public async reloadResources(brandingId?: string) {
      // Re-create i18next instances so deletions / prunes are reflected (addResourceBundle can't remove keys)
      const brandingsToReload = brandingId ? [brandingId] : Object.keys(this.i18nextInstances);
      for (const bId of brandingsToReload) {
        try {
          await this.clearInstances(bId);
          const branding = this.input.getBrand(bId);
          if (!branding) continue;
          await this.getI18nextForBranding(branding);
          this.input.log.debug(`Re-created i18next instance for branding: ${bId}`);
        } catch {
          this.input.log.warn(`Failed to re-create i18next for branding ${bId}:`);
        }
      }
    }

    /**
     * Get available languages for a specific branding from DB
     */
    public async getAvailableLanguagesForBranding(branding: BrandingModel | null): Promise<string[]> {
      try {
        if (!branding) {
          this.input.log.warn('No branding provided, using config fallback');
          return this.input.config?.i18n?.next?.init?.supportedLngs || ['en'];
        }

        const brandingId = branding.id || 'default';
        const langs: Record<string, true> = {};

        // Add configured languages as baseline
        const configured = this.input.config?.i18n?.next?.init?.supportedLngs;
        this.input.log.debug(`Configured languages: ${JSON.stringify(configured)}`);

        if (Array.isArray(configured)) {
          configured.forEach((l: string) => {
            if (l && l !== 'cimode') langs[l] = true;
          });
        }

        // Add languages from DB bundles
        try {
          const bundles = (await this.input.repository.bundles.listForBrand(brandingId, true)) as unknown as Array<{
            locale?: string;
          }>;
          this.input.log.debug(`Found ${bundles.length} bundles for branding ${brandingId}`);
          bundles.forEach((b: { locale?: string }) => {
            if (b?.locale) {
              this.input.log.debug(`Adding language from bundle: ${b.locale}`);
              langs[b.locale] = true;
            }
          });
        } catch {
          // Note: Keeping this as verbose since it's already a low-level diagnostic message
          this.input.log.verbose('[TranslationService.getAvailableLanguagesForBranding] DB scan failed.');
        }

        const list = Object.keys(langs);
        list.sort();
        this.input.log.debug(`Final language list: ${JSON.stringify(list)}`);
        return list;
      } catch {
        this.input.log.warn('Failed to resolve available languages.');
        return this.input.config?.i18n?.next?.init?.supportedLngs || ['en'];
      }
    }
  }
}
