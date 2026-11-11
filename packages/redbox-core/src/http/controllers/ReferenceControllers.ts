import type { FastifyRequest, FastifyReply } from 'fastify';
import { defineController } from '../controllers';
import { referenceRead } from '../fastify/referenceReads';
import { dashboardReadError } from '../actions/reference';
import * as m from '../actions/metadataReads';
import * as c from '../actions/configurationReads';
import * as t from '../actions/recordTypeReads';
import * as f from '../actions/formDelivery';

/** Concrete borrowed domain slices. Constructors perform no acquisition. */
export interface RecordTypeControllerInput extends t.RecordTypeReadInput {}
export class RecordTypeController {
  constructor(protected readonly input: RecordTypeControllerInput) {}
  async getRecordType(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => t.getRecordType(this.input, facts, valid));
  }
  async listRecordTypes(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => t.listRecordTypes(this.input, facts));
  }
}
export const recordTypeController = defineController({
  name: 'webservice/RecordTypeController',
  actions: ['getRecordType', 'listRecordTypes'],
  create: (input: RecordTypeControllerInput) => new RecordTypeController(input),
});

export interface AppConfigControllerInput extends Pick<c.ConfigurationReadInput, 'appConfigs'> {}
export class AppConfigController {
  constructor(protected readonly input: AppConfigControllerInput) {}
  async getAppConfig(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => c.getAppConfig(this.input, facts, valid));
  }
}
export const appConfigController = defineController({
  name: 'webservice/AppConfigController',
  actions: ['getAppConfig'],
  create: (input: AppConfigControllerInput) => new AppConfigController(input),
});

export interface AppConfigFormControllerInput extends Pick<c.ConfigurationReadInput, 'appConfigs'> {}
export class AppConfigFormController {
  constructor(protected readonly input: AppConfigFormControllerInput) {}
  async getAppConfigForm(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => c.getAppConfigForm(this.input, facts));
  }
}
export const appConfigFormController = defineController({
  name: 'AppConfigController',
  actions: ['getAppConfigForm'],
  create: (input: AppConfigFormControllerInput) => new AppConfigFormController(input),
});

export interface TranslationControllerInput extends Pick<c.ConfigurationReadInput, 'translations'> {}
export class TranslationController {
  constructor(protected readonly input: TranslationControllerInput) {}
  async listEntries(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => c.listEntries(this.input, facts, valid));
  }
  async getEntry(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => c.getEntry(this.input, facts, valid));
  }
  async getBundle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => c.getBundle(this.input, facts, valid));
  }
}
export const translationController = defineController({
  name: 'webservice/TranslationController',
  actions: ['listEntries', 'getEntry', 'getBundle'],
  create: (input: TranslationControllerInput) => new TranslationController(input),
});

export interface FormManagementControllerInput extends Pick<c.ConfigurationReadInput, 'forms' | 'loadRecord'> {}
export class FormManagementController {
  constructor(protected readonly input: FormManagementControllerInput) {}
  async listForms(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => c.listForms(this.input, facts, valid));
  }
  async getForm(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => c.getForm(this.input, facts, valid));
  }
}
export const formManagementController = defineController({
  name: 'webservice/FormManagementController',
  actions: ['listForms', 'getForm'],
  create: (input: FormManagementControllerInput) => new FormManagementController(input),
});

export interface WorkspaceTypesControllerInput extends Pick<m.MetadataReadInput, 'workspaceTypes'> {}
export class WorkspaceTypesController {
  constructor(protected readonly input: WorkspaceTypesControllerInput) {}
  async get(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.get(this.input, facts), dashboardReadError);
  }
  async getOne(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getOne(this.input, facts), dashboardReadError);
  }
}
export const workspaceTypesController = defineController({
  name: 'WorkspaceTypesController',
  actions: ['get', 'getOne'],
  create: (input: WorkspaceTypesControllerInput) => new WorkspaceTypesController(input),
});

