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
import { Observable } from 'rxjs/Rx';
import * as flat from 'flat';
declare var VocabService;
/**
 * Package that contains all Controllers.
 */
import { Controllers as controllers} from '@researchdatabox/redbox-core-types';
export module Controllers {
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
    protected _exportedMethods: any = [
        'get',
        'getCollection',
        'loadCollection',
        'getMint',
        'searchExternalService',
        'searchPeople',
        'rvaGetResourceDetails'
    ];

    /**
     **************************************************************************************************
     **************************************** Override default methods ********************************
     **************************************************************************************************
     */

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public get(req, res) {
      const vocabId = req.param("vocabId");
      let that = this;
      VocabService.getVocab(vocabId).subscribe(data => {
        that.ajaxOk(req, res, null, data);
      }, error => {
        sails.log.error(`Failed to get vocab: ${vocabId}`);
        sails.log.error(error);
        that.ajaxFail(req, res, null, [], true);
      });
    }

    public getCollection(req, res) {
      const collectionId = req.param('collectionId');
      const searchString = req.query.search ? req.query.search.toLowerCase() : '';
      let that = this;
      VocabService.findCollection(collectionId, searchString).subscribe(collections => {
        that.ajaxOk(req, res, null, collections, true);
      }, error => {
        sails.log.error(`Failed to find collection: ${collectionId}, using: '${searchString}'`);
        sails.log.error(error);
        // return empty data...
        that.ajaxFail(req, res, null, [], true);
      });
    }

    public loadCollection(req, res) {
      const collectionId = req.param('collectionId');
      let that = this;
      VocabService.loadCollection(collectionId).subscribe(receipt => {
        that.ajaxOk(req, res, null, {status: 'queued', message: 'All good.', receipt: receipt}, true);
      }, error => {
        sails.log.error(`Error calling loadCollection:`)
        sails.log.error(error)
        that.ajaxFail(req, res, null, "An error occurred" , true);
        
      });
    }

    public getMint(req, res) {
      const mintSourceType = req.param('mintSourceType');
      const searchString = req.query.search;
      const unflatten = req.param('unflatten');
      const flattened_prefix = "flattened_";
      let that = this;
      VocabService.findInMint(mintSourceType, searchString).subscribe(mintResponse => {
        let response_docs = mintResponse.response.docs;
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
        that.ajaxOk(req, res, null, response_docs, true);
      }, error => {
        sails.log.verbose("Error getting mint data:");
        sails.log.verbose(error);
        that.ajaxFail(req, res, null, "An error occurred", true);
      });
    }

    public searchExternalService(req, res) {
      const providerName = req.param('provider');
      const params = req.body;
      let that = this;
      VocabService.findInExternalService(providerName, params).subscribe(response => {
        // only return the response...
        that.ajaxOk(req, res, null, response, true);
      }, error => {
          sails.log.error(`Error calling searchExternalService:`)
          sails.log.error(error)
          that.ajaxFail(req, res, null, "An error occurred" , true);
      });
    }

    public searchPeople(req, res) {
      const source = req.param('source');
      const page = req.param('page');
      const givenNames = req.param('givenNames');
      const surname = req.param('surname');
      let that = this;
      sails.config.peopleSearch[source](givenNames, surname, page).subscribe(response => {
          // only return the response...
          that.ajaxOk(req, res, null, response, true);
        }, error => {
          sails.log.error(`Error calling searchPeople:`)
          sails.log.error(error)
          that.ajaxFail(req, res, null, "An error occurred" , true);
        });

    }

    public rvaGetResourceDetails(req, res) {
      const uri = req.param('uri');
      const vocab = req.param('vocab');
      let that = this;
      VocabService.rvaGetResourceDetails(uri,vocab).subscribe(response => {
          // only return the response...
          that.ajaxOk(req, res, null, response, true);
        }, error => {
          that.ajaxFail(req, res, null, error, true);
        });

    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Vocab().exports();
