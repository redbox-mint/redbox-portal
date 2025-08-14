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

import {
  Observable,of
} from 'rxjs';
import {
  Services as services,
  RBValidationError,
  BrandingModel
} from '@researchdatabox/redbox-core-types';
import {
  Sails,
  Model
} from "sails";
import 'rxjs/add/operator/toPromise';
import { DateTime } from 'luxon';
import moment from '../shims/momentShim';
import axios from 'axios';
import { isArray } from 'lodash';


declare var sails: Sails;
declare var RecordsService;
declare var BrandingService;
declare var TranslationService;
declare var _;




export module Services {
  /**
   *
   *
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   *
   */
  export class Doi extends services.Core.Service {
    protected _exportedMethods: any = [
      'publishDoi',
      'publishDoiTrigger',
      'publishDoiTriggerSync',
      'updateDoiTriggerSync',
      'deleteDoi',
      'changeDoiState'
    ];

    private async makeCreateDoiCall(instance, postBody, record, oid) {

      try {
        let response = await instance.post('/dois', postBody);

        if (response.status == 201) {
          let responseBody = response.data;
          let doi = responseBody.data.id
          sails.log.debug(`DOI created: ${doi}`)






          sails.log.debug(`DOI generated ${doi}`)

          return doi;
        } else {
          let errorMessage = this.doiResponseErrorMessage(response.status)
          let customError: RBValidationError = new RBValidationError(errorMessage)
          sails.log.error(errorMessage)
          throw customError
        }

      } catch (err) {
        let errorMessage = TranslationService.t(err)
        let customError: RBValidationError = new RBValidationError(errorMessage)
        sails.log.error(errorMessage)
        throw customError;
      }
    }

    private async makeUpdateDoiCall(instance, postBody, doi) {

      try {
        let response = await instance.patch(`/dois/${doi}`, postBody)

        if (response.status == 200) {
          let responseBody = response.data
          let doi = responseBody.data.id
          sails.log.debug(`DOI Updated: ${doi}`)
          return doi;
        } else {
          let errorMessage = this.doiResponseErrorMessage(response.status)
          let customError: RBValidationError = new RBValidationError(errorMessage)
          sails.log.error(errorMessage)
          throw customError
        }
      } catch (err) {
        let errorMessage = TranslationService.t(err)
        let customError: RBValidationError = new RBValidationError(errorMessage)
        sails.log.error(errorMessage)
        throw customError
      }
    }

    public async deleteDoi(doi: string) {
      try {
        let baseUrl = sails.config.datacite.baseUrl;

        let authenticationStringEncoded = this.getAuthenticationString();
        const instance = axios.create({
          baseURL: baseUrl,
          timeout: 10000,
          headers: {
            'Authorization': `Basic ${authenticationStringEncoded}`,
            'Content-Type': 'application/vnd.api+json'
          }
        });
        let response = await instance.delete(`/dois/${doi}`);
        if (response.status == 204) {
          return true;
        } else {

          let errorMessage = this.doiResponseErrorMessage(response.status)
          let customError: RBValidationError = new RBValidationError(errorMessage)
          sails.log.error(errorMessage)
          throw customError
        }

      } catch (err) {
        let errorMessage = TranslationService.t(err)
        let customError: RBValidationError = new RBValidationError(errorMessage)
        sails.log.error(errorMessage)
        throw customError
      }

      return false;
    }
    public async changeDoiState(doi: string, event: string) {
      try {
        let baseUrl = sails.config.datacite.baseUrl
        let authenticationStringEncoded = this.getAuthenticationString()
        const instance = axios.create({
          baseURL: baseUrl,
          timeout: 10000,
          headers: {
            'Authorization': `Basic ${authenticationStringEncoded}`,
            'Content-Type': 'application/vnd.api+json'
          }
        });
        let putBody = {
          "data": {
            "type": "dois",
            "attributes": {
              "event": event
            }
          }
        }

        let response = await instance.put(`/dois/${doi}`, putBody)
        if (response.status == 200) {
          return true
        } else {

          let errorMessage = this.doiResponseErrorMessage(response.status)
          let customError: RBValidationError = new RBValidationError(errorMessage)
          sails.log.error(errorMessage)
          throw customError
        }

      } catch (err) {
        let errorMessage = TranslationService.t(err)
        let customError: RBValidationError = new RBValidationError(errorMessage)
        sails.log.error(errorMessage)
        throw customError
      }

      return false;
    }

    doiResponseErrorMessage(statusCode) {
      let errorMessage = [TranslationService.t('Datacite API error')]
      let message = ''
      switch (statusCode) {
        case 403:
          message = 'not-authorised'
        case 404:
          message = 'not-found' //Happens when a) invalid credentials when creating; and b) DOI is invalid.
        case 422:
          message = 'invalid-format'
        case 500:
          message = 'server-error'
        default:
          message = 'unknown-error'
      }
      errorMessage.push(TranslationService.t(message))
      return errorMessage
    }

