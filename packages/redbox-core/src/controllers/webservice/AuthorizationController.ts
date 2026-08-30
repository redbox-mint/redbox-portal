import { Controllers as controllers } from '../../CoreController';
import {
  AuthorizationAdministrationError,
  asScopeKey,
  requireRequestAuthorizationContext,
  type AuthorizationContext,
  type RolloutMode,
} from '../../authorization';
import { getValidatedApiRequest } from '../../api-routes';
import type {
  authorizationAssignmentGrantBodySchema,
  authorizationAssignmentMutationBodySchema,
  authorizationAssignmentParamsSchema,
  authorizationAssignmentQuerySchema,
  authorizationAssignmentUserParamsSchema,
  authorizationAuditQuerySchema,
  authorizationBulkApplyBodySchema,
  authorizationBulkPreviewBodySchema,
  authorizationBulkTemplateUpgradeApplyBodySchema,
  authorizationBulkTemplateUpgradePreviewBodySchema,
  authorizationCreateRoleBodySchema,
  authorizationExplainBodySchema,
  authorizationExportQuerySchema,
  authorizationImportApplyBodySchema,
  authorizationImportPreviewBodySchema,
  authorizationRoleDeleteBodySchema,
  authorizationRoleLifecycleApplyBodySchema,
  authorizationRoleLifecyclePreviewBodySchema,
  authorizationRoleParamsSchema,
  authorizationRoleQuerySchema,
  authorizationRoleScopeApplyBodySchema,
  authorizationRoleScopePreviewBodySchema,
  authorizationRoleTemplateUpgradeApplyBodySchema,
  authorizationRoleTemplateUpgradePreviewBodySchema,
  authorizationScopeAdoptionApplyBodySchema,
  authorizationScopeAdoptionPreviewBodySchema,
  authorizationScopeCatalogQuerySchema,
  authorizationSensitiveExportHeadersSchema,
  authorizationTemplateParamsSchema,
  authorizationTemplatePublishBodySchema,
  authorizationTemplateQuerySchema,
  authorizationTemplateRevisionParamsSchema,
  authorizationUpdateRoleBodySchema,
} from '../../api-routes/schemas/authorization';
import { ensureAuthorizationRequestId } from '../../policies/authorization-response';
import { sendAuthorizationContractProblem } from '../../responses/authorization-problems';
import type { output, ZodType } from 'zod';

type SchemaOutput<Schema extends ZodType> = output<Schema>;
type EmptyRequestPart = Record<string, never>;

