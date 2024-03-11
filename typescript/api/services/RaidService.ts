// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
  RBValidationError
} from '@researchdatabox/redbox-core-types';
import {
  Sails,
  Model
} from "sails";
import { RaidoStableV1Api, RaidCreateRequest, Title, ModelDate, Description, Access, AlternateUrl, Contributor, ContributorRoleCreditNisoOrgType, ContributorRoleSchemeType, Organisation } from '@researchdatabox/raido-openapi-generated-node';

import moment = require('moment');
import numeral from 'numeral';


declare var sails: Sails;
declare var RecordsService;
declare var TranslationService;
declare var AgendaQueueService;
declare var _;

export module Services {
  /**
   *  Uses `@researchdatabox/raido-openapi-generated-node` to interact with ARDC's RAID API.
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Raid extends services.Core.Service {
    protected _exportedMethods: any = [
      'mintTrigger',
      'buildContributors',
      'buildContribVal',
      'mintPostCreateRetryHandler',
      'mintRetryJob'
    ];    

    constructor() {
      super();
      this.logHeader = "RaidService::";
    }

    public async mintTrigger(oid, record, options): Promise<any> {
      if (this.metTriggerCondition(oid, record, options) === "true") {
        await this.mintRaid(oid, record, options);
      } else {
        sails.log.debug(`${this.logHeader} mintTrigger()-> RAiD URL already minted.`);
      }
      return record;
    }

    /** 
     * Light AgendaQueue wrapper for the main mint method. 
    */
    public async mintRetryJob(job:any) {
      const data = job.attrs.data;
      const record = await RecordsService.getMeta(data.oid);
      await this.mintRaid(data.oid, record, data.options, data.attemptCount);
    }
    /**
     * Light retry handler for preSave onCreate failures, when OID is still unknown.
     * 
     * @param oid 
     * @param record 
     * @param options 
     */
    public async mintPostCreateRetryHandler(oid, record, options) {
      const attemptCount = _.get(record.metaMetadata, 'raid.attemptCount');
      if (!_.isEmpty(oid) && attemptCount > 0) {
        sails.log.verbose(`${this.logHeader} mintPostCreateRetryHandler() -> Scheduled for ${oid} `);
        this.scheduleMintRetry({oid: oid, options: _.get(record.metaMetadata, 'raid.options'), attemptCount: attemptCount });
      }
    }

