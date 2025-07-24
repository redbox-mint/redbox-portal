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

import {
  Services as services,
  DatastreamService,
  RBValidationError,
  QueueService,
  BrandingModel,
  FigshareArticleCreate,
  FigshareArticleUpdate,
  FigshareArticleEmbargo,
  ListAPIResponse
} from '@researchdatabox/redbox-core-types';
import { Sails } from "sails";
const moment = require('moment');
const axios = require('axios');
const _ = require('lodash');
const fs = require('fs');
const checkDiskSpace = require('check-disk-space').default;

declare let sails: Sails;
declare let TranslationService;
declare let BrandingService;
declare let RecordsService;
declare let NamedQueryService;
declare let RecordTypesService;
declare let WorkflowStepsService;
declare let UsersService;

export module Services {

  export class FigshareService extends services.Core.Service {

    private datastreamService: DatastreamService;
    private queueService: QueueService;

    private figArticleIdPathInRecord = '';
    private figArticleURLPathInRecordList = '';
    private dataLocationsPathInRecord = '';
    private recordAuthorExternalName = '';
    private recordAuthorUniqueBy = '';

    //Figshare response
    private entityIdFAR = '';
    private locationFAR = '';

    //Figshare article
    private curationStatusFA = '';
    private curationStatusTargetValueFA = 'public';
    private disableUpdateByCurationStatusFA = false;
    private figNeedsPublishAfterFileUpload = false;

    private figshareItemGroupId;
    private figshareItemType;
    private figLicenceIDs: any;
    private forCodesMapping: any;

    protected _exportedMethods: any = [
      'createUpdateFigshareArticle',
      'uploadFilesToFigshareArticle',
      'deleteFilesFromRedbox',
      'deleteFilesFromRedboxTrigger',
      'publishAfterUploadFilesJob',
      'queueDeleteFiles',
      'queuePublishAfterUploadFiles',
      'transitionRecordWorkflowFromFigshareArticlePropertiesJob',
    ];

    private createUpdateFigshareArticleLogLevel = 'verbose';
    private figshareAccountAuthorIDs;
    private extraVerboseLogging = false;

