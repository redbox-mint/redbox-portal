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
  Observable
} from 'rxjs/Rx';
import {
  Services as services,
  RBValidationError
} from '@researchdatabox/redbox-core-types';
import {
  Sails,
  Model
} from "sails";
import { MintRaidoSchemaV1Request, BasicRaidExperimentalApi,  RaidoMetadataSchemaV1, MintRaidoSchemaV1RequestMintRequest, RaidoMetaschema, TitleBlock, DatesBlock, DescriptionBlock, AccessBlock, AlternateUrlBlock, ContributorBlock, OrganisationBlock, TitleType, DescriptionType, AccessType, ContributorIdentifierSchemeType, ContributorPositionRaidMetadataSchemaType, ContributorRoleCreditNisoOrgType, ContributorRole, ContributorPosition, OrganisationIdentifierSchemeType, OrganisationRoleSchemeType, OrganisationRoleType, ContributorPositionSchemeType, ContributorRoleSchemeType } from '@researchdatabox/raido-openapi-generated-node';

import moment = require('moment');
import * as numeral from 'numeral';


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
      if (`${sails.config.raid.enabled}` === 'true' && this.metTriggerCondition(oid, record, options) === "true") {
        await this.mintRaid(oid, record, options);
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
      if (!_.isEmpty(oid) && _.isEmpty(_.get(record.metadata, 'raidUrl')) && attemptCount > 0) {
        sails.log.verbose(`${this.logHeader} mintPostCreateRetryHandler() -> Scheduled for ${oid} `);
        this.scheduleMintRetry({oid: oid, options: _.get(record.metaMetadata, 'raid.options'), attemptCount: attemptCount });
      }
    }

    private async mintRaid(oid, record, options, attemptCount:number = 0): Promise<any> {
      const basePath = sails.config.raid.basePath;
      const apiToken = sails.config.raid.token;
      const servicePointId = sails.config.raid.servicePointId;
      
      const api = new BasicRaidExperimentalApi();
      api.basePath = basePath;
      api.accessToken = apiToken;
      const request = new MintRaidoSchemaV1Request();
      try {
        request.metadata = new RaidoMetadataSchemaV1();
        request.mintRequest = {
          servicePointId: servicePointId
        } as MintRaidoSchemaV1RequestMintRequest;
        request.metadata.metadataSchema = RaidoMetaschema.RaidoMetadataSchemaV1;
        const mintRequestFields = _.get(options, 'request.mint.fields');
        const mappedData = this.getMappedData(record, mintRequestFields, options);
        request.metadata.titles = _.get(mappedData, 'titles') as TitleBlock[];
        request.metadata.dates = _.get(mappedData, 'dates') as DatesBlock;
        request.metadata.descriptions = _.get(mappedData, 'descriptions') as DescriptionBlock[];
        request.metadata.access = _.get(mappedData, 'access') as AccessBlock;
        request.metadata.alternateUrls = _.get(mappedData, 'alternateUrls') as AlternateUrlBlock[];
        request.metadata.contributors = _.get(mappedData, 'contributors') as ContributorBlock[];
        request.metadata.organisations = _.get(mappedData, 'organisations') as OrganisationBlock[];
      } catch (error) {
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
      try {
        sails.log.verbose(`${this.logHeader} mintRaid() ${oid} -> Sending data::`);
        sails.log.verbose(JSON.stringify(request));
        const { response, body } = await api.mintRaidoSchemaV1(request);
        sails.log.verbose(JSON.stringify(response));
        sails.log.verbose(`${this.logHeader} mintRaid() ${oid} -> Body::`);
        sails.log.verbose(JSON.stringify(body));
        if (body.success === true && response.statusCode == 200) {
          raid = _.get(body, 'raid.url');
          if (sails.config.raid.saveBodyInMeta) {
            metaMetadataInfo = body;
          }
        } else {
          sails.log.error(`${this.logHeader} mintRaid() ${oid} -> Failed to mint raid:`);
          sails.log.error(JSON.stringify(body));
          let errorMessage = TranslationService.t('raid-mint-server-error');
          // Note: if there's any 'notSet' validation errors, these will have to be hashed out during development, with the specific fields set to 'required' and not treat these as runtime errors
          let customError:RBValidationError = new RBValidationError(errorMessage);
          sails.log.error(errorMessage);
          throw customError;
        }
      } catch (error) {
        sails.log.error(error);
        // swallow as this will be handled after this block
      }
      if (!_.isEmpty(raid)) {
        // add raid to record
        _.set(record.metadata, 'raidUrl', raid);
        if (sails.config.raid.saveBodyInMeta) {
          _.set(record.metaMetadata, 'raid', metaMetadataInfo.raid);
        }
      } else {
        sails.log.error(`${this.logHeader} mintRaid() ${oid} -> Failed to mint raid!`);
        let errorMessage = TranslationService.t('raid-mint-server-error');
        let customError:RBValidationError = new RBValidationError(errorMessage);
        sails.log.error(errorMessage);
        if (!_.isEmpty(sails.config.raid.retryJobName)) {
          // a generic/comms error, so we put this in the queue so we can retry later
          attemptCount++;
          if (attemptCount <= sails.config.raid.retryJobMaxAttempts) {
            if (_.isEmpty(oid)) {
              // set the flag for post-save processor to add the job
              _.set(record.metaMetadata, 'raid.attemptCount', attemptCount);
              _.set(record.metaMetadata, 'raid.options', options);
            } else {
              _.set(record.metaMetadata, 'raid.attemptCount', attemptCount);
              _.set(record.metaMetadata, 'raid.options', options);
              // same as above but directly schedule as we know the oid
              this.scheduleMintRetry({oid: oid, options: options, attemptCount: attemptCount });
            }
            // we let the process proceed so the record is saved
          } else {
            sails.log.error(`${this.logHeader} mintRaid() -> Max retry attempts reached, giving up: ${oid}`);  
          }
        } else {
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
      const startDate = mappedData?.dates?.startDate;
      const endDate = mappedData?.dates?.endDate;
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
          const contrib = {
            id: id,
            identifierSchemeUri: ContributorIdentifierSchemeType.HttpsOrcidOrg,
            positions: [
              this.getContributorPosition(contribConfig.position, startDate, endDate)
            ],
            roles: [
              this.getContributorRole(contribConfig.role)
            ]
          };
          contributors[id] = contrib as ContributorBlock;
        } else {
         contributors[id].positions.push(this.getContributorPosition(contribConfig.position, startDate, endDate));
         contributors[id].roles.push(this.getContributorRole(contribConfig.role));
        }
      } else {
        sails.log.verbose(`${this.logHeader} buildContribVal() -> Missing/invalid identifier for: ${contribVal}`);
        // reject mint if we have missing ids
        let errorMessage = TranslationService.t('raid-mint-transform-missing-contributorid-error');
        let customError:RBValidationError = new RBValidationError(`${errorMessage} '${contribVal.text_full_name}'`);
        throw customError;
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
      let id = _.replace(_.get(contribVal, contribConfig.fieldMap.id), 'https://orcid.org/', '');
      let regex = /(\d{4}-){3}\d{3}(\d|X)/;
      if (_.isEmpty(id) || _.size(id) != 19 || regex.test(id) === false) {
        id = undefined;
      } 
      return id;
    }

    private getContributorPosition(type: string, startDate: string, endDate?:string): ContributorPosition {
      return {
        positionSchemaUri: ContributorPositionSchemeType.HttpsRaidOrg,
        position: ContributorPositionRaidMetadataSchemaType[type],
        startDate: startDate,
        endDate: endDate
      } as ContributorPosition;
    }

    private getContributorRole(type: string): ContributorRole {
      return {
        roleSchemeUri: ContributorRoleSchemeType.HttpsCreditNisoOrg,
        role: ContributorRoleCreditNisoOrgType[type]
      } as ContributorRole ;
    }

    private getMappedData(record, fields, options): any {
      const mappedData = {};
      for (let fieldName in fields) {
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
            types: { 
              TitleType: TitleType,
              DescriptionType: DescriptionType,
              AccessType: AccessType,
              ContributorIdentifierSchemeType: ContributorIdentifierSchemeType,
              OrganisationIdentifierSchemeType: OrganisationIdentifierSchemeType,
              OrganisationRoleSchemeType: OrganisationRoleSchemeType,
              OrganisationRoleType: OrganisationRoleType
            },
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
        _.set(mappedData, dest, data);
      }
      return mappedData;
    }

  }
}
module.exports = new Services.Raid().exports();