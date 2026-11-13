import type { FastifyRequest, FastifyReply } from 'fastify';
import { defineController } from '../controllers';
import { readAction } from '../fastify/readActions';
import { resolvedRequestContract } from '../fastify/validation';
import { requestPathname } from '../fastify/router';
import * as r from '../actions/recordReads';
import * as q from '../actions/queryReads';
import * as s from '../actions/recordSchemaReads';
import { RecordController, type RecordControllerInput, recordController } from './webservice/RecordController';
import {
  RecordReferenceController,
  type RecordReferenceControllerInput,
  recordReferenceController,
} from './ReferenceControllers';

export type ApiReportReadControllerInput = Pick<q.QueryReadInput, 'queries' | 'reports'>;
export class ApiReportReadController {
  constructor(protected readonly input: ApiReportReadControllerInput) {}
  async executeNamedQuery(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.executeNamedQuery(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
  async listConfigs(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.listConfigs(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
  async previewConfig(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.previewConfig(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
  async getConfig(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getConfig(this.input, facts, valid, false),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
}
export const apiReportReadController = defineController({
  name: 'webservice/ReportController',
  actions: ['executeNamedQuery', 'listConfigs', 'previewConfig', 'getConfig'],
  create: (input: ApiReportReadControllerInput) => new ApiReportReadController(input),
});

export type ReportReadControllerInput = Pick<q.QueryReadInput, 'reports'>;
export class ReportReadController {
  constructor(protected readonly input: ReportReadControllerInput) {}
  async listConfigs(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.listConfigs(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, true, false),
      false
    );
  }
  async previewConfig(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.previewConfig(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, true, false),
      false
    );
  }
  async getConfig(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getConfig(this.input, facts, valid, true),
      (facts, error) => q.queryReadFailure(facts, error, true, false),
      false
    );
  }
  async get(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.get(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, true, false),
      false
    );
  }
  async getResults(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getResults(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, true, false),
      false
    );
  }
  async downloadCSV(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.downloadCSV(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, true, true),
      false
    );
  }
}
export const reportReadController = defineController({
  name: 'ReportController',
  actions: ['listConfigs', 'previewConfig', 'getConfig', 'get', 'getResults', 'downloadCSV'],
  create: (input: ReportReadControllerInput) => new ReportReadController(input),
});

export type ApiNamedQueryReadControllerInput = Pick<q.QueryReadInput, 'queries'>;
export class ApiNamedQueryReadController {
  constructor(protected readonly input: ApiNamedQueryReadControllerInput) {}
  async listQueries(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.listQueries(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
  async getCollections(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getCollections(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
  async getQuery(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getQuery(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
}
export const apiNamedQueryReadController = defineController({
  name: 'webservice/NamedQueryController',
  actions: ['listQueries', 'getCollections', 'getQuery'],
  create: (input: ApiNamedQueryReadControllerInput) => new ApiNamedQueryReadController(input),
});

export type ApiHarvestRunReadControllerInput = Pick<q.QueryReadInput, 'harvest'>;
export class ApiHarvestRunReadController {
  constructor(protected readonly input: ApiHarvestRunReadControllerInput) {}
  async listRuns(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.listRuns(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
  async getRun(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getRun(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
  async listRunEvents(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.listRunEvents(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
}
export const apiHarvestRunReadController = defineController({
  name: 'webservice/HarvestRunController',
  actions: ['listRuns', 'getRun', 'listRunEvents'],
  create: (input: ApiHarvestRunReadControllerInput) => new ApiHarvestRunReadController(input),
});

export type ApiSiemReadControllerInput = Pick<q.QueryReadInput, 'siem' | 'siemConfig'>;
export class ApiSiemReadController {
  constructor(protected readonly input: ApiSiemReadControllerInput) {}
  async getConfig(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getSiemConfig(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
  async getEvents(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getEvents(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
  async getDeliveryStatus(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getDeliveryStatus(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
}
export const apiSiemReadController = defineController({
  name: 'webservice/SiemController',
  actions: ['getConfig', 'getEvents', 'getDeliveryStatus'],
  create: (input: ApiSiemReadControllerInput) => new ApiSiemReadController(input),
});

export type ApiSearchReadControllerInput = Pick<q.QueryReadInput, 'search' | 'recordTypes' | 'returnFields'>;
export class ApiSearchReadController {
  constructor(protected readonly input: ApiSearchReadControllerInput) {}
  async search(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.search(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
}
export const apiSearchReadController = defineController({
  name: 'webservice/SearchController',
  actions: ['search'],
  create: (input: ApiSearchReadControllerInput) => new ApiSearchReadController(input),
});

export type ApiIntegrationAuditReadControllerInput = Pick<q.QueryReadInput, 'audit'>;
export class ApiIntegrationAuditReadController {
  constructor(protected readonly input: ApiIntegrationAuditReadControllerInput) {}
  async getAuditLog(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getAuditLog(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
}
export const apiIntegrationAuditReadController = defineController({
  name: 'webservice/IntegrationAuditController',
  actions: ['getAuditLog'],
  create: (input: ApiIntegrationAuditReadControllerInput) => new ApiIntegrationAuditReadController(input),
});

export type RecordAuditReadControllerInput = Pick<q.QueryReadInput, 'audit'>;
export class RecordAuditReadController {
  constructor(protected readonly input: RecordAuditReadControllerInput) {}
  async getAuditData(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getAuditData(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
  async getPermissionsData(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getPermissionsData(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
  async getIntegrationAuditData(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getIntegrationAuditData(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
  async getIntegrationStatusData(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => q.getIntegrationStatusData(this.input, facts, valid),
      (facts, error) => q.queryReadFailure(facts, error, false, false),
      false
    );
  }
}
export const recordAuditReadController = defineController({
  name: 'RecordAuditController',
  actions: ['getAuditData', 'getPermissionsData', 'getIntegrationAuditData', 'getIntegrationStatusData'],
  create: (input: RecordAuditReadControllerInput) => new RecordAuditReadController(input),
});

export type ApiRecordReadControllerInput = r.RecordReadInput & RecordControllerInput;
export class ApiRecordReadController extends RecordController {
  constructor(protected readonly input: ApiRecordReadControllerInput) {
    super(input);
  }
  async listRecords(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.listRecords(this.input, facts, valid),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async listDeletedRecords(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.listDeletedRecords(this.input, facts, valid),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async getRecordAudit(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.getRecordAudit(this.input, facts, valid, false),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async getDeletedRecord(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.getDeletedRecord(this.input, facts, valid, false),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async getObjectMeta(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.getObjectMeta(this.input, facts, valid, false),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async getPermissions(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.getPermissions(this.input, facts, valid, false),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
}
export const apiRecordReadController = defineController({
  name: 'webservice/RecordController',
  actions: [
    ...recordController.actions,
    'listRecords',
    'listDeletedRecords',
    'getRecordAudit',
    'getDeletedRecord',
    'getObjectMeta',
    'getPermissions',
  ],
  create: (input: ApiRecordReadControllerInput) => new ApiRecordReadController(input),
});

export type RecordReadControllerInput = r.RecordReadInput & RecordReferenceControllerInput;
export class RecordReadController extends RecordReferenceController {
  constructor(protected readonly input: RecordReadControllerInput) {
    super(input);
  }
  async getRecordList(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.getRecordList(this.input, facts, valid),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async getDeletedRecordList(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.getDeletedRecordList(this.input, facts, valid),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async getMeta(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.getMeta(this.input, facts, valid, true),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async getMetaDefault(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.getMetaDefault(this.input, facts, valid, true),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async getDeletedRecord(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.getDeletedRecord(this.input, facts, valid, true),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async getPermissions(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.getPermissions(this.input, facts, valid, true),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async getRelatedRecords(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.getRelatedRecords(this.input, facts, valid, true),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async search(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.search(this.input, facts, valid, true),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
  async listWorkspaces(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.listWorkspaces(this.input, facts, valid, true),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
}
export const recordReadController = defineController({
  name: 'RecordController',
  actions: [
    ...recordReferenceController.actions,
    'getRecordList',
    'getDeletedRecordList',
    'getMeta',
    'getMetaDefault',
    'getDeletedRecord',
    'getPermissions',
    'getRelatedRecords',
    'search',
    'listWorkspaces',
  ],
  create: (input: RecordReadControllerInput) => new RecordReadController(input),
});

export type ApiExportReadControllerInput = r.RecordReadInput;
export class ApiExportReadController {
  constructor(protected readonly input: ApiExportReadControllerInput) {}
  async downloadRecs(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.downloadRecs(this.input, facts, valid, false),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
}
export const apiExportReadController = defineController({
  name: 'webservice/ExportController',
  actions: ['downloadRecs'],
  create: (input: ApiExportReadControllerInput) => new ApiExportReadController(input),
});

export type ExportReadControllerInput = r.RecordReadInput;
export class ExportReadController {
  constructor(protected readonly input: ExportReadControllerInput) {}
  async downloadRecs(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) => r.downloadRecs(this.input, facts, valid, false),
      (facts, error) => r.recordReadFailure(this.input, facts, error),
      false
    );
  }
}
export const exportReadController = defineController({
  name: 'ExportController',
  actions: ['downloadRecs'],
  create: (input: ExportReadControllerInput) => new ExportReadController(input),
});

export type ApiRecordSchemaReadControllerInput = s.RecordSchemaReadInput;
export class ApiRecordSchemaReadController {
  constructor(protected readonly input: ApiRecordSchemaReadControllerInput) {}
  async create(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) =>
        s.create(
          this.input,
          { ...facts, path: requestPathname(request.raw.url ?? request.url)! },
          resolvedRequestContract(request)
        ),
      undefined,
      true
    );
  }
  async update(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) =>
        s.update(
          this.input,
          { ...facts, path: requestPathname(request.raw.url ?? request.url)! },
          resolvedRequestContract(request)
        ),
      undefined,
      true
    );
  }
  async immutable(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return readAction(
      request,
      reply,
      (facts, valid) =>
        s.immutable(
          this.input,
          { ...facts, path: requestPathname(request.raw.url ?? request.url)! },
          resolvedRequestContract(request)
        ),
      undefined,
      true
    );
  }
}
export const apiRecordSchemaReadController = defineController({
  name: 'webservice/RecordSchemaController',
  actions: ['create', 'update', 'immutable'],
  create: (input: ApiRecordSchemaReadControllerInput) => new ApiRecordSchemaReadController(input),
});
