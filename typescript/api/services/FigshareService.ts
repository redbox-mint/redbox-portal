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

import { Services as services, DatastreamService, RBValidationError, QueueService, FigshareArticleImpersonate, FigshareArticleUpdate, FigshareArticleEmbargo } from '@researchdatabox/redbox-core-types';
import { Sails } from "sails";
const moment = require('moment');
const axios = require('axios');
const _ = require('lodash');
const fs = require('fs');
const checkDiskSpace = require('check-disk-space').default;

declare let sails: Sails;
declare let TranslationService;


export module Services {

  export class FigshareService extends services.Core.Service {

    private datastreamService: DatastreamService;
    private queueService: QueueService;

    //Data publication metadata
    private metadataDP = 'metadata';
    private fullEmgardoDateDP = 'full-embargo-until';
    private fileEmbargoDateDP = 'file-embargo-until';
    private embargoNoteDP = 'embargoNote';
    private licenseDP = 'license-identifier';
    private licenseDPDefault = 'license-identifier-default';
    private mintDCIdentifierDP = 'dc_identifier';
    private emailDP = 'email[0]';
    private contributorCI_DP = 'contributor_ci';
    private contributorsDP = 'contributors';
    private anzsrcForDP = 'anzsrcFor'; 
    private figshareArticleID_DP = 'figshare_article_id';
    private figshareArticleLocationDP = 'figshare_article_location';
    private accessRightDP = 'access-rights';
    private dataLocationsDP = 'dataLocations'; 

    //Figshare authors
    private authorName = 'name';
    private authorEmail = 'email';
    private authorOrcid = 'orcid';
    private authorFamilyName = 'family_name';
    private authorTextFullName = 'text_full_name';

    //Figshare article
    private isEmbargoedFA = 'is_embargoed';
    private embargoDateFA = 'embargo_date';
    private embargoTypeFA = 'embargo_type';
    private embargoTitleFA  = 'embargo_title';
    private embargoReasonFA = 'embargo_reason';
    private embargoOptionsFA = 'embargo_options';
    private licenseFA = 'license';
    private resourceTitleFA = 'resource_title';
    private resourceDOI_FA = 'resource_doi';
    private impersonateFA = 'impersonate';
    private authorsFA = 'authors';
    private accountIdFA = 'id'; //id = account id
    private userIdFA = 'user_id'; //user_id = author id 
    private categoriesFA = 'categories';
    private curationStatusFA = 'curation_status';

    private figArticleGroupId;
    private figArticleItemType;
    private figArticleEmbargoOptions;

    //Figshare response
    private entityIdFAR = 'entity_id';
    private locationFAR = 'location'; 

    private customFieldsFA = 'custom_fields';
    private customFieldSupervisor = 'Supervisor'
    private customFieldLanguageFA = 'Language';
    private customFieldAdditionalRights = 'Additional Rights';
    private customFieldSizeOfDataset = 'Number and size of Dataset';
    private customFieldMedium = 'Medium';
    private customFieldGeolocation = 'Geolocation';
    private customFullTextURL = 'Full Text URL';

    private figLicenses: any;
    private for2020To2008Mapping: any;

    protected _exportedMethods: any = [
      'createUpdateFigshareArticle',
      'uploadFilesToFigshareArticle',
      'deleteFilesFromRedbox',
      'processFileUploadToFigshare'
    ];

    private createUpdateFigshareArticleLogLevel = 'verbose';
    private figshareAccountAuthorIDs;

    constructor() {
      //Better not use 'this.createUpdateFigshareArticleLogLevel' in the constructor as it may not be available for certain events.
      //There is no harm to use error log level to ensure minimal logging is always printed because services are singletons therefore 
      //it's printed only once and it's critical to have logs to ensure this service has loaded correctly during development face until 
      //it reaches a certain level of stability/maturity. Then it can be changed to verbose  
      super();
      let that = this;
      sails.on('ready', function () {
        let datastreamServiceName = sails.config.record.datastreamService;
        let queueServiceName = sails.config.queue.serviceName;
        sails.log.error(`FigshareTrigger ready, using datastream service: ${datastreamServiceName}`);
        if (datastreamServiceName != undefined) {
          that.datastreamService = sails.services[datastreamServiceName];
        }
        sails.log.error(`FigshareTrigger ready, using queue service: ${queueServiceName}`);
        if (queueServiceName != undefined) {
          that.queueService = sails.services[queueServiceName];
        }
      });
      sails.on('lifted', function() {
        sails.log.error('FigArticle - constructor start');
        that.getFigPrivateLicenses()
          .then(function (response) {
            sails.log.error('FigArticle - LOADED LICENSES');
            that.figLicenses = response;
          })
          .catch(function (error) {
            sails.log.error('FigArticle - ERROR LOADING LICENSES');
            sails.log.error(error);
          });

        that.for2020To2008Mapping = sails.config.figshareFOR2020To2008Mapping.FORMapping2020To2008;
        that.figArticleGroupId = sails.config.figshareAPI.figArticleGroupId;
        that.figArticleItemType = sails.config.figshareAPI.figArticleItemType;
        that.figArticleEmbargoOptions = sails.config.figshareAPI.figArticleEmbargoOptions;
        sails.log.error('FigArticle - constructor end');
      });
    }

    private getAxiosConfig(method, urlSectionPattern, requestBody) {

      let figshareBaseUrl = sails.config.figshareAPI.baseURL + urlSectionPattern
      let figAccessToken = 'token '+sails.config.figshareAPI.APIToken;

      let figHeaders = { 
        'Content-Type': 'application/json',
        'Authorization': figAccessToken
      };

      let config;
      if(method == 'get') {
        config = {
          method: method,
          url: figshareBaseUrl,
          headers: figHeaders
        };
      } else if (method == 'put' || method == 'post' || method == 'delete') {
        config = {
          method: method,
          url: figshareBaseUrl,
          headers: figHeaders,
          data: requestBody
        };
      } else {
        sails.log[this.createUpdateFigshareArticleLogLevel]('Invalid API method '+method);
        sails.log[this.createUpdateFigshareArticleLogLevel]('urlSectionPattern '+urlSectionPattern);
        sails.log[this.createUpdateFigshareArticleLogLevel](requestBody);
      }
      return config;
    }
    
