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

import { Observable } from 'rxjs/Rx';
import {Services as services}   from '@researchdatabox/redbox-core-types';
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
      'handle'
    ];
    
    public async bootstrap() {
      sails.log.debug("TranslationService initialising from DB...")
      const initBase = sails.config.i18n.next.init || {};
      // Build resources from DB bundles for the default brand
      const resources = await this._fetchResourcesFromDb();
      await i18next.init({
        ...initBase,
        resources
      });
      sails.log.debug("**************************");
      const fallback = Array.isArray(initBase.fallbackLng) ? initBase.fallbackLng[0] : initBase.fallbackLng;
      sails.log.debug(`i18next initialised (DB), default: '${fallback}', supported: ${initBase.supportedLngs}`);
      sails.log.debug("**************************");
    }

    private async _fetchResourcesFromDb(): Promise<Record<string, Record<string, any>>> {
      const supported: string[] = (sails?.config?.i18n?.next?.init?.supportedLngs as string[]) || ['en'];
      const namespaces: string[] = (sails?.config?.i18n?.next?.init?.ns as string[]) || ['translation'];
      const brand = BrandingService.getBrand('default');
      if (!brand) {
        sails.log.warn('[TranslationService] Default brand not found; resources will be empty');
        return {};
      }
      const brandingId = brand.id || 'default';
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
            sails.log.verbose('[TranslationService] Failed to load bundle', brandingId, lng, ns, (e as Error)?.message || e);
            resources[lng][ns] = {};
          }
        }
      }
      return resources;
    }

    public t(key, context = undefined, langCode:string = 'en') {
      return i18next.getFixedT(langCode)(key, context);
    }

    public tInter(key, context = null, langCode:string = 'en') {
      return this.t(key, context, langCode);
    }

    public async reloadResources() {
      // Reload from DB and replace resource bundles
      const resources = await this._fetchResourcesFromDb();
      const namespaces: string[] = (sails?.config?.i18n?.next?.init?.ns as string[]) || ['translation'];
      for (const lng of Object.keys(resources)) {
        for (const ns of namespaces) {
          const data = resources[lng][ns] || {};
          // addResourceBundle(lng, ns, resources, deep, overwrite)
          i18next.addResourceBundle(lng, ns, data, true, true);
        }
      }
    }

    public handle(req, res, next) {
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
      // validating language 
      if (_.findIndex(sails.config.i18n.next.init.supportedLngs, (l) => { return langCode == l }) == -1) {
        // unsupported language, set to default
        sails.log.warn(`Unsupported language code: ${langCode}, setting to default.`);
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
      // return this.middleware(req, res, next);
      req.options.locals.TranslationService = _.merge(this, {
        t: function(key, context) {
          return i18next.getFixedT(langCode)(key, context);
        }
      });
      next();
    }
  }
}
module.exports = new Services.Translation().exports();
