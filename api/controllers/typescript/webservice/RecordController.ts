Copyright(c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
declare var RecordsService;

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
      'create',
      'updateMeta',
      'getMeta',
      'addUserEdit',
      'removeUserEdit',
      'addUserView',
      'removeUserView'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public addUserEdit(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var oid = req.param('oid');

      RecordsService.getMeta(oid).subscribe(record => {
        // if (!RecordsService.hasEditAccess(brand, req.user.name, req.user.roles, record)) {
        //   //TODO: Return security response once we have authorization implemented
        // }
        var body = req.body;
        var username = body["username"];
        if (username == null) {
          record["authorization"]["edit"].push(username);
        } else {
          var pendingUser = body["pendingUser"];
          record["authorization"]["editPending"].push(pendingUser);
        }

        var obs = RecordsService.updateMeta(brand, oid, record);
        obs.subscribe(result => {
          return res.json(result);
        });
      });
    }

    public addUserView(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var oid = req.param('oid');

      RecordsService.getMeta(oid).subscribe(record => {
        // if (!RecordsService.hasEditAccess(brand, req.user.name, req.user.roles, record)) {
        //   //TODO: Return security response once we have authorization implemented
        // }
        var body = req.body;
        var username = body["username"];
        if (username == null) {
          record["authorization"]["view"].push(username);
        } else {
          var pendingUser = body["pendingUser"];
          record["authorization"]["viewPending"].push(pendingUser);
        }

        var obs = RecordsService.updateMeta(brand, oid, record);
        obs.subscribe(result => {
          return res.json(result);
        });
      });
    }

    public removeUserEdit(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var oid = req.param('oid');

      RecordsService.getMeta(oid).subscribe(record => {
        // if (!RecordsService.hasEditAccess(brand, req.user.name, req.user.roles, record)) {
        //   //TODO: Return security response once we have authorization implemented
        // }
        var body = req.body;
        var username = body["username"];
        if (username == null) {
          var userIndex = record["authorization"]["edit"].indexOf(username);
          if (userIndex > -1) {
            record["authorization"]["edit"].splice(userIndex, 1)
          }
        } else {
          var pendingUser = body["pendingUser"];
          var userIndex = record["authorization"]["editPending"].indexOf(username);
          if (userIndex > -1) {
            record["authorization"]["editPending"].splice(userIndex, 1)
          }
        }

        var obs = RecordsService.updateMeta(brand, oid, record);
        obs.subscribe(result => {
          return res.json(result);
        });
      });
    }

    public removeUserView(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var oid = req.param('oid');

      RecordsService.getMeta(oid).subscribe(record => {
        // if (!RecordsService.hasEditAccess(brand, req.user.name, req.user.roles, record)) {
        //   //TODO: Return security response once we have authorization implemented
        // }
        var body = req.body;
        var username = body["username"];
        if (username == null) {
          var userIndex = record["authorization"]["view"].indexOf(username);
          if (userIndex > -1) {
            record["authorization"]["view"].splice(userIndex, 1)
          }
        } else {
          var pendingUser = body["pendingUser"];
          var userIndex = record["authorization"]["viewPending"].indexOf(username);
          if (userIndex > -1) {
            record["authorization"]["viewPending"].splice(userIndex, 1)
          }
        }

        var obs = RecordsService.updateMeta(brand, oid, record);
        obs.subscribe(result => {
          return res.json(result);
        });
      });
    }


    public getMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var oid = req.param('oid');

      RecordsService.getMeta(oid).subscribe(record => {
        // if (!RecordsService.hasEditAccess(brand, req.user.name, req.user.roles, record)) {
        //   //TODO: Return security response once we have authorization implemented
        // }

        return res.json(record["metadata"]);
      });
    }

    public updateMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var oid = req.param('oid');

      RecordsService.getMeta(oid).subscribe(record => {
        // if (!RecordsService.hasEditAccess(brand, req.user.name, req.user.roles, record)) {
        //   //TODO: Return security response once we have authorization implemented
        // }

        record["metadata"] = req.body;
        var obs = RecordsService.updateMeta(brand, oid, record);
        obs.subscribe(result => {
          return res.json(result);
        });

      });
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

          workflowStepsObs.subscribe(workflowSteps => {
            _.each(workflowSteps, function(workflowStep) {

              if (workflowStep["name"] == workflowStage) {
                request["workflow"] = workflowStep["config"]["workflow"];
                request["authorization"] = workflowStep["config"]["authorization"];
                request["authorization"]["view"] = body["authorization"]["view"];
                request["authorization"]["edit"] = body["authorization"]["edit"];
                request["authorization"]["viewPending"] = body["authorization"]["viewPending"];
                request["authorization"]["editPending"] = body["authorization"]["editPending"];
                metaMetadata["form"] = workflowStep["config"]["form"];
              }


            });
            var obs = RecordsService.create(brand, request);
            obs.subscribe(result => {
              return res.json(result);
            });

          });

        }

        );
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
