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

//<reference path='./../../typings/loader.d.ts'/>
declare var module;
declare var sails;
import { Observable } from 'rxjs/Rx';
declare function require(name:string);
declare var AsynchsService, VocabService, BrandingService;
/**
 * Package that contains all Controllers.
 */
import controller = require('../../../typescript/controllers/CoreController.js');
export module Controllers {
  /**
   * Responsible for all things related to exporting anything
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   */
  export class Asynch extends controller.Controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
        'index',
        'start',
        'progress'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */
    public index(req, res) {
      return this.sendView(req, res, 'asynch/index');
    }

    public start(req, res) {
      const procId = req.param("procId");
      const forceHarvest = req.query.force == "true";
      const brand = BrandingService.getBrand(req.session.branding);
      const username = req.user.username;
      switch (procId) {
        case "load_grid":
          AsynchsService.start(brand.id, 'Load Institution Lookup data.', username)
          .subscribe(progress => {
            this.ajaxOk(req, res, null, {status: 'Starting', progressId: progress.id}, true);
            const progressId = progress.id;
            VocabService.loadCollection('grid', progressId, forceHarvest).subscribe(prog=> {
              console.log(`Asynch progress: `);
              console.log(prog);
            },
            error => {
              console.error(`Asynch Error: `);
              console.error(error);
              AsynchsService.finish(progressId, {id: progressId, status: 'errored', message: error.message}).subscribe(finish => {
                console.log(`Asynch error update completed.`);
              });
            });
            // // start the asynch process...
            // const context = {progressId: progress.id, asynchService: AsynchsService, vocabService: VocabService};
            // const subs = Observable.start(()=> {
            //   this.vocabService.loadCollection('grid', progressId).subscribe(prog=> {
            //     sails.log.verbose(`Asynch progress: `);
            //     sails.log.verbose(prog);
            //   },
            //   error => {
            //     sails.log.error(`Asynch Error: `);
            //     sails.log.error(error);
            //     this.asynchService.finish({id: this.progressId, status: 'errored'}).subscribe(finish => {
            //       sails.log.verbose(`Asynch record update completed.`);
            //     });
            //   },
            //   () => {
            //     sails.log.verbose(`Asynch completed:`);
            //     this.asynchService.finish({id: this.progressId}).subscribe(finish => {
            //       sails.log.verbose(`Asynch record update completed.`);
            //     });
            //   });
            // }, context, Scheduler.timeout);
            // subs.subscribe((x)=> {
            //   sails.log.verbose(`Starting asynch...`);
            // }, error => {
            //   sails.log.error(`Asynch process failed.`);
            // }, () => {
            //   sails.log.verbose(`Asynch wrapper completed.`);
            // });
          });
          break
        default:
          this.ajaxFail(req, res, null, {message: 'Invalid process id.'}, true);
          break
      }
    }

    public progress(req, res) {

    }
    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Asynch().exports();
