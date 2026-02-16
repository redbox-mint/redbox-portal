import { Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs';

import { Sails, Model } from 'sails';
import { v1 as uuidv1 } from 'uuid';
import { DateTime } from 'luxon';

import mongodb = require('mongodb');
import util = require('util');
import stream = require('stream');
import { Transform } from 'json2csv';
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
} from '@researchdatabox/redbox-core-types';
const {
  transforms: { unwind, flatten },
} = require('json2csv');
import { ExportJSONTransformer } from '@researchdatabox/redbox-core-types';

const pipeline = util.promisify(stream.pipeline);

declare var sails: Sails;
declare var _;
declare var Record: Model, DeletedRecord: Model, RecordTypesService, TranslationService, FormsService, RecordAudit;



export module Services {
  /**
   * Stores ReDBox records in MongoDB.
   *
   * Notes:
   * - Primary
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class MongoStorageService extends services.Core.Service implements StorageService, DatastreamService {
    gridFsBucket: any;
    db: any;
    recordCol: any;
    deletedRecordCol: any;

    protected _exportedMethods: any = [
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
      let that = this;
      this.registerSailsHook('on', 'ready', function () {
        that.init();
        sails.emit('hook:redbox:storage:ready');
        sails.emit('hook:redbox:datastream:ready');
        sails.log.verbose(`${that.logHeader} Ready!`);
      });
    }

    private getUuid(): string {
      return uuidv1().replace(/-/g, '');
    }

    public async init() {
      this.db = Record.getDatastore().manager;
      // check if the collection exists ...
      try {
        const collectionInfo = await this.db.collection(Record.tableName, { strict: true });
        sails.log.verbose(`${this.logHeader} Collection '${Record.tableName}' info:`);
        sails.log.verbose(JSON.stringify(collectionInfo));
      } catch (err) {
        sails.log.verbose(`Collection doesn't exist, creating: ${Record.tableName}`);
        const uuid = this.getUuid();
        const initRec = { redboxOid: uuid };
        await Record.create(initRec);
        await Record.destroyOne({ redboxOid: uuid });
      }
      this.gridFsBucket = new mongodb.GridFSBucket(this.db);
      this.recordCol = await this.db.collection(Record.tableName);
      this.deletedRecordCol = await this.db.collection(DeletedRecord.tableName);
      await this.createIndices(this.db);
    }

    private async createIndices(db) {
      sails.log.verbose(`${this.logHeader} Existing indices:`);
      const currentIndices = await db.collection(Record.tableName).indexes();
      sails.log.verbose(JSON.stringify(currentIndices));
      // creating indices...
      // Version as of writing: http://mongodb.github.io/node-mongodb-native/3.6/api/Collection.html#createIndexes
      try {
        const indices = sails.config.storage.mongodb.indices;
        if (_.size(indices) > 0) {
          // TODO: check if indices already exists
          await db.collection(Record.tableName).createIndexes(indices);
        }
      } catch (err) {
        sails.log.error(`Failed to create indices:`);
        sails.log.error(JSON.stringify(err));
      }
    }

    public async create(brand, record, recordType, user?): Promise<any> {
      sails.log.verbose(`${this.logHeader} create() -> Begin`);
      let response = new StorageServiceResponse();
      // Create DB entry
      record.redboxOid = this.getUuid();
      response.oid = record.redboxOid;

      try {
        sails.log.verbose(`${this.logHeader} Saving to DB...`);
        await Record.create(record);
        response.success = true;
        sails.log.verbose(`${this.logHeader} Record created...`);
      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to create Record:`);
        sails.log.error(JSON.stringify(err));
        response.success = false;
        response.message = err.message;
        return response;
      }
      sails.log.verbose(JSON.stringify(response));
      sails.log.verbose(`${this.logHeader} create() -> End`);
      return response;
    }

    public async updateMeta(brand, oid, record, user?): Promise<any> {
      let response = new StorageServiceResponse();
      response.oid = oid;
      try {
        // Fixes: https://github.com/redbox-mint/redbox-portal/issues/800
        _.unset(record, 'dateCreated');
        _.unset(record, 'lastSaveDate');
        _.unset(record, '_id');

        // Records with an 'id' property fail to save with error:
        // {"cause":{"name":"AdapterError","adapterMethodName":"update","modelIdentity":"record","raw":{"code":"E_CANNOT_INTERPRET_AS_OBJECTID"}},"isOperational":true}
        // Fix by ensuring the 'id' property is removed.
        _.unset(record, 'id');

        await Record.updateOne({ redboxOid: oid }).set(record);
        response.success = true;
      } catch (err) {
        sails.log.error(
          `${this.logHeader} Failed to save update to MongoDB: ${JSON.stringify({
            error: err,
            response: response,
            brand: brand,
            oid: oid,
            record: record,
            user: user,
          })}`
        );
        response.success = false;
        response.message = err;
      }
      return response;
    }

    public async getMeta(oid): Promise<any> {
      // let response = new StorageServiceResponse();
      // const rec = await Record.findOne({id: oid});
      // rec.success = true;
      // rec.
      if (_.isEmpty(oid)) {
        const msg = `${this.logHeader} getMeta() -> refusing to search using an empty OID`;
        sails.log.error(msg);
        throw new Error(msg);
      }
      const criteria = { redboxOid: oid };
      sails.log.verbose(`${this.logHeader} finding: `);
      sails.log.verbose(JSON.stringify(criteria));
      return Record.findOne(criteria);
    }

    public async createBatch(type, data, harvestIdFldName): Promise<any> {
      const response = new StorageServiceResponse();
      response.message = '';
      let failFlag = false;
      _.each(data, async dataItem => {
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

    /**
     * If pendingValue is in editPending or viewPending, remove all instances from the pending arrays and
     * put the userid in the matching access / non-pending array, then save the changes to the storage.
     *
     * Implementation Note: This is a sync method, but it calls async methods.
     * This means that the storage will not be updated when this method returns, but at some point later.
     *
     * @param oid The record identifier.
     * @param userid The value to put in the matching access / non-pending arrays.
     * @param pendingValue The value to find in the pending arrays.
     */
    public provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue): void {
      const batchFn = async () => {
        const metadata = await this.getMeta(oid);

        // Update edit authorization - remove pending edit access and add real edit access with userid
        const pendingEditArray: string[] = _.get(metadata, 'authorization.editPending', []);
        const editArray: string[] = _.get(metadata, 'authorization.edit', []);

        // remove all items matching pendingValue from the pendingEditArray
        const pendingEditArrayFiltered = pendingEditArray.filter(value => value !== pendingValue);
        const pendingEditFound = pendingEditArray.length > pendingEditArrayFiltered.length;

        // add the item to the editArray if it existed in the pendingEditArray, and it is not in the editArray
        if (pendingEditFound && !editArray.includes(userid)) {
          editArray.push(userid);
        }

        // update the metadata with the modified arrays
        _.set(metadata, 'authorization.editPending', pendingEditArrayFiltered);
        _.set(metadata, 'authorization.edit', editArray);

        // Update view authorization - remove pending view access and add real view access with userid
        const pendingViewArray: string[] = _.get(metadata, 'authorization.viewPending', []);
        const viewArray: string[] = _.get(metadata, 'authorization.view', []);

        // remove all items matching pendingValue from the pendingViewArray
        const pendingViewArrayFiltered = pendingViewArray.filter(value => value !== pendingValue);
        const pendingViewFound = pendingViewArray.length > pendingViewArrayFiltered.length;

        // add the item to the viewArray if it existed in the pendingViewArray, and it is not in the viewArray
        if (pendingViewFound && !viewArray.includes(userid)) {
          viewArray.push(userid);
        }

        // update the metadata with the modified arrays
        _.set(metadata, 'authorization.viewPending', pendingViewArrayFiltered);
        _.set(metadata, 'authorization.view', viewArray);

        try {
          await this.updateMeta(null, oid, metadata);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to update on 'provideUserAccessAndRemovePendingAccess': `);
          sails.log.error(JSON.stringify(err));
        }
      };

      // TODO: Fix this so that the method only returns after the storage is updated.
      batchFn();
    }

    public async getRelatedRecords(oid, brand, recordTypeName: any = null, mappingContext: any = null) {
      let record = await this.getMeta(oid);
      if (_.isEmpty(recordTypeName)) {
        recordTypeName = record['metaMetadata']['type'];
      }
      let recordType = await RecordTypesService.get(brand, recordTypeName).toPromise();
      if (_.isEmpty(mappingContext)) {
        mappingContext = {
          processedRelationships: [recordTypeName],
          relatedObjects: {},
        };
        // add this records so it can be updated too!
        mappingContext.relatedObjects[recordTypeName] = [record];
      }
      let relatedTo = recordType['relatedTo'];
      if (_.isArray(relatedTo) && _.size(relatedTo) > 0) {
        for (let relationship of relatedTo) {
          sails.log.verbose(`${this.logHeader} Processing relationship:`);
          sails.log.verbose(JSON.stringify(relationship));
          const targetRecordType = relationship['recordType'];
          // retrieve the related records from the DB...
          const criteria: any = {};
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
              let recordRelationship = relatedRecords[j];
              mappingContext = await this.getRelatedRecords(recordRelationship.redboxOid, brand, null, mappingContext);
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

    public async delete(oid, permanentlyDelete: boolean = false) {
      const response = new StorageServiceResponse();

      try {
        if (permanentlyDelete) {
          const datastreams = await this.listDatastreams(oid, null);
          if (_.size(datastreams) > 0) {
            _.each(datastreams, file => {
              sails.log.verbose(`Deleting:`);
              sails.log.verbose(JSON.stringify(file));
              this.gridFsBucket.delete(file['_id'], (err, res) => {
                if (err) {
                  sails.log.error(`Error deleting: ${file['_id']}`);
                  sails.log.error(JSON.stringify(err));
                }
              });
            });
          }
        } else {
          let record: any = await this.getMeta(oid);
          let deletedRecord = {
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

    public async updateNotificationLog(oid, record, options): Promise<any> {
      if (super.metTriggerCondition(oid, record, options) == 'true') {
        sails.log.verbose(`${this.logHeader} Updating notification log for oid: ${oid}`);
        const logName = _.get(options, 'logName', null);
        if (logName) {
          let log = _.get(record, logName, null);
          // Use Luxon for ISO-like local timestamp without timezone offset
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
        // ready to update
        if (_.get(options, 'saveRecord', false)) {
          try {
            const response = await this.updateMeta(null, oid, record, null);
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
      // no updates or condition not met ... just return the record
      return record;
    }

    public async getDeletedRecords(
      workflowState,
      recordType = undefined,
      start,
      rows = 10,
      username,
      roles,
      brand,
      editAccessOnly = undefined,
      packageType = undefined,
      sort = undefined,
      filterFields = undefined,
      filterString = undefined,
      filterMode: string = 'regex',
      secondarySort = undefined
    ) {
      // BrandId ...
      let query = {
        'deletedRecordMetadata.metaMetadata.brandId': brand.id,
      };
      // Paginate ...
      const options = {
        limit: _.toNumber(rows),
        skip: _.toNumber(start),
      };
      // Sort ...defaults to lastSaveDate
      if (_.isEmpty(sort)) {
        sort = '{"lastSaveDate": -1}';
      }
      sails.log.verbose(`Sort is: ${sort}`);
      if (_.indexOf(`${sort}`, '1') == -1) {
        // if only the field is specified, default to descending...
        sort = `{"${sort}":-1}`;
      } else {
        try {
          options['sort'] = JSON.parse(sort);
        } catch (error) {
          // trying to massage this to valid JSON
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

      // Authorization ...
      let roleNames = this.getRoleNames(roles, brand);
      let andArray = [];
      let permissions = {
        $or: [
          { 'deletedRecordMetadata.authorization.view': username },
          { 'deletedRecordMetadata.authorization.edit': username },
          { 'deletedRecordMetadata.authorization.editRoles': { $in: roleNames } },
          { 'deletedRecordMetadata.authorization.viewRoles': { $in: roleNames } },
        ],
      };
      andArray.push(permissions);
      // Metadata type...
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        let typeArray = [];
        _.each(recordType, rType => {
          typeArray.push({ 'deletedRecordMetadata.metaMetadata.type': rType });
        });
        let types = { $or: typeArray };
        andArray.push(types);
      }
      // Package type...
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        let typeArray = [];
        _.each(packageType, rType => {
          typeArray.push({ 'deletedRecordMetadata.metaMetadata.packageType': rType });
        });
        let types = { $or: typeArray };
        andArray.push(types);
      }
      // Workflow ...
      if (workflowState != undefined) {
        query['deletedRecordMetadata.workflow.stage'] = workflowState;
      }
      if (!_.isEmpty(filterString) && !_.isEmpty(filterFields)) {
        let escapedFilterString = this.escapeRegExp(filterString);
        sails.log.verbose('escapedFilterString ' + escapedFilterString);
        for (let filterField of filterFields) {
          let filterQuery = {};
          if (filterMode == 'equal') {
            filterQuery[filterField] = filterString;
          } else if (filterMode == 'regex') {
            filterQuery[filterField] = new RegExp(`.*${escapedFilterString}.*`);
            //regex expressions are printed as empty objects {} when using JSON.stringify
            //hence intentionally not using JSON.stringify in below logging print out
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
      workflowState,
      recordType = undefined,
      start,
      rows = 10,
      username,
      roles,
      brand,
      editAccessOnly = undefined,
      packageType = undefined,
      sort = undefined,
      filterFields = undefined,
      filterString = undefined,
      filterMode = undefined,
      secondarySort = undefined
    ) {
      //Default to regex when filterMode is not set to maintain pre existing functionality
      if (_.isUndefined(filterMode) || _.isNull(filterMode) || _.isEmpty(filterMode)) {
        filterMode = 'regex';
      }
      // BrandId ...
      let query = {
        'metaMetadata.brandId': brand.id,
      };
      // Paginate ...
      const options = {
        limit: _.toNumber(rows),
        skip: _.toNumber(start),
      };
      // Sort ...defaults to lastSaveDate
      if (_.isEmpty(sort)) {
        sort = '{"lastSaveDate": -1}';
      }
      sails.log.verbose(`Sort is: ${sort}`);
      if (_.indexOf(`${sort}`, '1') == -1) {
        // if only the field is specified, default to descending...
        sort = `{"${sort}":-1}`;
      } else {
        try {
          options['sort'] = JSON.parse(sort);
        } catch (error) {
          // trying to massage this to valid JSON
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

      // Authorization ...
      let roleNames = this.getRoleNames(roles, brand);
      let andArray = [];
      let permissions = {
        $or: [
          { 'authorization.view': username },
          { 'authorization.edit': username },
          { 'authorization.editRoles': { $in: roleNames } },
          { 'authorization.viewRoles': { $in: roleNames } },
        ],
      };
      andArray.push(permissions);
      // Metadata type...
      if (_.isArray(recordType)) {
        if (recordType.length > 1) {
          let typeArray = [];
          _.each(recordType, rType => {
            typeArray.push({ 'metaMetadata.type': rType });
          });
          // Fixed incorrect "$or" condition construction: it should be top level, not nested within a field name.
          // let types = { "$or": typeArray };
          // query["metaMetadata.type"] = types;
          query['$or'] = typeArray;
        } else {
          let recType = recordType[0];
          if (!_.isUndefined(recType) && !_.isEmpty(recType)) {
            query['metaMetadata.type'] = recType;
          }
        }
      } else if (recordType != undefined && recordType != '') {
        query['metaMetadata.type'] = recordType;
      }
      // Package type...
      if (_.isArray(packageType)) {
        if (packageType.length > 1) {
          let typeArray = [];
          _.each(packageType, rType => {
            typeArray.push({ 'metaMetadata.packageType': rType });
          });
          let types = { $or: typeArray };
          query['metaMetadata.packageType'] = types;
        } else {
          let packType = packageType[0];
          if (!_.isUndefined(packType) && !_.isEmpty(packType)) {
            query['metaMetadata.packageType'] = packType;
          }
        }
      } else if (packageType != undefined && packageType != '') {
        query['metaMetadata.packageType'] = packageType;
      }
      // Workflow ...
      if (workflowState != undefined && workflowState != '') {
        query['workflow.stage'] = workflowState;
      }
      //Additional filter conditions
      if (!_.isEmpty(filterString) && !_.isEmpty(filterFields)) {
        let escapedFilterString = this.escapeRegExp(filterString);
        sails.log.verbose('escapedFilterString ' + escapedFilterString);
        for (let filterField of filterFields) {
          if (filterMode == 'equal') {
            query[filterField] = filterString;
          } else if (filterMode == 'regex') {
            // Improved to enable case insensitive search by default and allow for partial matches
            query[filterField] = new RegExp(`.*${escapedFilterString}.*`, 'i');
          }
        }
      }

      query['$and'] = andArray;

      //regex expressions are printed as empty objects {} when using JSON.stringify
      //hence intentionally not using JSON.stringify in below logging print out
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
      let limit = options.limit;
      options.skip = skip;
      let result = await this.recordCol.find(query, options).toArray();

      while (result.length > 0) {
        for (let record of result) {
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
      let andArray = [];
      let query = {
        'metaMetadata.brandId': brand.id,
        'metaMetadata.type': recType,
      };
      let roleNames = this.getRoleNames(roles, brand);
      let permissions = {
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

      //TODO: incorporate object mode so that JSON.stringify is handled in the Transformer rather than fetch
      const jsonTransformer = new ExportJSONTransformer(recType, modBefore, modAfter);
      return stream.Readable.from(this.fetchAllRecords(query, options, true)).pipe(jsonTransformer);
    }

    protected getRoleNames(roles, brand) {
      var roleNames = [];

      for (var i = 0; i < roles.length; i++) {
        var role = roles[i];
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
          const failureMessage = `Failed to upload: ${JSON.stringify(fileId)}, error is:\n${JSON.stringify(err)}`;
          response.message = _.isEmpty(response.message) ? failureMessage : `${response.message}\n${failureMessage}`;
        }
      }
      response.success = !hasFailure;
      return response;
    }

    public updateDatastream(oid: string, record, newMetadata, fileRoot, fileIdsAdded): any {
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
      // loop thru the attachment fields and determine if we need to add or remove
      return FormsService.getFormByName(record.metaMetadata.form, true).pipe(
        mergeMap(form => {
          // For any generated, view-only forms, the form may be null, add a coalescence to avoid breaking
          // the attachment update process.
          form = form ?? { attachmentFields: [] };
          const typedForm = form as { attachmentFields: string[] };
          const reqs = [];
          record.metaMetadata.attachmentFields = typedForm.attachmentFields;
          _.each(typedForm.attachmentFields, async attField => {
            const oldAttachments = record.metadata[attField];
            const newAttachments = newMetadata[attField];
            const removeIds = [];
            // process removals
            if (!_.isUndefined(oldAttachments) && !_.isNull(oldAttachments) && !_.isNull(newAttachments)) {
              const toRemove = _.differenceBy(oldAttachments, newAttachments, 'fileId');
              _.each(toRemove, removeAtt => {
                if (removeAtt.type == 'attachment') {
                  removeIds.push(new Datastream(removeAtt));
                }
              });
            }
            // process additions
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
            reqs.push(of({ request: 'dummy' }));
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
        this.gridFsBucket.delete(fileDoc['_id'], (err, res) => {
          if (err) {
            sails.log.error(`Error deleting: ${fileDoc['_id']}`);
            sails.log.error(JSON.stringify(err));
          }
        });
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

    /**
     *
     * Stream file to bucket and return a promise when it's complete
     *
     * */
    private streamFileToBucket(readable: NodeJS.ReadableStream, fileName: string, metadata: any) {
      const uploadStream = this.gridFsBucket.openUploadStream(fileName, { metadata: metadata });
      readable.pipe(uploadStream);

      return new Promise((resolve, reject) => {
        uploadStream.on('finish', () => {
          resolve(uploadStream.gridFSFile);
        });

        uploadStream.on('error', err => {
          reject(err);
        });
      });
    }

    public async addAndRemoveDatastreams(
      oid,
      addIds: any[],
      removeIds: any[],
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

    public async getDatastream(oid, fileId): Promise<any> {
      return this.getDatastreamAsync(oid, fileId);
    }

    private async getDatastreamAsync(oid, fileId): Promise<any> {
      const fileName = `${oid}/${fileId}`;
      const fileRes = await this.getFileWithName(fileName).toArray();
      if (_.isArray(fileRes) && fileRes.length === 0) {
        throw new Error(TranslationService.t('attachment-not-found'));
      }
      const response = new Attachment();
      response.readstream = this.gridFsBucket.openDownloadStreamByName(fileName);
      return response;
    }

    public async listDatastreams(oid, fileId) {
      let query: any = { 'metadata.redboxOid': oid };
      if (!_.isEmpty(fileId)) {
        const fileName = `${oid}/${fileId}`;
        query = { filename: fileName };
      }
      sails.log.verbose(`${this.logHeader} listDatastreams() -> Listing attachments of oid: ${oid}`);
      sails.log.verbose(JSON.stringify(query));
      return this.gridFsBucket.find(query, {}).toArray();
    }

    private toJsonSafe(value: any) {
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
      } catch (err) {
        return undefined;
      }
    }

    private sanitizeRecordAudit(recordAudit: RecordAuditModel): RecordAuditModel {
      const payload: RecordAuditModel = {
        redboxOid: recordAudit.redboxOid,
        action: recordAudit.action,
        user: this.toJsonSafe(recordAudit.user),
        record: this.toJsonSafe(recordAudit.record),
      } as RecordAuditModel;

      if (_.isUndefined(payload.user)) {
        delete (payload as any).user;
      }

      if (_.isUndefined(payload.record)) {
        delete (payload as any).record;
      }

      return payload;
    }

    public async createRecordAudit(recordAudit: RecordAuditModel): Promise<any> {
      let response = new StorageServiceResponse();
      const payload = this.sanitizeRecordAudit(recordAudit);
      try {
        sails.log.verbose(`${this.logHeader} Saving to DB...`);
        await RecordAudit.create(payload);
        //TODO: fix type model to have the _id attribute
        let savedRecordAudit: any = payload;
        response.oid = savedRecordAudit._id;
        response.success = true;
        sails.log.verbose(`${this.logHeader} Record Audit created...`);
      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to create Record Audit:`);
        sails.log.error(JSON.stringify(err));
        response.success = false;
        response.message = err.message;
        return response;
      }
      sails.log.verbose(JSON.stringify(response));
      sails.log.verbose(`${this.logHeader} create() -> End`);
      return response;
    }

    public async getRecordAudit(params: RecordAuditParams): Promise<any> {
      const oid = params.oid;
      const dateFrom = params.dateFrom;
      const dateTo = params.dateTo;

      if (_.isEmpty(oid)) {
        const msg = `${this.logHeader} getMeta() -> refusing to search using an empty OID`;
        sails.log.error(msg);
        throw new Error(msg);
      }

      var criteria = { redboxOid: oid };

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

    async restoreRecord(oid: any): Promise<any> {
      const response = new StorageServiceResponse();

      if (_.isEmpty(oid)) {
        const msg = `${this.logHeader} restoreRecord() -> refusing to search using an empty OID`;
        sails.log.error(msg);
        throw new Error(msg);
      }

      try {
        sails.log.verbose(`${this.logHeader} Restoring record ${oid} to DB...`);
        let deletedRecord = await DeletedRecord.findOne({ redboxOid: oid });
        delete deletedRecord.deletedRecordMetadata._id;

        let record = await Record.create(deletedRecord.deletedRecordMetadata);
        response.metadata = record;

        await DeletedRecord.destroyOne({ redboxOid: oid });
        response.success = true;
        sails.log.verbose(`${this.logHeader} Record restored...`);
        return response;
      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to create Record:`);
        sails.log.error(JSON.stringify(err));
        response.success = false;
        response.message = err.message;
        return response;
      }
    }

    async destroyDeletedRecord(oid: any): Promise<any> {
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
        response.message = err.message;
        return response;
      }
    }

    /**
     * Returns a MongoDB cursor
     * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
     * @param  fileName
     * @param  options
     * @return
     */
    protected getFileWithName(fileName: string, options: any = { limit: 1 }) {
      return this.gridFsBucket.find({ filename: fileName }, options);
    }

    /**
     * Returns true if record with oid exists.
     *
     * @param oid
     * @returns
     */
    public async exists(oid: string): Promise<boolean> {
      return (await Record.count({ redboxOid: oid })) > 0;
    }
  }
}
module.exports = new Services.MongoStorageService().exports();
