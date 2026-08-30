import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
  applyAuthorizationBulkAssignmentsRoute,
  applyAuthorizationBulkTemplateUpgradeRoute,
  applyAuthorizationImportRoute,
  applyAuthorizationRoleScopesRoute,
  applyAuthorizationScopeAdoptionRoute,
  applyAuthorizationRoleTemplateUpgradeRoute,
  authorizationApiRoutes,
  buildCoreApiRouteConfig,
  buildCoreApiOpenApiDocument,
  createAuthorizationRoleRoute,
  deleteAuthorizationRoleRoute,
  explainAuthorizationDecisionRoute,
  exportAuthorizationConfigurationRoute,
  grantAuthorizationAssignmentRoute,
  getAuthorizationMeRoute,
  getAuthorizationReadinessRoute,
  getAuthorizationRoleRoute,
  getAuthorizationTemplateRevisionRoute,
  getObjectSchemaShape,
  inactivateAuthorizationRoleRoute,
  listAuthorizationAssignmentsRoute,
  listAuthorizationAuditRoute,
  listAuthorizationScopesRoute,
  listAuthorizationRolesRoute,
  previewAuthorizationBulkTemplateUpgradeRoute,
  previewAuthorizationBulkAssignmentsRoute,
  previewAuthorizationImportRoute,
  previewAuthorizationRoleInactivationRoute,
  previewAuthorizationRoleScopesRoute,
  previewAuthorizationScopeAdoptionRoute,
  previewAuthorizationRoleTemplateUpgradeRoute,
  publishAuthorizationTemplateRevisionRoute,
  revokeAuthorizationAssignmentRoute,
  suppressAuthorizationAssignmentRoute,
  unsuppressAuthorizationAssignmentRoute,
  registerCoreApiRoutes,
  updateAuthorizationRoleRoute,
  validateApiRouteRequest,
} from '../../src/api-routes';
import { authorizationProblemSchema } from '../../src/api-routes/schemas/authorization';
import { AUTHORIZATION_ADMIN_MAX_BULK_BYTES, AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES } from '../../src/authorization';
import { policies } from '../../src/config/policies.config';