    private async mintRaid(oid, record, options, attemptCount:number = 0): Promise<any> {
      const basePath = sails.config.raid.basePath;
      const apiToken = sails.config.raid.token;      
      // Stable API: https://github.com/au-research/raido/blob/main/api-svc/idl-raid-v2/src/raido-stable-v1.yaml
      const api = new RaidoStableV1Api();
      api.basePath = basePath;
      api.accessToken = apiToken;
      const request = new RaidCreateRequest();
      try {
        let srcRecord = record;
        const srcRecField = _.get(options, 'request.sourceOidField');
        if (!_.isEmpty(srcRecField)) {
          let srcRecVal = null;
          const srcRecOid = _.get(record, srcRecField);
          if (!_.isEmpty(srcRecOid)) {
             srcRecVal = await RecordsService.getMeta(srcRecOid);
             if (!_.isEmpty(srcRecVal)) {
               srcRecord = srcRecVal;
               // process any overrides to the source record
               const recordOverrides = _.get(options, 'request.recordOverrides');
               if (!_.isEmpty(recordOverrides) && _.isArray(recordOverrides)) {
                 for (const recOverride of recordOverrides) {
                   _.set(srcRecord, recOverride.field, _.get(record, recOverride.value));
                 }
               }
             }
          }
          if (_.isEmpty(srcRecVal)) {
            sails.log.error(`${this.logHeader} mintRaid() -> Failed to retrieve the source record: ${srcRecOid}, using path: ${srcRecField}, please check your recordtype configuration.`);
            let errorMessage = TranslationService.t('raid-mint-transform-validation-error');
            throw new RBValidationError(errorMessage);
          }
        }
        let mintRequestFields = _.get(options, 'request.mint.fields');
        if (_.isString(mintRequestFields)) {
          // allows to DRYer config
          mintRequestFields = _.get(sails.config, mintRequestFields);
        }
        const mappedData = this.getMappedData(srcRecord, mintRequestFields, options);
        request.title = _.get(mappedData, 'title') as Title[];
        request.date = _.get(mappedData, 'date') as ModelDate;
        request.description = _.get(mappedData, 'description') as Description[];
        request.access = _.get(mappedData, 'access') as Access;
        request.alternateUrl = _.get(mappedData, 'alternateUrl') as AlternateUrl[];
        request.contributor = _.get(mappedData, 'contributor') as Contributor[];
        request.organisation = _.get(mappedData, 'organisation') as Organisation[];
        request.subject = _.get(mappedData, 'subject');
      } catch (error) {
        sails.log.error(error);
        let customError:RBValidationError = undefined;
        if (error.name == "RBValidationError") {
          customError = error;
        } else {
          let errorMessage = TranslationService.t('raid-mint-transform-validation-error');
          customError = new RBValidationError(errorMessage);
          sails.log.error(errorMessage);
        }
        throw customError;
      }
      let raid = undefined;
      let metaMetadataInfo = undefined;
      let response = undefined;
      let body = undefined;
      let apiResp = undefined
      try {
        sails.log.verbose(`${this.logHeader} mintRaid() ${oid} -> Sending data::`);
        sails.log.verbose(JSON.stringify(request));
        const apiResp = await api.createRaidV1(request);
        _.set(apiResp, 'request.headers.Authorization', '-redacted-');
        response = apiResp.response;
        body = apiResp.body;
        sails.log.verbose(JSON.stringify(response));
        sails.log.verbose(`${this.logHeader} mintRaid() ${oid} -> Body::`);
        sails.log.verbose(JSON.stringify(body));
        if (response.statusCode == 201) {
          raid = _.get(body, 'identifier');
          if (sails.config.raid.saveBodyInMeta) {
            metaMetadataInfo = body;
          }
        } else {
          sails.log.error(`${this.logHeader} mintRaid() ${oid} -> Failed to mint RAiD, statusCode: ${response?.statusCode}`);
          sails.log.error(JSON.stringify(response?.body));
          let errorMessage = TranslationService.t('raid-mint-server-error');
          // Note: if there's any 'notSet' validation errors, these will have to be hashed out during development, with the specific fields set to 'required' and not treat these as runtime errors
          let customError:RBValidationError = new RBValidationError(errorMessage);
          sails.log.error(errorMessage);
          throw customError;
        }
      } catch (error) {
        _.set(error, 'response.request.headers.Authorization', '-redacted-');
        if (_.get(error, 'statusCode') == 401 || _.get(error, 'statusCode') == 403 ) {
          sails.log.error(`${this.logHeader} mintRaid() ${oid} -> Authentication failed, check if the auth token is properly configured.`);
          let errorMessage = TranslationService.t('raid-mint-server-error');
          let customError:RBValidationError = new RBValidationError(errorMessage);
          throw customError;
        }
        // This is the generic handler for when the API call itself throws an exception
        sails.log.error(`${this.logHeader} mintRaid() ${oid} -> API error, Status Code: '${error.statusCode}'`);
        sails.log.error(`${this.logHeader} mintRaid() ${oid} -> Error: ${JSON.stringify(error)}`);
        // set response as the error so it can be saved in the retry block
        response = error;
        // saving as much info by setting the body to either the actual return value or the entire error object 
        response.body = !_.isEmpty(response.body) ?  response.body : JSON.stringify(error);
        // swallow as this will be handled after this block
      }
      if (!_.isEmpty(raid)) {
        await this.saveRaid(raid, record, options, metaMetadataInfo);
      } else {
        sails.log.error(`${this.logHeader} mintRaid() ${oid} -> Failed to mint raid!`);
        let errorMessage = TranslationService.t('raid-mint-server-error');
        let customError:RBValidationError = new RBValidationError(errorMessage);
        sails.log.error(errorMessage);
        if (!_.isEmpty(sails.config.raid.retryJobName)) {
          // a generic/comms error, so we put this in the queue so we can retry later
          attemptCount++;
          if (attemptCount <= sails.config.raid.retryJobMaxAttempts) {
            // set the flag for post-save processor to add the job
            _.set(record.metaMetadata, 'raid.attemptCount', attemptCount);
            _.set(record.metaMetadata, 'raid.options', options);
            _.set(record.metaMetadata, 'raid.attemptResponse', { statusCode: response.statusCode, body: response.body })
            if (!_.isEmpty(oid)) {
              // same as above but directly schedule as we know the oid
              this.scheduleMintRetry({oid: oid, options: options, attemptCount: attemptCount });
            } 
            // we let the process proceed so the record is saved
          } else {
            sails.log.error(`${this.logHeader} mintRaid() -> Max retry attempts reached, giving up: ${oid}`);  
          }
        } else {
          sails.log.debug(`${this.logHeader} mintRaid() -> Retries not configured, please set 'sails.config.raid.retryJobName'`)
          // we fail fast if retries aren't supported
          throw customError;
        }
      }
      return record;
    }

