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

declare var BrandingService;
declare var RolesService;
declare var DashboardService;
declare var UsersService;
declare var FormsService;
declare var RecordTypesService;
declare var WorkflowStepsService;

declare var User;
/**
 * Package that contains all Controllers.
 */
import controller = require('../../../../typescript/controllers/CoreController.js');
export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Record extends controller.Controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'render',
      'create'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public render(req, res) {
      return this.sendView(req, res, 'dashboard');
    }


    public create(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var recordType = req.param('recordType');

      var body = req.body;
      if (body != null) {
        var authorizationEdit, authorizationView, authorizationEditPending, authorizationViewPending;
        if (body["authorization"] != null) {
          authorizationEdit = body["authorization"]["edit"];
          authorizationView = body["authorization"]["view"];
          authorizationEditPending = body["authorization"]["editPending"];
          authorizationViewPending = body["authorization"]["editPending"];
        } else {
          return res.status(400).json({ "message": "Request body requires an authorization block" })
        }
        var recordTypeObservable = RecordTypesService.get(brand, recordType);

        recordTypeObservable.subscribe(recordTypeModel => {

          sails.log.error(recordTypeModel);
          var metadata = body["metadata"];
          var workflowStage = body["workflowStage"];
          var request = {};
          var metaMetadata = {};
          metaMetadata["brandId"] = brand.id;
          metaMetadata["type"] = recordTypeModel.name;
          metaMetadata["createdBy"] = "admin";
          request["metaMetadata"] = metaMetadata;
          request["metadata"] = body["metadata"];
          
          // FormsService
          var workflowStepsObs = WorkflowStepsService.getAllForRecordType(recordTypeModel);

          workflowStepsObs.subscribe( workflowSteps => {
            _.each(workflowSteps, function(workflowStep) {
              sails.log.error(workflowStep)
              if(workflowStep.name == workflowStage) {
                metaMetadata["form"] = workflowStep.config.form;
              }

            });

            return res.json(request);

          });

        }

        );
        // var authorization = {};
        // authorization["edit"] =
      }


    }

  }



  /**
   **************************************************************************************************
   **************************************** Override magic methods **********************************
   **************************************************************************************************
   */
}
}

module.exports = new Controllers.Record().exports();
