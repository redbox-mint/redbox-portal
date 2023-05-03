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
  Observable
} from 'rxjs/Rx';
import {SearchService, Services as services}   from '@researchdatabox/redbox-core-types';

import {
  Sails,
  Model
} from "sails";
import { ReportDto } from '@researchdatabox/sails-ng-common';

declare var sails: Sails;
declare var Report: Model;
declare var _this;
declare var _;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Reports extends services.Core.Service {

    searchService: SearchService;

    protected _exportedMethods: any = [
      'bootstrap',
      'create',
      'findAllReportsForBrand',
      'get',
      'getResults',
      'getCSVResult',
      'getReportDto'
    ];

    public bootstrap = (defBrand) => {
      return super.getObservable(Report.find({
        branding: defBrand.id
      })).flatMap(reports => {
        if (_.isEmpty(reports)) {
          var rTypes = [];
          sails.log.verbose("Bootstrapping report definitions... ");
          _.forOwn(sails.config.reports, (config, report) => {
            var obs = this.create(defBrand, report, config);
            obs.subscribe(repProcessed => { })
            rTypes.push(obs);
          });
          return Observable.from(rTypes);

        } else {

          var rTypes = [];
          _.each(reports, function (report) {
            rTypes.push(Observable.of(report));
          });
          sails.log.verbose("Default reports definition(s) exist.");
          return Observable.from(rTypes);
        }
      })
        .last();
    }

    public findAllReportsForBrand(brand) {
      return super.getObservable(Report.find({
        branding: brand.id
      }));
    }

    public async get(brand, name) {
      return await Report.findOne({
        key: brand.id + "_" + name
      })
    }

    public create(brand, name, config) {
      return super.getObservable(Report.create({
        name: name,
        branding: brand.id,
        solr_query: config.solr_query,
        title: config.title,
        filter: config.filter,
        columns: config.columns
      }));
    }

    private buildSolrParams(brand, req, report, start, rows, format) {
      var params = this.getQueryValue(report);
      params = this.addPaginationParams(params, start, rows);
      params = params + `&fq=metaMetadata_brandId:${brand.id}&wt=${format}`;

      if (report.filter != null) {
        var filterQuery = ""
        for (let filter of report.filter) {
          if (filter.type == 'date-range') {
            let paramName = filter.paramName;
            var fromDate = req.param(paramName + "_fromDate");
            var toDate = req.param(paramName + "_toDate");
            var searchProperty = filter.property;
            filterQuery = filterQuery + "&fq=" + searchProperty + ":[";
            filterQuery = filterQuery + (fromDate == null ? "*" : fromDate);
            filterQuery = filterQuery + " TO ";
            filterQuery = filterQuery + (toDate == null ? "NOW" : toDate) + "]";
          }
          if (filter.type == 'text') {
            let paramName = filter.paramName;
            let value = req.param(paramName)
            if (!_.isEmpty(value)) {
              let searchProperty = filter.property;
              filterQuery = filterQuery + "&fq=" + searchProperty + ":"
              filterQuery = filterQuery + value + "*"
            }
          }
        }
        params = params + filterQuery;
      }

      return params;
    }

    public getResults(brand, name = '', req, start = 0, rows = 10) {
      var reportObs = super.getObservable(Report.findOne({
        key: brand.id + "_" + name
      }));

      return reportObs.flatMap(report => {
        report = this.convertLegacyReport(report);

        var url = this.buildSolrParams(brand, req, report, start, rows, 'json');
        return Observable.fromPromise(this.getSearchService().searchAdvanced(url));
      });
    }

    private getSearchService() {
      return sails.services[sails.config.search.serviceName];
    }

    private convertLegacyReport(report) {
      if (!_.isArray(report["filter"])) {
        let filterArray: object[] = []
        if (report["filter"] != null) {
          report["filter"]["paramName"] = "dateRange"
          filterArray.push(report["filter"])
        }
        report["filter"] = filterArray;
      }
      return report;
    }
    public getCSVResult(brand, name = '', req, start = 0, rows = 1000000000) {

      var reportObs = super.getObservable(Report.findOne({
        key: brand.id + "_" + name
      }));

      return reportObs.flatMap(report => {
        report = this.convertLegacyReport(report);
        sails.log.debug(report)
        // TODO: Ensure we get all results in a tidier way
        //       Stream the resultset rather than load it in-memory
        var url = this.buildSolrParams(brand, req, report, start, rows, 'csv');
        return Observable.fromPromise(this.getSearchService().searchAdvanced(url));
      });
    }

    protected getQueryValue(report) {
      let query = `${report.solr_query}&sort=date_object_modified desc&version=2.2&fl=`
      for (var i = 0; i < report.columns.length; i++) {
        var column = report.columns[i];
        query = query + column.property;
        if (i != report.columns.length - 1) {
          query = query + ","
        }
      }
      return query;
    }

    protected addPaginationParams(params, start = 0, rows) {
      params = params + "&start=" + start + "&rows=" + rows;
      return params;
    }

    public getReportDto(reportModel: Model): ReportDto {
      return this.convertToType<ReportDto>(reportModel, new ReportDto(), {
        "solr_query": "solrQuery"
      }, true); 
    }

  }
}
module.exports = new Services.Reports().exports();