    private scheduleMintRetry(data: any) { 
      AgendaQueueService.schedule(sails.config.raid.retryJobName, sails.config.raid.retryJobSchedule, data);
    }

    public getContributors(record, options, fieldConfig?:any, mappedData?:any) {
      // start with a map to simplify uniqueness guarantees
      const contributors = {};
      const contributorMapConfig = fieldConfig.contributorMap;
      const startDate = mappedData?.date?.startDate;
      const endDate = mappedData?.date?.endDate;
      for (const fieldName in contributorMapConfig) {
        const contribVal = _.get(record, `metadata.${fieldName}`);
        const contribConfig = contributorMapConfig[fieldName];
        if (_.isArray(contribVal)) {
          for (let entry of contribVal) {
            this.buildContribVal(contributors, entry, contribConfig, startDate, endDate);
          }
        } else {
          this.buildContribVal(contributors, contribVal, contribConfig, startDate, endDate);
        }
      }
      // convert to array for the API
      return _.map(contributors, (val)=> { return val });
    }

    public buildContribVal(contributors, contribVal, contribConfig, startDate, endDate) {
      if (_.isEmpty(contribVal.text_full_name)) {
        sails.log.verbose(`${this.logHeader} buildContribVal() -> Ignoring blank record.`);
        return;
      }
      const id = this.getContributorId(contribVal, contribConfig);
      if (!_.isEmpty(id)) {
        if (_.isUndefined(contributors[id])) {
          // this the first entry to the map, successive updates will only be appending the incoming position & role
          const contrib = {
            id: id,
            schemaUri: sails.config.raid.orcidBaseUrl,
            position: [
              this.getContributorPosition(contribConfig.position, startDate, endDate)
            ],
            role: [
              this.getContributorRole(contribConfig.role)
            ]
          };
          this.setContributorFlags(contrib, contribConfig);
          contributors[id] = contrib;
        } else {
          const position = this.getContributorPosition(contribConfig.position, startDate, endDate);
          if (!_.find(contributors[id].position, {id: position.id})) {
            // as per https://metadata.raid.org/en/latest/core/contributors.html#contributor-position
            // contributors can only have one position for a certain time (unsupported by RB) period so only use the 'highest'
            const curPosIdx = _.findIndex(sails.config.raid.types.contributor.hiearchy.position, (lbl) => { return lbl == contribConfig.position });
            const existPosLabel = _.findKey(sails.config.raid.types.contributor.position, {id: contributors[id].position[0]});
            const existPosIdx = _.findIndex(sails.config.raid.types.contributor.hiearchy.position, (lbl)=> { return lbl == existPosLabel });
            if (curPosIdx < existPosIdx) {
              // the current position is higher, overwrite existing
              contributors[id].position[0]= position;
            } 
            // if the incoming incoming position is the same or lower hiearchy, ignore...
          }
          const role = this.getContributorRole(contribConfig.role);
          if (!_.find(contributors[id].role, {id: role.id})) {
            contributors[id].role.push(role);
          }
          this.setContributorFlags(contributors[id], contribConfig);
        }
      } else {
        sails.log.verbose(`${this.logHeader} buildContribVal() -> Missing/invalid identifier for: ${JSON.stringify(contribVal)}`);
        // we ignore records that don't have a valid ORCID, otherwise we reject the RAiD creation
        if (_.get(contribConfig, 'requireOrcid', false) == true) {
          // reject mint as we have a missing ORCID
          let errorMessage = TranslationService.t('raid-mint-transform-missing-contributorid-error');
          let customError:RBValidationError = new RBValidationError(`${errorMessage} '${contribVal.text_full_name}'`);
          throw customError;
        }        
      }
    }

    private setContributorFlags(contrib: any, contribConfig: any) {
      // setting the required flags: https://metadata.raid.org/en/latest/core/contributors.html
      const configFlags = sails.config.raid.types.contributor.flags;
      for (let configFlagName in configFlags) {
        if (_.includes(configFlags[configFlagName], contribConfig.position)) {
          _.set(contrib, configFlagName, true);
        }
      }   
    }

    /**
     * As per https://support.orcid.org/hc/en-us/articles/360006897674-Structure-of-the-ORCID-Identifier 
     * 
     * orcid must be a 0-9,X
     * 
     * @param contribVal 
     * @param contribConfig 
     * @returns 
     */
    private getContributorId(contribVal: any, contribConfig: any) {
      let id = _.replace(_.get(contribVal, contribConfig.fieldMap.id), sails.config.raid.orcidBaseUrl, '');
      let regex = /(\d{4}-){3}\d{3}(\d|X)/;
      if (_.isEmpty(id) || _.size(id) != 19 || regex.test(id) === false) {
        id = undefined;
      } 
      if (!_.isUndefined(id)) {
        // ID now should be the full ORCID Url
        id = _.get(contribVal, contribConfig.fieldMap.id);
        if (!_.startsWith(id, sails.config.raid.orcidBaseUrl)) {
          id = `${sails.config.raid.orcidBaseUrl}${id}`;
        }
      }
      return id;
    }

