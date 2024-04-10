// Copyright(c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
declare var Record;
declare var _;
declare var User;
/**
 * Package that contains all Controllers.
 */
import { Observable } from 'rxjs/Rx';
import * as path from "path";
import {
  APIErrorResponse,
  APIHarvestResponse,
  Controllers as controllers,
  Datastream,
  DatastreamService,
  DatastreamServiceResponse,
  RBValidationError,
  RecordsService,
  SearchService
} from '@researchdatabox/redbox-core-types';
import { ListAPIResponse } from '@researchdatabox/redbox-core-types';



import { v4 as UUIDGenerator } from 'uuid';
export module Controllers {
  /**
   * RecordController API version
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class RecordWeb extends controllers.Core.Controller {

    RecordsService: RecordsService = sails.services.recordsservice;
    SearchService: SearchService;
    DatastreamService: DatastreamService;
    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'create',
      'updateMeta',
      'updateObjectMeta',
      'getMeta',
      'getRecordAudit',
      'getObjectMeta',
      'addUserEdit',
      'removeUserEdit',
      'addUserView',
      'removeUserView',
      'getPermissions',
      'getDataStream',
      'addDataStreams',
      'listRecords',
      'listDeletedRecords',
      'deleteRecord',
      'destroyDeletedRecord',
      'restoreRecord',
      'transitionWorkflow',
      'listDatastreams',
      'addRoleEdit',
      'removeRoleEdit',
      'addRoleView',
      'removeRoleView',
      'harvest'
    ];

    constructor() {
      super();
      let that = this;
      sails.after(['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'], function () {
        let datastreamServiceName = sails.config.record.datastreamService;
        sails.log.verbose(`RecordController Webservice ready, using datastream service: ${datastreamServiceName}`);
        if (datastreamServiceName != undefined) {
          that.DatastreamService = sails.services[datastreamServiceName];
        }
      });
    }

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public getPermissions(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');

      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {
        return res.json(record["authorization"]);
      });

    }

    public addUserEdit(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var oid = req.param('oid');
      var body = req.body;
      var users = body["users"];
      var pendingUsers = body["pendingUsers"];
      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {

        if (users != null && users.length > 0) {
          record["authorization"]["edit"] = _.union(record["authorization"]["edit"], users);

        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record["authorization"]["editPending"] = _.union(record["authorization"]["editPending"], pendingUsers);
        }

        var obs = Observable.fromPromise(this.RecordsService.updateMeta(brand, oid, record, req.user));
        obs.subscribe(result => {
          if (result.isSuccessful()) {
            Observable.fromPromise(this.RecordsService.getMeta(result.oid)).subscribe(record => {
              return res.json(record["authorization"]);
            }, error => {
              sails.log.error(error);
              return this.apiFail(req, res, 500, new APIErrorResponse('Failed adding an editor, check server logs.'));
            });
          } else {
            return res.json(result);
          }
        }, error => {
          sails.log.error(error);
          return this.apiFail(req, res, 500, new APIErrorResponse('Failed adding an editor, check server logs.'));
        });
      });
    }

    public addUserView(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var oid = req.param('oid');
      var body = req.body;
      var users = body["users"];
      var pendingUsers = body["pendingUsers"];
      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {

        if (users != null && users.length > 0) {
          record["authorization"]["view"] = _.union(record["authorization"]["view"], users);

        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record["authorization"]["viewPending"] = _.union(record["authorization"]["viewPending"], pendingUsers);
        }

        var obs = Observable.fromPromise(this.RecordsService.updateMeta(brand, oid, record, req.user));
        obs.subscribe(result => {
          if (result.isSuccessful()) {
            Observable.fromPromise(this.RecordsService.getMeta(result["oid"])).subscribe(record => {
              return res.json(record["authorization"]);
            });
          } else {
            return res.json(result);
          }
        });
      });
    }

    public removeUserEdit(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');

      var body = req.body;
      var users = body["users"];
      var pendingUsers = body["pendingUsers"];
      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {

        if (users != null && users.length > 0) {
          record["authorization"]["edit"] = _.difference(record["authorization"]["edit"], users);
        }

        if (pendingUsers != null && pendingUsers.length > 0) {
          record["authorization"]["editPending"] = _.difference(record["authorization"]["editPending"], pendingUsers);
        }

        var obs = Observable.fromPromise(this.RecordsService.updateMeta(brand, oid, record, req.user));
        obs.subscribe(result => {
          if (result.isSuccessful()) {
            Observable.fromPromise(this.RecordsService.getMeta(result["oid"])).subscribe(record => {
              return res.json(record["authorization"]);
            });
          } else {
            return res.json(result);
          }
        });
      });
    }

    public removeUserView(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');

      var body = req.body;
      var users = body["users"];
      var pendingUsers = body["pendingUsers"];
      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {

        if (users != null && users.length > 0) {
          record["authorization"]["view"] = _.difference(record["authorization"]["view"], users);
        }

        if (pendingUsers != null && pendingUsers.length > 0) {
          record["authorization"]["viewPending"] = _.difference(record["authorization"]["viewPending"], pendingUsers);
        }

        var obs = Observable.fromPromise(this.RecordsService.updateMeta(brand, oid, record, req.user));
        obs.subscribe(result => {
          if (result.isSuccessful()) {
            Observable.fromPromise(this.RecordsService.getMeta(result["oid"])).subscribe(record => {
              return res.json(record["authorization"]);
            });
          } else {
            return res.json(result);
          }
        });
      });
    }


    public getMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');

      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {
        if (_.isEmpty(record)) {
          return Observable.throw(new Error(`Failed to get meta, cannot find existing record with oid: ${oid}`));
        }
        return res.json(record["metadata"]);
      },
        error => {
          sails.log.error("Get metadata failed, failed to retrieve existing record.", error);
          return this.apiFail(req, res, 500, new APIErrorResponse("Get Metadata failed, failed to retrieve existing record. "));
        });
    }

    public async getRecordAudit(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');
      var dateFrom = req.param('dateFrom');
      var dateTo = req.param('dateTo');
      let params = { 'oid': oid, 'dateFrom': null, 'dateTo': null };
      if (!_.isEmpty(dateFrom)) {
        params['dateFrom'] = new Date(dateFrom);
      }

      if (!_.isEmpty(dateTo)) {
        params['dateTo'] = new Date(dateTo);
      }

      try {
        const audit = await this.RecordsService.getRecordAudit(params);
        let response: ListAPIResponse<any> = new ListAPIResponse<any>();
        response.summary.numFound = _.size(audit);
        response.summary.page = 1;
        response.records = audit;
        this.apiRespond(req, res, response);
      } catch (err) {
        sails.log.error(`Failed to list audit records for ${oid}`);
        sails.log.error(JSON.stringify(err));
        const apiErr = new APIErrorResponse(this.getErrorMessage(err, "Failed to list audit records, please check server logs."));
        this.apiFail(req, res, 500, apiErr);
      }

    }

    public getObjectMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      sails.log.debug('brand is...');
      sails.log.debug(brand);
      var oid = req.param('oid');

      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {
        return res.json(record["metaMetadata"]);
      });
    }

    public updateMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');
      const shouldMerge = req.param('merge', false);
      const shouldProcessDatastreams = req.param('datastreams', false);

      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {
        if (_.isEmpty(record)) {
          return Observable.throw(new Error(`Failed to update meta, cannot find existing record with oid: ${oid}`));
        }
        if (shouldMerge) {
          // behavior modified from replacing arrays to appending to arrays:
          record["metadata"] = _.mergeWith(record.metadata, req.body, (objValue, srcValue) => {
            if (_.isArray(objValue)) {
              return objValue.concat(srcValue);
            }
          });
        } else {
          record["metadata"] = req.body;
        }
        var obs = Observable.fromPromise(this.RecordsService.updateMeta(brand, oid, record, req.user));
        obs.subscribe(async (result) => {
          // check if we need to process data streams
          if (shouldProcessDatastreams) {
            sails.log.verbose(`Processing datastreams of: ${oid}`);
            for (let attField of record.metaMetadata.attachmentFields) {
              // TODO: add support for removing datastreams
              const result: DatastreamServiceResponse = await this.DatastreamService.addDatastreams(oid, _.get(record['metadata'], attField, []));
            }
            return res.json(result);
          } else {
            // not processing datastreams...
            return res.json(result);
          }
        }, error => {
          sails.log.error("Update metadata failed", error);
          return this.apiFail(req, res, 500, new APIErrorResponse("Update Metadata failed"));
        });
      },
        error => {
          sails.log.error("Update metadata failed, failed to retrieve existing record.", error);
          return this.apiFail(req, res, 400, new APIErrorResponse("Update Metadata failed, failed to retrieve existing record. "));
        });
    }

    public updateObjectMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');

      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {
        record["metaMetadata"] = req.body;
        var obs = Observable.fromPromise(this.RecordsService.updateMeta(brand, oid, record, req.user));
        obs.subscribe(result => {
          return res.json(result);
        });

      });
    }

    public create(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var recordType = req.param('recordType');

      var user = req.user;
      var body = req.body;
      if (body != null) {
        var authorizationEdit, authorizationView, authorizationEditPending, authorizationViewPending;
        if (body["authorization"] != null) {
          authorizationEdit = body["authorization"]["edit"];
          authorizationView = body["authorization"]["view"];
          authorizationEditPending = body["authorization"]["editPending"];
          authorizationViewPending = body["authorization"]["viewPending"];
        } else {
          // If no authorization block set to user
          body["authorization"] = [];
          authorizationEdit = [];
          authorizationView = [];
          authorizationEdit.push(req.user.username);
          authorizationView.push(req.user.username);
        }
        var recordTypeObservable = RecordTypesService.get(brand, recordType);

        recordTypeObservable.subscribe(recordTypeModel => {
          if (recordTypeModel) {
            var metadata = body["metadata"];
            var workflowStage = body["workflowStage"];
            var request = {};
            var metaMetadata = {};
            metaMetadata["brandId"] = brand.id;
            metaMetadata["type"] = recordTypeModel.name;
            metaMetadata["packageName"] = recordTypeModel.packageName;
            metaMetadata["packageType"] = recordTypeModel.packageType;

            // Resolves #723: removed hardcoded value
            metaMetadata["createdBy"] = req.user.username;
            request["metaMetadata"] = metaMetadata;
            //if no metadata field, no authorization
            if (metadata == null) {
              request["metadata"] = body;
            } else {
              request["metadata"] = metadata;
              // Adding custom metaMetadata values when specifying the metadata block
              if (!_.isEmpty(body["metaMetadata"])) {
                _.merge(metaMetadata, body["metaMetadata"]);
              }
            }

            // FormsService
            var workflowStepsObs = WorkflowStepsService.getAllForRecordType(recordTypeModel);

            workflowStepsObs.subscribe(workflowSteps => {
              _.each(workflowSteps, function (workflowStep) {
                // If no workflowStage set, find the starting step
                if (workflowStage == null) {
                  if (workflowStep["starting"] == true) {
                    request["workflow"] = workflowStep["config"]["workflow"];
                    request["authorization"] = workflowStep["config"]["authorization"];
                    request["authorization"]["view"] = authorizationView;
                    request["authorization"]["edit"] = authorizationEdit;
                    request["authorization"]["viewPending"] = authorizationViewPending;
                    request["authorization"]["editPending"] = authorizationEditPending;
                    metaMetadata["form"] = workflowStep["config"]["form"];
                  }
                } else {
                  if (workflowStep["name"] == workflowStage) {
                    request["workflow"] = workflowStep["config"]["workflow"];
                    request["authorization"] = workflowStep["config"]["authorization"];
                    request["authorization"]["view"] = authorizationView;
                    request["authorization"]["edit"] = authorizationEdit;
                    request["authorization"]["viewPending"] = authorizationViewPending;
                    request["authorization"]["editPending"] = authorizationEditPending;
                    metaMetadata["form"] = workflowStep["config"]["form"];
                  }
                }

              });
              let createPromise = this.RecordsService.create(brand, request, recordTypeModel, user)
              var obs = Observable.fromPromise(createPromise);
              obs.subscribe(response => {
                if (response.isSuccessful()) {
                  res.set('Location', sails.config.appUrl + BrandingService.getBrandAndPortalPath(req) + "/api/records/metadata/" + response.oid);
                  this.apiRespond(req, res, response, 201);
                } else {
                  sails.log.error("Create Record failed");
                  return this.apiFail(req, res, 500, new APIErrorResponse("Create failed"));
                }
              }, error => {
                sails.log.error("Create Record failed", error);
                return this.apiFail(req, res, 500, new APIErrorResponse("Create failed"));
              });
            });

          } else {
            return this.apiFail(req, res, 400, new APIErrorResponse("Record Type provided is not valid"));
          }
        }
        );
      }
    }

    public async getDataStream(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const datastreamId = req.param('datastreamId');
      sails.log.debug(`getDataStream ${oid} ${datastreamId}`);
      try {
        let found: any = null;
        let currentRec = await this.RecordsService.getMeta(oid)
        for(let attachmentField of currentRec.metaMetadata.attachmentFields) {
          if(found == null) {
            const attFieldVal = currentRec.metadata[attachmentField];
            found = _.find(attFieldVal, (attVal) => {
              return attVal.fileId == datastreamId
            });
          } else {
            break;
          }
        }
        if (!found) {
          return res.notFound()
        }
        let mimeType = found.mimeType;
        if (_.isEmpty(mimeType)) {
          // Set octet stream as a default
          mimeType = 'application/octet-stream'
        }
        const fileName = req.param('fileName') ? req.param('fileName') : datastreamId;
        res.set('Content-Type', 'application/octet-stream');

        let size = found.size;
        if (!_.isEmpty(size)) {
          res.set('Content-Length', size);
        }
        
        sails.log.verbose("fileName " + fileName);
        res.attachment(fileName);
        sails.log.info(`Returning datastream observable of ${oid}: ${fileName}, datastreamId: ${datastreamId}`);
        try {
          const response = await this.DatastreamService.getDatastream(oid, datastreamId);
          if (response.readstream) {

            response.readstream.on('error', (error) => {
              // Handle the error here
              sails.log.error('Error reading stream:', error);
              return
            });
            response.readstream.pipe(res);
          } else {
            res.end(Buffer.from(response.body), 'binary');
          }
          return
        } catch (error) {
          sails.log.error(error)
          return this.customErrorMessageHandlingOnUpstreamResult(error, res);
        }



      } catch (error) {
        return this.customErrorMessageHandlingOnUpstreamResult(error, res);
      }

    }

    public async addDataStreams(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');
      const self = this;
      req.file('attachmentFields').upload({
        dirname: `${sails.config.record.attachments.stageDir}`,
        maxBytes: 104857600,
        saveAs: function (__newFileStream, next) {
          sails.log.verbose('Generating files....');
          try {
            // const nextPath = path.join(UUIDGenerator(), path.basename(__newFileStream.filename));
            const nextPath = UUIDGenerator();
            return next(undefined, nextPath);
          } catch (error) {
            sails.log.error(error);
            return next(new Error('Could not determine an appropriate filename for uploaded filestream(s).'));
          }
        }
      }, async function (error, UploadedFileMetadata) {
        if (error) {
          const errorMessage = `There was a problem adding datastream(s) to: ${sails.config.record.attachments.stageDir}.`;
          sails.log.error(errorMessage, error);
          return res.status(500).json({ message: errorMessage });
        }
        sails.log.verbose(UploadedFileMetadata);
        sails.log.verbose('Succesfully uploaded all file metadata. Sending locations downstream....');
        const fileIds = _.map(UploadedFileMetadata, function (nextDescriptor) {
          return new Datastream({ fileId: path.relative(sails.config.record.attachments.stageDir, nextDescriptor.fd), name: nextDescriptor.filename, mimeType: nextDescriptor.type, size: nextDescriptor.size });
        });
        sails.log.verbose('files to send upstream are:');
        sails.log.verbose(_.toString(fileIds));
        const defaultErrorMessage = 'Error sending datastreams upstream.';
        try {
          const result: DatastreamServiceResponse = await self.DatastreamService.addDatastreams(oid, fileIds);

          sails.log.verbose(`Done with updating streams and returning response...`);
          if (result.isSuccessful()) {
            sails.log.verbose("Presuming success...");
            _.merge(result, { fileIds: fileIds });
            return res.json({ message: result });
          } else {
            return res.status(500).json({ message: result.message });
          }

        } catch (error) {
          sails.log.error(defaultErrorMessage, error);
          const msg = self.getErrorMessage(error, defaultErrorMessage);
          return res.status(500).json({ message: msg });
        }
      });
    }

    protected customErrorMessageHandlingOnUpstreamResult(error, res) {
      const defaultErrorMessage = 'There was a problem with the upstream request.';
      let errorMessage;
      if (error.error) {
        errorMessage = _.isBuffer(error.error) ? error.error.toString('UTF-8') : error.error
        try {
          errorMessage = JSON.parse(errorMessage)
        } catch (error) {
          sails.log.verbose("Error message is not a json object. Keeping it as is.");
        }
        sails.log.error(defaultErrorMessage, errorMessage);
      } else {
        errorMessage = defaultErrorMessage;
        sails.log.error(defaultErrorMessage);
      }
      sails.log.verbose(error);
      res.set('Content-Type', 'application/json');
      _.unset(res, 'Content-Disposition');
      return res.status(error.statusCode || 500).json({ message: errorMessage });
    }


    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */


