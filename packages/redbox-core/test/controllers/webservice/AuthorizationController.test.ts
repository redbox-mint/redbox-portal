import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';
import {
  AuthorizationAdministrationError,
  asRoleKey,
  asScopeKey,
  freezeAuthorizationContext,
  type AuthorizationContext,
} from '../../../src/authorization';
import { Controllers } from '../../../src/controllers/webservice/AuthorizationController';
import { AuthorizationTransactionUnavailableError } from '../../../src/utilities/RequiredTransactionUtils';

function context(scopeKeys: readonly string[]): AuthorizationContext {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: {
      category: 'authenticated',
      authMethod: 'session',
      active: true,
      userId: 'user-1',
      username: 'user@example.test',
    },
    brand: { requestedIdentifier: 'default', id: 'brand-1', name: 'Default', exists: true, authorized: true },
    roles: [
      {
        id: 'role-1',
        key: asRoleKey('Researcher'),
        name: 'Researcher',
        displayName: 'Researchers',
        contextType: 'brand',
        brandId: 'brand-1',
        protectedKind: 'none',
        implicit: false,
        assignmentCount: 1,
        assignmentsTruncated: false,
        assignments: [{ assignmentId: 'assignment-1', source: 'manual', sourceKey: 'manual' }],
        effectiveScopeKeys: scopeKeys.map(asScopeKey),
        inactiveScopeKeys: [],
        missingScopeKeys: [],
      },
    ],
    compatibilityRoles: [],
    grantedScopeKeys: scopeKeys.map(asScopeKey),
    effectiveScopeKeys: scopeKeys.map(asScopeKey),
    scopeProvenance: [],
  });
}

interface CapturedResponse {
  data?: unknown;
  status?: number;
}

function captureSendResp(controller: Controllers.Authorization): { readonly capture: CapturedResponse } {
  const capture: CapturedResponse = {};
  Object.defineProperty(controller, 'sendResp', {
    value: (_req: Sails.Req, res: Sails.Res, response: { data?: unknown; status?: number }) => {
      capture.data = response.data;
      capture.status = response.status ?? 200;
      return res;
    },
  });
  return { capture };
}

function problemResponse(): {
  readonly res: Sails.Res;
  readonly capture: { status?: number; type?: string; body?: Record<string, unknown> };
} {
  const capture: { status?: number; type?: string; body?: Record<string, unknown> } = {};
  const response = {
    status(status: number) {
      capture.status = status;
      return response;
    },
    type(type: string) {
      capture.type = type;
      return response;
    },
    json(body: Record<string, unknown>) {
      capture.body = body;
      return response;
    },
  };
  return { res: response as unknown as Sails.Res, capture };
}