export interface BrowserTranslationControllerInput extends Pick<m.MetadataReadInput, 'translations'> {}
export class BrowserTranslationController {
  constructor(protected readonly input: BrowserTranslationControllerInput) {}
  async getLanguages(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getLanguages(this.input, facts), dashboardReadError);
  }
  async getNamespace(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getNamespace(this.input, facts), dashboardReadError);
  }
  async listEntriesApp(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.listEntriesApp(this.input, facts), dashboardReadError);
  }
  async getBundleApp(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getBundleApp(this.input, facts), dashboardReadError);
  }
}
export const browserTranslationController = defineController({
  name: 'TranslationController',
  actions: ['getLanguages', 'getNamespace', 'listEntriesApp', 'getBundleApp'],
  create: (input: BrowserTranslationControllerInput) => new BrowserTranslationController(input),
});

export interface DashboardConfigControllerInput extends Pick<m.MetadataReadInput, 'dashboardConfig'> {}
export class DashboardConfigController {
  constructor(protected readonly input: DashboardConfigControllerInput) {}
  async listTargets(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.listTargets(this.input, facts), dashboardReadError);
  }
  async getWorkflowTarget(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getWorkflowTarget(this.input, facts), dashboardReadError);
  }
  async getViewTarget(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getViewTarget(this.input, facts), dashboardReadError);
  }
  async getWorkflowFields(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getWorkflowFields(this.input, facts), dashboardReadError);
  }
  async getViewFields(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getViewFields(this.input, facts), dashboardReadError);
  }
  async migrationPreflight(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.migrationPreflight(this.input, facts), dashboardReadError);
  }
  async retiredOperation(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.retiredOperation(this.input, facts), dashboardReadError);
  }
}
export const dashboardConfigController = defineController({
  name: 'webservice/DashboardConfigController',
  actions: [
    'listTargets',
    'getWorkflowTarget',
    'getViewTarget',
    'getWorkflowFields',
    'getViewFields',
    'migrationPreflight',
    'retiredOperation',
  ],
  create: (input: DashboardConfigControllerInput) => new DashboardConfigController(input),
});

export const browserDashboardConfigController = defineController({
  name: 'DashboardConfigController',
  actions: ['listTargets', 'getWorkflowTarget', 'getViewTarget', 'getWorkflowFields', 'getViewFields'],
  create: (input: DashboardConfigControllerInput) => new DashboardConfigController(input),
});

export interface RecordReferenceControllerInput
  extends
    Pick<m.MetadataReadInput, 'recordTypes' | 'workflowSteps' | 'dashboardTypes' | 'dashboardConfig'>,
    f.FormDeliveryInput {}
export class RecordReferenceController {
  constructor(protected readonly input: RecordReferenceControllerInput) {}
  async getAllTypes(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getAllTypes(this.input, facts), dashboardReadError);
  }
  async getType(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getType(this.input, facts), dashboardReadError);
  }
  async getWorkflowSteps(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getWorkflowSteps(this.input, facts), dashboardReadError);
  }
  async getAllDashboardTypes(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(
      request,
      reply,
      (facts, valid) => m.getAllDashboardTypes(this.input, facts),
      dashboardReadError
    );
  }
  async getDashboardType(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getDashboardType(this.input, facts), dashboardReadError);
  }
  async getDashboardView(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, (facts, valid) => m.getDashboardView(this.input, facts), dashboardReadError);
  }
  async getDashboardWorkflowSettings(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(
      request,
      reply,
      (facts, valid) => m.getDashboardWorkflowSettings(this.input, facts),
      dashboardReadError
    );
  }
  async getDashboardViewSettings(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(
      request,
      reply,
      (facts, valid) => m.getDashboardViewSettings(this.input, facts),
      dashboardReadError
    );
  }
  async getForm(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    return referenceRead(request, reply, facts => f.getForm(this.input, facts));
  }
}
export const recordReferenceController = defineController({
  name: 'RecordController',
  actions: [
    'getAllTypes',
    'getType',
    'getWorkflowSteps',
    'getAllDashboardTypes',
    'getDashboardType',
    'getDashboardView',
    'getDashboardWorkflowSettings',
    'getDashboardViewSettings',
    'getForm',
  ],
  create: (input: RecordReferenceControllerInput) => new RecordReferenceController(input),
});