    private setStandardFieldInRequestBody(record:any, requestBody:any, standardField:any) {
      let value = '';
      let template = _.get(standardField,'template','');
      if(template.indexOf('<%') != -1) {
        let context = {
          record: record,
          moment: moment,
          field: standardField,
          artifacts: sails.config.figshareAPI.mapping.artifacts
        }
        value = _.template(template)(context);      
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle ---- standardField ---- ${standardField.figName} ----  template ---- ${value}`);
      } else {
        value = _.get(record,standardField.rbName,standardField.defaultValue);
      }
      _.set(requestBody, standardField.figName, value);
    }
    
    //Figshare documentation https://docs.figshare.com/#private_article_embargo_update
    //Validate that embargo date is in the future or otherwise it will fail with Invalid Embargo
    private setArticleEmbargoDate(dataPublicationRecord, requestBody) {
      
      let embargoOptions = requestBody[this.embargoOptionsFA];
      let dataPubAccessRights = dataPublicationRecord[this.metadataDP][this.accessRightDP];
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - setArticleEmbargoDate - embargoOptions '+JSON.stringify(embargoOptions));
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - setArticleEmbargoDate - dataPubAccessRights '+dataPubAccessRights);

      //article or file (if embargo type file needs document attached or cannot be published)
      if(_.has(dataPublicationRecord, this.metadataDP + '.' + this.fullEmgardoDateDP) && !_.isEmpty(dataPublicationRecord[this.metadataDP][this.fullEmgardoDateDP])) {

        // Date Format in Figshare documentation is + '2022-02-27T00:00:00' but 'YYYY-MM-DD' works
        let figArtFullEmbargoDate = dataPublicationRecord[this.metadataDP][this.fullEmgardoDateDP];
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - setArticleEmbargoDate - fullEmgardoDateDP '+figArtFullEmbargoDate);
        _.set(requestBody, this.isEmbargoedFA, true);
        _.set(requestBody, this.embargoDateFA, figArtFullEmbargoDate);
        _.set(requestBody, this.embargoTypeFA, 'article'); 
        _.set(requestBody, this.embargoTitleFA, 'full article embargo'); 
        _.set(requestBody, this.embargoReasonFA, dataPublicationRecord[this.metadataDP][this.embargoNoteDP]);
        _.set(requestBody, this.embargoOptionsFA, embargoOptions);

      } else if (dataPubAccessRights == 'mediated' || 
        (_.has(dataPublicationRecord, this.metadataDP+ '.' +this.fileEmbargoDateDP) && !_.isEmpty(dataPublicationRecord[this.metadataDP][this.fileEmbargoDateDP])
        && dataPubAccessRights != 'citation')) {
          
        _.set(requestBody, this.isEmbargoedFA, true);
        
        if(dataPubAccessRights == 'mediated') {
          _.set(requestBody, this.embargoDateFA, '0'); //set permanent embargo
        } else {
          let figArtFileEmbargoDate = dataPublicationRecord[this.metadataDP][this.fileEmbargoDateDP];
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - setArticleEmbargoDate - fileEmbargoDateDP '+figArtFileEmbargoDate);
          _.set(requestBody, this.embargoDateFA, figArtFileEmbargoDate);
        }
        _.set(requestBody, this.embargoTypeFA, 'file');
        _.set(requestBody, this.embargoTitleFA, 'files only embargo');
        _.set(requestBody, this.embargoReasonFA, dataPublicationRecord[this.metadataDP][this.embargoNoteDP]);
        _.set(requestBody, this.embargoOptionsFA, embargoOptions);

      } else {
        _.set(requestBody, this.isEmbargoedFA, false);
        _.set(requestBody, this.embargoDateFA, '');
        _.set(requestBody, this.embargoTypeFA, 'article');
        _.set(requestBody, this.embargoOptionsFA, embargoOptions);
      }
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - setArticleEmbargoDate - '+JSON.stringify(requestBody));
    }
    
    private findLicenseValue(figArtLicense) {
      let licenseValue = 0;
      sails.log[this.createUpdateFigshareArticleLogLevel](figArtLicense);
      let tmpLic = figArtLicense.replace('https://', '');
      tmpLic = figArtLicense.replace('http://', '');
      sails.log[this.createUpdateFigshareArticleLogLevel](tmpLic);
      for (let license of this.figLicenses) {
        if(!_.isUndefined(license.url) && !_.isEmpty(license.url) && license.url.includes(tmpLic)){
          licenseValue = license.value;
        }
      }
      return licenseValue;
    }
    
    private setArticleLicense(dataPublicationRecord, requestBody) {
      let accessType = _.get(dataPublicationRecord, this.metadataDP+ '.' +this.accessRightDP);
      if(_.isUndefined(accessType) || _.isEmpty(accessType) || accessType == 'citation') {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - has metadata.license-identifier-default '+dataPublicationRecord[this.metadataDP][this.licenseDPDefault]);
        let figArtLicenseDefault = dataPublicationRecord[this.metadataDP][this.licenseDPDefault];
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - figArtLicense default '+figArtLicenseDefault);
        //TODO FIXME
        // let figArtLicenseIDDefault = this.findLicenseValue(figArtLicenseDefault);
        let figArtLicenseIDDefault = '123456';
        _.set(requestBody, this.licenseFA,  figArtLicenseIDDefault);
      } else {
        if(_.has(dataPublicationRecord, this.metadataDP+ '.' +this.licenseDP)) {
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - has metadata.license-identifier '+dataPublicationRecord[this.metadataDP][this.licenseDP]);
          let figArtLicense = dataPublicationRecord[this.metadataDP][this.licenseDP];
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - figArtLicense '+figArtLicense);
          //TODO FIXME
          // let figArtLicenseID = this.findLicenseValue(figArtLicense);
          let figArtLicenseID = '123456';
          _.set(requestBody, this.licenseFA,  figArtLicenseID);
        }
      }
    }

    private getOtherContributor(author) {
      //orcid can be an array of 1 string element if it comes directly from mint on lookup or it can be a string if saved directly from redbox form 
      if(!_.isUndefined(author[this.authorOrcid]) && _.isArray(author[this.authorOrcid]) && !_.isUndefined(author[this.authorOrcid][0]) && !_.isEmpty(author[this.authorOrcid][0])) {
        return {name: author[this.authorTextFullName], email: author[this.authorEmail], orcid_id: author[this.authorOrcid][0]};
      } else if (!_.isUndefined(author[this.authorOrcid]) && !_.isArray(author[this.authorOrcid]) && !_.isUndefined(author[this.authorOrcid]) && !_.isEmpty(author[this.authorOrcid])) {
        return {name: author[this.authorTextFullName], email: author[this.authorEmail], orcid_id: author[this.authorOrcid]};
      } else {
        return {name: author[this.authorTextFullName], email: author[this.authorEmail]};
      }
    }

    private getNonCQUAuthor(author) {
        return {name: author[this.authorName]};
    }
    
    private async getAuthorUserIDs(authors) {
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - getAuthorUserIDs enter');
      let authorList = [];
      let uniqueAuthorByEmail = _.uniqBy(authors, this.emailDP);
      let uniqueAuthors = _.uniqBy(uniqueAuthorByEmail, this.authorTextFullName);
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - uniqueAuthors');
      sails.log[this.createUpdateFigshareArticleLogLevel](uniqueAuthors);
      for(let author of uniqueAuthors) {
        sails.log[this.createUpdateFigshareArticleLogLevel](author);
        if(_.has(author, this.mintDCIdentifierDP)) {
          let userId = author[this.mintDCIdentifierDP][0];
          if(!_.isUndefined(userId) &&!_.isEmpty(userId)) {
            let requestBody = {
              institution_user_id: userId
            };

            let config = this.getAxiosConfig('post','/account/institution/accounts/search', requestBody);

            sails.log.info(`FigArticle - getAuthorUserIDs - userId ${userId} - ${config.method} - ${config.url}`);
            try {
                let response = await axios(config);
                let authorData = response.data;
                sails.log[this.createUpdateFigshareArticleLogLevel](authorData);
                let figshareAccountUserID = {id: _.toNumber(authorData[0][this.accountIdFA]), user_id: _.toNumber(authorData[0][this.userIdFA])};
                sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - getAuthorUserIDs - author `);
                sails.log[this.createUpdateFigshareArticleLogLevel](figshareAccountUserID);
                authorList.push(figshareAccountUserID);
            } catch (error) {
                sails.log.error(error);
                sails.log.error(`FigArticle - getAuthorUserIDs - author error`);
                sails.log.error(author);
                let otherContributor = this.getOtherContributor(author);
                if(!_.isUndefined(otherContributor)) {
                  authorList.push(otherContributor);
                }
            }
          } else {
            let otherContributor = this.getOtherContributor(author);
            if(!_.isUndefined(otherContributor)) {
              authorList.push(otherContributor);
            }
          }
        } else {
          let otherContributor = this.getOtherContributor(author);
          if(!_.isUndefined(otherContributor)) {
            authorList.push(otherContributor);
          }
        }
      }
      return authorList;
    }
    
    private getArticleAuthorsFromDP(dataPublicationRecord) {
      let authors = [];
      if(!_.isUndefined(dataPublicationRecord[this.metadataDP][this.contributorCI_DP])) {
        let contributorCI = dataPublicationRecord[this.metadataDP][this.contributorCI_DP];
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - getArticleAuthorsFromDP - contributor_ci');
        sails.log[this.createUpdateFigshareArticleLogLevel](contributorCI);
        authors.push(contributorCI);
      }
      let figArtOthers;
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - getArticleAuthorsFromDP - has other contributors '+!_.isUndefined(dataPublicationRecord[this.metadataDP][this.contributorsDP]));
      if(!_.isUndefined(dataPublicationRecord[this.metadataDP][this.contributorsDP])) {
        figArtOthers = dataPublicationRecord[this.metadataDP][this.contributorsDP];
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - getArticleAuthorsFromDP - other contributors');
        for(let contributor of figArtOthers) { 
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - getArticleAuthorsFromDP - '+this.authorFamilyName+' '+contributor[this.authorFamilyName]);
          if(!_.isEmpty(contributor[this.authorFamilyName])) {
            authors.push(contributor);
          //Check for non cqu contributors that may not have a family name
          } else if(!_.isEmpty(contributor[this.authorTextFullName])) {
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - getArticleAuthorsFromDP - '+this.authorTextFullName+' '+contributor[this.authorTextFullName]);
            authors.push(contributor);
          }
        }
      }
      sails.log[this.createUpdateFigshareArticleLogLevel](authors);
      return authors;
    }

    private setArticleAuthors(figshareAccountUserIDs, requestBody) {
      let authors = [];
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - setArticleAuthors - enter');
      if(!_.isUndefined(figshareAccountUserIDs) && !_.isEmpty(figshareAccountUserIDs)){
        for(let author of figshareAccountUserIDs) {
          sails.log[this.createUpdateFigshareArticleLogLevel](author);
          if(!_.isUndefined(author[this.userIdFA])) {
            authors.push({ id: author[this.userIdFA] });
          } else if(!_.isUndefined(author['name'])) {
            let nonCQUAuthor = this.getNonCQUAuthor(author);
            if(!_.isUndefined(nonCQUAuthor)) {
              authors.push(nonCQUAuthor);
            }
          }
        }
        if(!_.isUndefined(authors) && authors.length > 0){
          _.set(requestBody, this.authorsFA, authors);
        }
      } 
    }

    //The impersonate option must be included in the query string when using the 
    //GET and DELETE methods, and in the body when using the POST and PUT methods
    //https://docs.figshare.com/#figshare_documentation_api_description_impersonation
    private setImpersonateID(figshareAccountUserIDs, requestBody) {
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - setArticleImpersonateID - enter');
      // Chief investigator - CI
      // Primary investigator - PI
      // Principal investigator - PI
      // Lead researcher - LR
      let accountId;
      if(!_.isUndefined(figshareAccountUserIDs) && figshareAccountUserIDs.length > 0) {
        //The first of the list is the contributor_ci which is the account id used to impersonate
        let authorPI = figshareAccountUserIDs[0];
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - setArticleImpersonateID - authorPI');
        sails.log[this.createUpdateFigshareArticleLogLevel](authorPI);
        accountId = authorPI[this.accountIdFA];
      } 
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - setArticleImpersonateID - accountId '+accountId);
      _.set(requestBody, this.impersonateFA, accountId);
    } 

    private setCustomFieldInRequestBody(record: any, customFieldsTemplate:any, keyName:string, customFieldsMappings:any) {
      let customField = _.find(customFieldsMappings, { 'figName': keyName });
      let value = '';
      if(_.isObject(customField)) {
        let template = _.get(customField,'template','');
        if(template.indexOf('<%') != -1) {
          let context = {
            record: record,
            moment: moment,
            field: customField,
            artifacts: sails.config.figshareAPI.mapping.artifacts
          }
          value = _.template(template)(context);      
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle ---- ${keyName} ----  template ---- ${value}`);
        } else {
          value = _.get(record,customField.rbName,customField.defaultValue);
        }
        _.set(customFieldsTemplate, keyName, value);
      }
    }
  
    private findCategoryIDs(dpCategories) {
      let catIDs = [];
      if(!_.isUndefined(this.for2020To2008Mapping) && !_.isEmpty(this.for2020To2008Mapping)){
        for (let dpCategory of dpCategories) {
          let dpForNotation = dpCategory.notation;
          if(dpForNotation.length > 4) {
            let dpCategoryId = _.find(this.for2020To2008Mapping, ['FOR2020Code', dpForNotation]);
            if(!_.isUndefined(dpCategoryId) && _.has(dpCategoryId, 'FigCatId') && dpCategoryId.FigCatId > 0) {
              catIDs.push(dpCategoryId.FigCatId);
            } else {
              //In relation to ticket 1182 after Figshare migrated FOR Codes to 2020 the Uncategorized category doesn't exist anymore
              //Figshare Uncategorized content 
              //catIDs.push(2);
            }
          } else {
            //In relation to ticket 1182 after Figshare migrated FOR Codes to 2020 the Uncategorized category doesn't exist anymore
            //Figshare Uncategorized content 
            //catIDs.push(2);
          }
        }
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - findCategoryIDs - exit catIDs '+catIDs);
      }
      return catIDs;
    }
    
    //FoR Codes 2020 converted to 2008
    private setArticleCategories(dataPublicationRecord, requestBody) {
      sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - setArticleCategories`);
      if(_.has(dataPublicationRecord, this.metadataDP + '.' + this.anzsrcForDP)) { 
        let figCategoryIDs = this.findCategoryIDs(dataPublicationRecord[this.metadataDP][this.anzsrcForDP]);
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - setArticleCategories '+JSON.stringify(figCategoryIDs));
        if(!_.isUndefined(figCategoryIDs) && !_.isEmpty(figCategoryIDs)){
          _.set(requestBody, this.categoriesFA, figCategoryIDs);
        }
      }
    }
    
    private async getFigPrivateLicenses() {
    
      let config = this.getAxiosConfig('get','/account/licenses', null); 

      sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - getFigPrivateLicenses - ${config.method} - ${config.url}`);
      sails.log[this.createUpdateFigshareArticleLogLevel](config);
      try {
          let response = await axios(config);
          return response.data;
      } catch (error) {
          sails.log[this.createUpdateFigshareArticleLogLevel](error);
          return null;
      }
    }


    private async getArticleDetails(articleId) {
       let articleDetailsConfig = this.getAxiosConfig('get', `/account/articles/${articleId}`, null);
       sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare checkStatusConfig ${articleDetailsConfig.method} - ${articleDetailsConfig.url}`);
       let responseArticleDetails = await axios(articleDetailsConfig);
       sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare status: ${responseArticleDetails.status} statusText: ${responseArticleDetails.statusText}`);
       let articleDetails = responseArticleDetails.data;
       return articleDetails;
    }

    private async isArticleApprovedAndPublished(articleId, articleDetails) {

      if(_.isUndefined(articleDetails) || _.isEmpty(articleDetails)) {
        articleDetails = await this.getArticleDetails(articleId);
      }

      if(_.has(articleDetails, this.curationStatusFA) && articleDetails[this.curationStatusFA] == 'approved') {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - isArticleApprovedAndPublished - true');
        return true;
      } else {
        return false;
      }
    }

    private async getArticleFileList(articleId) {
      let articleFileListConfig = this.getAxiosConfig('get', `/account/articles/${articleId}/files`, null);
      sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare - ${articleFileListConfig.method} - ${articleFileListConfig.url}`);
      let responseArticleList = await axios(articleFileListConfig);
      sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare - status: ${responseArticleList.status} statusText: ${responseArticleList.statusText}`);
      let articleFileList = responseArticleList.data;
      return articleFileList;
    }

    private async isFileUploadInProgress(articleId, articleFileList) {

      if(_.isUndefined(articleFileList) || _.isEmpty(articleFileList)) {
        articleFileList = await this.getArticleFileList(articleId);
      }
      //Files in figshare article have to be status available. Status 'created' means that the file is still being uploaded to the article
      let fileUploadInProgress = _.find(articleFileList, ['status', 'created']);
      if(!_.isUndefined(fileUploadInProgress)) {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - isFileUploadInProgress - true');
        return true;
      } else {
        return false;
      }
    }

    private async checkArticleHasURLsOrFilesAttached(articleId, articleFileList) {
      let stringifyFileList = '';
      if(!_.isUndefined(articleFileList)) {
        stringifyFileList = JSON.stringify(articleFileList);
      }
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkArticleHasURLsOrFilesAttached - articleFileList before '+stringifyFileList);
      sails.log[this.createUpdateFigshareArticleLogLevel](articleFileList);
      if(_.isUndefined(articleFileList) || _.isEmpty(articleFileList)) {
        articleFileList = await this.getArticleFileList(articleId);
      }
      if(!_.isUndefined(articleFileList)) {
        stringifyFileList = JSON.stringify(articleFileList);
      }
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkArticleHasURLsOrFilesAttached - articleFileList after '+stringifyFileList);
      sails.log[this.createUpdateFigshareArticleLogLevel](articleFileList);
      let fileUploadInProgress = _.find(articleFileList, ['status', 'created']);
      let filesOrURLsAttached = _.find(articleFileList, ['status', 'available']);
      if(_.isUndefined(fileUploadInProgress) && !_.isUndefined(filesOrURLsAttached)) {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkArticleHasURLsOrFilesAttached - true');
        return true;
      } else {
        return false;
      }
    }

    private getArticleUpdateRequestBody(dataPublicationRecord, figshareAccountAuthorIDs) {
      //Custom_fields is a dict not an array 
      let customFields = _.clone(sails.config.figshareAPI.mapping.templates.customFields.update);
      //group_id = 32014 = dataset
      //Item Type = defined_type = dataset 
      let requestBodyUpdate = new FigshareArticleUpdate(this.figArticleGroupId,this.figArticleItemType); 

      //TODO FIXE me build artifacts and template context only once to keep memory usage efficient

      for(let standardField of sails.config.figshareAPI.mapping.standardFields.update) {
        this.setStandardFieldInRequestBody(dataPublicationRecord,requestBodyUpdate,standardField);
      }
      //TODO FIXME make below methods configurable that are dependent on live artifacts that get retrieved at runtime
      this.setArticleAuthors(figshareAccountAuthorIDs, requestBodyUpdate);
      this.setArticleLicense(dataPublicationRecord, requestBodyUpdate);
      this.setArticleCategories(dataPublicationRecord, requestBodyUpdate);

      let customFieldsKeys = _.keys(customFields);
      for(let customFieldKey of customFieldsKeys) {
        this.setCustomFieldInRequestBody(dataPublicationRecord, customFields, customFieldKey, sails.config.figshareAPI.mapping.customFields.update);
      }

      _.set(requestBodyUpdate, this.customFieldsFA, customFields);

      return requestBodyUpdate;
    }

    private getArticleCreateRequestBody(dataPublicationRecord, figshareAccountAuthorIDs) {
      let requestBodyCreate = new FigshareArticleImpersonate();
      //Open Access and Full Text URL custom fields have to be set on create because the figshare article 
      //cannot be Made non draft (publish) so reviewers can pick it up from the queue
      let customFieldsImpersonate = _.clone(sails.config.figshareAPI.mapping.templates.customFields.createImpersonate);
      let customFieldsKeys = _.keys(customFieldsImpersonate);

      
      //TODO FIXE me build artifacts and template context only once to keep memory usage efficient
      for(let customFieldKey of customFieldsKeys) {
        this.setCustomFieldInRequestBody(dataPublicationRecord, customFieldsImpersonate, customFieldKey, sails.config.figshareAPI.mapping.customFields.createImpersonate);
      }

      for(let standardField of sails.config.figshareAPI.mapping.standardFields.createImpersonate) {
        this.setStandardFieldInRequestBody(dataPublicationRecord,requestBodyCreate,standardField);
      }

      //TODO FIXME make below methods configurable that are dependent on live artifacts that get retrieved at runtime
      this.setImpersonateID(figshareAccountAuthorIDs, requestBodyCreate);
      this.setArticleCategories(dataPublicationRecord, requestBodyCreate);
      this.setArticleLicense(dataPublicationRecord, requestBodyCreate);
      _.set(requestBodyCreate, this.customFieldsFA, customFieldsImpersonate);
      return requestBodyCreate;
    }

    private getEmbargoRequestBody(dataPublicationRecord, figshareAccountAuthorIDs) {
      //figArticleEmbargoOptions = [{id: 1780}] = administrator
      let requestEmbargoBody = new FigshareArticleEmbargo(0, false,'','','','',this.figArticleEmbargoOptions);

      //TODO FIXME make below methods configurable that are dependent on live artifacts that get retrieved at runtime
      this.setImpersonateID(figshareAccountAuthorIDs, requestEmbargoBody);
      this.setArticleEmbargoDate(dataPublicationRecord, requestEmbargoBody);
      return requestEmbargoBody;
    }

    private getPublishRequestBody(figshareAccountAuthorIDs) {
      let requestBody = { impersonate: 0 };
      this.setImpersonateID(figshareAccountAuthorIDs, requestBody);
      return requestBody;
    }

    private async sendDataPublicationToFigshare(dataPublicationRecord) {
      try {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - sendDataPublicationToFigshare - enter ');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
        let articleId; 

        if(_.has(dataPublicationRecord, this.metadataDP + '.' + this.figshareArticleID_DP) && 
          !_.isUndefined(dataPublicationRecord[this.metadataDP][this.figshareArticleID_DP]) && 
          dataPublicationRecord[this.metadataDP][this.figshareArticleID_DP] > 0) {
          articleId = dataPublicationRecord[this.metadataDP][this.figshareArticleID_DP];
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - sendDataPublicationToFigshare - metadata.figshare_article_id '+dataPublicationRecord[this.metadataDP][this.figshareArticleID_DP]);
        } else {
          articleId = 0;
        }
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - sendDataPublicationToFigshare - articleId '+articleId);
        let contributorsDP = this.getArticleAuthorsFromDP(dataPublicationRecord);
        // this.figshareAccountAuthorIDs = await this.getAuthorUserIDs(contributorsDP);
        //TODO FIXME
        this.figshareAccountAuthorIDs = [{ id: 1234, 'user_id': 1234 }];
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - sendDataPublicationToFigshare - figshareAccountAuthorIDs');
        sails.log[this.createUpdateFigshareArticleLogLevel](this.figshareAccountAuthorIDs);
        if(articleId == 0) {
          let requestBodyCreate = this.getArticleCreateRequestBody(dataPublicationRecord, this.figshareAccountAuthorIDs);
          sails.log[this.createUpdateFigshareArticleLogLevel](requestBodyCreate);
          this.validateCreateArticleRequestBody(requestBodyCreate);
          //Need to pre validate the update request body as well before creating the article because if the article gets
          //created and then a backend validation is thrown before update the DP record will not save the article ID given
          //this process is occurring in a pre save trigger 
          let dummyRequestBodyUpdate = this.getArticleUpdateRequestBody(dataPublicationRecord, this.figshareAccountAuthorIDs);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel](JSON.stringify(dummyRequestBodyUpdate));
          this.validateUpdateArticleRequestBody(dummyRequestBodyUpdate);
          
          let dummyEmbargoRequestBody = this.getEmbargoRequestBody(dataPublicationRecord, this.figshareAccountAuthorIDs);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel](JSON.stringify(dummyEmbargoRequestBody));
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          this.validateEmbargoRequestBody(dataPublicationRecord, dummyEmbargoRequestBody);

          //config for create article
          let figshareArticleConfig = this.getAxiosConfig('post', '/account/articles', requestBodyCreate);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare ${figshareArticleConfig.method} - ${figshareArticleConfig.url}`);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - sendDataPublicationToFigshare before create');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');

          sails.log[this.createUpdateFigshareArticleLogLevel](JSON.stringify(requestBodyCreate));

          //create article
          //TODO FIXME
          let responseCreate = { 
            status: 'success',
            statusText: 'success',
            data: {
              "entity_id": 11117777,
              location: `${sails.config.figshareAPI.baseURL}/account/articles/articleLocation`,
              warnings: [
                "string"
              ]
            }
          };
          // let responseCreate = await axios(figshareArticleConfig);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare status: ${responseCreate.status} statusText: ${responseCreate.statusText}`);

          //Note that lodash isEmpty will return true if the value is a number therefore had to be removed from the condition 
          if(_.has(responseCreate.data, this.entityIdFAR)) {

            articleId = responseCreate.data[this.entityIdFAR];

            if(!_.isUndefined(articleId) && articleId > 0) {

              _.set(dataPublicationRecord,this.metadataDP+'.'+this.figshareArticleID_DP, articleId+'');
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - sendDataPublicationToFigshare responseCreate.data.location '+responseCreate.data.location);

              if(_.has(responseCreate.data, this.locationFAR) && !_.isEmpty(responseCreate.data.location)) {
                
                let articleLocationURL = responseCreate.data.location.replace(`${sails.config.figshareAPI.baseURL}/account/articles/`,`${sails.config.figshareAPI.frontEndURL}/account/articles/`);
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - sendDataPublicationToFigshare articleLocationURL '+articleLocationURL);
                _.set(dataPublicationRecord, this.metadataDP+'.'+this.figshareArticleLocationDP, articleLocationURL);
                
                //https://docs.figshare.com/#private_article_publish
                let requestBodyPublishAfterCreate = this.getPublishRequestBody(this.figshareAccountAuthorIDs);
                let publishConfig = this.getAxiosConfig('post', `/account/articles/${articleId}/publish`, requestBodyPublishAfterCreate);
                sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare ${publishConfig.method} - ${publishConfig.url}`);
                //TODO FIXME
                // let responsePublish = await axios(publishConfig);
                // sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare status: ${responsePublish.status} statusText: ${responsePublish.statusText}`);
              }
            }
          }
        } 
        
        if(!_.isUndefined(articleId) && articleId > 0) {

          let articleDetails = await this.getArticleDetails(articleId);
          let articleApprovedPublished = await this.isArticleApprovedAndPublished(articleId, articleDetails);
          let articleFileList = await this.getArticleFileList(articleId);
          let fileUploadInProgress = await this.isFileUploadInProgress(articleId, articleFileList);

          if(articleApprovedPublished) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare cannot be modified any further after it has been Approved & Published`);
          } else if(fileUploadInProgress) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare file uploads still in progress`);
            sails.log[this.createUpdateFigshareArticleLogLevel](fileUploadInProgress);
            let customError: RBValidationError = new RBValidationError(TranslationService.t('@backend-Upload-In-Progress-validationMessage'));
            throw customError;
          } else {

            //set request body for updating Figshare article
            let requestBodyUpdate = this.getArticleUpdateRequestBody(dataPublicationRecord, this.figshareAccountAuthorIDs);
            sails.log[this.createUpdateFigshareArticleLogLevel](requestBodyUpdate);
            this.validateUpdateArticleRequestBody(requestBodyUpdate);
            
            //articleId is passed in then changed config to update (put) instead of create (post) config for update
            let figshareArticleConfig = this.getAxiosConfig('put', `/account/articles/${articleId}`, requestBodyUpdate); 
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - sendDataPublicationToFigshare before update articleId '+articleId);
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare - ${figshareArticleConfig.method} - ${figshareArticleConfig.url}`);
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
            //update article without impersonate
            let responseUpdate = await axios(figshareArticleConfig);
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare status: ${responseUpdate.status} statusText: ${responseUpdate.statusText}`);
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - sendDataPublicationToFigshare responseUpdate.data.location '+responseUpdate.data.location);
            
            if(_.has(responseUpdate.data, this.locationFAR) && !_.isEmpty(responseUpdate.data.location)) {

              let articleLocationURL = responseUpdate.data.location.replace(`${sails.config.figshareAPI.baseURL}/account/articles/`,`${sails.config.figshareAPI.frontEndURL}/account/articles/`);
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - articleLocationURL '+articleLocationURL);
              _.set(dataPublicationRecord, this.metadataDP+'.'+this.figshareArticleLocationDP, articleLocationURL);

              let requestBodyPublishAfterUpdate = this.getPublishRequestBody(this.figshareAccountAuthorIDs);
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - sendDataPublicationToFigshare before impersonate publish response location '+responseUpdate.data.location);
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - sendDataPublicationToFigshare before impersonate publish figshare_article_location '+dataPublicationRecord[this.metadataDP][this.figshareArticleLocationDP]);
              sails.log[this.createUpdateFigshareArticleLogLevel](requestBodyPublishAfterUpdate);

              //https://docs.figshare.com/#private_article_publish
              let publishConfig = this.getAxiosConfig('post', `/account/articles/${articleId}/publish`, requestBodyPublishAfterUpdate);
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare - ${publishConfig.method} - ${publishConfig.url}`);
              let responsePublish = await axios(publishConfig);
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare - status: ${responsePublish.status} statusText: ${responsePublish.statusText}`);
            }
          }

          let requestEmbargoBody = this.getEmbargoRequestBody(dataPublicationRecord, this.figshareAccountAuthorIDs);

          let filesOrURLsAttached = await this.checkArticleHasURLsOrFilesAttached(articleId, articleFileList);
          if((requestEmbargoBody[this.embargoTypeFA] == 'article' && requestEmbargoBody[this.isEmbargoedFA] == true) || (filesOrURLsAttached && requestEmbargoBody[this.embargoTypeFA] == 'file')) {
            
            //validate requestEmbargoBody
            this.validateEmbargoRequestBody(dataPublicationRecord, requestEmbargoBody);
            //Update full article embargo info because Figshare rules allow for full article embargo to be set regardless if there are files uploaded
            let embargoConfig = this.getAxiosConfig('put', `/account/articles/${articleId}/embargo`, requestEmbargoBody); 
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare - ${embargoConfig.method} - ${embargoConfig.url}`);
            let responseEmbargo = await axios(embargoConfig);
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare status: ${responseEmbargo.status} statusText: ${responseEmbargo.statusText}`);
          
          } else if(requestEmbargoBody[this.embargoTypeFA] == 'article' && requestEmbargoBody[this.isEmbargoedFA] == false) {

            let embargoDeleteConfig = this.getAxiosConfig('delete', `/account/articles/${articleId}/embargo`, {}); 
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare - ${embargoDeleteConfig.method} - ${embargoDeleteConfig.url}`);
            let responseEmbargoDelete = await axios(embargoDeleteConfig);
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare status: ${responseEmbargoDelete.status} statusText: ${responseEmbargoDelete.statusText}`);
          }
        }
        
      } catch (error) {
          sails.log.error(error);
          throw error;
      }

      return dataPublicationRecord;
    }

    private validateEmbargoRequestBody(dataPublicationRecord, requestBody) {
      let valid = '';
      let dateFormat = 'YYYY-MM-DD';
      let dataPubAccessRights = dataPublicationRecord[this.metadataDP][this.accessRightDP];
      if(!_.isEmpty(requestBody[this.embargoDateFA]) && dataPubAccessRights != 'mediated') {
        let now = moment().utc().format(dateFormat);
        sails.log[this.createUpdateFigshareArticleLogLevel](now);
        let compareDate = moment(requestBody[this.embargoDateFA], dateFormat).utc().format(dateFormat);
        sails.log[this.createUpdateFigshareArticleLogLevel](compareDate);
        let isAfter = moment(compareDate).isAfter(now);
        sails.log[this.createUpdateFigshareArticleLogLevel](isAfter);
        if(!isAfter) {
          valid = TranslationService.t('@dataPublication-embargoDate-validationMessage');
        }
      }

      sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - validateEmbargoRequestBody - validMessage ${valid}`);
      if(valid != '') {
        let customError: RBValidationError = new RBValidationError(valid);
        throw customError;
      }
    }

    private checkArticleCreateFields(requestBody) {
      let valid = '';
      let idNotFound = TranslationService.t('@backend-idNotFound-validationMessage');
      if(_.isUndefined(requestBody[this.impersonateFA])) {
        valid = TranslationService.t('@dataPublication-accountIdNotFound-validationMessage');
        return valid;
      }

      if(_.isUndefined(requestBody[this.licenseFA])) {
        valid = TranslationService.t('@dataPublication-license-identifier') + idNotFound;
        return valid;
      }

      let customFields = requestBody[this.customFieldsFA];
      let fullTextURL = customFields[this.customFullTextURL][0];
      if(!_.isEmpty(fullTextURL) && !_.startsWith(fullTextURL, 'http://') && !_.startsWith(fullTextURL, 'https://')) {
        valid = TranslationService.t('@backend-URL-validationMessage');
        return valid;
      }

      return valid;
    }

    private validateCreateArticleRequestBody(requestBody) {
      let valid = this.checkArticleCreateFields(requestBody);
      sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - validateCreateArticleRequestBody - validMessage ${valid}`);
      if(valid != '') {
        let customError: RBValidationError = new RBValidationError(valid);
        throw customError;
      }
    }

    private checkArticleUpdateFields(requestBody) {
      let valid = '';
      let max250 = 250;
      let max1000 = 1000;
      let invalidValueForField = TranslationService.t('@backend-prefix-validationMessage'); //'Invalid value for field: ';
      let maxLengthIs =  TranslationService.t('@backend-maxlength-validationMessage'); //', maximum length is ';
      let idNotFound = TranslationService.t('@backend-idNotFound-validationMessage'); //' Id Not Found in Figshare';

      if(_.isUndefined(requestBody[this.licenseFA])) {
        valid = TranslationService.t('@dataPublication-license-identifier') + idNotFound;
        return valid;
      }

      // Figshare format requires to remove domain in example
      // https://dx.doi.org/10.25946/5f48373c5ac76
      // has to be stripped of domain to 
      // 10.25946/5f48373c5ac76
      // Regex to validate DOI taken from
      // https://www.crossref.org/blog/dois-and-matching-regular-expressions/
      let resourceDOI = requestBody[this.resourceDOI_FA];
      if(!_.isEmpty(resourceDOI)) {
        let re = new RegExp('^10.\\d{4,9}\/[-._;()\/:A-Z0-9]+$','i');
        if(!re.test(resourceDOI)) {
          valid = invalidValueForField + TranslationService.t('@dataPublication-relatedResources-validationMessage');
          return valid;
        }
      }
      let resourceTitle = requestBody[this.resourceTitleFA];
      if(!_.isEmpty(resourceDOI) && _.isEmpty(resourceTitle)) {
        valid = invalidValueForField + TranslationService.t('@dataPublication-relatedResources-title-empty');
        return valid;
      }

      let customFields = requestBody[this.customFieldsFA];
      if(_.isUndefined(customFields[this.customFieldSupervisor])) {
        valid = TranslationService.t('@dmpt-people-tab-supervisor') + idNotFound;
        return valid;
      }

      if(customFields[this.customFieldSupervisor].length > max250) {
        valid = invalidValueForField + TranslationService.t('@dmpt-people-tab-supervisor') + max250;
        return valid;
      }

      if(customFields[this.customFieldLanguageFA].length > max250) {
        valid = invalidValueForField + TranslationService.t('@dataRecord-languages') + maxLengthIs + max250;
        return valid;
      }

      if(customFields[this.customFieldAdditionalRights].length > max1000) {
        valid = invalidValueForField + TranslationService.t('@dataRecord-third-party-licences') + maxLengthIs + max1000;
        return valid;
      }

      if(customFields[this.customFieldSizeOfDataset].length > max250) {
        valid = invalidValueForField + TranslationService.t('@dataRecord-dataset-size') + maxLengthIs + max250;
        return valid;
      }
      
      if(customFields[this.customFieldMedium].length > max250) {
        valid = invalidValueForField + TranslationService.t('@dmpt-dataset-format') + maxLengthIs + max250;
        return valid;
      }

      if(customFields[this.customFieldGeolocation].length > max250) {
        valid = invalidValueForField + TranslationService.t('@dataRecord-geolocation') + maxLengthIs + max250;
        return valid;
      }
      
      let fullTextURL = customFields[this.customFullTextURL][0];
      if(!_.isEmpty(fullTextURL) && !_.startsWith(fullTextURL, 'http://') && !_.startsWith(fullTextURL, 'https://')) {
        valid = TranslationService.t('@backend-URL-validationMessage');
        return valid;
      }

      return valid;
    }

    private validateUpdateArticleRequestBody(requestBody) {
      let valid = this.checkArticleUpdateFields(requestBody);
      sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - validateUpdateArticleRequestBody - validMessage ${valid}`);
      if(valid != '') {
        let customError: RBValidationError = new RBValidationError(valid);
        throw customError;
      }
    }

    private isFileAttachmentInDataLocations(dataLocations) {
      let foundAttachment = false;
      for(let attachmentFile of dataLocations) {
        if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment') {
          foundAttachment = true;
          break;
        }
      }
      return foundAttachment;
    }

    private async checkUploadFilesPending(dataPublicationRecord, oid) {
      try {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - enter');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');

        let articleId;
        if(_.has(dataPublicationRecord, this.metadataDP + '.' + this.figshareArticleID_DP) && 
          !_.isUndefined(dataPublicationRecord[this.metadataDP][this.figshareArticleID_DP]) && 
          dataPublicationRecord[this.metadataDP][this.figshareArticleID_DP] > 0) {
          articleId = dataPublicationRecord[this.metadataDP][this.figshareArticleID_DP];
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - metadata.figshare_article_id '+dataPublicationRecord[this.metadataDP][this.figshareArticleID_DP]);
        } else {
          articleId = 0;
        }
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - articleId '+articleId);
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - oid '+oid);

        if(articleId > 0) {

          //Check article curation status and if approved cannot be updated
          let checkStatusConfig = this.getAxiosConfig('get', `/account/articles/${articleId}`, null);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - checkUploadFilesPending - ${checkStatusConfig.method} - ${checkStatusConfig.url}`);
          let responseArticleDetails = await axios(checkStatusConfig);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - checkUploadFilesPending - status: ${responseArticleDetails.status} statusText: ${responseArticleDetails.statusText}`);
          let articleDetails = responseArticleDetails.data;

          if(_.has(articleDetails, this.curationStatusFA) && articleDetails[this.curationStatusFA] == 'approved') {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - checkUploadFilesPending - cannot be modified any further after it has been Approved & Published`);
          } else {

            //Try to upload files to article
            let that = this;
            let articleFileListConfig = this.getAxiosConfig('get', `/account/articles/${articleId}/files`, null);
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - checkUploadFilesPending - ${articleFileListConfig.method} - ${articleFileListConfig.url}`);
            let responseArticleList = await axios(articleFileListConfig);
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - checkUploadFilesPending - status: ${responseArticleList.status} statusText: ${responseArticleList.statusText}`);
            let articleFileList = responseArticleList.data;
            let filePath = sails.config.figshareAPI.attachmentsFigshareTempDir;
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - attachmentsFigshareTempDir '+filePath);
            
            if (!fs.existsSync(filePath)){
              fs.mkdirSync(filePath);
            }

            let dataLocations = dataPublicationRecord[this.metadataDP][this.dataLocationsDP];
            let accessRights = dataPublicationRecord[this.metadataDP][this.accessRightDP];
            let foundAttachment = this.isFileAttachmentInDataLocations(dataLocations);
            //Citation hides the locations component but if there are left over attached files but hidden then these should not be uploaded 
            if(accessRights == 'citation') {
              foundAttachment = false;
            }
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - foundAttachment '+foundAttachment);
            
            if(foundAttachment) {
              //Files in figshare article have to be status available. Status 'created' means that the file is still being uploaded to the article
              let fileUploadInProgress = await this.isFileUploadInProgress(articleId, articleFileList);
              if(fileUploadInProgress) {
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - file uploads still in progress');
              }

              for(let attachmentFile of dataLocations) {
                if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment') {
                  sails.log[this.createUpdateFigshareArticleLogLevel](attachmentFile);
                  let attachId = attachmentFile.fileId;
                  let fileName = attachmentFile.name;
                  let fileSize = attachmentFile.size;
                  //check if the file has been uploaded already or not to the figshare article 
                  responseArticleList = await axios(articleFileListConfig);
                  articleFileList = responseArticleList.data;
                  sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - article file list: '+JSON.stringify(articleFileList));
                  let filePendingToBeUploaded = _.find(articleFileList, ['name', fileName]);
                  let fileFullPath = filePath + '/' +fileName;
                  let thresholdAppliedFileSize = fileSize + sails.config.figshareAPI.diskSpaceThreshold;
                  if(_.isUndefined(filePendingToBeUploaded) && !fileUploadInProgress) {
                    //if file name not found on the articleFileList means it's not yet uploaded and an agenda queue job needs to be queued 
                    sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - attachmentsTempDir '+sails.config.figshareAPI.attachmentsTempDir);
                    let diskSpace = await checkDiskSpace(sails.config.figshareAPI.attachmentsTempDir);
                    sails.log[this.createUpdateFigshareArticleLogLevel](diskSpace);
                    sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - total file size '+fileSize);
                    sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - total free disk space '+diskSpace.free);
                    if(diskSpace.free > thresholdAppliedFileSize) {
                      sails.log[that.createUpdateFigshareArticleLogLevel](`FigArticle - checkUploadFilesPending - saving file to temp location in ${fileFullPath}`);
                      sails.log[that.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - start processing file upload ');
                      sails.log[that.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - fileSize '+fileSize);
                      //Refactor not to use agenda queue and processing only one file at a time per one data publication although concurrent file uploads can 
                      //happen with different data publication records and once a file upload process is finished it will do a recursive call to this method 
                      //checkUploadFilesPending to process to process the next file upload to Figshare
                      this.processFileUploadToFigshare(oid, attachId, articleId, dataPublicationRecord, fileName, fileSize);
                      break;
                    } else {
                      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - Not enough free space on disk');
                    }
                  }
                }
              }
            } else {
              for(let attachmentFile of dataLocations) {
                if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'url') {

                  let linkOnlyFileFound = false;
                  let linkOnlyId;
                  for(let linkOnly of articleFileList) {
                    if(linkOnly['is_link_only'] == true){
                      linkOnlyFileFound = true;
                      linkOnlyId = linkOnly['id'];
                      break;
                    }
                  }

                  if(linkOnlyFileFound) {
                    let configDelete = this.getAxiosConfig('delete',`/account/articles/${articleId}/files/${linkOnlyId}`,{});
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - checkUploadFilesPending - ${configDelete.method} - ${configDelete.url}`);
                    let responseDelete = await axios(configDelete);
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - checkUploadFilesPending - responseDelete status: ${responseDelete.status} statusText: ${responseDelete.statusText}`);
                    sails.log[this.createUpdateFigshareArticleLogLevel](responseDelete.data);
                  } 
            
                  let requestBody =  
                  {
                    link: attachmentFile.location
                  }
                  let config = this.getAxiosConfig('post',`/account/articles/${articleId}/files`,requestBody);
                  
                  sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - checkUploadFilesPending - ${config.method} - ${config.url}`);
                  let response = await axios(config);
                  sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - checkUploadFilesPending - response link only status: ${response.status} statusText: ${response.statusText}`);
                  sails.log[this.createUpdateFigshareArticleLogLevel](response.data);
                  sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
                  sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - checkUploadFilesPending - response link only '+response.data.location);
                  sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
                  break;
                }
              }
            }

            //Update file embargo can be set only after at least one file has been successfully uploaded therefore the reason for additional checks 
            let requestEmbargoBody = this.getEmbargoRequestBody(dataPublicationRecord, this.figshareAccountAuthorIDs);
            let filesOrURLsAttached = await this.checkArticleHasURLsOrFilesAttached(articleId, articleFileList);
              
            if((requestEmbargoBody[this.embargoTypeFA] == 'article' && requestEmbargoBody[this.isEmbargoedFA] == true) || (requestEmbargoBody[this.embargoTypeFA] == 'file' && filesOrURLsAttached) ) {
              
              //validate requestEmbargoBody
              this.validateEmbargoRequestBody(dataPublicationRecord, requestEmbargoBody);
              let embargoConfig = this.getAxiosConfig('put', `/account/articles/${articleId}/embargo`, requestEmbargoBody); 
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - checkUploadFilesPending - ${embargoConfig.method} - ${embargoConfig.url}`);
              let responseEmbargo = await axios(embargoConfig);
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - checkUploadFilesPending - status: ${responseEmbargo.status} statusText: ${responseEmbargo.statusText}`);
            } else if(requestEmbargoBody[this.embargoTypeFA] == 'article' && requestEmbargoBody[this.isEmbargoedFA] == false) {
            
              let embargoDeleteConfig = this.getAxiosConfig('delete', `/account/articles/${articleId}/embargo`, {}); 
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare - ${embargoDeleteConfig.method} - ${embargoDeleteConfig.url}`);
              let responseEmbargoDelete = await axios(embargoDeleteConfig);
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare status: ${responseEmbargoDelete.status} statusText: ${responseEmbargoDelete.statusText}`);
            }
          }
        }

      } catch (error) {
          sails.log.error(error);
      }
    }

    //Fixed version, unminified and ES6'ed 
    //taken from SO
    //https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
    private formatBytes(bytes, decimals = 2) {
      if (bytes === 0) return '0 Bytes';
  
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
      const i = Math.floor(Math.log(bytes) / Math.log(k));
  
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    public async processFileUploadToFigshare(oid, attachId, articleId, dataPublicationRecord, fileName, fileSize) {

      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFileUploadToFigshare - enter');
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFileUploadToFigshare - oid '+oid);
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFileUploadToFigshare - attachId '+attachId);
      sails.log[this.createUpdateFigshareArticleLogLevel](attachId);
      let filePath = sails.config.figshareAPI.attachmentsFigshareTempDir;
      let fileFullPath = filePath+'/'+fileName;

      sails.log[this.createUpdateFigshareArticleLogLevel](dataPublicationRecord);
      let dataLocations = dataPublicationRecord[this.metadataDP][this.dataLocationsDP];
      //Print the list of files in the dataPublication record 
      for(let attachmentFile of dataLocations) {
        sails.log[this.createUpdateFigshareArticleLogLevel](attachmentFile);
      }

      try {
        const file = fs.createWriteStream(fileFullPath);

        try {
          let response = await this.datastreamService.getDatastream(oid, attachId);
          
          if(response.readstream) {
              await new Promise((resolve, reject) => {
              response.readstream.pipe(file);
              response.readstream.on("error", (err) => {
                reject(err);
              });
              response.readstream.on("close", () => {
                resolve(file);
              });
            }); 
          }
        } catch(err) {
          sails.log.error('FigArticle - processFileUploadToFigshare '+JSON.stringify(err));
        }

        let fileStats =  fs.statSync(fileFullPath);
        let apoxFileSize = this.formatBytes(fileStats.size);
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFileUploadToFigshare - fileFullPath '+fileFullPath + ' apoxFileSize '+ apoxFileSize);

        if(fs.existsSync(fileFullPath) && fileStats.size > 0) {
          
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFileUploadToFigshare - file saved to '+fileFullPath);
          let uploadURL;
          let fileId;
          let uploadParts = [];

          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFileUploadToFigshare - articleId '+articleId);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFileUploadToFigshare - fileName '+fileName);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFileUploadToFigshare - filePath '+filePath);
          
          let requestStep1 =  
          {
            impersonate: 0,
            name: fileName,
            size: fileSize
          }
          this.setImpersonateID(this.figshareAccountAuthorIDs, requestStep1);
          
          let configStep1 = this.getAxiosConfig('post',`/account/articles/${articleId}/files`,requestStep1);
          
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - processFileUploadToFigshare - ${configStep1.method} - ${configStep1.url}`);
          let responseStep1 = await axios(configStep1);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - processFileUploadToFigshare- response step 1 status: ${responseStep1.status} statusText: ${responseStep1.statusText}`);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFileUploadToFigshare - response step 1 '+responseStep1.data.location);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
      
          //example reply
          /*
          {
          "location": "https://api.figsh.com/v2/account/articles/7554216/files/829883224"
          }
          */
      
          let uploadFileLocation = responseStep1.data.location;

          let figAccessToken = 'token '+sails.config.figshareAPI.APIToken;

          let figHeaders = { 
            'Content-Type': 'application/json',
            'Authorization': figAccessToken
          };
      
          let configStep2 = {
              method: 'get',
              url: uploadFileLocation,
              headers: figHeaders
          };
      
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - processFileUploadToFigshare - ${configStep2.method} - ${configStep2.url}`);
          let responseStep2 = await axios(configStep2);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - processFileUploadToFigshare - response step 2 status: ${responseStep2.status} statusText: ${responseStep2.statusText}`);
          uploadURL = responseStep2.data.upload_url;
          fileId = responseStep2.data.id;
      
          //example reply
          /*
          {
          "upload_token": "563297df-249f-48a7-a7a2-80aa25af12b4",
          "upload_url": "https://fup1010100.figsh.com/upload/563297df-249f-48a7-a7a2-80aa25af12b4",
          "status": "created",
          "preview_state": "preview_not_available",
          "viewer_type": "",
          "id": 829883224,
          "name": "Untitled4.png",
          "size": 18850,
          "is_link_only": false,
          "download_url": "https://ndownloader.figsh.com/files/829883224",
          "supplied_md5": "0c13924e817babc9afb2a1bcdec72067",
          "computed_md5": ""
          }
          */
      
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFileUploadToFigshare - response step 2 - id '+fileId+' - url '+uploadURL);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
      
          let configStep3 = {
              method: 'get',
              url: uploadURL,
              headers: figHeaders
          };
      
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - processFileUploadToFigshare - ${configStep3.method} - ${configStep3.url}`);
          let responseStep3 = await axios(configStep3);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - processFileUploadToFigshare - response step 3 status: ${responseStep3.status} statusText: ${responseStep3.statusText}`);
          uploadParts = responseStep3.data.parts;
      
          //example reply
          /*
          {
          "token": "563297df-249f-48a7-a7a2-80aa25af12b4",
          "md5": "0c13924e817babc9afb2a1bcdec72067",
          "size": 18850,
          "name": "829883224/Untitled4.png",
          "status": "PENDING",
          "parts": [
              {
                  "partNo": 1,
                  "startOffset": 0,
                  "endOffset": 18849,
                  "status": "PENDING",
                  "locked": false
              }
          ]
          }
          */

          let totalParts = uploadParts.length;
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFileUploadToFigshare - uploadParts.length '+totalParts);
          if(!_.isUndefined(uploadParts) && uploadParts.length > 0) {

            if(uploadParts.length > 0) {

              for(let part of uploadParts) {

                let partNo = part.partNo;
                let startReadByte = part.startOffset;
                let endReadByte = part.endOffset;
                // let chunkSize = endReadByte - startReadByte + 1;
                let readStreamConfig = {
                    start: startReadByte,
                    end: endReadByte
                  }
                
                //https://stackoverflow.com/questions/30386768/is-createreadstream-asynchronous
                //Based on the above SO question/answer await cannot be used here because It does not 
                //return a promise or accept a callback or accept a callback but it's also not required
                let bufferChunk = fs.createReadStream(fileFullPath, readStreamConfig);
                
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFileUploadToFigshare - createReadStream end - totalParts '+totalParts+' partNo '+partNo+' fileName '+fileName);
                let paramsImpersonate: {
                  impersonate: 0
                }
                this.setImpersonateID(this.figshareAccountAuthorIDs, paramsImpersonate);
                let configStep4 = {
                  headers: { 
                    'Content-Type': 'application/octet-stream',
                    'Authorization': 'Token '+sails.config.figshareAPI.APIToken
                  },
                  maxContentLength: Infinity,
                  maxBodyLength: Infinity,
                  method: 'put', 
                  params: paramsImpersonate,
                  url: `${uploadURL}/${partNo}`,
                  data: bufferChunk
                }
                sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - processFilePartUploadToFigshare - ${configStep4.method} - ${configStep4.url}`);
                //this is when the read stream or file or bufferChunk is open and read therefore this is the only await that is required 
                let responseStep4 = await axios(configStep4);
                sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - processFilePartUploadToFigshare - response step 4 status: ${responseStep4.status} statusText: ${responseStep4.statusText}`);
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - processFilePartUploadToFigshare - uploaded file chunk totalParts '+totalParts+' partNo '+partNo+' fileName '+fileName);
              }

              //complete upload step 5
              let requestBodyComplete = { impersonate: 0 };
              this.setImpersonateID(this.figshareAccountAuthorIDs, requestBodyComplete);
              let configStep5 = this.getAxiosConfig('post', `/account/articles/${articleId}/files/${fileId}`, requestBodyComplete);
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - processFilePartUploadToFigshare - ${configStep5.method} - ${configStep5.url}`);
              let responseStep5 = await axios(configStep5);
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - processFilePartUploadToFigshare - response step 5 status: ${responseStep5.status} statusText: ${responseStep5.statusText}`);
              sails.log.info(`FigArticle - processFilePartUploadToFigshare - file upload completed articleId ${articleId} totalParts ${totalParts} fileName ${fileName}`);

              //Delete the file from the temp directory
              fs.unlinkSync(fileFullPath);

              //Update file embargo info if required
              //Figshare rules allow for full article embargo to be set regardless if there are files uploaded however a file 
              //embargo can be set only after at least one file has been successfully uploaded therefore this seems to be the 
              //place to try to set the file embargo during processing because depending on the workflow if a user goes into
              //Figshare and removes all the file attachments from the article the file embargo is also cleared therefore in this
              //way a file embargo can always be reinstated if allowed by the workflow

              let requestEmbargoBody = this.getEmbargoRequestBody(dataPublicationRecord, this.figshareAccountAuthorIDs);
              let filesOrURLsAttached = await this.checkArticleHasURLsOrFilesAttached(articleId, {});
              
              if((requestEmbargoBody[this.embargoTypeFA] == 'article' && requestEmbargoBody[this.isEmbargoedFA] == true) || (filesOrURLsAttached && requestEmbargoBody[this.embargoTypeFA] == 'file')) { 
                
                //validate requestEmbargoBody
                this.validateEmbargoRequestBody(dataPublicationRecord, requestEmbargoBody);
                let embargoConfig = this.getAxiosConfig('put', `/account/articles/${articleId}/embargo`, requestEmbargoBody); 
                sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - processFilePartUploadToFigshare - embargo - ${embargoConfig.method} - ${embargoConfig.url}`);
                let responseEmbargo = await axios(embargoConfig);
                sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - processFilePartUploadToFigshare - status: ${responseEmbargo.status} statusText: ${responseEmbargo.statusText}`);
              } else if(requestEmbargoBody[this.embargoTypeFA] == 'article' && requestEmbargoBody[this.isEmbargoedFA] == false) {
            
                let embargoDeleteConfig = this.getAxiosConfig('delete', `/account/articles/${articleId}/embargo`, {}); 
                sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare - ${embargoDeleteConfig.method} - ${embargoDeleteConfig.url}`);
                let responseEmbargoDelete = await axios(embargoDeleteConfig);
                sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - sendDataPublicationToFigshare status: ${responseEmbargoDelete.status} statusText: ${responseEmbargoDelete.statusText}`);
              }
            } 
          }
        } else {
          sails.log.info(`FigArticle - processFileUploadToFigshare - filePath ${fileFullPath} not found articleId ${articleId}`);
        }
      
      } catch (error) {
          sails.log.error(error);
          if (fs.existsSync(fileFullPath)){
            fs.unlinkSync(fileFullPath);
          }
      }

      //After successful or failure of uploading a file still check if there are other files pending to be uploaded to figshare
      this.checkUploadFilesPending(dataPublicationRecord, oid);

      return dataPublicationRecord;
    }

    public createUpdateFigshareArticle(oid, record, options, user) {

      if(sails.config.record.createUpdateFigshareArticleLogLevel != null) {
        this.createUpdateFigshareArticleLogLevel = sails.config.record.createUpdateFigshareArticleLogLevel;
        sails.log.info(`FigArticle - createUpdateFigshareArticle - log level ${sails.config.record.createUpdateFigshareArticleLogLevel}`);
      } else {
        sails.log.info(`FigArticle - createUpdateFigshareArticle - log level ${this.createUpdateFigshareArticleLogLevel}`);
      }

      if (this.metTriggerCondition(oid, record, options) === 'true') {
        return this.sendDataPublicationToFigshare(record);
      } else {
        return record;
      }
    }

    public uploadFilesToFigshareArticle(oid, record, options, user) {

      if(sails.config.record.createUpdateFigshareArticleLogLevel != null) {
        this.createUpdateFigshareArticleLogLevel = sails.config.record.createUpdateFigshareArticleLogLevel;
        sails.log.info(`FigArticle - uploadFilesToFigshareArticle - log level ${sails.config.record.createUpdateFigshareArticleLogLevel}`);
      } else {
        sails.log.info(`FigArticle - uploadFilesToFigshareArticle - log level ${this.createUpdateFigshareArticleLogLevel}`);
      }
      
      if (this.metTriggerCondition(oid, record, options) === 'true') {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - uploadFilesToFigshareArticle - enter');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - uploadFilesToFigshareArticle - oid '+oid);
        this.checkUploadFilesPending(record, oid);
      }
    }

    private async deleteFilesAndUpdateDataLocationEntries(dataPublicationRecord, oid) {
      try {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - deleteFilesAndUpdateDataLocationEntries - enter');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - -------------------------------------------');

        let articleId;
        if(_.has(dataPublicationRecord, this.metadataDP + '.' + this.figshareArticleID_DP) && 
          !_.isUndefined(dataPublicationRecord[this.metadataDP][this.figshareArticleID_DP]) && 
          dataPublicationRecord[this.metadataDP][this.figshareArticleID_DP] > 0) {
          articleId = dataPublicationRecord[this.metadataDP][this.figshareArticleID_DP];
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - deleteFilesAndUpdateDataLocationEntries - metadata.figshare_article_id '+dataPublicationRecord[this.metadataDP][this.figshareArticleID_DP]);
        } else {
          articleId = 0;
        }
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - deleteFilesAndUpdateDataLocationEntries - articleId '+articleId);
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - deleteFilesAndUpdateDataLocationEntries - oid '+oid);

        if(articleId > 0) {

          let articleFileListConfig = this.getAxiosConfig('get', `/account/articles/${articleId}/files`, null);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - deleteFilesAndUpdateDataLocationEntries - ${articleFileListConfig.method} - ${articleFileListConfig.url}`);
          let responseArticleList = await axios(articleFileListConfig);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigArticle - deleteFilesAndUpdateDataLocationEntries - status: ${responseArticleList.status} statusText: ${responseArticleList.statusText}`);
          let articleFileList = responseArticleList.data;

          let dataLocations = dataPublicationRecord[this.metadataDP][this.dataLocationsDP];
          let urlList = [];

          //delete files from redbox
          for(let attachmentFile of dataLocations) {
            if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && _.has(attachmentFile, 'fileId')) {
              let figFileDetails = _.find(articleFileList, ['name', attachmentFile['name']]);
              if(!_.isUndefined(figFileDetails)) {
                urlList.push(figFileDetails);
                sails.log[this.createUpdateFigshareArticleLogLevel](attachmentFile);
                this.datastreamService.removeDatastream(oid, attachmentFile); 
              }
            }
          }

          if(!_.isEmpty(urlList)) {
            //update entries in data location widget to point to the Figshare URL
            for(let fileUrl of urlList) {
              sails.log[this.createUpdateFigshareArticleLogLevel](fileUrl);
              let fileName = fileUrl['name'];
              let fileNameNotes = 'File name: '+ fileName;
              let newUrl = {type: 'url', location: fileUrl['download_url'], notes: fileNameNotes};
              sails.log[this.createUpdateFigshareArticleLogLevel](newUrl);
              //remove existing entry to the file attachment
              _.remove(dataPublicationRecord[this.metadataDP][this.dataLocationsDP], ['name', fileName]);
              //add new entry as URL to the same file already uploaded to Figshare
              dataPublicationRecord[this.metadataDP][this.dataLocationsDP].push(newUrl);
            } 
          }

        }
      } catch (error) {
        sails.log.error(error);
      }

      return dataPublicationRecord;
    }

    public deleteFilesFromRedbox (oid, record, options, user) {

      if(sails.config.record.createUpdateFigshareArticleLogLevel != null) {
        this.createUpdateFigshareArticleLogLevel = sails.config.record.createUpdateFigshareArticleLogLevel;
        sails.log.info(`FigArticle - deleteFilesFromRedbox - log level ${sails.config.record.createUpdateFigshareArticleLogLevel}`);
      } else {
        sails.log.info(`FigArticle - deleteFilesFromRedbox - log level ${this.createUpdateFigshareArticleLogLevel}`);
      }
    
      if (this.metTriggerCondition(oid, record, options) === 'true') {
        return this.deleteFilesAndUpdateDataLocationEntries(record, oid);
      } else {
        return record;
      }
    }

    private queueFileUpload(attachId, oid, articleId, dataPublicationRecord, fileName, fileSize) {
      let jobName = 'Figshare-Upload-Service';
      let queueMessage = {
        attachId: attachId,
        oid: oid,
        articleId: articleId,
        dataPublicationRecord: dataPublicationRecord,
        fileName: fileName,
        fileSize: fileSize,
        function: 'sails.services.figsharetriggerservice.processFileUploadToFigshare'
      };
      
      sails.log.info(`FigArticle - queueFileUpload - Queueing up trigger using jobName ${jobName} articleId ${articleId} fileName ${fileName} fileSize ${fileSize}`);
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigArticle - queueFileUpload - queueMessage '+JSON.stringify(queueMessage));
      this.queueService.now(jobName, queueMessage);
    }

  }
}
module.exports = new Services.FigshareService().exports();