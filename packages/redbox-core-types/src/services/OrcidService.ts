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

import { of, from } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { Services as services } from '../CoreService';
// import * as request from "request-promise";
import axios from 'axios';

declare var sails: any;
declare var Report: any;
declare var _this: any;
declare var _: any;


export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Orcids extends services.Core.Service {

    protected override _exportedMethods: any = [
      'searchOrcid'
    ];

    public bootstrap = (defBrand: any) => {

    }

    public searchOrcid(givenNames: string, familyName: string, page: number) {
      const rows = 10;
      const start = (page - 1) * rows;
      const url = sails.config.orcid.url + '/v1.2/search/orcid-bio/?q=family-name:"' + familyName + '"%20AND%20given-names:"' + givenNames + '"&start=' + start + '&rows=' + rows;
      const options = this.getOptions(url, sails.config.record.api.search.method);
      const orcidRes = from(axios(options));

      return orcidRes.pipe(flatMap((response: any) => {
        const orcidResult: any = response.data;
        const results: Record<string, any> = {};
        results["numFound"] = orcidResult["orcid-search-results"]["num-found"];
        results["items"] = [];

        for (let i = 0; i < orcidResult["orcid-search-results"]["orcid-search-result"].length; i++) {
          const orcidSearchResult = orcidResult["orcid-search-results"]["orcid-search-result"][i];
          const item = this.mapToPeopleSearchResult(orcidSearchResult);
          results["items"].push(item);
        }
        return of(results);
      }));
    }

    protected mapToPeopleSearchResult(orcidSearchResult: any) {
      const item: Record<string, any> = {};

      const profile = orcidSearchResult["orcid-profile"];
      item["givenNames"] = profile["orcid-bio"]["personal-details"]["given-names"]["value"];
      item["familyName"] = profile["orcid-bio"]["personal-details"]["family-name"]["value"];
      item["identifier"] = profile["orcid-identifier"]["uri"];
      item["extendedAttributes"] = [];

      // Process extended attributes
      let otherNames: Record<string, unknown> | null = profile["orcid-bio"]["personal-details"]["other-names"] == null ? null : {};
      if (otherNames != null) {

        const otherNamesArray = profile["orcid-bio"]["personal-details"]["other-names"]["other-name"];

        otherNames = this.getExtendedAttributeObject('orcid-other-names', otherNamesArray);
        item["extendedAttributes"].push(otherNames);
      }

      let biography: Record<string, unknown> | null = profile["orcid-bio"]["biography"] == null ? null : {};
      if (biography != null) {

        const biographyValue = profile["orcid-bio"]["biography"];

        biography = this.getExtendedAttributeObject('orcid-biography', biographyValue);
        item["extendedAttributes"].push(biography);
      }


      let researcherUrls: Record<string, any> | null = profile["orcid-bio"]["researcher-urls"] == null ? null : {};
      if (researcherUrls != null) {
        const researcherUrlsValueArray: any[] = [];
        const researcherUrlsArray = profile["orcid-bio"]["researcher-urls"]["researcher-url"];

        _.forEach(researcherUrlsArray, function (researcherUrl: any) {
            const researcherUrlItem: Record<string, unknown> = {};
            researcherUrlItem["value"] = researcherUrl["url-name"]["value"];
            researcherUrlItem["url"] = researcherUrl["url"]["value"];
            researcherUrlsValueArray.push(researcherUrlItem);
        });

        researcherUrls = this.getExtendedAttributeObject('orcid-researcher-urls', researcherUrlsValueArray);
        researcherUrls["displayAsLinks"] = true;
        item["extendedAttributes"].push(researcherUrls);
      }

      let keywords: Record<string, unknown> | null = profile["orcid-bio"]["keywords"] == null ? null : {};
      if (keywords != null) {
        const keywordsArray = profile["orcid-bio"]["keywords"]["keyword"];

        keywords = this.getExtendedAttributeObject('orcid-keywords', keywordsArray);
        item["extendedAttributes"].push(keywords);
      }



      return item;
    }

    private getExtendedAttributeObject(label: string, value: any) {
      const extendedAttributes: Record<string, unknown> = {};
      extendedAttributes["label"] = label;
      extendedAttributes["value"] = value;
      return extendedAttributes;
    }

    protected getOptions(url: string, method: string, contentType = 'application/json; charset=utf-8') {
       const opts = {
          method: method,
          url: url, 
          headers: { 'Content-Type': contentType } 
        };
       return opts;
    }


  }

}

declare global {
  let OrcidService: Services.Orcids;
}