    private getContributorPosition(type: string, startDate: string, endDate?:string) {
      return {
        schemaUri: sails.config.raid.types.contributor.position[type].schemaUri,
        id: sails.config.raid.types.contributor.position[type].id,
        startDate: startDate,
        endDate: endDate
      } // not currently matching to any generated class so returning as POJO
    }

    private getContributorRole(type: string) {
      return {
        schemaUri: ContributorRoleSchemeType.HttpsCreditNisoOrg,
        id: `${ContributorRoleSchemeType.HttpsCreditNisoOrg}contributor-roles/${ContributorRoleCreditNisoOrgType[type]}/`
      } // not currently matching to any generated class so returning as POJO
    }

    private getMappedData(record, fields, options): any {
      const mappedData = {};
      for (let fieldName in fields) {
        try {
          const fieldConfig = _.get(fields, fieldName);
          const src = _.get(fieldConfig, 'src');
          const dest = _.get(fieldConfig, 'dest');
          let data = undefined;
          if (src && src.indexOf('<%') != -1) {
            const that = this;
            const imports = _.extend({
              record: record,
              options: options,
              moment: moment,
              numeral: numeral,
              mappedData: mappedData,
              fieldConfig: fieldConfig,
              types: sails.config.raid.types,
              that: that
            }, this);
            const templateData = {
              imports: imports
            };
            data = _.template(src, templateData)();
            if (fieldConfig.parseJson) {
              data = JSON.parse(data);
            }
          } else {
            data = _.get(record, src);
          }
          if (!_.isUndefined(dest)) {
            _.set(mappedData, dest, data);
          } else {
            sails.log.warn(`${this.logHeader} getMappedData() -> Destination field is empty for ${fieldName}, if there is a missing mapped value, check if the template/fn call is setting the destination value.`);
          }
        } catch (fieldErr) {
          sails.log.error(`${this.logHeader} getMappedData() -> Failed to process field: ${fieldName}`);
          sails.log.error(fieldErr);
          throw fieldErr;
        }
      }
      return mappedData;
    }

    public getSubject(record, options, fieldConfig?:any, subjects?:any, subjectType?: string, subjectData?: any) {
      if (_.isArray(subjectData) && !_.isEmpty(subjectData)) {
        for (let subject of subjectData) {
          subjects.push({
            id: `${sails.config.raid.types.subject[subjectType].id}${subject.notation}`,
            schemaUri: sails.config.raid.types.subject[subjectType].schemaUri,
            keyword: [ 
              {
                text: subject.label
              }
            ]
          });
        }
      } else {
        sails.log.warn(`${this.logHeader} getSubject() -> Missing subject source data: ${fieldConfig.dest}`);
      }
      return subjects;
    }

    private async saveRaid(raid, record, options, metaMetadataInfo): Promise<void> {
      // add raid to record, defaults to 'raidUrl'
      _.set(record.metadata, _.get(sails.config.raid, 'raidFieldName', 'raidUrl'), raid.id);
      if (sails.config.raid.saveBodyInMeta) {
        // don't save the response object as it contains the auth token
        _.set(record.metaMetadata, 'raid.response', metaMetadataInfo);
      }
      let alsoSaveRaidToOid = _.get(options, 'request.alsoSaveRaidToOid');
      if (!_.isEmpty(alsoSaveRaidToOid)) {
        sails.log.verbose(`${this.logHeader} saveRaid() -> Configured to save to associated records, config: ${JSON.stringify(alsoSaveRaidToOid)}`)
        for (let saveOidConfig of alsoSaveRaidToOid) {
          let optOid = _.get(record, saveOidConfig.oidPath);
          if (!_.isEmpty(optOid)) {
            sails.log.verbose(`${this.logHeader} saveRaid() -> Saving to associated record: ${optOid}`);
            const updateResp = await RecordsService.appendToRecord(optOid, raid.id, saveOidConfig.raidPath);
            if (!updateResp.isSuccessful()) {
              sails.log.error(`${this.logHeader} saveRaid() -> Failed to save to record: ${optOid}, reason: ${updateResp.message}`);
            }
          }
        }
      }
    }

  }
}
module.exports = new Services.Raid().exports();