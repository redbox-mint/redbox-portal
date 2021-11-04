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
      'deleteDoi'
    ];

    private async makeCreateDoiCall(instance, postBody, record, oid) {
      try {
        let response = await instance.post('/dois', postBody);
        if (response.status == 201) {
          let responseBody = response.data;
          let doi = responseBody.data.id
          sails.log.debug(`DOI created: ${doi}`)

          record.metadata.citation_doi = doi;

          record.metadata.citation_generated = this.runTemplate('<%= _.join(_.map(_.filter(_.get(data, "creators"), (c) => {return !_.isEmpty(c.family_name) || !_.isEmpty(c.given_name)}), (c)=> {return !_.isEmpty(c.family_name) || !_.isEmpty(c.given_name) ? ((c.family_name ? c.family_name : "") + ", " + (c.given_name ? c.given_name : "")) : "" }), "; ") + " ("+ moment(_.get(data, "citation_publication_date")).format("YYYY") + "): " + _.get(data, "citation_title") + ". " + _.get(data, "citation_publisher") + ". " + (_.get(data, "citation_doi", null) == null ? "{ID_WILL_BE_HERE}" : "https://doi.org/" + _.get(data, "citation_doi")) %>', {
            data: record,
            moment: moment
          });


          sails.log.debug(`DOI generated ${doi}`)

          return record;
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

      let url = this.runTemplate(sails.config.datacite.mappings.url, lodashTemplateContext)
      let publicationYear = this.runTemplate(sails.config.datacite.mappings.publicationYear, lodashTemplateContext);
      let title = this.runTemplate(sails.config.datacite.mappings.title, lodashTemplateContext);
      let publisher = this.runTemplate(sails.config.datacite.mappings.publisher, lodashTemplateContext);

      record.metadata[citationUrlProperty] = url;

      let postBody = {
        "data": {
          "type": "dois",
          "attributes": {
            event: event,
            "prefix": doiPrefix,
            titles: [{
              "lang": null,
              "title": title,
              "titleType": null
            }],
            publisher: publisher,
            publicationYear: publicationYear,
            url: url,
            creators: [],
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
          givenName: this.runTemplate(sails.config.datacite.mappings.creatorGivenName, creatorTemplateContext),
          familyName: this.runTemplate(sails.config.datacite.mappings.creatorFamilyName, creatorTemplateContext)
        }
        postBody.data.attributes.creators.push(citationCreator)
      }
      sails.log.verbose("DOI post body")
      sails.log.verbose(JSON.stringify(postBody));

      let doiRecord = await this.makeCreateDoiCall(instance, postBody, record, oid);
      return doiRecord;
    }
    getAuthenticationString() {
      let username = sails.config.datacite.username;
      let password = sails.config.datacite.password;
      let authenticationString = `${username}:${password}`;
      let buff = Buffer.from(authenticationString);
      return buff.toString('base64');
    }

    public publishDoiTrigger(oid, record, options): Observable < any > {

      if (this.metTriggerCondition(oid, record, options) === "true") {
        this.publishDoi(oid, record).then(doiRecord => {
          const brand = BrandingService.getBrand('default');

          RecordsService.updateMeta(brand, oid, doiRecord).then(response => {});
        });
      }

      return Observable.of(null);
    }

    public publishDoiTriggerSync(oid, record, options): Promise < any > {

      if (this.metTriggerCondition(oid, record, options) === "true") {
        return this.publishDoi(oid, record);


        
      }

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