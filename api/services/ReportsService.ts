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

import { Observable } from 'rxjs/Rx';
import services = require('../../typescript/services/CoreService.js');
import { Sails, Model } from "sails";
import * as request from "request-promise";

declare var sails: Sails;
declare var Report: Model;
declare var _this;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   *
   */
  export class Reports extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'create',
      'findAllReportsForBrand',
      'get',
      'getResults',
      'getCSVResult',
    ];

    public bootstrap = (defBrand) => {
      return super.getObservable(Report.find({ branding: defBrand.id })).flatMap(reports => {
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
          _.each(reports, function(report) {
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

    public get(brand, name) {
      return super.getObservable(Report.findOne({
        key: brand.id + "_" + name
      }));
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

    public getResults(brand, name='', start = 0, rows = 10) {

      var reportObs = super.getObservable(Report.findOne({
        key: brand.id + "_" + name
      }));

      return reportObs.flatMap(report => {
        var url = this.addQueryParams(sails.config.record.api.search.url, report);
        url = this.addPaginationParams(url, start, rows);
        url = url + "&fq=metaMetadata_brandId:" + brand.id + "&wt=json";
        var options = this.getOptions(url);
        return Observable.fromPromise(request[sails.config.record.api.search.method](options));
      });
    }

    public getCSVResult(brand, name = '', start = 0, rows = 10) {

      var reportObs = super.getObservable(Report.findOne({
        key: brand.id + "_" + name
      }));

      return reportObs.flatMap(report => {
        var url = this.addQueryParams(sails.config.record.api.search.url, report);
        //TODO: Ensure we get all results in a tidier way
        url = this.addPaginationParams(url, start, 1000000000);
        url = url + "&fq=metaMetadata_brandId:" + brand.id + "&wt=csv";
        var options = this.getOptions(url, 'text/csv');
        return Observable.fromPromise(request[sails.config.record.api.search.method](options));
      });
    }

    protected addQueryParams(url, report) {
      url = url + "?q=" + report.solr_query + "&sort=date_object_modified desc&version=2.2&fl="
      for (var i = 0; i < report.columns.length; i++) {
        var column = report.columns[i];
        url = url + column.property;
        if (i != report.columns.length - 1) {
          url = url + ","
        }
      }
      return url;
    }

    protected addPaginationParams(url, start=0, rows) {
      url = url + "&start=" + start + "&rows=" + rows;
      return url;
    }

    protected getOptions(url, contentType = 'application/json; charset=utf-8') {
      return { url: url, json: true, headers: { 'Authorization': `Bearer ${sails.config.redbox.apiKey}`, 'Content-Type':  contentType} };
    }


  }

}
}
module.exports = new Services.Reports().exports();
