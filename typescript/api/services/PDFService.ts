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
import services = require('../core/CoreService.js');
import { Sails, Model } from "sails";
import { launch } from 'puppeteer';
import fs = require('fs');
import moment from 'moment-es6';


declare var sails: Sails;
declare var RecordType: Model;
declare var _this;
declare var User;
declare var RecordsService;
declare var UsersService;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class PDF extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'createPDF'
    ];

    private async createBrowser() {
      sails.pdfService.browser = await launch({ headless: true, args: ['--no-sandbox'] });
      sails.pdfService.browser.on("disconnected", this.createBrowser);
    }

    private async generatePDF(oid: string, record: any, options: any) {
      const page = await sails.pdfService.browser.newPage();
      const userName = options['user']? options['user'] : "admin";
      const user = await UsersService.getUserWithUsername(userName).toPromise();

      page.setExtraHTTPHeaders({
        Authorization: 'Bearer '+ user['token']
      });
      //TODO: get branding name from record
      let currentURL = `${sails.config.appUrl}/default/rdmp/record/view/${oid}`;
      page
        .waitForSelector(options['waitForSelector'], { timeout: 60000 })
        .then(async () => {
          await this.delay(1500);
          const date = moment().format('x');
          const pdfPrefix = options['pdfPrefix']
          const fileId = `${pdfPrefix}-${oid}-${date}.pdf`
          const fpath = `${sails.config.record.attachments.stageDir}/${fileId}`;
          let defaultPDFOptions = {
            path: fpath,
            format: 'A4',
            printBackground: true
          };
          if (options['PDFOptions']) {
            // We don't want the file path to be overriden
            delete options['PDFOptions']['path'];
            defaultPDFOptions = _.merge(defaultPDFOptions, options['PDFOptions']);
          }
          await page.pdf(defaultPDFOptions);
          sails.log.debug(`Generated PDF at ${sails.config.record.attachments.stageDir}/${fileId} `);
          await page.close();
          Observable.fromPromise(RecordsService.addDatastream(oid, fileId)).subscribe(response => {
            sails.log.debug("Saved PDF to storage");
          });

        });
      sails.log.debug("Chromium loading page");
      await page.goto(currentURL);
      sails.log.debug("Chromium loading");

    }

    public createPDF(oid, record, options) {
      sails.log.error("Creating PDF");

      if (!sails.pdfService || !sails.pdfService.browser) {
        sails.pdfService = {};
        let browserPromise = this.createBrowser();
        browserPromise.then(async () => { this.generatePDF(oid, record, options); })
      } else {
        this.generatePDF(oid, record, options);
      }

      return Observable.of({});
    }

    private delay(time) {
      return new Promise(function(resolve) {
        setTimeout(resolve, time)
      });
    }

  }

}
module.exports = new Services.PDF().exports();
