import { firstValueFrom, Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs';
import { randomUUID } from 'crypto';

import type { Model } from 'sails';
import { DateTime } from 'luxon';

import mongodb = require('mongodb');
import type { Collection, Db, Document, FindCursor, FindOptions, GridFSFile } from 'mongodb';
import stream = require('stream');
import { Transform, transforms } from 'json2csv';
import {
  Services as services,
  StorageManagerService as StorageManagerServiceTypes,
  DatastreamService,
  StorageService,
  StorageServiceResponse,
  DatastreamServiceResponse,
  Datastream,
  Attachment,
  RecordAuditModel,
  RecordAuditParams,
  RecordModel,
  BrandingModel,
  UserModel,
  RoleModel,
} from '@researchdatabox/redbox-core';
import { ExportJSONTransformer } from '@researchdatabox/redbox-core';

const { flatten } = transforms;

declare const sails: Sails.Application;
declare const _: typeof import('lodash');
type JsonMap = Record<string, unknown>;
type StorageRecord = RecordModel;
type MongoRecordDocument = Document;
type WaterlineModel = Model;
type AttachmentDescriptor = JsonMap & { type?: string; fileId?: string };
type DatastreamContent = { readstream?: NodeJS.ReadableStream; body?: Buffer | string } & Record<string, unknown>;

declare const Record: WaterlineModel;
declare const DeletedRecord: WaterlineModel;
declare const RecordAudit: WaterlineModel;

type RelatedRecordsContext = {
  processedRelationships: string[];
  relatedObjects: Record<string, MongoRecordDocument[]>;
};

export namespace Services {
  export class MongoStorageService extends services.Core.Service implements StorageService, DatastreamService {
    gridFsBucket!: mongodb.GridFSBucket;
    db!: Db;
    recordCol!: Collection<MongoRecordDocument>;
    deletedRecordCol!: Collection<MongoRecordDocument>;
    private _readyHookRegistered = false;

    protected _exportedMethods: string[] = [
      'init',
      'create',
      'updateMeta',
      'getMeta',
      'createBatch',
      'provideUserAccessAndRemovePendingAccess',
      'getRelatedRecords',
      'delete',
      'updateNotificationLog',
      'getRecords',
      'restoreRecord',
      'destroyDeletedRecord',
      'getDeletedRecords',
      'exportAllPlans',
      'addDatastreams',
      'updateDatastream',
      'removeDatastream',
      'addDatastream',
      'addAndRemoveDatastreams',
      'getDatastream',
      'listDatastreams',
      'createRecordAudit',
      'getRecordAudit',
      'exists',
    ];

    constructor() {
      super();
      this.logHeader = 'MongoStorageService::';
      this.registerReadyHook();
    }

    private getUuid(): string {
      return randomUUID().replace(/-/g, '');
    }

    private getErrorMessage(err: unknown): string {
      if (err instanceof Error) {
        return err.message;
      }
      return String(err);
    }

    public init(): void {
      this.registerReadyHook();
      void this.performInit();
    }

    private registerReadyHook(): void {
      if (this._readyHookRegistered) {
        return;
      }
      this._readyHookRegistered = true;
      const that = this;
      this.registerSailsHook('on', 'ready', function () {
        void that.performInit();
      });
    }

    private async collectionExists(collectionName: string): Promise<boolean> {
      if (typeof this.db.listCollections === 'function') {
        const collectionInfo = await this.db.listCollections({ name: collectionName }, { nameOnly: true }).toArray();
        if (!_.isEmpty(collectionInfo)) {
          sails.log.verbose(`${this.logHeader} Collection '${collectionName}' info:`);
          sails.log.verbose(JSON.stringify(collectionInfo));
          return true;
        }
        return false;
      }

      try {
        const collectionInfo = this.db.collection(
          collectionName,
          { strict: true } as mongodb.CollectionOptions
        );
        sails.log.verbose(`${this.logHeader} Collection '${collectionName}' info:`);
        sails.log.verbose(JSON.stringify(collectionInfo));
        return true;
      } catch (_err) {
        return false;
      }
    }

    private async performInit(): Promise<void> {
      if (this.recordCol && this.deletedRecordCol && this.gridFsBucket) {
        return;
      }
      this.db = Record.getDatastore().manager as Db;
      if (!(await this.collectionExists(Record.tableName))) {
        sails.log.verbose(`Collection doesn't exist, creating: ${Record.tableName}`);
        const uuid = this.getUuid();
        const initRec = { redboxOid: uuid };
        await Record.create(initRec);
        await Record.destroyOne({ redboxOid: uuid });
      }
      this.gridFsBucket = new mongodb.GridFSBucket(this.db);
      this.recordCol = this.db.collection<MongoRecordDocument>(Record.tableName);
      this.deletedRecordCol = this.db.collection<MongoRecordDocument>(DeletedRecord.tableName);
      await this.createIndices(this.db);
      sails.emit('hook:redbox:storage:ready');
      sails.emit('hook:redbox:datastream:ready');
      sails.log.verbose(`${this.logHeader} Ready!`);
    }

    private async createIndices(db: Db) {
      sails.log.verbose(`${this.logHeader} Existing indices:`);
      const currentIndices = await db.collection<MongoRecordDocument>(Record.tableName).indexes();
      sails.log.verbose(JSON.stringify(currentIndices));
      try {
        const storageConfig = sails.config.storage as { mongodb?: { indices?: mongodb.IndexDescription[] } };
        const indices = storageConfig.mongodb?.indices ?? [];
        if (_.size(indices) > 0) {
          await db.collection<MongoRecordDocument>(Record.tableName).createIndexes(indices);
        }
      } catch (err) {
        sails.log.error(`Failed to create indices:`);
        sails.log.error(JSON.stringify(err));
      }
    }

    public async create(
      _brand: BrandingModel,
      record: JsonMap,
      _recordType: unknown,
      _user?: unknown
    ): Promise<StorageServiceResponse> {
      sails.log.verbose(`${this.logHeader} create() -> Begin`);
      const response = new StorageServiceResponse();
      record.redboxOid = this.getUuid();
      response.oid = String(record.redboxOid);

      try {
        sails.log.verbose(`${this.logHeader} Saving to DB...`);
        await Record.create(record);
        response.success = true;
        sails.log.verbose(`${this.logHeader} Record created...`);
      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to create Record:`);
        sails.log.error(JSON.stringify(err));
        response.success = false;
        response.message = this.getErrorMessage(err);
        return response;
      }
      sails.log.verbose(JSON.stringify(response));
      sails.log.verbose(`${this.logHeader} create() -> End`);
      return response;
    }

    public async updateMeta(brand: BrandingModel, oid: string, record: JsonMap, user?: UserModel): Promise<StorageServiceResponse> {
      const response = new StorageServiceResponse();
      response.oid = oid;
      try {
        _.unset(record, 'dateCreated');
        _.unset(record, 'lastSaveDate');
        _.unset(record, '_id');
        _.unset(record, 'id');

        await Record.updateOne({ redboxOid: oid }).set(record);
        response.success = true;
      } catch (err) {
        sails.log.error(
          `${this.logHeader} Failed to save update to MongoDB: ${JSON.stringify({
            error: err,
            response,
            brand,
            oid,
            record,
            user,
          })}`
        );
        response.success = false;
        response.message = this.getErrorMessage(err);
      }
      return response;
    }

    public async getMeta(oid: string): Promise<RecordModel> {
      if (_.isEmpty(oid)) {
        const msg = `${this.logHeader} getMeta() -> refusing to search using an empty OID`;
        sails.log.error(msg);
        throw new Error(msg);
      }
      const criteria = { redboxOid: oid };
      sails.log.verbose(`${this.logHeader} finding: `);
      sails.log.verbose(JSON.stringify(criteria));
      return (await Record.findOne(criteria)) as RecordModel;
    }

    public async createBatch(type: string, data: JsonMap[], harvestIdFldName: string): Promise<unknown> {
      const response = new StorageServiceResponse();
      response.message = '';
      let failFlag = false;
      _.each(data, async (dataItem: JsonMap) => {
        dataItem.harvestId = _.get(dataItem, harvestIdFldName, '');
        _.set(dataItem, 'metaMetadata.type', type);
        try {
          await this.create(null, dataItem, null, null);
        } catch (err) {
          failFlag = true;
          sails.log.error(`${this.logHeader} Failed createBatch entry: `);
          sails.log.error(JSON.stringify(dataItem));
          sails.log.error(`${this.logHeader} Failed createBatch error: `);
          sails.log.error(JSON.stringify(err));
          response.message = `${response.message}, ${err.message}`;
        }
      });
      response.success = failFlag === false;
      return response;
    }

    public provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue): void {
      const batchFn = async () => {
        const metadata = (await this.getMeta(oid)) as StorageRecord;

        const pendingEditArray = _.get(metadata, 'authorization.editPending', []) as string[];
        const editArray = _.get(metadata, 'authorization.edit', []) as string[];
        const pendingEditArrayFiltered = pendingEditArray.filter(value => value !== pendingValue);
        const pendingEditFound = pendingEditArray.length > pendingEditArrayFiltered.length;

        if (pendingEditFound && !editArray.includes(userid)) {
          editArray.push(userid);
        }

        _.set(metadata, 'authorization.editPending', pendingEditArrayFiltered);
        _.set(metadata, 'authorization.edit', editArray);

        const pendingViewArray = _.get(metadata, 'authorization.viewPending', []) as string[];
        const viewArray = _.get(metadata, 'authorization.view', []) as string[];
        const pendingViewArrayFiltered = pendingViewArray.filter(value => value !== pendingValue);
        const pendingViewFound = pendingViewArray.length > pendingViewArrayFiltered.length;

        if (pendingViewFound && !viewArray.includes(userid)) {
          viewArray.push(userid);
        }

        _.set(metadata, 'authorization.viewPending', pendingViewArrayFiltered);
        _.set(metadata, 'authorization.view', viewArray);

        try {
          await this.updateMeta(null, oid, metadata);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to update on 'provideUserAccessAndRemovePendingAccess': `);
          sails.log.error(JSON.stringify(err));
        }
      };

      batchFn();
    }

    public async getRelatedRecords(oid: string, brand: BrandingModel, recordTypeName: string | null = null, mappingContext: RelatedRecordsContext | null = null) {
      const record = (await this.getMeta(oid)) as JsonMap;
      if (_.isEmpty(recordTypeName)) {
        recordTypeName = String(_.get(record, 'metaMetadata.type', ''));
      }
      const recordType = await firstValueFrom(RecordTypesService.get(brand as never, recordTypeName));
      if (_.isEmpty(mappingContext)) {
        mappingContext = {
          processedRelationships: [recordTypeName],
          relatedObjects: {},
        };
        mappingContext.relatedObjects[recordTypeName] = [record];
      }
      const relatedTo = recordType['relatedTo'];
      if (_.isArray(relatedTo) && _.size(relatedTo) > 0) {
        for (const relationship of relatedTo) {
          sails.log.verbose(`${this.logHeader} Processing relationship:`);
          sails.log.verbose(JSON.stringify(relationship));
          const targetRecordType = relationship['recordType'];
          const criteria: JsonMap = {};
          criteria['metaMetadata.type'] = targetRecordType;
          criteria[relationship['foreignField']] = oid;
          sails.log.verbose(`${this.logHeader} Finding related records criteria:`);
          sails.log.verbose(JSON.stringify(criteria));

          const relatedRecords = await Record.find(criteria).meta({ enableExperimentalDeepTargets: true });
          sails.log.verbose(`${this.logHeader} Got related records:`);
          sails.log.verbose(JSON.stringify(relatedRecords));
          if (_.size(relatedRecords) > 0) {
            if (_.isEmpty(mappingContext.relatedObjects[targetRecordType])) {
              mappingContext.relatedObjects[targetRecordType] = relatedRecords;
            } else {
              mappingContext.relatedObjects[targetRecordType] =
                mappingContext.relatedObjects[targetRecordType].concat(relatedRecords);
            }
            for (let j = 0; j < relatedRecords.length; j++) {
              const recordRelationship = relatedRecords[j] as JsonMap;
              mappingContext = await this.getRelatedRecords(String(recordRelationship.redboxOid), brand, null, mappingContext);
            }
          }
          if (!_.includes(mappingContext.processedRelationships, targetRecordType)) {
            mappingContext.processedRelationships.push(targetRecordType);
          }
        }
      } else {
        sails.log.verbose(`${this.logHeader} RecordType has no relationships: ${recordTypeName}`);
      }
      sails.log.verbose(`${this.logHeader} Current mapping context:`);
      sails.log.verbose(JSON.stringify(mappingContext));
      return mappingContext;
    }

    public async delete(oid: string, permanentlyDelete: boolean = false): Promise<StorageServiceResponse> {
      const response = new StorageServiceResponse();

      try {
        if (permanentlyDelete) {
          const datastreams = await this.listDatastreams(oid, null);
          if (_.size(datastreams) > 0) {
            _.each(datastreams, async file => {
              sails.log.verbose(`Deleting:`);
              sails.log.verbose(JSON.stringify(file));
              try {
                await this.gridFsBucket.delete(file['_id'] as mongodb.ObjectId);
              } catch (err) {
                sails.log.error(`Error deleting: ${file['_id']}`);
                sails.log.error(JSON.stringify(err));
              }
            });
          }
        } else {
          const record = (await this.getMeta(oid)) as JsonMap;
          const deletedRecord = {
            redboxOid: record.redboxOid,
            deletedRecordMetadata: record,
          };
          await DeletedRecord.create(deletedRecord);
        }
        await Record.destroyOne({ redboxOid: oid });
        response.success = true;
      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to delete record: ${oid}`);
        sails.log.error(JSON.stringify(err));
        response.success = false;
        response.message = err.message;
      }

      return response;
    }

    public async updateNotificationLog(oid: string, record: JsonMap, options: JsonMap): Promise<unknown> {
      if (super.metTriggerCondition(oid, record, options) == 'true') {
        sails.log.verbose(`${this.logHeader} Updating notification log for oid: ${oid}`);
        const logName = _.get(options, 'logName', null);
        if (logName) {
          let log = _.get(record, logName, null);
          const entry = { date: DateTime.now().toFormat("yyyy-LL-dd'T'HH:mm:ss") };
          if (log) {
            log.push(entry);
          } else {
            log = [entry];
          }
          _.set(record, logName, log);
        }
        const updateFlagName = _.get(options, 'flagName', null);
        if (updateFlagName) {
          _.set(record, updateFlagName, _.get(options, 'flagVal', null));
        }
        sails.log.verbose(`======== Notification log updates =========`);
        sails.log.verbose(JSON.stringify(record));
        sails.log.verbose(`======== End update =========`);
        if (_.get(options, 'saveRecord', false)) {
          try {
            await this.updateMeta(null, oid, record, null);
          } catch (err) {
            sails.log.error(`${this.logHeader} Failed to update notification log of ${oid}:`);
            sails.log.error(JSON.stringify(err));
            throw err;
          }
        }
      } else {
        sails.log.verbose(
          `Notification log name: '${options.name}', for oid: ${oid}, not running, condition not met: ${options.triggerCondition}`
        );
        sails.log.verbose(JSON.stringify(record));
      }
      return record;
    }

    public async getDeletedRecords(
      workflowState: string,
      recordType = undefined,
      start: number,
      rows = 10,
      username: string,
      roles: RoleModel[],
      brand: BrandingModel,
      _editAccessOnly = undefined,
      packageType = undefined,
      sort = undefined,
      filterFields = undefined,
      filterString = undefined,
      filterMode: string = 'regex',
      secondarySort = undefined
    ) {
      const query = {
        'deletedRecordMetadata.metaMetadata.brandId': brand.id,
      };
      const options = {
        limit: _.toNumber(rows),
        skip: _.toNumber(start),
      };
      if (_.isEmpty(sort)) {
        sort = '{"lastSaveDate": -1}';
      }
      sails.log.verbose(`Sort is: ${sort}`);
      if (_.indexOf(`${sort}`, '1') == -1) {
        sort = `{"${sort}":-1}`;
      } else {
        try {
          options['sort'] = JSON.parse(sort);
        } catch (_error) {
          options['sort'] = {};
          options['sort'][`${sort.substring(0, sort.indexOf(':'))}`] = _.toNumber(
            sort.substring(sort.indexOf(':') + 1)
          );
        }
      }

      if (!_.isEmpty(secondarySort)) {
        options['sort'][`${secondarySort.substring(0, secondarySort.indexOf(':'))}`] = _.toNumber(
          secondarySort.substring(secondarySort.indexOf(':') + 1)
        );
      }

      const roleNames = this.getRoleNames(roles, brand);
      const andArray = [];
      const permissions = {
        $or: [
          { 'deletedRecordMetadata.authorization.view': username },
          { 'deletedRecordMetadata.authorization.edit': username },
          { 'deletedRecordMetadata.authorization.editRoles': { $in: roleNames } },
          { 'deletedRecordMetadata.authorization.viewRoles': { $in: roleNames } },
        ],
      };
      andArray.push(permissions);
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        const typeArray = [];
        _.each(recordType, rType => {
          typeArray.push({ 'deletedRecordMetadata.metaMetadata.type': rType });
        });
        andArray.push({ $or: typeArray });
      }
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        const typeArray = [];
        _.each(packageType, rType => {
          typeArray.push({ 'deletedRecordMetadata.metaMetadata.packageType': rType });
        });
        andArray.push({ $or: typeArray });
      }
      if (workflowState != undefined) {
        query['deletedRecordMetadata.workflow.stage'] = workflowState;
      }
      if (!_.isEmpty(filterString) && !_.isEmpty(filterFields)) {
        const escapedFilterString = this.escapeRegExp(filterString);
        sails.log.verbose('escapedFilterString ' + escapedFilterString);
        for (const filterField of filterFields) {
          const filterQuery = {};
          if (filterMode == 'equal') {
            filterQuery[filterField] = filterString;
          } else if (filterMode == 'regex') {
            filterQuery[filterField] = new RegExp(`.*${escapedFilterString}.*`);
            sails.log.verbose(filterQuery);
          }
          andArray.push(filterQuery);
        }
      }

      query['$and'] = andArray;

      sails.log.verbose(`Query: ${JSON.stringify(query)}`);
      sails.log.verbose(`Options: ${JSON.stringify(options)}`);
      const { items, totalItems } = await this.runDeletedRecordQuery(Record.tableName, query, options);
      const response = new StorageServiceResponse();
      response.success = true;
      response.items = items;
      response.totalItems = totalItems;
      return response;
    }

    public async getRecords(
      workflowState: string,
      recordType: string = undefined,
      start: number,
      rows: number = 10,
      username: string,
      roles: RoleModel[],
      brand: BrandingModel,
      _editAccessOnly = undefined,
      packageType = undefined,
      sort = undefined,
      filterFields = undefined,
      filterString = undefined,
      filterMode = undefined,
      secondarySort = undefined
    ) {
      if (_.isUndefined(filterMode) || _.isNull(filterMode) || _.isEmpty(filterMode)) {
        filterMode = 'regex';
      }
      const query = {
        'metaMetadata.brandId': brand.id,
      };
      const options = {
        limit: _.toNumber(rows),
        skip: _.toNumber(start),
      };
      if (_.isEmpty(sort)) {
        sort = '{"lastSaveDate": -1}';
      }
      sails.log.verbose(`Sort is: ${sort}`);
      if (_.indexOf(`${sort}`, '1') == -1) {
        sort = `{"${sort}":-1}`;
      } else {
        try {
          options['sort'] = JSON.parse(sort);
        } catch (_error) {
          options['sort'] = {};
          options['sort'][`${sort.substring(0, sort.indexOf(':'))}`] = _.toNumber(
            sort.substring(sort.indexOf(':') + 1)
          );
        }
      }

      if (!_.isEmpty(secondarySort)) {
        options['sort'][`${secondarySort.substring(0, secondarySort.indexOf(':'))}`] = _.toNumber(
          secondarySort.substring(secondarySort.indexOf(':') + 1)
        );
      }

      const roleNames = this.getRoleNames(roles, brand);
      const andArray = [];
      const permissions = {
        $or: [
          { 'authorization.view': username },
          { 'authorization.edit': username },
          { 'authorization.editRoles': { $in: roleNames } },
          { 'authorization.viewRoles': { $in: roleNames } },
        ],
      };
      andArray.push(permissions);
      if (_.isArray(recordType)) {
        if (recordType.length > 1) {
          const typeArray = [];
          _.each(recordType, rType => {
            typeArray.push({ 'metaMetadata.type': rType });
          });
          query['$or'] = typeArray;
        } else {
          const recType = recordType[0];
          if (!_.isUndefined(recType) && !_.isEmpty(recType)) {
            query['metaMetadata.type'] = recType;
          }
        }
      } else if (recordType != undefined && recordType != '') {
        query['metaMetadata.type'] = recordType;
      }
      if (_.isArray(packageType)) {
        if (packageType.length > 1) {
          const typeArray = [];
          _.each(packageType, rType => {
            typeArray.push({ 'metaMetadata.packageType': rType });
          });
          query['metaMetadata.packageType'] = { $or: typeArray };
        } else {
          const packType = packageType[0];
          if (!_.isUndefined(packType) && !_.isEmpty(packType)) {
            query['metaMetadata.packageType'] = packType;
          }
        }
      } else if (packageType != undefined && packageType != '') {
        query['metaMetadata.packageType'] = packageType;
      }
      if (workflowState != undefined && workflowState != '') {
        query['workflow.stage'] = workflowState;
      }
      if (!_.isEmpty(filterString) && !_.isEmpty(filterFields)) {
        const escapedFilterString = this.escapeRegExp(filterString);
        sails.log.verbose('escapedFilterString ' + escapedFilterString);
        for (const filterField of filterFields) {
          if (filterMode == 'equal') {
            query[filterField] = filterString;
          } else if (filterMode == 'regex') {
            query[filterField] = new RegExp(`.*${escapedFilterString}.*`, 'i');
          }
        }
      }

      query['$and'] = andArray;

      sails.log.verbose(query);
      sails.log.verbose(`Query: ${JSON.stringify(query)}`);
      sails.log.verbose(`Options: ${JSON.stringify(options)}`);
      const { items, totalItems } = await this.runRecordQuery(Record.tableName, query, options);
      const response = new StorageServiceResponse();
      response.success = true;
      response.items = items;
      response.totalItems = totalItems;
      return response;
    }

    private escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    protected async runRecordQuery(colName, query, options) {
      return {
        items: await this.recordCol.find(query, options).toArray(),
        totalItems: await this.recordCol.count(query),
      };
    }

    protected async runDeletedRecordQuery(colName, query, options) {
      return {
        items: await this.deletedRecordCol.find(query, options).toArray(),
        totalItems: await this.deletedRecordCol.count(query),
      };
    }

    private async *fetchAllRecords(query, options, stringifyJSON: boolean = false) {
      let skip = 0;
      const limit = options.limit;
      options.skip = skip;
      let result = await this.recordCol.find(query, options).toArray();

      while (result.length > 0) {
        for (const record of result) {
          if (stringifyJSON) {
            yield JSON.stringify(record);
          } else {
            yield record;
          }
        }
        skip = skip + limit;
        options.skip = skip;
        result = await this.recordCol.find(query, options).toArray();
      }
    }

    public exportAllPlans(username, roles, brand, format, modBefore, modAfter, recType): stream.Readable {
      const andArray = [];
      const query = {
        'metaMetadata.brandId': brand.id,
        'metaMetadata.type': recType,
      };
      const roleNames = this.getRoleNames(roles, brand);
      const permissions = {
        $or: [
          { 'authorization.view': username },
          { 'authorization.edit': username },
          { 'authorization.editRoles': { $in: roleNames } },
          { 'authorization.viewRoles': { $in: roleNames } },
        ],
      };
      andArray.push(permissions);
      const options = {
        limit: _.toNumber(sails.config.record.export.maxRecords),
        sort: {
          lastSaveDate: -1,
        },
      };
      if (!_.isEmpty(modAfter)) {
        andArray.push({
          lastSaveDate: {
            $gte: `${modAfter}`,
          },
        });
      }
      if (!_.isEmpty(modBefore)) {
        andArray.push({
          lastSaveDate: {
            $lte: `${modBefore}`,
          },
        });
      }
      query['$and'] = andArray;
      sails.log.verbose(`Query: ${JSON.stringify(query)}`);
      sails.log.verbose(`Options: ${JSON.stringify(options)}`);
      if (format == 'csv') {
        const opts = { transforms: [flatten()] };
        const transformOpts = { objectMode: true };
        const json2csv = new Transform(opts, transformOpts);
        return stream.Readable.from(this.fetchAllRecords(query, options)).pipe(json2csv);
      }

      const jsonTransformer = new ExportJSONTransformer(recType, modBefore, modAfter);
      return stream.Readable.from(this.fetchAllRecords(query, options, true)).pipe(jsonTransformer);
    }

    protected getRoleNames(roles, brand) {
      const roleNames = [];

      for (let i = 0; i < roles.length; i++) {
        const role = roles[i];
        if (role.branding == brand.id) {
          roleNames.push(roles[i].name);
        }
      }

      return roleNames;
    }

    public async addDatastreams(oid: string, fileIds: Datastream[]): Promise<DatastreamServiceResponse> {
      const response = new DatastreamServiceResponse();
      response.message = '';
      let hasFailure = false;
      for (const fileId of fileIds) {
        try {
          await this.addDatastream(oid, fileId, StorageManagerService.stagingDisk());
          const successMessage = `Successfully uploaded: ${JSON.stringify(fileId)}`;
          response.message = _.isEmpty(response.message) ? successMessage : `${response.message}\n${successMessage}`;
        } catch (err) {
          hasFailure = true;
          sails.log.error(`${this.logHeader} Failed to upload datastream for oid '${oid}':`);
          sails.log.error(err);
          const failureMessage = `Failed to upload: ${JSON.stringify(fileId)}, error is:\n${this.getErrorMessage(err)}`;
          response.message = _.isEmpty(response.message) ? failureMessage : `${response.message}\n${failureMessage}`;
        }
      }
      response.success = !hasFailure;
      return response;
    }

    public updateDatastream(
      oid: string,
      record: StorageRecord,
      newMetadata: JsonMap,
      fileRoot: string | StorageManagerServiceTypes.Services.IDisk | null,
      fileIdsAdded: Datastream[]
    ): Observable<Promise<unknown>[]> {
      let stagingDisk: StorageManagerServiceTypes.Services.IDisk;
      if (typeof fileRoot === 'string') {
        stagingDisk = StorageManagerService.disk(fileRoot);
      } else if (fileRoot && typeof fileRoot.getStream === 'function') {
        stagingDisk = fileRoot as StorageManagerServiceTypes.Services.IDisk;
      } else {
        throw new Error(
          `${this.logHeader} updateDatastream requires fileRoot to be a disk name or an IDisk instance with getStream()`
        );
      }
      return FormsService.getFormByName(record.metaMetadata.form, true, record.metaMetadata.brandId).pipe(
        mergeMap(form => {
          const formConfig = form;
          const attachmentFields = _.get(
            formConfig,
            'configuration.attachmentFields',
            _.get(formConfig, 'attachmentFields', [])
          ) as string[];
          const reqs: Promise<unknown>[] = [];
          record.metaMetadata.attachmentFields = attachmentFields;
          _.each(attachmentFields, async attField => {
            const oldAttachments = record.metadata[attField] as AttachmentDescriptor[] | undefined;
            const newAttachments = newMetadata[attField] as AttachmentDescriptor[] | undefined;
            const removeIds: Datastream[] = [];
            if (!_.isUndefined(oldAttachments) && !_.isNull(oldAttachments) && !_.isNull(newAttachments)) {
              const toRemove = _.differenceBy(oldAttachments, newAttachments, 'fileId');
              _.each(toRemove, removeAtt => {
                if (removeAtt.type == 'attachment') {
                  removeIds.push(new Datastream(removeAtt));
                }
              });
            }
            if (!_.isUndefined(newAttachments) && !_.isNull(newAttachments)) {
              const toAdd = _.differenceBy(newAttachments, oldAttachments, 'fileId');
              _.each(toAdd, addAtt => {
                if (addAtt.type == 'attachment') {
                  fileIdsAdded.push(new Datastream(addAtt));
                }
              });
            }
            reqs.push(this.addAndRemoveDatastreams(oid, fileIdsAdded, removeIds, stagingDisk));
          });
          if (_.isEmpty(reqs)) {
            reqs.push(Promise.resolve({ request: 'dummy' }));
          }
          return of(reqs);
        })
      );
    }

    public async removeDatastream(oid, datastream: Datastream) {
      const fileId = datastream.fileId;
      const fileName = `${oid}/${fileId}`;
      const fileRes = await this.getFileWithName(fileName).toArray();
      if (!_.isEmpty(fileRes)) {
        const fileDoc = fileRes[0];
        sails.log.verbose(`${this.logHeader} removeDatastream() -> Deleting:`);
        sails.log.verbose(JSON.stringify(fileDoc));
        try {
          await this.gridFsBucket.delete(fileDoc._id);
        } catch (err) {
          sails.log.error(`Error deleting: ${fileDoc._id}`);
          sails.log.error(JSON.stringify(err));
        }
        sails.log.verbose(`${this.logHeader} removeDatastream() -> Delete successful.`);
      } else {
        sails.log.verbose(`${this.logHeader} removeDatastream() -> File not found: ${fileName}`);
      }
    }

    public async addDatastream(oid, datastream: Datastream, stagingDisk?: StorageManagerServiceTypes.Services.IDisk) {
      const fileId = datastream.fileId;
      sails.log.verbose(`${this.logHeader} addDatastream() -> Meta: ${fileId}`);
      sails.log.verbose(JSON.stringify(datastream));
      const metadata = _.merge(datastream.metadata, { redboxOid: oid });
      const fileName = `${oid}/${fileId}`;
      sails.log.verbose(`${this.logHeader} addDatastream() -> Adding: ${fileName}`);
      const effectiveStagingDisk = stagingDisk ?? StorageManagerService.stagingDisk();
      const readable = await effectiveStagingDisk.getStream(fileId);
      await this.streamFileToBucket(readable, fileName, metadata);
      sails.log.verbose(`${this.logHeader} addDatastream() -> Successfully added: ${fileName}`);
    }

    private streamFileToBucket(readable: NodeJS.ReadableStream, fileName: string, metadata: unknown) {
      const uploadStream = this.gridFsBucket.openUploadStream(fileName, { metadata });
      readable.pipe(uploadStream);

      return new Promise((resolve, reject) => {
        uploadStream.on('finish', () => {
          resolve(uploadStream.gridFSFile);
        });

        uploadStream.on('error', err => {
          sails.log.error(`${this.logHeader} streamFileToBucket() -> Failed uploading '${fileName}':`);
          sails.log.error(err);
          reject(err);
        });

        readable.on('error', err => {
          sails.log.error(`${this.logHeader} streamFileToBucket() -> Failed reading source for '${fileName}':`);
          sails.log.error(err);
          reject(err);
        });
      });
    }

    public async addAndRemoveDatastreams(
      oid,
      addIds: Datastream[],
      removeIds: Datastream[],
      stagingDisk?: StorageManagerServiceTypes.Services.IDisk
    ) {
      if (!stagingDisk) {
        throw new Error('MongoStorageService.addAndRemoveDatastreams requires a staging disk');
      }
      for (const addId of addIds) {
        await this.addDatastream(oid, addId, stagingDisk);
      }
      for (const removeId of removeIds) {
        await this.removeDatastream(oid, removeId);
      }
    }

    public async getDatastream(oid: string, fileId: string): Promise<DatastreamContent> {
      return this.getDatastreamAsync(oid, fileId);
    }

    private async getDatastreamAsync(oid: string, fileId: string): Promise<DatastreamContent> {
      const fileName = `${oid}/${fileId}`;
      const fileRes = await this.getFileWithName(fileName).toArray();
      if (_.isArray(fileRes) && fileRes.length === 0) {
        throw new Error(TranslationService.t('attachment-not-found'));
      }
      const response = new Attachment() as Attachment & DatastreamContent;
      response.readstream = this.gridFsBucket.openDownloadStreamByName(fileName);
      return response;
    }

    public async listDatastreams(oid: string, fileId?: string | null): Promise<Record<string, unknown>[]> {
      let query: JsonMap = { 'metadata.redboxOid': oid };
      if (!_.isEmpty(fileId)) {
        const fileName = `${oid}/${fileId}`;
        query = { filename: fileName };
      }
      sails.log.verbose(`${this.logHeader} listDatastreams() -> Listing attachments of oid: ${oid}`);
      sails.log.verbose(JSON.stringify(query));
      return (await this.gridFsBucket.find(query, {}).toArray()) as unknown as Record<string, unknown>[];
    }

    private toJsonSafe(value: unknown): unknown {
      if (_.isUndefined(value)) {
        return undefined;
      }
      if (_.isObject(value) && !_.isPlainObject(value) && !_.isArray(value)) {
        return undefined;
      }
      try {
        const json = JSON.stringify(value);
        if (_.isUndefined(json)) {
          return undefined;
        }
        return JSON.parse(json);
      } catch (_err) {
        return undefined;
      }
    }

    private sanitizeRecordAudit(recordAudit: RecordAuditModel): RecordAuditModel {
      const payload: RecordAuditModel = {
        redboxOid: recordAudit.redboxOid,
        action: recordAudit.action,
        user: this.toJsonSafe(recordAudit.user) as Record<string, unknown> | undefined,
        record: this.toJsonSafe(recordAudit.record) as Record<string, unknown> | undefined,
      };

      if (_.isUndefined(payload.user)) {
        delete payload.user;
      }

      if (_.isUndefined(payload.record)) {
        delete payload.record;
      }

      return payload;
    }

    public async createRecordAudit(recordAudit: RecordAuditModel): Promise<StorageServiceResponse> {
      const response = new StorageServiceResponse();
      const payload = this.sanitizeRecordAudit(recordAudit);
      try {
        sails.log.verbose(`${this.logHeader} Saving to DB...`);
        const savedRecordAudit = await RecordAudit.create(payload);
        response.oid = String(savedRecordAudit._id ?? '');
        response.success = true;
        sails.log.verbose(`${this.logHeader} Record Audit created...`);
      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to create Record Audit:`);
        sails.log.error(JSON.stringify(err));
        response.success = false;
        response.message = this.getErrorMessage(err);
        return response;
      }
      sails.log.verbose(JSON.stringify(response));
      sails.log.verbose(`${this.logHeader} create() -> End`);
      return response;
    }

    public async getRecordAudit(params: RecordAuditParams): Promise<unknown> {
      const oid = params.oid;
      const dateFrom = params.dateFrom;
      const dateTo = params.dateTo;

      if (_.isEmpty(oid)) {
        const msg = `${this.logHeader} getMeta() -> refusing to search using an empty OID`;
        sails.log.error(msg);
        throw new Error(msg);
      }

      const criteria = { redboxOid: oid };

      if (_.isDate(dateFrom)) {
        criteria['createdAt'] = { ['>=']: dateFrom };
      }

      if (_.isDate(dateTo)) {
        if (_.isUndefined(criteria['createdAt'])) {
          criteria['createdAt'] = {};
        }
        criteria['createdAt']['<='] = dateTo;
        sails.log.verbose(criteria);
      }

      sails.log.verbose(`${this.logHeader} finding: `);
      sails.log.verbose(JSON.stringify(criteria));
      return RecordAudit.find(criteria);
    }

    async restoreRecord(oid: string): Promise<StorageServiceResponse> {
      const response = new StorageServiceResponse();

      if (_.isEmpty(oid)) {
        const msg = `${this.logHeader} restoreRecord() -> refusing to search using an empty OID`;
        sails.log.error(msg);
        throw new Error(msg);
      }

      try {
        sails.log.verbose(`${this.logHeader} Restoring record ${oid} to DB...`);
        const deletedRecord = await DeletedRecord.findOne({ redboxOid: oid });
        delete deletedRecord.deletedRecordMetadata._id;

        const record = await Record.create(deletedRecord.deletedRecordMetadata);
        response.metadata = record;

        await DeletedRecord.destroyOne({ redboxOid: oid });
        response.success = true;
        sails.log.verbose(`${this.logHeader} Record restored...`);
        return response;
      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to create Record:`);
        sails.log.error(JSON.stringify(err));
        response.success = false;
        response.message = this.getErrorMessage(err);
        return response;
      }
    }

    async destroyDeletedRecord(oid: string): Promise<StorageServiceResponse> {
      const response = new StorageServiceResponse();

      if (_.isEmpty(oid)) {
        const msg = `${this.logHeader} destroyRecord() -> refusing to search using an empty OID`;
        sails.log.error(msg);
        throw new Error(msg);
      }

      try {
        sails.log.verbose(`${this.logHeader} destroying deleted record ${oid} to DB...`);
        await DeletedRecord.destroyOne({ redboxOid: oid });
        response.success = true;
        sails.log.verbose(`${this.logHeader} deleted record destroyed...`);
        return response;
      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to create Record:`);
        sails.log.error(JSON.stringify(err));
        response.success = false;
        response.message = this.getErrorMessage(err);
        return response;
      }
    }

    protected getFileWithName(fileName: string, options: FindOptions = { limit: 1 }): FindCursor<GridFSFile> {
      return this.gridFsBucket.find({ filename: fileName }, options);
    }

    public async exists(oid: string): Promise<boolean> {
      return (await Record.count({ redboxOid: oid })) > 0;
    }
  }
}
