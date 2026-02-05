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

import { Services as services } from '../CoreService';
import { RBValidationError } from '../model/RBValidationError';
import { momentShim as moment } from '../shims/momentShim';
import {
  Access,
  AlternateUrl,
  Configuration,
  Contributor,
  Description,
  ModelDate,
  Organisation,
  RaidApi,
  RaidCreateRequest,
  Title
} from '@researchdatabox/raido-openapi-generated-node';

import numeral from 'numeral';
import axios from 'axios';



export module Services {
  /**
   *  Uses `@researchdatabox/raido-openapi-generated-node` to interact with ARDC's RAID API.
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Raid extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'mintTrigger',
      'buildContributors',
      'buildContribVal',
      'mintPostCreateRetryHandler',
      'mintRetryJob'
    ];

    protected oauthTokenData: {
      accessTokenExpiryMillis: number | null;
      accessToken: string | null;
      responseData: any | null;
    } = {
      accessTokenExpiryMillis: null,
      accessToken: null,
      responseData: null
    };

    constructor() {
      super();
      this.logHeader = "RaidService::";
    }

    public async mintTrigger(oid: string, record: any, options: any): Promise<any> {
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
    public async mintRetryJob(job: { attrs: { data: { oid: string; options: any; attemptCount?: number } } }) {
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
    public async mintPostCreateRetryHandler(oid: string, record: any, options: any) {
      const attemptCount = _.get(record.metaMetadata, 'raid.attemptCount');
      if (!_.isEmpty(oid) && attemptCount > 0) {
        sails.log.verbose(`${this.logHeader} mintPostCreateRetryHandler() -> Scheduled for ${oid} `);
        this.scheduleMintRetry({ oid: oid, options: _.get(record.metaMetadata, 'raid.options'), attemptCount: attemptCount });
      }
    }
    /**
     * Returns `sails.config.raid.token`
     *
     * If not set, retrieves an access token using `sails.config.raid.username` and `sails.config.raid.password`
     *
     * Access tokens have 24 hour validity
     *
     * @returns access token
     */
    private async getToken() {
      if (!_.isEmpty(_.trim(sails.config.raid.token))) {
        sails.log.verbose(`${this.logHeader} getToken() -> Using 'sails.config.raid.token'`);
        return sails.config.raid.token;
      }
      const now = Date.now();
      if (this.oauthTokenData.accessTokenExpiryMillis && now < this.oauthTokenData.accessTokenExpiryMillis) {
        sails.log.verbose(`${this.logHeader} getToken() -> Using cached accessToken`);
        return this.oauthTokenData.accessToken;
      }
      const oauthUrl = sails.config.raid.oauth.url;
      const oauthClientId = sails.config.raid.oauth.client_id;
      const username = sails.config.raid.oauth.username;
      const password = sails.config.raid.oauth.password;
      // FYI: as of 03 October 2024, the staging environment's  `refresh_expires_in` has the same value as `expires_in` rendering it useless
      if (_.isEmpty(username) || _.isEmpty(password)) {
        throw new RBValidationError({
          message: "Username and/or Password not configured",
          displayErrors: [{ code: 'raid-mint-transform-validation-error' }],
        });
      }

      try {
        sails.log.verbose(`${this.logHeader} getToken() -> Getting new access token...`);
        const oauthConfig = {
          url: oauthUrl,
          grant_type: 'password',
          username: username,
          password: password,
          client_id: oauthClientId
        };

        const auth1 = await this.fetchAuthToken(oauthConfig) as any;
        sails.log.verbose(`${this.logHeader} getToken() -> Got new token!`);
        if (auth1) {
          this.oauthTokenData.responseData = auth1;
          this.oauthTokenData.accessTokenExpiryMillis = Date.now() + ((auth1.expires_in ?? 0) * 1000);
          this.oauthTokenData.accessToken = auth1.access_token ?? null;
        }
      } catch (err: unknown) {
        throw new RBValidationError({
          message: "Failed to get token",
          options: { cause: err },
          displayErrors: [{ code: 'raid-mint-transform-validation-error' }],
        });
      }
      return this.oauthTokenData.accessToken;
    }

