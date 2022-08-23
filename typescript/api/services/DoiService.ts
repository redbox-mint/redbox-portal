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
  Observable
} from 'rxjs/Rx';
import {
  Services as services
} from '@researchdatabox/redbox-core-types';
import {
  Sails,
  Model
} from "sails";
import 'rxjs/add/operator/toPromise';
import * as moment from 'moment';
import axios from 'axios';


declare var sails: Sails;
declare var RecordsService;
declare var BrandingService;
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
          sails.log.error("Unexpected response from DataCite API")
          sails.log.error(response)
        }

      } catch (err) {
        sails.log.error("Unexpected response from DataCite API")
        sails.log.error(err)
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
          sails.log.error("Unexpected response from DataCite API")
          sails.log.error(response)
        }

      } catch (err) {
        sails.log.error("Unexpected response from DataCite API")
        sails.log.error(err)
      }

      return false;
    }
    public async changeDoiState(doi: string, event: string) {
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
        let putBody = {
          "data": {
            "type": "dois",
            "attributes": {
              "event": event
            }
          }
        }

        let response = await instance.put(`/dois/${doi}`, putBody);
        if (response.status == 200) {
          return true;
        } else {
          sails.log.error("Unexpected response from DataCite API")
          sails.log.error(response)
        }

      } catch (err) {
        sails.log.error("Unexpected response from DataCite API")
        sails.log.error(err)
      }

      return false;
    }

    public async publishDoi(oid, record, event = 'publish') {

      let doiPrefix = sails.config.datacite.doiPrefix;
      let baseUrl = sails.config.datacite.baseUrl;

      let citationUrlProperty = sails.config.datacite.citationUrlProperty;
      let creatorsProperty = sails.config.datacite.creatorsProperty;
      let authenticationStringEncoded = this.getAuthenticationString();
      let lodashTemplateContext = {
        record: record,
        oid: oid,
        moment: moment
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
      let publicationYear = this.runTemplate(mappings.publicationYear, lodashTemplateContext);
      let title = this.runTemplate(mappings.title, lodashTemplateContext);
      let publisher = this.runTemplate(mappings.publisher, lodashTemplateContext);

      let postBody = {
        "data": {
          "type": "dois",
          "attributes": {
            "event": event,
            "prefix": doiPrefix,
            "titles": [{
              "lang": null,
              "title": title,
              "titleType": null
            }],
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
      let creatorTemplateContext = _.clone(lodashTemplateContext);
      for (let creator of record.metadata[creatorsProperty]) {

        creatorTemplateContext['creator'] = creator;

        let citationCreator = {
          nameType: "Personal",
          givenName: this.runTemplate(mappings.creatorGivenName, creatorTemplateContext),
          familyName: this.runTemplate(mappings.creatorFamilyName, creatorTemplateContext)
        }
        postBody.data.attributes.creators.push(citationCreator)
      }
      let dates = mappings.dates

      if(!_.isEmpty(dates) && _.isArray(dates)){
        for (var i = 0; i < dates.length; i++ ) {
          let oDate = dates[i]
          let aDate = this.runTemplate(oDate.template, lodashTemplateContext)
          if(!_.isEmpty(aDate)) {
            postBody.data.attributes.dates.push({"date": aDate, "dateType": oDate.dateType, "dateInformation": oDate.dateInformation})
          }
        }
      }

      let descriptions = mappings.descriptions

      if(!_.isEmpty(descriptions) && _.isArray(descriptions)){
        for (var i = 0; i < descriptions.length; i++ ) {
          let description = descriptions[i]
          let descriptionType = description.descriptionType
          let aDescription = this.runTemplate(description.template, lodashTemplateContext)
          if(!_.isEmpty(aDescription)) {
            postBody.data.attributes.descriptions.push({"descriptionType": descriptionType, "description": aDescription})
          }
        }
      }

      let rightsList = mappings.rightsList

      if(!_.isEmpty(rightsList) && _.isArray(rightsList)){
        for (var i = 0; i < rightsList.length; i++ ) {
          let rights = rightsList[i]
          let key = rights.key
          let value = this.runTemplate(rights.template, lodashTemplateContext)
          if(!_.isEmpty(value)) {
            postBody.data.attributes.rightsList.push({[key]: value})
          }
        }
      }


      let allSizes = this.runTemplate(mappings.sizes, lodashTemplateContext)

      if(!_.isEmpty(allSizes)){
        let sizes = _.split(allSizes, ',')
        for (var i = 0; i < sizes.length; i++ ) {
          postBody.data.attributes.sizes.push(sizes[i])
        }
      }

      let allIdentifiers = this.runTemplate(mappings.identifiers, lodashTemplateContext)

      if(!_.isEmpty(allIdentifiers)){
        let identifiers = _.split(allIdentifiers, ',')
        for (var i = 0; i < identifiers.length; i++ ) {
          let identifier = {"identifier": identifiers[i], "identifierType": "Other"}
          postBody.data.attributes.identifiers.push(identifier)
        }
      }

      let allSubjects = this.runTemplate(mappings.subjects, lodashTemplateContext)

      if(!_.isEmpty(allSubjects)){
        let subjects = _.split(allSubjects, ',')
        for (var i = 0; i < subjects.length; i++ ) {
          let subject = {"subject": subjects[i]}
          postBody.data.attributes.subjects.push(subject)
        }
      }

      sails.log.verbose("DOI post body")
      sails.log.verbose(JSON.stringify(postBody))

      let doi = await this.makeCreateDoiCall(instance, postBody, record, oid)
      return doi;

    }

    getAuthenticationString() {
      let username = sails.config.datacite.username;
      let password = sails.config.datacite.password;
      let authenticationString = `${username}:${password}`;
      let buff = Buffer.from(authenticationString);
      return buff.toString('base64');
    }

    public async publishDoiTrigger(oid, record, options): Promise < any > {

      if (this.metTriggerCondition(oid, record, options) === "true") {
          const brand = BrandingService.getBrand('default');
          let doi = await this.publishDoi(oid, record);

        record = this.addDoiDataToRecord(oid, record, doi)
        RecordsService.updateMeta(brand, oid, record).then(response => {});

      }

      return Observable.of(null);
    }

    public async publishDoiTriggerSync(oid, record, options): Promise < any > {

      if (this.metTriggerCondition(oid, record, options) === "true") {
        let doi = await this.publishDoi(oid, record, options["event"]);

        record = this.addDoiDataToRecord(oid, record, doi)

        return record;
      }
      return record;
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

    protected runTemplate(template: string, variables) {
      if (template && template.indexOf('<%') != -1) {
        return _.template(template)(variables);
      }
      return _.get(template, variables);
    }
  }
}

module.exports = new Services.Doi().exports();