type AssignmentGrantBody = SchemaOutput<typeof authorizationAssignmentGrantBodySchema>;
type AssignmentMutationBody = SchemaOutput<typeof authorizationAssignmentMutationBodySchema>;
type AssignmentParams = SchemaOutput<typeof authorizationAssignmentParamsSchema>;
type AssignmentQuery = SchemaOutput<typeof authorizationAssignmentQuerySchema>;
type AssignmentUserParams = SchemaOutput<typeof authorizationAssignmentUserParamsSchema>;
type AuditQuery = SchemaOutput<typeof authorizationAuditQuerySchema>;
type BulkApplyBody = SchemaOutput<typeof authorizationBulkApplyBodySchema>;
type BulkPreviewBody = SchemaOutput<typeof authorizationBulkPreviewBodySchema>;
type BulkTemplateApplyBody = SchemaOutput<typeof authorizationBulkTemplateUpgradeApplyBodySchema>;
type BulkTemplatePreviewBody = SchemaOutput<typeof authorizationBulkTemplateUpgradePreviewBodySchema>;
type CreateRoleBody = SchemaOutput<typeof authorizationCreateRoleBodySchema>;
type ExplainBody = SchemaOutput<typeof authorizationExplainBodySchema>;
type ExportHeaders = SchemaOutput<typeof authorizationSensitiveExportHeadersSchema>;
type ExportQuery = SchemaOutput<typeof authorizationExportQuerySchema>;
type ImportApplyBody = SchemaOutput<typeof authorizationImportApplyBodySchema>;
type ImportPreviewBody = SchemaOutput<typeof authorizationImportPreviewBodySchema>;
type RoleDeleteBody = SchemaOutput<typeof authorizationRoleDeleteBodySchema>;
type RoleLifecycleApplyBody = SchemaOutput<typeof authorizationRoleLifecycleApplyBodySchema>;
type RoleLifecyclePreviewBody = SchemaOutput<typeof authorizationRoleLifecyclePreviewBodySchema>;
type RoleParams = SchemaOutput<typeof authorizationRoleParamsSchema>;
type RoleQuery = SchemaOutput<typeof authorizationRoleQuerySchema>;
type RoleScopeApplyBody = SchemaOutput<typeof authorizationRoleScopeApplyBodySchema>;
type RoleScopePreviewBody = SchemaOutput<typeof authorizationRoleScopePreviewBodySchema>;
type RoleTemplateApplyBody = SchemaOutput<typeof authorizationRoleTemplateUpgradeApplyBodySchema>;
type RoleTemplatePreviewBody = SchemaOutput<typeof authorizationRoleTemplateUpgradePreviewBodySchema>;
type ScopeAdoptionApplyBody = SchemaOutput<typeof authorizationScopeAdoptionApplyBodySchema>;
type ScopeAdoptionPreviewBody = SchemaOutput<typeof authorizationScopeAdoptionPreviewBodySchema>;
type ScopeCatalogQuery = SchemaOutput<typeof authorizationScopeCatalogQuerySchema>;
type TemplateParams = SchemaOutput<typeof authorizationTemplateParamsSchema>;
type TemplatePublishBody = SchemaOutput<typeof authorizationTemplatePublishBodySchema>;
type TemplateQuery = SchemaOutput<typeof authorizationTemplateQuerySchema>;
type TemplateRevisionParams = SchemaOutput<typeof authorizationTemplateRevisionParamsSchema>;
type UpdateRoleBody = SchemaOutput<typeof authorizationUpdateRoleBodySchema>;

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
      'previewScopeAdoption',
      'applyScopeAdoption',
      'previewRoleTemplateUpgrade',
      'applyRoleTemplateUpgrade',
      'previewBulkTemplateUpgrade',
      'applyBulkTemplateUpgrade',
      'previewRoleInactivation',
      'inactivateRole',
      'deleteRole',
      'listAssignments',
      'grantAssignment',
      'revokeAssignment',
      'suppressAssignment',
      'unsuppressAssignment',
      'previewBulkAssignments',
      'applyBulkAssignments',
      'listAudit',
      'explainDecision',
      'getReadiness',
      'exportConfiguration',
      'previewImport',
      'applyImport',
    ];

    private async execute(req: Sails.Req, res: Sails.Res, work: () => Promise<unknown>): Promise<unknown> {
      try {
        return await work();
      } catch (error) {
        sendAuthorizationContractProblem(req, res, error);
        return res;
      }
    }

    private actor(req: Sails.Req): AuthorizationContext {
      return requireRequestAuthorizationContext(req);
    }

    public async getMe(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () =>
        this.sendResp(req, res, {
          data: effectivePrincipalProjection(this.actor(req)),
          headers: this.getNoCacheHeaders(),
        })
      );
    }

    public async listScopes(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { query } = getValidatedApiRequest<EmptyRequestPart, ScopeCatalogQuery>(req);
        const page = await AuthorizationScopeService.listCatalog({ actor: this.actor(req), ...query });
        return this.sendResp(req, res, { data: page, headers: this.getNoCacheHeaders() });
      });
    }

    public async listTemplates(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { query } = getValidatedApiRequest<EmptyRequestPart, TemplateQuery>(req);
        const page = await AuthorizationScopeService.listTemplates({ actor: this.actor(req), ...query });
        return this.sendResp(req, res, { data: page, headers: this.getNoCacheHeaders() });
      });
    }

    public async getTemplateRevision(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params } = getValidatedApiRequest<TemplateRevisionParams>(req);
        const revision = await AuthorizationScopeService.getTemplateRevision(
          this.actor(req),
          params.key,
          params.revision
        );
        return this.sendResp(req, res, { data: revision, headers: this.getNoCacheHeaders() });
      });
    }

    public async publishTemplateRevision(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<TemplateParams, EmptyRequestPart, TemplatePublishBody>(req);
        const command = {
          actor: this.actor(req),
          templateKey: params.key,
          expectedVersion: body.expectedVersion,
          scopeKeys: body.scopeKeys,
          displayName: body.displayName,
          description: body.description,
          notes: body.notes,
          reason: body.reason,
          requestId: ensureAuthorizationRequestId(req),
        };
        if (body.confirmationToken === undefined) {
          const preview = await RoleAdministrationService.previewTemplateRevision(command);
          return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
        }
        const result = await RoleAdministrationService.publishTemplateRevision({
          ...command,
          confirmationToken: body.confirmationToken,
        });
        return this.sendResp(req, res, { status: 201, data: result, headers: this.getNoCacheHeaders() });
      });
    }

    public async listRoles(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const actor = this.actor(req);
        const { query } = getValidatedApiRequest<EmptyRequestPart, RoleQuery>(req);
        const page = await RoleAdministrationService.listRoles({ actor, brandId: activeBrandId(actor), ...query });
        return this.sendResp(req, res, { data: page, headers: this.getNoCacheHeaders() });
      });
    }

    public async createRole(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const actor = this.actor(req);
        const { body } = getValidatedApiRequest<EmptyRequestPart, EmptyRequestPart, CreateRoleBody>(req);
        const desiredScopeKeys = 'scopeKeys' in body ? body.scopeKeys : undefined;
        const template =
          'templateKey' in body ? { templateKey: body.templateKey, templateRevision: body.templateRevision } : {};
        const clone = 'cloneRoleKey' in body ? { cloneRoleKey: body.cloneRoleKey } : {};
        const result = await RoleAdministrationService.createRole({
          actor,
          brandId: activeBrandId(actor),
          key: body.key,
          displayName: body.displayName,
          description: body.description,
          reason: body.reason,
          ...template,
          ...clone,
          desiredScopeKeys,
          requestId: ensureAuthorizationRequestId(req),
        });
        return this.sendResp(req, res, { status: 201, data: result, headers: this.getNoCacheHeaders() });
      });
    }

    public async getRole(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const actor = this.actor(req);
        const { params } = getValidatedApiRequest<RoleParams>(req);
        const role = await RoleAdministrationService.getRole(actor, activeBrandId(actor), params.key);
        return this.sendResp(req, res, { data: role, headers: this.getNoCacheHeaders() });
      });
    }

    public async updateRole(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const actor = this.actor(req);
        const { params, body } = getValidatedApiRequest<RoleParams, EmptyRequestPart, UpdateRoleBody>(req);
        const result = await RoleAdministrationService.updateRole({
          actor,
          brandId: activeBrandId(actor),
          roleKey: params.key,
          ...body,
          requestId: ensureAuthorizationRequestId(req),
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    private roleScopeCommand(req: Sails.Req, params: RoleParams, body: RoleScopePreviewBody) {
      const actor = this.actor(req);
      return {
        actor,
        brandId: activeBrandId(actor),
        roleKey: params.key,
        expectedVersion: body.expectedVersion,
        desiredScopeKeys: body.scopeKeys,
        reason: body.reason,
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async previewRoleScopes(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<RoleParams, EmptyRequestPart, RoleScopePreviewBody>(req);
        const preview = await RoleAdministrationService.previewRoleScopes(this.roleScopeCommand(req, params, body));
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      });
    }

    public async applyRoleScopes(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<RoleParams, EmptyRequestPart, RoleScopeApplyBody>(req);
        const result = await RoleAdministrationService.applyRoleScopes({
          ...this.roleScopeCommand(req, params, body),
          confirmationToken: body.confirmationToken,
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    private scopeAdoptionCommand(req: Sails.Req, params: RoleParams, body: ScopeAdoptionPreviewBody) {
      return {
        actor: this.actor(req),
        roleKey: params.key,
        expectedVersion: body.expectedVersion,
        scopeKey: body.scopeKey,
        reason: body.reason,
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async previewScopeAdoption(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<RoleParams, EmptyRequestPart, ScopeAdoptionPreviewBody>(req);
        const preview = await RoleAdministrationService.previewScopeAdoption(
          this.scopeAdoptionCommand(req, params, body)
        );
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      });
    }

    public async applyScopeAdoption(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<RoleParams, EmptyRequestPart, ScopeAdoptionApplyBody>(req);
        const result = await RoleAdministrationService.applyScopeAdoption({
          ...this.scopeAdoptionCommand(req, params, body),
          confirmationToken: body.confirmationToken,
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    private roleTemplateUpgradeCommand(req: Sails.Req, params: RoleParams, body: RoleTemplatePreviewBody) {
      const actor = this.actor(req);
      return {
        actor,
        brandId: activeBrandId(actor),
        roleKey: params.key,
        expectedVersion: body.expectedVersion,
        targetRevision: body.targetRevision,
        reason: body.reason,
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async previewRoleTemplateUpgrade(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<RoleParams, EmptyRequestPart, RoleTemplatePreviewBody>(req);
        const preview = await RoleAdministrationService.previewRoleTemplateUpgrade(
          this.roleTemplateUpgradeCommand(req, params, body)
        );
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      });
    }

    public async applyRoleTemplateUpgrade(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<RoleParams, EmptyRequestPart, RoleTemplateApplyBody>(req);
        const result = await RoleAdministrationService.applyRoleTemplateUpgrade({
          ...this.roleTemplateUpgradeCommand(req, params, body),
          confirmationToken: body.confirmationToken,
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    private bulkTemplateUpgradeCommand(req: Sails.Req, body: BulkTemplatePreviewBody) {
      return {
        actor: this.actor(req),
        templateKey: body.templateKey,
        targetRevision: body.targetRevision,
        roles: body.roles,
        reason: body.reason,
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async previewBulkTemplateUpgrade(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { body } = getValidatedApiRequest<EmptyRequestPart, EmptyRequestPart, BulkTemplatePreviewBody>(req);
        const preview = await RoleAdministrationService.previewBulkTemplateUpgrade(
          this.bulkTemplateUpgradeCommand(req, body)
        );
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      });
    }

    public async applyBulkTemplateUpgrade(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { body } = getValidatedApiRequest<EmptyRequestPart, EmptyRequestPart, BulkTemplateApplyBody>(req);
        const result = await RoleAdministrationService.applyBulkTemplateUpgrade({
          ...this.bulkTemplateUpgradeCommand(req, body),
          confirmationToken: body.confirmationToken,
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    private roleLifecycleCommand(
      req: Sails.Req,
      params: RoleParams,
      body: RoleLifecyclePreviewBody | RoleLifecycleApplyBody | RoleDeleteBody
    ) {
      const actor = this.actor(req);
      return {
        actor,
        brandId: activeBrandId(actor),
        roleKey: params.key,
        expectedVersion: body.expectedVersion,
        reason: body.reason,
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async previewRoleInactivation(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<RoleParams, EmptyRequestPart, RoleLifecyclePreviewBody>(req);
        const preview = await RoleAdministrationService.previewRoleInactivation(
          this.roleLifecycleCommand(req, params, body)
        );
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      });
    }

    public async inactivateRole(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<RoleParams, EmptyRequestPart, RoleLifecycleApplyBody>(req);
        const result = await RoleAdministrationService.inactivateRole({
          ...this.roleLifecycleCommand(req, params, body),
          confirmationToken: body.confirmationToken,
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    public async deleteRole(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<RoleParams, EmptyRequestPart, RoleDeleteBody>(req);
        const command = this.roleLifecycleCommand(req, params, body);
        const result =
          body.confirmationToken === undefined
            ? await RoleAdministrationService.previewRoleDeletion(command)
            : await RoleAdministrationService.deleteRole({ ...command, confirmationToken: body.confirmationToken });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    public async listAssignments(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const actor = this.actor(req);
        const { query } = getValidatedApiRequest<EmptyRequestPart, AssignmentQuery>(req);
        const { userId: principalId, sourcePresent: sourcePresentQuery, ...filters } = query;
        const sourcePresent = sourcePresentQuery === undefined ? undefined : sourcePresentQuery === 'true';
        const page = await RoleAdministrationService.listAssignments({
          actor,
          brandId: activeBrandId(actor),
          ...filters,
          principalId,
          sourcePresent,
        });
        return this.sendResp(req, res, { data: page, headers: this.getNoCacheHeaders() });
      });
    }

    private assignmentUserCommand(
      req: Sails.Req,
      params: AssignmentUserParams,
      body: Pick<AssignmentGrantBody | AssignmentMutationBody, 'reason'>
    ) {
      const actor = this.actor(req);
      const requestBrandId = activeBrandId(actor);
      return {
        actor,
        brandId: params.roleKey === 'system-admin' ? undefined : requestBrandId,
        principalId: params.userId,
        roleKey: params.roleKey,
        reason: body.reason,
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async grantAssignment(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<AssignmentUserParams, EmptyRequestPart, AssignmentGrantBody>(
          req
        );
        const result = await RoleAdministrationService.grantAssignment({
          ...this.assignmentUserCommand(req, params, body),
          source: 'manual',
          sourceKey: 'manual',
          expectedVersion: body.expectedVersion,
          expiresAt: body.expiresAt,
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    public async revokeAssignment(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<AssignmentUserParams, EmptyRequestPart, AssignmentMutationBody>(
          req
        );
        const result = await RoleAdministrationService.revokeAssignment({
          ...this.assignmentUserCommand(req, params, body),
          source: 'manual',
          sourceKey: 'manual',
          expectedVersion: body.expectedVersion,
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    private assignmentByIdCommand(req: Sails.Req, params: AssignmentParams, body: AssignmentMutationBody) {
      const actor = this.actor(req);
      return {
        actor,
        brandId: activeBrandId(actor),
        assignmentId: params.assignmentId,
        expectedVersion: body.expectedVersion,
        reason: body.reason,
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async suppressAssignment(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<AssignmentParams, EmptyRequestPart, AssignmentMutationBody>(
          req
        );
        const result = await RoleAdministrationService.suppressAssignment(
          this.assignmentByIdCommand(req, params, body)
        );
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    public async unsuppressAssignment(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { params, body } = getValidatedApiRequest<AssignmentParams, EmptyRequestPart, AssignmentMutationBody>(
          req
        );
        const result = await RoleAdministrationService.unsuppressAssignment(
          this.assignmentByIdCommand(req, params, body)
        );
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    private bulkAssignmentCommand(req: Sails.Req, body: BulkPreviewBody) {
      const actor = this.actor(req);
      return {
        actor,
        brandId: activeBrandId(actor),
        rows: body.rows,
        format: body.format,
        reason: body.reason,
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async previewBulkAssignments(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { body } = getValidatedApiRequest<EmptyRequestPart, EmptyRequestPart, BulkPreviewBody>(req);
        const preview = await RoleAdministrationService.previewBulkAssignments(this.bulkAssignmentCommand(req, body));
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      });
    }

    public async applyBulkAssignments(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { body } = getValidatedApiRequest<EmptyRequestPart, EmptyRequestPart, BulkApplyBody>(req);
        const result = await RoleAdministrationService.applyBulkAssignments({
          ...this.bulkAssignmentCommand(req, body),
          confirmationToken: body.confirmationToken,
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    public async listAudit(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { query } = getValidatedApiRequest<EmptyRequestPart, AuditQuery>(req);
        const page = await AuthorizationAuditService.queryEvents({ actor: this.actor(req), ...query });
        return this.sendResp(req, res, { data: page, headers: this.getNoCacheHeaders() });
      });
    }

    public async explainDecision(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { body } = getValidatedApiRequest<EmptyRequestPart, EmptyRequestPart, ExplainBody>(req);
        const result = await AuthorizationService.explainDecision(
          this.actor(req),
          body.subjectId,
          body.brandId,
          asScopeKey(body.scopeKey),
          body.resource
        );
        if (!result.explained) {
          const brandUnavailable =
            result.decision.reasonCode === 'brand-not-authorized' || result.decision.reasonCode === 'brand-not-found';
          throw new AuthorizationAdministrationError(
            brandUnavailable ? 'authorization.not-found' : 'authorization.scope-denied',
            brandUnavailable ? 404 : 403,
            'The requested explanation is unavailable.'
          );
        }
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    public async getReadiness(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const report = await AuthorizationReadinessService.getReport(this.actor(req));
        return this.sendResp(req, res, { data: report, headers: this.getNoCacheHeaders() });
      });
    }

    public async exportConfiguration(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { query, headers } = getValidatedApiRequest<EmptyRequestPart, ExportQuery, undefined, ExportHeaders>(req);
        const result = await AuthorizationConfigurationService.exportConfiguration({
          actor: this.actor(req),
          includeAssignments: query.includeAssignments === undefined ? undefined : query.includeAssignments === 'true',
          includeSystemAssignments:
            query.includeSystemAssignments === undefined ? undefined : query.includeSystemAssignments === 'true',
          confirmationToken: headers?.['x-redbox-authorization-confirmation'],
          requestId: ensureAuthorizationRequestId(req),
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }

    private importCommand(req: Sails.Req, body: ImportPreviewBody) {
      return {
        actor: this.actor(req),
        document: body.document,
        reason: body.reason,
        requestId: ensureAuthorizationRequestId(req),
      };
    }

    public async previewImport(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { body } = getValidatedApiRequest<EmptyRequestPart, EmptyRequestPart, ImportPreviewBody>(req);
        const preview = await RoleAdministrationService.previewConfigurationImport(this.importCommand(req, body));
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      });
    }

    public async applyImport(req: Sails.Req, res: Sails.Res): Promise<unknown> {
      return this.execute(req, res, async () => {
        const { body } = getValidatedApiRequest<EmptyRequestPart, EmptyRequestPart, ImportApplyBody>(req);
        const result = await RoleAdministrationService.applyConfigurationImport({
          ...this.importCommand(req, body),
          confirmationToken: body.confirmationToken,
        });
        return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
      });
    }
  }
}
