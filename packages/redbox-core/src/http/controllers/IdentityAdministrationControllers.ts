import type { FastifyRequest, FastifyReply } from 'fastify';
import { defineController } from '../controllers';
import { readAction } from '../fastify/readActions';
import { resolvedRequestContract } from '../fastify/validation';
import * as users from '../actions/identityAdministration';
import * as links from '../actions/identityLinks';
import * as admin from '../actions/administration';
import { ApiSiemReadController, apiSiemReadController, type ApiSiemReadControllerInput } from './ReadControllers';

export type ApiUserManagementControllerInput = users.IdentityAdministrationInput & links.IdentityLinksInput;
export class ApiUserManagementController {
  constructor(protected readonly input: ApiUserManagementControllerInput) {}
  createUser(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.createUser(this.input, facts, contract),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  updateUser(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.updateUser(this.input, facts, contract),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  disableUser(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.disableUser(this.input, facts, contract),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  enableUser(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.enableUser(this.input, facts, contract),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  generateAPIToken(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.generateAPIToken(this.input, facts, contract),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  revokeAPIToken(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.revokeAPIToken(this.input, facts, contract),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  listSystemRoles(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.listSystemRoles(this.input, facts, contract),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  createSystemRole(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.createSystemRole(this.input, facts, contract),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  listUsers(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => links.listUsers(this.input, facts, contract),
      (facts, error) => links.identityLinkFailure(this.input, facts, error),
      true
    );
  }
  getUser(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => links.getUser(this.input, facts, contract),
      (facts, error) => links.identityLinkFailure(this.input, facts, error),
      true
    );
  }
  searchLinkCandidates(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => links.searchLinkCandidates(this.input, facts, contract),
      (facts, error) => links.identityLinkFailure(this.input, facts, error),
      true
    );
  }
  getUserLinks(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => links.getUserLinks(this.input, facts, contract),
      (facts, error) => links.identityLinkFailure(this.input, facts, error),
      true
    );
  }
  getUserAudit(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => links.getUserAudit(this.input, facts, contract),
      (facts, error) => links.identityLinkFailure(this.input, facts, error),
      true
    );
  }
  linkAccounts(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => links.linkAccounts(this.input, facts, contract),
      (facts, error) => links.identityLinkFailure(this.input, facts, error),
      true
    );
  }
}
export const apiUserManagementController = defineController({
  name: 'webservice/UserManagementController',
  actions: [
    'createUser',
    'updateUser',
    'disableUser',
    'enableUser',
    'generateAPIToken',
    'revokeAPIToken',
    'listSystemRoles',
    'createSystemRole',
    'listUsers',
    'getUser',
    'searchLinkCandidates',
    'getUserLinks',
    'getUserAudit',
    'linkAccounts',
  ],
  create: (input: ApiUserManagementControllerInput) => new ApiUserManagementController(input),
});

export type AdminIdentityControllerInput = users.IdentityAdministrationInput & links.IdentityLinksInput;
export class AdminIdentityController {
  constructor(protected readonly input: AdminIdentityControllerInput) {}
  disableUser(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.disableUser(this.input, facts, contract, true),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  enableUser(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.enableUser(this.input, facts, contract, true),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  generateUserKey(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.generateAPIToken(this.input, facts, contract, true),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  revokeUserKey(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.revokeAPIToken(this.input, facts, contract, true),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  addLocalUser(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.createUser(this.input, facts, contract, true),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  updateUserDetails(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.updateUser(this.input, facts, contract, true),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  getBrandRoles(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.listSystemRoles(this.input, facts, contract, true),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  updateUserRoles(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.updateUserRoles(this.input, facts, contract),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  getUsers(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => links.getUsers(this.input, facts, contract),
      (facts, error) => links.identityLinkFailure(this.input, facts, error),
      true
    );
  }
  searchLinkCandidates(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => links.searchLinkCandidates(this.input, facts, contract),
      (facts, error) => links.identityLinkFailure(this.input, facts, error),
      true
    );
  }
  getUserLinks(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => links.getUserLinks(this.input, facts, contract),
      (facts, error) => links.identityLinkFailure(this.input, facts, error),
      true
    );
  }
  getUserAudit(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => links.getUserAudit(this.input, facts, contract),
      (facts, error) => links.identityLinkFailure(this.input, facts, error),
      true
    );
  }
  linkAccounts(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => links.linkAccounts(this.input, facts, contract),
      (facts, error) => links.identityLinkFailure(this.input, facts, error),
      true
    );
  }
}
export const adminIdentityController = defineController({
  name: 'AdminController',
  actions: [
    'disableUser',
    'enableUser',
    'generateUserKey',
    'revokeUserKey',
    'addLocalUser',
    'updateUserDetails',
    'getBrandRoles',
    'updateUserRoles',
    'getUsers',
    'searchLinkCandidates',
    'getUserLinks',
    'getUserAudit',
    'linkAccounts',
  ],
  create: (input: AdminIdentityControllerInput) => new AdminIdentityController(input),
});

export type UserIdentityControllerInput = users.IdentityAdministrationInput;
export class UserIdentityController {
  constructor(protected readonly input: UserIdentityControllerInput) {}
  generateUserKey(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.generateAPIToken(this.input, facts, contract, true, true),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  revokeUserKey(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.revokeAPIToken(this.input, facts, contract, true, true),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error),
      true
    );
  }
  update(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => users.updateUser(this.input, facts, contract, true, true),
      (facts, error) => users.identityAdministrationFailure(this.input, facts, error, true),
      true
    );
  }
}
export const userIdentityController = defineController({
  name: 'UserController',
  actions: ['generateUserKey', 'revokeUserKey', 'update'],
  create: (input: UserIdentityControllerInput) => new UserIdentityController(input),
});

export type ApiAdminOperationsControllerInput = admin.AdminOperationsInput;
export class ApiAdminOperationsController {
  constructor(protected readonly input: ApiAdminOperationsControllerInput) {}
  getAppConfig(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => admin.getAppConfig(this.input, facts, contract),
      (facts, error) => admin.adminOperationFailure(this.input, facts, error),
      true
    );
  }
  refreshCachedResources(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => admin.refreshCachedResources(this.input, facts, contract),
      (facts, error) => admin.adminOperationFailure(this.input, facts, error),
      true
    );
  }
  setAppConfig(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => admin.setAppConfig(this.input, facts, contract),
      (facts, error) => admin.adminOperationFailure(this.input, facts, error),
      true
    );
  }
}
export const apiAdminOperationsController = defineController({
  name: 'webservice/AdminController',
  actions: ['getAppConfig', 'refreshCachedResources', 'setAppConfig'],
  create: (input: ApiAdminOperationsControllerInput) => new ApiAdminOperationsController(input),
});

export type ApiSiemAdministrationControllerInput = admin.SiemWritesInput & ApiSiemReadControllerInput;
export class ApiSiemAdministrationController extends ApiSiemReadController {
  constructor(protected readonly input: ApiSiemAdministrationControllerInput) {
    super(input);
  }
  saveConfig(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => admin.saveConfig(this.input, facts, contract),
      (facts, error) => admin.siemWriteFailure(this.input, facts, error),
      true
    );
  }
  testDestination(request: FastifyRequest, reply: FastifyReply) {
    const contract = resolvedRequestContract(request);
    return readAction(
      request,
      reply,
      facts => admin.testDestination(this.input, facts, contract),
      (facts, error) => admin.siemWriteFailure(this.input, facts, error, true),
      true
    );
  }
}
export const apiSiemAdministrationController = defineController({
  name: 'webservice/SiemController',
  actions: [...apiSiemReadController.actions, 'saveConfig', 'testDestination'],
  create: (input: ApiSiemAdministrationControllerInput) => new ApiSiemAdministrationController(input),
});
