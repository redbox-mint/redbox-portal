import type { FastifyRequest, FastifyReply } from 'fastify';
import { defineController } from '../controllers';
import { readAction } from '../fastify/readActions';
import { resolvedRequestContract } from '../fastify/validation';
import { ApiSearchReadController, apiSearchReadController, type ApiSearchReadControllerInput } from './ReadControllers';
import {
  UserIdentityController,
  userIdentityController,
  type UserIdentityControllerInput,
} from './IdentityAdministrationControllers';
import * as v from '../actions/vocabularyAdministration';
import * as rva from '../actions/vocabularyIntegrations';
import * as b from '../actions/brandingOperations';
import * as f from '../actions/figshareAdministration';
import * as o from '../actions/integrationOperations';
import * as l from '../actions/formVocabulary';
export type ApiVocabularyControllerInput = v.VocabularyAdministrationInput & rva.VocabularyIntegrationInput;
export class ApiVocabularyController {
  constructor(protected readonly input: ApiVocabularyControllerInput) {}
  import(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => rva.importVocabulary(this.input, facts, contract),
      facts => rva.vocabularyIntegrationFailure(this.input, facts),
      true
    );
  }
  sync(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => rva.sync(this.input, facts, contract),
      facts => rva.vocabularyIntegrationFailure(this.input, facts),
      true
    );
  }
  list(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => v.list(this.input, facts, contract),
      (facts, error) => v.vocabularyAdministrationFailure(this.input, facts, error),
      true
    );
  }
  get(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => v.get(this.input, facts, contract),
      (facts, error) => v.vocabularyAdministrationFailure(this.input, facts, error),
      true
    );
  }
  create(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => v.create(this.input, facts, contract),
      (facts, error) => v.vocabularyAdministrationFailure(this.input, facts, error),
      true
    );
  }
  update(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => v.update(this.input, facts, contract),
      (facts, error) => v.vocabularyAdministrationFailure(this.input, facts, error),
      true
    );
  }
  reorder(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => v.reorder(this.input, facts, contract),
      (facts, error) => v.vocabularyAdministrationFailure(this.input, facts, error),
      true
    );
  }
  delete(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => v.deleteVocabulary(this.input, facts, contract),
      (facts, error) => v.vocabularyAdministrationFailure(this.input, facts, error),
      true
    );
  }
}
export const apiVocabularyController = defineController({
  name: 'webservice/VocabularyController',
  actions: ['import', 'sync', 'list', 'get', 'create', 'update', 'reorder', 'delete'],
  create: (input: ApiVocabularyControllerInput) => new ApiVocabularyController(input),
});
export type VocabularyControllerInput = v.VocabularyAdministrationInput & rva.VocabularyIntegrationInput;
export class VocabularyController {
  constructor(protected readonly input: VocabularyControllerInput) {}
  import(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => rva.importVocabulary(this.input, facts, contract, true),
      facts => rva.vocabularyIntegrationFailure(this.input, facts),
      true
    );
  }
  sync(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => rva.sync(this.input, facts, contract, true),
      facts => rva.vocabularyIntegrationFailure(this.input, facts),
      true
    );
  }
  list(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => v.list(this.input, facts, contract),
      (facts, error) => v.vocabularyAdministrationFailure(this.input, facts, error, true),
      true
    );
  }
  get(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => v.get(this.input, facts, contract),
      (facts, error) => v.vocabularyAdministrationFailure(this.input, facts, error, true),
      true
    );
  }
  create(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => v.create(this.input, facts, contract),
      (facts, error) => v.vocabularyAdministrationFailure(this.input, facts, error, true),
      true
    );
  }
  update(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => v.update(this.input, facts, contract),
      (facts, error) => v.vocabularyAdministrationFailure(this.input, facts, error, true),
      true
    );
  }
  delete(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => v.deleteVocabulary(this.input, facts, contract),
      (facts, error) => v.vocabularyAdministrationFailure(this.input, facts, error, true),
      true
    );
  }
}
export const vocabularyController = defineController({
  name: 'VocabularyController',
  actions: ['import', 'sync', 'list', 'get', 'create', 'update', 'delete'],
  create: (input: VocabularyControllerInput) => new VocabularyController(input),
});
export type ApiBrandingControllerInput = b.BrandingOperationsInput;
export class ApiBrandingController {
  constructor(protected readonly input: ApiBrandingControllerInput) {}
  config(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.config(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  draft(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.draft(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  deleteFace(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.deleteFace(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  useDefault(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.useDefault(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  revert(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.revert(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  preview(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.preview(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  versions(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.versions(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  versionPreview(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.versionPreview(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  publish(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.publish(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  restore(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.restore(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  rollback(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.rollback(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  history(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.history(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
}
export const apiBrandingController = defineController({
  name: 'webservice/BrandingController',
  actions: [
    'config',
    'draft',
    'deleteFace',
    'useDefault',
    'revert',
    'preview',
    'versions',
    'versionPreview',
    'publish',
    'restore',
    'rollback',
    'history',
  ],
  create: (input: ApiBrandingControllerInput) => new ApiBrandingController(input),
});
export type BrandingAppControllerInput = b.BrandingOperationsInput;
export class BrandingAppController {
  constructor(protected readonly input: BrandingAppControllerInput) {}
  config(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.config(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  draft(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.draft(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  deleteFace(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.deleteFace(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  useDefault(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.useDefault(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  revert(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.revert(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  preview(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.preview(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  versions(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.versions(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  versionPreview(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.versionPreview(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  publish(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.publish(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  restore(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.restore(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
  rollback(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.rollback(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
}
export const brandingAppController = defineController({
  name: 'BrandingAppController',
  actions: [
    'config',
    'draft',
    'deleteFace',
    'useDefault',
    'revert',
    'preview',
    'versions',
    'versionPreview',
    'publish',
    'restore',
    'rollback',
  ],
  create: (input: BrandingAppControllerInput) => new BrandingAppController(input),
});
export type BrandingControllerInput = b.BrandingOperationsInput;
export class BrandingController {
  constructor(protected readonly input: BrandingControllerInput) {}
  createPreview(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => b.createPreview(this.input, facts, contract),
      (facts, error) => b.brandingOperationFailure(this.input, facts, error),
      true
    );
  }
}
export const brandingController = defineController({
  name: 'BrandingController',
  actions: ['createPreview'],
  create: (input: BrandingControllerInput) => new BrandingController(input),
});
export type ApiFigshareCrosswalkControllerInput = f.FigshareAdministrationInput;
export class ApiFigshareCrosswalkController {
  constructor(protected readonly input: ApiFigshareCrosswalkControllerInput) {}
  list(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.list(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  create(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.create(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  usage(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.usage(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  listLocalEntries(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.listLocalEntries(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  listMappings(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.listMappings(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  saveMappings(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.saveMappings(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  approve(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.approve(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  get(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.get(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  delete(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.deleteCrosswalk(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
}
export const apiFigshareCrosswalkController = defineController({
  name: 'webservice/FigshareCrosswalkController',
  actions: ['list', 'create', 'usage', 'listLocalEntries', 'listMappings', 'saveMappings', 'approve', 'get', 'delete'],
  create: (input: ApiFigshareCrosswalkControllerInput) => new ApiFigshareCrosswalkController(input),
});
export type ApiFigshareVocabularyControllerInput = f.FigshareAdministrationInput;
export class ApiFigshareVocabularyController {
  constructor(protected readonly input: ApiFigshareVocabularyControllerInput) {}
  listCatalogues(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.listCatalogues(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  listSources(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.listSources(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  getSource(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.getSource(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  listSourceCategories(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.listSourceCategories(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  createSourcePreview(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.createSourcePreview(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  cloneSource(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.cloneSource(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  listSyncRuns(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.listSyncRuns(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  createPreview(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.createPreview(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  getPreview(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.getPreview(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
  applyPreview(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => f.applyPreview(this.input, facts, contract),
      (facts, error) => f.figshareAdministrationFailure(this.input, facts, error),
      true
    );
  }
}
export const apiFigshareVocabularyController = defineController({
  name: 'webservice/FigshareVocabularyController',
  actions: [
    'listCatalogues',
    'listSources',
    'getSource',
    'listSourceCategories',
    'createSourcePreview',
    'cloneSource',
    'listSyncRuns',
    'createPreview',
    'getPreview',
    'applyPreview',
  ],
  create: (input: ApiFigshareVocabularyControllerInput) => new ApiFigshareVocabularyController(input),
});
export type ApiSearchControllerInput = o.IntegrationOperationsInput & ApiSearchReadControllerInput;
export class ApiSearchController extends ApiSearchReadController {
  constructor(protected readonly integrationInput: ApiSearchControllerInput) {
    super(integrationInput);
  }
  index(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => o.index(this.integrationInput, facts, contract),
      facts => o.integrationOperationFailure(this.integrationInput, facts),
      true
    );
  }
  indexAll(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => o.indexAll(this.integrationInput, facts, contract),
      facts => o.integrationOperationFailure(this.integrationInput, facts),
      true
    );
  }
  removeAll(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => o.removeAll(this.integrationInput, facts, contract),
      facts => o.integrationOperationFailure(this.integrationInput, facts),
      true
    );
  }
}
export const apiSearchController = defineController({
  name: 'webservice/SearchController',
  actions: [...apiSearchReadController.actions, 'index', 'indexAll', 'removeAll'],
  create: (input: ApiSearchControllerInput) => new ApiSearchController(input),
});
export type EmailControllerInput = o.IntegrationOperationsInput;
export class EmailController {
  constructor(protected readonly input: EmailControllerInput) {}
  sendNotification(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => o.sendNotification(this.input, facts, contract),
      facts => o.integrationOperationFailure(this.input, facts),
      true
    );
  }
}
export const emailController = defineController({
  name: 'EmailController',
  actions: ['sendNotification'],
  create: (input: EmailControllerInput) => new EmailController(input),
});
export type FormVocabularyControllerInput = l.FormVocabularyInput;
export class FormVocabularyController {
  constructor(protected readonly input: FormVocabularyControllerInput) {}
  get(request: FastifyRequest, reply: FastifyReply) {
    return readAction(
      request,
      reply,
      facts => l.get(this.input, facts),
      (facts, error) => l.formVocabularyFailure(this.input, facts, error, 'get'),
      true
    );
  }
  entries(request: FastifyRequest, reply: FastifyReply) {
    return readAction(
      request,
      reply,
      facts => l.entries(this.input, facts),
      (facts, error) => l.formVocabularyFailure(this.input, facts, error, 'entries'),
      true
    );
  }
  children(request: FastifyRequest, reply: FastifyReply) {
    return readAction(
      request,
      reply,
      facts => l.children(this.input, facts),
      (facts, error) => l.formVocabularyFailure(this.input, facts, error, 'children'),
      true
    );
  }
  expandPath(request: FastifyRequest, reply: FastifyReply) {
    return readAction(
      request,
      reply,
      facts => l.expandPath(this.input, facts),
      (facts, error) => l.formVocabularyFailure(this.input, facts, error, 'expandPath'),
      true
    );
  }
  getRecords(request: FastifyRequest, reply: FastifyReply) {
    return readAction(
      request,
      reply,
      facts => l.getRecords(this.input, facts),
      (facts, error) => l.formVocabularyFailure(this.input, facts, error, 'getRecords'),
      true
    );
  }
  externalEntries(request: FastifyRequest, reply: FastifyReply) {
    return readAction(
      request,
      reply,
      facts => l.externalEntries(this.input, facts),
      (facts, error) => l.formVocabularyFailure(this.input, facts, error, 'externalEntries'),
      true
    );
  }
  serviceEntries(request: FastifyRequest, reply: FastifyReply) {
    return readAction(
      request,
      reply,
      facts => l.serviceEntries(this.input, facts),
      (facts, error) => l.formVocabularyFailure(this.input, facts, error, 'serviceEntries'),
      true
    );
  }
}
export const formVocabularyController = defineController({
  name: 'FormVocabularyController',
  actions: ['get', 'entries', 'children', 'expandPath', 'getRecords', 'externalEntries', 'serviceEntries'],
  create: (input: FormVocabularyControllerInput) => new FormVocabularyController(input),
});
export type UserControllerInput = l.FormVocabularyInput & UserIdentityControllerInput;
export class UserController extends UserIdentityController {
  constructor(protected readonly integrationInput: UserControllerInput) {
    super(integrationInput);
  }
  find(request: FastifyRequest, reply: FastifyReply) {
    return readAction(
      request,
      reply,
      facts => l.find(this.integrationInput, facts),
      (facts, error) => l.formVocabularyFailure(this.integrationInput, facts, error, 'find'),
      true
    );
  }
}
export const userController = defineController({
  name: 'UserController',
  actions: [...userIdentityController.actions, 'find'],
  create: (input: UserControllerInput) => new UserController(input),
});