    private processForCodes(forCodes: any[]) {
      let doiForCodeList = []
      if (!_.isUndefined(forCodes)) {
        for (let forCode of forCodes) {
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

    public async publishDoi(oid, record, event = 'publish', action = 'create') {

      let doiPrefix = sails.config.datacite.doiPrefix;
      let baseUrl = sails.config.datacite.baseUrl;

      let authenticationStringEncoded = this.getAuthenticationString();
      let lodashTemplateContext = {
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

      let mappings = sails.config.datacite.mappings
      let url = this.runTemplate(mappings.url, lodashTemplateContext)
      let publicationYear = this.runTemplate(mappings.publicationYear, lodashTemplateContext)
      let publisher = this.runTemplate(mappings.publisher, lodashTemplateContext)

      let postBody = {
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

      let title = this.runTemplate(mappings.title, lodashTemplateContext)

      if (!_.isEmpty(title)) {
        postBody.data.attributes.titles.push({ "lang": null, "title": title, "titleType": null })
      }

      let creatorTemplateContext = _.clone(lodashTemplateContext)
      let creatorsProperty = sails.config.datacite.creatorsProperty
      for (let creator of record.metadata[creatorsProperty]) {
        creatorTemplateContext['creator'] = creator
        let creatorGivenName = this.runTemplate(mappings.creatorGivenName, creatorTemplateContext)
        let creatorFamilyName = this.runTemplate(mappings.creatorFamilyName, creatorTemplateContext)
        let creatorIdentifier = this.runTemplate(mappings.creatorIdentifier, creatorTemplateContext)
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

      let dates = mappings.dates
      if (!_.isEmpty(dates) && _.isArray(dates)) {
        for (var i = 0; i < dates.length; i++) {
          let oDate = dates[i]
          let aDate = this.runTemplate(oDate.template, lodashTemplateContext)
          if (!_.isEmpty(aDate)) {
            postBody.data.attributes.dates.push({ "date": aDate, "dateType": oDate.dateType, "dateInformation": oDate.dateInformation })
          }
        }
      }

      let fundingReferences = mappings.fundingReferences

      if (!_.isEmpty(fundingReferences) && _.isArray(fundingReferences)) {
        for (var i = 0; i < fundingReferences.length; i++) {
          let fundingReference = fundingReferences[i]
          let funderName = JSON.parse(this.runTemplate(fundingReference.funderName, lodashTemplateContext))
          let awardTitle = JSON.parse(this.runTemplate(fundingReference.awardTitle, lodashTemplateContext))
          for (var j = 0; j < funderName.length; j++) {
            if (!_.isEmpty(funderName[j])) {
              postBody.data.attributes.fundingReferences.push({ "funderName": funderName[j], "awardTitle": awardTitle[j] })
            }
          }
        }
      }


      let descriptions = mappings.descriptions
      if (!_.isEmpty(descriptions) && _.isArray(descriptions)) {
        for (var i = 0; i < descriptions.length; i++) {
          let description = descriptions[i]
          let descriptionType = description.descriptionType
          let allDescriptions = JSON.parse(this.runTemplate(description.template, lodashTemplateContext))
          for (var j = 0; j < allDescriptions.length; j++) {
            let aDescription = allDescriptions[j]
            if (!_.isEmpty(aDescription)) {
              postBody.data.attributes.descriptions.push({ "descriptionType": descriptionType, "description": aDescription })
            }
          }
        }
      }

      let rightsList = mappings.rightsList
      if (!_.isEmpty(rightsList) && _.isArray(rightsList)) {
        for (var i = 0; i < rightsList.length; i++) {
          let rights = rightsList[i]
          let key = rights.key
          let value = this.runTemplate(rights.template, lodashTemplateContext)
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
        for (var i = 0; i < sizes.length; i++) {
          if (!_.isEmpty(sizes[i])) {
            postBody.data.attributes.sizes.push(sizes[i])
          }
        }
      }

      let identifiers = this.runTemplate(mappings.identifiers, lodashTemplateContext)
      if (!_.isEmpty(identifiers)) {
        identifiers = JSON.parse(identifiers)
      }

      if (!_.isEmpty(identifiers) && _.isArray(identifiers)) {
        for (var i = 0; i < identifiers.length; i++) {
          if (!_.isEmpty(identifiers[i])) {
            let identifier = { "identifier": identifiers[i], "identifierType": "Other" }
            postBody.data.attributes.identifiers.push(identifier)
          }
        }
      }

      for (let subjectTemplate of mappings.subjects) {

        let subjects = this.runTemplate(subjectTemplate, lodashTemplateContext)
        if (!_.isEmpty(subjects)) {
          subjects = JSON.parse(subjects)
        }

        if (!_.isEmpty(subjects) && _.isArray(subjects)) {
          for (var i = 0; i < subjects.length; i++) {
            if (!_.isEmpty(subjects[i])) {

              if (typeof (subjects[i]) == 'string') {
                let subject = { "subject": subjects[i] }
                postBody.data.attributes.subjects.push(subject)
              } else {
                postBody.data.attributes.subjects.push(subjects[i])
              }
            }
          }
        }
      }

      sails.log.verbose("DOI post body")
      sails.log.verbose(JSON.stringify(postBody))

      let postBodyValidateError = []

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
        let dates = postBody.data.attributes.dates
        for (var i = 0; i < _.size(dates); i++) {
          let date = DateTime.fromJSDate(new Date(dates[i].date)).toFormat('yyyy-LL-dd')
          if (!DateTime.fromFormat(date, 'yyyy-LL-dd', { zone: 'utc' }).isValid) {
            postBodyValidateError.push('date-invalid')
          }
        }
      }

      if (_.isEmpty(postBody.data.attributes.types.resourceTypeGeneral)) {
        postBodyValidateError.push('general-resource-type-required')
      }

      if (action == 'update' && _.isEmpty(record.metadata.citation_doi)) {
        postBodyValidateError.push('doi-required')
      }

      if (action == 'update' && !_.isEmpty(record.metadata.citation_doi) && record.metadata.citation_doi.indexOf(doiPrefix) != 0) {
        sails.log.warn(`The citation DOI ${record.metadata.citation_doi} does not begin with the correct prefix ${doiPrefix}. Will not attempt to update`)
        return null;
      }

      if (!_.isEmpty(postBodyValidateError)) {
        let errors = [TranslationService.t('datacite-validation-error')]
        for (var i = 0; i < _.size(postBodyValidateError); i++) {
          errors.push(TranslationService.t(postBodyValidateError[i]))
        }

        let errorMessage = errors
        let customError: RBValidationError = new RBValidationError(errorMessage)
        sails.log.error(customError)
        throw customError
        return false
      }
      let doi = null

      if (action == 'update') {
        doi = await this.makeUpdateDoiCall(instance, postBody, record.metadata.citation_doi)
      }
      else {
        doi = await this.makeCreateDoiCall(instance, postBody, record, oid)
      }
      return doi;
    }

    getAuthenticationString() {
      let username = sails.config.datacite.username;
      let password = sails.config.datacite.password;
      let authenticationString = `${username}:${password}`;
      let buff = Buffer.from(authenticationString);
      return buff.toString('base64');
    }

    public async publishDoiTrigger(oid, record, options): Promise<any> {

      if (this.metTriggerCondition(oid, record, options) === "true") {
        const brand:BrandingModel = BrandingService.getBrand('default');
        let doi = await this.publishDoi(oid, record);

        if (doi != null) {
          record = this.addDoiDataToRecord(oid, record, doi)
          RecordsService.updateMeta(brand, oid, record).then(response => { });
        }
      }

      return of(null);
    }

    public async publishDoiTriggerSync(oid, record, options): Promise<any> {

      if (this.metTriggerCondition(oid, record, options) === "true") {
        let doi = await this.publishDoi(oid, record, options["event"]);

        if (doi != null) {
          record = this.addDoiDataToRecord(oid, record, doi)
        }
        return record;
      }
      return record;
    }

    public async updateDoiTriggerSync(oid, record, options): Promise<any> {

      let doi = null
      if (this.metTriggerCondition(oid, record, options) === "true") {
        doi = await this.publishDoi(oid, record, options["event"], 'update');
      }
      return record
    }

    addDoiDataToRecord(oid: any, record: any, doi: any) {
      let lodashTemplateContext = {
        record: record,
        oid: oid,
        moment: moment
      };

      let citationUrlProperty = sails.config.datacite.citationUrlProperty;
      let citationDoiProperty = sails.config.datacite.citationDoiProperty;
      let generatedCitationStringProperty = sails.config.datacite.generatedCitationStringProperty;
      let citationStringTemplate = sails.config.datacite.citationStringTemplate;

      let generatedCitation = this.runTemplate(citationStringTemplate, {
        data: record,
        moment: moment
      });
      let url = this.runTemplate(sails.config.datacite.mappings.url, lodashTemplateContext);
      _.set(record, citationUrlProperty, url);
      _.set(record, citationDoiProperty, doi);
      _.set(record, generatedCitationStringProperty, generatedCitation);

      return record;
    }

    //TODO: This method will be deprecated soon and moved to its own run template service so it can be reused in 
    //      which will allow to standardise config structure in all places were object mappings are needed
    protected runTemplate(template: string, variables) {
      if (template && template.indexOf('<%') != -1) {
        return _.template(template)(variables);
      }
      return _.get(variables,template);
    }
  }
}

module.exports = new Services.Doi().exports();