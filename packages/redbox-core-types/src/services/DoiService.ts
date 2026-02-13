// Copyright (c) 2021 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import { of } from 'rxjs';
import { Services as services } from '../CoreService';
import { RBValidationError } from '../model/RBValidationError';
import { BrandingModel } from '../model/storage/BrandingModel';
import { momentShim as moment } from '../shims/momentShim';
import { DateTime } from 'luxon';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';

interface RecordWithMetadata extends Record<string, unknown> {
  metadata: Record<string, unknown>;
}

interface DataciteForCode {
  name: string;
  notation: string;
}

interface DatacitePostBody {
  data: {
    type: 'dois';
    attributes: {
      event: string;
      prefix: string;
      titles: Array<{ lang: string | null; title: string; titleType: string | null }>;
      publisher: string;
      publicationYear: string;
      url: string;
      sizes: string[];
      creators: Array<Record<string, unknown>>;
      dates: Array<{ date: string; dateType: string; dateInformation?: string }>;
      identifiers: Array<{ identifier: string; identifierType: string }>;
      subjects: Array<Record<string, unknown>>;
      descriptions: Array<Record<string, unknown>>;
      rightsList: Array<Record<string, unknown>>;
      fundingReferences: Array<Record<string, unknown>>;
      types: {
        ris: string;
        bibtex: string;
        citeproc: string;
        schemaOrg: string;
        resourceTypeGeneral: string;
      };
    };
  };
}


