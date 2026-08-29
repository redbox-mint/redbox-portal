import { Controllers as controllers } from '../../CoreController';
import {
  AuthorizationAdministrationError,
  AUTHORIZATION_ROLE_STATUSES,
  AUTHORIZATION_SCOPE_RISKS,
  AUTHORIZATION_SCOPE_SOURCE_TYPES,
  AUTHORIZATION_SCOPE_STATUSES,
  PROTECTED_ROLE_KINDS,
  asRoleKey,
  asScopeKey,
  requireRequestAuthorizationContext,
  type AuthorizationContext,
  type RolloutMode,
} from '../../authorization';
import { getValidatedApiRequest } from '../../api-routes';
import { ensureAuthorizationRequestId } from '../../policies/authorization-response';
import { sendAuthorizationContractProblem } from '../../responses/authorization-problems';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function optionalEnum<const T extends readonly string[]>(values: T, value: unknown): T[number] | undefined {
  return typeof value === 'string' && values.some(candidate => candidate === value) ? (value as T[number]) : undefined;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AuthorizationAdministrationError('authorization.invalid-query', 400, `${field} is required.`);
  }
  return value.trim();
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new AuthorizationAdministrationError(
      'authorization.invalid-query',
      400,
      `${field} must be a positive integer.`
    );
  }
  return Number(value);
}

function requiredStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new AuthorizationAdministrationError('authorization.invalid-query', 400, `${field} must be a string array.`);
  }
  return value;
}

function optionalStringArray(value: unknown, field: string): readonly string[] | undefined {
  return value === undefined ? undefined : requiredStringArray(value, field);
}

function requiredRoleKey(value: unknown): string {
  if (typeof value !== 'string' || value.length > 256) {
    throw new AuthorizationAdministrationError('authorization.invalid-query', 400, 'A valid role key is required.');
  }
  return asRoleKey(value);
}

function activeBrandId(context: AuthorizationContext): string {
  const brandId = context.brand?.id;
  if (
    context.brand?.exists !== true ||
    context.brand.authorized !== true ||
    typeof brandId !== 'string' ||
    brandId.trim().length === 0
  ) {
    throw new AuthorizationAdministrationError('authorization.not-found', 404, 'The active brand was not found.');
  }
  return brandId;
}

function selectedRoleVersions(
  value: unknown
): readonly { readonly roleId: string; readonly expectedVersion: number }[] {
  if (!Array.isArray(value)) {
    throw new AuthorizationAdministrationError('authorization.bulk-invalid', 422, 'Selected roles are required.');
  }
  return value.map(row => {
    if (!isRecord(row)) {
      throw new AuthorizationAdministrationError('authorization.bulk-invalid', 422, 'A selected role is invalid.');
    }
    return Object.freeze({
      roleId: requiredString(row.roleId, 'roleId'),
      expectedVersion: requiredPositiveInteger(row.expectedVersion, 'expectedVersion'),
    });
  });
}

function requestBody(req: Sails.Req): Record<string, unknown> {
  const body = getValidatedApiRequest(req).body;
  if (!isRecord(body)) {
    throw new AuthorizationAdministrationError('authorization.invalid-query', 400, 'A JSON request body is required.');
  }
  return body;
}

function rolloutMode(): RolloutMode {
  const mode = sails.config.authorization?.mode;
  return mode === 'shadow' || mode === 'enforce' ? mode : 'legacy';
}

function effectivePrincipalProjection(context: AuthorizationContext): Readonly<Record<string, unknown>> {
  const mayReadAssignments = context.effectiveScopeKeys.includes(asScopeKey('authorization.assignment.read'));
  return Object.freeze({
    ...(context.brand?.id === undefined
      ? {}
      : {
          brand: Object.freeze({ id: context.brand.id, name: context.brand.name ?? context.brand.id }),
        }),
    rolloutMode: rolloutMode(),
    principal: Object.freeze({
      category: context.principal.category,
      authMethod: context.principal.authMethod,
      active: context.principal.active,
      ...(context.principal.userId === undefined ? {} : { userId: context.principal.userId }),
    }),
    roles: Object.freeze(
      context.roles.map(role =>
        Object.freeze({
          id: role.id,
          key: role.key,
          displayName: role.displayName,
          contextType: role.contextType,
          ...(role.brandId === undefined ? {} : { brandId: role.brandId }),
          protectedKind: role.protectedKind,
          implicit: role.implicit,
          ...(mayReadAssignments
            ? {
                assignmentCount: role.assignmentCount,
                assignmentsTruncated: role.assignmentsTruncated,
                assignments: role.assignments,
              }
            : {}),
        })
      )
    ),
    scopeKeys: context.effectiveScopeKeys,
  });
}

