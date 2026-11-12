import type { FastifyRequest, FastifyReply } from 'fastify';
import { defineController } from '../controllers';
import { readAction } from '../fastify/readActions';
import { resolvedRequestContract } from '../fastify/validation';
import * as r from '../actions/recordMutations';
import * as c from '../actions/configurationWrites';
import * as q from '../actions/queryWrites';
import * as h from '../actions/harvestMutations';
import * as a from '../actions/configuredActions';
import * as reads from './ReadControllers';
import * as refs from './ReferenceControllers';

export type ApiRecordMutationControllerInput = r.RecordMutationInput &
  h.HarvestMutationInput &
  reads.ApiRecordReadControllerInput;
export class ApiRecordMutationController extends reads.ApiRecordReadController {
  constructor(protected readonly input: ApiRecordMutationControllerInput) {
    super(input);
  }
  create(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.create(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  updateObjectMeta(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.updateObjectMeta(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  deleteRecord(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.deleteRecord(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  restoreRecord(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.restoreRecord(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  destroyDeletedRecord(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.destroyDeletedRecord(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  transitionWorkflow(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.transitionWorkflow(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  addUserEdit(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.addUserEdit(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  removeUserEdit(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.removeUserEdit(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  addUserView(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.addUserView(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  removeUserView(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.removeUserView(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  addRoleEdit(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.addRoleEdit(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  removeRoleEdit(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.removeRoleEdit(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  addRoleView(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.addRoleView(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  removeRoleView(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.removeRoleView(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  harvest(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => h.harvest(this.input, facts, contract),
      (facts, error) => h.harvestMutationFailure(this.input, facts, error),
      true
    );
  }
  legacyHarvest(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => h.legacyHarvest(this.input, facts, contract),
      (facts, error) => h.harvestMutationFailure(this.input, facts, error),
      true
    );
  }
}
export const apiRecordMutationController = defineController({
  name: 'webservice/RecordController',
  actions: [
    ...reads.apiRecordReadController.actions,
    'create',
    'updateObjectMeta',
    'deleteRecord',
    'restoreRecord',
    'destroyDeletedRecord',
    'transitionWorkflow',
    'addUserEdit',
    'removeUserEdit',
    'addUserView',
    'removeUserView',
    'addRoleEdit',
    'removeRoleEdit',
    'addRoleView',
    'removeRoleView',
    'harvest',
    'legacyHarvest',
  ],
  create: (input: ApiRecordMutationControllerInput) => new ApiRecordMutationController(input),
});

export type RecordMutationControllerInput = r.RecordMutationInput & reads.RecordReadControllerInput;
export class RecordMutationController extends reads.RecordReadController {
  constructor(protected readonly input: RecordMutationControllerInput) {
    super(input);
  }
  create(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.create(this.input, facts, contract, true),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  update(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.update(this.input, facts, contract),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  delete(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.deleteRecord(this.input, facts, contract, true),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  restoreRecord(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.restoreRecord(this.input, facts, contract, true),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  destroyDeletedRecord(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.destroyDeletedRecord(this.input, facts, contract, true),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
  stepTo(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => r.transitionWorkflow(this.input, facts, contract, true),
      (facts, error) => r.recordMutationFailure(this.input, facts, error),
      true
    );
  }
}
export const recordMutationController = defineController({
  name: 'RecordController',
  actions: [
    ...reads.recordReadController.actions,
    'create',
    'update',
    'delete',
    'restoreRecord',
    'destroyDeletedRecord',
    'stepTo',
  ],
  create: (input: RecordMutationControllerInput) => new RecordMutationController(input),
});

export type ApiAppConfigMutationControllerInput = Pick<c.ConfigurationWriteInput, 'appConfigs'> &
  refs.AppConfigControllerInput;
export class ApiAppConfigMutationController extends refs.AppConfigController {
  constructor(protected readonly input: ApiAppConfigMutationControllerInput) {
    super(input);
  }
  saveAppConfig(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.saveAppConfig(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, false, false, 'saveAppConfig', false),
      true
    );
  }
  resetAppConfig(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.resetAppConfig(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, false, false, 'resetAppConfig', false),
      true
    );
  }
}
export const apiAppConfigMutationController = defineController({
  name: 'webservice/AppConfigController',
  actions: [...refs.appConfigController.actions, 'saveAppConfig', 'resetAppConfig'],
  create: (input: ApiAppConfigMutationControllerInput) => new ApiAppConfigMutationController(input),
});

export type AppConfigMutationControllerInput = Pick<c.ConfigurationWriteInput, 'appConfigs'> &
  refs.AppConfigFormControllerInput;
export class AppConfigMutationController extends refs.AppConfigFormController {
  constructor(protected readonly input: AppConfigMutationControllerInput) {
    super(input);
  }
  saveAppConfig(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.saveAppConfig(this.input, facts, contract, true),
      (facts, error) => c.configurationWriteFailure(facts, error, false, true, 'saveAppConfig', false),
      true
    );
  }
}
export const appConfigMutationController = defineController({
  name: 'AppConfigController',
  actions: [...refs.appConfigFormController.actions, 'saveAppConfig'],
  create: (input: AppConfigMutationControllerInput) => new AppConfigMutationController(input),
});

export type ApiTranslationMutationControllerInput = Pick<
  c.ConfigurationWriteInput,
  'translations' | 'reloadTranslations'
> &
  refs.TranslationControllerInput;
export class ApiTranslationMutationController extends refs.TranslationController {
  constructor(protected readonly input: ApiTranslationMutationControllerInput) {
    super(input);
  }
  setEntry(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.setEntry(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, false, false, 'setEntry', false),
      true
    );
  }
  deleteEntry(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.deleteEntry(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, false, false, 'deleteEntry', false),
      true
    );
  }
  setBundle(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.setBundle(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, false, false, 'setBundle', false),
      true
    );
  }
  updateBundleEnabled(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.updateBundleEnabled(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, false, false, 'updateBundleEnabled', false),
      true
    );
  }
}
export const apiTranslationMutationController = defineController({
  name: 'webservice/TranslationController',
  actions: [...refs.translationController.actions, 'setEntry', 'deleteEntry', 'setBundle', 'updateBundleEnabled'],
  create: (input: ApiTranslationMutationControllerInput) => new ApiTranslationMutationController(input),
});

export type TranslationMutationControllerInput = Pick<
  c.ConfigurationWriteInput,
  'translations' | 'reloadTranslations'
> &
  refs.BrowserTranslationControllerInput;
export class TranslationMutationController extends refs.BrowserTranslationController {
  constructor(protected readonly input: TranslationMutationControllerInput) {
    super(input);
  }
  setEntryApp(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.setEntry(this.input, facts, contract, true),
      (facts, error) => c.configurationWriteFailure(facts, error, false, true, 'setEntryApp', true),
      true
    );
  }
  setBundleApp(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.setBundle(this.input, facts, contract, true),
      (facts, error) => c.configurationWriteFailure(facts, error, false, true, 'setBundleApp', true),
      true
    );
  }
}
export const translationMutationController = defineController({
  name: 'TranslationController',
  actions: [...refs.browserTranslationController.actions, 'setEntryApp', 'setBundleApp'],
  create: (input: TranslationMutationControllerInput) => new TranslationMutationController(input),
});

export type ApiDashboardMutationControllerInput = Pick<c.ConfigurationWriteInput, 'dashboardConfig'> &
  refs.DashboardConfigControllerInput;
export class ApiDashboardMutationController extends refs.DashboardConfigController {
  constructor(protected readonly input: ApiDashboardMutationControllerInput) {
    super(input);
  }
  saveWorkflowTarget(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.saveWorkflowTarget(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, true, false, 'saveWorkflowTarget', false),
      true
    );
  }
  saveViewTarget(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.saveViewTarget(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, true, false, 'saveViewTarget', false),
      true
    );
  }
  validateSettings(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.validateSettings(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, true, false, 'validateSettings', false),
      true
    );
  }
  previewCopy(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.previewCopy(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, true, false, 'previewCopy', false),
      true
    );
  }
  applyCopy(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.applyCopy(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, true, false, 'applyCopy', false),
      true
    );
  }
  retiredOperation(request: FastifyRequest, reply: FastifyReply) {
    return readAction(
      request,
      reply,
      () => Promise.resolve(c.retiredOperation()),
      (facts, error) => c.configurationWriteFailure(facts, error, true, false, 'retiredOperation', false),
      true
    );
  }
}
export const apiDashboardMutationController = defineController({
  name: 'webservice/DashboardConfigController',
  actions: [
    ...refs.dashboardConfigController.actions,
    'saveWorkflowTarget',
    'saveViewTarget',
    'validateSettings',
    'previewCopy',
    'applyCopy',
  ],
  create: (input: ApiDashboardMutationControllerInput) => new ApiDashboardMutationController(input),
});

export type DashboardMutationControllerInput = Pick<c.ConfigurationWriteInput, 'dashboardConfig'> &
  refs.DashboardConfigControllerInput;
export class DashboardMutationController extends refs.DashboardConfigController {
  constructor(protected readonly input: DashboardMutationControllerInput) {
    super(input);
  }
  saveWorkflowTarget(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.saveWorkflowTarget(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, true, true, 'saveWorkflowTarget', false),
      true
    );
  }
  saveViewTarget(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.saveViewTarget(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, true, true, 'saveViewTarget', false),
      true
    );
  }
  validateSettings(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.validateSettings(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, true, true, 'validateSettings', false),
      true
    );
  }
  previewCopy(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.previewCopy(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, true, true, 'previewCopy', false),
      true
    );
  }
  applyCopy(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => c.applyCopy(this.input, facts, contract),
      (facts, error) => c.configurationWriteFailure(facts, error, true, true, 'applyCopy', false),
      true
    );
  }
}
export const dashboardMutationController = defineController({
  name: 'DashboardConfigController',
  actions: [
    ...refs.browserDashboardConfigController.actions,
    'saveWorkflowTarget',
    'saveViewTarget',
    'validateSettings',
    'previewCopy',
    'applyCopy',
  ],
  create: (input: DashboardMutationControllerInput) => new DashboardMutationController(input),
});

export type ApiNamedQueryMutationControllerInput = q.QueryWriteInput & reads.ApiNamedQueryReadControllerInput;
export class ApiNamedQueryMutationController extends reads.ApiNamedQueryReadController {
  constructor(protected readonly input: ApiNamedQueryMutationControllerInput) {
    super(input);
  }
  createQuery(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => q.createQuery(this.input, facts, contract),
      (facts, error) => q.queryWriteFailure(this.input, facts, error, true),
      true
    );
  }
  updateQuery(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => q.updateQuery(this.input, facts, contract),
      (facts, error) => q.queryWriteFailure(this.input, facts, error, true),
      true
    );
  }
  deleteQuery(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => q.deleteQuery(this.input, facts, contract),
      (facts, error) => q.queryWriteFailure(this.input, facts, error, true),
      true
    );
  }
}
export const apiNamedQueryMutationController = defineController({
  name: 'webservice/NamedQueryController',
  actions: [...reads.apiNamedQueryReadController.actions, 'createQuery', 'updateQuery', 'deleteQuery'],
  create: (input: ApiNamedQueryMutationControllerInput) => new ApiNamedQueryMutationController(input),
});

export type ApiReportMutationControllerInput = q.QueryWriteInput & reads.ApiReportReadControllerInput;
export class ApiReportMutationController extends reads.ApiReportReadController {
  constructor(protected readonly input: ApiReportMutationControllerInput) {
    super(input);
  }
  createConfig(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => q.createConfig(this.input, facts, contract),
      (facts, error) => q.queryWriteFailure(this.input, facts, error, false),
      true
    );
  }
  updateConfig(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => q.updateConfig(this.input, facts, contract),
      (facts, error) => q.queryWriteFailure(this.input, facts, error, false),
      true
    );
  }
  deleteConfig(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => q.deleteConfig(this.input, facts, contract),
      (facts, error) => q.queryWriteFailure(this.input, facts, error, false),
      true
    );
  }
}
export const apiReportMutationController = defineController({
  name: 'webservice/ReportController',
  actions: [...reads.apiReportReadController.actions, 'createConfig', 'updateConfig', 'deleteConfig'],
  create: (input: ApiReportMutationControllerInput) => new ApiReportMutationController(input),
});

export type ReportMutationControllerInput = q.QueryWriteInput & reads.ReportReadControllerInput;
export class ReportMutationController extends reads.ReportReadController {
  constructor(protected readonly input: ReportMutationControllerInput) {
    super(input);
  }
  createConfig(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => q.createConfig(this.input, facts, contract),
      (facts, error) => q.queryWriteFailure(this.input, facts, error, false),
      true
    );
  }
  updateConfig(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => q.updateConfig(this.input, facts, contract),
      (facts, error) => q.queryWriteFailure(this.input, facts, error, false),
      true
    );
  }
  deleteConfig(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => q.deleteConfig(this.input, facts, contract),
      (facts, error) => q.queryWriteFailure(this.input, facts, error, false),
      true
    );
  }
}
export const reportMutationController = defineController({
  name: 'ReportController',
  actions: [...reads.reportReadController.actions, 'createConfig', 'updateConfig', 'deleteConfig'],
  create: (input: ReportMutationControllerInput) => new ReportMutationController(input),
});

export type ActionControllerInput = a.ConfiguredActionInput;
export class ActionController {
  constructor(protected readonly input: ActionControllerInput) {}
  callService(request: FastifyRequest, reply: FastifyReply) {
    return readAction(
      request,
      reply,
      facts => a.callService(this.input, facts),
      facts => a.configuredActionFailure(this.input, facts),
      true
    );
  }
}
export const actionController = defineController({
  name: 'ActionController',
  actions: ['callService'],
  create: (input: ActionControllerInput) => new ActionController(input),
});