export namespace Services {
  /**
   *
   *
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   *
   */
  export class Doi extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'publishDoi',
      'publishDoiTrigger',
      'publishDoiTriggerSync',
      'updateDoiTriggerSync',
      'deleteDoi',
      'changeDoiState'
    ];

    private _msgPrefix!: string;
    private msgPrefix() {
      if (!this._msgPrefix) {
        this._msgPrefix = TranslationService.t('Datacite API error');
      }
      return this._msgPrefix;
    }

    private async makeCreateDoiCall(instance: AxiosInstance, postBody: DatacitePostBody, _record: RecordWithMetadata, _oid: string) {
      try {
        const response: AxiosResponse<Record<string, unknown>> = await instance.post('/dois', postBody);

        if (response.status == 201) {
          const responseBody = response.data as { data: { id: string } };
          const doi = responseBody.data.id
          sails.log.debug(`DOI created: ${doi}`)
          return doi;
        } else {
          throw this.doiResponseToRBValidationError(response.status);
        }
      } catch (err) {
        const msg = TranslationService.t(`Error creating DOI`);
        throw new RBValidationError({
          message: `${this.msgPrefix()} ${msg}`,
          options: { cause: err },
          displayErrors: [{ title: this.msgPrefix(), detail: msg }]
        });
      }
    }

    private async makeUpdateDoiCall(instance: AxiosInstance, postBody: DatacitePostBody, doi: string) {
      try {
        const response: AxiosResponse<Record<string, unknown>> = await instance.patch(`/dois/${doi}`, postBody)

        if (response.status == 200) {
          const responseBody = response.data as { data: { id: string } };
          const doi = responseBody.data.id
          sails.log.debug(`DOI Updated: ${doi}`)
          return doi;
        } else {
          throw this.doiResponseToRBValidationError(response.status);
        }
      } catch (err) {
        const msg = TranslationService.t(`Error updating DOI`);
        throw new RBValidationError({
          message: `${this.msgPrefix()} ${msg}`,
          options: { cause: err },
          displayErrors: [{ title: this.msgPrefix(), detail: msg }]
        });
      }
    }

    public async deleteDoi(doi: string): Promise<boolean> {
      try {
        const baseUrl = sails.config.datacite.baseUrl;

        const authenticationStringEncoded = this.getAuthenticationString();
        const instance = axios.create({
          baseURL: baseUrl,
          timeout: 10000,
          headers: {
            'Authorization': `Basic ${authenticationStringEncoded}`,
            'Content-Type': 'application/vnd.api+json'
          }
        });
        const response = await instance.delete(`/dois/${doi}`);
        if (response.status == 204) {
          return true;
        } else {
          throw this.doiResponseToRBValidationError(response.status);
        }
      } catch (err) {
        const msg = TranslationService.t(`Error deleting DOI`);
        throw new RBValidationError({
          message: `${this.msgPrefix()} ${msg}`,
          options: { cause: err },
          displayErrors: [{ title: this.msgPrefix(), detail: msg }]
        });
      }
    }

    public async changeDoiState(doi: string, event: string): Promise<boolean> {
      try {
        const baseUrl = sails.config.datacite.baseUrl
        const authenticationStringEncoded = this.getAuthenticationString()
        const instance = axios.create({
          baseURL: baseUrl,
          timeout: 10000,
          headers: {
            'Authorization': `Basic ${authenticationStringEncoded}`,
            'Content-Type': 'application/vnd.api+json'
          }
        });
        const putBody = {
          "data": {
            "type": "dois",
            "attributes": {
              "event": event
            }
          }
        }

        const response = await instance.put(`/dois/${doi}`, putBody)
        if (response.status == 200) {
          return true
        } else {
          throw this.doiResponseToRBValidationError(response.status);
        }
      } catch (err) {
        const msg = TranslationService.t(`Error deleting DOI`);
        throw new RBValidationError({
          message: `${this.msgPrefix()} ${msg}`,
          options: { cause: err },
          displayErrors: [{ title: this.msgPrefix(), detail: msg }]
        });
      }
    }

    private doiResponseToRBValidationError(statusCode: number): RBValidationError {
      let message: string;
      switch (statusCode) {
        case 403:
          message = 'not-authorised'
          break;
        case 404:
          message = 'not-found' //Happens when a) invalid credentials when creating; and b) DOI is invalid.
          break;
        case 422:
          message = 'invalid-format'
          break;
        case 500:
          message = 'server-error'
          break;
        default:
          message = 'unknown-error'
          break;
      }
      return new RBValidationError({
        message: `${this.msgPrefix()} ${TranslationService.t(message)}`,
        displayErrors: [{ code: message, title: this.msgPrefix() }],
      })
    }

    private processForCodes(forCodes: DataciteForCode[]) {
      const doiForCodeList: Array<{ subject: string; schemeUri: string; subjectScheme: string; classificationCode: string }> = []
      if (!_.isUndefined(forCodes)) {
        for (const forCode of forCodes) {
          doiForCodeList.push({
            subject: forCode.name,
            schemeUri: "https://www.abs.gov.au/ausstats/abs@.nsf/0",
            subjectScheme: "Australian and New Zealand Standard Research Classification (ANZSRC) 2020: Fields of Research (FoR) codes",
            classificationCode: forCode.notation
          })
        }
      }
      return doiForCodeList;
    }

    public async publishDoi(oid: string, record: RecordWithMetadata, event = 'publish', action = 'create') {

      const doiPrefix = sails.config.datacite.doiPrefix;
      const baseUrl = sails.config.datacite.baseUrl;

      const authenticationStringEncoded = this.getAuthenticationString();
      const lodashTemplateContext = {
        record: record,
        oid: oid,
        moment: moment,
        processForCodes: this.processForCodes
      };

      const instance = axios.create({
        baseURL: baseUrl,
        timeout: 10000,
        headers: {
          'Authorization': `Basic ${authenticationStringEncoded}`,
          'Content-Type': 'application/vnd.api+json'
        }
      });

      const mappings = sails.config.datacite.mappings
      const url = this.runTemplate(mappings.url, lodashTemplateContext)
      const publicationYear = this.runTemplate(mappings.publicationYear, lodashTemplateContext)
      const publisher = this.runTemplate(mappings.publisher, lodashTemplateContext)

      const postBody: DatacitePostBody = {
        "data": {
          "type": "dois",
          "attributes": {
            "event": event,
            "prefix": doiPrefix,
            "titles": [],
            "publisher": publisher,
            "publicationYear": publicationYear,
            "url": url,
            "sizes": [],
            "creators": [],
            "dates": [],
            "identifiers": [],
            "subjects": [],
            "descriptions": [],
            "rightsList": [],
            "fundingReferences": [],
            "types": {
              "ris": "DATA",
              "bibtex": "misc",
              "citeproc": "dataset",
              "schemaOrg": "Dataset",
              "resourceTypeGeneral": "Dataset"
            }
          }
        }
      }

      const title = this.runTemplate(mappings.title, lodashTemplateContext)

      if (!_.isEmpty(title)) {
        postBody.data.attributes.titles.push({ "lang": null, "title": title, "titleType": null })
      }

      const creatorTemplateContext: Record<string, unknown> = _.clone(lodashTemplateContext)
      const creatorsProperty = sails.config.datacite.creatorsProperty
      for (const creator of (record.metadata[creatorsProperty] as Array<Record<string, unknown>>)) {
        creatorTemplateContext['creator'] = creator
        const creatorGivenName = this.runTemplate(mappings.creatorGivenName, creatorTemplateContext)
        const creatorFamilyName = this.runTemplate(mappings.creatorFamilyName, creatorTemplateContext)
        const creatorIdentifier = this.runTemplate(mappings.creatorIdentifier, creatorTemplateContext)
        if (!_.isEmpty(creatorFamilyName) && !_.isEmpty(creatorGivenName)) {
          postBody.data.attributes.creators.push({
            'nameType': 'Personal', 'givenName': creatorGivenName, 'familyName': creatorFamilyName, nameIdentifiers: [{
              schemeUri: "https://orcid.org",
              nameIdentifier: creatorIdentifier,
              nameIdentifierScheme: "ORCID"
            }]
          })
        }
      }

      const dates = mappings.dates
      if (!_.isEmpty(dates) && _.isArray(dates)) {
        for (const oDate of dates) {
          const aDate = this.runTemplate(oDate.template, lodashTemplateContext)
          if (!_.isEmpty(aDate)) {
            postBody.data.attributes.dates.push({ "date": aDate, "dateType": oDate.dateType, "dateInformation": oDate.dateInformation })
          }
        }
      }

      const fundingReferences = mappings.fundingReferences

      if (!_.isEmpty(fundingReferences) && _.isArray(fundingReferences)) {
        for (const fundingReference of fundingReferences) {
          const funderName = JSON.parse(this.runTemplate(fundingReference.funderName, lodashTemplateContext))
          const awardTitle = JSON.parse(this.runTemplate(fundingReference.awardTitle, lodashTemplateContext))
          for (let j = 0; j < funderName.length; j++) {
            if (!_.isEmpty(funderName[j])) {
              postBody.data.attributes.fundingReferences.push({ "funderName": funderName[j], "awardTitle": awardTitle[j] })
            }
          }
        }
      }


      const descriptions = mappings.descriptions
      if (!_.isEmpty(descriptions) && _.isArray(descriptions)) {
        for (const description of descriptions) {
          const descriptionType = description.descriptionType
          const allDescriptions = JSON.parse(this.runTemplate(description.template, lodashTemplateContext))
          for (const aDescription of allDescriptions) {
            if (!_.isEmpty(aDescription)) {
              postBody.data.attributes.descriptions.push({ "descriptionType": descriptionType, "description": aDescription })
            }
          }
        }
      }

      const rightsList = mappings.rightsList
      if (!_.isEmpty(rightsList) && _.isArray(rightsList)) {
        for (const rights of rightsList) {
          const key = rights.key
          const value = this.runTemplate(rights.template, lodashTemplateContext)
          if (!_.isEmpty(value)) {
            postBody.data.attributes.rightsList.push({ [key]: value })
          }
        }
      }

      let sizes = this.runTemplate(mappings.sizes, lodashTemplateContext)
      if (!_.isEmpty(sizes)) {
        sizes = JSON.parse(sizes)
      }

      if (!_.isEmpty(sizes) && _.isArray(sizes)) {
        for (const item of sizes) {
          if (!_.isEmpty(item)) {
            postBody.data.attributes.sizes.push(item)
          }
        }
      }

      let identifiers = this.runTemplate(mappings.identifiers, lodashTemplateContext)
      if (!_.isEmpty(identifiers)) {
        identifiers = JSON.parse(identifiers)
      }

      if (!_.isEmpty(identifiers) && _.isArray(identifiers)) {
        for (const item of identifiers) {
          if (!_.isEmpty(item)) {
            const identifier = { "identifier": item, "identifierType": "Other" }
            postBody.data.attributes.identifiers.push(identifier)
          }
        }
      }

      for (const subjectTemplate of mappings.subjects) {

        let subjects = this.runTemplate(subjectTemplate, lodashTemplateContext)
        if (!_.isEmpty(subjects)) {
          subjects = JSON.parse(subjects)
        }

        if (!_.isEmpty(subjects) && _.isArray(subjects)) {
          for (const subject of subjects) {
            if (!_.isEmpty(subject)) {

              if (typeof (subject) == 'string') {
                postBody.data.attributes.subjects.push({ "subject": subject })
              } else {
                postBody.data.attributes.subjects.push(subject)
              }
            }
          }
        }
      }

      sails.log.verbose("DOI post body")
      sails.log.verbose(JSON.stringify(postBody))

      const postBodyValidateError: string[] = []

      if (_.isEmpty(postBody.data.attributes.titles)) {
        postBodyValidateError.push('title-required')
      }

      if (_.isEmpty(postBody.data.attributes.publisher)) {
        postBodyValidateError.push('publisher-required')
      }

      if (_.isEmpty(postBody.data.attributes.creators)) {
        postBodyValidateError.push('creators-required')
      }

      if (_.isEmpty(postBody.data.attributes.publicationYear)) {
        postBodyValidateError.push('publication-year-required')
      }
      else if (_.size(postBody.data.attributes.publicationYear) != 4 || _.isNaN(postBody.data.attributes.publicationYear)) {
        postBodyValidateError.push('publication-year-invalid')
      }

      if (_.isEmpty(postBody.data.attributes.url)) {
        postBodyValidateError.push('url-required')
      }
      else {
        try {
          new URL(postBody.data.attributes.url)
        }
        catch {
          postBodyValidateError.push('url-invalid')
        }
      }

      if (!_.isEmpty(postBody.data.attributes.dates)) {
        const dates = postBody.data.attributes.dates
        for (const dateItem of dates) {
          const date = DateTime.fromJSDate(new Date(dateItem.date)).toFormat('yyyy-LL-dd')
          if (!DateTime.fromFormat(date, 'yyyy-LL-dd', { zone: 'utc' }).isValid) {
            postBodyValidateError.push('date-invalid')
          }
        }
      }

      if (_.isEmpty(postBody.data.attributes.types.resourceTypeGeneral)) {
        postBodyValidateError.push('general-resource-type-required')
      }

      const citationDoi = record.metadata.citation_doi as string | undefined;
      if (action == 'update' && _.isEmpty(citationDoi)) {
        postBodyValidateError.push('doi-required')
      }

      if (action == 'update' && citationDoi && !citationDoi.startsWith(doiPrefix)) {
        sails.log.warn(`The citation DOI ${citationDoi} does not begin with the correct prefix ${doiPrefix}. Will not attempt to update`)
        return null;
      }

      if (postBodyValidateError.length > 0) {
        const bodyValidateCode = 'datacite-validation-error';
        throw new RBValidationError({
          message: `Could not publish DOI oid ${oid} event ${event} action ${action} errors ${postBodyValidateError.join(', ')}`,
          displayErrors: postBodyValidateError.map(code => {
            return { code: code, title: bodyValidateCode, meta: { oid, event, action } }
          }),
        })
      }
      let doi: string | null;
      if (action == 'update') {
        if (!citationDoi) {
          return null;
        }
        doi = await this.makeUpdateDoiCall(instance, postBody, citationDoi)
      }
      else {
        doi = await this.makeCreateDoiCall(instance, postBody, record, oid)
      }
      return doi;
    }

    getAuthenticationString() {
      const username = sails.config.datacite.username;
      const password = sails.config.datacite.password;
      const authenticationString = `${username}:${password}`;
      const buff = Buffer.from(authenticationString);
      return buff.toString('base64');
    }

    public async publishDoiTrigger(oid: string, record: RecordWithMetadata, options: Record<string, unknown>): Promise<unknown> {

      if (this.metTriggerCondition(oid, record, options) === "true") {
        const brand: BrandingModel = BrandingService.getBrand('default');
        const doi = await this.publishDoi(oid, record);

        if (doi != null) {
          record = this.addDoiDataToRecord(oid, record, doi)
          RecordsService.updateMeta(brand, oid, record).then(() => { });
        }
      }

      return of(null);
    }

    public async publishDoiTriggerSync(oid: string, record: RecordWithMetadata, options: Record<string, unknown>): Promise<RecordWithMetadata> {

      if (this.metTriggerCondition(oid, record, options) === "true") {
        const doi = await this.publishDoi(oid, record, options["event"] as string);

        if (doi != null) {
          record = this.addDoiDataToRecord(oid, record, doi)
        }
        return record;
      }
      return record;
    }

    public async updateDoiTriggerSync(oid: string, record: RecordWithMetadata, options: Record<string, unknown>): Promise<RecordWithMetadata> {

      if (this.metTriggerCondition(oid, record, options) === "true") {
        await this.publishDoi(oid, record, options["event"] as string, 'update');
      }
      return record
    }

    addDoiDataToRecord(oid: string, record: RecordWithMetadata, doi: string) {
      const lodashTemplateContext = {
        record: record,
        oid: oid,
        moment: moment
      };

      const citationUrlProperty = sails.config.datacite.citationUrlProperty;
      const citationDoiProperty = sails.config.datacite.citationDoiProperty;
      const generatedCitationStringProperty = sails.config.datacite.generatedCitationStringProperty;
      const citationStringTemplate = sails.config.datacite.citationStringTemplate;

      const generatedCitation = this.runTemplate(citationStringTemplate, {
        data: record,
        moment: moment
      });
      const url = this.runTemplate(sails.config.datacite.mappings.url, lodashTemplateContext);
      _.set(record, citationUrlProperty, url);
      _.set(record, citationDoiProperty, doi);
      _.set(record, generatedCitationStringProperty, generatedCitation);

      return record;
    }

    //TODO: This method will be deprecated soon and moved to its own run template service so it can be reused in
    //      which will allow to standardise config structure in all places were object mappings are needed
    protected runTemplate(template: string, variables: Record<string, unknown>): string {
      if (template && template.indexOf('<%') != -1) {
        return _.template(template)(variables);
      }
      return _.get(variables, template) as string;
    }
  }
}

declare global {
  let DoiService: Services.Doi;
}
