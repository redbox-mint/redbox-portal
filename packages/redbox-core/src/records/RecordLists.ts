import _ from 'lodash';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { RecordsService } from '../RecordsService';
import type { BrandingModel } from '../model/storage/BrandingModel';
import { ListAPIResponse } from '../model/ListAPIResponse';
import { recordRepresentationRevision } from '../RecordHttpConcurrency';
type AnyRecord = Record<string, unknown>;
export class RecordLists {
  public constructor(
    private readonly input: {
      records: Pick<RecordsService, 'getRecords' | 'getDeletedRecords' | 'hasEditAccess'>;
      log: ILogger;
    }
  ) {}
  public async browser(
    workflowState: unknown,
    recordType: unknown,
    start: unknown,
    rows: unknown,
    user: AnyRecord,
    roles: AnyRecord[],
    brand: BrandingModel,
    editAccessOnly: unknown = undefined,
    packageType: unknown = undefined,
    sort: unknown = undefined,
    filterFields: unknown = undefined,
    filterString: unknown = undefined,
    filterMode: unknown = undefined,
    secondarySort: unknown = undefined
  ) {
    const username = user['username'] as string;
    if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
      recordType = (recordType as string).split(',');
    }
    if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
      packageType = (packageType as string).split(',');
    }
    const results = await this.input.records.getRecords(
      workflowState,
      recordType,
      start,
      rows,
      username,
      roles,
      brand,
      editAccessOnly,
      packageType,
      sort,
      filterFields,
      filterString,
      filterMode,
      secondarySort
    );
    if (!results.isSuccessful()) {
      this.input.log.verbose(`Failed to retrieve records!`);
      return null;
    }

    const totalItems = results.totalItems;
    const startIndex = start as number;
    const noItems = rows as number;
    const pageNumber = startIndex / noItems + 1;

    const response: { [key: string]: unknown } = {};
    response['totalItems'] = totalItems;
    response['currentPage'] = pageNumber;
    response['noItems'] = noItems;

    const items = [];
    const docs = results.items;

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i] as globalThis.Record<string, unknown>;
      const item: { [key: string]: unknown } = {};
      item['oid'] = doc['redboxOid'];
      item['revision'] = recordRepresentationRevision(doc);
      const docMetadata = (doc['metadata'] ?? {}) as globalThis.Record<string, unknown>;
      item['title'] = docMetadata['title'];
      item['metadata'] = this.docMetadata(doc);
      item['dateCreated'] = doc['dateCreated'];
      item['dateModified'] = doc['lastSaveDate'];
      item['hasEditAccess'] = this.input.records.hasEditAccess(brand, user, roles, doc);
      items.push(item);
    }

    response['items'] = items;
    return response;
  }
  public async browserDeleted(
    workflowState: unknown,
    recordType: unknown,
    start: unknown,
    rows: unknown,
    user: AnyRecord,
    roles: AnyRecord[],
    brand: BrandingModel,
    editAccessOnly: unknown = undefined,
    packageType: unknown = undefined,
    sort: unknown = undefined,
    filterFields: unknown = undefined,
    filterString: unknown = undefined,
    filterMode: unknown = undefined
  ) {
    const username = user['username'] as string;
    if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
      recordType = (recordType as string).split(',');
    }
    if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
      packageType = (packageType as string).split(',');
    }
    const results = await this.input.records.getDeletedRecords(
      workflowState,
      recordType,
      start,
      rows,
      username,
      roles,
      brand,
      editAccessOnly,
      packageType,
      sort,
      filterFields,
      filterString,
      filterMode
    );
    if (!results.isSuccessful()) {
      this.input.log.verbose(`Failed to retrieve deleted records!`);
      return null;
    }

    const totalItems = results.totalItems;
    const startIndex = start as number;
    const noItems = rows as number;
    const pageNumber = startIndex / noItems + 1;

    const response: { [key: string]: unknown } = {};
    response['totalItems'] = totalItems;
    response['currentPage'] = pageNumber;
    response['noItems'] = noItems;

    const items = [];
    const docs = results.items;

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i] as globalThis.Record<string, unknown>;
      const item: { [key: string]: unknown } = {};
      const delRecordMeta = (doc['deletedRecordMetadata'] ?? {}) as globalThis.Record<string, unknown>;
      item['oid'] = doc['redboxOid'];
      item['revision'] = recordRepresentationRevision(doc);
      item['lifecycleState'] = doc['lifecycleState'] ?? 'deleted';
      const lifecycleOperation = (doc['lifecycleOperation'] ?? {}) as globalThis.Record<string, unknown>;
      if (Object.keys(lifecycleOperation).length > 0) {
        item['lifecycle'] = {
          kind: lifecycleOperation['kind'],
          attempts: lifecycleOperation['attempts'],
          startedAt: lifecycleOperation['startedAt'],
          updatedAt: lifecycleOperation['updatedAt'],
          ...(lifecycleOperation['errorCode'] ? { errorCode: lifecycleOperation['errorCode'] } : {}),
        };
      }
      const delRecordMetadata = (delRecordMeta['metadata'] ?? {}) as globalThis.Record<string, unknown>;
      item['title'] = delRecordMetadata['title'];
      item['dateCreated'] = delRecordMeta['dateCreated'];
      item['dateModified'] = delRecordMeta['lastSaveDate'];
      item['dateDeleted'] = doc['dateDeleted'];
      items.push(item);
    }

    response['items'] = items;
    return response;
  }
  private docMetadata(doc: { [key: string]: unknown }): { [key: string]: unknown } {
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
  public async api(
    workflowState: unknown,
    recordType: unknown,
    start: unknown,
    rows: unknown,
    user: globalThis.Record<string, unknown>,
    roles: globalThis.Record<string, unknown>[],
    brand: unknown,
    editAccessOnly: unknown = undefined,
    packageType: unknown = undefined,
    sort: unknown = undefined,
    fieldNames: unknown = undefined,
    filterString: unknown = undefined
  ) {
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
    const results = await this.input.records.getRecords(
      workflowState,
      recordType,
      start,
      rows,
      username,
      roles,
      brand,
      editAccessOnly,
      packageType,
      sort,
      fieldNames,
      filterString
    );
    const apiReponse: ListAPIResponse<unknown> = new ListAPIResponse();
    const totalItems = results.totalItems;
    const startIndex = start as number;
    const noItems = rows as number;
    const pageNumber = Math.floor(startIndex / noItems + 1);

    apiReponse.summary.numFound = totalItems;
    apiReponse.summary.start = startIndex;
    apiReponse.summary.page = pageNumber;

    const items = [];
    const docs = results['items'];

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i] as globalThis.Record<string, unknown>;
      const item: { [key: string]: unknown } = {};
      item['oid'] = doc['redboxOid'];
      item['revision'] = recordRepresentationRevision(doc);
      const docMetadata = (doc['metadata'] ?? {}) as globalThis.Record<string, unknown>;
      item['title'] = docMetadata['title'];
      item['metadata'] = docMetadata;
      item['dateCreated'] = doc['dateCreated'];
      item['dateModified'] = doc['lastSaveDate'];
      item['hasEditAccess'] = this.input.records.hasEditAccess(brand, user, roles, doc);
      items.push(item);
    }
    apiReponse.records = items;
    return apiReponse;
  }
  public async apiDeleted(
    workflowState: unknown,
    recordType: unknown,
    start: unknown,
    rows: unknown,
    user: globalThis.Record<string, unknown>,
    roles: globalThis.Record<string, unknown>[],
    brand: unknown,
    editAccessOnly: unknown = undefined,
    packageType: unknown = undefined,
    sort: unknown = undefined,
    fieldNames: unknown = undefined,
    filterString: unknown = undefined
  ) {
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
    const results = await this.input.records.getDeletedRecords(
      workflowState,
      recordType,
      start,
      rows,
      username,
      roles,
      brand,
      editAccessOnly,
      packageType,
      sort,
      fieldNames,
      filterString
    );
    const apiReponse: ListAPIResponse<unknown> = new ListAPIResponse();
    const totalItems = results.totalItems;
    const startIndex = start as number;
    const noItems = rows as number;
    const pageNumber = Math.floor(startIndex / noItems + 1);

    apiReponse.summary.numFound = totalItems;
    apiReponse.summary.start = startIndex;
    apiReponse.summary.page = pageNumber;

    const items = [];
    const docs = results['items'];

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i] as globalThis.Record<string, unknown>;
      const item: { [key: string]: unknown } = {};
      const deletedRecord = (doc['deletedRecordMetadata'] ?? {}) as globalThis.Record<string, unknown>;
      const deletedRecordMetadata = (deletedRecord['metadata'] ?? {}) as globalThis.Record<string, unknown>;
      item['oid'] = doc['redboxOid'];
      item['revision'] = recordRepresentationRevision(doc);
      item['lifecycleState'] = doc['lifecycleState'] ?? 'deleted';
      const lifecycleOperation = (doc['lifecycleOperation'] ?? {}) as globalThis.Record<string, unknown>;
      if (Object.keys(lifecycleOperation).length > 0) {
        item['lifecycle'] = {
          kind: lifecycleOperation['kind'],
          attempts: lifecycleOperation['attempts'],
          startedAt: lifecycleOperation['startedAt'],
          updatedAt: lifecycleOperation['updatedAt'],
          ...(lifecycleOperation['errorCode'] ? { errorCode: lifecycleOperation['errorCode'] } : {}),
        };
      }
      item['title'] = deletedRecordMetadata['title'];
      item['deletedRecord'] = deletedRecord;
      item['dateCreated'] = doc['dateCreated'];
      item['dateModified'] = doc['lastSaveDate'];
      item['dateDeleted'] = doc['dateDeleted'];
      items.push(item);
    }
    apiReponse.records = items;
    return apiReponse;
  }
}