    private figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob: {
      enabled: true,
      namedQuery?: string,
      targetStep?: string,
      paramMap?: Record<string, unknown>,
      figshareTargetFieldKey?: string,
      figshareTargetFieldValue?: string,
      username?: string,
      userType?: string,
    } ;

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
        sails.log.verbose(`FigshareTrigger ready, using datastream service: ${datastreamServiceName}`);
        if (datastreamServiceName != undefined) {
          that.datastreamService = sails.services[datastreamServiceName];
        }
        sails.log.verbose(`FigshareTrigger ready, using queue service: ${queueServiceName}`);
        if (queueServiceName != undefined) {
          that.queueService = sails.services[queueServiceName];
        }
      });
      sails.on('lifted', function() {
        if(that.isFigshareAPIEnabled()) {
          sails.log.verbose('FigService - constructor start');
          that.getFigPrivateLicenses()
            .then(function (response) {
              sails.log.verbose('FigService - SUCCESSFULY LOADED LICENSES');
              that.figLicenceIDs = response;
            })
            .catch(function (error) {
              sails.log.error('FigService - ERROR LOADING LICENSES');
              sails.log.error(error);
            });
  
          that.forCodesMapping = sails.config.figshareReDBoxFORMapping.FORMapping;
          that.figshareItemGroupId = sails.config.figshareAPI.mapping.figshareItemGroupId;
          that.figshareItemType = sails.config.figshareAPI.mapping.figshareItemType;
          that.figArticleIdPathInRecord = sails.config.figshareAPI.mapping.recordFigArticleId;
          that.figArticleURLPathInRecordList = sails.config.figshareAPI.mapping.recordFigArticleURL;
          that.dataLocationsPathInRecord = sails.config.figshareAPI.mapping.recordDataLocations;
          that.entityIdFAR = sails.config.figshareAPI.mapping.response.entityId;
          that.locationFAR = sails.config.figshareAPI.mapping.response.location;
          that.curationStatusFA = sails.config.figshareAPI.mapping.figshareCurationStatus;
          that.curationStatusTargetValueFA = sails.config.figshareAPI.mapping.figshareCurationStatusTargetValue;
          that.disableUpdateByCurationStatusFA = sails.config.figshareAPI.mapping.figshareDisableUpdateByCurationStatus;
          that.figNeedsPublishAfterFileUpload = sails.config.figshareAPI.mapping.figshareNeedsPublishAfterFileUpload;
          that.recordAuthorExternalName = sails.config.figshareAPI.mapping.recordAuthorExternalName;
          that.recordAuthorUniqueBy = sails.config.figshareAPI.mapping.recordAuthorUniqueBy;
          that.extraVerboseLogging = sails.config.figshareAPI.extraVerboseLogging;
          that.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob = sails.config.figshareAPI.mapping.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob ?? {};
          sails.log.verbose('FigService - constructor end');
        }
      });
    }

    private isFigshareAPIEnabled() {
      let enabled = false; 
      if(!_.isEmpty(sails.config.figshareAPI.APIToken) && !_.isEmpty(sails.config.figshareAPI.baseURL) && !_.isEmpty(sails.config.figshareAPI.frontEndURL)) {
        enabled = true;
      }
      return enabled;
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

    private getValueFromObject(field:any, pathOrTemplate:any) {
      let value:any;
      if(pathOrTemplate.indexOf('<%') != -1) {
        let context = {
          moment: moment,
          field: field,
          artifacts: sails.config.figshareAPI.mapping.artifacts
        }
        value = _.template(pathOrTemplate)(context);
        if(this.extraVerboseLogging) {
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- getValueFromObject ---- ${JSON.stringify(field)}`);
        }
      } else {
        value = _.get(field,pathOrTemplate);
      }
      return value;
    }

    private getValueFromRecord(record:any, pathOrTemplate:any) {
      let value:any;
      if(pathOrTemplate.indexOf('<%') != -1) {
        let context = {
          moment: moment,
          record: record,
          artifacts: sails.config.figshareAPI.mapping.artifacts
        }
        value = _.template(pathOrTemplate)(context);
        if(this.extraVerboseLogging) {
          if(_.isObject(value)) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- getValueFromRecord ---- ${JSON.stringify(value)}`);
          } else {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- getValueFromRecord ---- ${value}`);
          }
        }
      } else {
        value = _.get(record,pathOrTemplate);
      }
      return value;
    }

    private setFieldInRecord(record:any, article:any, field:any) {
      let value = '';
      let template = _.get(field,'template','');
      let runByNameOnly = _.get(field,'runByNameOnly',false);
      let unset = _.get(field,'unset',false);
      let unsetBeforeSet = _.get(field,'unsetBeforeSet',false);
      if(unset) {
        _.unset(record, field.figName);
      } else if (!runByNameOnly) {
        if(template.indexOf('<%') != -1) {
          let context = {
            record: record,
            article: article,
            moment: moment,
            field: field,
            artifacts: sails.config.figshareAPI.mapping.artifacts
          }
          value = _.template(template)(context);
          
          if(this.extraVerboseLogging) {
            if(_.isObject(value)) {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- setFieldInRecord ---- ${field.figName} ----  template ---- ${JSON.stringify(value)}`);
            } else {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- setFieldInRecord ---- ${field.figName} ----  template ---- ${value}`);
            }
          }
        } else {
          let orignalValue = _.get(record,field.rbName)
          
          if(this.extraVerboseLogging) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- setFieldInRecord ---- ${field.rbName} ----  orignalValue ---- ${orignalValue}`);
          }
          value = _.get(article,field.figName,orignalValue);
          
          if(this.extraVerboseLogging) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- setFieldInRecord ---- ${field.figName} ----  value ---- ${value}`);
          }
        }

        if(unsetBeforeSet) {
          _.unset(record, field.rbName);
        }
        
        if(this.extraVerboseLogging) {
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- setFieldInRecord ---- ${field.rbName} ----  value ---- ${value}`);
        }
        _.set(record,field.rbName, value);
      }
    }

    private setStandardFieldInRequestBody(record:any, requestBody:any, standardField:any) {
      let value = '';
      let template = _.get(standardField,'template','');
      let runByNameOnly = _.get(standardField,'runByNameOnly',false);
      let unset = _.get(standardField,'unset',false);
      let unsetBeforeSet = _.get(standardField,'unsetBeforeSet',false);
      if(unset) {
        _.unset(requestBody, standardField.figName);
      } else if (!runByNameOnly) {
        if(template.indexOf('<%') != -1) {
          let context = {
            record: record,
            moment: moment,
            field: standardField,
            artifacts: sails.config.figshareAPI.mapping.artifacts
          }
          value = _.template(template)(context);
          
          if(this.extraVerboseLogging) {
            if(_.isObject(value)) {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- standardField ---- ${standardField.figName} ----  template ---- ${JSON.stringify(value)}`);
            } else {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- standardField ---- ${standardField.figName} ----  template ---- ${value}`);
            }
          }
        } else {
          value = _.get(record,standardField.rbName,standardField.defaultValue);
        }
        if(unsetBeforeSet) {
          _.unset(requestBody, standardField.figName);
        }
        _.set(requestBody, standardField.figName, value);
      }
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
          
          if(this.extraVerboseLogging) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- ${keyName} ----  template ---- ${value}`);
          }
        } else {
          value = _.get(record,customField.rbName,customField.defaultValue);
        }
        _.set(customFieldsTemplate, keyName, value);
      }
    }

    private setFieldByNameInRequestBody(record:any, requestBody:any, config:any, fieldName:string, runtimeArtifacts:any={}) {
      let value = '';
      let field = _.find(config,{figName:fieldName});
      if(!_.isEmpty(field)) {
        let template = _.get(field,'template','');
        let unset = _.get(field,'unset',false);
        let unsetBeforeSet = _.get(field,'unsetBeforeSet',false);
        if(unset) {
          
          if(this.extraVerboseLogging) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- setFieldByNameInRequestBody ---- before unset ${field.figName} ---- ${JSON.stringify(requestBody)}`);
          }
          _.unset(requestBody, field.figName);
          
          if(this.extraVerboseLogging) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- setFieldByNameInRequestBody ---- after unset ${field.figName} ---- ${JSON.stringify(requestBody)}`);
          }
        } else if (template.indexOf('<%') != -1) {
          let context = {
            record: record,
            moment: moment,
            field: field,
            artifacts: sails.config.figshareAPI.mapping.artifacts,
            runtimeArtifacts: runtimeArtifacts
          }
          value = _.template(template)(context);
          
          if(this.extraVerboseLogging) {
            if(_.isObject(value)) {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- setFieldByNameInRequestBody ---- ${field.figName} ----  template ---- ${JSON.stringify(value)}`);
            } else {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- setFieldByNameInRequestBody ---- ${field.figName} ----  template ---- ${value}`);
            }
          }
        } else {
          value = _.get(record,field.rbName,field.defaultValue);
        }
        if(unsetBeforeSet) {
          _.unset(requestBody, field.figName);
        }
        _.set(requestBody, field.figName, value);
      }
    }
    
    //These method takes the list of contributors found in the ReDBox record and will try to match the
    //ReDBox Id to a Figshare Id. The Identifier(s) to be used are defined in figshareAPI config file
    private async getAuthorUserIDs(authors:any) {
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - getAuthorUserIDs enter');
      let authorList = [];
      let uniqueAuthors = authors;
      if(!_.isUndefined(this.recordAuthorUniqueBy) && !_.isEmpty(this.recordAuthorUniqueBy)) {
        uniqueAuthors = _.uniqBy(authors,this.recordAuthorUniqueBy);
      }
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - uniqueAuthors');
      sails.log[this.createUpdateFigshareArticleLogLevel](uniqueAuthors);
      let getAuthorTemplateRequests = sails.config.figshareAPI.mapping.templates.getAuthor;

      let uniqueAuthorsControlList = _.clone(uniqueAuthors);

      for(let author of uniqueAuthors) {
        sails.log[this.createUpdateFigshareArticleLogLevel](author);

        for(let requestBodyTemplate of getAuthorTemplateRequests) {
          let userId = this.getValueFromObject(author,requestBodyTemplate.template);
        
          if(!_.isUndefined(userId) && !_.isEmpty(userId)) {

            let requestBody = _.clone(requestBodyTemplate);
            _.unset(requestBody,'template');
            let keys = _.keys(requestBody);
            let searchBy = keys[0];

            //This code is added for the sole purpose of facilitating test/staging use case that some
            //intitutions have a different domain in their test environment compared to production and 
            //it's intended to be restrictive
            if(searchBy == 'email') {
              if(_.has(requestBody,'prefix') && _.isString(userId) && userId.indexOf('@') > 0) {
                let tmpEmailArray = _.split(userId,'@');
                if(tmpEmailArray.length == 2) {
                  let tmpEmail = tmpEmailArray[0] + '@' + _.get(requestBody,'prefix','') + tmpEmailArray[1];
                  userId = tmpEmail;
                }
                _.unset(requestBody,'prefix');
              } else if(_.has(requestBody,'override') && _.isString(userId) && userId.indexOf('@') > 0) {
                let tmpEmailArray = _.split(userId,'@');
                if(tmpEmailArray.length == 2) {
                  let tmpEmail = tmpEmailArray[0] + '@' + _.get(requestBody,'override','');
                  userId = tmpEmail;
                }
                _.unset(requestBody,'override');
              }
            }

            //Set request body with the userId value that matches the searchBy template in example:
            //
            // 1- Search by email:
            // {
            //   institution_user_id: user1234
            // }
            //
            // 2- Search by email:
            // {
            //   email: staging.user@institution.edu.au
            // }
            //
            // 3- Search by symplectic_user_id:
            // {
            //   symplectic_user_id: user1234
            // }
            //
            _.set(requestBody,searchBy,userId);

            let config = this.getAxiosConfig('post','/account/institution/accounts/search', requestBody);

            if(this.extraVerboseLogging) {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - getAuthorUserIDs - userId ${userId} - ${config.method} - ${config.url}`);
            }
            try {
                let response = await axios(config);
                let authorData = response.data;
                
                if(this.extraVerboseLogging) {
                  sails.log[this.createUpdateFigshareArticleLogLevel](authorData);
                }

                if(!_.isEmpty(authorData)) {
                  let figshareAccountUserID = {id: _.toNumber(authorData[0][sails.config.figshareAPI.mapping.figshareAuthorUserId])};
                  
                  if(this.extraVerboseLogging) {
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - getAuthorUserIDs - author `);
                    sails.log[this.createUpdateFigshareArticleLogLevel](figshareAccountUserID);
                  }
                  authorList.push(figshareAccountUserID);
                  _.remove(uniqueAuthorsControlList,author);
                  break;
                }
            } catch (error) {
                sails.log.error(error);
                sails.log.error(`FigService - getAuthorUserIDs - author error`);
                sails.log.error(author);
            }
          } 
        }
      }

      for(let externalAuthor of uniqueAuthorsControlList) {
        let otherContributor = {name: externalAuthor[this.recordAuthorExternalName]};
        if(!_.isUndefined(otherContributor)) {
          authorList.push(otherContributor);
        }
      }

      return authorList;
    }
    
    //This method allows for defining rules to gather a list of all relevant contributors from a ReDBox record
    //The rules can be configured in the artifacts method getContributorsFromRecord that uses a lodash template 
    //and these rules are meant to be project spefic and hence these are set in figshareAPI config file  
    private getContributorsFromRecord(record:any) {
      let authors = [];
      let template = sails.config.figshareAPI.mapping.artifacts.getContributorsFromRecord.template;
      if(!_.isUndefined(template) && template.indexOf('<%') != -1) {
        let context = {
          record: record
        }
        authors = _.template(template)(context);
        
        if(this.extraVerboseLogging) {
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- getContributorsFromRecord ----  template`);
        }
      }

      if(this.extraVerboseLogging) {
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - getContributorsFromRecord: ${JSON.stringify(authors)}`);
      }
      return authors;
    }

    //This method allows for defining rules to check if an ReDBox record is embargoed  
    private isRecordEmbargoed(request:any, filesOrURLsAttached:boolean) {
      let isEmbargoed = false;
      if(!_.isEmpty(sails.config.figshareAPI.mapping.standardFields.embargo)) {
        let template = sails.config.figshareAPI.mapping.artifacts.isRecordEmbargoed.template;
        if(!_.isUndefined(template) && template.indexOf('<%') != -1) {
          let context = {
            request: request,
            filesOrURLsAttached: filesOrURLsAttached
          }
          isEmbargoed = _.template(template)(context);
          
          if(this.extraVerboseLogging) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- isRecordEmbargoed ----  template`);
          }
        }
      }
      
      if(this.extraVerboseLogging) {
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - isRecordEmbargoed: ${isEmbargoed}`);
      }
      return isEmbargoed;
    }

    private async isClearEmbargoNeeded(request:any, articleId:string, articleDetails:any) {

      let isEmbargoCleared = false;
      if(_.isUndefined(articleDetails) || _.isEmpty(articleDetails)) {
        articleDetails = await this.getArticleDetails(articleId);
      }

      let isEmbargoSet = _.get(articleDetails,'is_embargoed',false);
      if(isEmbargoSet) {
        if(!_.isEmpty(sails.config.figshareAPI.mapping.standardFields.embargo)) {
          let template = sails.config.figshareAPI.mapping.artifacts.isRecordEmbargoCleared.template;
          if(!_.isUndefined(template) && template.indexOf('<%') != -1) {
            let context = {
              request: request
            }
            isEmbargoCleared = _.template(template)(context);
            
            if(this.extraVerboseLogging) {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- isRecordEmbargoCleared ----  template`);
            }
          }
        }
      }

      if(this.extraVerboseLogging) {
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - isRecordEmbargoCleared: ${isEmbargoCleared}`);
      }

      return isEmbargoCleared;
    }

    private async checkEmbargoDetailsChanged(requestEmbargoBody:any, articleId:string, articleDetails:any) {

      let embargoDetailsChanged = false;
      
      if(!_.isEmpty(sails.config.figshareAPI.mapping.standardFields.embargo)) {

        if(_.isUndefined(articleDetails) || _.isEmpty(articleDetails)) {
          articleDetails = await this.getArticleDetails(articleId);
        }

        if(sails.config.figshareAPI.mapping.figshareForceEmbargoUpdateAlways) {
          embargoDetailsChanged = true;
          return embargoDetailsChanged;
        }
        
        for(let standardField of sails.config.figshareAPI.mapping.standardFields.embargo) {
          let checkChangedBeforeUpdate = _.get(standardField,'checkChangedBeforeUpdate',false);
          if(checkChangedBeforeUpdate) {
            let requestFieldValue = _.get(requestEmbargoBody,standardField.figName,'')
            let articleFieldValue = _.get(articleDetails,standardField.figName,'');
            // if(this.extraVerboseLogging) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - ${standardField.figName}: redbox request value ${requestFieldValue} - figshare value ${articleFieldValue} `);
            // }
            if(requestFieldValue != articleFieldValue) {
              embargoDetailsChanged = true;
              break;
            }
          }
        }
      }

      return embargoDetailsChanged;
    }
  
    private findCategoryIDs(record:any) {
      let catIDs = [];
      if(!_.isUndefined(this.forCodesMapping) && !_.isEmpty(this.forCodesMapping)){
        let template = sails.config.figshareAPI.mapping.artifacts.getCategoryIDs.template;
        if(!_.isUndefined(template) && template.indexOf('<%') != -1) {
          let context = {
            record: record,
            forCodes: this.forCodesMapping
          }
          catIDs = _.template(template)(context);
          
          if(this.extraVerboseLogging) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- findCategoryIDs ----  template`);
          }
        }
        
        if(this.extraVerboseLogging) {
          sails.log[this.createUpdateFigshareArticleLogLevel](catIDs);
        }
      }
      return catIDs;
    }
    
    private async getFigPrivateLicenses() {
    
      let config = this.getAxiosConfig('get','/account/licenses', null); 

      if(this.extraVerboseLogging) {
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - getFigPrivateLicenses - ${config.method} - ${config.url}`);
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - getFigPrivateLicenses - config ${JSON.stringify(config)}`);
      }
      try {
          let response = await axios(config);
          return response.data;
      } catch (error) {
          if(!_.isEmpty(sails.config.figshareAPI.testLicenses)) {
            return sails.config.figshareAPI.testLicenses;
          } else {
            sails.log.error(error);
            return null;
          }
      }
    }

    private async getArticleDetails(articleId:string) {
       let articleDetailsConfig = this.getAxiosConfig('get', `/account/articles/${articleId}`, null);
       
       if(this.extraVerboseLogging) {
         sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - getArticleDetails checkStatusConfig ${articleDetailsConfig.method} - ${articleDetailsConfig.url}`);
       }
       let responseArticleDetails = await axios(articleDetailsConfig);

       if(this.extraVerboseLogging) {
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - getArticleDetails status: ${responseArticleDetails.status} statusText: ${responseArticleDetails.statusText}`);
       }

       let articleDetails = responseArticleDetails.data;
       return articleDetails;
    }

    private async isArticleApprovedAndPublished(articleId:string, articleDetails:any) {

      if(_.isUndefined(articleDetails) || _.isEmpty(articleDetails)) {
        articleDetails = await this.getArticleDetails(articleId);
      }

      if(_.has(articleDetails, this.curationStatusFA) && articleDetails[this.curationStatusFA] == this.curationStatusTargetValueFA) {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - isArticleApprovedAndPublished - true');
        return true;
      } else {
        return false;
      }
    }

    private async getArticleFileList(articleId) {
      let articleFileListConfig = this.getAxiosConfig('get', `/account/articles/${articleId}/files`, null);
      sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - getArticleFileList - ${articleFileListConfig.method} - ${articleFileListConfig.url}`);
      let responseArticleList = await axios(articleFileListConfig);
      sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - getArticleFileList - status: ${responseArticleList.status} statusText: ${responseArticleList.statusText}`);
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
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - isFileUploadInProgress - true');
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
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkArticleHasURLsOrFilesAttached - articleFileList before '+stringifyFileList);
      
      if(_.isUndefined(articleFileList) || _.isEmpty(articleFileList)) {
        articleFileList = await this.getArticleFileList(articleId);
      }
      if(!_.isUndefined(articleFileList)) {
        stringifyFileList = JSON.stringify(articleFileList);
      }
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkArticleHasURLsOrFilesAttached - articleFileList after '+stringifyFileList);
      
      let fileUploadInProgress = _.find(articleFileList, ['status', 'created']);
      let filesOrURLsAttached = _.find(articleFileList, ['status', 'available']);
      if(_.isUndefined(fileUploadInProgress) && !_.isUndefined(filesOrURLsAttached)) {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkArticleHasURLsOrFilesAttached - true');
        return true;
      } else {
        return false;
      }
    }

    private getArticleUpdateRequestBody(record:any, figshareAccountAuthorIDs:any, figCategoryIDs:any, figLicenceIDs:any) {
      //Custom_fields is a dict not an array 
      let customFields = _.clone(sails.config.figshareAPI.mapping.templates.customFields.update);
      //Encountered shared reference issues even when creating a new object hence _.cloneDeep is required
      let requestBodyUpdate = _.cloneDeep(new FigshareArticleUpdate(this.figshareItemGroupId,this.figshareItemType)); 

      //FindAuthor_Step3 - set list of contributors in request body to be sent to Fighare passed in as a runtime artifact
      this.setFieldByNameInRequestBody(record,requestBodyUpdate,sails.config.figshareAPI.mapping.standardFields.update,'authors',figshareAccountAuthorIDs);
      this.setFieldByNameInRequestBody(record,requestBodyUpdate,sails.config.figshareAPI.mapping.standardFields.update,'license',figLicenceIDs);
      this.setFieldByNameInRequestBody(record,requestBodyUpdate,sails.config.figshareAPI.mapping.standardFields.update,'categories',figCategoryIDs);
      this.setFieldByNameInRequestBody(record,requestBodyUpdate,sails.config.figshareAPI.mapping.standardFields.update,'impersonate',figshareAccountAuthorIDs);

      for(let standardField of sails.config.figshareAPI.mapping.standardFields.update) {
        this.setStandardFieldInRequestBody(record,requestBodyUpdate,standardField);
      }

      let customFieldsKeys = _.keys(customFields);
      for(let customFieldKey of customFieldsKeys) {
        this.setCustomFieldInRequestBody(record, customFields, customFieldKey, sails.config.figshareAPI.mapping.customFields.update);
      }

      _.set(requestBodyUpdate, sails.config.figshareAPI.mapping.customFields.path, customFields);

      return requestBodyUpdate;
    }

    private getArticleCreateRequestBody(record:any, figshareAccountAuthorIDs:any, figCategoryIDs: any, figLicenceIDs:any) {
      //Encountered shared reference issues even when creating a new object hence _.cloneDeep is required
      let requestBodyCreate = _.cloneDeep(new FigshareArticleCreate());
      //Open Access and Full Text URL custom fields have to be set on create because the figshare article 
      //cannot be Made non draft (publish) so reviewers can pick it up from the queue
      let customFields = _.clone(sails.config.figshareAPI.mapping.templates.customFields.create);
      let customFieldsKeys = _.keys(customFields);

      this.setFieldByNameInRequestBody(record,requestBodyCreate,sails.config.figshareAPI.mapping.standardFields.update,'categories',figCategoryIDs);
      this.setFieldByNameInRequestBody(record,requestBodyCreate,sails.config.figshareAPI.mapping.standardFields.create,'license',figLicenceIDs);
      this.setFieldByNameInRequestBody(record,requestBodyCreate,sails.config.figshareAPI.mapping.standardFields.create,'impersonate',figshareAccountAuthorIDs);
      
      for(let customFieldKey of customFieldsKeys) {
        this.setCustomFieldInRequestBody(record, customFields, customFieldKey, sails.config.figshareAPI.mapping.customFields.create);
      }

      for(let standardField of sails.config.figshareAPI.mapping.standardFields.create) {
        this.setStandardFieldInRequestBody(record,requestBodyCreate,standardField);
      }

      _.set(requestBodyCreate, sails.config.figshareAPI.mapping.customFields.path, customFields);
      return requestBodyCreate;
    }

    private getEmbargoRequestBody(record, figshareAccountAuthorIDs) {

      let requestEmbargoBody = {};
      if(!_.isEmpty(sails.config.figshareAPI.mapping.standardFields.embargo)) {

        //Encountered shared reference issues even when creating a new object hence _.cloneDeep is required
        requestEmbargoBody = _.cloneDeep(new FigshareArticleEmbargo(0, false,'','','','',[]));

        this.setFieldByNameInRequestBody(record,requestEmbargoBody,sails.config.figshareAPI.mapping.standardFields.embargo,'impersonate',figshareAccountAuthorIDs);
        
        for(let standardField of sails.config.figshareAPI.mapping.standardFields.embargo) {
          this.setStandardFieldInRequestBody(record,requestEmbargoBody,standardField);
        }
      }

      return requestEmbargoBody;
    }

    private getPublishRequestBody(figshareAccountAuthorIDs) {
      let requestBody = sails.config.figshareAPI.mapping.templates.impersonate;
      this.setFieldByNameInRequestBody({},requestBody,sails.config.figshareAPI.mapping.targetState.publish,'impersonate',figshareAccountAuthorIDs);
      return requestBody;
    }

    private async sendDataPublicationToFigshare(record) {
      try {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare - enter ');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
        let articleId; 

        if(_.has(record, this.figArticleIdPathInRecord) && !_.isUndefined(_.get(record,this.figArticleIdPathInRecord)) && 
           _.get(record,this.figArticleIdPathInRecord) > 0) {
          articleId = _.get(record,this.figArticleIdPathInRecord);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare - metadata.figshare_article_id '+articleId);
        } else {
          articleId = 0;
        }
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare - articleId '+articleId);
        //FindAuthor_Step1 - get list of contributors from record (Configurabe with lodash template)
        let contributorsDP = this.getContributorsFromRecord(record);
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare - contributorsDP ${JSON.stringify(contributorsDP)}`);
        if(!_.isEmpty(sails.config.figshareAPI.testUsers)) {
          this.figshareAccountAuthorIDs = sails.config.figshareAPI.testUsers;
        } else {
          //FindAuthor_Step2 - get list of contributors by matched Figshare IDs plus externals/unmatched added by name only (Configurabe with lodash template)
          this.figshareAccountAuthorIDs = await this.getAuthorUserIDs(contributorsDP);
        }
        let figCategoryIDs = [];
        if(!_.isEmpty(sails.config.figshareAPI.testCategories)) {
          figCategoryIDs = sails.config.figshareAPI.testCategories;
        } else {
          //FindCat_Step1 - to get the list of Figshare category IDs from a ReDBox record (Configurabe with lodash template)
          figCategoryIDs = this.findCategoryIDs(record);
        }
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare - figshareAccountAuthorIDs');
        sails.log[this.createUpdateFigshareArticleLogLevel](this.figshareAccountAuthorIDs);
        if(articleId == 0) {
          let requestBodyCreate = this.getArticleCreateRequestBody(record, this.figshareAccountAuthorIDs,figCategoryIDs,this.figLicenceIDs);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService before early validation - requestBodyCreate -------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService before early validation - requestBodyCreate '+JSON.stringify(requestBodyCreate));
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService before early validation - requestBodyCreate -------------------------');
          this.validateCreateRequestBody(requestBodyCreate);
          //Need to pre validate the update request body as well before creating the article because if the article gets
          //created and then a backend validation is thrown before update the DP record will not save the article ID given
          //this process is occurring in a pre save trigger 
          let dummyRequestBodyUpdate = this.getArticleUpdateRequestBody(record,this.figshareAccountAuthorIDs,figCategoryIDs,this.figLicenceIDs);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService before early validation - requestBodyUpdate -------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService before early validation - requestBodyUpdate '+JSON.stringify(dummyRequestBodyUpdate));
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService before early validation - requestBodyUpdate -------------------------');
          this.validateUpdateRequestBody(dummyRequestBodyUpdate);
          
          let dummyEmbargoRequestBody = this.getEmbargoRequestBody(record, this.figshareAccountAuthorIDs);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService before early validation - embargoRequestBody ------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService before early validation - embargoRequestBody '+JSON.stringify(dummyEmbargoRequestBody));
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService before early validation - embargoRequestBody ------------------------');
          this.validateEmbargoRequestBody(record, dummyEmbargoRequestBody);

          //config for create article
          let figshareArticleConfig = this.getAxiosConfig('post', '/account/articles', requestBodyCreate);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare ${figshareArticleConfig.method} - ${figshareArticleConfig.url}`);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare before create');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare before post -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare before post requestBodyCreate '+JSON.stringify(requestBodyCreate));
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare before post -------------------------------------------');

          //create article
          let responseCreate = { 
                                 status: '',
                                 statusText: '',
                                 data: { 
                                  location: '',
                                  entity_id: 0,
                                  warnings: ['']
                                 }
                                };
          try {
            responseCreate = await axios(figshareArticleConfig);
          } catch(createError) {
            if(sails.config.figshareAPI.testMode) {
              responseCreate = _.get(sails.config.figshareAPI,'testResponse',{});
            } else {
              throw createError;
            }
          }
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare status: ${responseCreate.status} statusText: ${responseCreate.statusText}`);

          //Note that lodash isEmpty will return true if the value is a number therefore had to be removed from the condition 
          if(_.has(responseCreate.data, this.entityIdFAR)) {

            articleId = responseCreate.data[this.entityIdFAR];

            if(!_.isUndefined(articleId) && articleId > 0) {

              _.set(record,this.figArticleIdPathInRecord,articleId+'');
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare responseCreate.data.location '+responseCreate.data.location);

              if(_.has(responseCreate.data, this.locationFAR) && !_.isEmpty(responseCreate.data.location)) {
                
                let articleLocationURL = responseCreate.data.location;
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare articleLocationURL response '+articleLocationURL);
                
                if(_.isArray(this.figArticleURLPathInRecordList) && !_.isEmpty(this.figArticleURLPathInRecordList)) {

                  let figArticleURLPathInRecordResponse = this.figArticleURLPathInRecordList[0] + '_response';
                  _.set(record,figArticleURLPathInRecordResponse,articleLocationURL);

                  for(let figArticleURLPathInRecord of this.figArticleURLPathInRecordList) {
                    _.set(record,figArticleURLPathInRecord,`${sails.config.figshareAPI.frontEndURL}/${articleId}`);
                  }
                }
                
                let requestEmbargoBody = this.getEmbargoRequestBody(record, this.figshareAccountAuthorIDs);

                let isEmbargoed = this.isRecordEmbargoed(requestEmbargoBody,false);
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare - first post create check isEmbargoed '+isEmbargoed);
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare - targetState '+JSON.stringify(sails.config.figshareAPI.mapping.targetState));
                
                if(_.isUndefined(sails.config.figshareAPI.mapping.targetState.draft) && !isEmbargoed) {
                  //https://docs.figshare.com/#private_article_publish
                  let requestBodyPublishAfterCreate = this.getPublishRequestBody(this.figshareAccountAuthorIDs);
                  let publishConfig = this.getAxiosConfig('post', `/account/articles/${articleId}/publish`, requestBodyPublishAfterCreate);
                  sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare ${publishConfig.method} - ${publishConfig.url}`);
                  
                  let responsePublish = {status: '', statusText: ''}
                  try {
                    responsePublish = await axios(publishConfig);

                  } catch(updateError) {
                    if(!sails.config.figshareAPI.testMode){
                      throw updateError;
                    }
                  }
                  sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare status: ${responsePublish.status} statusText: ${responsePublish.statusText}`);
                }
              }
            }
          }
        } 
        
        if(!_.isUndefined(articleId) && articleId > 0) {

          let articleDetails = await this.getArticleDetails(articleId);
          let articleApprovedPublished = await this.isArticleApprovedAndPublished(articleId, articleDetails);
          let articleFileList = await this.getArticleFileList(articleId);
          let fileUploadInProgress = await this.isFileUploadInProgress(articleId, articleFileList);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare - articleApprovedPublished ${articleApprovedPublished}`);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare - fileUploadInProgress ${fileUploadInProgress}`);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare - articleDetails ${JSON.stringify(articleDetails)}`);

          if(articleApprovedPublished && this.disableUpdateByCurationStatusFA) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare cannot be modified any further after it has been Approved & Published`);
          } else if(fileUploadInProgress) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare file uploads still in progress`);
            sails.log[this.createUpdateFigshareArticleLogLevel](fileUploadInProgress);
            let customError: RBValidationError = new RBValidationError(TranslationService.t('@backend-Upload-In-Progress-validationMessage'));
            throw customError;
          } else {
            //set request body for updating Figshare article
            let requestBodyUpdate = this.getArticleUpdateRequestBody(record,this.figshareAccountAuthorIDs,figCategoryIDs,this.figLicenceIDs);
            sails.log[this.createUpdateFigshareArticleLogLevel](requestBodyUpdate);
            this.validateUpdateRequestBody(requestBodyUpdate);
            
            //articleId is passed in then changed config to update (put) instead of create (post) config for update
            let figshareArticleConfig = this.getAxiosConfig('put', `/account/articles/${articleId}`, requestBodyUpdate); 
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare before update articleId '+articleId);
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - figLicenceIDs '+JSON.stringify(this.figLicenceIDs));
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - requestBodyUpdate '+JSON.stringify(requestBodyUpdate));
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare - ${figshareArticleConfig.method} - ${figshareArticleConfig.url}`);
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
            //update article without impersonate
            let responseUpdate = await axios(figshareArticleConfig);
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare status: ${responseUpdate.status} statusText: ${responseUpdate.statusText}`);
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare responseUpdate.data.location '+responseUpdate.data.location);
            
            if(_.has(responseUpdate.data, this.locationFAR) && !_.isEmpty(responseUpdate.data.location)) {

              let articleLocationURL = responseUpdate.data.location;
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - articleLocationURL response '+articleLocationURL);
              
              if(_.isArray(this.figArticleURLPathInRecordList) && !_.isEmpty(this.figArticleURLPathInRecordList)) {
                
                let figArticleURLPathInRecordResponse = this.figArticleURLPathInRecordList[0] + '_response';
                _.set(record,figArticleURLPathInRecordResponse,articleLocationURL);

                for(let figArticleURLPathInRecord of this.figArticleURLPathInRecordList) {
                  _.set(record,figArticleURLPathInRecord,`${sails.config.figshareAPI.frontEndURL}/${articleId}`);
                }
              }

              let filesOrURLsAttached = await this.checkArticleHasURLsOrFilesAttached(articleId, articleFileList);
              let requestEmbargoBody = this.getEmbargoRequestBody(record, this.figshareAccountAuthorIDs);
              let isEmbargoed = this.isRecordEmbargoed(requestEmbargoBody, filesOrURLsAttached);
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare - post update check isEmbargoed '+isEmbargoed);
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare - targetState '+JSON.stringify(sails.config.figshareAPI.mapping.targetState));
              
              if(_.isUndefined(sails.config.figshareAPI.mapping.targetState.draft) && !isEmbargoed) {
                let requestBodyPublishAfterUpdate = this.getPublishRequestBody(this.figshareAccountAuthorIDs);
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare before publish response location '+responseUpdate.data.location);
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare before publish requestBodyPublishAfterUpdate '+JSON.stringify(requestBodyPublishAfterUpdate));

                //https://docs.figshare.com/#private_article_publish
                let publishConfig = this.getAxiosConfig('post', `/account/articles/${articleId}/publish`, requestBodyPublishAfterUpdate);
                sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare - ${publishConfig.method} - ${publishConfig.url}`);
                let responsePublish = await axios(publishConfig);
                sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare - status: ${responsePublish.status} statusText: ${responsePublish.statusText}`);

                if(!_.isEmpty(sails.config.figshareAPI.mapping.response.article)) {
                  articleDetails = await this.getArticleDetails(articleId);
                  sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare - after publish articleDetails ${JSON.stringify(articleDetails)}`);
                  sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare - after publish mapping.response.article ${JSON.stringify(sails.config.figshareAPI.mapping.response.article)}`);
                  for(let field of sails.config.figshareAPI.mapping.response.article) {
                    this.setFieldInRecord(record,articleDetails,field);
                  }
                }
              }
            }
          }

          let requestEmbargoBody = this.getEmbargoRequestBody(record, this.figshareAccountAuthorIDs);
          let filesOrURLsAttached = await this.checkArticleHasURLsOrFilesAttached(articleId, articleFileList);
          let isEmbargoed = this.isRecordEmbargoed(requestEmbargoBody, filesOrURLsAttached);
          let isEmbargoCleared = await this.isClearEmbargoNeeded(requestEmbargoBody, articleId, articleDetails);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare - post update check 2 isEmbargoed '+isEmbargoed);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - sendDataPublicationToFigshare - post update check 2 isEmbargoCleared '+isEmbargoCleared);

          if(isEmbargoed) {

            let embargoDetailsChanged = await this.checkEmbargoDetailsChanged(requestEmbargoBody, articleId, articleDetails);
            if(embargoDetailsChanged) {
  
              //validate requestEmbargoBody
              this.validateEmbargoRequestBody(record, requestEmbargoBody);

              //Update full article embargo info because Figshare rules allow for full article embargo to be set regardless if there are files uploaded
              let embargoConfig = this.getAxiosConfig('put', `/account/articles/${articleId}/embargo`, requestEmbargoBody); 
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare - ${embargoConfig.method} - ${embargoConfig.url}`);
              
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - before embargo -------------------------------------------');
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - before embargo requestEmbargoBody '+JSON.stringify(requestEmbargoBody));
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - before embargo -------------------------------------------');
              
              let responseEmbargo = await axios(embargoConfig);
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare status: ${responseEmbargo.status} statusText: ${responseEmbargo.statusText}`);
            }
          } else if(isEmbargoCleared) {

            let embargoDeleteConfig = this.getAxiosConfig('delete', `/account/articles/${articleId}/embargo`, {}); 
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare - ${embargoDeleteConfig.method} - ${embargoDeleteConfig.url}`);

            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - before clear embargo -------------------------------------------');
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - before clear embargo requestEmbargoBody '+JSON.stringify(requestEmbargoBody));
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - before clear embargo -------------------------------------------');
            
            let responseEmbargoDelete = await axios(embargoDeleteConfig);
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - sendDataPublicationToFigshare status: ${responseEmbargoDelete.status} statusText: ${responseEmbargoDelete.statusText}`);
          }
        }
        
      } catch (error) {
          sails.log.error(error);
          if(!_.isEmpty(_.get(error,'response.data.message',''))) {
            let customError: RBValidationError = new RBValidationError(_.get(error,'response.data.message'));
            throw customError;
          }
          throw error;
      }

      return record;
    }

    private validateEmbargoRequestBody(record, requestBody) {
      let valid = '';
      if(!_.isEmpty(sails.config.figshareAPI.mapping.standardFields.embargo)) {
        for(let embargoField of sails.config.figshareAPI.mapping.standardFields.embargo) {
          valid = this.validateFieldInRequestBody(requestBody,embargoField,'',record);
          if(valid != '') {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - validateEmbargoRequestBody - requestBody  ${JSON.stringify(requestBody)}`);
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - validateEmbargoRequestBody ${embargoField} - validMessage ${valid}`);
            let customError: RBValidationError = new RBValidationError(valid);
            throw customError;
          }
        }
      }
    }

    private checkCreateFields(requestBody) {
      let valid = '';
      
      let impersonate = sails.config.figshareAPI.mapping.standardFields.create;
      if(!_.isEmpty(impersonate)) {
        for(let impersonateField of impersonate) {
          valid = this.validateFieldInRequestBody(requestBody,impersonateField);
          if(valid != '') {
            return valid;
          }
        }
      }

      for(let standardField of sails.config.figshareAPI.mapping.standardFields.create) {
        valid = this.validateFieldInRequestBody(requestBody,standardField);
        if(valid != '') {
          return valid;
        }
      }

      for(let customField of sails.config.figshareAPI.mapping.customFields.create) {
        valid = this.validateFieldInRequestBody(requestBody,customField,sails.config.figshareAPI.mapping.customFields.path);
        if(valid != '') {
          return valid;
        }
      }

      return valid;
    }

    private validateFieldInRequestBody(requestBody:any, field:any, customFieldPath:string ='', record:any={}) {
      let invalidValueForField = TranslationService.t('@backend-prefix-validationMessage'); //Invalid value for field:
      let maxLengthIs =  TranslationService.t('@backend-maxlength-validationMessage'); //maximum length is
      let minLengthIs =  TranslationService.t('@backend-minlength-validationMessage'); //minimum length is
      let idNotFound = TranslationService.t('@backend-idNotFound-validationMessage'); //Id Not Found in Figshare
      let valid = '';
      let passed = true;
      let context = {};
      let validations = _.get(field,'validations',{});
      
      if(this.extraVerboseLogging) {
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- requestBody ---- ${JSON.stringify(requestBody)}`);
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- field ---- ${JSON.stringify(field)} --- path ${customFieldPath}`);
      }
      if(!_.isEmpty(validations)) {
        for(let validation of validations) {
          let template = _.get(validation,'template');
          let minLength = _.get(validation,'minLength',0);
          let maxLength = _.get(validation,'maxLength',0);
          let addPrefix = _.get(validation,'addPrefix',true);
          let addSuffix = _.get(validation,'addSuffix',false);
          let overridePrefix = _.get(validation,'overridePrefix','');
          let overrideSuffix = _.get(validation,'overrideSuffix','');
          let regexValidation = _.get(validation,'regexValidation','');
          if(!_.isUndefined(template) && template.indexOf('<%') != -1) {
            if(_.isEmpty(context)) {
              if(!_.isEmpty(record)) {
                context = {
                  request: requestBody,
                  moment: moment,
                  field: field,
                  artifacts: sails.config.figshareAPI.mapping.artifacts,
                  record: record
                }
              } else {
                context = {
                  request: requestBody,
                  moment: moment,
                  field: field,
                  artifacts: sails.config.figshareAPI.mapping.artifacts
                }
              }
            }
            passed = _.template(template)(context);
            
            if(this.extraVerboseLogging) {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- field ---- ${field.figName} ----  template ---- ${passed}`);
            }
            if(!passed) {
              valid = TranslationService.t(_.get(validation,'message','Error on request to Figshare'));
            }
          } else if (maxLength > 0) {
            let val = _.get(requestBody,field.figName,'');
            if(customFieldPath != '') {
              val = _.get(requestBody,customFieldPath+'.'+field.figName,'');
            }
            if(val.length > maxLength) {
              passed = false;
            } else {
              passed = true;
            }
            
            if(this.extraVerboseLogging) {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- standardField ---- ${field.figName} ----  maxLength ---- ${passed}`);
            }
            if(!passed) {
              valid = TranslationService.t(_.get(validation,'message','Error on request to Figshare')) + ' ' + maxLengthIs + ' ' + maxLength;
            }
          } else if (minLength > 0) {
            let val = _.get(requestBody,field.figName,'');
            if(customFieldPath != '') {
              val = _.get(requestBody,customFieldPath+'.'+field.figName,'');
            }
            if(val.length <= minLength) {
              passed = false;
            } else {
              passed = true;
            }
            
            if(this.extraVerboseLogging) {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService ---- standardField ---- ${field.figName} ----  minLength ---- ${passed}`);
            }
            if(!passed) {
              valid = TranslationService.t(_.get(validation,'message','Error on request to Figshare')) + ' ' + minLengthIs + ' ' + minLength;
            }
          } else if(regexValidation != ''){
            let val = _.get(requestBody,field.figName,'');
            let caseSensitive = _.get(validation,'caseSensitive',true);
            let skipIfEmpty = _.get(validation,'skipIfEmpty',false);
            if(skipIfEmpty && _.trim(val) == '') {
              //do nothing
            } else {
              if(caseSensitive) {
                let re = new RegExp(regexValidation);
                if(!re.test(val)) {
                  valid = TranslationService.t(_.get(validation,'message','Error on request to Figshare'));
                }
              } else {
                let re = new RegExp(regexValidation,'i');
                if(!re.test(val)) {
                  valid = TranslationService.t(_.get(validation,'message','Error on request to Figshare'));
                }
              }
            }
          }
          if(valid != ''){
            if(addPrefix) {
              if(overridePrefix != '') {
                valid = TranslationService.t(overridePrefix) + ' ' + valid;
              } else {
                valid = invalidValueForField + ' ' +valid;
              }
            }
            if(addSuffix) {
              if(overrideSuffix != '') {
                valid = valid + ' ' + TranslationService.t(overrideSuffix);
              } else {
                valid = valid + ' ' + idNotFound;
              }
            }
          }
        }
      }
      return valid;
    }

    private validateCreateRequestBody(requestBody) {
      let valid = this.checkCreateFields(requestBody);
      sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - validateCreateArticleRequestBody - validMessage ${valid}`);
      if(valid != '') {
        let customError: RBValidationError = new RBValidationError(valid);
        throw customError;
      }
    }

    private checkRequestUpdateFields(requestBody) {
      let valid = '';

      for(let standardField of sails.config.figshareAPI.mapping.standardFields.update) {
        valid = this.validateFieldInRequestBody(requestBody,standardField);
        if(valid != '') {
          return valid;
        }
      }

      for(let customField of sails.config.figshareAPI.mapping.customFields.update) {
        valid = this.validateFieldInRequestBody(requestBody,customField,sails.config.figshareAPI.mapping.customFields.path);
        if(valid != '') {
          return valid;
        }
      }

      return valid;
    }

    private validateUpdateRequestBody(requestBody) {
      let valid = this.checkRequestUpdateFields(requestBody);
      sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - validateUpdateArticleRequestBody - validMessage ${valid}`);
      if(valid != '') {
        let customError: RBValidationError = new RBValidationError(valid);
        throw customError;
      }
    }

    private isFileAttachmentInDataLocations(dataLocations) {
      let foundAttachment = false;
      if(sails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles) {
        for(let attachmentFile of dataLocations) {
          if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment' && attachmentFile.selected == true) {
            foundAttachment = true;
            break;
          }
        }
      } else {
        for(let attachmentFile of dataLocations) {
          if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment') {
            foundAttachment = true;
            break;
          }
        }
      }
      return foundAttachment;
    }

    private countFileAttachmentsInDataLocations(dataLocations) {
      let count = 0;
      if(sails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles) {
        for(let attachmentFile of dataLocations) {
          if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment' && attachmentFile.selected == true) {
            count++;
          }
        }
      } else {
        for(let attachmentFile of dataLocations) {
          if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment') {
            count++;
          }
        }
      }
      return count;
    }

    private async checkUploadFilesPending(record, oid, user) {

      try {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - enter');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');

        let articleId;
        if(_.has(record,this.figArticleIdPathInRecord) && !_.isUndefined(_.get(record,this.figArticleIdPathInRecord)) && 
        _.get(record,this.figArticleIdPathInRecord) > 0) {
          articleId = _.get(record,this.figArticleIdPathInRecord);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - metadata.figshare_article_id '+articleId);
        } else {
          articleId = 0;
        }
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - articleId '+articleId);
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - oid '+oid);

        if(articleId > 0) {

          //Check article curation status and if approved cannot be updated
          let checkStatusConfig = this.getAxiosConfig('get', `/account/articles/${articleId}`, null);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - ${checkStatusConfig.method} - ${checkStatusConfig.url}`);
          let responseArticleDetails = await axios(checkStatusConfig);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - status: ${responseArticleDetails.status} statusText: ${responseArticleDetails.statusText}`);
          let articleDetails = responseArticleDetails.data;
          let articleApprovedPublished = await this.isArticleApprovedAndPublished(articleId, articleDetails);
          if(articleApprovedPublished && this.disableUpdateByCurationStatusFA) {
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - cannot be modified any further after it has been Approved & Published`);
          } else {

            //Try to upload files to article
            let that = this;
            let articleFileListConfig = this.getAxiosConfig('get', `/account/articles/${articleId}/files`, null);
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - ${articleFileListConfig.method} - ${articleFileListConfig.url}`);
            let responseArticleList = await axios(articleFileListConfig);
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - status: ${responseArticleList.status} statusText: ${responseArticleList.statusText}`);
            let articleFileList = responseArticleList.data;
            let filePath = sails.config.figshareAPI.attachmentsFigshareTempDir;
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - attachmentsFigshareTempDir '+filePath);

            if (!fs.existsSync(filePath)){
              fs.mkdirSync(filePath);
            }

            let dataLocations = _.get(record,this.dataLocationsPathInRecord);
            let dataLocationsAlreadyUploaded = _.filter(dataLocations,{ 'ignore': true });
            let foundFileAttachment = this.isFileAttachmentInDataLocations(dataLocations);
            let countFileAttachments = this.countFileAttachmentsInDataLocations(dataLocations);
            
            //Evaluate project specific rules that can override the need to upload files present in data locations list
            if(!_.isEmpty(sails.config.figshareAPI.mapping.upload.override)) {
              foundFileAttachment = this.getValueFromRecord(record,sails.config.figshareAPI.mapping.upload.override.template);
            }
            sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - foundAttachment '+foundFileAttachment);
            
            if(foundFileAttachment) {
              //Files in figshare article have to be status available. Status 'created' means that the file is still being uploaded to the article
              let fileUploadsInProgress = await this.isFileUploadInProgress(articleId, articleFileList);
              if(fileUploadsInProgress) {
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - file uploads still in progress');
              }

              let onlyUploadIfSelected = sails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles;

              for(let attachmentFile of dataLocations) {
                if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment') {
                  sails.log[this.createUpdateFigshareArticleLogLevel](attachmentFile);
                  let attachId = attachmentFile.fileId;
                  let fileName = attachmentFile.name;
                  let fileSize = attachmentFile.size;
                  //check if the file has been uploaded already or not to the figshare article 
                  responseArticleList = await axios(articleFileListConfig);
                  articleFileList = responseArticleList.data;
                  sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - article file list: '+JSON.stringify(articleFileList));
                  let filePendingToBeUploaded = _.find(articleFileList, ['name', fileName]);
                  let fileFullPath = filePath + '/' +fileName;
                  let thresholdAppliedFileSize = fileSize + sails.config.figshareAPI.diskSpaceThreshold;
                  if(_.isUndefined(filePendingToBeUploaded) && !fileUploadsInProgress && ((onlyUploadIfSelected && _.get(attachmentFile,'selected',false)) || !onlyUploadIfSelected)) {
                    //if file name not found on the articleFileList means it's not yet uploaded and an agenda queue job needs to be queued 
                    sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - attachmentsTempDir '+sails.config.figshareAPI.attachmentsTempDir);
                    let diskSpace = await checkDiskSpace(sails.config.figshareAPI.attachmentsTempDir);
                    sails.log[this.createUpdateFigshareArticleLogLevel](diskSpace);
                    sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - total file size '+fileSize);
                    sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - total free disk space '+diskSpace.free);
                    if(diskSpace.free > thresholdAppliedFileSize) {
                      sails.log[that.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - saving file to temp location in ${fileFullPath}`);
                      sails.log[that.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - start processing file upload ');
                      sails.log[that.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - fileSize '+fileSize);
                      //Refactor not to use agenda queue and processing only one file at a time per one data publication although concurrent file uploads can 
                      //happen with different data publication records and once a file upload process is finished it will do a recursive call to this method 
                      //checkUploadFilesPending to process to process the next file upload to Figshare
                      this.processFileUploadToFigshare(oid, attachId, articleId, record, fileName, fileSize, user);
                      break;
                    } else {
                      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - Not enough free space on disk');
                    }
                  }
                }
              }

              sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - fileUploadsInProgress '+fileUploadsInProgress);
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - articleFileList.length '+articleFileList.length);
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - countFileAttachments '+countFileAttachments);
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - figNeedsPublishAfterFileUpload '+this.figNeedsPublishAfterFileUpload);
              sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - recordAllFilesUploaded '+sails.config.figshareAPI.mapping.recordAllFilesUploaded);
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - articleFileList: ${JSON.stringify(articleFileList)}`);

              if(!fileUploadsInProgress && ((articleFileList.length == countFileAttachments && !onlyUploadIfSelected) || ((articleFileList.length - dataLocationsAlreadyUploaded.length) == countFileAttachments && articleFileList.length >= dataLocationsAlreadyUploaded.length && onlyUploadIfSelected))) {
                
                //Update file embargo info if required
                //Figshare rules allow for full article embargo to be set regardless if there are files uploaded however a file 
                //embargo can be set only after at least one file has been successfully uploaded however it's best to allow the
                //file upload process to run it's course and set file embargo after processing of file uploads
                let requestEmbargoBody = this.getEmbargoRequestBody(record, this.figshareAccountAuthorIDs);
                let filesOrURLsAttached = await this.checkArticleHasURLsOrFilesAttached(articleId, {});
                let isEmbargoed = this.isRecordEmbargoed(requestEmbargoBody, filesOrURLsAttached);
                let isEmbargoCleared = await this.isClearEmbargoNeeded(requestEmbargoBody, articleId, articleDetails);
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - final check isEmbargoed '+isEmbargoed);
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - final check isEmbargoCleared '+isEmbargoCleared);

                if(isEmbargoed) {
                  //validate requestEmbargoBody
                  this.validateEmbargoRequestBody(record, requestEmbargoBody);
                  
                  let embargoDetailsChanged = await this.checkEmbargoDetailsChanged(requestEmbargoBody, articleId, articleDetails);
                  if(embargoDetailsChanged) {
                    let embargoConfig = this.getAxiosConfig('put', `/account/articles/${articleId}/embargo`, requestEmbargoBody); 
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - embargo - ${embargoConfig.method} - ${embargoConfig.url}`);
                    let responseEmbargo = await axios(embargoConfig);
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - status: ${responseEmbargo.status} statusText: ${responseEmbargo.statusText}`);
                  }

                } else if(isEmbargoCleared) {
              
                  let embargoDeleteConfig = this.getAxiosConfig('delete', `/account/articles/${articleId}/embargo`, {}); 
                  sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - ${embargoDeleteConfig.method} - ${embargoDeleteConfig.url}`);
                  let responseEmbargoDelete = await axios(embargoDeleteConfig);
                  sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending status: ${responseEmbargoDelete.status} statusText: ${responseEmbargoDelete.statusText}`);
                }

                if(this.figNeedsPublishAfterFileUpload) {
                  this.queuePublishAfterUploadFiles(oid,articleId,user,record.metaMetadata.brandId);
                }
              }

            } else {
              let onlyUploadURLIfSelected = sails.config.figshareAPI.mapping.figshareOnlyPublishSelectedLocationURLs;
              for(let attachmentFile of dataLocations) {
                if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'url' && ((onlyUploadURLIfSelected && _.get(attachmentFile,'selected',false)) || !onlyUploadURLIfSelected) && !_.get(attachmentFile,'ignore',false)) {

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
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - ${configDelete.method} - ${configDelete.url}`);
                    let responseDelete = await axios(configDelete);
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - responseDelete status: ${responseDelete.status} statusText: ${responseDelete.statusText}`);
                    sails.log[this.createUpdateFigshareArticleLogLevel](responseDelete.data);
                  } 
            
                  let requestBody =  
                  {
                    link: attachmentFile.location
                  }
                  let config = this.getAxiosConfig('post',`/account/articles/${articleId}/files`,requestBody);
                  
                  sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - ${config.method} - ${config.url}`);
                  let response = await axios(config);
                  sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - response link only status: ${response.status} statusText: ${response.statusText}`);
                  sails.log[this.createUpdateFigshareArticleLogLevel](response.data);
                  sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
                  sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - response link only '+response.data.location);
                  sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
                  
                  //File embargo can be set only if there are file attachments and these have been successfully uploaded 
                  //therefore if the attachments are sigle URL link then only embargo type article can be set     
                  let requestEmbargoBody = this.getEmbargoRequestBody(record, this.figshareAccountAuthorIDs);
                  let isEmbargoed = this.isRecordEmbargoed(requestEmbargoBody, false);
                  let isEmbargoCleared = await this.isClearEmbargoNeeded(requestEmbargoBody, articleId, articleDetails);
                  sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - in progress check isEmbargoed '+isEmbargoed);
                  sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - checkUploadFilesPending - in progress check isEmbargoCleared '+isEmbargoCleared);
        
                  if((isEmbargoed) ) {
                    //validate requestEmbargoBody
                    this.validateEmbargoRequestBody(record, requestEmbargoBody);
                    
                    let embargoDetailsChanged = await this.checkEmbargoDetailsChanged(requestEmbargoBody, articleId, articleDetails);
                    if(embargoDetailsChanged) {
                      let embargoConfig = this.getAxiosConfig('put', `/account/articles/${articleId}/embargo`, requestEmbargoBody); 
                      sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending update embargo - ${embargoConfig.method} - ${embargoConfig.url}`);
                      let responseEmbargo = await axios(embargoConfig);
                      sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - status: ${responseEmbargo.status} statusText: ${responseEmbargo.statusText}`);
                    }
                  } else if(isEmbargoCleared) {
                    let embargoDeleteConfig = this.getAxiosConfig('delete', `/account/articles/${articleId}/embargo`, {}); 
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending clear embargo - ${embargoDeleteConfig.method} - ${embargoDeleteConfig.url}`);
                    let responseEmbargoDelete = await axios(embargoDeleteConfig);
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending status: ${responseEmbargoDelete.status} statusText: ${responseEmbargoDelete.statusText}`);
                  }

                  if(this.figNeedsPublishAfterFileUpload) {
                    //https://docs.figshare.com/#private_article_publish
                    let requestBodyPublishAfterFileUploads = this.getPublishRequestBody(this.figshareAccountAuthorIDs);
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - publish checkUploadFilesPending requestBodyPublishAfterFileUploads ${JSON.stringify(requestBodyPublishAfterFileUploads)}`);
                    let publishConfig = this.getAxiosConfig('post', `/account/articles/${articleId}/publish`, requestBodyPublishAfterFileUploads);
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - publish checkUploadFilesPending ${publishConfig.method} - ${publishConfig.url}`);
                    let responsePublish = {status: '', statusText: ''}
                    
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - linkOnlyFileFound publish checkUploadFilesPending status: ${responsePublish.status} statusText: ${responsePublish.statusText}`);
                    responsePublish = await axios(publishConfig);
                    sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - publish checkUploadFilesPending status: ${responsePublish.status} statusText: ${responsePublish.statusText}`);
                  
                    if(!_.isEmpty(sails.config.figshareAPI.mapping.response.article)) {
                      //articleDetails needs to be retrieved after publish to update handle and doi and other fields that may have been empty
                      articleDetails = await this.getArticleDetails(articleId);
                      if(this.extraVerboseLogging) {
                        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - after publish articleDetails ${JSON.stringify(articleDetails)}`);
                      }
                      sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending - after publish mapping.response.article ${JSON.stringify(sails.config.figshareAPI.mapping.response.article)}`);
                      for(let field of sails.config.figshareAPI.mapping.response.article) {
                        this.setFieldInRecord(record,articleDetails,field);
                      }
                      if(this.extraVerboseLogging) {
                        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending record before ${JSON.stringify(record)}`);
                      }
                      const brand:BrandingModel = BrandingService.getBrandById(record.metaMetadata.brandId);
                      sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - checkUploadFilesPending oid: ${oid} user: ${JSON.stringify(user)}`);
                      if(!_.isUndefined(sails.config.figshareAPI.mapping.recordAllFilesUploaded) && !_.isEmpty(sails.config.figshareAPI.mapping.recordAllFilesUploaded)){
                        _.set(record,sails.config.figshareAPI.mapping.recordAllFilesUploaded,'yes');
                      }
                      let result = await RecordsService.updateMeta(brand, oid, record, user, false, false);
                    }
                  }
                    
                  break;
                }
              }
            }
          }
        }

      } catch (error) {
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - publish checkUploadFilesPending error: ${JSON.stringify(error)}`);
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

    private async processFileUploadToFigshare(oid, attachId, articleId, record, fileName, fileSize, user) {

      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFileUploadToFigshare - enter');
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFileUploadToFigshare - oid '+oid);
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFileUploadToFigshare - attachId '+attachId);
      sails.log[this.createUpdateFigshareArticleLogLevel](attachId);
      let filePath = sails.config.figshareAPI.attachmentsFigshareTempDir;
      let fileFullPath = filePath+'/'+fileName;

      sails.log[this.createUpdateFigshareArticleLogLevel](record);
      let dataLocations = _.get(record,this.dataLocationsPathInRecord);
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
          sails.log.error('FigService - processFileUploadToFigshare '+JSON.stringify(err));
        }

        let fileStats =  fs.statSync(fileFullPath);
        let aproxFileSize = this.formatBytes(fileStats.size);
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFileUploadToFigshare - fileFullPath '+fileFullPath + ' aproxFileSize '+ aproxFileSize);

        if(fs.existsSync(fileFullPath) && fileStats.size > 0) {
          
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFileUploadToFigshare - file saved to '+fileFullPath);
          let uploadURL;
          let fileId;
          let uploadParts = [];

          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFileUploadToFigshare - articleId '+articleId);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFileUploadToFigshare - fileName '+fileName);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFileUploadToFigshare - filePath '+filePath);
          
          let requestStep1 =  
          {
            impersonate: 0,
            name: fileName,
            size: fileSize
          }
          this.setFieldByNameInRequestBody(record,requestStep1,sails.config.figshareAPI.mapping.upload.attachments,'impersonate',this.figshareAccountAuthorIDs);
          
          let configStep1 = this.getAxiosConfig('post',`/account/articles/${articleId}/files`,requestStep1);
          
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - processFileUploadToFigshare - ${configStep1.method} - ${configStep1.url}`);
          let responseStep1 = await axios(configStep1);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - processFileUploadToFigshare- response step 1 status: ${responseStep1.status} statusText: ${responseStep1.statusText}`);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFileUploadToFigshare - response step 1 '+responseStep1.data.location);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
      
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
      
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - processFileUploadToFigshare - ${configStep2.method} - ${configStep2.url}`);
          let responseStep2 = await axios(configStep2);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - processFileUploadToFigshare - response step 2 status: ${responseStep2.status} statusText: ${responseStep2.statusText}`);
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
      
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFileUploadToFigshare - response step 2 - id '+fileId+' - url '+uploadURL);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
      
          let configStep3 = {
              method: 'get',
              url: uploadURL,
              headers: figHeaders
          };
      
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - processFileUploadToFigshare - ${configStep3.method} - ${configStep3.url}`);
          let responseStep3 = await axios(configStep3);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - processFileUploadToFigshare - response step 3 status: ${responseStep3.status} statusText: ${responseStep3.statusText}`);
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
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFileUploadToFigshare - uploadParts.length '+totalParts);
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
                
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFileUploadToFigshare - createReadStream end - totalParts '+totalParts+' partNo '+partNo+' fileName '+fileName);
                let paramsImpersonate: {
                  impersonate: 0
                }
                this.setFieldByNameInRequestBody(record,paramsImpersonate,sails.config.figshareAPI.mapping.upload.attachments,'impersonate',this.figshareAccountAuthorIDs);
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
                sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - processFilePartUploadToFigshare - ${configStep4.method} - ${configStep4.url}`);
                //this is when the read stream or file or bufferChunk is open and read therefore this is the only await that is required 
                let responseStep4 = await axios(configStep4);
                sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - processFilePartUploadToFigshare - response step 4 status: ${responseStep4.status} statusText: ${responseStep4.statusText}`);
                sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - processFilePartUploadToFigshare - uploaded file chunk totalParts '+totalParts+' partNo '+partNo+' fileName '+fileName);
              }

              //complete upload step 5
              let requestBodyComplete = { impersonate: 0 };
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - processFilePartUploadToFigshare - before complete file upload`);
              this.setFieldByNameInRequestBody(record,requestBodyComplete,sails.config.figshareAPI.mapping.upload.attachments,'impersonate',this.figshareAccountAuthorIDs);
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - processFilePartUploadToFigshare requestBodyComplete - ${JSON.stringify(requestBodyComplete)}`);
              let configStep5 = this.getAxiosConfig('post', `/account/articles/${articleId}/files/${fileId}`, requestBodyComplete);
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - processFilePartUploadToFigshare - ${configStep5.method} - ${configStep5.url}`);
              let responseStep5 = await axios(configStep5);
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - processFilePartUploadToFigshare - response step 5 status: ${responseStep5.status} statusText: ${responseStep5.statusText}`);
              sails.log.info(`FigService - processFilePartUploadToFigshare - file upload completed articleId ${articleId} totalParts ${totalParts} fileName ${fileName}`);

              //Delete the file from the temp directory
              fs.unlinkSync(fileFullPath);
            } 
          }
        } else {
          sails.log.info(`FigService - processFileUploadToFigshare - filePath ${fileFullPath} not found articleId ${articleId}`);
        }
      
      } catch (error) {
          sails.log.error(error);
          if (fs.existsSync(fileFullPath)){
            fs.unlinkSync(fileFullPath);
          }
      }

      //After successful or failure of uploading a file still check if there are other files pending to be uploaded to figshare
      this.checkUploadFilesPending(record, oid, user);

      return record;
    }

    private async deleteFilesAndUpdateDataLocationEntries(record, oid) {

      try {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - deleteFilesAndUpdateDataLocationEntries - enter');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - -------------------------------------------');

        let articleId;
        if(_.has(record,this.figArticleIdPathInRecord) && !_.isUndefined(_.get(record,this.figArticleIdPathInRecord)) && 
           _.get(record,this.figArticleIdPathInRecord) > 0) {
          articleId = _.get(record,this.figArticleIdPathInRecord);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - deleteFilesAndUpdateDataLocationEntries - metadata.figshare_article_id '+articleId);
        } else {
          articleId = 0;
        }
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - deleteFilesAndUpdateDataLocationEntries - articleId '+articleId);
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - deleteFilesAndUpdateDataLocationEntries - oid '+oid);

        if(articleId > 0) {

          let articleFileListConfig = this.getAxiosConfig('get', `/account/articles/${articleId}/files`, null);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - deleteFilesAndUpdateDataLocationEntries - ${articleFileListConfig.method} - ${articleFileListConfig.url}`);
          let responseArticleList = await axios(articleFileListConfig);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - deleteFilesAndUpdateDataLocationEntries - status: ${responseArticleList.status} statusText: ${responseArticleList.statusText}`);
          let articleFileList = responseArticleList.data;

          let dataLocations = _.get(record,this.dataLocationsPathInRecord);
          let urlList = [];

          //delete files from redbox
          for(let attachmentFile of dataLocations) {
            if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && _.has(attachmentFile, 'fileId')) {
              let figFileDetails = _.find(articleFileList, ['name', attachmentFile['name']]);
              if(!_.isUndefined(figFileDetails)) {
                urlList.push(figFileDetails);
                sails.log[this.createUpdateFigshareArticleLogLevel](attachmentFile);
                await this.datastreamService.removeDatastream(oid, attachmentFile); 
              }
            }
          }

          if(!_.isEmpty(urlList)) {
            //update entries in data location widget to point to the Figshare URL
            for(let fileUrl of urlList) {
              sails.log[this.createUpdateFigshareArticleLogLevel](fileUrl);
              let fileName = fileUrl['name'];
              let fileNameNotes = 'File name: '+ fileName;
              let newUrl = {type: 'url', location: fileUrl['download_url'], notes: fileNameNotes, originalFileName: fileName, ignore: true };
              if(sails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles) {
                _.set(newUrl,'selected',true);
              }
              sails.log[this.createUpdateFigshareArticleLogLevel](newUrl);
              //remove existing entry to the file attachment
              let locationList = _.get(record,this.dataLocationsPathInRecord);
              let locationListRemoved = _.remove(locationList, ['name', fileName]);
              //add new entry as URL to the same file already uploaded to Figshare
              locationList.push(newUrl);
              _.set(record,this.dataLocationsPathInRecord,locationList);
            } 
          }

        }
      } catch (error) {
        sails.log.error(error);
      }

      return record;
    }

    private async isArticleInExpectedState(articleId: string, figshareTargetFieldKey: string, figshareTargetFieldValue: string){
      const prefix = "FigService -"
      if (!articleId?.toString()?.trim()) {
        sails.log.error(`${prefix} the article id '${articleId}' is not valid`);
        return false;
      }

      // Exclude figshare items that have in progress uploads.
      const articleFileList = await this.getArticleFileList(articleId);
      const figshareIsUploadInProgressResult = await this.isFileUploadInProgress(articleId, articleFileList);
      if (figshareIsUploadInProgressResult) {
        sails.log.warn(`${prefix} the article id '${articleId}' has an upload in progress`);
        return false;
      }

      // Check if the figshare item has expected property key and value.
      const articleDetails = await this.getArticleDetails(articleId);
      const figshareFieldValue = _.get(articleDetails, figshareTargetFieldKey, null);
      const figshareFieldValueMatches = figshareFieldValue !== null && figshareFieldValue === figshareTargetFieldValue;
      if (!figshareFieldValueMatches) {
        sails.log.warn(`${prefix} the article id '${articleId}' item property '${figshareTargetFieldKey}' value '${JSON.stringify(figshareFieldValue)}' is not '${JSON.stringify(figshareTargetFieldValue)}'`);
        return false;
      }

      sails.log.debug(`${prefix} the article id '${articleId}' item property '${figshareTargetFieldKey}' value '${JSON.stringify(figshareFieldValue)}' matches expected value '${JSON.stringify(figshareTargetFieldValue)}'`);
      return true;
    }

    private async transitionRecordWorkflowFromFigshareArticleProperties(brand, user, oid: string, articleId: string, targetStep: string, figshareTargetFieldKey: string, figshareTargetFieldValue: string) {
      const prefix = "FigService -"
      const msgPartial = `record oid '${oid}' with figshare article id '${articleId}' to step '${targetStep}'`;

      if (!oid) {
        sails.log.error(`${prefix} cannot transition ${msgPartial} because the record oid is not valid`);
        return;
      }

      const isArticleInExpectedState = await this.isArticleInExpectedState(articleId, figshareTargetFieldKey, figshareTargetFieldValue);
      if (!isArticleInExpectedState){
        sails.log.warn(`${prefix} cannot transition ${msgPartial} because the linked article is not in the required state`);
        return;
      }

      // --> If there are any ReDBox records in stage queued that the corresponding Figshare item
      // status is public then move the dataPublication record to stage 'targetStep'
      // The automated processing of ReDBox dataPublication records should be equivalent to the
      // action performed by the user.
      // The process to replicate is when a user manually opens a data publication in stage queued,
      // and then they click Submit for publication button.
      const currentRec = await RecordsService.getMeta(oid);
      const hasEditAccess = await RecordsService.hasEditAccess(brand, user, user.roles, currentRec)
      if (!hasEditAccess) {
        sails.log.warn(`${prefix} cannot transition ${msgPartial} because user '${user}' does not have edit permission`);
        return;
      }
      const recordType = await RecordTypesService.get(brand, currentRec.metaMetadata.type).toPromise();
      const nextStepResp = await WorkflowStepsService.get(recordType, targetStep).toPromise();
      const metadata = currentRec.metadata;
      const recordUpdateResult = await RecordsService.updateMeta(brand, oid, currentRec, user, true, true, nextStepResp, metadata);
      const isSuccessful = _.get(recordUpdateResult, 'success', true)?.toString() === 'true';
      if (isSuccessful) {
        sails.log.info(`${prefix} updated ${msgPartial}`);
      } else {
        sails.log.error(`${prefix} failed to update ${msgPartial}: ${JSON.stringify(recordUpdateResult)}`);
      }
    }

    //This method has been designed to be called by a pre save trigger that executes after a user has performed an action
    //In example when a record is moved from one workflow state to another and the trigger conditons are met
    public createUpdateFigshareArticle(oid, record, options, user) {

      if(sails.config.record.createUpdateFigshareArticleLogLevel != null) {
        this.createUpdateFigshareArticleLogLevel = sails.config.record.createUpdateFigshareArticleLogLevel;
        sails.log.info(`FigService - createUpdateFigshareArticle - log level ${sails.config.record.createUpdateFigshareArticleLogLevel}`);
      } else {
        sails.log.info(`FigService - createUpdateFigshareArticle - log level ${this.createUpdateFigshareArticleLogLevel}`);
      }

      if (this.metTriggerCondition(oid, record, options,user) === 'true') {
        return this.sendDataPublicationToFigshare(record);
      } else {
        return record;
      }
    }

    //This method has been designed to be called by a post save trigger that executes after a user has performed an action
    //In example when a record is moved from one workflow state to another and the trigger conditons are met
    public uploadFilesToFigshareArticle(oid, record, options, user) {
      
      if(sails.config.record.createUpdateFigshareArticleLogLevel != null) {
        this.createUpdateFigshareArticleLogLevel = sails.config.record.createUpdateFigshareArticleLogLevel;
        sails.log.info(`FigService - uploadFilesToFigshareArticle - log level ${sails.config.record.createUpdateFigshareArticleLogLevel}`);
      } else {
        sails.log.info(`FigService - uploadFilesToFigshareArticle - log level ${this.createUpdateFigshareArticleLogLevel}`);
      }
      
      if (this.metTriggerCondition(oid, record, options,user) === 'true') {
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - uploadFilesToFigshareArticle - enter');
        sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - uploadFilesToFigshareArticle - oid '+oid);
        this.checkUploadFilesPending(record, oid, user);
      }
    }

    //This method has been designed to be called by a pre save trigger that executes after a user has performed an action
    //In example when a record is moved from one workflow state to another and the trigger conditons are met
    public deleteFilesFromRedboxTrigger(oid, record, options, user) {

      if(sails.config.record.createUpdateFigshareArticleLogLevel != null) {
        this.createUpdateFigshareArticleLogLevel = sails.config.record.createUpdateFigshareArticleLogLevel;
        sails.log.info(`FigService - deleteFilesFromRedboxTrigger - log level ${sails.config.record.createUpdateFigshareArticleLogLevel}`);
      } else {
        sails.log.info(`FigService - deleteFilesFromRedboxTrigger - log level ${this.createUpdateFigshareArticleLogLevel}`);
      }
    
      if (this.metTriggerCondition(oid, record, options,user) === 'true') {
        return this.deleteFilesAndUpdateDataLocationEntries(record, oid);
      } else {
        return record;
      }
    }

    //This method will be called automatically when the setting figshareNeedsPublishAfterFileUpload is set to true
    //and will be called by a scheduled agendaQueue job 
    public async publishAfterUploadFilesJob(job: any) {
      let data = job.attrs.data;
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - publishAfterUploadFilesJob - data '+JSON.stringify(data));
      if(!_.isUndefined(data) && !_.isNull(data) && !_.isEmpty(data)) {
        let oid = data.oid;
        let articleId = data.articleId;
        let user = data.user;
        let brandId = data.brandId;
        //https://docs.figshare.com/#private_article_publish
        let requestBodyPublishAfterFileUploads = this.getPublishRequestBody(this.figshareAccountAuthorIDs);
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - publish publishAfterUploadFilesJob requestBodyPublishAfterFileUploads ${JSON.stringify(requestBodyPublishAfterFileUploads)}`);
        let publishConfig = this.getAxiosConfig('post', `/account/articles/${articleId}/publish`, requestBodyPublishAfterFileUploads);
        sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - publish publishAfterUploadFiles ${publishConfig.method} - ${publishConfig.url}`);
        let responsePublish = {status: '', statusText: ''}
        try {
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - publishAfterUploadFiles - all file uploads finished starting publishing`);
          responsePublish = await axios(publishConfig);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - publish publishAfterUploadFiles status: ${responsePublish.status} statusText: ${responsePublish.statusText}`);
          this.queueDeleteFiles(oid,user,brandId,articleId);
        } catch(error) {
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - publish publishAfterUploadFiles error: ${responsePublish.status} statusText: ${responsePublish.statusText}`);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - publish publishAfterUploadFiles error: ${JSON.stringify(error)}`);
          sails.log[this.createUpdateFigshareArticleLogLevel](error);
        }
      }
    }

    //This method will be called automatically when the setting figshareNeedsPublishAfterFileUpload is set to true
    //and will be called by a scheduled agendaQueue job 
    public async deleteFilesFromRedbox(job: any) {
      let data = job.attrs.data;
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - deleteFilesFromRedbox - data '+JSON.stringify(data));
      if(!_.isUndefined(data) && !_.isNull(data) && !_.isEmpty(data)) {
        try {
          if(sails.config.record.createUpdateFigshareArticleLogLevel != null) {
            this.createUpdateFigshareArticleLogLevel = sails.config.record.createUpdateFigshareArticleLogLevel;
            sails.log.info(`FigService - deleteFilesFromRedbox - log level ${sails.config.record.createUpdateFigshareArticleLogLevel}`);
          } else {
            sails.log.info(`FigService - deleteFilesFromRedbox - log level ${this.createUpdateFigshareArticleLogLevel}`);
          }
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - deleteFilesFromRedbox record oid ${data.oid}`);
          let record = await RecordsService.getMeta(data.oid);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - deleteFilesFromRedbox record before ${JSON.stringify(record)}`);
          record = await this.deleteFilesAndUpdateDataLocationEntries(record, data.oid);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - deleteFilesFromRedbox record after ${JSON.stringify(record)}`);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - deleteFilesFromRedbox record brandId ${data.brandId}`);
          const brand:BrandingModel = BrandingService.getBrandById(data.brandId);
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - deleteFilesFromRedbox oid: ${data.oid} user: ${JSON.stringify(data.user)}`);
          if(!_.isUndefined(sails.config.figshareAPI.mapping.recordAllFilesUploaded) && !_.isEmpty(sails.config.figshareAPI.mapping.recordAllFilesUploaded)){
            _.set(record,sails.config.figshareAPI.mapping.recordAllFilesUploaded,'yes');
          }
          if(!_.isEmpty(sails.config.figshareAPI.mapping.response.article)) {
            //articleDetails needs to be retrieved after publish to update handle and doi and other fields that may have been empty
            let articleDetails = await this.getArticleDetails(data.articleId);
            if(this.extraVerboseLogging) {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - deleteFilesFromRedbox articleDetails ${JSON.stringify(articleDetails)}`);
            }
            sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - deleteFilesFromRedbox - mapping.response.article ${JSON.stringify(sails.config.figshareAPI.mapping.response.article)}`);
            for(let field of sails.config.figshareAPI.mapping.response.article) {
              this.setFieldInRecord(record,articleDetails,field);
            }
            if(this.extraVerboseLogging) {
              sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - deleteFilesFromRedbox record before ${JSON.stringify(record)}`);
            }
          }
          let result = await RecordsService.updateMeta(brand, data.oid, record, data.user, false, false);
          sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - deleteFilesFromRedbox - result '+JSON.stringify(result));
        } catch(error) {
          sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - deleteFilesFromRedbox error: ${JSON.stringify(error)}`);
          sails.log[this.createUpdateFigshareArticleLogLevel](error);
        }
      }
    }

    //This method will be called automatically when the setting figshareNeedsPublishAfterFileUpload is set to true
    //and will be scheduled after all the file uploads have been finished successfully for a particular article
    public queuePublishAfterUploadFiles(oid:string, articleId:string, user:any, brandId:string) {

      let jobName = 'Figshare-PublishAfterUpload-Service';
      let queueMessage = {
        oid: oid,
        articleId: articleId,
        user: user,
        brandId: brandId
      };
      
      sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - queuePublishAfterUploadFiles - Queueing up trigger using jobName ${jobName}`);
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - queuePublishAfterUploadFiles - queueMessage '+JSON.stringify(queueMessage));
      let scheduleIn = _.get(sails.config.figshareAPI.mapping.schedulePublishAfterUploadJob,'in 2 minutes');
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - queuePublishAfterUploadFiles - scheduleIn '+scheduleIn);
      if(scheduleIn == 'immediate') {
        this.queueService.now(jobName, queueMessage);
      } else {
        this.queueService.schedule(jobName, scheduleIn, queueMessage);
      }
    }

    //This method will be called automatically when the setting figshareNeedsPublishAfterFileUpload is set to true
    //and will be scheduled after the Figshare-PublishAfterUpload-Service job has finished
    public queueDeleteFiles(oid:string, user:any, brandId:string, articleId:string) {

      let jobName = 'Figshare-UploadedFilesCleanup-Service';
      let queueMessage = {
        oid: oid,
        user: user,
        brandId: brandId,
        articleId: articleId
      };
      
      sails.log[this.createUpdateFigshareArticleLogLevel](`FigService - queueDeleteFiles - Queueing up trigger using jobName ${jobName}`);
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - queueDeleteFiles - queueMessage '+JSON.stringify(queueMessage));
      let scheduleIn = _.get(sails.config.figshareAPI.mapping.scheduleUploadedFilesCleanupJob,'in 5 minutes');
      sails.log[this.createUpdateFigshareArticleLogLevel]('FigService - queueDeleteFiles - scheduleIn '+scheduleIn);
      if(scheduleIn == 'immediate') {
        this.queueService.now(jobName, queueMessage);
      } else {
        this.queueService.schedule(jobName, scheduleIn, queueMessage);
      }
    }

    public async transitionRecordWorkflowFromFigshareArticlePropertiesJob(job: any): Promise<void> {
      const prefix = "FigService -";

      try {
        // TODO: job.attrs.data doesn't seem to include brand or user. Is it supposed to?
        // const data = job.attrs.data;
        // TODO: the brand is hard-coded to 'default' - this should be obtained from somewhere
        const brand: BrandingModel = BrandingService.getBrand('default');

        const start = 0;
        const rows = 30;
        const maxRecords = 100;

        // configurable criteria
        const jobConfig = this.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob ?? {};
        const enabled = _.get(jobConfig, 'enabled', '')?.toString() === 'true';
        const queryName = _.get(jobConfig, 'queryName', '') ?? "";
        const targetStep = _.get(jobConfig, 'targetStep', '') ?? "";
        const paramMap = _.get(jobConfig, 'paramMap', {}) ?? {};
        const figshareTargetFieldKey = _.get(jobConfig, 'figshareTargetFieldKey', '') ?? "";
        const figshareTargetFieldValue = _.get(jobConfig, 'figshareTargetFieldValue', '') ?? "";
        const username = _.get(jobConfig, 'username', '') ?? "";
        const userType = _.get(jobConfig, 'userType', '') ?? "";

        // TODO: this works to obtain the user, but should the user come from the agendaqueue job.attrs.data.user instead?
        const user = await UsersService.getUserWithUsername(username).toPromise();

        if (!user || !user?.username || user?.type !== userType) {
          sails.log.error(`${prefix} cannot run job because could not find user with username '${username}' and type '${userType} user:`, user);
          return;
        }

        // --> Check whether this process is enabled.
        if (!enabled) {
          sails.log.info(`${prefix} transitionRecordWorkflowFromFigshareArticlePropertiesJob is disabled by config`);
          return;
        }

        // --> Find dataPublication records in stage queued in ReDBox database
        const namedQueryConfig = await NamedQueryService.getNamedQueryConfig(brand, queryName);
        const queryResults = await NamedQueryService.performNamedQueryFromConfigResults(namedQueryConfig, paramMap, brand, queryName, start, rows, maxRecords, user);

        for (const queryResult of queryResults) {
          const oid = _.get(queryResult, 'oid');
          const articleId = _.get(queryResult, this.figArticleIdPathInRecord);
          await this.transitionRecordWorkflowFromFigshareArticleProperties(brand, user, oid, articleId, targetStep, figshareTargetFieldKey, figshareTargetFieldValue);
        }
      } catch (err) {
        sails.log.error(`${prefix} error in transitionRecordWorkflowFromFigshareArticlePropertiesJob`, err);
      }
    }

  }
}
module.exports = new Services.FigshareService().exports();
