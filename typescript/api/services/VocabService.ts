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

import { Observable, Scheduler } from 'rxjs/Rx';
import {Services as services}   from '@researchdatabox/redbox-core-types';
import {Sails, Model} from "sails";
import * as request from "request-promise";


declare var CacheService, RecordsService, AsynchsService;
declare var sails: Sails;
declare var _this;
declare var _;
declare var Institution: Model;

export module Services {
  /**
   * Vocab related services...
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Vocab extends services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'getVocab',
      'loadCollection',
      'findCollection',
      'findInMint',
      'findInExternalService',
      'rvaGetResourceDetails',
      'findInMintTriggerWrapper'
    ];

    public bootstrap() {
      return _.isEmpty(sails.config.vocab.bootStrapVocabs) ?
      Observable.of(null)
      : Observable.from(sails.config.vocab.bootStrapVocabs)
      .flatMap(vocabId => {
        return this.getVocab(vocabId);
      })
      .last();
    }

    public async findInMintTriggerWrapper(user: object, options: object, failureMode: string) {
      let additionalInfoFound = _.get(user, 'additionalInfoFound');
      if(!_.isArray(additionalInfoFound)) {
        additionalInfoFound = [];
      }
      try {
        let sourceType = _.get(options, 'sourceType');
        let queryStringTmp = _.get(options, 'queryString');
        let compiledTemplate = _.template(queryStringTmp, {});
        let fieldsToMap = _.get(options, 'fieldsToMap');
        
        let queryString = compiledTemplate({user: user});
        let mintResponse = await this.findInMint(sourceType, queryString).toPromise();
        let responseDocs = _.get(mintResponse, 'response.docs');
        if(_.isArray(responseDocs) && responseDocs.length > 0) {

          for(let fieldName of fieldsToMap) {
            let sourceField = _.get(responseDocs[0], fieldName);
            if(!_.isUndefined(sourceField) && !_.isEmpty(sourceField) && !_.isNull(sourceField)) {
              _.set(user, 'additionalAttributes.'+fieldName, sourceField);
            }
          }
          this.setSuccessOrFailure(user, additionalInfoFound, '', true);

        } else {
          
          this.setSuccessOrFailure(user, additionalInfoFound, failureMode);
        }

        return user;

      } catch (err) {
        sails.log.error(`findInMintTriggerWrapper failed to complete. Additional info for user ${_.get(user, 'name')} not found`);
        sails.log.error(err);
        sails.log.error(options);
        this.setSuccessOrFailure(user, additionalInfoFound, failureMode);
        return user; 
      }
    }

    private setSuccessOrFailure( user: object, additionalInfoFound: any, failureMode: string, forceSuccess: boolean = false) {
      
      if (forceSuccess) {

        let successResponse = {
          message: `Additional info for user ${_.get(user, 'name')} found.`,
          isSuccess: true
        };
        additionalInfoFound.push(successResponse);
        _.set(user, 'additionalInfoFound', additionalInfoFound);

      } else if (failureMode == 'continue') {

        let successResponse = {
          message: `Additional info for user ${_.get(user, 'name')} not found. Ignore because failure mode is set to ${failureMode}`,
          isSuccess: true
        };
        additionalInfoFound.push(successResponse);
        _.set(user, 'additionalInfoFound', additionalInfoFound);

      } else {
        let errorResponse = {
          message: `Additional info for user ${_.get(user, 'name')} not found`,
          isSuccess: false
        };
        additionalInfoFound.push(errorResponse);
        _.set(user, 'additionalInfoFound', additionalInfoFound);
      }
    }

    public findInMint(sourceType, queryString) {
      queryString = _.trim(queryString);
      let searchString = '';
      if (!_.isEmpty(queryString)) {
        searchString = ` AND (${queryString})`;
      }

      const mintUrl = `${sails.config.record.baseUrl.mint}${sails.config.mint.api.search.url}?q=repository_type:${sourceType}${searchString}&version=2.2&wt=json&start=0`;
      sails.log(mintUrl);
      const options = this.getMintOptions(mintUrl);
      sails.log.verbose(options);
      return Observable.fromPromise(request[sails.config.record.api.search.method](options));
    }

    public findInExternalService(providerName, params) {
      const method = sails.config.vocab.providers[providerName].method;
      let url = sails.config.vocab.providers[providerName].url;

      let templateFunction = this.getTemplateStringFunction(url);
      url = templateFunction(params.options);

      sails.log.info(url);
      let options = sails.config.vocab.providers[providerName].options;
      options['url'] = url;
      options['json'] = true;
      sails.log.verbose(options);

      if(method == 'post') {
        options['body'] = params.postBody;
      }
      return Observable.fromPromise(request[sails.config.record.api.search.method](options));
    }

    private getTemplateStringFunction(template) {
      var sanitized = template
          .replace(/\$\{([\s]*[^;\s\{]+[\s]*)\}/g, function(_, match){
              return `\$\{map.${match.trim()}\}`;
              })
          // Afterwards, replace anything that's not ${map.expressions}' (etc) with a blank string.
          .replace(/(\$\{(?!map\.)[^}]+\})/g, '');

      return Function('map', `return \`${sanitized}\``);
    }


    public getVocab = (vocabId): Observable<any> => {
      // Check cache
      return CacheService.get(vocabId).flatMap(data => {
        if (data) {
          sails.log.verbose(`Returning cached vocab: ${vocabId}`);
          return Observable.of(data);
        }
        if (sails.config.vocab.nonAnds && sails.config.vocab.nonAnds[vocabId]) {
          return this.getNonAndsVocab(vocabId);
        }
        const url = `${sails.config.vocab.rootUrl}${vocabId}/${sails.config.vocab.conceptUri}`;
        let items = null; // a flat array containing all the entries
        const rawItems = [];
        return this.getConcepts(url, rawItems).flatMap(allRawItems => {
          //   // we only are interested in notation, label and the uri
          items = _.map(allRawItems, rawItem => {
            return {uri: rawItem._about, notation: rawItem.notation, label: rawItem.prefLabel._value};
          });
          CacheService.set(vocabId, items);
          return Observable.of(items);
        });
      });
    }

    // have to do this since ANDS endpoint ignores _pageSize
    protected getConcepts(url, rawItems) {
      console.log(`Getting concepts....${url}`);
      const options = {url:url, json: true};
      return Observable.fromPromise(request.get(options))
      .flatMap((resp) => {
        let response:any = resp;
        rawItems = rawItems.concat(response.result.items);
        if (response.result && response.result.next) {
          return this.getConcepts(response.result.next, rawItems);
        }
        return Observable.of(rawItems);
      });
    }

    protected getNonAndsVocab(vocabId) {
      const url = sails.config.vocab.nonAnds[vocabId].url;
      const options = {url: url, json:true};
      return Observable.fromPromise(request.get(options)).flatMap(response => {
        CacheService.set(vocabId, response);
        return Observable.of(response);
      });
    }

    loadCollection(collectionId, progressId, force=false) {
      const getMethod = sails.config.vocab.collection[collectionId].getMethod;
      const bufferCount = sails.config.vocab.collection[collectionId].processingBuffer;
      const processWindow = sails.config.vocab.collection[collectionId].processingTime;
      let collectionData = null;
      return this[getMethod](collectionId).flatMap(data => {
        if (_.isEmpty(data) || force) {
          // return a receipt and then start the process of loading...
          const url = sails.config.vocab.collection[collectionId].url;
          sails.log.verbose(`Loading collection: ${collectionId}, using url: ${url}`);
          const methodName = sails.config.vocab.collection[collectionId].saveMethod;
          const options = {url: url, json:true};
          return Observable.fromPromise(request.get(options))
          .flatMap(resp => {
            let response:any = resp;
            sails.log.verbose(`Got response retrieving data for collection: ${collectionId}, saving...`);
            sails.log.verbose(`Number of items: ${response.length}`);
            const itemsToSave = _.chunk(response, bufferCount);
            collectionData = itemsToSave;
            // sails.log.verbose(collectionData);
            const updateObj = { currentIdx: 0, targetIdx: collectionData.length };
            return AsynchsService.update({id:progressId}, updateObj);
          })
          .flatMap(updateResp => {
            sails.log.verbose(`Updated asynch progress...`);
            return Observable.from(collectionData);
          })
          .map((buffer, i) => {
            setTimeout(()=> {
              sails.log.verbose(`Processing chunk: ${i}`);
              return this.saveCollectionChunk(methodName, buffer, i)
              .flatMap(saveResp => {
                sails.log.verbose(`Updating chunk progress...${i}`);
                if (i == collectionData.length) {
                  sails.log.verbose(`Asynch completed.`);
                  return AsynchsService.finish(progressId);
                } else {
                  return AsynchsService.update({id: progressId}, {currentIdx: i+1, status: 'processing'});
                }
              });
            }, i * processWindow);
          })
          .concat()
        } else {
          sails.log.verbose(`Collection already loaded: ${collectionId}`);
          return Observable.of(null);
        }
      });
    }

    protected saveCollectionChunk(methodName, buffer, i) {
      return this[methodName](buffer);
    }

    findCollection(collectionId, searchString) {
      return this[sails.config.vocab.collection[collectionId].searchMethod](searchString);
    }

    public rvaGetResourceDetails(uri,vocab) {
      const url = sails.config.vocab.rootUrl+`${vocab}/resource.json?uri=${uri}`;
      const options = {url: url, json:true};

      return Observable.fromPromise(request.get(options)).flatMap(response => {
        CacheService.set(vocab, response);
        return Observable.of(response);
      });
    }

    protected getMintOptions(url) {
      return {url:url, json:true, headers: {'Authorization': `Bearer ${sails.config.mint.apiKey}`, 'Content-Type': 'application/json; charset=utf-8'}};
    }
  }
}
module.exports = new Services.Vocab().exports();
