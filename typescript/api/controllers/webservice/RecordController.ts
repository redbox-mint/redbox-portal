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
  BrandingModel,
  Controllers as controllers,
  Datastream,
  DatastreamService,
  DatastreamServiceResponse,
  RecordModel,
  RecordsService,
  SearchService,
  ListAPIResponse,
  RecordTypeModel,
  UserModel
} from '@researchdatabox/redbox-core-types';



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
      'harvest',
      'legacyHarvest'
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

    public async getPermissions(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');

      try {
        const record = await this.RecordsService.getMeta(oid);
        return res.json(record["authorization"]);
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed to get record permission, check server logs.');
      }
    }

    public async addUserEdit(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const body = req.body;
      const users = body["users"];
      const pendingUsers = body["pendingUsers"];

      let record:RecordModel;
      try {
        record = await this.RecordsService.getMeta(oid);
        if (users != null && users.length > 0) {
          record.authorization.edit = _.union(record["authorization"]["edit"], users);
        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record.authorization.editPending = _.union(record["authorization"]["editPending"], pendingUsers);
        }
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed to modify record meta for adding an editor, check server logs.');
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user);
        if (!result.isSuccessful()) {
          return this.apiFailWrapper(req, res, 500, null, null,
              `Failed to update record with oid ${oid}, check server logs.`);
        }
        const recordResult = await this.RecordsService.getMeta(result.oid);
        return res.json(recordResult["authorization"]);
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed adding an editor, check server logs.');
      }
    }

    public async addUserView(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const body = req.body;
      const users = body["users"];
      const pendingUsers = body["pendingUsers"];

      let record;
      try {
        record = await this.RecordsService.getMeta(oid);
        if (users != null && users.length > 0) {
          record["authorization"]["view"] = _.union(record["authorization"]["view"], users);
        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record["authorization"]["viewPending"] = _.union(record["authorization"]["viewPending"], pendingUsers);
        }
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed getting record meta for adding a viewer, check server logs.');
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user);
        if (!result.isSuccessful()) {
          return this.apiFailWrapper(req, res, 500, null, null,
              `Failed to update record with oid ${oid}, check server logs.`);
        }
        const resultRecord = await this.RecordsService.getMeta(result["oid"]);
        return res.json(resultRecord["authorization"]);
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed adding a viewer, check server logs.');
      }
    }

    public async removeUserEdit(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const body = req.body;
      const users = body["users"];
      const pendingUsers = body["pendingUsers"];

      let record;
      try {
        record = await this.RecordsService.getMeta(oid);
        if (users != null && users.length > 0) {
          record["authorization"]["edit"] = _.difference(record["authorization"]["edit"], users);
        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record["authorization"]["editPending"] = _.difference(record["authorization"]["editPending"], pendingUsers);
        }
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed getting record meta for removing an editor, check server logs.');
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user);
        if (!result.isSuccessful()) {
          return this.apiFailWrapper(req, res, 500, null, null,
              `Failed to update record with oid ${oid}, check server logs.`);
        }
        const resultRecord = await this.RecordsService.getMeta(result["oid"]);
        return res.json(resultRecord["authorization"]);
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed removing an editor, check server logs.');
      }
    }

    public async removeUserView(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const body = req.body;
      const users = body["users"];
      const pendingUsers = body["pendingUsers"];

      let record;
      try {
        record = await this.RecordsService.getMeta(oid);
        if (users != null && users.length > 0) {
          record["authorization"]["view"] = _.difference(record["authorization"]["view"], users);
        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record["authorization"]["viewPending"] = _.difference(record["authorization"]["viewPending"], pendingUsers);
        }
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed to modify record meta for removing a viewer, check server logs.');
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user);
        if (!result.isSuccessful()) {
          return this.apiFailWrapper(req, res, 500, null, null,
              `Failed to update record with oid ${oid}, check server logs.`);
        }
        const resultRecord = await this.RecordsService.getMeta(result["oid"]);
        return res.json(resultRecord["authorization"]);
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed removing a viewer, check server logs.');
      }
    }

    public async getMeta(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');

      try {
        const record = await this.RecordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return this.apiFailWrapper(req, res, 400, null, null,
              `Failed to get meta, cannot find existing record with oid: ${oid}`);
        }
        return res.json(record["metadata"]);
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            "Get Metadata failed, failed to retrieve existing record.");
      }
    }

    public async getRecordAudit(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
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
        this.apiFailWrapper(req, res, 500, null, err,
            `Failed to list audit records for ${oid}, please check server logs.`);
      }
    }

    public async getObjectMeta(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      sails.log.debug('brand is...');
      sails.log.debug(brand);
      var oid = req.param('oid');

      try {
        const record = await this.RecordsService.getMeta(oid);
        return res.json(record["metaMetadata"]);
      } catch (err) {
        this.apiFailWrapper(req, res, 500, null, err,
            `Failed to get object meta for ${oid}, please check server logs.`);
      }
    }

    public async updateMeta(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const shouldMerge = req.param('merge', false);
      const shouldProcessDatastreams = req.param('datastreams', false);

      let record;
      try {
        record = await this.RecordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return this.apiFailWrapper(req, res, 400, null, null,
              `Failed to update meta, cannot find existing record with oid: ${oid}`);
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
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            "Update Metadata failed, failed to retrieve existing record.");
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user);
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
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            "Update Metadata failed");
      }
    }

    public async updateObjectMeta(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');

      let record;
      try {
        record = await this.RecordsService.getMeta(oid);
        record["metaMetadata"] = req.body;
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            "Update Object Metadata failed");
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user);
        return res.json(result);
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            "Update Object Metadata failed");
      }
    }

    public create(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const recordType = req.param('recordType');
      const user = req.user;
      const body = req.body;
      let that = this;
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
            
            //if no metadata field, no authorization
            if (metadata == null) {
              request["metadata"] = body;
            } else {
              request["metadata"] = metadata;
            }
            let createPromise = this.RecordsService.create(brand, request, recordTypeModel, user);

            var obs = Observable.fromPromise(createPromise);
            obs.subscribe(response => {
              if (response.isSuccessful()) {

                if(workflowStage) {
                  WorkflowStepsService.get(recordTypeModel, workflowStage).subscribe(wfStep  => {
                    that.RecordsService.updateWorkflowStep(request, wfStep);
                  });
                }

                res.set('Location', sails.config.appUrl + BrandingService.getBrandAndPortalPath(req) + "/api/records/metadata/" + response.oid);
                this.apiRespond(req, res, response, 201);
              } else {
                return this.apiFailWrapper(req, res, 500, null, null,
                    "Create Record failed");
              }
            }, error => {
              return this.apiFailWrapper(req, res, 500, null, error,
                  "Create Record failed");
            });

          } else {
            return this.apiFailWrapper(req, res, 400, null, null,
                "Record Type provided is not valid");
          }
        }
        );
      }
    }

    public async getDataStream(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const datastreamId = req.param('datastreamId');
      sails.log.debug(`getDataStream ${oid} ${datastreamId}`);
      try {
        // let found: any = null;
        // let currentRec = await this.RecordsService.getMeta(oid)
        // for(let attachmentField of currentRec.metaMetadata.attachmentFields) {
        //   if(found == null) {
        //     const attFieldVal = currentRec.metadata[attachmentField];
        //     found = _.find(attFieldVal, (attVal) => {
        //       return attVal.fileId == datastreamId
        //     });
        //   } else {
        //     break;
        //   }
        // }
        
        let found: any = null;
        const attachments = await this.RecordsService.getAttachments(oid);
        for(let attachment of attachments) {
          if(attachment.fileId == datastreamId) {
            found = attachment;
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
        const fileName = req.param('fileName') ? req.param('fileName') : found.name? found.name : datastreamId;
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
          return this.customErrorMessageHandlingOnUpstreamResult(error, res);
        }

      } catch (error) {
        return this.customErrorMessageHandlingOnUpstreamResult(error, res);
      }
    }

    public async addDataStreams(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
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
          return self.apiFailWrapper(req, res, 500, null, error,
              `There was a problem adding datastream(s) to: ${sails.config.record.attachments.stageDir}.`);
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
            return self.apiFailWrapper(req, res, 500, null, null,
                defaultErrorMessage + " " + result.message);
          }

        } catch (error) {
          return self.apiFailWrapper(req, res, 500, null, error,
              defaultErrorMessage);
        }
      });
    }

    protected customErrorMessageHandlingOnUpstreamResult(error, res) {
      sails.log.error(error);

      let errorMessage = "";

      // get the message from the error property
      if (error.error) {
        errorMessage = _.isBuffer(error.error) ? error.error.toString('UTF-8') : error.error;
      }

      // get the 'friendly' Error message
      // TODO: use RBValidationError.clName;
      const rBValidationErrorName = 'RBValidationError';
      if (!errorMessage && error?.name == rBValidationErrorName && error?.message) {
        errorMessage = error.message
      }

      // the message might be JSON - try to parse it
      try {
        errorMessage = JSON.parse(errorMessage)
      } catch (error) {
        sails.log.verbose("Error message is not a json object. Keeping it as is.");
      }

      // use a prefix message to give some context
      errorMessage = 'There was a problem with the upstream request.' + (errorMessage ? " " : "") + errorMessage.trim();

      // set the response to be json,
      // in case the response was already changed to suit the attachment
      res.set('Content-Type', 'application/json');
      _.unset(res, 'Content-Disposition');

      sails.log.error('customErrorMessageHandlingOnUpstreamResult', errorMessage);
      return res.status(error.statusCode || 500).json({message: errorMessage});
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
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
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
        return this.apiFailWrapper(req, res, 400, null, null,
            "Missing ID of record.");
      }

      const response = await this.RecordsService.restoreRecord(oid,user);
      if (response.isSuccessful()) {
        this.apiRespond(req, res, response);
      } else {
        sails.log.verbose(`Delete attempt failed for OID: ${oid}`);
        sails.log.verbose(JSON.stringify(response));
        this.apiFailWrapper(req, res, 500, new APIErrorResponse(response.message, response.details));
      }
    }

    public async deleteRecord(req, res) {
      const oid = req.param('oid');
      const permanentlyDelete = req.param('permanent') === 'true' ? true : false ;
      const user = req.user;
      if (_.isEmpty(oid)) {
        return this.apiFailWrapper(req, res, 400, null, null,
            "Missing ID of record.");
      }
      const response = await this.RecordsService.delete(oid, permanentlyDelete, user);
      if (response.isSuccessful()) {
        this.apiRespond(req, res, response);
      } else {
        this.apiFailWrapper(req, res, 500,
            new APIErrorResponse(response.message, response.details),
            null,
            `Delete attempt failed for OID: ${oid}`);
      }
    }

    public async destroyDeletedRecord(req, res) {
      const oid = req.param('oid');
      const user = req.user;
      if (_.isEmpty(oid)) {
        return this.apiFailWrapper(req, res, 400, null, null,
            "Missing ID of record.");
      }
      const response = await this.RecordsService.destroyDeletedRecord(oid, user);
      if (response.isSuccessful()) {
        this.apiRespond(req, res, response);
      } else {
        this.apiFailWrapper(req, res, 500,
            new APIErrorResponse(response.message, response.details),
            null,
            `Destroy attempt failed for OID: ${oid}`);
      }
    }

    public async transitionWorkflow(req, res) {
      const oid = req.param('oid');
      const targetStepName = req.param('targetStep');
      try {
        if (_.isEmpty(oid)) {
          return this.apiFailWrapper(req, res, 400, null, null,
              "Missing ID of record.");
        }
        const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
        const record = await this.RecordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return this.apiFailWrapper(req, res, 500, null, null,
              `Missing OID: ${oid}`);
        }
        if (!this.RecordsService.hasEditAccess(brand, req.user, req.user.roles, record)) {
          return this.apiFailWrapper(req, res, 500, null, null,
              `User has no edit permissions for :${oid}`);
        }
        const recType = await RecordTypesService.get(brand, record.metaMetadata.type).toPromise();
        const nextStep = await WorkflowStepsService.get(recType, targetStepName).toPromise();
        this.RecordsService.updateWorkflowStep(record, nextStep);
        const response = await this.RecordsService.updateMeta(brand, oid, record, req.user);
        this.apiRespond(req, res, response);
      } catch (err) {
        this.apiFailWrapper(req, res, 500, new APIErrorResponse("Failed to transition workflow, please check server logs."), err,
            `Failed to transitionWorkflow: ${oid} to ${targetStepName}`);
      }
    }

    public async listDatastreams(req, res) {
      const oid = req.param('oid');
      if (_.isEmpty(oid)) {
        return this.apiFailWrapper(req, res, 400, null, null,
            "Missing ID of record.");
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
        this.apiFailWrapper(req, res, 500, null, err,
            `Failed to list attachments for ${oid}, please check server logs.`);
      }
    }

    public async addRoleEdit(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const body = req.body;
      const roles = body["roles"];

      let record;
      try {
        record = await this.RecordsService.getMeta(oid);
        if (roles != null && roles.length > 0) {
          record["authorization"]["editRoles"] = _.union(record["authorization"]["editRoles"], roles);
        }
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed adding an editor role, check server logs.');
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user);
        if (!result.isSuccessful()) {
          return this.apiFailWrapper(req, res, 500, null, null,
              `Failed to update record with oid ${oid}, check server logs.`);
        }
        const resultRecord = await this.RecordsService.getMeta(result.oid);
        return res.json(resultRecord["authorization"]);
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed adding an editor role, check server logs.');
      }
    }

    public async addRoleView(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const body = req.body;
      const roles = body["roles"];

      let record;
      try {
        record = await this.RecordsService.getMeta(oid);
        if (roles != null && roles.length > 0) {
          record["authorization"]["viewRoles"] = _.union(record["authorization"]["viewRoles"], roles);
        }
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed getting record meta for adding a viewer role, check server logs.');
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user);
        if (!result.isSuccessful()) {
          return this.apiFailWrapper(req, res, 500, null, null,
              `Failed to update record with oid ${oid}, check server logs.`);
        }
        const resultRecord = await this.RecordsService.getMeta(result["oid"]);
        return res.json(resultRecord["authorization"]);
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed updating record meta for adding a viewer role, check server logs.');
      }
    }

    public async removeRoleEdit(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid'); 
      const body = req.body;
      const roles = body["roles"];

      let record;
      try {
          record = await this.RecordsService.getMeta(oid);
          if (roles != null && roles.length > 0) {
              record["authorization"]["editRoles"] = _.difference(record["authorization"]["editRoles"], roles);
          }
      } catch (err) {
          return this.apiFailWrapper(req, res, 500, null, err,
              'Failed getting record meta for removing an editor role, check server logs.');
      }

      try {
          const result = await this.RecordsService.updateMeta(brand, oid, record, req.user);
          if (!result.isSuccessful()) {
              return this.apiFailWrapper(req, res, 500, null, null,
                  `Failed to update record with oid ${oid}, check server logs.`);
          }
          const resultRecord = await this.RecordsService.getMeta(result["oid"]);
          return res.json(resultRecord["authorization"]);
      } catch (err) {
          return this.apiFailWrapper(req, res, 500, null, err,
              'Failed updating record meta for removing an editor role, check server logs.');
      }
    }

    public async removeRoleView(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const body = req.body;
      const users = body['roles'];

      let record;
      try {
        record = await this.RecordsService.getMeta(oid);
        if (users != null && users.length > 0) {
          record['authorization']['viewRoles'] = _.difference(record['authorization']['viewRoles'], users);
        }
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed getting record meta for removing a viewer role, check server logs.');
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user);
        if (!result.isSuccessful()) {
          return this.apiFailWrapper(req, res, 500, null, null,
              `Failed to update record with oid ${oid}, check server logs.`);
        }
        const resultRecord = await this.RecordsService.getMeta(result['oid']);
        return res.json(resultRecord['authorization']);
      } catch (err) {
        return this.apiFailWrapper(req, res, 500, null, err,
            'Failed getting record meta for removing a viewer role, check server logs.');
      }
    }

    public async harvest(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      let updateModes = ["merge", "override", "create"];

      let updateMode = req.param('updateMode')
      if (_.isEmpty(updateMode)) {
        updateMode = "override";
      }

      var recordType = req.param('recordType');
      var recordTypeModel:RecordTypeModel = await RecordTypesService.get(brand, recordType).toPromise();

      if (recordTypeModel == null) {
        return this.apiFailWrapper(req, res, 400,null, null, "Record Type provided is not valid");
      }
      var user = req.user;
      var body = req.body;
      if (body != null) {

        if (_.isEmpty(body["records"])) {
          return this.apiFailWrapper(req, res, 400, null, null, "Invalid request body");
        }
        let recordResponses = [];
        let records = body['records'];
        for (let record of records) {
          let harvestId = record["harvestId"]
          if (_.isEmpty(harvestId)) {
            recordResponses.push(new APIHarvestResponse(harvestId, null, false, "HarvestId was not specified"));
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
      return this.apiFailWrapper(req, res, 400, null, null, "Invalid request");
    }

    public async legacyHarvest(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);

      var recordType = req.param('recordType');
      var recordTypeModel:RecordTypeModel = await RecordTypesService.get(brand, recordType).toPromise();

      if (recordTypeModel == null) {
        return this.apiFailWrapper(req, res, 400,null, null, 'Record Type provided is not valid');
      }
      var user = req.user;
      var body = req.body;
      if (body != null) {

        if (_.isEmpty(body['records'])) {
          return this.apiFailWrapper(req, res, 400, null, null, 'Invalid request body');
        }
        let recordResponses = [];
        let records = body['records'];
        for (let record of records) {
          let harvestId = record['harvest_id'];
          if (_.isEmpty(harvestId)) {
            recordResponses.push(new APIHarvestResponse(harvestId, null, false, 'HarvestId was not specified'));
          } else {
            let existingRecord = await this.findExistingHarvestRecord(harvestId, recordType);
            if (existingRecord.length == 0) {
              recordResponses.push(await this.createHarvestRecord(brand, recordTypeModel, record['metadata']['data'], harvestId, 'update', user));
            } else {
              let oid = existingRecord[0].redboxOid;
              recordResponses.push(await this.updateHarvestRecord(brand, recordTypeModel, 'update', record['metadata']['data'], oid, harvestId, user));
            }
          }
        }
        return res.json(recordResponses);
      }
      return this.apiFailWrapper(req, res, 400, null, null, 'Invalid request');
    }

    private async updateHarvestRecord(brand: BrandingModel, recordTypeModel: RecordTypeModel, updateMode: string, body: any, oid: string, harvestId: string, user: UserModel) {

      const shouldMerge = updateMode == "merge" ? true : false;
      try {
        let record:RecordModel = await this.RecordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return new APIHarvestResponse(harvestId, oid, false, `Failed to update meta, cannot find existing record with oid: ${oid}`);
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
          const result = new APIHarvestResponse(harvestId, oid, false, "Failed to update meta");
          sails.log.error(error, result);
          return result;
        }
      } catch (error) {
        const result = new APIHarvestResponse(harvestId, oid, false, "Failed to retrieve record metadata before update");
        sails.log.error(error, result);
        return result;
      }
    }

    private async findExistingHarvestRecord(harvestId: string, recordType: string) {
      let results = await Record.find({
        'harvestId': harvestId,
        'metaMetadata.type': recordType
      }).meta({
        enableExperimentalDeepTargets: true
      })
      return results;
    }

    private async createHarvestRecord(brand: BrandingModel, recordTypeModel: RecordTypeModel, body: any, harvestId: string, updateMode: string, user: UserModel) {
      let authorizationEdit, authorizationView, authorizationEditPending, authorizationViewPending;
      if (body['authorization'] != null) {
        authorizationEdit = body['authorization']['edit'];
        authorizationView = body['authorization']['view'];
        authorizationEditPending = body['authorization']['editPending'];
        authorizationViewPending = body['authorization']['viewPending'];
      } else {
        // If no authorization block set to user
        body['authorization'] = [];
        authorizationEdit = [];
        authorizationView = [];
        authorizationEdit.push(user.username);
        authorizationView.push(user.username);
      }

      var metadata = body['metadata'];
      var workflowStage = body['workflowStage'];
      var request = {};
      if (updateMode != 'create') {
        // Only set harvestId if not in create mode
        request['harvestId'] = harvestId;
      }
      
      //if no metadata field, no authorization
      if (metadata == null) {
        request['metadata'] = body;
      } else {
        request['metadata'] = metadata;
      }

      try {
        let response = await this.RecordsService.create(brand, request, recordTypeModel, user);

        if(workflowStage) {
          let wfStep = await WorkflowStepsService.get(recordTypeModel, workflowStage).toPromise();
          this.RecordsService.updateWorkflowStep(request, wfStep);
        }

        if (response.isSuccessful()) {
          return new APIHarvestResponse(harvestId, response.oid, true, `Record created successfully`);
        } else {
          const result = new APIHarvestResponse(harvestId, null, false, `Record creation failed`);
          sails.log.error(result);
          return result
        }
      } catch (error) {
        const result = new APIHarvestResponse(harvestId, null, false, error.toString());
        sails.log.error(error, result);
        return result;
      }
    }


    public listDeletedRecords(req, res) {
      //sails.log.debug('api-list-records');
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
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

    private apiFailWrapper(
        req, res,
        statusCode = 500,
        errorResponse: APIErrorResponse = new APIErrorResponse(),
        error: Error = null,
        defaultMessage: string = null) {
      // TODO: incorporate some of this into the controller core apiFail function
      if (!errorResponse) {
        errorResponse = new APIErrorResponse();
        // start with an empty message
        errorResponse.message = "";
      }

      // if there is an error and/or defaultMessage, log it
      if (defaultMessage && error) {
        sails.log.error(errorResponse, defaultMessage, error);
      } else if (defaultMessage && !error) {
        sails.log.error(errorResponse, defaultMessage);
      } else if (!defaultMessage && error) {
        sails.log.error(errorResponse, error);
      }

      // TODO: use RBValidationError.clName;
      const rBValidationErrorName = 'RBValidationError';

      // if available, get the 'friendly' validation error message
      const validationMessage = (error?.name === rBValidationErrorName ? error?.message : "") || "";

      // update the api response message
      let message = (errorResponse.message || "").trim();
      if (validationMessage && message) {
        message = message.endsWith('.') ? (message + " " + validationMessage) : (message + ". " + validationMessage);
      } else if (validationMessage && !message) {
        message = validationMessage;
      } else if (!validationMessage && message) {
        // nothing to do
      } else {
        message = defaultMessage;
      }
      errorResponse.message = message;

      // TODO: could use: this.apiRespond(req, res, errorResponse, statusCode);
      return this.apiFail(req, res, statusCode, errorResponse);
    }
  }
}


module.exports = new Controllers.RecordWeb().exports();
