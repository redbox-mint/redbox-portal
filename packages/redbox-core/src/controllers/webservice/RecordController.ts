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

import { firstValueFrom, from } from 'rxjs';
import * as path from "path";
import {
  APIHarvestResponse,
  BrandingModel,
  Controllers as controllers,
  Datastream,
  DatastreamService,
  DatastreamServiceResponse,
  ListAPIResponse,
  RecordModel,
  RecordsService,
  RecordTypeModel,
  SearchService,
  UserModel
} from '../../index';

import { v4 as UUIDGenerator } from 'uuid';


export namespace Controllers {
  /**
   * RecordController API version
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Record extends controllers.Core.Controller {

    RecordsService!: RecordsService;
    SearchService!: SearchService;
    DatastreamService!: DatastreamService;
    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'init',
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

    public init(): void {
      this.RecordsService = sails.services.recordsservice as unknown as RecordsService;
      const that = this;
      this.registerSailsHook('after', ['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'], function () {
        const datastreamServiceName = sails.config.record.datastreamService;
        sails.log.verbose(`RecordController Webservice ready, using datastream service: ${datastreamServiceName}`);
        if (datastreamServiceName != undefined) {
          that.DatastreamService = sails.services[datastreamServiceName] as unknown as DatastreamService;
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

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    public async getPermissions(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');

      try {
        const record = await this.RecordsService.getMeta(oid);
        return this.sendResp(req, res, { data: record["authorization"] });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed to get record permission.' }]
        });
      }
    }

    public async addUserEdit(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const oid = req.param('oid');
      const body = req.body;
      const users = body["users"];
      const pendingUsers = body["pendingUsers"];

      let record: RecordModel;
      try {
        record = await this.RecordsService.getMeta(oid);
        if (users != null && users.length > 0) {
          record.authorization.edit = _.union(record["authorization"]["edit"], users);
        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record.authorization.editPending = _.union(record["authorization"]["editPending"], pendingUsers);
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed to modify record meta for adding an editor.' }]
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user ?? {});
        if (!result.isSuccessful()) {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: `Failed to update record with oid ${oid}.` }]
          });
        }
        const recordResult = await this.RecordsService.getMeta(result.oid);
        return this.sendResp(req, res, { data: recordResult["authorization"] });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed adding an editor.' }]
        });
      }
    }

    public async addUserView(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
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
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed getting record meta for adding a viewer.' }]
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user ?? {});
        if (!result.isSuccessful()) {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: `Failed to update record with oid ${oid}.` }]
          });
        }
        const resultRecord = await this.RecordsService.getMeta(result["oid"]);
        return this.sendResp(req, res, { data: resultRecord["authorization"] });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed adding a viewer.' }]
        });
      }
    }

    public async removeUserEdit(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
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
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed getting record meta for removing an editor.' }]
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user ?? {});
        if (!result.isSuccessful()) {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: `Failed to update record with oid ${oid}.` }]
          });
        }
        const resultRecord = await this.RecordsService.getMeta(result["oid"]);
        return this.sendResp(req, res, { data: resultRecord["authorization"] });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed removing an editor.' }]
        });
      }
    }

    public async removeUserView(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
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
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed to modify record meta for removing a viewer.' }]
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user ?? {});
        if (!result.isSuccessful()) {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: `Failed to update record with oid ${oid}.` }]
          });
        }
        const resultRecord = await this.RecordsService.getMeta(result["oid"]);
        return this.sendResp(req, res, { data: resultRecord["authorization"] });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed removing a viewer.' }]
        });
      }
    }

    public async getMeta(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');

      try {
        const record = await this.RecordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: `Failed to get meta, cannot find existing record with oid: ${oid}` }]
          });
        }
        return this.sendResp(req, res, { data: record["metadata"] });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: "Get Metadata failed." }]
        });
      }
    }

    public async getRecordAudit(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      const dateFrom = req.param('dateFrom');
      const dateTo = req.param('dateTo');
      const params: { oid: string; dateFrom: Date | null; dateTo: Date | null } = { oid, dateFrom: null, dateTo: null };
      if (!_.isEmpty(dateFrom)) {
        params['dateFrom'] = new Date(dateFrom);
      }

      if (!_.isEmpty(dateTo)) {
        params['dateTo'] = new Date(dateTo);
      }

      try {
        const audit = await this.RecordsService.getRecordAudit(params);
        const response: ListAPIResponse<unknown> = new ListAPIResponse<unknown>();
        response.summary.numFound = _.size(audit);
        response.summary.page = 1;
        response.records = audit;
        return this.sendResp(req, res, { data: response });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: `Failed to list audit records for ${oid}, please.` }]
        });
      }
    }

    public async getObjectMeta(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      sails.log.debug('brand is...');
      sails.log.debug(brand);
      const oid = req.param('oid');

      try {
        const record = await this.RecordsService.getMeta(oid);
        return this.sendResp(req, res, { data: record["metaMetadata"] });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: `Failed to get object meta for ${oid}, please.`, meta: { oid } }]
        });
      }
    }

    public async updateMeta(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const oid = req.param('oid');
      const shouldMerge = req.param('merge') === 'true';
      const shouldProcessDatastreams = req.param('datastreams') === 'true';

      let record;
      try {
        record = await this.RecordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: `Failed to update meta, cannot find existing record with oid: ${oid}.`, meta: { oid } }]
          });
        }
        if (shouldMerge) {
          // behavior modified from replacing arrays to appending to arrays:
          record["metadata"] = _.mergeWith(record.metadata, req.body, (objValue: unknown, srcValue: unknown) => {
            if (_.isArray(objValue)) {
              return (objValue as unknown[]).concat(srcValue as unknown[]);
            }
            return undefined;
          });
        } else {
          record["metadata"] = req.body;
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: "Update Metadata failed." }]
        });
      }
      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user ?? {});
        // check if we need to process data streams
        if (shouldProcessDatastreams) {
          sails.log.verbose(`Processing datastreams of: ${oid}`);
          for (const attField of record.metaMetadata.attachmentFields) {
            // TODO: add support for removing datastreams
            const datastreams = _.get(record['metadata'], attField, []) as Datastream[];
            await this.DatastreamService.addDatastreams(oid, datastreams);
          }
          return this.sendResp(req, res, { data: result });
        } else {
          // not processing datastreams...
          return this.sendResp(req, res, { data: result });
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: "Update Metadata failed" }]
        });
      }
    }

    public async updateObjectMeta(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const oid = req.param('oid');

      let record;
      try {
        record = await this.RecordsService.getMeta(oid);
        record["metaMetadata"] = req.body;
      } catch (err) {
        return this.sendResp(req, res, { errors: [this.asError(err)], displayErrors: [{ detail: "Updated" }] });
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user ?? {});
        return this.sendResp(req, res, { data: result });
      } catch (err) {
        return this.sendResp(req, res, { errors: [this.asError(err)], displayErrors: [{ detail: "Updated" }] });
      }
    }

    public create(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const recordType = req.param('recordType');
      const user = req.user ?? {} as globalThis.Record<string, unknown>;
      const body = req.body;
      const that = this;
      if (body != null) {
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
          authorizationEdit.push((req.user ?? {} as globalThis.Record<string, unknown>).username);
          authorizationView.push((req.user ?? {} as globalThis.Record<string, unknown>).username);
        }
        const authorization = {
          edit: authorizationEdit,
          view: authorizationView,
          editPending: authorizationEditPending,
          viewPending: authorizationViewPending
        }

        const recordTypeObservable = RecordTypesService.get(brand, recordType);

        recordTypeObservable.subscribe((recordTypeModel: unknown) => {
          if (recordTypeModel) {
            const metadata = body["metadata"];
            const workflowStage = body["workflowStage"];
            const request: globalThis.Record<string, unknown> = {};

            //if no metadata field, no authorization
            if (metadata == null) {
              request["metadata"] = body;
            } else {
              request["metadata"] = metadata;
            }
            request["authorization"] = authorization;

            const createPromise = this.RecordsService.create(brand, request, recordTypeModel, user);

            const obs = from(createPromise);
            obs.subscribe((response) => {
              if (response.isSuccessful()) {

                if (workflowStage) {
                  WorkflowStepsService.get(recordTypeModel, workflowStage).subscribe(wfStep => {
                    that.RecordsService.setWorkflowStepRelatedMetadata(request, wfStep as globalThis.Record<string, unknown>);
                  });
                }
                return this.sendResp(req, res, {
                  status: 201,
                  data: response,
                  headers: {
                    'Location': sails.config.appUrl + BrandingService.getBrandAndPortalPath(req) + "/api/records/metadata/" + response.oid,
                  }
                });
              } else {
                return this.sendResp(req, res, {
                  status: 500,
                  displayErrors: [{ detail: "Create Record failed" }]
                });
              }
            }, (error: unknown) => {
              return this.sendResp(req, res, {
                errors: [this.asError(error)],
                displayErrors: [{ detail: "Create Record failed" }]
              });
            });
            return;

          } else {
            return this.sendResp(req, res, {
              status: 400, displayErrors: [{ detail: "Record Type provided is not valid" }]
            });
          }
        }
        );
      }
    }

    public async getDataStream(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      const datastreamId = req.param('datastreamId');
      sails.log.debug(`getDataStream ${oid} ${datastreamId}`);
      try {
        let found: globalThis.Record<string, unknown> | null = null;
        const attachments = await this.RecordsService.getAttachments(oid);
        for (const attachment of attachments) {
          if (attachment.fileId == datastreamId) {
            found = attachment;
          }
        }

        if (!found) {
          return this.sendResp(req, res, { status: 404 });
        }
        let mimeType = found.mimeType;
        if (_.isEmpty(mimeType)) {
          // Set octet stream as a default
          mimeType = 'application/octet-stream'
        }
        const fileName = req.param('fileName') ? req.param('fileName') : found.name ? found.name : datastreamId;
        res.set('Content-Type', 'application/octet-stream');

        const size = found.size as string | undefined;
        if (!_.isEmpty(size)) {
          res.set('Content-Length', size!);
        }

        sails.log.verbose("fileName " + fileName);
        res.attachment(fileName as string);
        sails.log.info(`Returning datastream observable of ${oid}: ${fileName}, datastreamId: ${datastreamId}`);

        try {
          const response = await this.DatastreamService.getDatastream(oid, datastreamId);
          if (response.readstream) {

            response.readstream.on('error', (error: unknown) => {
              // Handle the error here
              sails.log.error('Error reading stream:', error);
              return
            });
            response.readstream.pipe(res);
          } else {
            const body = response.body ?? '';
            const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
            res.end(buffer, 'binary');
          }
          return
        } catch (error) {
          return this.sendResp(req, res, {
            errors: [this.asError(error)],
            displayErrors: [{ detail: 'There was a problem with the upstream request.' }]
          });
        }

      } catch (error) {
        return this.sendResp(req, res, {
          errors: [this.asError(error)],
          displayErrors: [{ detail: 'There was a problem with the upstream request.' }]
        });
      }
    }

    public async addDataStreams(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      const self = this;
      const attachmentsDir = sails.config.record.attachments.file?.directory ?? sails.config.record.attachments.stageDir;
      if (!attachmentsDir) {
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: 'Attachment directory is required: configure record.attachments.file.directory or record.attachments.stageDir.' }]
        });
      }
      (req as unknown as { file: (field: string) => { upload: (...args: unknown[]) => void } }).file('attachmentFields').upload({
        dirname: `${attachmentsDir}`,
        maxBytes: 104857600,
        saveAs: function (__newFileStream: unknown, next: (err?: Error, value?: string) => void) {
          sails.log.verbose('Generating files....');
          try {
            // const nextPath = path.join(UUIDGenerator(), path.basename(__newFileStream.filename));
            const nextPath = UUIDGenerator();
            return next(undefined, nextPath);
          } catch (error) {
            sails.log.error(error);
            return next(new Error(`Could not determine an appropriate filename for uploaded filestream(s) for oid ${oid}.`));
          }
        }
      }, async function (error: unknown, UploadedFileMetadata: unknown[]) {
        if (error) {
          return self.sendResp(req, res, {
            errors: [self.asError(error)],
            displayErrors: [{ detail: `There was a problem adding datastream(s) to: ${attachmentsDir}` }]
          });
        }
        sails.log.verbose(UploadedFileMetadata);
        sails.log.verbose('Succesfully uploaded all file metadata. Sending locations downstream....');
        const fileIds: Datastream[] = (UploadedFileMetadata as globalThis.Record<string, unknown>[]).map(function (nextDescriptor) {
          return new Datastream({ fileId: path.relative(attachmentsDir, nextDescriptor.fd as string), name: nextDescriptor.filename as string, mimeType: nextDescriptor.type as string, size: nextDescriptor.size as number });
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
            return self.sendResp(req, res, { data: { message: result } });
          } else {
            return self.sendResp(req, res, {
              status: 500, displayErrors: [{ detail: defaultErrorMessage + " " + result.message }]
            });
          }

        } catch (error) {
          return self.sendResp(req, res, {
            errors: [self.asError(error)],
            displayErrors: [{ detail: defaultErrorMessage }]
          });
        }
      });
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

    private getDocMetadata(doc: { [key: string]: unknown }) {
      const metadata: { [key: string]: unknown } = {};
      for (const key in doc) {
        if (key.indexOf('authorization_') != 0 && key.indexOf('metaMetadata_') != 0) {
          metadata[key] = doc[key];
        }
        if (key == 'authorization_editRoles') {
          metadata[key] = doc[key];
        }
      }
      return metadata;
    }

    protected async getRecords(workflowState: unknown, recordType: unknown, start: unknown, rows: unknown, user: globalThis.Record<string, unknown>, roles: globalThis.Record<string, unknown>[], brand: unknown, editAccessOnly: unknown = undefined, packageType: unknown = undefined, sort: unknown = undefined, fieldNames: unknown = undefined, filterString: unknown = undefined) {
      const username = (user as globalThis.Record<string, unknown>).username;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = (recordType as string).split(',');
      }
      if (packageType != null && !_.isEmpty(packageType)) {
        packageType = (packageType as string).split(',');
      }
      if (start == null) {
        start = 0;
      }
      if (rows == undefined) {
        rows = 10;
      }
      const results = await this.RecordsService.getRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, fieldNames, filterString);
      sails.log.debug(results);
      const apiReponse: ListAPIResponse<unknown> = new ListAPIResponse();
      const totalItems = results.totalItems
      const startIndex = start as number;
      const noItems = rows as number;
      const pageNumber = Math.floor((startIndex / noItems) + 1);

      apiReponse.summary.numFound = totalItems;
      apiReponse.summary.start = startIndex;
      apiReponse.summary.page = pageNumber;


      const items = [];
      const docs = results["items"];

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i] as globalThis.Record<string, unknown>;
        const item: { [key: string]: unknown } = {};
        item["oid"] = doc["redboxOid"];
        const docMetadata = (doc["metadata"] ?? {}) as globalThis.Record<string, unknown>;
        item["title"] = docMetadata["title"];
        item["metadata"] = docMetadata;
        item["dateCreated"] = doc["dateCreated"];
        item["dateModified"] = doc["lastSaveDate"];
        item["hasEditAccess"] = this.RecordsService.hasEditAccess(brand, user, roles, doc);
        items.push(item);
      }
      apiReponse.records = items;
      return apiReponse;

    }

    protected async getDeletedRecords(workflowState: unknown, recordType: unknown, start: unknown, rows: unknown, user: globalThis.Record<string, unknown>, roles: globalThis.Record<string, unknown>[], brand: unknown, editAccessOnly: unknown = undefined, packageType: unknown = undefined, sort: unknown = undefined, fieldNames: unknown = undefined, filterString: unknown = undefined) {
      const username = (user as globalThis.Record<string, unknown>).username;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = (recordType as string).split(',');
      }
      if (packageType != null && !_.isEmpty(packageType)) {
        packageType = (packageType as string).split(',');
      }
      if (start == null) {
        start = 0;
      }
      if (rows == undefined) {
        rows = 10;
      }
      const results = await this.RecordsService.getDeletedRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, fieldNames, filterString);
      sails.log.debug(results);
      const apiReponse: ListAPIResponse<unknown> = new ListAPIResponse();
      const totalItems = results.totalItems
      const startIndex = start as number;
      const noItems = rows as number;
      const pageNumber = Math.floor((startIndex / noItems) + 1);

      apiReponse.summary.numFound = totalItems;
      apiReponse.summary.start = startIndex;
      apiReponse.summary.page = pageNumber;


      const items = [];
      const docs = results["items"];

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i] as globalThis.Record<string, unknown>;
        const item: { [key: string]: unknown } = {};
        const deletedRecord = (doc["deletedRecordMetadata"] ?? {}) as globalThis.Record<string, unknown>;
        const deletedRecordMetadata = (deletedRecord["metadata"] ?? {}) as globalThis.Record<string, unknown>;
        item["oid"] = doc["redboxOid"];
        item["title"] = deletedRecordMetadata["title"];
        item["deletedRecord"] = deletedRecord;
        item["dateCreated"] = doc["dateCreated"];
        item["dateModified"] = doc["lastSaveDate"];
        item["dateDeleted"] = doc["dateDeleted"];
        items.push(item);
      }
      apiReponse.records = items;
      return apiReponse;

    }

    public listRecords(req: Sails.Req, res: Sails.Res) {
      //sails.log.debug('api-list-records');
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const editAccessOnly = req.query.editOnly;

      let roles: globalThis.Record<string, unknown>[] = [];
      let username = "guest";
      let user: globalThis.Record<string, unknown> = {};
      if (req.isAuthenticated()) {
        roles = req.user!.roles as globalThis.Record<string, unknown>[];
        user = req.user ?? {};
        username = req.user!.username as string;
      } else {
        // assign default role if needed...
        user = { username: username };
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand) as unknown as globalThis.Record<string, unknown>);
      }
      const recordType = req.param('recordType');
      const workflowState = req.param('state');
      const start = req.param('start');
      const rows = req.param('rows');
      const packageType = req.param('packageType');
      const sort = req.param('sort');
      const filterFieldString = req.param('filterFields');
      let filterString: string | undefined = req.param('filter');
      let filterFields: string[] | undefined = undefined;

      if (!_.isEmpty(filterFieldString)) {
        filterFields = filterString!.split(',')
      } else {
        filterString = undefined;
      }

      if (Number(rows) > Number((sails.config.api as unknown as globalThis.Record<string, unknown>).max_requests)) {
        return this.reachedMaxRequestRows(req, res);
      } else {
        // sails.log.debug(`getRecords: ${recordType} ${workflowState} ${start}`);
        // sails.log.debug(`${rows} ${packageType} ${sort}`);
        return this
          .getRecords(workflowState, recordType, start, rows, user, roles, brand, editAccessOnly, packageType, sort, filterFields, filterString)
          .then(response => {
            this.sendResp(req, res, { data: response });
          })
          .catch(error => {
            this.sendResp(req, res, { errors: [this.asError(error)], displayErrors: [{ detail: error['error'] }] });
          });
      }
    }

    public async restoreRecord(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      const user = req.user ?? {} as globalThis.Record<string, unknown>;
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: "Missing ID of record." }]
        });
      }

      const response = await this.RecordsService.restoreRecord(oid, user);
      if (response.isSuccessful()) {
        return this.sendResp(req, res, { data: response });
      } else {
        sails.log.verbose(`Restore attempt failed for OID: ${oid}`);
        sails.log.verbose(JSON.stringify(response));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: response.message, detail: String(response.details ?? '') }]
        });
      }
    }

    public async deleteRecord(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      const permanentlyDelete = req.query.permanent === 'true';
      const user = req.user ?? {} as globalThis.Record<string, unknown>;
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400, displayErrors: [{ detail: "Missing ID of record." }]
        });
      }
      const record = await this.RecordsService.getMeta(oid);
      if (_.isEmpty(record)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: "Record not found!" }]
        });
      }
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      if (_.isEmpty(brand)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: "Missing brand." }]
        });
      }
      const recordType = await firstValueFrom(RecordTypesService.get(brand, record.metaMetadata.type));
      const response = await this.RecordsService.delete(oid, permanentlyDelete, record, recordType, user);
      if (response.isSuccessful()) {
        return this.sendResp(req, res, { data: response });
      } else {
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: response.message, detail: `${String(response.details ?? '')} Delete attempt failed for OID: ${oid}` }]
        });
      }
    }

    public async destroyDeletedRecord(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      const user = req.user ?? {} as globalThis.Record<string, unknown>;
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: "Missing ID of record." }]
        });
      }
      const response = await this.RecordsService.destroyDeletedRecord(oid, user);
      if (response.isSuccessful()) {
        return this.sendResp(req, res, { data: response });
      } else {
        return this.sendResp(req, res, {
          status: 500, displayErrors: [{ title: response.message, detail: `${String(response.details ?? '')} Destroy attempt failed for OID: ${oid}` }]
        });
      }
    }

    public async transitionWorkflow(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      const targetStepName = req.param('targetStep');
      try {
        if (_.isEmpty(oid)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: "Missing ID of record." }]
          });
        }
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
        const record = await this.RecordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return this.sendResp(req, res, {
            status: 500, displayErrors: [{ detail: `Missing OID: ${oid}` }]
          });
        }
        if (!this.RecordsService.hasEditAccess(brand, req.user ?? {}, (req.user ?? {}).roles as globalThis.Record<string, unknown>[] ?? [], record)) {
          return this.sendResp(req, res, {
            status: 500, displayErrors: [{ detail: `User has no edit permissions for :${oid}` }]
          });
        }
        const recType = await firstValueFrom(RecordTypesService.get(brand, record.metaMetadata.type));
        const nextStep = await firstValueFrom(WorkflowStepsService.get(recType, targetStepName));
        const response = await this.RecordsService.updateMeta(brand, oid, record, req.user ?? {}, true, true, nextStep);
        return this.sendResp(req, res, { data: response });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: `Failed to transition workflow to ${targetStepName} for oid ${oid}.` }]
        });
      }
    }

    public async listDatastreams(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400, displayErrors: [{ detail: "Missing ID of record." }]
        });
      }
      try {
        const attachments = await this.RecordsService.getAttachments(oid);
        sails.log.verbose(JSON.stringify(attachments));
        const response: ListAPIResponse<unknown> = new ListAPIResponse<unknown>();
        response.summary.numFound = _.size(attachments);
        response.summary.page = 1;
        response.records = attachments;
        return this.sendResp(req, res, { data: response });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: `Failed to list attachments for ${oid}, pleas.` }]
        });
      }
    }

    public async addRoleEdit(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
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
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed adding an editor role.' }]
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user ?? {});
        if (!result.isSuccessful()) {
          return this.sendResp(req, res, {
            status: 500, displayErrors: [{ detail: `Failed to update record with oid ${oid}.` }]
          });
        }
        const recordResult = await this.RecordsService.getMeta(result.oid);
        return this.sendResp(req, res, { data: recordResult["authorization"] });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed adding an editor role.' }]
        });
      }
    }

    public async addRoleView(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
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
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed getting record meta for adding a viewer role.' }]
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user ?? {});
        if (!result.isSuccessful()) {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: `Failed to update record with oid ${oid}.` }]
          });
        }
        const resultRecord = await this.RecordsService.getMeta(result["oid"]);
        return this.sendResp(req, res, { data: resultRecord["authorization"] });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed updating record meta for adding a viewer role.' }]
        });
      }
    }

    public async removeRoleEdit(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
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
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed getting record meta for removing an editor role.' }]
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user ?? {});
        if (!result.isSuccessful()) {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: `Failed to update record with oid ${oid}.` }]
          });
        }
        const resultRecord = await this.RecordsService.getMeta(result["oid"]);
        return this.sendResp(req, res, { data: resultRecord["authorization"] });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed updating record meta for removing an editor role.' }]
        });
      }
    }

    public async removeRoleView(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
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
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed getting record meta for removing a viewer role.' }]
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(brand, oid, record, req.user ?? {});
        if (!result.isSuccessful()) {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: `Failed to update record with oid ${oid}.` }]
          });
        }
        const resultRecord = await this.RecordsService.getMeta(result['oid']);
        return this.sendResp(req, res, { data: resultRecord['authorization'] });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed getting record meta for removing a viewer role.' }]
        });
      }
    }

    public async harvest(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);

      let updateMode = req.param('updateMode')
      if (_.isEmpty(updateMode)) {
        updateMode = "override";
      }

      const recordType = req.param('recordType');
      const recordTypeModel: RecordTypeModel = await firstValueFrom(RecordTypesService.get(brand, recordType));

      if (recordTypeModel == null) {
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: "Record Type provided is not valid" }] });
      }
      const user = (req.user ?? {}) as UserModel;
      const body = req.body;
      if (body != null) {

        if (_.isEmpty(body["records"])) {
          return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: "Invalid request body" }] });
        }
        const recordResponses = [];
        const records = body['records'];
        for (const record of records) {
          const harvestId = record["harvestId"]
          if (_.isEmpty(harvestId)) {
            recordResponses.push(new APIHarvestResponse(harvestId, '', false, "HarvestId was not specified"));
          } else {
            const existingRecord = await this.findExistingHarvestRecord(harvestId, recordType)
            if (existingRecord.length == 0 || updateMode == "create") {
              recordResponses.push(await this.createHarvestRecord(brand, recordTypeModel, record['recordRequest'] as globalThis.Record<string, unknown>, harvestId, updateMode, user));
            } else {
              const oid = existingRecord[0].redboxOid as string;
              if (updateMode != "ignore") {
                const newMetadata = (record['recordRequest']?.metadata ?? record['recordRequest']) as globalThis.Record<string, unknown>;
                const existingMetadata = (existingRecord[0]?.metadata ?? {}) as globalThis.Record<string, unknown>;
                if (this.isMetadataEqual(newMetadata, existingMetadata)) {
                  recordResponses.push(new APIHarvestResponse(harvestId, oid, true, `Record ignored as the record already exists. oid: ${oid}`))
                } else {
                  recordResponses.push(await this.updateHarvestRecord(brand, recordTypeModel, updateMode, record['recordRequest']['metadata'] as globalThis.Record<string, unknown>, oid, harvestId, user));
                }
              } else {
                recordResponses.push(new APIHarvestResponse(harvestId, oid, true, `Record ignored as the record already exists. oid: ${oid}`))
              }
            }
          }
        }
        return this.sendResp(req, res, { data: recordResponses });
      }
      return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: "Invalid request" }] });
    }

    public async legacyHarvest(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);

      const recordType = req.param('recordType');
      const recordTypeModel: RecordTypeModel = await firstValueFrom(RecordTypesService.get(brand, recordType));

      if (recordTypeModel == null) {
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Record Type provided is not valid' }] });
      }
      const user = (req.user ?? {}) as UserModel;
      const body = req.body;
      if (body != null) {

        if (_.isEmpty(body['records'])) {
          return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Invalid request body' }] });
        }
        const recordResponses = [];
        const records = body['records'];

        for (const record of records) {
          const harvestId = record['harvest_id'];
          if (_.isEmpty(harvestId)) {
            recordResponses.push(new APIHarvestResponse(harvestId, '', false, 'HarvestId was not specified'));
          } else {
            const existingRecord = await this.findExistingHarvestRecord(harvestId, recordType);
            if (existingRecord.length == 0) {
              recordResponses.push(await this.createHarvestRecord(brand, recordTypeModel, record['metadata']['data'] as globalThis.Record<string, unknown>, harvestId, 'update', user));
            } else {
              const merge = req.query['merge'];
              let updateMode = 'update';
              if (merge == 'true') {
                updateMode = 'merge';
              }
              const oid = existingRecord[0].redboxOid as string;
              const oldMetadata = (existingRecord[0].metadata ?? {}) as globalThis.Record<string, unknown>;
              const newMetadata = record['metadata']['data'] as globalThis.Record<string, unknown>;

              if (this.isMetadataEqual(newMetadata, oldMetadata)) {
                const response = {
                  details: '',
                  message: `skip update of harvestId ${harvestId} oid ${oid} metadata sent is equal to metadata in existing record`,
                  harvestId: harvestId,
                  oid: oid,
                  status: true
                }
                recordResponses.push(response);
              } else {
                const response = await this.updateHarvestRecord(brand, recordTypeModel, updateMode, newMetadata, oid as string, harvestId, user);
                recordResponses.push(response);
              }
            }
          }
        }
        return this.sendResp(req, res, { data: recordResponses });
      }
      return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Invalid request' }] });
    }

    private async updateHarvestRecord(brand: BrandingModel, recordTypeModel: RecordTypeModel, updateMode: string, body: globalThis.Record<string, unknown>, oid: string, harvestId: string, user: UserModel) {

      const shouldMerge = updateMode == "merge" ? true : false;
      try {
        const record: RecordModel = await this.RecordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return new APIHarvestResponse(harvestId, oid, false, `Failed to update meta, cannot find existing record with oid: ${oid}`);
        }
        try {
          if (shouldMerge) {
            // behavior modified from replacing arrays to appending to arrays:
            record["metadata"] = _.mergeWith(record.metadata, body, (objValue: unknown, srcValue: unknown) => {
              if (_.isArray(objValue)) {
                return (objValue as unknown[]).concat(srcValue as unknown[]);
              }
              return undefined;
            });
          } else {
            record["metadata"] = body;
          }
          const sourceMetadata = body["sourceMetadata"];
          if (!_.isEmpty(sourceMetadata)) {
            //Force this to be stored as a string
            (record['metaMetadata'] as unknown as globalThis.Record<string, unknown>)["sourceMetadata"] = "" + sourceMetadata
          }
          await this.RecordsService.updateMeta(brand, oid, record, user);

          let updateMessage = "Record updated successfully";
          if (shouldMerge) {
            updateMessage = "Record merged successfully";
          }
          return new APIHarvestResponse(harvestId, oid, true, updateMessage)

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
      const results = await (global as unknown as globalThis.Record<string, unknown> & { Record: { find: (criteria: globalThis.Record<string, unknown>) => { meta: (opts: globalThis.Record<string, unknown>) => Promise<globalThis.Record<string, unknown>[]> } } }).Record.find({
        'harvestId': harvestId,
        'metaMetadata.type': recordType
      }).meta({
        enableExperimentalDeepTargets: true
      })
      return results;
    }

    private async createHarvestRecord(brand: BrandingModel, recordTypeModel: RecordTypeModel, body: globalThis.Record<string, unknown>, harvestId: string, updateMode: string, user: UserModel) {
      let authorizationEdit, authorizationView;
      if (body['authorization'] != null) {
        const auth = body['authorization'] as globalThis.Record<string, unknown>;
        authorizationEdit = auth['edit'];
        authorizationView = auth['view'];
      } else {
        // If no authorization block set to user
        body['authorization'] = [];
        authorizationEdit = [];
        authorizationView = [];
        authorizationEdit.push(user.username);
        authorizationView.push(user.username);
      }

      const metadata = body['metadata'];
      const workflowStage = body['workflowStage'];
      const request: globalThis.Record<string, unknown> = {};
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
        const response = await this.RecordsService.create(brand, request, recordTypeModel, user);

        if (workflowStage) {
          const wfStep = await firstValueFrom(WorkflowStepsService.get(recordTypeModel, workflowStage as string));
          this.RecordsService.setWorkflowStepRelatedMetadata(request, wfStep as globalThis.Record<string, unknown>);
        }

        if (response.isSuccessful()) {
          return new APIHarvestResponse(harvestId, response.oid, true, `Record created successfully`);
        } else {
          const result = new APIHarvestResponse(harvestId, '', false, `Record creation failed`);
          sails.log.error(result);
          return result
        }
      } catch (error) {
        const result = new APIHarvestResponse(harvestId, '', false, String(error));
        sails.log.error(error, result);
        return result;
      }
    }

    private isMetadataEqual(meta1: globalThis.Record<string, unknown>, meta2: globalThis.Record<string, unknown>): boolean {

      const keys = _.keys(meta1);

      for (const key of keys) {
        if (!_.isEqual(meta1?.[key], meta2?.[key])) {
          return false;
        }
      }

      return true;
    }

    public listDeletedRecords(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const editAccessOnly = req.query.editOnly;

      let roles: globalThis.Record<string, unknown>[] = [];
      let user: globalThis.Record<string, unknown> = {};
      if (req.isAuthenticated()) {
        roles = req.user!.roles as globalThis.Record<string, unknown>[];
        user = req.user ?? {};
      } else {
        // assign default role if needed...
        user = { username: "guest" };
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand) as unknown as globalThis.Record<string, unknown>);
      }
      const recordType = req.param('recordType');
      const workflowState = req.param('state');
      const start = req.param('start');
      const rows = req.param('rows');
      const packageType = req.param('packageType');
      const sort = req.param('sort');
      const filterFieldString = req.param('filterFields');
      let filterString: string | undefined = req.param('filter');
      let filterFields: string[] | undefined = undefined;

      if (!_.isEmpty(filterFieldString)) {
        filterFields = filterString!.split(',')
      } else {
        filterString = undefined;
      }

      if (Number(rows) > Number((sails.config.api as unknown as globalThis.Record<string, unknown>).max_requests)) {
        return this.reachedMaxRequestRows(req, res);
      } else {
        return this.getDeletedRecords(workflowState, recordType, start, rows, user, roles, brand, editAccessOnly, packageType, sort, filterFields, filterString)
          .then(response => {
            this.sendResp(req, res, { data: response });
          }).catch(error => {
            return this.sendResp(req, res, { errors: [this.asError(error)], displayErrors: [{ detail: error['error'] }] });
          });
      }
    }

    private reachedMaxRequestRows(req: Sails.Req, res: Sails.Res) {
      const descr = "You have reached the maximum of request available; Max rows per request " + sails.config.api.max_requests;
      return this.sendResp(req, res, {
        status: 400,
        displayErrors: [{
          detail: descr,
          meta: {
            "code": 400,
            "contactEmail": null,
            "description": descr,
            "homeRef": "/",
            "reasonPhrase": "Bad Request",
            "uri": "http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.4.1"
          }
        }]
      });
    }
  }
}
