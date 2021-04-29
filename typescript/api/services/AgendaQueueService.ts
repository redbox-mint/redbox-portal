// Copyright (c) 2020 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

// Copyright (c) 2020 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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


import services = require('../core/CoreService.js');
import QueueService from '../core/QueueService.js';
import Agenda = require('agenda');
import {Sails, Model} from "sails";

declare var module;
declare var sails: Sails;
declare var User: Model;
declare var _;
declare var _this;

export module Services {
 /**
  * Service class for queuing using Agenda: https://github.com/agenda/agenda
  *
  */
 export class AgendaQueue extends services.Services.Core.Service implements QueueService {
      protected _exportedMethods: any = [
       'every',
       'schedule',
       'now',
       'sampleFunctionToDemonstrateHowToDefineAJobFunction'
      ];

      protected agenda: Agenda;

      constructor() {
        super();
        let that = this;
        sails.on('ready', function () {
          (async () => {
            await that.init();
          })();
        });
      }

      /**
       * Looks `sails.config.agendaQueue` to init and fill the jobs collection
       *
       * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
       * @return
       */
      protected async init() {
        // set the options for Agenda, see: https://github.com/agenda/agenda#configuring-an-agenda
        const agendaOpts = {};
        _.forOwn(sails.config.agendaQueue.options, (optionVal:any, optionName:string) => {
          this.setOptionIfDefined(agendaOpts, optionName, optionVal);
        });
        if (_.isEmpty(_.get(agendaOpts, 'db.address'))) {
          agendaOpts['mongo'] = User.getDatastore().manager;
        }
        this.agenda = new Agenda(agendaOpts);
        this.defineJobs(sails.config.agendaQueue.jobs);
        await this.agenda.start();
        // check for in-line job schedule
        _.each(sails.config.agendaQueue.jobs, (job) => {
          if (!_.isEmpty(job.schedule)) {
            const method = job.schedule.method;
            const intervalOrSchedule = job.schedule.intervalOrSchedule;
            const data = job.schedule.data;
            const opts = job.schedule.opts;
            if (method == 'now') {
              this.now(job.name, data)
            } else if (method == 'every') {
              this.every(job.name, intervalOrSchedule, data, opts);
            } else if (method == 'schedule') {
              this.schedule(job.name, intervalOrSchedule, data);
            } else {
              sails.log.error(`AgendaQueue:: incorrect job schedule definition, method not found:`);
              sails.log.error(JSON.stringify(job));
            }
          }
        });
      }

      /*
       define the jobs... structure is:
       [
        {
           name: "jobName",
           options: {}, // optional, see https://github.com/agenda/agenda#defining-job-processors
           fnName: "Fully qualified path to service function name", // e.g. "AgendaQueueService.sampleFunctionToDemonstrateHowToDefineAJobFunction"
           // optional, if you want to in-line schedule a job, based on https://github.com/agenda/agenda#creating-jobs
           schedule: {
             method: 'every',
             when: '1 minute',
             data: 'sample log string',
             // options: optional, see: https://github.com/agenda/agenda#repeateveryinterval-options
           }
        }
       ]
       */
      public defineJobs(jobs: any[]) {
        _.each(jobs, (job) => {
          const serviceFn = _.get(sails.services, job.fnName);
          if (_.isUndefined(serviceFn)) {
            sails.log.error(`AgendaQueue:: Job name: ${job.name}'s service function not found: ${job.fnName}`);
            sails.log.error(JSON.stringify(job));
          } else {
            if (_.isEmpty(job.options)) {
              this.agenda.define(job.name, serviceFn);
            } else {
              this.agenda.define(job.name, job.options, serviceFn);
            }
          }
        });
      }

      private setOptionIfDefined(agendaOpts, optionName, optionVal) {
        if (!_.isEmpty(optionVal)) {
          _.set(agendaOpts, optionName, optionVal);
        }
      }

      public async sampleFunctionToDemonstrateHowToDefineAJobFunction(job) {
        sails.log.info(`AgendaQueue:: sample function called by job: `);
        sails.log.info(JSON.stringify(job));
      }

      public every(jobName: string, interval: string, data: any = undefined, options: any = undefined) {
        this.agenda.every(interval, jobName, data, options);
      }

      public schedule(jobName: string, schedule: string, data: any = undefined) {
        this.agenda.schedule(schedule, jobName, data);
      }

      public now(jobName: string, data: any = undefined) {
        this.agenda.now(jobName, data);
      }
   }
}

module.exports = new Services.AgendaQueue().exports();