describe('authorization contract API routes', function () {
  // Building the OpenAPI document walks every registered route, which exceeds the
  // default per-test budget, matching the allowance in the core API route contract suite.
  this.timeout(60_000);

  it('registers the read-side contract with explicit business scopes', () => {
    const routes = registerCoreApiRoutes().filter(route => route.controller === 'webservice/AuthorizationController');
    assert.equal(routes.length, 33);
    assert.deepEqual(
      routes.map(route => [route.method, route.path, route.action, route.authorization]),
      [
        [
          'get',
          '/:branding/:portal/api/authorization/me',
          'getMe',
          { kind: 'scope', scope: 'authorization.self.read' },
        ],
        [
          'get',
          '/:branding/:portal/api/authorization/scopes',
          'listScopes',
          { kind: 'scope', scope: 'authorization.scope.read' },
        ],
        [
          'get',
          '/:branding/:portal/api/authorization/templates',
          'listTemplates',
          { kind: 'scope', scope: 'authorization.role.read' },
        ],
        [
          'get',
          '/:branding/:portal/api/authorization/templates/:key/revisions/:revision',
          'getTemplateRevision',
          { kind: 'scope', scope: 'authorization.role.read' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/templates/:key/revisions',
          'publishTemplateRevision',
          { kind: 'scope', scope: 'system.authorization.manage' },
        ],
        [
          'get',
          '/:branding/:portal/api/authorization/roles',
          'listRoles',
          { kind: 'scope', scope: 'authorization.role.read' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/roles',
          'createRole',
          { kind: 'scope', scope: 'authorization.role.manage' },
        ],
        [
          'get',
          '/:branding/:portal/api/authorization/roles/:key',
          'getRole',
          { kind: 'scope', scope: 'authorization.role.read' },
        ],
        [
          'patch',
          '/:branding/:portal/api/authorization/roles/:key',
          'updateRole',
          { kind: 'scope', scope: 'authorization.role.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/roles/:key/scope-preview',
          'previewRoleScopes',
          { kind: 'scope', scope: 'authorization.role.manage' },
        ],
        [
          'put',
          '/:branding/:portal/api/authorization/roles/:key/scopes',
          'applyRoleScopes',
          { kind: 'scope', scope: 'authorization.role.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/roles/:key/scope-adoption-preview',
          'previewScopeAdoption',
          { kind: 'scope', scope: 'system.authorization.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/roles/:key/scope-adoption',
          'applyScopeAdoption',
          { kind: 'scope', scope: 'system.authorization.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/roles/:key/template-upgrade-preview',
          'previewRoleTemplateUpgrade',
          { kind: 'scope', scope: 'authorization.role.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/roles/:key/template-upgrade',
          'applyRoleTemplateUpgrade',
          { kind: 'scope', scope: 'authorization.role.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/template-upgrades/bulk-preview',
          'previewBulkTemplateUpgrade',
          { kind: 'scope', scope: 'system.authorization.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/template-upgrades/bulk-apply',
          'applyBulkTemplateUpgrade',
          { kind: 'scope', scope: 'system.authorization.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/roles/:key/inactivation-preview',
          'previewRoleInactivation',
          { kind: 'scope', scope: 'authorization.role.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/roles/:key/inactivate',
          'inactivateRole',
          { kind: 'scope', scope: 'authorization.role.manage' },
        ],
        [
          'delete',
          '/:branding/:portal/api/authorization/roles/:key',
          'deleteRole',
          { kind: 'scope', scope: 'authorization.role.manage' },
        ],
        [
          'get',
          '/:branding/:portal/api/authorization/assignments',
          'listAssignments',
          { kind: 'scope', scope: 'authorization.assignment.read' },
        ],
        [
          'put',
          '/:branding/:portal/api/authorization/assignments/:roleKey/users/:userId',
          'grantAssignment',
          { kind: 'scope', scope: 'authorization.assignment.manage' },
        ],
        [
          'delete',
          '/:branding/:portal/api/authorization/assignments/:roleKey/users/:userId',
          'revokeAssignment',
          { kind: 'scope', scope: 'authorization.assignment.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/assignments/:assignmentId/suppress',
          'suppressAssignment',
          { kind: 'scope', scope: 'authorization.assignment.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/assignments/:assignmentId/unsuppress',
          'unsuppressAssignment',
          { kind: 'scope', scope: 'authorization.assignment.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/assignments/bulk-preview',
          'previewBulkAssignments',
          { kind: 'scope', scope: 'authorization.assignment.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/assignments/bulk-apply',
          'applyBulkAssignments',
          { kind: 'scope', scope: 'authorization.assignment.manage' },
        ],
        [
          'get',
          '/:branding/:portal/api/authorization/audit',
          'listAudit',
          { kind: 'scope', scope: 'authorization.audit.read' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/explain',
          'explainDecision',
          { kind: 'scope', scope: 'authorization.explain' },
        ],
        [
          'get',
          '/:branding/:portal/api/authorization/rollout/readiness',
          'getReadiness',
          { kind: 'scope', scope: 'system.authorization.manage' },
        ],
        [
          'get',
          '/:branding/:portal/api/authorization/export',
          'exportConfiguration',
          { kind: 'scope', scope: 'system.authorization.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/import-preview',
          'previewImport',
          { kind: 'scope', scope: 'system.authorization.manage' },
        ],
        [
          'post',
          '/:branding/:portal/api/authorization/import-apply',
          'applyImport',
          { kind: 'scope', scope: 'system.authorization.manage' },
        ],
      ]
    );
  });

  it('adds conditional CSRF before validation on every unsafe authorization action', () => {
    const controllerPolicies = policies['webservice/AuthorizationController'];
    assert.equal(typeof controllerPolicies, 'object');
    assert.ok(!Array.isArray(controllerPolicies));
    const actionPolicies = controllerPolicies as Record<string, readonly string[]>;
    for (const action of [
      'getMe',
      'listScopes',
      'listTemplates',
      'getTemplateRevision',
      'listRoles',
      'getRole',
      'listAssignments',
      'listAudit',
      'getReadiness',
      'exportConfiguration',
    ]) {
      assert.equal(actionPolicies[action].includes('protectSessionMutation'), false, action);
    }
    for (const action of [
      'publishTemplateRevision',
      'createRole',
      'updateRole',
      'previewRoleScopes',
      'applyRoleScopes',
      'previewScopeAdoption',
      'applyScopeAdoption',
      'previewRoleTemplateUpgrade',
      'applyRoleTemplateUpgrade',
      'previewBulkTemplateUpgrade',
      'applyBulkTemplateUpgrade',
      'previewRoleInactivation',
      'inactivateRole',
      'deleteRole',
      'grantAssignment',
      'revokeAssignment',
      'suppressAssignment',
      'unsuppressAssignment',
      'previewBulkAssignments',
      'applyBulkAssignments',
      'explainDecision',
      'previewImport',
      'applyImport',
    ]) {
      assert.equal(actionPolicies[action].includes('protectSessionMutation'), true, action);
      assert.ok(
        actionPolicies[action].indexOf('protectSessionMutation') <
          actionPolicies[action].indexOf('validateApiContractRequest'),
        action
      );
    }
  });

  it('keeps every runtime authorization route and generated OpenAPI operation in lockstep', () => {
    const runtimeRoutes = buildCoreApiRouteConfig() as Record<string, Record<string, unknown>>;
    const document = buildCoreApiOpenApiDocument() as {
      paths: Record<
        string,
        Record<
          string,
          {
            operationId?: string;
            parameters?: Array<{ in?: string; name?: string; required?: boolean }>;
            requestBody?: { required?: boolean; content?: Record<string, unknown> };
            responses?: Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }>;
            security?: Array<Record<string, unknown>>;
            tags?: string[];
            'x-redbox-scope'?: string;
          }
        >
      >;
    };
    const authorizationRuntimeRoutes = Object.entries(runtimeRoutes).filter(
      ([, target]) => target.controller === 'webservice/AuthorizationController'
    );

    assert.equal(authorizationApiRoutes.length, 33);
    assert.equal(authorizationRuntimeRoutes.length, authorizationApiRoutes.length);

    for (const route of authorizationApiRoutes) {
      const runtimeKey = `${route.method} ${route.path}`;
      assert.deepEqual(runtimeRoutes[runtimeKey], {
        controller: route.controller,
        action: route.action,
        authorization: route.authorization,
        routeId: route.routeId,
        csrf: false,
      });

      const openApiPath = route.path
        .replace(/:([A-Za-z0-9_]+)\*/gu, '{$1}')
        .replace(/:([A-Za-z0-9_]+)\?/gu, '{$1}')
        .replace(/:([A-Za-z0-9_]+)/gu, '{$1}');
      const operation = document.paths[openApiPath]?.[route.method];
      assert.ok(operation, `${route.method.toUpperCase()} ${route.path}`);
      assert.equal(operation.operationId, route.operationId);
      assert.deepEqual(operation.tags, ['Authorization']);
      assert.equal(
        operation['x-redbox-scope'],
        route.authorization.kind === 'scope' ? route.authorization.scope : undefined
      );
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);

      const parameters = new Set(operation.parameters?.map(parameter => `${parameter.in}:${parameter.name}`));
      for (const [location, schema] of [
        ['path', route.request?.params],
        ['query', route.request?.query],
        ['header', route.request?.headers],
      ] as const) {
        for (const name of Object.keys(getObjectSchemaShape(schema) ?? {})) {
          assert.ok(parameters.has(`${location}:${name}`), `${runtimeKey} ${location}:${name}`);
        }
      }
      const pathNames = [...route.path.matchAll(/:([A-Za-z0-9_]+)/gu)].map(match => match[1]);
      for (const name of pathNames) {
        const parameter = operation.parameters?.find(candidate => candidate.in === 'path' && candidate.name === name);
        assert.equal(parameter?.required, true, `${runtimeKey} path:${name}`);
      }

      const requestContent = route.request?.body?.content;
      assert.equal(operation.requestBody !== undefined, requestContent !== undefined, `${runtimeKey} request body`);
      if (requestContent !== undefined) {
        assert.equal(operation.requestBody?.required, route.request?.body?.required ?? false, runtimeKey);
        assert.deepEqual(Object.keys(operation.requestBody?.content ?? {}).sort(), Object.keys(requestContent).sort());
      }

      assert.deepEqual(
        Object.keys(operation.responses ?? {}).sort(),
        Object.keys(route.responses ?? {}).sort(),
        runtimeKey
      );
      for (const status of ['400', '401', '403', '404', '409', '422', '500', '503']) {
        const problem = operation.responses?.[status]?.content?.['application/problem+json'];
        assert.ok(problem, `${runtimeKey} ${status}`);
        assert.deepEqual(problem.schema?.required, [
          'type',
          'title',
          'status',
          'detail',
          'instance',
          'code',
          'requestId',
        ]);
      }
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        if (Number(status) >= 400) continue;
        const successSchema = response.content?.['application/json']?.schema;
        assert.equal(Array.isArray(successSchema?.anyOf), true, `${runtimeKey} ${status} success envelope`);
      }
    }
  });

  it('publishes matching OpenAPI scope and Problem Details contracts', () => {
    const document = buildCoreApiOpenApiDocument({ branding: 'default', portal: 'rdmp' }) as {
      paths: Record<
        string,
        Record<
          string,
          {
            parameters?: Array<{ in?: string; name?: string; schema?: Record<string, unknown> }>;
            responses?: Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }>;
            security?: Array<Record<string, unknown>>;
            'x-redbox-scope'?: string;
          }
        >
      >;
    };
    const operation = document.paths['/default/rdmp/api/authorization/templates/{key}/revisions']?.post;
    assert.ok(operation);
    assert.equal(operation['x-redbox-scope'], 'system.authorization.manage');
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    const versionHeader = operation.parameters?.find(
      parameter => parameter.in === 'header' && parameter.name === 'x-redbox-api-version'
    );
    assert.deepEqual(versionHeader?.schema?.enum, ['1.0', '2.0']);
    assert.equal(Array.isArray(operation.responses?.['200']?.content?.['application/json']?.schema?.anyOf), true);
    for (const status of ['400', '401', '403', '404', '409', '422', '500', '503']) {
      const response = operation.responses?.[status];
      assert.deepEqual(Object.keys(response?.content ?? {}), ['application/problem+json']);
      assert.ok((response?.content?.['application/problem+json']?.schema?.required as string[]).includes('requestId'));
    }
  });

  it('publishes the runtime UTF-8 payload and non-empty row bounds in OpenAPI', () => {
    const document = buildCoreApiOpenApiDocument();
    const bulkOperation = document.paths['/{branding}/{portal}/api/authorization/assignments/bulk-preview']?.post as {
      requestBody?: { content?: Record<string, { schema?: unknown }> };
    };
    const importOperation = document.paths['/{branding}/{portal}/api/authorization/import-preview']?.post as {
      requestBody?: { content?: Record<string, { schema?: unknown }> };
    };
    const bulkSchema = JSON.stringify(bulkOperation.requestBody?.content?.['application/json']?.schema);
    const importSchema = JSON.stringify(importOperation.requestBody?.content?.['application/json']?.schema);

    assert.ok(bulkSchema.includes('"minItems":1'));
    assert.ok(bulkSchema.includes(`"maxLength":${AUTHORIZATION_ADMIN_MAX_BULK_BYTES}`));
    assert.ok(bulkSchema.includes(`maximum ${AUTHORIZATION_ADMIN_MAX_BULK_BYTES} UTF-8 bytes`));
    assert.ok(importSchema.includes(`"maxLength":${AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES}`));
    assert.ok(importSchema.includes(`maximum ${AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES} UTF-8 bytes`));
  });

  it('declares bounded request schemas at the route source', () => {
    const validScopeQuery = listAuthorizationScopesRoute.request?.query?.safeParse({ limit: '100', risk: 'read' });
    const invalidScopeQuery = listAuthorizationScopesRoute.request?.query?.safeParse({ limit: '101' });
    const validPublish = publishAuthorizationTemplateRevisionRoute.request?.body?.content[
      'application/json'
    ]?.schema?.safeParse({ expectedVersion: 1, scopeKeys: ['record.read'] });
    const invalidPublish = publishAuthorizationTemplateRevisionRoute.request?.body?.content[
      'application/json'
    ]?.schema?.safeParse({ expectedVersion: 0, scopeKeys: ['record.*'] });
    const clientAuthority = validateApiRouteRequest(
      {
        params: { key: 'researcher' },
        query: {},
        headers: {},
        body: {
          expectedVersion: 1,
          scopeKeys: ['record.read'],
          effectiveScopeKeys: ['system.authorization.manage'],
          affectedAssignments: 0,
        },
      } as unknown as Sails.Req,
      publishAuthorizationTemplateRevisionRoute
    );
    const fractionalLimit = validateApiRouteRequest(
      {
        params: {},
        query: { limit: '1.5' },
        headers: {},
      } as unknown as Sails.Req,
      listAuthorizationScopesRoute
    );
    const fractionalRevision = validateApiRouteRequest(
      {
        params: { key: 'researcher', revision: '1.5' },
        query: {},
        headers: {},
      } as unknown as Sails.Req,
      getAuthorizationTemplateRevisionRoute
    );

    assert.equal(validScopeQuery?.success, true);
    assert.equal(invalidScopeQuery?.success, false);
    assert.equal(validPublish?.success, true);
    assert.equal(invalidPublish?.success, false);
    assert.equal(clientAuthority.valid, false);
    assert.equal(fractionalLimit.valid, false);
    assert.equal(fractionalRevision.valid, false);
    assert.equal(getAuthorizationMeRoute.request?.headers?.safeParse({ 'x-redbox-api-version': '2.0' }).success, true);
    assert.equal(getAuthorizationMeRoute.request?.headers?.safeParse({ 'x-redbox-api-version': '3.0' }).success, false);
    assert.equal(getAuthorizationMeRoute.request?.params, undefined);
    assert.equal(getAuthorizationMeRoute.request?.query, undefined);
    assert.equal(getAuthorizationMeRoute.request?.body, undefined);

    assert.equal(
      listAuthorizationRolesRoute.request?.query?.safeParse({ limit: '100', status: 'inactive' }).success,
      true
    );
    assert.equal(listAuthorizationRolesRoute.request?.query?.safeParse({ limit: '101' }).success, false);
    assert.equal(
      createAuthorizationRoleRoute.request?.body?.content['application/json']?.schema?.safeParse({
        key: 'data-steward',
        displayName: 'Data steward',
        scopeKeys: ['record.read'],
      }).success,
      true
    );
    assert.equal(
      createAuthorizationRoleRoute.request?.body?.content['application/json']?.schema?.safeParse({
        key: 'data-steward',
        displayName: 'Data steward',
        effectiveScopeKeys: ['system.authorization.manage'],
        branding: 'another-brand',
      }).success,
      false
    );
    assert.equal(
      updateAuthorizationRoleRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 2,
      }).success,
      false
    );
    assert.equal(
      updateAuthorizationRoleRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 2,
        description: null,
      }).success,
      true
    );
    assert.equal(
      previewAuthorizationRoleScopesRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 2,
        scopeKeys: Array.from({ length: 501 }, () => 'record.read'),
      }).success,
      false
    );
    assert.equal(
      applyAuthorizationRoleScopesRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 2,
        scopeKeys: ['record.read'],
        confirmationToken: 'opaque',
        affectedAssignments: 0,
      }).success,
      false
    );
    assert.equal(
      previewAuthorizationScopeAdoptionRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 2,
        scopeKey: 'authorization.audit.read',
      }).success,
      true
    );
    assert.equal(
      applyAuthorizationScopeAdoptionRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 2,
        scopeKey: 'authorization.audit.read',
        confirmationToken: 'opaque',
        desiredScopeKeys: ['system.authorization.manage'],
      }).success,
      false
    );
    assert.equal(
      previewAuthorizationRoleTemplateUpgradeRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 2,
        targetRevision: 3,
      }).success,
      true
    );
    assert.equal(
      applyAuthorizationRoleTemplateUpgradeRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 2,
        targetRevision: 3,
        confirmationToken: 'opaque',
      }).success,
      true
    );
    assert.equal(
      previewAuthorizationBulkTemplateUpgradeRoute.request?.body?.content['application/json']?.schema?.safeParse({
        templateKey: 'researcher',
        targetRevision: 3,
        roles: [{ roleId: 'role-1', expectedVersion: 2 }],
      }).success,
      true
    );
    assert.equal(
      applyAuthorizationBulkTemplateUpgradeRoute.request?.body?.content['application/json']?.schema?.safeParse({
        templateKey: 'researcher',
        targetRevision: 3,
        roles: [
          { roleId: 'role-1', expectedVersion: 2 },
          { roleId: 'role-1', expectedVersion: 2 },
        ],
        confirmationToken: 'opaque',
      }).success,
      false
    );
    assert.equal(
      previewAuthorizationRoleInactivationRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 2,
      }).success,
      true
    );
    assert.equal(
      inactivateAuthorizationRoleRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 2,
        confirmationToken: 'opaque',
      }).success,
      true
    );
    assert.equal(
      deleteAuthorizationRoleRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 2,
      }).success,
      true
    );
    assert.equal(getAuthorizationRoleRoute.request?.params?.safeParse({ key: 'Grandfathered Role' }).success, true);
    assert.equal(
      listAuthorizationAssignmentsRoute.request?.query?.safeParse({
        limit: '100',
        roleKey: 'Grandfathered Role',
        source: 'external',
        status: 'suppressed',
        sourcePresent: 'false',
        expiry: 'never',
      }).success,
      true
    );
    assert.equal(
      listAuthorizationAssignmentsRoute.request?.query?.safeParse({ sourcePresent: '0', expiry: 'all' }).success,
      false
    );
    assert.equal(
      grantAuthorizationAssignmentRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expiresAt: '2099-01-01T00:00:00.000Z',
      }).success,
      true
    );
    assert.equal(
      grantAuthorizationAssignmentRoute.request?.body?.content['application/json']?.schema?.safeParse({
        source: 'external',
        brandId: 'another-brand',
      }).success,
      false
    );
    assert.equal(
      revokeAuthorizationAssignmentRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 1,
        sourceKey: 'external-source',
      }).success,
      false
    );
    assert.equal(
      suppressAuthorizationAssignmentRoute.request?.body?.content['application/json']?.schema?.safeParse({
        expectedVersion: 1,
      }).success,
      true
    );
    assert.equal(
      unsuppressAuthorizationAssignmentRoute.request?.params?.safeParse({ assignmentId: 'assignment-1' }).success,
      true
    );
    const bulkRows = [{ action: 'grant', principalId: 'user-1', roleKey: 'Researcher' }];
    const serializedBulkRows = JSON.stringify(bulkRows);
    const maxByteBulkRows = serializedBulkRows.padEnd(AUTHORIZATION_ADMIN_MAX_BULK_BYTES, ' ');
    assert.equal(
      previewAuthorizationBulkAssignmentsRoute.request?.body?.content['application/json']?.schema?.safeParse({
        rows: bulkRows,
      }).success,
      true
    );
    assert.equal(
      previewAuthorizationBulkAssignmentsRoute.request?.body?.content['application/json']?.schema?.safeParse({
        rows: [],
      }).success,
      false
    );
    assert.equal(
      previewAuthorizationBulkAssignmentsRoute.request?.body?.content['application/json']?.schema?.safeParse({
        rows: maxByteBulkRows,
      }).success,
      true
    );
    assert.equal(
      previewAuthorizationBulkAssignmentsRoute.request?.body?.content['application/json']?.schema?.safeParse({
        rows: `${maxByteBulkRows} `,
      }).success,
      false
    );
    assert.equal(
      previewAuthorizationBulkAssignmentsRoute.request?.body?.content['application/json']?.schema?.safeParse({
        rows: '😀'.repeat(AUTHORIZATION_ADMIN_MAX_BULK_BYTES / 4 + 1),
      }).success,
      false
    );
    assert.equal(
      previewAuthorizationBulkAssignmentsRoute.request?.body?.content['application/json']?.schema?.safeParse({
        format: 'csv',
        rows: bulkRows,
      }).success,
      false
    );
    assert.equal(
      listAuthorizationAuditRoute.request?.query?.safeParse({
        limit: '100',
        eventType: 'role.updated',
        outcome: 'denied',
        targetType: 'role',
      }).success,
      true
    );
    assert.equal(listAuthorizationAuditRoute.request?.query?.safeParse({ limit: '101' }).success, false);
    assert.equal(
      explainAuthorizationDecisionRoute.request?.body?.content['application/json']?.schema?.safeParse({
        subjectId: 'user-1',
        brandId: 'brand-1',
        scopeKey: 'record.read',
        resource: { found: true, brandId: 'brand-1', recordAcl: 'allowed' },
      }).success,
      true
    );
    assert.equal(
      explainAuthorizationDecisionRoute.request?.body?.content['application/json']?.schema?.safeParse({
        subjectId: 'user-1',
        brandId: 'brand-1',
        scopeKey: 'record.read',
        resource: { recordId: 'must-not-be-queried' },
      }).success,
      false
    );
    assert.equal(getAuthorizationReadinessRoute.request?.body, undefined);
    assert.equal(
      exportAuthorizationConfigurationRoute.request?.query?.safeParse({
        includeAssignments: 'true',
        includeSystemAssignments: 'false',
      }).success,
      true
    );
    assert.equal(
      exportAuthorizationConfigurationRoute.request?.headers?.safeParse({
        'x-redbox-authorization-confirmation': 'opaque',
      }).success,
      true
    );
    assert.equal(
      exportAuthorizationConfigurationRoute.request?.query?.safeParse({ confirmationToken: 'must-not-enter-a-url' })
        .success,
      false
    );
    assert.equal(
      exportAuthorizationConfigurationRoute.request?.query?.safeParse({ includeAssignments: '1' }).success,
      false
    );
    const configuration = {
      schemaVersion: 1,
      templates: [
        {
          key: 'researcher',
          displayName: 'Researchers',
          description: 'Researcher template',
          protectedKind: 'none',
          status: 'active',
          version: 1,
          revisions: [{ revision: 1, scopeKeys: ['record.read'] }],
        },
      ],
      roles: [],
    };
    const serializedConfiguration = JSON.stringify(configuration);
    const maxByteConfiguration = serializedConfiguration.padEnd(AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES, ' ');
    assert.equal(
      previewAuthorizationImportRoute.request?.body?.content['application/json']?.schema?.safeParse({
        document: configuration,
      }).success,
      true
    );
    assert.equal(
      previewAuthorizationImportRoute.request?.body?.content['application/json']?.schema?.safeParse({
        document: {
          ...configuration,
          assignments: [
            {
              principalId: 'user-1',
              brandId: 'brand-1',
              roleKey: 'researcher',
              source: 'manual',
              sourceKey: 'manual',
              status: 'revoked',
              sourcePresent: false,
              version: 1,
            },
          ],
        },
      }).success,
      true
    );
    assert.equal(
      previewAuthorizationImportRoute.request?.body?.content['application/json']?.schema?.safeParse({
        document: {
          ...configuration,
          templates: [{ ...configuration.templates[0], version: Number.MAX_SAFE_INTEGER + 1 }],
        },
      }).success,
      false
    );
    assert.equal(
      previewAuthorizationImportRoute.request?.body?.content['application/json']?.schema?.safeParse({
        document: { ...configuration, unknown: true },
      }).success,
      false
    );
    assert.equal(
      previewAuthorizationImportRoute.request?.body?.content['application/json']?.schema?.safeParse({
        document: maxByteConfiguration,
      }).success,
      true
    );
    assert.equal(
      previewAuthorizationImportRoute.request?.body?.content['application/json']?.schema?.safeParse({
        document: `${maxByteConfiguration} `,
      }).success,
      false
    );
    assert.equal(
      previewAuthorizationImportRoute.request?.body?.content['application/json']?.schema?.safeParse({
        document: '😀'.repeat(AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES / 4 + 1),
      }).success,
      false
    );
    assert.equal(
      previewAuthorizationImportRoute.request?.body?.content['application/json']?.schema?.safeParse({
        document: {
          ...configuration,
          roles: [
            {
              brandId: 'b'.repeat(129),
              key: 'researcher',
              displayName: 'Researchers',
              protectedKind: 'none',
              status: 'active',
              effectiveScopeKeys: ['record.read'],
              version: 1,
            },
          ],
        },
      }).success,
      false
    );
    assert.equal(
      previewAuthorizationImportRoute.request?.body?.content['application/json']?.schema?.safeParse({
        document: {
          ...configuration,
          roles: [
            {
              brandId: 'brand-1',
              key: 'researcher',
              displayName: 'Researchers',
              description: '   ',
              protectedKind: 'none',
              status: 'active',
              effectiveScopeKeys: ['record.read'],
              version: 1,
            },
          ],
        },
      }).success,
      false
    );
    assert.equal(
      applyAuthorizationImportRoute.request?.body?.content['application/json']?.schema?.safeParse({
        document: configuration,
      }).success,
      false
    );
    assert.equal(
      applyAuthorizationImportRoute.request?.body?.content['application/json']?.schema?.safeParse({
        document: configuration,
        confirmationToken: 'opaque',
      }).success,
      true
    );
    assert.equal(
      applyAuthorizationBulkAssignmentsRoute.request?.body?.content['application/json']?.schema?.safeParse({
        rows: bulkRows,
      }).success,
      false
    );
    assert.equal(
      applyAuthorizationBulkAssignmentsRoute.request?.body?.content['application/json']?.schema?.safeParse({
        rows: Array.from({ length: 101 }, () => bulkRows[0]),
        confirmationToken: 'opaque',
      }).success,
      false
    );
    assert.equal(
      previewAuthorizationBulkAssignmentsRoute.request?.body?.content['application/json']?.schema?.safeParse({
        rows: [
          {
            action: 'revoke',
            principalId: 'user-1',
            roleKey: 'Researcher',
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        ],
      }).success,
      false
    );
    const boundedProblem = {
      type: 'https://redboxresearchdata.com/problems/authorization/not-found',
      title: 'Resource was not found',
      status: 404,
      detail: 'Resource was not found',
      instance: '/default/rdmp/api/authorization/roles/missing',
      code: 'authorization.not-found',
      requestId: 'request-1',
    };
    assert.equal(authorizationProblemSchema.safeParse(boundedProblem).success, true);
    assert.equal(authorizationProblemSchema.safeParse({ ...boundedProblem, roleId: 'hidden' }).success, false);
    assert.equal(authorizationProblemSchema.safeParse({ ...boundedProblem, detail: 'x'.repeat(1_001) }).success, false);
  });

  it('describes exact v1 and v2 success representations for template publication', () => {
    const preview = {
      operation: 'template-publish',
      current: {
        templateKey: 'researcher',
        revision: 1,
        scopeKeys: ['authorization.self.read'],
        displayName: 'Researchers',
        description: 'Researcher template',
        version: 1,
      },
      proposed: {
        templateKey: 'researcher',
        revision: 2,
        scopeKeys: ['authorization.self.read', 'record.read'],
        displayName: 'Researchers',
        description: 'Researcher template',
        notes: 'Reviewed',
        version: 2,
      },
      addedScopeKeys: ['record.read'],
      removedScopeKeys: [],
      affectedAssignments: 0,
      warnings: [],
      fatalErrors: [],
      confirmationToken: 'confirmation-token',
    };
    const responseSchema =
      publishAuthorizationTemplateRevisionRoute.responses?.[200]?.content?.['application/json']?.schema;
    const revisionSchema =
      getAuthorizationTemplateRevisionRoute.responses?.[200]?.content?.['application/json']?.schema;

    assert.equal(responseSchema?.safeParse(preview).success, true);
    assert.equal(responseSchema?.safeParse({ data: preview, meta: {} }).success, true);
    assert.equal(
      responseSchema?.safeParse({ operation: 'template-publish', confirmationToken: 'opaque' }).success,
      false
    );
    assert.equal(
      revisionSchema?.safeParse({
        revision: 1,
        scopeKeys: [],
        publishedBy: 'operator-1',
        publishedAt: '2026-08-29T00:00:00.000Z',
      }).success,
      false
    );
  });

  it('publishes the assignment filters, scope, and typed mutation response in OpenAPI', () => {
    const document = buildCoreApiOpenApiDocument({ branding: 'default', portal: 'rdmp' }) as {
      paths: Record<
        string,
        Record<
          string,
          {
            parameters?: Array<{ in?: string; name?: string }>;
            responses?: Record<
              string,
              { content?: Record<string, { schema?: { safeParse(value: unknown): unknown } }> }
            >;
            'x-redbox-scope'?: string;
          }
        >
      >;
    };
    const list = document.paths['/default/rdmp/api/authorization/assignments']?.get;
    const grant = document.paths['/default/rdmp/api/authorization/assignments/{roleKey}/users/{userId}']?.put;

    assert.equal(list?.['x-redbox-scope'], 'authorization.assignment.read');
    assert.deepEqual(
      list?.parameters?.filter(parameter => parameter.in === 'query').map(parameter => parameter.name),
      ['cursor', 'limit', 'userId', 'roleKey', 'source', 'status', 'sourcePresent', 'expiry']
    );
    assert.equal(grant?.['x-redbox-scope'], 'authorization.assignment.manage');
    for (const status of ['400', '401', '403', '404', '409', '422', '500', '503']) {
      assert.deepEqual(Object.keys(grant?.responses?.[status]?.content ?? {}), ['application/problem+json']);
    }
  });

  it('publishes exact audit, explain, readiness, export, and import OpenAPI operations', () => {
    const document = buildCoreApiOpenApiDocument({ branding: 'default', portal: 'rdmp' }) as {
      paths: Record<
        string,
        Record<
          string,
          {
            'x-redbox-scope'?: string;
            parameters?: Array<{ name: string; in: string }>;
            responses?: Record<string, unknown>;
          }
        >
      >;
    };
    const expected = [
      ['/default/rdmp/api/authorization/audit', 'get', 'authorization.audit.read'],
      ['/default/rdmp/api/authorization/explain', 'post', 'authorization.explain'],
      ['/default/rdmp/api/authorization/rollout/readiness', 'get', 'system.authorization.manage'],
      ['/default/rdmp/api/authorization/export', 'get', 'system.authorization.manage'],
      ['/default/rdmp/api/authorization/import-preview', 'post', 'system.authorization.manage'],
      ['/default/rdmp/api/authorization/import-apply', 'post', 'system.authorization.manage'],
    ] as const;
    for (const [path, method, scope] of expected) {
      const operation = document.paths[path]?.[method];
      assert.equal(operation?.['x-redbox-scope'], scope, `${method.toUpperCase()} ${path}`);
      for (const status of ['400', '401', '403', '404', '409', '422', '500', '503']) {
        assert.ok(operation?.responses?.[status], `${method.toUpperCase()} ${path} ${status}`);
      }
    }
    const exportOperation = document.paths['/default/rdmp/api/authorization/export']?.get;
    assert.equal(
      exportOperation?.parameters?.some(
        parameter => parameter.in === 'header' && parameter.name === 'x-redbox-authorization-confirmation'
      ),
      true
    );
    assert.equal(
      exportOperation?.parameters?.some(
        parameter => parameter.in === 'query' && parameter.name === 'confirmationToken'
      ),
      false
    );
  });
});