export namespace Controllers {
  export class Authorization extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = [
      'getMe',
      'getTemplateRevision',
      'listScopes',
      'listTemplates',
      'publishTemplateRevision',
      'listRoles',
      'createRole',
      'getRole',
      'updateRole',
      'previewRoleScopes',
      'applyRoleScopes',
      'previewRoleTemplateUpgrade',
      'applyRoleTemplateUpgrade',
      'previewBulkTemplateUpgrade',
      'applyBulkTemplateUpgrade',
      'previewRoleInactivation',
      'inactivateRole',
      'deleteRole',
    ];

    private actor(req: Sails.Req): AuthorizationContext {
      return requireRequestAuthorizationContext(req);
    }

    public async getMe(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        return this.sendResp(req, res, {
          data: effectivePrincipalProjection(this.actor(req)),
          headers: this.getNoCacheHeaders(),
        });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async listScopes(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const query = getValidatedApiRequest(req).query;
        const page = await AuthorizationScopeService.listCatalog({
          actor: this.actor(req),
          cursor: optionalString(query.cursor),
          limit: optionalNumber(query.limit),
          namespace: optionalString(query.namespace),
          risk: optionalEnum(AUTHORIZATION_SCOPE_RISKS, query.risk),
          search: optionalString(query.search),
          sourceType: optionalEnum(AUTHORIZATION_SCOPE_SOURCE_TYPES, query.sourceType),
          status: optionalEnum(AUTHORIZATION_SCOPE_STATUSES, query.status),
        });
        return this.sendResp(req, res, { data: page, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async listTemplates(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const query = getValidatedApiRequest(req).query;
        const page = await AuthorizationScopeService.listTemplates({
          actor: this.actor(req),
          cursor: optionalString(query.cursor),
          limit: optionalNumber(query.limit),
          protectedKind: optionalEnum(PROTECTED_ROLE_KINDS, query.protectedKind),
          search: optionalString(query.search),
          status: optionalEnum(AUTHORIZATION_ROLE_STATUSES, query.status),
        });
        return this.sendResp(req, res, { data: page, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async getTemplateRevision(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const params = getValidatedApiRequest(req).params;
        const revision = await AuthorizationScopeService.getTemplateRevision(
          this.actor(req),
          requiredString(params.key, 'key'),
          requiredPositiveInteger(params.revision, 'revision')
        );
        return this.sendResp(req, res, { data: revision, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async publishTemplateRevision(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const validated = getValidatedApiRequest(req);
        const body = requestBody(req);
        const templateKey = requiredString(validated.params.key, 'key');
        const command = {
          actor: this.actor(req),
          templateKey,
          expectedVersion: requiredPositiveInteger(body.expectedVersion, 'expectedVersion'),
          scopeKeys: requiredStringArray(body.scopeKeys, 'scopeKeys'),
          displayName: optionalString(body.displayName),
          description: optionalString(body.description),
          notes: optionalString(body.notes),
          reason: optionalString(body.reason),
          requestId: ensureAuthorizationRequestId(req),
        };
        const confirmationToken = optionalString(body.confirmationToken);
        if (confirmationToken === undefined) {
          const preview = await RoleAdministrationService.previewTemplateRevision(command);
          return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
        }
        const result = await RoleAdministrationService.publishTemplateRevision({ ...command, confirmationToken });
        return this.sendResp(req, res, { status: 201, data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async listRoles(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const actor = this.actor(req);
        const query = getValidatedApiRequest(req).query;
        const page = await RoleAdministrationService.listRoles({
          actor,
          brandId: activeBrandId(actor),
          cursor: optionalString(query.cursor),
          limit: optionalNumber(query.limit),
          protectedKind: optionalEnum(PROTECTED_ROLE_KINDS, query.protectedKind),
          search: optionalString(query.search),
          status: optionalEnum(AUTHORIZATION_ROLE_STATUSES, query.status),
          templateKey: optionalString(query.templateKey),
        });
        return this.sendResp(req, res, { data: page, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async createRole(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const actor = this.actor(req);
        const body = requestBody(req);
        const result = await RoleAdministrationService.createRole({
          actor,
          brandId: activeBrandId(actor),
          key: requiredString(body.key, 'key'),
          displayName: requiredString(body.displayName, 'displayName'),
          description: optionalString(body.description),
          templateKey: optionalString(body.templateKey),
          templateRevision: optionalNumber(body.templateRevision),
          cloneRoleKey: optionalString(body.cloneRoleKey),
          desiredScopeKeys: optionalStringArray(body.scopeKeys, 'scopeKeys'),
          reason: optionalString(body.reason),
          requestId: ensureAuthorizationRequestId(req),
        });
        return this.sendResp(req, res, { status: 201, data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async getRole(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const actor = this.actor(req);
        const role = await RoleAdministrationService.getRole(
          actor,
          activeBrandId(actor),
          requiredRoleKey(getValidatedApiRequest(req).params.key)
        );
        return this.sendResp(req, res, { data: role, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async updateRole(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const actor = this.actor(req);
        const validated = getValidatedApiRequest(req);
        const body = requestBody(req);
        const result = await RoleAdministrationService.updateRole({
          actor,
          brandId: activeBrandId(actor),
          roleKey: requiredRoleKey(validated.params.key),
          expectedVersion: requiredPositiveInteger(body.expectedVersion, 'expectedVersion'),
          displayName: optionalString(body.displayName),
          description: optionalNullableString(body.description),
          reason: optionalString(body.reason),
          requestId: ensureAuthorizationRequestId(req),
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    private roleScopeCommand(req: Sails.Req) {
      const actor = this.actor(req);
      const validated = getValidatedApiRequest(req);
      const body = requestBody(req);
      return {
        actor,
        brandId: activeBrandId(actor),
        roleKey: requiredRoleKey(validated.params.key),
        expectedVersion: requiredPositiveInteger(body.expectedVersion, 'expectedVersion'),
        desiredScopeKeys: requiredStringArray(body.scopeKeys, 'scopeKeys'),
        reason: optionalString(body.reason),
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async previewRoleScopes(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const preview = await RoleAdministrationService.previewRoleScopes(this.roleScopeCommand(req));
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async applyRoleScopes(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const body = requestBody(req);
        const result = await RoleAdministrationService.applyRoleScopes({
          ...this.roleScopeCommand(req),
          confirmationToken: requiredString(body.confirmationToken, 'confirmationToken'),
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    private roleTemplateUpgradeCommand(req: Sails.Req) {
      const actor = this.actor(req);
      const validated = getValidatedApiRequest(req);
      const body = requestBody(req);
      return {
        actor,
        brandId: activeBrandId(actor),
        roleKey: requiredRoleKey(validated.params.key),
        expectedVersion: requiredPositiveInteger(body.expectedVersion, 'expectedVersion'),
        targetRevision: requiredPositiveInteger(body.targetRevision, 'targetRevision'),
        reason: optionalString(body.reason),
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async previewRoleTemplateUpgrade(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const preview = await RoleAdministrationService.previewRoleTemplateUpgrade(
          this.roleTemplateUpgradeCommand(req)
        );
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async applyRoleTemplateUpgrade(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const body = requestBody(req);
        const result = await RoleAdministrationService.applyRoleTemplateUpgrade({
          ...this.roleTemplateUpgradeCommand(req),
          confirmationToken: requiredString(body.confirmationToken, 'confirmationToken'),
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    private bulkTemplateUpgradeCommand(req: Sails.Req) {
      const body = requestBody(req);
      return {
        actor: this.actor(req),
        templateKey: requiredString(body.templateKey, 'templateKey'),
        targetRevision: requiredPositiveInteger(body.targetRevision, 'targetRevision'),
        roles: selectedRoleVersions(body.roles),
        reason: optionalString(body.reason),
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async previewBulkTemplateUpgrade(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const preview = await RoleAdministrationService.previewBulkTemplateUpgrade(
          this.bulkTemplateUpgradeCommand(req)
        );
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async applyBulkTemplateUpgrade(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const body = requestBody(req);
        const result = await RoleAdministrationService.applyBulkTemplateUpgrade({
          ...this.bulkTemplateUpgradeCommand(req),
          confirmationToken: requiredString(body.confirmationToken, 'confirmationToken'),
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    private roleLifecycleCommand(req: Sails.Req) {
      const actor = this.actor(req);
      const validated = getValidatedApiRequest(req);
      const body = requestBody(req);
      return {
        actor,
        brandId: activeBrandId(actor),
        roleKey: requiredRoleKey(validated.params.key),
        expectedVersion: requiredPositiveInteger(body.expectedVersion, 'expectedVersion'),
        reason: optionalString(body.reason),
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async previewRoleInactivation(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const preview = await RoleAdministrationService.previewRoleInactivation(this.roleLifecycleCommand(req));
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async inactivateRole(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const body = requestBody(req);
        const result = await RoleAdministrationService.inactivateRole({
          ...this.roleLifecycleCommand(req),
          confirmationToken: requiredString(body.confirmationToken, 'confirmationToken'),
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    public async deleteRole(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      try {
        const body = requestBody(req);
        const command = this.roleLifecycleCommand(req);
        const confirmationToken = optionalString(body.confirmationToken);
        const result =
          confirmationToken === undefined
            ? await RoleAdministrationService.previewRoleDeletion(command)
            : await RoleAdministrationService.deleteRole({ ...command, confirmationToken });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }
  }
}
