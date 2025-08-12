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

//<reference path='./../../typings/loader.d.ts'/>

declare var module;
declare var sails;
declare var _;

declare var BrandingService;
declare var I18nEntriesService;

import { APIActionResponse, APIErrorResponse, BrandingModel } from '@researchdatabox/redbox-core-types';
import { Controllers as controllers } from '@researchdatabox/redbox-core-types';

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
      'setBundle'
    ];

    public async listEntries(req, res) {
      try {
        const brandName: string = BrandingService.getBrandFromReq(req);
        const branding: BrandingModel = BrandingService.getBrand(brandName);
        const locale = req.param('locale');
        const namespace = req.param('namespace') || 'translation';
        const keyPrefix = req.param('keyPrefix');

        const entries = await I18nEntriesService.listEntries(branding.id, locale, namespace, keyPrefix);
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

        const entry = await I18nEntriesService.getEntry(branding.id, locale, namespace, key);
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

        const saved = await I18nEntriesService.setEntry(branding.id, locale, namespace, key, value);
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

        const ok = await I18nEntriesService.deleteEntry(branding.id, locale, namespace, key);
        if (!ok) return this.apiFail(req, res, 404, new APIErrorResponse('Entry not found'));
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

        const bundle = await I18nEntriesService.getBundle(branding.id, locale, namespace);
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

        const bundle = await I18nEntriesService.setBundle(branding.id, locale, namespace, data, { splitToEntries, overwriteEntries });
        return this.apiRespond(req, res, bundle, 200);
      } catch (error) {
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }
  }
}

module.exports = new Controllers.Translation().exports();
