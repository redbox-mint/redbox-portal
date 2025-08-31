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

import { Observable } from 'rxjs';
import {BrandingModel, Services as services}   from '@researchdatabox/redbox-core-types';
import { Sails, Model } from "sails";
import i18next from "i18next"

declare var _;
declare var sails: Sails;
// Waterline globals
declare var I18nBundle: Model;
declare let BrandingService: any;

export module Services {
  /**
   * Translation services...
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Translation extends services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      't',
      'reloadResources',
      'tInter',
      'handle',
      'getAvailableLanguagesForBranding',
      'clearInstances'
    ];

    // Map of i18next instances per branding
    private i18nextInstances: any = {};

    constructor() {
      super();
    }

    /**
     * Get or create an i18next instance for a specific branding
     */
    private async getI18nextForBranding(branding: BrandingModel): Promise<any> {
      if (!branding) {
        branding = BrandingService.getBrand('default');
      }
      const brandingId = branding?.id;
      
      if (this.i18nextInstances[brandingId]) {
        return this.i18nextInstances[brandingId];
      }

      // Create new i18next instance for this branding
      const i18nextInstance = i18next.createInstance();
      const initBase = sails.config.i18n.next.init || {};
      const resources = await this._fetchResourcesFromDb(branding);
      
      // Get available languages for this branding (includes both config and DB languages)
      const availableLanguages = await this.getAvailableLanguagesForBranding(branding);
      
      // Debug logging
      this.logger.debug(`Initializing i18next for branding ${branding?.id || 'default'}`);
      this.logger.debug(`Available languages: ${JSON.stringify(availableLanguages)}`);
      this.logger.debug(`Resources keys: ${JSON.stringify(Object.keys(resources))}`);
      // Log a sample of the resources structure
      for (const lng of Object.keys(resources)) {
        const namespaces = Object.keys(resources[lng] || {});
        this.logger.debug(`Language '${lng}' has namespaces: ${JSON.stringify(namespaces)}`);
        for (const ns of namespaces) {
          const resourceKeys = Object.keys(resources[lng][ns] || {});
          const keyCount = resourceKeys.length;
          this.logger.debug(`Namespace '${ns}' in '${lng}' has ${keyCount} keys`);
          if (keyCount > 0) {
            // Show first few keys as examples
            const sampleKeys = resourceKeys.slice(0, 5);
            this.logger.debug(`Sample keys in '${lng}.${ns}': ${JSON.stringify(sampleKeys)}`);
          }
        }
      }
      this.logger.debug(`InitBase supportedLngs: ${JSON.stringify(initBase.supportedLngs)}`);
      
      const initConfig = {
        ...initBase,
        lng: availableLanguages[0], // Set primary language
        supportedLngs: availableLanguages, // Use the complete list of available languages
        preload: availableLanguages, // Preload all available languages
        resources,
        fallbackLng: availableLanguages, // Set fallback language
        // Ensure i18next doesn't filter out languages
        nonExplicitSupportedLngs: false,
        // Make sure all languages are loaded
        initImmediate: false,
        // Force i18next to load all languages during init
        load: 'all'
      };
      
      this.logger.debug(`Final init config: ${JSON.stringify(initConfig, null, 2)}`);
      
      await i18nextInstance.init(initConfig);

      // After initialization, try to activate all available languages
      // by calling changeLanguage for each one to ensure they're recognized
      for (const lng of availableLanguages) {
        if (resources[lng] && Object.keys(resources[lng]).length > 0) {
          try {
            // Temporarily change to each language to activate it
            await i18nextInstance.changeLanguage(lng);
            this.logger.debug(`Activated language: ${lng}`);
          } catch (e) {
            this.logger.warn(`Failed to activate language ${lng}:`, (e as Error)?.message || e);
          }
        }
      }
      
      // Change back to the primary language
      await i18nextInstance.changeLanguage(availableLanguages[0]);

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
              const translation = i18nextInstance.getFixedT(lng)(testKey);
              this.logger.debug(`Test translation for ${lng}: '${testKey}' = '${translation}'`);
            } else {
              this.logger.debug(`No keys found for ${lng} in namespace ${ns}`);
            }
          } else {
            this.logger.debug(`No namespaces found for ${lng}`);
          }
        } catch (e) {
          this.logger.debug(`Test translation failed for ${lng}:`, (e as Error)?.message || e);
        }
      }

      // Debug the initialized instance
      this.logger.debug(`i18next languages after init: ${JSON.stringify(i18nextInstance.languages)}`);
      this.logger.debug(`i18next options.supportedLngs: ${JSON.stringify(i18nextInstance.options.supportedLngs)}`);
      this.logger.debug(`i18next options.preload: ${JSON.stringify(i18nextInstance.options.preload)}`);
      
      this.logger.debug(`Final i18next languages: ${JSON.stringify(i18nextInstance.languages)}`);
      
      this.i18nextInstances[brandingId] = i18nextInstance;
      this.logger.debug(`i18next instance created for branding: ${brandingId}`);
      
      return i18nextInstance;
    }

    /**
     * Clear and reinitialize i18next instances (useful for config changes)
     */
    public async clearInstances(brandingId?: string) {
      if (brandingId) {
        delete this.i18nextInstances[brandingId];
        this.logger.debug(`Cleared i18next instance for branding: ${brandingId}`);
      } else {
        this.i18nextInstances = {};
        this.logger.debug('Cleared all i18next instances');
      }
    }
    
    public async bootstrap() {
      this.logger.debug("TranslationService initialising from DB...")
      
      // Initialize the default branding instance
      const availableBrandings = BrandingService.getAvailable();
      for(let availableBranding of availableBrandings) {
        const branding = BrandingService.getBrand(availableBranding);  
        await this.getI18nextForBranding(branding);
      }

      this.logger.debug("**************************");
      const initBase = sails.config.i18n.next.init || {};
      const fallback = Array.isArray(initBase.fallbackLng) ? initBase.fallbackLng[0] : initBase.fallbackLng;
      this.logger.debug(`i18next initialised (DB), default: '${fallback}', supported: ${initBase.supportedLngs}`);
      this.logger.debug("**************************");
    }

    private async _fetchResourcesFromDb(brand: BrandingModel = null): Promise<Record<string, Record<string, any>>> {
     
      if(!brand) {
       brand = BrandingService.getBrand('default');
      }
      if (!brand) {
        this.logger.warn('Default brand not found; resources will be empty');
        return {};
      }
      const supported = await this.getAvailableLanguagesForBranding(brand);
      const brandingId = brand.id || 'default';
      const namespaces: string[] = (sails?.config?.i18n?.next?.init?.ns as string[]) || ['translation'];

      const resources: Record<string, Record<string, any>> = {};
      for (const lng of supported) {
        resources[lng] = {};
        for (const ns of namespaces) {
          try {
            // Prefer explicit fields query
            let bundle = await I18nBundle.findOne({ branding: brandingId, locale: lng, namespace: ns });
            if (!bundle) {
              // Fallback to uid-based lookup if needed
              const uid = `${brandingId}:${lng}:${ns}`;
              bundle = await I18nBundle.findOne({ uid });
            }
            const data = (bundle?.data && typeof bundle.data === 'object') ? { ...bundle.data } : {};
            if (data && typeof data === 'object' && data._meta) {
              // strip metadata from runtime resources
              delete (data as any)._meta;
            }
            resources[lng][ns] = data || {};
          } catch (e) {
            // Note: Keeping this as verbose since it's already a low-level diagnostic message
            sails.log.verbose('[TranslationService] Failed to load bundle', brandingId, lng, ns, (e as Error)?.message || e);
            resources[lng][ns] = {};
          }
        }
      }
      return resources;
    }

    public t(key, context = undefined, langCode: string = 'en', brandingName: string = 'default') {
      const brand = BrandingService.getBrand(brandingName);

      const i18nextInstance = this.i18nextInstances[brand.id];

      if (!i18nextInstance) {
        this.logger.warn(`No i18next instance found for brand name: ${brandingName}, branding id: ${brand.id}, falling back to key`);
        return key;
      }
      return i18nextInstance.getFixedT(langCode)(key, context);
    }

    public tInter(key, context = null, langCode:string = 'en') {
      return this.t(key, context, langCode);
    }

    public async reloadResources(brandingId?: string) {
      const brandingsToReload = brandingId ? [brandingId] : Object.keys(this.i18nextInstances);
      
      for (const bId of brandingsToReload) {
        const i18nextInstance = this.i18nextInstances[bId];
        if (!i18nextInstance) continue;
        
        const branding = BrandingService.getBrand(bId);
        if (!branding) continue;
        
      // Reload from DB and replace resource bundles
        const resources = await this._fetchResourcesFromDb(branding);
      const namespaces: string[] = (sails?.config?.i18n?.next?.init?.ns as string[]) || ['translation'];
        
      for (const lng of Object.keys(resources)) {
        for (const ns of namespaces) {
          const data = resources[lng][ns] || {};
          // addResourceBundle(lng, ns, resources, deep, overwrite)
            i18nextInstance.addResourceBundle(lng, ns, data, true, true);
        }
      }
        
        this.logger.debug(`Reloaded resources for branding: ${bId}`);
      }
    }

    /**
     * Get available languages for a specific branding from DB
     */
    public async getAvailableLanguagesForBranding(branding: any): Promise<string[]> {
      try {
        if (!branding) {
          this.logger.warn('No branding provided, using config fallback');
          return sails.config.i18n.next.init.supportedLngs || ['en'];
        }

        const brandingId = branding.id || 'default';
        const langs: any = {};
        
        // Add configured languages as baseline
        const configured = sails?.config?.i18n?.next?.init?.supportedLngs;
        this.logger.debug(`Configured languages: ${JSON.stringify(configured)}`);
        
        if (Array.isArray(configured)) {
          configured.forEach((l: string) => {
            if (l && l !== 'cimode') langs[l] = true;
          });
        }

        // Add languages from DB bundles
        try {
          const bundles = await I18nBundle.find({ branding: brandingId });
          this.logger.debug(`Found ${bundles.length} bundles for branding ${brandingId}`);
          bundles.forEach((b: any) => {
            if (b?.locale) {
              this.logger.debug(`Adding language from bundle: ${b.locale}`);
              langs[b.locale] = true;
            }
          });
        } catch (e) {
          // Note: Keeping this as verbose since it's already a low-level diagnostic message
          sails.log.verbose('[TranslationService.getAvailableLanguagesForBranding] DB scan failed:', (e as Error)?.message || e);
        }

        const list = Object.keys(langs);
        list.sort();
        this.logger.debug(`Final language list: ${JSON.stringify(list)}`);
        return list;
      } catch (e) {
        this.logger.warn('Error:', (e as Error)?.message || e);
        return sails.config.i18n.next.init.supportedLngs || ['en'];
      }
    }

    public async handle(req, res, next) {
      let langCode = req.param('lng');
      let sessLangCode = req.session.lang;
      let defaultLang = _.isArray(sails.config.i18n.next.init.fallbackLng) ? sails.config.i18n.next.init.fallbackLng[0] : sails.config.i18n.next.init.fallbackLng;
      if (_.isEmpty(langCode) && _.isEmpty(sessLangCode)) {
        // use the default
        langCode = defaultLang;
      } else if (!_.isEmpty(sessLangCode) && _.isEmpty(langCode)) {
        // use the session code if not found as request param
        langCode = sessLangCode;
      }
      
      // Get branding and ensure i18next instance exists
      const brandingName = BrandingService.getBrandFromReq(req);
      const branding = BrandingService.getBrand(brandingName);
      const brandingId = branding?.id || 'default';
      
      // Ensure i18next instance exists for this branding
      const i18nextInstance = await this.getI18nextForBranding(branding);
      
      // validating language - get available languages from DB for current branding
      const availableLanguages = await this.getAvailableLanguagesForBranding(branding);
      if (_.findIndex(availableLanguages, (l) => { return langCode == l }) == -1) {
        // unsupported language, set to default
        this.logger.warn(`Unsupported language code: ${langCode}, setting to default.`);
        langCode = defaultLang;
      }
      
      // save the lang in the session
      if (_.isEmpty(req.session)) {
        req.session = {};
      }
      req.session.lang = langCode;
      // set the locals lang code
      req.options.locals.lang = langCode;
      // set the cookie
      res.cookie('lng', langCode);

      // Inject branding-specific i18next instance into locals
      req.options.locals.TranslationService = _.merge(this, {
        t: function(key, context) {
          return i18nextInstance.getFixedT(langCode)(key, context);
        },
        tInter: function(key, context) {
          return i18nextInstance.getFixedT(langCode)(key, context);
        }
      });
      
      next();
    }
  }
}
module.exports = new Services.Translation().exports();
