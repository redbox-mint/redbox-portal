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
import { BrandingModel } from '../model';

let flat: any;

export namespace Controllers {
  /**
   * Vocabulary related features....
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Vocab extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: any = [
        'get',
        'getCollection',
        'loadCollection',
        'getMint',
        'searchExternalService',
        'searchPeople',
        'rvaGetResourceDetails',
        'getRecords'
    ];

    /**
     **************************************************************************************************
    **************************************** Override default methods ********************************
    **************************************************************************************************
    */

    protected override async processDynamicImports() {
      flat = await import("flat");
    }

    /**
     **************************************************************************************************
    **************************************** Add custom methods **************************************
    **************************************************************************************************
    */

    public get(req: Sails.Req, res: Sails.Res) {
      const vocabId = req.param("vocabId");
      const that = this;
      VocabService.getVocab(vocabId).subscribe((data: unknown) => {
        that.sendResp(req, res, { data, headers: that.getNoCacheHeaders() });
      }, (error: unknown) => {
        sails.log.error(`Failed to get vocab: ${vocabId}`);
        sails.log.error(error);
        that.sendResp(req, res, { data: [], headers: that.getNoCacheHeaders() });
      });
    }

    public getCollection(req: Sails.Req, res: Sails.Res) {
      const collectionId = req.param('collectionId');
      const searchString = req.query.search ? req.query.search.toLowerCase() : '';
      const that = this;
      VocabService.findCollection(collectionId, searchString).subscribe((collections: unknown) => {
        that.sendResp(req, res, { data: collections, headers: that.getNoCacheHeaders() });
      }, (error: unknown) => {
        sails.log.error(`Failed to find collection: ${collectionId}, using: '${searchString}'`);
        sails.log.error(error);
        // return empty data...
        that.sendResp(req, res, { data: [], headers: that.getNoCacheHeaders() });
      });
    }

    public loadCollection(req: Sails.Req, res: Sails.Res) {
      const collectionId = req.param('collectionId');
      const that = this;
      VocabService.loadCollection(collectionId).subscribe((receipt: unknown) => {
        that.sendResp(req, res, { data: { status: 'queued', message: 'All good.', receipt: receipt }, headers: that.getNoCacheHeaders() });
      }, (error: unknown) => {
        sails.log.error(`Error calling loadCollection:`)
        sails.log.error(error)
        that.sendResp(req, res, { data: "An error occurred", headers: that.getNoCacheHeaders() });

      });
    }

    public async getMint(req: Sails.Req, res: Sails.Res) {
      const mintSourceType = req.param('mintSourceType');
      const searchString = req.query.search;
      const unflatten = req.param('unflatten');
      const flattened_prefix = "flattened_";
      try {
        const mintResponse = await VocabService.findInMint(mintSourceType, searchString);
        const response_docs = _.get(mintResponse, 'response.docs', []) as Array<Record<string, unknown>>;
        if (unflatten == "true") {
          _.forEach(response_docs, (doc: any) => {
            _.forOwn(doc, (val: any, key: any) => {
              if (_.startsWith(key, flattened_prefix)) {
                const targetKey = key.substring(flattened_prefix.length);
                const objVal = JSON.parse(val);
                doc[targetKey] = flat.unflatten(objVal)[key];
              }
            });
          });
        }
        // only return the response...
        this.sendResp(req, res, { data: response_docs, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sails.log.verbose("Error getting mint data:");
        sails.log.verbose(error);
        this.sendResp(req, res, { data: "An error occurred", headers: this.getNoCacheHeaders() });
      }
    }

    public async getRecords(req: Sails.Req, res: Sails.Res) {
      const mintSourceType = req.param('queryId');
      const searchString = req.param('search');
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      try {
        const response = await VocabService.findRecords(mintSourceType, brand, searchString, req.param('start'), req.param('rows'), req.user);
        this.sendResp(req, res, { data: response, headers: this.getNoCacheHeaders() });
      } catch (error: unknown) {
        sails.log.verbose("Error getting internal records:");
        sails.log.verbose(error);
        this.sendResp(req, res, { data: "An error occurred getting internal records", headers: this.getNoCacheHeaders() });
      }
    }

    public async searchExternalService(req: Sails.Req, res: Sails.Res) {
      const providerName = req.param('provider');
      const params = req.body;
      const that = this;
      try {
        const response = await VocabService.findInExternalService(providerName, params);
        // only return the response...
        that.sendResp(req, res, { data: response, headers: that.getNoCacheHeaders() });
      } catch (error) {
        sails.log.error(`Error calling searchExternalService:`)
        sails.log.error(error)
        that.sendResp(req, res, { data: "An error occurred", headers: that.getNoCacheHeaders() });
      }
    }

    public searchPeople(req: Sails.Req, res: Sails.Res) {
      const source = req.param('source');
      const page = req.param('page');
      const givenNames = req.param('givenNames');
      const surname = req.param('surname');
      const that = this;
      const searchConfig = sails.config.peopleSearch[source];
      const searchFn = (typeof searchConfig === 'function') ? searchConfig : eval(searchConfig);
      searchFn(givenNames, surname, page).subscribe((response: unknown) => {
        // only return the response...
        that.sendResp(req, res, { data: response, headers: that.getNoCacheHeaders() });
      }, (error: unknown) => {
        sails.log.error(`Error calling searchPeople:`)
        sails.log.error(error)
        that.sendResp(req, res, { data: "An error occurred", headers: that.getNoCacheHeaders() });
      });

    }

    public rvaGetResourceDetails(req: Sails.Req, res: Sails.Res) {
      const uri = req.param('uri');
      const vocab = req.param('vocab');
      const that = this;
      VocabService.rvaGetResourceDetails(uri, vocab).subscribe((response: unknown) => {
        // only return the response...
        that.sendResp(req, res, { data: response, headers: that.getNoCacheHeaders() });
      }, (error: unknown) => {
        that.sendResp(req, res, { data: error, headers: that.getNoCacheHeaders() });
      });

    }

    /**
     **************************************************************************************************
    **************************************** Override magic methods **********************************
    **************************************************************************************************
    */
  }
}
