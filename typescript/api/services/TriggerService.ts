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
import { RedboxToCkan } from "redbox2ckan"

declare var sails: Sails;
declare var RecordType: Model;
declare var _this;
declare var User;
declare var RecordsService;

export module Services {
  /**
   * Trigger related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Trigger extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'transitionWorkflow'
    ];

    public transitionWorkflow(record, options) {
      const triggerCondition = _.get(options, "triggerCondition", "");
      
      var variables= {};
      variables['imports'] = record;
      var compiled = _.template(triggerCondition, variables);

      if(compiled() == "true") {
        const workflowStageTarget = _.get(options, "targetWorkflowStageName", record.workflow.stage);
        const workflowStageLabel = _.get(options, "targetWorkflowStageLabel", record.workflow.stageLabel);
        _.set(record,"workflow.stage",workflowStageTarget);
        _.set(record,"workflow.stageLabel",workflowStageLabel);
      }

      return Observable.of(record);
    }

  }
}
module.exports = new Services.Trigger().exports();