    private async fetchAuthToken(oauthConfig: { url: string; grantType?: string; clientId?: string; username?: string; password?: string; grant_type?: string; client_id?: string }): Promise<any> {

      try {
        const params = new URLSearchParams({
          'grant_type': String(oauthConfig.grantType ?? oauthConfig.grant_type ?? ''),
          'client_id': String(oauthConfig.clientId ?? oauthConfig.client_id ?? ''),
          'username': String(oauthConfig.username ?? ''),
          'password': String(oauthConfig.password ?? '')
        });
        const response = await axios.post(oauthConfig.url,
          params, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        const tokenData = response.data;
        return tokenData;

      } catch (error: unknown) {
        throw new RBValidationError({
          message: "Error fetching the token",
          options: { cause: error },
          displayErrors: [{ code: 'raid-mint-server-error' }],
        });
      }
    }

    private async mintRaid(oid: string, record: any, options: any, attemptCount: number = 0): Promise<any> {
      const basePath = sails.config.raid.basePath;
      const apiToken = await this.getToken();
      const configuration = new Configuration({
        basePath: basePath,
        accessToken: apiToken || undefined
      });
      const api = new RaidApi(configuration);
      const request: RaidCreateRequest = {} as RaidCreateRequest;
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
            throw new RBValidationError({
              message: `Failed to retrieve the source record: ${srcRecOid}, using path: ${srcRecField}, please check your recordtype configuration.`,
              displayErrors: [{ code: 'raid-mint-transform-validation-error' }],
            });
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
        throw new RBValidationError({
          options: { cause: error },
          displayErrors: [{ code: 'raid-mint-transform-validation-error' }],
        });
      }
      let raid = undefined;
      let metaMetadataInfo = undefined;
      let response: any | undefined = undefined;
      let body = undefined;
      try {
        sails.log.verbose(`${this.logHeader} mintRaid() ${oid} -> Sending data::`);
        sails.log.verbose(JSON.stringify(request));
        const axiosResponse = await api.mintRaid(request);
        _.set(axiosResponse, 'config.headers.Authorization', '-redacted-');
        response = axiosResponse;
        body = axiosResponse.data;
        sails.log.verbose(JSON.stringify(response.status));
        sails.log.verbose(`${this.logHeader} mintRaid() ${oid} -> Body::`);
        sails.log.verbose(JSON.stringify(body));
        if (response.status == 201) {
          raid = _.get(body, 'identifier');
          if (sails.config.raid.saveBodyInMeta) {
            metaMetadataInfo = body;
          }
        } else {
          // Note: if there's any 'notSet' validation errors, these will have to be hashed out during development,
          // with the specific fields set to 'required' and not treat these as runtime errors
          throw new RBValidationError({
            message: `Failed to mint RAiD for oid ${oid} statusCode ${response?.status} body ${JSON.stringify(body)}`,
            displayErrors: [{ code: 'raid-mint-server-error', status: String(response?.status) }],
          });
        }
      } catch (error: unknown) {
        const errObj = error as any;
        _.set(errObj, 'response.request.headers.Authorization', '-redacted-');
        const statusCode = _.get(errObj, 'statusCode');
        const msgs: string[] = [];
        if (statusCode == 401 || statusCode == 403 || statusCode == 400) {
          msgs.push(`Authentication failed for oid ${oid}, check if the auth token is properly configured.`);
          if (statusCode == 400) {
            msgs.push(`Possible validation issues for oid ${oid}!`);
          }
          throw new RBValidationError({
            message: msgs.join(' '),
            options: { cause: error },
            displayErrors: [{ code: 'raid-mint-server-error', status: statusCode, meta: { oid } }],
          });
        }
        // This is the generic handler for when the API call itself throws an exception, e.g. 404, 5xx status code that can possibly be resolved by retrying the request
        sails.log.error(`${this.logHeader} mintRaid() ${oid} -> API error, Status Code: '${errObj.statusCode}'`);
        sails.log.error(`${this.logHeader} mintRaid() ${oid} -> Error: ${JSON.stringify(errObj)}`);
        // set response as the error so it can be saved in the retry block
        response = errObj;
        // saving as much info by setting the body to either the actual return value or the entire error object
        response.body = !_.isEmpty(response.body) ? response.body : JSON.stringify(errObj);
        // swallow as this will be handled after this block
      }
      if (!_.isEmpty(raid)) {
        await this.saveRaid(raid, record, options, metaMetadataInfo);
      } else {
        sails.log.error(`${this.logHeader} mintRaid() ${oid} -> Failed to mint raid!`);
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
              this.scheduleMintRetry({ oid: oid, options: options, attemptCount: attemptCount });
            }
            // we let the process proceed so the record is saved
          } else {
            sails.log.error(`${this.logHeader} mintRaid() -> Max retry attempts reached, giving up: ${oid}`);
          }
        } else {
          sails.log.debug(`${this.logHeader} mintRaid() -> Retries not configured, please set 'sails.config.raid.retryJobName'`)
          // we fail fast if retries aren't supported
          throw new RBValidationError({
            message: "Retries not configured, please set 'sails.config.raid.retryJobName'",
            displayErrors: [{ code: 'raid-mint-server-error' }],
          });
        }
      }
      return record;
    }

    private scheduleMintRetry(data: { oid: string; options: any; attemptCount: number }) {
      AgendaQueueService.schedule(sails.config.raid.retryJobName, sails.config.raid.retryJobSchedule, data);
    }

    public getContributors(record: any, options: any, fieldConfig?: any, mappedData?: any) {
      // start with a map to simplify uniqueness guarantees
      const contributors: Record<string, any> = {};
      const contributorMapConfig = _.get(fieldConfig, 'contributorMap', {}) as Record<string, any>;
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
      return _.map(contributors, (val: any) => { return val });
    }

    public buildContribVal(contributors: Record<string, any>, contribVal: any, contribConfig: any, startDate: string, endDate?: string) {
      if (!contribVal || typeof contribVal !== 'object') {
        return;
      }
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
          if (!_.find(contributors[id].position, { id: position.id })) {
            // as per https://metadata.raid.org/en/latest/core/contributors.html#contributor-position
            // contributors can only have one position for a certain time (unsupported by RB) period so only use the 'highest'
            const curPosIdx = _.findIndex(sails.config.raid.types.contributor.hiearchy.position, (lbl: string) => { return lbl == contribConfig.position });
            const existPosLabel = _.findKey(sails.config.raid.types.contributor.position, { id: contributors[id].position[0] });
            const existPosIdx = _.findIndex(sails.config.raid.types.contributor.hiearchy.position, (lbl: string) => { return lbl == existPosLabel });
            if (curPosIdx < existPosIdx) {
              // the current position is higher, overwrite existing
              contributors[id].position[0] = position;
            }
            // if the incoming incoming position is the same or lower hiearchy, ignore...
          }
          const role = this.getContributorRole(contribConfig.role);
          if (!_.find(contributors[id].role, { id: role.id })) {
            contributors[id].role.push(role);
          }
          this.setContributorFlags(contributors[id], contribConfig);
        }
      } else {
        sails.log.verbose(`${this.logHeader} buildContribVal() -> Missing/invalid identifier for: ${JSON.stringify(contribVal)}`);
        // we ignore records that don't have a valid ORCID, otherwise we reject the RAiD creation
        if (_.get(contribConfig, 'requireOrcid', false) == true) {
          // reject mint as we have a missing ORCID
          throw new RBValidationError({
            message: `Missing ORCID and requireOrcid is true for ${JSON.stringify(contribVal)}`,
            displayErrors: [{ code: 'raid-mint-transform-missing-contributorid-error', meta: { fullName: contribVal.text_full_name } }],
          });
        }
      }
    }

    private setContributorFlags(contrib: any, contribConfig: any) {
      // setting the required flags: https://metadata.raid.org/en/latest/core/contributors.html
      const configFlags = sails.config.raid.types.contributor.flags;
      for (let configFlagName in configFlags) {
          if (_.includes(configFlags[configFlagName], contribConfig.position as string)) {
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
      const rawId = _.get(contribVal, contribConfig.fieldMap.id);
      const strippedId = _.replace(rawId, sails.config.raid.orcidBaseUrl, '');
      const regex = /(\d{4}-){3}\d{3}(\d|X)/;
      if (_.isEmpty(strippedId) || _.size(strippedId) !== 19 || regex.test(strippedId) === false) {
        return '';
      }
      // ID now should be the full ORCID Url
      let id = rawId;
      if (!_.startsWith(id, sails.config.raid.orcidBaseUrl)) {
        id = `${sails.config.raid.orcidBaseUrl}${id}`;
      }
      return id;
    }

    private getContributorPosition(type: string, startDate: string, endDate?: string) {
      return {
        schemaUri: sails.config.raid.types.contributor.position[type].schemaUri,
        id: sails.config.raid.types.contributor.position[type].id,
        startDate: startDate,
        endDate: endDate
      } // not currently matching to any generated class so returning as POJO
    }

    private getContributorRole(type: string) {
      return {
        schemaUri: sails.config.raid.types.contributor.roles.schemaUri,
        id: `${sails.config.raid.types.contributor.roles.schemaUri}contributor-roles/${sails.config.raid.types.contributor.roles.types[type]}/`
      } // not currently matching to any generated class so returning as POJO
    }

    private getMappedData(record: any, fields: any, options: any): any {
      const mappedData: any = {};
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
          throw new RBValidationError({
            message: `Failed to process field: ${fieldName}`,
            options: { cause: fieldErr },
            displayErrors: [{ code: 'raid-mint-transform-validation-error' }],
          });
        }
      }
      return mappedData;
    }

    public getSubject(record: any, options: any, fieldConfig?: any, subjects: Array<any> = [], subjectType: string = '', subjectData?: Array<any>) {
      if (_.isArray(subjectData) && !_.isEmpty(subjectData) && !_.isEmpty(subjectType)) {
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

    private async saveRaid(raid: { id?: string }, record: any, options: any, metaMetadataInfo: any | undefined): Promise<void> {
      // add raid to record, defaults to 'raidUrl'
      _.set(record, `metadata.${_.get(sails.config.raid, 'raidFieldName', 'raidUrl')}`, raid.id);
      if (sails.config.raid.saveBodyInMeta) {
        // don't save the response object as it contains the auth token
        _.set(record, 'metaMetadata.raid.response', metaMetadataInfo);
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

declare global {
  let RaidService: Services.Raid;
}