describe('webservice AuthorizationController', () => {
  let originalSails: unknown;

  beforeEach(() => {
    // This suite must not depend on another file having installed the global, and must
    // restore whatever was there so it cannot leak its own config into later suites.
    originalSails = Reflect.get(globalThis, 'sails');
    const existing = typeof originalSails === 'object' && originalSails !== null ? originalSails : {};
    Reflect.set(globalThis, 'sails', {
      ...existing,
      config: {
        ...(Reflect.get(existing as object, 'config') as Record<string, unknown> | undefined),
        authorization: { mode: 'shadow', collectLegacyEvidenceInEnforce: true },
      },
      log: (Reflect.get(existing as object, 'log') as object | undefined) ?? {
        error: () => undefined,
        warn: () => undefined,
        verbose: () => undefined,
        debug: () => undefined,
      },
    });
  });

  afterEach(() => {
    if (originalSails === undefined) {
      Reflect.deleteProperty(globalThis, 'sails');
    } else {
      Reflect.set(globalThis, 'sails', originalSails);
    }
    Reflect.deleteProperty(globalThis, 'AuthorizationScopeService');
    Reflect.deleteProperty(globalThis, 'RoleAdministrationService');
  });

  it('returns a caller-safe /me projection and hides assignment provenance without assignment-read scope', async () => {
    const controller = new Controllers.Authorization();
    const { capture } = captureSendResp(controller);
    const req = {
      authorization: context(['authorization.self.read']),
      path: '/default/rdmp/api/authorization/me',
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;

    await controller.getMe(req, res);

    const data = capture.data as {
      rolloutMode: string;
      principal: { userId?: string; username?: string };
      roles: Array<{ assignments?: unknown }>;
      scopeKeys: readonly string[];
    };
    assert.equal(capture.status, 200);
    assert.equal(data.rolloutMode, 'shadow');
    assert.equal(data.principal.userId, 'user-1');
    assert.equal(data.principal.username, undefined);
    assert.equal(data.roles[0].assignments, undefined);
    assert.deepEqual(data.scopeKeys, ['authorization.self.read']);
  });

  it('returns bounded assignment provenance and truncation metadata only to assignment readers', async () => {
    const controller = new Controllers.Authorization();
    const { capture } = captureSendResp(controller);
    const req = {
      authorization: context(['authorization.self.read', 'authorization.assignment.read']),
      path: '/default/rdmp/api/authorization/me',
    } as unknown as Sails.Req;

    await controller.getMe(req, {} as Sails.Res);

    const role = (
      capture.data as {
        roles: Array<{
          assignmentCount?: number;
          assignmentsTruncated?: boolean;
          assignments?: readonly unknown[];
        }>;
      }
    ).roles[0];
    assert.equal(role.assignmentCount, 1);
    assert.equal(role.assignmentsTruncated, false);
    assert.equal(role.assignments?.length, 1);
  });

  it('forwards only validated scope-catalog filters with the authoritative actor context', async () => {
    const actor = context(['authorization.scope.read']);
    let received: Record<string, unknown> | undefined;
    Reflect.set(globalThis, 'AuthorizationScopeService', {
      listCatalog: (query: Record<string, unknown>) => {
        received = query;
        return Promise.resolve({ generation: 'generation-1', items: [] });
      },
    });
    const controller = new Controllers.Authorization();
    const { capture } = captureSendResp(controller);
    const req = {
      authorization: actor,
      apiRequest: {
        params: {},
        query: { cursor: 'record.read', limit: 25, risk: 'read', status: 'active' },
        body: undefined,
        files: {},
      },
    } as unknown as Sails.Req;

    await controller.listScopes(req, {} as Sails.Res);

    assert.equal(received?.actor, actor);
    assert.deepEqual(received, {
      actor,
      cursor: 'record.read',
      limit: 25,
      namespace: undefined,
      risk: 'read',
      search: undefined,
      sourceType: undefined,
      status: 'active',
    });
    assert.deepEqual(capture.data, { generation: 'generation-1', items: [] });
  });

  it('derives role catalog and create authority from the active context brand', async () => {
    const actor = context(['authorization.role.read', 'authorization.role.manage']);
    const commands: Array<Record<string, unknown>> = [];
    Reflect.set(globalThis, 'RoleAdministrationService', {
      listRoles: (query: Record<string, unknown>) => {
        commands.push(query);
        return Promise.resolve({ items: [] });
      },
      createRole: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ data: { key: 'data-steward' }, version: 1, changed: true });
      },
    });
    const listController = new Controllers.Authorization();
    captureSendResp(listController);
    await listController.listRoles(
      {
        authorization: actor,
        apiRequest: {
          params: {},
          query: { limit: 25, status: 'active', templateKey: 'researcher' },
          body: undefined,
          files: {},
        },
      } as unknown as Sails.Req,
      {} as Sails.Res
    );

    const createController = new Controllers.Authorization();
    const created = captureSendResp(createController);
    await createController.createRole(
      {
        authorization: actor,
        authorizationRequestId: 'request-create-role',
        apiRequest: {
          params: {},
          query: {},
          body: {
            key: 'data-steward',
            displayName: 'Data steward',
            templateKey: 'researcher',
            templateRevision: 1,
            scopeKeys: ['authorization.self.read'],
          },
          files: {},
        },
      } as unknown as Sails.Req,
      {} as Sails.Res
    );

    assert.deepEqual(commands[0], {
      actor,
      brandId: 'brand-1',
      cursor: undefined,
      limit: 25,
      protectedKind: undefined,
      search: undefined,
      status: 'active',
      templateKey: 'researcher',
    });
    assert.deepEqual(commands[1], {
      actor,
      brandId: 'brand-1',
      key: 'data-steward',
      displayName: 'Data steward',
      description: undefined,
      templateKey: 'researcher',
      templateRevision: 1,
      cloneRoleKey: undefined,
      desiredScopeKeys: ['authorization.self.read'],
      reason: undefined,
      requestId: 'request-create-role',
    });
    assert.equal(created.capture.status, 201);
  });

  it('preserves exact grandfathered role keys and dispatches preview/apply lifecycle commands', async () => {
    const actor = context(['authorization.role.manage']);
    const commands: Array<Record<string, unknown>> = [];
    Reflect.set(globalThis, 'RoleAdministrationService', {
      previewRoleInactivation: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ operation: 'role-inactivate' });
      },
      inactivateRole: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ data: { status: 'inactive' }, version: 4, changed: true });
      },
      previewRoleDeletion: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ operation: 'role-delete', confirmationToken: 'delete-token' });
      },
      deleteRole: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ data: { key: 'Legacy Role' }, version: 4, changed: true });
      },
    });
    const request = (body: Record<string, unknown>) =>
      ({
        authorization: actor,
        authorizationRequestId: 'request-lifecycle',
        apiRequest: { params: { key: 'Legacy Role' }, query: {}, body, files: {} },
      }) as unknown as Sails.Req;

    const controller = new Controllers.Authorization();
    captureSendResp(controller);
    await controller.previewRoleInactivation(request({ expectedVersion: 3, reason: 'Retire role' }), {} as Sails.Res);
    await controller.inactivateRole(
      request({ expectedVersion: 3, reason: 'Retire role', confirmationToken: 'inactive-token' }),
      {} as Sails.Res
    );
    await controller.deleteRole(request({ expectedVersion: 4, reason: 'Remove role' }), {} as Sails.Res);
    await controller.deleteRole(
      request({ expectedVersion: 4, reason: 'Remove role', confirmationToken: 'delete-token' }),
      {} as Sails.Res
    );

    assert.deepEqual(
      commands.map(command => [command.roleKey, command.brandId, command.confirmationToken]),
      [
        ['Legacy Role', 'brand-1', undefined],
        ['Legacy Role', 'brand-1', 'inactive-token'],
        ['Legacy Role', 'brand-1', undefined],
        ['Legacy Role', 'brand-1', 'delete-token'],
      ]
    );
  });

  it('forwards only validated assignment filters inside the active brand', async () => {
    const actor = context(['authorization.assignment.read']);
    let received: Record<string, unknown> | undefined;
    Reflect.set(globalThis, 'RoleAdministrationService', {
      listAssignments: (query: Record<string, unknown>) => {
        received = query;
        return Promise.resolve({ items: [] });
      },
    });
    const controller = new Controllers.Authorization();
    captureSendResp(controller);
    await controller.listAssignments(
      {
        authorization: actor,
        apiRequest: {
          params: {},
          query: {
            cursor: 'assignment-1',
            limit: 25,
            userId: 'user-2',
            roleKey: 'Researcher',
            source: 'external',
            status: 'suppressed',
            sourcePresent: 'false',
            expiry: 'never',
          },
          body: undefined,
          files: {},
        },
      } as unknown as Sails.Req,
      {} as Sails.Res
    );

    assert.deepEqual(received, {
      actor,
      brandId: 'brand-1',
      cursor: 'assignment-1',
      limit: 25,
      principalId: 'user-2',
      roleKey: 'Researcher',
      source: 'external',
      status: 'suppressed',
      sourcePresent: false,
      expiry: 'never',
    });
  });

  it('forces single-user assignment routes to the documented manual source tuple', async () => {
    const actor = context(['authorization.assignment.manage', 'system.authorization.manage']);
    const commands: Array<Record<string, unknown>> = [];
    Reflect.set(globalThis, 'RoleAdministrationService', {
      grantAssignment: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ data: { id: 'assignment-1' }, version: 1, changed: true });
      },
      revokeAssignment: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ data: { id: 'assignment-1' }, version: 2, changed: true });
      },
    });
    const request = (roleKey: string, body: Record<string, unknown>) =>
      ({
        authorization: actor,
        authorizationRequestId: 'request-assignment',
        apiRequest: { params: { roleKey, userId: 'target-user' }, query: {}, body, files: {} },
      }) as unknown as Sails.Req;

    const controller = new Controllers.Authorization();
    captureSendResp(controller);
    await controller.grantAssignment(
      request('Researcher', { expiresAt: '2099-01-01T00:00:00.000Z', reason: 'Reviewed grant' }),
      {} as Sails.Res
    );
    await controller.revokeAssignment(
      request('Researcher', { expectedVersion: 1, reason: 'Reviewed revoke' }),
      {} as Sails.Res
    );
    await controller.grantAssignment(request('system-admin', {}), {} as Sails.Res);

    assert.deepEqual(
      commands.map(command => ({
        brandId: command.brandId,
        roleKey: command.roleKey,
        source: command.source,
        sourceKey: command.sourceKey,
        expectedVersion: command.expectedVersion,
      })),
      [
        {
          brandId: 'brand-1',
          roleKey: 'Researcher',
          source: 'manual',
          sourceKey: 'manual',
          expectedVersion: undefined,
        },
        {
          brandId: 'brand-1',
          roleKey: 'Researcher',
          source: 'manual',
          sourceKey: 'manual',
          expectedVersion: 1,
        },
        {
          brandId: undefined,
          roleKey: 'system-admin',
          source: 'manual',
          sourceKey: 'manual',
          expectedVersion: undefined,
        },
      ]
    );
  });

  it('dispatches external suppression and unchanged bulk preview/apply commands', async () => {
    const actor = context(['authorization.assignment.manage']);
    const commands: Array<Record<string, unknown>> = [];
    Reflect.set(globalThis, 'RoleAdministrationService', {
      suppressAssignment: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ data: { status: 'suppressed' }, version: 2, changed: true });
      },
      unsuppressAssignment: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ data: { status: 'active' }, version: 3, changed: true });
      },
      previewBulkAssignments: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ rows: [], invalidCount: 0, confirmationToken: 'bulk-token' });
      },
      applyBulkAssignments: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ data: { appliedCount: 1 }, version: 1, changed: true });
      },
    });
    const byIdRequest = {
      authorization: actor,
      authorizationRequestId: 'request-suppression',
      apiRequest: {
        params: { assignmentId: 'assignment-1' },
        query: {},
        body: { expectedVersion: 1, reason: 'Local source decision' },
        files: {},
      },
    } as unknown as Sails.Req;
    const rows = [{ action: 'grant', principalId: 'user-2', roleKey: 'Researcher' }];
    const bulkRequest = (body: Record<string, unknown>) =>
      ({
        authorization: actor,
        authorizationRequestId: 'request-bulk',
        apiRequest: { params: {}, query: {}, body, files: {} },
      }) as unknown as Sails.Req;
    const controller = new Controllers.Authorization();
    captureSendResp(controller);

    await controller.suppressAssignment(byIdRequest, {} as Sails.Res);
    await controller.unsuppressAssignment(byIdRequest, {} as Sails.Res);
    await controller.previewBulkAssignments(bulkRequest({ rows, reason: 'Reviewed batch' }), {} as Sails.Res);
    await controller.applyBulkAssignments(
      bulkRequest({ rows, reason: 'Reviewed batch', confirmationToken: 'bulk-token' }),
      {} as Sails.Res
    );

    assert.deepEqual(
      commands.map(command => [command.assignmentId, command.brandId, command.confirmationToken]),
      [
        ['assignment-1', 'brand-1', undefined],
        ['assignment-1', 'brand-1', undefined],
        [undefined, 'brand-1', undefined],
        [undefined, 'brand-1', 'bulk-token'],
      ]
    );
    assert.deepEqual(commands[2].rows, rows);
    assert.deepEqual(commands[3].rows, rows);
  });

  it('previews then publishes an unchanged template revision command', async () => {
    const actor = context(['system.authorization.manage']);
    const commands: Array<Record<string, unknown>> = [];
    Reflect.set(globalThis, 'RoleAdministrationService', {
      previewTemplateRevision: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ operation: 'template-publish', confirmationToken: 'confirmation' });
      },
      publishTemplateRevision: (command: Record<string, unknown>) => {
        commands.push(command);
        return Promise.resolve({ data: { revision: 2 }, version: 2, changed: true });
      },
    });
    const controller = new Controllers.Authorization();
    const first = captureSendResp(controller);
    const baseRequest = {
      authorization: actor,
      authorizationRequestId: 'request-1',
      apiRequest: {
        params: { key: 'researcher' },
        query: {},
        body: { expectedVersion: 1, scopeKeys: ['record.read'], notes: 'Add record access' },
        files: {},
      },
    } as unknown as Sails.Req;

    await controller.publishTemplateRevision(baseRequest, {} as Sails.Res);
    assert.equal(first.capture.status, 200);
    assert.equal(commands[0].actor, actor);
    assert.equal(commands[0].templateKey, 'researcher');
    assert.deepEqual(commands[0].scopeKeys, ['record.read']);

    const secondController = new Controllers.Authorization();
    const second = captureSendResp(secondController);
    const applyRequest = {
      ...baseRequest,
      apiRequest: {
        ...baseRequest.apiRequest,
        body: { ...baseRequest.apiRequest.body, confirmationToken: 'confirmation' },
      },
    } as unknown as Sails.Req;
    await secondController.publishTemplateRevision(applyRequest, {} as Sails.Res);

    assert.equal(second.capture.status, 201);
    assert.equal(commands[1].confirmationToken, 'confirmation');
    assert.equal(commands[1].requestId, 'request-1');
  });

  it('normalizes a validated template key before service lookup', async () => {
    let receivedKey: string | undefined;
    Reflect.set(globalThis, 'AuthorizationScopeService', {
      getTemplateRevision: (_actor: AuthorizationContext, key: string) => {
        receivedKey = key;
        return Promise.resolve({
          templateKey: key,
          revision: 1,
          scopeKeys: [],
          publishedBy: 'operator-1',
          publishedAt: '2026-08-29T00:00:00.000Z',
        });
      },
    });
    const controller = new Controllers.Authorization();
    captureSendResp(controller);
    const req = {
      authorization: context(['authorization.role.read']),
      apiRequest: {
        params: { key: '  researcher  ', revision: 1 },
        query: {},
        body: undefined,
        files: {},
      },
    } as unknown as Sails.Req;

    await controller.getTemplateRevision(req, {} as Sails.Res);

    assert.equal(receivedKey, 'researcher');
  });

  it('maps service failures to bounded Problem Details without the service message', async () => {
    Reflect.set(globalThis, 'AuthorizationScopeService', {
      listTemplates: () =>
        Promise.reject(
          new AuthorizationAdministrationError(
            'authorization.scope-denied',
            403,
            'Sensitive role topology must not appear in the response.'
          )
        ),
    });
    const controller = new Controllers.Authorization();
    const problem = problemResponse();
    const req = {
      authorization: context(['authorization.role.read']),
      authorizationRequestId: 'request-problem',
      path: '/default/rdmp/api/authorization/templates',
      apiRequest: { params: {}, query: {}, body: undefined, files: {} },
    } as unknown as Sails.Req;

    await controller.listTemplates(req, problem.res);

    assert.equal(problem.capture.status, 403);
    assert.equal(problem.capture.type, 'application/problem+json');
    assert.equal(problem.capture.body?.code, 'authorization.scope-denied');
    assert.equal(problem.capture.body?.requestId, 'request-problem');
    assert.equal(JSON.stringify(problem.capture.body).includes('Sensitive role topology'), false);
  });

  it('fails closed with 503 when an assignment mutation cannot obtain a required transaction', async () => {
    Reflect.set(globalThis, 'RoleAdministrationService', {
      grantAssignment: () =>
        Promise.reject(new AuthorizationTransactionUnavailableError('Sensitive datastore topology detail.')),
    });
    const controller = new Controllers.Authorization();
    const problem = problemResponse();
    const req = {
      authorization: context(['authorization.assignment.manage']),
      authorizationRequestId: 'request-assignment-transaction',
      path: '/default/rdmp/api/authorization/assignments/Researcher/users/user-2',
      apiRequest: {
        params: { roleKey: 'Researcher', userId: 'user-2' },
        query: {},
        body: {},
        files: {},
      },
    } as unknown as Sails.Req;

    await controller.grantAssignment(req, problem.res);

    assert.equal(problem.capture.status, 503);
    assert.equal(problem.capture.type, 'application/problem+json');
    assert.equal(problem.capture.body?.code, 'authorization.transaction-unavailable');
    assert.equal(JSON.stringify(problem.capture.body).includes('Sensitive datastore'), false);
  });

  it('never reflects query-string credentials through the Problem Details instance', async () => {
    const internalError = new Error('backend connection included a credential');
    internalError.name = 'credential-secret-from-untrusted-error-name';
    let loggedDetails: Record<string, unknown> | undefined;
    Reflect.set(sails.log, 'error', (_message: string, details: Record<string, unknown>) => {
      loggedDetails = details;
    });
    Reflect.set(globalThis, 'AuthorizationScopeService', {
      listTemplates: () => Promise.reject(internalError),
    });
    const controller = new Controllers.Authorization();
    const problem = problemResponse();
    const req = {
      authorization: context(['authorization.role.read']),
      authorizationRequestId: 'request-redacted',
      originalUrl: '/default/rdmp/api/authorization/templates?access_token=credential-secret',
      apiRequest: { params: {}, query: {}, body: undefined, files: {} },
    } as unknown as Sails.Req;

    await controller.listTemplates(req, problem.res);

    assert.equal(problem.capture.status, 500);
    assert.equal(problem.capture.body?.instance, '/default/rdmp/api/authorization/templates');
    assert.equal(JSON.stringify(problem.capture.body).includes('credential-secret'), false);
    assert.equal(JSON.stringify(problem.capture.body).includes('backend connection'), false);
    assert.deepEqual(loggedDetails, { requestId: 'request-redacted', errorType: 'error' });
    assert.equal(JSON.stringify(loggedDetails).includes(internalError.name), false);
  });
});
