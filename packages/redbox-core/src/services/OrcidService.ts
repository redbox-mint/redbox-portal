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
import axios, { type AxiosResponse } from 'axios';



export namespace Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Orcids extends services.Core.Service {

    protected override _exportedMethods: string[] = [
      'searchOrcid'
    ];

    public bootstrap = (_defBrand: unknown) => {

    }

    public searchOrcid(givenNames: string, familyName: string, page: number) {
      const rows = 10;
      const start = (page - 1) * rows;
      const url = sails.config.orcid.url + '/v1.2/search/orcid-bio/?q=family-name:"' + familyName + '"%20AND%20given-names:"' + givenNames + '"&start=' + start + '&rows=' + rows;
      const options = this.getOptions(url, sails.config.record.api.search.method);
      const orcidRes = from(axios(options));

      return orcidRes.pipe(flatMap((response: AxiosResponse<Record<string, unknown>>) => {
        const orcidResult = response.data as Record<string, unknown>;
        const searchResults = _.get(orcidResult, "orcid-search-results", {}) as Record<string, unknown>;
        const searchResultList = (_.get(searchResults, "orcid-search-result", []) as Record<string, unknown>[]) || [];
        const results: { numFound: number; items: Record<string, unknown>[] } = {
          numFound: _.toNumber(_.get(searchResults, "num-found", 0)),
          items: []
        };

        for (let i = 0; i < searchResultList.length; i++) {
          const orcidSearchResult = searchResultList[i];
          const item = this.mapToPeopleSearchResult(orcidSearchResult);
          results.items.push(item);
        }
        return of(results);
      }));
    }

    protected mapToPeopleSearchResult(orcidSearchResult: Record<string, unknown>) {
      const item: Record<string, unknown> = {};

      const profile = ((orcidSearchResult as Record<string, unknown>)["orcid-profile"] ?? {}) as Record<string, unknown>;
      item["givenNames"] = _.get(profile, "orcid-bio.personal-details.given-names.value");
      item["familyName"] = _.get(profile, "orcid-bio.personal-details.family-name.value");
      item["identifier"] = _.get(profile, "orcid-identifier.uri");
      const extendedAttributes: Record<string, unknown>[] = [];
      item["extendedAttributes"] = extendedAttributes;

      // Process extended attributes
      let otherNames: Record<string, unknown> | null = _.get(profile, "orcid-bio.personal-details.other-names") == null ? null : {};
      if (otherNames != null) {

        const otherNamesArray = _.get(profile, "orcid-bio.personal-details.other-names.other-name");

        otherNames = this.getExtendedAttributeObject('orcid-other-names', otherNamesArray);
        extendedAttributes.push(otherNames);
      }

      let biography: Record<string, unknown> | null = _.get(profile, "orcid-bio.biography") == null ? null : {};
      if (biography != null) {

        const biographyValue = _.get(profile, "orcid-bio.biography");

        biography = this.getExtendedAttributeObject('orcid-biography', biographyValue);
        extendedAttributes.push(biography);
      }


      let researcherUrls: Record<string, unknown> | null = _.get(profile, "orcid-bio.researcher-urls") == null ? null : {};
      if (researcherUrls != null) {
        const researcherUrlsValueArray: Record<string, unknown>[] = [];
        const researcherUrlsArray = _.get(profile, "orcid-bio.researcher-urls.researcher-url") as Record<string, unknown>[];

        _.forEach(researcherUrlsArray, function (researcherUrl: Record<string, unknown>) {
          const researcherUrlItem: Record<string, unknown> = {};
          researcherUrlItem["value"] = _.get(researcherUrl, "url-name.value");
          researcherUrlItem["url"] = _.get(researcherUrl, "url.value");
          researcherUrlsValueArray.push(researcherUrlItem);
        });

        researcherUrls = this.getExtendedAttributeObject('orcid-researcher-urls', researcherUrlsValueArray);
        researcherUrls["displayAsLinks"] = true;
        extendedAttributes.push(researcherUrls);
      }

      let keywords: Record<string, unknown> | null = _.get(profile, "orcid-bio.keywords") == null ? null : {};
      if (keywords != null) {
        const keywordsArray = _.get(profile, "orcid-bio.keywords.keyword");

        keywords = this.getExtendedAttributeObject('orcid-keywords', keywordsArray);
        extendedAttributes.push(keywords);
      }



      return item;
    }

    private getExtendedAttributeObject(label: string, value: unknown) {
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