    /* Ad-hoc methods for listing records via api
    * Using DashboardService for getRecords similar (copied from
    * DashboardController) to DashboardService
    * Can be used for building reports or SPAs for redbox
    * TODO: Refactor DashboardController to use this and move DashboardService.getRecords
    * to RecordsService
    */

    private getDocMetadata(doc) {
      var metadata = {};
      for (var key in doc) {
        if (key.indexOf('authorization_') != 0 && key.indexOf('metaMetadata_') != 0) {
          metadata[key] = doc[key];
        }
        if (key == 'authorization_editRoles') {
          metadata[key] = doc[key];
        }
      }
      return metadata;
    }

    protected async getRecords(workflowState, recordType, start, rows, user, roles, brand, editAccessOnly = undefined, packageType = undefined, sort = undefined, fieldNames = undefined, filterString = undefined) {
      const username = user.username;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = recordType.split(',');
      }
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        packageType = packageType.split(',');
      }
      if (start == null) {
        start = 0;
      }
      if (rows == undefined) {
        rows = 10;
      }
      var results = await this.RecordsService.getRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, fieldNames, filterString);
      sails.log.debug(results);
      let apiReponse: ListAPIResponse<any> = new ListAPIResponse();
      var totalItems = results.totalItems
      var startIndex = start;
      var noItems = rows;
      var pageNumber = Math.floor((startIndex / noItems) + 1);

      apiReponse.summary.numFound = totalItems;
      apiReponse.summary.start = startIndex;
      apiReponse.summary.page = pageNumber;


      var items = [];
      var docs = results["items"];

      for (var i = 0; i < docs.length; i++) {
        var doc = docs[i];
        var item = {};
        item["oid"] = doc["redboxOid"];
        item["title"] = doc["metadata"]["title"];
        item["metadata"] = doc["metadata"];
        item["dateCreated"] = doc["dateCreated"];
        item["dateModified"] = doc["lastSaveDate"];
        item["hasEditAccess"] = this.RecordsService.hasEditAccess(brand, user, roles, doc);
        items.push(item);
      }
      apiReponse.records = items;
      return apiReponse;

    }

    protected async getDeletedRecords(workflowState, recordType, start, rows, user, roles, brand, editAccessOnly = undefined, packageType = undefined, sort = undefined, fieldNames = undefined, filterString = undefined) {
      const username = user.username;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = recordType.split(',');
      }
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        packageType = packageType.split(',');
      }
      if (start == null) {
        start = 0;
      }
      if (rows == undefined) {
        rows = 10;
      }
      var results = await this.RecordsService.getDeletedRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, fieldNames, filterString);
      sails.log.debug(results);
      let apiReponse: ListAPIResponse<any> = new ListAPIResponse();
      var totalItems = results.totalItems
      var startIndex = start;
      var noItems = rows;
      var pageNumber = Math.floor((startIndex / noItems) + 1);

      apiReponse.summary.numFound = totalItems;
      apiReponse.summary.start = startIndex;
      apiReponse.summary.page = pageNumber;


      var items = [];
      var docs = results["items"];

      for (var i = 0; i < docs.length; i++) {
        var doc = docs[i];
        var item = {};
        item["oid"] = doc["redboxOid"];
        item["title"] = doc["deletedRecordMetadata"]["metadata"]["title"];
        item["deletedRecord"] = doc["deletedRecordMetadata"];
        item["dateCreated"] = doc["dateCreated"];
        item["dateModified"] = doc["lastSaveDate"];
        item["dateDeleted"]  = doc["dateDeleted"];
        items.push(item);
      }
      apiReponse.records = items;
      return apiReponse;

    }

    public listRecords(req, res) {
      //sails.log.debug('api-list-records');
      const brand = BrandingService.getBrand(req.session.branding);
      const editAccessOnly = req.query.editOnly;

      var roles = [];
      var username = "guest";
      let user = {};
      if (req.isAuthenticated()) {
        roles = req.user.roles;
        user = req.user;
        username = req.user.username;
      } else {
        // assign default role if needed...
        user = { username: username };
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand));
      }
      const recordType = req.param('recordType');
      const workflowState = req.param('state');
      const start = req.param('start');
      const rows = req.param('rows');
      const packageType = req.param('packageType');
      const sort = req.param('sort');
      const filterFieldString = req.param('filterFields');
      let filterString = req.param('filter');
      let filterFields = undefined;

      if (!_.isEmpty(filterFieldString)) {
        filterFields = filterString.split(',')
      } else {
        filterString = undefined;
      }

      if (rows > parseInt(sails.config.api.max_requests)) {
        var error = {
          "code": 400,
          "contactEmail": null,
          "description": "You have reached the maximum of request available; Max rows per request " + sails.config.api.max_requests,
          "homeRef": "/",
          "reasonPhrase": "Bad Request",
          "uri": "http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.4.1"
        };
        res.status(400);
        res.json(error);
      } else {
        // sails.log.debug(`getRecords: ${recordType} ${workflowState} ${start}`);
        // sails.log.debug(`${rows} ${packageType} ${sort}`);
        this.getRecords(workflowState, recordType, start, rows, user, roles, brand, editAccessOnly, packageType, sort, filterFields, filterString).then(response => {
          res.json(response);
        }).catch(error => {
          sails.log.error("Error:");
          sails.log.error(error);
          var err = error['error'];
          res.json(err);
        });
      }
    }

    public async restoreRecord(req, res) {
      const oid = req.param('oid');
      var user = req.user;
      if (_.isEmpty(oid)) {
        return this.apiFail(req, res, 400, new APIErrorResponse("Missing ID of record."));
      }

      const response = await this.RecordsService.restoreRecord(oid,user);
      if (response.isSuccessful()) {
        this.apiRespond(req, res, response);
      } else {
        sails.log.verbose(`Delete attempt failed for OID: ${oid}`);
        sails.log.verbose(JSON.stringify(response));
        this.apiFail(req, res, 500, new APIErrorResponse(response.message, response.details));
      }
    }

    public async deleteRecord(req, res) {
      const oid = req.param('oid');
      const permanentlyDelete = req.param('permanent') === 'true' ? true : false ;
      const user = req.user;
      if (_.isEmpty(oid)) {
        return this.apiFail(req, res, 400, new APIErrorResponse("Missing ID of record."));
      }
      const response = await this.RecordsService.delete(oid, permanentlyDelete, user);
      if (response.isSuccessful()) {
        this.apiRespond(req, res, response);
      } else {
        sails.log.verbose(`Delete attempt failed for OID: ${oid}`);
        sails.log.verbose(JSON.stringify(response));
        this.apiFail(req, res, 500, new APIErrorResponse(response.message, response.details));
      }
    }

    public async destroyDeletedRecord(req, res) {
      const oid = req.param('oid');
      const user = req.user;
      if (_.isEmpty(oid)) {
        return this.apiFail(req, res, 400, new APIErrorResponse("Missing ID of record."));
      }
      const response = await this.RecordsService.destroyDeletedRecord(oid, user);
      if (response.isSuccessful()) {
        this.apiRespond(req, res, response);
      } else {
        sails.log.verbose(`Destroy attempt failed for OID: ${oid}`);
        sails.log.verbose(JSON.stringify(response));
        this.apiFail(req, res, 500, new APIErrorResponse(response.message, response.details));
      }
    }

    public async transitionWorkflow(req, res) {
      const oid = req.param('oid');
      const targetStepName = req.param('targetStep');
      try {
        if (_.isEmpty(oid)) {
          return this.apiFail(req, res, 400, new APIErrorResponse("Missing ID of record."));
        }
        const brand = BrandingService.getBrand(req.session.branding);
        const record = await this.RecordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          this.apiFail(req, res, 500, new APIErrorResponse(`Missing OID: ${oid}`));
          return;
        }
        if (!this.RecordsService.hasEditAccess(brand, req.user, req.user.roles, record)) {
          this.apiFail(req, res, 500, new APIErrorResponse(`User has no edit permissions for :${oid}`));
          return;
        }
        const recType = await RecordTypesService.get(brand, record.metaMetadata.type).toPromise();
        const nextStep = await WorkflowStepsService.get(recType, targetStepName).toPromise();
        this.RecordsService.updateWorkflowStep(record, nextStep);
        const response = await this.RecordsService.updateMeta(brand, oid, record, req.user);
        this.apiRespond(req, res, response);
      } catch (err) {
        sails.log.error(`Failed to transitionWorkflow: ${oid} to ${targetStepName}`);
        sails.log.error(JSON.stringify(err));
        const apiErr = new APIErrorResponse(this.getErrorMessage(err, "Failed to transition workflow, please check server logs."));
        this.apiFail(req, res, 500, apiErr);
      }
    }

    public async listDatastreams(req, res) {
      const oid = req.param('oid');
      if (_.isEmpty(oid)) {
        return this.apiFail(req, res, 400, new APIErrorResponse("Missing ID of record."));
      }
      try {
        const attachments = await this.RecordsService.getAttachments(oid);
        sails.log.verbose(JSON.stringify(attachments));
        let response: ListAPIResponse<any> = new ListAPIResponse<any>();
        response.summary.numFound = _.size(attachments);
        response.summary.page = 1;
        response.records = attachments;
        this.apiRespond(req, res, response);
      } catch (err) {
        sails.log.error(`Failed to list attachments: ${oid}`);
        sails.log.error(JSON.stringify(err));
        const apiErr = new APIErrorResponse(this.getErrorMessage(err, "Failed to list attachments, please check server logs."));
        this.apiFail(req, res, 500, apiErr);
      }
    }

    public addRoleEdit(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var oid = req.param('oid');
      var body = req.body;
      var roles = body["roles"];
      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {

        if (roles != null && roles.length > 0) {
          record["authorization"]["editRoles"] = _.union(record["authorization"]["editRoles"], roles);
        }

        var obs = Observable.fromPromise(this.RecordsService.updateMeta(brand, oid, record, req.user));
        obs.subscribe(result => {
          if (result.isSuccessful()) {
            Observable.fromPromise(this.RecordsService.getMeta(result.oid)).subscribe(record => {
              return res.json(record["authorization"]);
            }, error => {
              sails.log.error(error);
              return this.apiFail(req, res, 500, new APIErrorResponse('Failed adding an editor role, check server logs.'));
            });
          } else {
            return res.json(result);
          }
        }, error => {
          sails.log.error(error);
          return this.apiFail(req, res, 500, new APIErrorResponse('Failed adding an editor role, check server logs.'));
        });
      });
    }

    public addRoleView(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);


      var oid = req.param('oid');
      var body = req.body;
      var roles = body["roles"];
      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {

        if (roles != null && roles.length > 0) {
          record["authorization"]["viewRoles"] = _.union(record["authorization"]["viewRoles"], roles);
        }

        var obs = Observable.fromPromise(this.RecordsService.updateMeta(brand, oid, record, req.user));
        obs.subscribe(result => {
          if (result.isSuccessful()) {
            Observable.fromPromise(this.RecordsService.getMeta(result["oid"])).subscribe(record => {
              return res.json(record["authorization"]);
            });
          } else {
            return res.json(result);
          }
        });
      });
    }

    public removeRoleEdit(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');

      var body = req.body;
      var roles = body["roles"];
      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {

        if (roles != null && roles.length > 0) {
          record["authorization"]["editRoles"] = _.difference(record["authorization"]["editRoles"], roles);
        }

        var obs = Observable.fromPromise(this.RecordsService.updateMeta(brand, oid, record, req.user));
        obs.subscribe(result => {
          if (result.isSuccessful()) {
            Observable.fromPromise(this.RecordsService.getMeta(result["oid"])).subscribe(record => {
              return res.json(record["authorization"]);
            });
          } else {
            return res.json(result);
          }
        });
      });
    }

    public removeRoleView(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var oid = req.param('oid');

      var body = req.body;
      var users = body["roles"];
      Observable.fromPromise(this.RecordsService.getMeta(oid)).subscribe(record => {

        if (users != null && users.length > 0) {
          record["authorization"]["viewRoles"] = _.difference(record["authorization"]["viewRoles"], users);
        }

        var obs = Observable.fromPromise(this.RecordsService.updateMeta(brand, oid, record, req.user));
        obs.subscribe(result => {
          if (result.isSuccessful()) {
            Observable.fromPromise(this.RecordsService.getMeta(result["oid"])).subscribe(record => {
              return res.json(record["authorization"]);
            });
          } else {
            return res.json(result);
          }
        });
      });
    }


    public async harvest(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      let updateModes = ["merge", "override", "create"]

      let updateMode = req.param('updateMode')
      if (_.isEmpty(updateMode)) {
        updateMode = "override"
      }

      var recordType = req.param('recordType');
      var recordTypeModel = await RecordTypesService.get(brand, recordType).toPromise();


      if (recordTypeModel == null) {
        return this.apiFail(req, res, 400, new APIErrorResponse("Record Type provided is not valid"));
      }
      var user = req.user;
      var body = req.body;
      if (body != null) {

        if (_.isEmpty(body["records"])) {
          return this.apiFail(req, res, 400, new APIErrorResponse("Invalid request body"));
        }
        let recordResponses = [];
        let records = body['records'];
        for (let record of records) {
          let harvestId = record["harvestId"]
          if (_.isEmpty(harvestId)) {
            recordResponses.push(new APIHarvestResponse(harvestId, null, false, "HarvestId was not specified"))
          } else {
            let existingRecord = await this.findExistingHarvestRecord(harvestId, recordType)
            if (existingRecord.length == 0 || updateMode == "create") {
              recordResponses.push(await this.createHarvestRecord(brand, recordTypeModel, record['recordRequest'], harvestId, updateMode, user));
            } else {
              let oid = existingRecord[0].redboxOid;
              if (updateMode != "ignore") {
                recordResponses.push(await this.updateHarvestRecord(brand, recordTypeModel, updateMode, record['recordRequest']['metadata'], oid, harvestId, user));
              } else {
                recordResponses.push(new APIHarvestResponse(harvestId, oid, true, `Record ignored as the record already exists. oid: ${oid}`))
              }
            }
          }
        }
        return res.json(recordResponses);
      }
      return this.apiFail(req, res, 400, new APIErrorResponse("Invalid request"));
    }

    private async updateHarvestRecord(brand: any, recordTypeModel: any, updateMode: any, body: any, oid: any, harvestId: any, user: any) {

      const shouldMerge = updateMode == "merge" ? true : false;
      try {
        let record = await this.RecordsService.getMeta(oid)
        if (_.isEmpty(record)) {
          return new APIHarvestResponse(harvestId, oid, false, `Failed to update meta, cannot find existing record with oid: ${oid}`)
        }
        try {
          if (shouldMerge) {
            // behavior modified from replacing arrays to appending to arrays:
            record["metadata"] = _.mergeWith(record.metadata, body, (objValue, srcValue) => {
              if (_.isArray(objValue)) {
                return objValue.concat(srcValue);
              }
            });
          } else {
            record["metadata"] = body;
          }
          let sourceMetadata = body["sourceMetadata"];
          if (!_.isEmpty(sourceMetadata)) {
            //Force this to be stored as a string
            record['metaMetadata']["sourceMetadata"] = "" + sourceMetadata
          }
          let result = await this.RecordsService.updateMeta(brand, oid, record, user);

          return new APIHarvestResponse(harvestId, oid, true, `Record updated successfully`)

        } catch (error) {
          const msg = this.getErrorMessage(error, "Failed to update meta");
          return new APIHarvestResponse(harvestId, oid, false, msg);
        }
      } catch (error) {
        const msg = this.getErrorMessage(error, "Failed to retrieve record metadata before update");
        return new APIHarvestResponse(harvestId, oid, false, msg);
      }
    }


    private async findExistingHarvestRecord(harvestId: any, recordType: any) {
      let results = await Record.find({
        'harvestId': harvestId,
        'metaMetadata.type': recordType
      }).meta({
        enableExperimentalDeepTargets: true
      })
      return results;
    }

    private async createHarvestRecord(brand, recordTypeModel, body, harvestId, updateMode, user) {
      let authorizationEdit, authorizationView, authorizationEditPending, authorizationViewPending;
      if (body["authorization"] != null) {
        authorizationEdit = body["authorization"]["edit"];
        authorizationView = body["authorization"]["view"];
        authorizationEditPending = body["authorization"]["editPending"];
        authorizationViewPending = body["authorization"]["viewPending"];
      } else {
        // If no authorization block set to user
        body["authorization"] = [];
        authorizationEdit = [];
        authorizationView = [];
        authorizationEdit.push(user.username);
        authorizationView.push(user.username);
      }

      let sourceMetadata = body["sourceMetadata"];

      var metadata = body["metadata"];
      var workflowStage = body["workflowStage"];
      var request = {};
      if (updateMode != "create") {
        // Only set harvestId if not in create mode
        request["harvestId"] = harvestId;
      }
      var metaMetadata = {};
      metaMetadata["brandId"] = brand.id;
      metaMetadata["type"] = recordTypeModel.name;
      metaMetadata["packageName"] = recordTypeModel.packageName;
      metaMetadata["packageType"] = recordTypeModel.packageType;

      if (!_.isEmpty(sourceMetadata)) {
        //Force this to be stored as a string
        metaMetadata["sourceMetadata"] = "" + sourceMetadata
      }
      // Resolves #723: removed hardcoded value
      metaMetadata["createdBy"] = user.username;
      request["metaMetadata"] = metaMetadata;
      //if no metadata field, no authorization
      if (metadata == null) {
        request["metadata"] = body;
      } else {
        request["metadata"] = metadata;
        // Adding custom metaMetadata values when specifying the metadata block
        if (!_.isEmpty(body["metaMetadata"])) {
          _.merge(metaMetadata, body["metaMetadata"]);
        }
      }

      // FormsService
      let workflowSteps = await WorkflowStepsService.getAllForRecordType(recordTypeModel).toPromise();


      for (let workflowStep of workflowSteps) {
        // If no workflowStage set, find the starting step
        if (workflowStage == null) {
          if (workflowStep["starting"] == true) {
            request["workflow"] = workflowStep["config"]["workflow"];
            request["authorization"] = workflowStep["config"]["authorization"];
            request["authorization"]["view"] = authorizationView;
            request["authorization"]["edit"] = authorizationEdit;
            request["authorization"]["viewPending"] = authorizationViewPending;
            request["authorization"]["editPending"] = authorizationEditPending;
            metaMetadata["form"] = workflowStep["config"]["form"];
          }
        } else {
          if (workflowStep["name"] == workflowStage) {
            request["workflow"] = workflowStep["config"]["workflow"];
            request["authorization"] = workflowStep["config"]["authorization"];
            request["authorization"]["view"] = authorizationView;
            request["authorization"]["edit"] = authorizationEdit;
            request["authorization"]["viewPending"] = authorizationViewPending;
            request["authorization"]["editPending"] = authorizationEditPending;
            metaMetadata["form"] = workflowStep["config"]["form"];
          }
        }

      }
      try {
        let response = await this.RecordsService.create(brand, request, recordTypeModel, user)

        if (response.isSuccessful()) {
          return new APIHarvestResponse(harvestId, response.oid, true, `Record created successfully`);
        } else {

          return new APIHarvestResponse(harvestId, null, false, `Record creation failed`);

        }
      } catch (error) {
        const msg = this.getErrorMessage(error, error.toString());
        return new APIHarvestResponse(harvestId, null, false, msg);
      }




    }


    public listDeletedRecords(req, res) {
      //sails.log.debug('api-list-records');
      const brand = BrandingService.getBrand(req.session.branding);
      const editAccessOnly = req.query.editOnly;

      var roles = [];
      var username = "guest";
      let user = {};
      if (req.isAuthenticated()) {
        roles = req.user.roles;
        user = req.user;
        username = req.user.username;
      } else {
        // assign default role if needed...
        user = { username: username };
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand));
      }
      const recordType = req.param('recordType');
      const workflowState = req.param('state');
      const start = req.param('start');
      const rows = req.param('rows');
      const packageType = req.param('packageType');
      const sort = req.param('sort');
      const filterFieldString = req.param('filterFields');
      let filterString = req.param('filter');
      let filterFields = undefined;

      if (!_.isEmpty(filterFieldString)) {
        filterFields = filterString.split(',')
      } else {
        filterString = undefined;
      }

      if (rows > parseInt(sails.config.api.max_requests)) {
        var error = {
          "code": 400,
          "contactEmail": null,
          "description": "You have reached the maximum of request available; Max rows per request " + sails.config.api.max_requests,
          "homeRef": "/",
          "reasonPhrase": "Bad Request",
          "uri": "http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.4.1"
        };
        res.status(400);
        res.json(error);
      } else {
        // sails.log.debug(`getRecords: ${recordType} ${workflowState} ${start}`);
        // sails.log.debug(`${rows} ${packageType} ${sort}`);
        this.getDeletedRecords(workflowState, recordType, start, rows, user, roles, brand, editAccessOnly, packageType, sort, filterFields, filterString).then(response => {
          res.json(response);
        }).catch(error => {
          sails.log.error("Error:");
          sails.log.error(error);
          var err = error['error'];
          res.json(err);
        });
      }
    }

    private getErrorMessage(err: Error, defaultMessage: string) {
      const validationName = 'RBValidationError'; // RBValidationError.clName;
      return validationName == err.name ? err.message : defaultMessage;
    }
  }
}


module.exports = new Controllers.RecordWeb().exports();
