import {
  APIErrorResponse,
  Controllers as controllers,
  CreateUserAPIResponse,
  ListAPIResponse,
  UserModel,
  UserAPITokenAPIResponse,
  APIActionResponse,
  BrandingModel,
  getValidatedApiRequest,
  listUsersRoute,
  findUserRoute,
  getUserRoute,
  searchLinkCandidatesRoute,
  getUserLinksRoute,
  getUserAuditRoute,
  linkAccountsRoute,
  createUserRoute,
  updateUserRoute,
  disableUserRoute,
  enableUserRoute,
  generateAPITokenRoute,
  revokeAPITokenRoute,
  listSystemRolesRoute,
  createSystemRoleRoute,
} from '../../index';
import { UserAttributes } from '../../waterline-models/User';
import { v4 as uuidv4 } from 'uuid';
import { firstValueFrom } from 'rxjs';
import { requireRequestAuthorizationContext } from '../../authorization';
import { AuthorizationAdministrationError } from '../../authorization/errors';
import {
  ensureAuthorizationRequestId,
  parseMandatoryExpectedVersion,
  sendAuthorizationAdministrationError,
  sendAuthorizationResourceError,
  sendAuthorizationTransactionUnavailable,
} from '../../policies/authorization-response';

export namespace Controllers {
  /**
   * Responsible for all things related to user management
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class UserManagement extends controllers.Core.Controller {
    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'listUsers',
      'getUser',
      'createUser',
      'updateUser',
      'generateAPIToken',
      'revokeAPIToken',
      'searchLinkCandidates',
      'getUserLinks',
      'linkAccounts',
      'previewLinkAccounts',
      'getLinkOperation',
      'retryLinkOperation',
      'getUserAudit',
      'listSystemRoles',
      'createSystemRole',
      'disableUser',
      'enableUser',
    ];

    private async enrichUsersWithLinkMetadata(users: UserAttributes[], brandId?: string): Promise<UserAttributes[]> {
      const links =
        typeof UserLink !== 'undefined'
          ? await UserLink.find(
              _.isEmpty(brandId) ? { status: 'active' } : { brandId: brandId, status: 'active' }
            ).limit(1000)
          : [];
      const linkCountByPrimary = _.countBy(
        links as globalThis.Record<string, unknown>[],
        (link: globalThis.Record<string, unknown>) => String(link.primaryUserId ?? '')
      );
      const primaryIds = _.uniq(
        _.map(links as globalThis.Record<string, unknown>[], (link: globalThis.Record<string, unknown>) =>
          String(link.primaryUserId ?? '')
        )
      );
      const primaryUsers =
        _.isEmpty(primaryIds) || typeof User === 'undefined' ? [] : await User.find({ id: primaryIds }).limit(1000);
      const primaryUsernamesById = _.reduce(
        primaryUsers as globalThis.Record<string, unknown>[],
        (acc, user) => {
          acc[String(user.id ?? '')] = String(user.username ?? '');
          return acc;
        },
        {} as globalThis.Record<string, string>
      );

      return _.map(users, (user: UserAttributes) => {
        const enrichedUser = user as UserAttributes & globalThis.Record<string, unknown>;
        enrichedUser.accountLinkState = enrichedUser.accountLinkState || 'active';
        enrichedUser.linkedAccountCount = linkCountByPrimary[String(enrichedUser.id ?? '')] || 0;
        enrichedUser.effectivePrimaryUsername = _.isEmpty(enrichedUser.linkedPrimaryUserId)
          ? enrichedUser.username
          : primaryUsernamesById[String(enrichedUser.linkedPrimaryUserId ?? '')] || enrichedUser.username;
        return enrichedUser;
      });
    }

    private sanitizeUserForResponse(user: UserAttributes | null): UserAttributes | null {
      if (user == null) {
        return null;
      }
      const {
        password: _password,
        token: _token,
        ...rest
      } = user as UserAttributes & {
        password?: unknown;
        token?: unknown;
      };
      void _password;
      void _token;
      return rest;
    }

    private async getFilteredUserRecords(
      queryObject: Record<string, unknown>,
      brandId: string,
      includeDisabled: boolean
    ): Promise<UserAttributes[]> {
      const users = await firstValueFrom(UsersService.getUsersForBrand(brandId));
      const filterEntries = Object.entries(queryObject);
      const matchingUsers =
        filterEntries.length === 0
          ? users
          : users.filter((user: UserAttributes) =>
              filterEntries.every(([field, value]) => String(Reflect.get(user, field) ?? '') === String(value ?? ''))
            );
      let userRecords = await this.enrichUsersWithLinkMetadata(matchingUsers as UserAttributes[], brandId);
      userRecords = await UsersService.enrichUsersWithEffectiveDisabledState(userRecords);

      if (!includeDisabled) {
        userRecords = _.filter(userRecords, (user: UserAttributes) => user.effectiveLoginDisabled !== true);
      }

      return userRecords;
    }

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {}

    private async requireUserInBrand(userId: string, brandId: string): Promise<UserAttributes | null> {
      return await firstValueFrom(UsersService.getUserForBrand(userId, brandId));
    }

    private sendOpaqueUserNotFound(req: Sails.Req, res: Sails.Res) {
      return this.sendResp(req, res, {
        status: 404,
        displayErrors: [{ detail: 'Resource was not found.' }],
        headers: this.getNoCacheHeaders(),
      });
    }
    private mergeBrandRoleIds(
      user: UserModel | UserAttributes,
      brandId: string,
      brandRoleIds: Array<string | number>
    ): Array<string | number> {
      const roles: unknown = user.roles ?? [];
      if (!Array.isArray(roles)) return _.uniq([...brandRoleIds]);
      const foreignRoleIds: Array<string | number> = [];
      for (const role of roles) {
        if (typeof role !== 'object' || role === null) continue;
        const branding: unknown = (role as { branding?: unknown }).branding;
        let roleBrandId = '';
        if (typeof branding === 'string') roleBrandId = branding;
        else if (typeof branding === 'object' && branding !== null && 'id' in branding) {
          roleBrandId = String((branding as { id?: unknown }).id ?? '');
        }
        if (roleBrandId === brandId) continue;
        const id: unknown = (role as { id?: unknown }).id;
        if (typeof id === 'string' || typeof id === 'number') foreignRoleIds.push(id);
      }
      return _.uniq([...foreignRoleIds, ...brandRoleIds]);
    }

    /**
     * AUTH-P5-002: observed user version for the in-request role-set CAS.
     * Mirrors the service read rule (`version ?? loginDisabledVersion`,
     * legacy rows read as 1); undefined only when no user row is present,
     * in which case the caller must fail closed instead of writing blind.
     */
    private observedUserVersionForRoleCas(user: unknown): number | undefined {
      let current: unknown = user;
      for (let depth = 0; depth < 4 && Array.isArray(current) && current.length > 0; depth += 1) {
        // Sails' `exec`/`simplecb` Observable contract is `[err, rows]`.
        // Accept the legacy envelope as well as an already-unwrapped row.
        if (current.length === 2 && (current[0] === null || current[0] === undefined) && Array.isArray(current[1])) {
          current = current[1];
        } else {
          current = current[0];
        }
      }
      if (current === null || current === undefined || typeof current !== 'object') return undefined;
      const record = current as Record<string, unknown>;
      const version = record.version ?? record.loginDisabledVersion;
      if (typeof version === 'number' && Number.isSafeInteger(version) && version >= 1) return version;
      if (version === undefined || version === null) {
        return record.id !== undefined ? 1 : undefined;
      }
      return undefined;
    }

    /**
     * AUTH-SAGA-001 fail-closed saga/outbox begin for user create/update
     * composites. The saga row is persisted BEFORE the profile mutation and
     * claimed (pending -> running, attempt-fenced) in the same step;
     * persistence failures (store unavailable, lease fencing, unrecoverable
     * CAS races) THROW so the caller aborts with 503/409 and nothing is
     * mutated. Callers must never degrade to in-process compensation: an
     * unrecorded composite is unrecoverable after a restart, while a
     * recorded-but-incomplete one is replayed via
     * `replayIncompleteUserMutationOperations` from the stored plan.
     */
    private async beginUserMutationSaga(
      req: Sails.Req,
      kind: 'create' | 'update',
      username: string,
      roleIds: readonly string[] | undefined
    ): Promise<{ readonly operationId: string; readonly attemptCount: number; readonly roleIds: readonly string[] }> {
      const brandId = String(BrandingService.getBrandFromReq(req)?.id ?? '').trim();
      const name = String(username ?? '').trim();
      if (brandId.length === 0 || name.length === 0) {
        throw new AuthorizationAdministrationError(
          'authorization.invalid-query',
          400,
          'A saga operation requires brand and username.'
        );
      }
      const operationId = `user-${kind}:${ensureAuthorizationRequestId(req)}`;
      const begun = await UsersService.beginUserMutationOperation({
        operationId,
        kind,
        brandId,
        username: name,
        roleIds,
        requestId: ensureAuthorizationRequestId(req),
      });
      const running = await UsersService.markUserMutationRunning(begun.operationId);
      return {
        operationId: running.operationId,
        attemptCount: running.attemptCount,
        roleIds: [...running.roleIds],
      };
    }

    /**
     * AUTH-SAGA-REMEDIATION fenced terminal writer. Every completion/failure
     * update is awaited by the caller and fenced by operationId + the claimed
     * attempt count (pinned into the update predicate with running status, so
     * a stale attempt surfaces 409 instead of overwriting the winner's
     * terminal state). The result reports whether the terminal state
     * persisted: success paths MUST fail closed with 503 when
     * `persisted === false` instead of claiming success for an unconfirmed
     * composite; failure paths log and continue so the primary error response
     * is never masked (the row stays resumable for
     * `replayIncompleteUserMutationOperations`). Unfenced claims (missing
     * attempt fence) fail closed with 409 — never a blind operationId-only
     * overwrite.
     */
    private async finishUserMutationSaga(
      claim: { readonly operationId?: string; readonly attemptCount?: number } | string | undefined,
      status: 'completed' | 'failed',
      detail?: string,
      patch?: { readonly userId?: string; readonly createdIsNew?: boolean }
    ): Promise<{ readonly persisted: boolean }> {
      const operationId = typeof claim === 'string' ? claim : claim?.operationId;
      const attemptCount = typeof claim === 'string' ? undefined : claim?.attemptCount;
      if (operationId === undefined || operationId.length === 0) return { persisted: true };
      if (attemptCount === undefined || !Number.isSafeInteger(attemptCount)) {
        throw new AuthorizationAdministrationError(
          'authorization.version-conflict',
          409,
          'The saga terminal update requires the claimed attempt fence.'
        );
      }
      try {
        if (status === 'completed') await UsersService.completeUserMutationOperation(operationId, patch, attemptCount);
        else
          await UsersService.failUserMutationOperation(
            operationId,
            detail ?? 'The composite did not confirm.',
            attemptCount
          );
        return { persisted: true };
      } catch (error) {
        sails.log.error('User mutation saga terminal update did not confirm.', {
          operationId,
          attemptCount,
          status,
          error: error instanceof Error ? error.message : error,
        });
        return { persisted: false };
      }
    }

    /**
     * AUTH-SAGA-REMEDIATION success-path terminal gate. Awaits the fenced
     * terminal write and, when it does not persist, reports 503 (mutation
     * unconfirmed, retry idempotently) instead of a false success. Returns
     * true when the caller may proceed to the success response.
     */
    private async finishSagaTerminalOrReportUnconfirmed(
      req: Sails.Req,
      res: Sails.Res,
      claim: { readonly operationId: string; readonly attemptCount: number },
      status: 'completed' | 'failed',
      detail?: string,
      patch?: { readonly userId?: string; readonly createdIsNew?: boolean }
    ): Promise<boolean> {
      const finished = await this.finishUserMutationSaga(claim, status, detail, patch);
      if (finished.persisted) return true;
      this.sendResp(req, res, {
        status: 503,
        displayErrors: [{ detail: 'The user mutation was not confirmed; retry the operation idempotently.' }],
        headers: this.getNoCacheHeaders(),
      });
      return false;
    }

    public async listUsers(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { query } = validated;
      const searchField = query.searchBy as string | undefined;
      const searchQuery = query.query as string | undefined;
      const queryObject: Record<string, unknown> = {};
      if (searchField != null && searchQuery != null) {
        queryObject[searchField] = searchQuery;
      }
      const parsedPage = query.page != null ? parseInt(String(query.page), 10) : 1;
      const parsedPageSize = query.pageSize != null ? parseInt(String(query.pageSize), 10) : 10;
      const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
      const pageSize = Number.isInteger(parsedPageSize) && parsedPageSize > 0 ? Math.min(parsedPageSize, 100) : 10;
      const skip = (page - 1) * pageSize;
      const response: ListAPIResponse<UserAttributes> = new ListAPIResponse<UserAttributes>();

      try {
        const includeDisabled = query.includeDisabled === 'true';
        const brandId = String(_.get(BrandingService.getBrandFromReq(req), 'id') ?? '');
        const userRecords = await this.getFilteredUserRecords(queryObject, brandId, includeDisabled);
        const count = userRecords.length;
        response.summary.numFound = count;
        response.summary.page = page;
        if (count === 0) {
          response.records = [];
          return this.sendResp(req, res, { data: response, headers: this.getNoCacheHeaders() });
        }

        const pagedRecords = userRecords.slice(skip, skip + pageSize);
        _.each(pagedRecords, (user: UserAttributes) => {
          delete user['token'];
          delete user['password'];
        });
        response.records = pagedRecords;
        return this.sendResp(req, res, { data: response, headers: this.getNoCacheHeaders() });
      } catch (err) {
        sails.log.error(err);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (err as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async getUser(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { query } = validated;
      const searchField = String(query.searchBy ?? '').trim();
      const searchQuery = String(query.query ?? '').trim();
      if (!['id', 'username', 'email', 'name'].includes(searchField) || !searchQuery) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Invalid user search criteria.' }],
          headers: this.getNoCacheHeaders(),
        });
      }
      try {
        const brandId = String(BrandingService.getBrandFromReq(req).id ?? '');
        const user = await firstValueFrom(UsersService.findUserForBrand(searchField, searchQuery, brandId));
        if (!user) {
          return this.sendOpaqueUserNotFound(req, res);
        }
        return this.sendResp(req, res, {
          data: this.sanitizeUserForResponse(user as UserAttributes),
          headers: this.getNoCacheHeaders(),
        });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async createUser(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const userReq: UserModel = validated.body as UserModel;

      // Phase 5 response contract: typed `sendResp` with the declared 201
      // status (not the deprecated `apiRespond` envelope).
      const respondWithUser = (response: UserModel) => {
        const userResponse = new CreateUserAPIResponse();
        userResponse.id = response.id;
        userResponse.username = response.username;
        userResponse.name = response.name;
        userResponse.email = response.email;
        userResponse.type = response.type;
        userResponse.lastLogin = response.lastLogin;
        return this.sendResp(req, res, {
          data: userResponse,
          status: 201,
          headers: this.getNoCacheHeaders(),
        });
      };

      // AUTH-COMPOSITE-001: validate requested roles BEFORE mutating. Unknown
      // role names fail closed with 422 here so create never returns success
      // with silently dropped roles, and update never strips roles the caller
      // did not intend to remove. Validation runs BEFORE addLocalUser so no
      // partial row is ever created for an invalid role set.
      const resolveRequestedRoleIds = (): string[] | null => {
        if (!userReq.roles) return [];
        const requestedRoles: unknown = userReq.roles;
        if (!Array.isArray(requestedRoles)) return [];
        const roles: string[] = [];
        for (const role of requestedRoles) {
          if (_.isString(role)) {
            if (!_.isEmpty(role)) roles.push(role);
            continue;
          }
          if (typeof role === 'object' && role !== null && 'name' in role) {
            const name: unknown = (role as { name?: unknown }).name;
            if (_.isString(name) && !_.isEmpty(name)) roles.push(name);
          }
        }
        if (roles.length === 0) return [];
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        const roleIds: unknown = brand?.roles ? RolesService.getRoleIds(brand.roles, roles) : [];
        if (!Array.isArray(roleIds) || !roleIds.every((id): id is string => typeof id === 'string')) return null;
        if (roleIds.length !== roles.length) {
          return null;
        }
        return roleIds;
      };

      // Pre-write validation: reject unknown roles before ANY mutation.
      if (userReq.roles) {
        const precheck = resolveRequestedRoleIds();
        if (precheck === null) {
          if (
            sendAuthorizationAdministrationError(
              req,
              res,
              new AuthorizationAdministrationError(
                'authorization.invalid-role',
                422,
                'One or more requested roles are unknown in this brand.'
              )
            )
          )
            return;
          return this.sendResp(req, res, {
            status: 422,
            displayErrors: [{ detail: 'One or more requested roles are unknown in this brand.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
      }

      // AUTH-SAGA-001 fail-closed outbox: the stored plan (validated role
      // IDs, never names) is computed here and persisted BEFORE
      // `addLocalUser` mutates below. Production replay consumes EXACTLY this
      // stored ID plan via `replayStoredUserMutationPlan`; the live role
      // phase below reuses the claimed stored IDs so replay and live apply
      // cannot diverge when brand role mappings change mid-flight. A
      // persistence failure aborts with 503 — no partial row is ever created
      // for an unrecorded composite, while a recorded-but-incomplete one is
      // replayed from the stored plan after a restart.
      // Pre-write validation above already rejected unknown names, so the
      // resolved IDs here are authoritative.
      const createSagaRoleIds: readonly string[] | undefined = ((): readonly string[] | undefined => {
        if (userReq.roles === undefined || userReq.roles === null) return undefined;
        const prechecked = resolveRequestedRoleIds();
        if (prechecked === null) return [];
        return [...prechecked];
      })();
      let createSagaClaim: {
        readonly operationId: string;
        readonly attemptCount: number;
        readonly roleIds: readonly string[];
      };
      try {
        createSagaClaim = await this.beginUserMutationSaga(
          req,
          'create',
          String(userReq.username ?? ''),
          createSagaRoleIds
        );
      } catch (error) {
        if (sendAuthorizationAdministrationError(req, res, error as Error)) return;
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }

      const applyRolesIfRequested = async (response: UserModel, createdIsNew: boolean): Promise<void> => {
        const createdId = typeof response.id === 'string' ? response.id : String(response.id ?? '');
        const createdPatch = {
          userId: createdId.length > 0 ? createdId : undefined,
          createdIsNew,
        };
        // AUTH-SAGA-REMEDIATION authority: the live role phase consumes
        // EXACTLY the stored authoritative ID plan claimed at saga begin
        // (`createSagaClaim.roleIds`), never a re-derived name mapping, so a
        // mid-flight brand-role change cannot diverge live apply from replay.
        const storedRoleIds: readonly string[] = [...createSagaClaim.roleIds];
        if (userReq.roles) {
          if (storedRoleIds.length === 0) {
            const confirmed = await this.finishSagaTerminalOrReportUnconfirmed(
              req,
              res,
              createSagaClaim,
              'completed',
              undefined,
              createdPatch
            );
            if (!confirmed) return;
            respondWithUser(response);
            return;
          }
          const brand: BrandingModel = BrandingService.getBrandFromReq(req);
          const mergedRoleIds = this.mergeBrandRoleIds(response, brand.id, [...storedRoleIds]);
          try {
            const roleUser = await firstValueFrom(
              UsersService.updateUserRoles(response.id, mergedRoleIds, {
                brandId: String(brand.id),
                actorContext: req.authorization,
                requestId: ensureAuthorizationRequestId(req),
                expectedVersion: this.observedUserVersionForRoleCas(response) ?? 1,
              })
            );
            sails.log.verbose(roleUser);
            const createdConfirmed = await this.finishSagaTerminalOrReportUnconfirmed(
              req,
              res,
              createSagaClaim,
              'completed',
              undefined,
              createdPatch
            );
            if (!createdConfirmed) return;
            respondWithUser(response);
            return;
          } catch (error) {
            sails.log.error('Failed to update user roles:');
            sails.log.error(error);
            const failedId = typeof response.id === 'string' ? response.id : String(response.id ?? '');
            let compensationFailure: string | undefined;
            if (createdIsNew) {
              const compensation = await UsersService.destroyNewlyCreatedUserRecord(
                failedId,
                ensureAuthorizationRequestId(req)
              );
              compensationFailure = compensation === 'compensated' ? undefined : 'Compensating rollback failed.';
            }
            const errorMessage = error instanceof Error ? error.message : 'Failed to assign user roles.';
            const detail = compensationFailure === undefined ? errorMessage : `${errorMessage} ${compensationFailure}`;
            await this.finishUserMutationSaga(createSagaClaim, 'failed', detail, createdPatch);
            if (sendAuthorizationAdministrationError(req, res, error as Error)) {
              if (compensationFailure !== undefined) {
                sails.log.error(`Role assignment compensation also failed: ${compensationFailure}`);
              }
              return;
            }
            if (sendAuthorizationResourceError(req, res, error as Error)) return;
            this.sendResp(req, res, {
              status: 500,
              displayErrors: [
                {
                  detail: createdIsNew
                    ? errorMessage
                    : `Partial state: profile is stored but roles were not applied. ${errorMessage}`,
                  ...(compensationFailure === undefined ? {} : { title: compensationFailure }),
                },
              ],
              headers: this.getNoCacheHeaders(),
            });
            return;
          }
        }
        const createdPlainConfirmed = await this.finishSagaTerminalOrReportUnconfirmed(
          req,
          res,
          createSagaClaim,
          'completed',
          undefined,
          createdPatch
        );
        if (!createdPlainConfirmed) return;
        respondWithUser(response);
        return;
      };

      UsersService.addLocalUser(
        userReq.username || '',
        userReq.name || '',
        userReq.email || '',
        userReq.password || '',
        {
          actorContext: req.authorization,
          brandId: String(BrandingService.getBrandFromReq(req)?.id ?? ''),
          requestId: ensureAuthorizationRequestId(req),
        }
      ).subscribe(
        async (userResponse: UserModel) => {
          const response: UserModel = userResponse;
          void applyRolesIfRequested(response, true).catch(err => {
            sails.log.error(err);
          });
          return;
        },
        async (error: unknown) => {
          if (error instanceof Error && error.message.includes('Username already exists')) {
            UsersService.getUserWithUsername(userReq.username || '').subscribe(
              async (existingUser: UserModel | null) => {
                try {
                  if (existingUser) {
                    const brand: BrandingModel = BrandingService.getBrandFromReq(req);
                    if (brand?.id) {
                      const existingRoles: unknown = existingUser.roles ?? [];
                      const roleList: unknown[] = Array.isArray(existingRoles) ? existingRoles : [];
                      const hasBrandRole = _.some(roleList, (role: unknown) => {
                        if (typeof role !== 'object' || role === null || !('branding' in role)) return false;
                        const branding: unknown = role.branding;
                        if (typeof branding === 'string') return branding === brand.id;
                        if (typeof branding === 'object' && branding !== null && 'id' in branding) {
                          return String(branding.id ?? '') === brand.id;
                        }
                        return false;
                      });
                      if (!hasBrandRole) {
                        const isLinked =
                          typeof UserLink !== 'undefined'
                            ? await UserLink.findOne({
                                brandId: brand.id,
                                status: 'active',
                                or: [{ primaryUserId: existingUser.id }, { secondaryUserId: existingUser.id }],
                              })
                            : null;
                        if (!isLinked) {
                          await this.finishUserMutationSaga(
                            createSagaClaim,
                            'failed',
                            'The duplicate account is outside this brand.',
                            {
                              userId:
                                typeof existingUser.id === 'string' ? existingUser.id : String(existingUser.id ?? ''),
                              createdIsNew: false,
                            }
                          );
                          return this.sendResp(req, res, {
                            status: 404,
                            displayErrors: [{ detail: 'Resource was not found.' }],
                            headers: this.getNoCacheHeaders(),
                          });
                        }
                      }
                    }
                    // Pre-existing duplicate accounts are never destroyed by
                    // compensation (createdIsNew=false): roles merge onto the
                    // existing row and failures report partial state.
                    void applyRolesIfRequested(existingUser, false).catch(err => {
                      sails.log.error(err);
                    });
                    return;
                  }
                } catch (err) {
                  sails.log.error('Failed to check brand membership for existing user:', err);
                  await this.finishUserMutationSaga(
                    createSagaClaim,
                    'failed',
                    'The duplicate account brand check did not confirm.'
                  );
                  return this.sendResp(req, res, {
                    status: 500,
                    displayErrors: [{ detail: 'An error has occurred' }],
                    headers: this.getNoCacheHeaders(),
                  });
                }
                sails.log.error(error);
                await this.finishUserMutationSaga(createSagaClaim, 'failed', 'The user create did not confirm.');
                return this.sendResp(req, res, {
                  status: 500,
                  displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
                  headers: this.getNoCacheHeaders(),
                });
              },
              async (lookupError: unknown) => {
                sails.log.error(lookupError);
                await this.finishUserMutationSaga(
                  createSagaClaim,
                  'failed',
                  'The duplicate account lookup did not confirm.'
                );
                return this.sendResp(req, res, {
                  status: 500,
                  displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
                  headers: this.getNoCacheHeaders(),
                });
              }
            );
            return;
          }

          sails.log.error(error);
          await this.finishUserMutationSaga(
            createSagaClaim,
            'failed',
            error instanceof Error ? error.message : 'The user create did not confirm.'
          );
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
            headers: this.getNoCacheHeaders(),
          });
        }
      );

      return;
    }

    public async updateUser(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const userReq: UserModel = validated.body as UserModel;
      const brand: BrandingModel = BrandingService.getBrandFromReq(req);
      let targetUser: UserAttributes | null = null;
      if (brand?.id) {
        targetUser = await this.requireUserInBrand(userReq.id || '', brand.id);
        if (!targetUser) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: 'Resource was not found.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
      }

      // AUTH-COMPOSITE-001: validate requested roles BEFORE mutating the
      // profile. Unknown names fail closed with 422; nothing is mutated.
      let mergedRoleIds: Array<string | number> | undefined;
      if (userReq.roles) {
        const requestedRoles: unknown = userReq.roles;
        const roleList: unknown[] = Array.isArray(requestedRoles) ? requestedRoles : [];
        const roles: string[] = [];
        for (const role of roleList) {
          if (_.isString(role)) {
            if (!_.isEmpty(role)) roles.push(role);
            continue;
          }
          if (typeof role === 'object' && role !== null && 'name' in role) {
            const name: unknown = role.name;
            if (_.isString(name) && !_.isEmpty(name)) roles.push(name);
          }
        }
        const roleIds = RolesService.getRoleIds(brand.roles, roles);
        if (roles.length > 0 && roleIds.length !== roles.length) {
          if (
            sendAuthorizationAdministrationError(
              req,
              res,
              new AuthorizationAdministrationError(
                'authorization.invalid-role',
                422,
                'One or more requested roles are unknown in this brand.'
              )
            )
          )
            return;
          return this.sendResp(req, res, {
            status: 422,
            displayErrors: [{ detail: 'One or more requested roles are unknown in this brand.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        mergedRoleIds = this.mergeBrandRoleIds(targetUser ?? userReq, brand.id, roleIds);
      }
      // AUTH-P5-007: snapshot ALL relevant prior profile fields VERBATIM
      // (name, email, password hash), preserving empty-string and null so a
      // later role-phase failure restores the exact prior state through the
      // guarded exact-restore compensator — never a lossy String() coercion
      // and never a direct unguarded write.
      const verbatimField = (value: unknown): string | null => (typeof value === 'string' ? value : null);
      // AUTH-P5-002: profile CAS is mandatory on the update route.
      const updateExpectedVersion = parseMandatoryExpectedVersion(req);
      if (updateExpectedVersion === undefined) {
        return this.sendResp(req, res, {
          status: 422,
          displayErrors: [{ detail: 'An expectedVersion is required to modify user profile state.' }],
          headers: this.getNoCacheHeaders(),
        });
      }
      const priorProfile = {
        name: verbatimField(targetUser?.name),
        email: verbatimField(targetUser?.email),
        passwordHash: verbatimField(targetUser?.password),
      };

      // AUTH-SAGA-REMEDIATION fail-closed outbox: persist the update composite
      // saga row BEFORE the profile mutation (stored plan = authoritative
      // merged role IDs, never names). Production replay consumes EXACTLY
      // this stored ID plan; the live role phase below reuses the claimed
      // stored IDs so replay and live apply cannot diverge. A persistence
      // failure aborts with 503/409 here — the profile is never mutated for
      // an unrecorded composite, while a recorded-but-incomplete one is
      // replayed from the stored plan.
      const updateSagaRoleIds: readonly string[] | undefined = ((): readonly string[] | undefined => {
        if (!userReq.roles || !Array.isArray(userReq.roles)) return undefined;
        if (mergedRoleIds === undefined) return undefined;
        return [...mergedRoleIds].map(id => String(id));
      })();
      let updateSagaClaim: {
        readonly operationId: string;
        readonly attemptCount: number;
        readonly roleIds: readonly string[];
      };
      try {
        updateSagaClaim = await this.beginUserMutationSaga(
          req,
          'update',
          String(targetUser?.username ?? userReq.username ?? ''),
          updateSagaRoleIds
        );
      } catch (error) {
        if (sendAuthorizationAdministrationError(req, res, error as Error)) return;
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
      // AUTH-P5-002 role-only preservation: omitted profile fields keep their
      // prior values so a roles-only update never clears name/email/password.
      const preservedName = userReq.name === undefined ? (targetUser?.name ?? '') : userReq.name;
      const preservedEmail = userReq.email === undefined ? (targetUser?.email ?? '') : userReq.email;
      const preservedPassword = userReq.password === undefined ? '' : userReq.password;
      UsersService.updateUserDetailsForBrand(
        userReq.id || '',
        preservedName || '',
        preservedEmail || '',
        preservedPassword || '',
        String(brand.id ?? ''),
        {
          actorContext: req.authorization,
          expectedVersion: updateExpectedVersion,
          requestId: ensureAuthorizationRequestId(req),
        }
      ).subscribe(
        async (userResponse: unknown[]) => {
          const response: unknown[] = userResponse;
          let user: unknown = null;
          sails.log.verbose(user);

          if (!_.isEmpty(response) && _.isArray(response)) {
            for (const userItem of response) {
              if (!_.isEmpty(response) && _.isArray(userItem)) {
                user = userItem[0];
                break;
              }
            }
          }

          if (userReq.roles) {
            // AUTH-SAGA-REMEDIATION authority: consume exactly the stored ID
            // plan claimed at saga begin, never a re-derived mapping.
            const roleIds = [...updateSagaClaim.roleIds];
            // AUTH-P5-002: the roles phase pins the post-profile observed
            // version (the profile write advanced it). An unresolvable
            // version fails closed with partial state, never a blind write.
            const postProfileVersion = this.observedUserVersionForRoleCas(user);
            if (postProfileVersion === undefined) {
              const errorResponse = new APIErrorResponse('Updated user state is unreadable.');
              await this.finishUserMutationSaga(
                updateSagaClaim,
                'failed',
                'Updated user state is unreadable after the profile phase.'
              );
              return this.sendResp(req, res, {
                status: 500,
                displayErrors: [
                  {
                    title: errorResponse.message,
                    detail:
                      'Partial state: profile is stored but roles were not applied. Updated user state is unreadable.',
                  },
                ],
                headers: this.getNoCacheHeaders(),
              });
            }
            const roleTargetId: unknown =
              typeof user === 'object' && user !== null && 'id' in user ? user.id : undefined;
            if (typeof roleTargetId !== 'string' || roleTargetId.length === 0) {
              const errorResponse = new APIErrorResponse('Updated user state is unreadable.');
              await this.finishUserMutationSaga(
                updateSagaClaim,
                'failed',
                'Updated user state is unreadable after the profile phase.'
              );
              return this.sendResp(req, res, {
                status: 500,
                displayErrors: [{ detail: 'Partial state: profile is stored but roles were not applied.' }],
                headers: this.getNoCacheHeaders(),
              });
            }
            UsersService.updateUserRoles(roleTargetId, roleIds, {
              brandId: String(brand.id),
              actorContext: req.authorization,
              requestId: ensureAuthorizationRequestId(req),
              expectedVersion: postProfileVersion,
            }).subscribe(
              async (roleUpdated: unknown) => {
                //TODO: Add roles to the response
                const updated: Record<string, unknown> =
                  typeof roleUpdated === 'object' && roleUpdated !== null ? { ...roleUpdated } : {};
                const userResponse = new CreateUserAPIResponse();
                userResponse.id = typeof updated.id === 'string' ? updated.id : '';
                userResponse.username = typeof updated.username === 'string' ? updated.username : '';
                userResponse.name = typeof updated.name === 'string' ? updated.name : '';
                userResponse.email = typeof updated.email === 'string' ? updated.email : '';
                userResponse.type = typeof updated.type === 'string' ? updated.type : '';
                userResponse.lastLogin = updated.lastLogin instanceof Date ? updated.lastLogin : null;
                const updatedConfirmed = await this.finishSagaTerminalOrReportUnconfirmed(
                  req,
                  res,
                  updateSagaClaim,
                  'completed',
                  undefined,
                  {
                    userId: roleTargetId,
                    createdIsNew: false,
                  }
                );
                if (!updatedConfirmed) return;
                return this.sendResp(req, res, {
                  data: userResponse,
                  status: 201,
                  headers: this.getNoCacheHeaders(),
                });
              },
              async (error: unknown) => {
                // AUTH-COMPOSITE-001 + AUTH-P5-007: the profile was already
                // mutated before the role phase failed. Never report success:
                // restore the previously observed profile VERBATIM (including
                // empty/null email and password hash) through the guarded
                // exact-restore compensator (version-pinned CAS + audit, no
                // direct writes), then report the partial state. When the
                // restore itself fails, BOTH failures are reported in the
                // response body (Problem Details detail included).
                sails.log.error('Failed to update user roles:');
                sails.log.error(error);
                const restoreAndReport = async (): Promise<void> => {
                  let restoreFailure: string | undefined;
                  try {
                    const { firstValueFrom: rxFirstValueFrom } = await import('rxjs');
                    await rxFirstValueFrom(
                      UsersService.compensateUserDetailsForBrand(
                        userReq.id || '',
                        {
                          name: priorProfile.name,
                          email: priorProfile.email,
                          passwordHash: priorProfile.passwordHash,
                        },
                        String(brand.id ?? ''),
                        { actorContext: req.authorization, requestId: ensureAuthorizationRequestId(req) }
                      )
                    );
                  } catch (restoreError) {
                    sails.log.error('Failed to restore user profile after role failure:');
                    sails.log.error(restoreError);
                    restoreFailure = (restoreError as Error)?.message ?? 'Profile restore failed.';
                  }
                  const compensationSuffix =
                    restoreFailure === undefined ? undefined : `Profile restore also failed: ${restoreFailure}.`;
                  if (sendAuthorizationAdministrationError(req, res, error as Error, compensationSuffix)) {
                    return;
                  }
                  if (sendAuthorizationResourceError(req, res, error)) return;
                  const errorResponse = new APIErrorResponse((error as Error).message);
                  this.sendResp(req, res, {
                    status: 500,
                    displayErrors: [
                      {
                        title: errorResponse.message,
                        detail:
                          restoreFailure === undefined
                            ? `Partial state: profile was restored but roles were not applied. ${errorResponse.details}`
                            : `Partial state: profile mutation was NOT restored (${restoreFailure}) and roles were not applied. ${errorResponse.details}`,
                      },
                    ],
                    headers: this.getNoCacheHeaders(),
                  });
                };
                await restoreAndReport();
                await this.finishUserMutationSaga(
                  updateSagaClaim,
                  'failed',
                  (error as Error)?.message ?? 'Role phase failed.',
                  {
                    userId: typeof roleTargetId === 'string' ? roleTargetId : String(userReq.id ?? ''),
                    createdIsNew: false,
                  }
                );
              }
            );
            return;
          } else {
            const u = user as globalThis.Record<string, unknown>;
            const userResponse: CreateUserAPIResponse = new CreateUserAPIResponse();
            userResponse.id = u.id as string;
            userResponse.username = u.username as string;
            userResponse.name = u.name as string;
            userResponse.email = u.email as string;
            userResponse.type = u.type as string;
            userResponse.lastLogin = u.lastLogin as Date | null;

            const updatedPlainConfirmed = await this.finishSagaTerminalOrReportUnconfirmed(
              req,
              res,
              updateSagaClaim,
              'completed',
              undefined,
              {
                userId: typeof u.id === 'string' ? u.id : String(userReq.id ?? ''),
                createdIsNew: false,
              }
            );
            if (!updatedPlainConfirmed) return;
            return this.sendResp(req, res, {
              data: userResponse,
              status: 201,
              headers: this.getNoCacheHeaders(),
            });
          }
        },
        async (error: unknown) => {
          sails.log.error(error);
          await this.finishUserMutationSaga(
            updateSagaClaim,
            'failed',
            (error as Error)?.message ?? 'Profile phase failed.'
          );
          if ((error as Error).message.indexOf('No such user with id:') != -1) {
            const errorResponse = new APIErrorResponse((error as Error).message);
            return this.sendResp(req, res, {
              status: 404,
              displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
              headers: this.getNoCacheHeaders(),
            });
          } else {
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
              headers: this.getNoCacheHeaders(),
            });
          }
        }
      );

      return;
    }

    public async generateAPIToken(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const userid = validated.query.id as string;
      const brandId = _.get(BrandingService.getBrandFromReq(req), 'id');

      if (userid && brandId) {
        const targetUser = await this.requireUserInBrand(userid, brandId);
        if (!targetUser) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: 'Resource was not found.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
      }

      if (userid) {
        // AUTH-P5-002: token rotation is a versioned mutation.
        const tokenExpectedVersion = parseMandatoryExpectedVersion(req);
        if (tokenExpectedVersion === undefined) {
          return this.sendResp(req, res, {
            status: 422,
            displayErrors: [{ detail: 'An expectedVersion is required to rotate the user API token.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const uuid: string = uuidv4();
        UsersService.setUserKeyForBrand(userid, uuid, String(brandId), {
          actorContext: req.authorization,
          expectedVersion: tokenExpectedVersion,
          requestId: ensureAuthorizationRequestId(req),
        }).subscribe(
          async (userResponse: UserModel) => {
            const user: UserModel = userResponse;
            const response = new UserAPITokenAPIResponse();
            response.id = userid;
            response.username = typeof user.username === 'string' ? user.username : '';
            response.token = uuid;
            return this.sendResp(req, res, { data: response, headers: this.getNoCacheHeaders() });
          },
          async (error: unknown) => {
            sails.log.error('Failed to set UUID:');
            sails.log.error(error);
            // AUTH-CAS-HTTP-001 stable Problem Details mapping: version
            // conflicts become 409, denials stay 401/403/404, unknown stays
            // 500 without leaking internals.
            if (sendAuthorizationAdministrationError(req, res, error)) return;
            if (sendAuthorizationResourceError(req, res, error)) return;
            const message = error instanceof Error ? error.message : 'Failed to generate the user API token.';
            const errorResponse = new APIErrorResponse(message);
            this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
              headers: this.getNoCacheHeaders(),
            });
          }
        );
      } else {
        const errorResponse = new APIErrorResponse('unable to get user ID.');
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
        });
      }
      return;
    }

    public async revokeAPIToken(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const userid = validated.query.id as string;
      const brandId = _.get(BrandingService.getBrandFromReq(req), 'id');

      if (userid && brandId) {
        const targetUser = await this.requireUserInBrand(userid, brandId);
        if (!targetUser) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: 'Resource was not found.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
      }

      if (userid) {
        // AUTH-P5-002: token revocation is a versioned mutation.
        const revokeExpectedVersion = parseMandatoryExpectedVersion(req);
        if (revokeExpectedVersion === undefined) {
          return this.sendResp(req, res, {
            status: 422,
            displayErrors: [{ detail: 'An expectedVersion is required to revoke the user API token.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const uuid: string = '';
        UsersService.setUserKeyForBrand(userid, uuid, String(brandId), {
          actorContext: req.authorization,
          expectedVersion: revokeExpectedVersion,
          requestId: ensureAuthorizationRequestId(req),
        }).subscribe(
          async (userResponse: UserModel) => {
            const user: UserModel = userResponse;
            const response = new UserAPITokenAPIResponse();
            response.id = userid;
            response.username = typeof user.username === 'string' ? user.username : '';
            response.token = uuid;
            return this.sendResp(req, res, { data: response, headers: this.getNoCacheHeaders() });
          },
          async (error: unknown) => {
            sails.log.error('Failed to set UUID:');
            sails.log.error(error);
            if (sendAuthorizationAdministrationError(req, res, error)) return;
            if (sendAuthorizationResourceError(req, res, error)) return;
            const message = error instanceof Error ? error.message : 'Failed to revoke the user API token.';
            const errorResponse = new APIErrorResponse(message);
            this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
              headers: this.getNoCacheHeaders(),
            });
          }
        );
      } else {
        const errorResponse = new APIErrorResponse('unable to get user ID.');
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
        });
      }
      return;
    }

    public async searchLinkCandidates(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { query } = validated;
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const primaryUserId = String(query.primaryUserId ?? '');
        if (primaryUserId && !(await this.requireUserInBrand(primaryUserId, String(brand.id)))) {
          return this.sendOpaqueUserNotFound(req, res);
        }
        const candidates = await firstValueFrom(
          UsersService.searchLinkCandidates(String(query.query ?? ''), String(brand.id), primaryUserId)
        );
        return this.sendResp(req, res, {
          data: candidates,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async getUserLinks(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params } = validated;
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const links = await firstValueFrom(
          UsersService.getLinkedAccountsForBrand(String(params.id ?? ''), String(brand.id))
        );
        return this.sendResp(req, res, {
          data: links,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async getUserAudit(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const userId = String(validated.params.id ?? '').trim();
      if (_.isEmpty(userId)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'User ID is required' }],
          headers: this.getNoCacheHeaders(),
        });
      }

      try {
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const user = await this.requireUserInBrand(userId, String(brand.id));
        if (user == null) {
          return this.sendOpaqueUserNotFound(req, res);
        }

        const auditResponse = await UsersService.getUserAuditForBrand(userId, String(brand.id));
        return this.sendResp(req, res, {
          data: {
            user: this.sanitizeUserForResponse(user as UserAttributes),
            records: auditResponse.records,
            summary: auditResponse.summary,
          },
          headers: this.getNoCacheHeaders(),
        });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async linkAccounts(req: Sails.Req, res: Sails.Res) {
      // Input validation
      const validated = getValidatedApiRequest(req);
      const body = validated.body as Record<string, unknown>;
      const primaryUserId = String(body.primaryUserId ?? '').trim();
      const secondaryUserId = String(body.secondaryUserId ?? '').trim();

      if (!primaryUserId || !secondaryUserId) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Both primaryUserId and secondaryUserId are required' }],
          headers: this.getNoCacheHeaders(),
        });
      }

      if (primaryUserId === secondaryUserId) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Cannot link a user account to itself' }],
          headers: this.getNoCacheHeaders(),
        });
      }

      try {
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }

        const response = await firstValueFrom(
          UsersService.linkAccounts(
            primaryUserId,
            secondaryUserId,
            String(req.user?.username ?? 'system'),
            String(brand.id),
            {
              actorContext: req.authorization,
              requestId: ensureAuthorizationRequestId(req),
              reason: typeof body.reason === 'string' ? body.reason : undefined,
              // AUTH-LINK-PROOF-001: propagate the pair-bound proof advertised
              // by the route schema. Both expected versions plus the preview
              // confirmation token are required by the guarded writer.
              primaryExpectedVersion:
                typeof body.primaryExpectedVersion === 'number' && Number.isSafeInteger(body.primaryExpectedVersion)
                  ? body.primaryExpectedVersion
                  : undefined,
              secondaryExpectedVersion:
                typeof body.secondaryExpectedVersion === 'number' && Number.isSafeInteger(body.secondaryExpectedVersion)
                  ? body.secondaryExpectedVersion
                  : undefined,
              linkConfirmationToken:
                typeof body.linkConfirmationToken === 'string' ? body.linkConfirmationToken : undefined,
              linkOperationId: typeof body.linkOperationId === 'string' ? body.linkOperationId : undefined,
            }
          )
        );
        return this.sendResp(req, res, {
          data: response,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error) {
        // AUTH-CAS-HTTP-001: stable Problem Details first (409/422/404/401),
        // then 503 for transaction-unavailable, then legacy fallback. The
        // string-sniffed mapping below is a last resort only.
        if (sendAuthorizationAdministrationError(req, res, error as Error)) return;
        if (sendAuthorizationTransactionUnavailable(req, res, error)) return;
        if (sendAuthorizationResourceError(req, res, error)) return;
        sails.log.error('Failed to link accounts:');
        sails.log.error(error);

        const errorMessage = (error as Error)?.message ?? 'An error has occurred';
        const normalizedMessage = errorMessage.toLowerCase();
        let statusCode = 500;

        if (normalizedMessage.includes('forbidden') || normalizedMessage.includes('unauthor')) {
          statusCode = 403;
        } else if (
          normalizedMessage.includes('required') ||
          normalizedMessage.includes('invalid') ||
          normalizedMessage.includes('must') ||
          normalizedMessage.includes('cannot link a user account to itself')
        ) {
          statusCode = 400;
        }

        return this.sendResp(req, res, {
          status: statusCode,
          displayErrors: [{ detail: errorMessage }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    /**
     * AUTH-LINK-PROOF-001 server-bound preview: resolves the canonical pair,
     * validates both accounts, and issues pair versions plus a short-lived
     * confirmation token and operation ID. Read-only; the writer re-verifies
     * everything before any write.
     */
    public async previewLinkAccounts(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const body = validated.body as Record<string, unknown>;
      const primaryUserId = String(body.primaryUserId ?? '').trim();
      const secondaryUserId = String(body.secondaryUserId ?? '').trim();
      if (!primaryUserId || !secondaryUserId) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Both primaryUserId and secondaryUserId are required' }],
          headers: this.getNoCacheHeaders(),
        });
      }
      try {
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const preview = await RoleAdministrationService.previewLinkAccounts({
          actor: requireRequestAuthorizationContext(req),
          brandId: String(brand.id),
          primaryUserId,
          secondaryUserId,
          requestId: ensureAuthorizationRequestId(req),
          reason: typeof body.reason === 'string' ? body.reason : undefined,
        });
        return this.sendResp(req, res, { data: preview, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationAdministrationError(req, res, error as Error)) return;
        if (sendAuthorizationTransactionUnavailable(req, res, error)) return;
        if (sendAuthorizationResourceError(req, res, error)) return;
        sails.log.error('Failed to preview account link:');
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    /** AUTH-TXN-001: expose the durable link-operation state for polling. */
    public async getLinkOperation(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const operationId = String(validated.params.operationId ?? '').trim();
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        if (!brand || !brand.id || !operationId) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context and operation ID are required' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const state = await RoleAdministrationService.getLinkOperation(
          requireRequestAuthorizationContext(req),
          String(brand.id),
          operationId
        );
        return this.sendResp(req, res, { data: state, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationAdministrationError(req, res, error as Error)) return;
        if (sendAuthorizationTransactionUnavailable(req, res, error)) return;
        if (sendAuthorizationResourceError(req, res, error)) return;
        sails.log.error('Failed to read link operation:');
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    /**
     * AUTH-TXN-001 bounded idempotent retry: resumes a pending/failed (or
     * completed-with-pending-records) operation for the same pair instead of
     * conflicting with its own prior commit.
     */
    public async retryLinkOperation(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const body = validated.body as Record<string, unknown>;
      const operationId = String(validated.params.operationId ?? body.linkOperationId ?? '').trim();
      const primaryUserId = String(body.primaryUserId ?? '').trim();
      const secondaryUserId = String(body.secondaryUserId ?? '').trim();
      if (!operationId || !primaryUserId || !secondaryUserId) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Operation ID, primaryUserId and secondaryUserId are required' }],
          headers: this.getNoCacheHeaders(),
        });
      }
      // AUTH-P5-006: the retry DTO is mandatory end-to-end (operation ID,
      // both account versions, confirmation token). Anything missing fails
      // closed with 422 before the writer verifies proof against the stored
      // durable operation.
      const retryPrimaryVersion = body.primaryExpectedVersion;
      const retrySecondaryVersion = body.secondaryExpectedVersion;
      const retryToken = typeof body.linkConfirmationToken === 'string' ? body.linkConfirmationToken : '';
      if (
        typeof retryPrimaryVersion !== 'number' ||
        !Number.isSafeInteger(retryPrimaryVersion) ||
        retryPrimaryVersion < 1 ||
        typeof retrySecondaryVersion !== 'number' ||
        !Number.isSafeInteger(retrySecondaryVersion) ||
        retrySecondaryVersion < 1 ||
        retryToken.length === 0
      ) {
        return this.sendResp(req, res, {
          status: 422,
          displayErrors: [
            {
              detail:
                'A complete retry proof is required: primaryExpectedVersion, secondaryExpectedVersion and linkConfirmationToken.',
            },
          ],
          headers: this.getNoCacheHeaders(),
        });
      }
      try {
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const retryResult: unknown = await RoleAdministrationService.retryLinkOperation({
          actor: requireRequestAuthorizationContext(req),
          brandId: String(brand.id),
          primaryUserId,
          secondaryUserId,
          primaryExpectedVersion: retryPrimaryVersion,
          secondaryExpectedVersion: retrySecondaryVersion,
          linkConfirmationToken: retryToken,
          linkOperationId: operationId,
          requestId: ensureAuthorizationRequestId(req),
          reason: typeof body.reason === 'string' ? body.reason : undefined,
        });
        // Canonical DTO: the route declares `userLinkResponseSchema`, so map
        // the raw mutation result to the link response shape (operation ID +
        // pending flag) instead of returning the writer envelope verbatim.
        const retryEnvelope: Record<string, unknown> =
          typeof retryResult === 'object' && retryResult !== null ? { ...retryResult } : {};
        const retryData: unknown = retryEnvelope.data ?? retryEnvelope;
        const resultData: Record<string, unknown> =
          typeof retryData === 'object' && retryData !== null ? { ...retryData } : {};
        const linked = await firstValueFrom(
          UsersService.getLinkedAccountsForBrand(String(resultData.primaryUserId ?? primaryUserId), String(brand.id))
        ).catch(() => undefined);
        const canonical = {
          ...(linked ?? {}),
          impact: {
            recordsRewritten: Number(resultData.recordsRewritten ?? 0),
            rolesMerged: Number(resultData.rolesAdopted ?? 0),
          },
          recordsPending: (resultData.recordsPending as boolean | undefined) === true,
          linkOperationId: String(resultData.linkOperationId ?? operationId),
        };
        return this.sendResp(req, res, { data: canonical, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationAdministrationError(req, res, error as Error)) return;
        if (sendAuthorizationTransactionUnavailable(req, res, error)) return;
        if (sendAuthorizationResourceError(req, res, error)) return;
        sails.log.error('Failed to retry link operation:');
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public listSystemRoles(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const brand: BrandingModel = BrandingService.getBrandFromReq(req);
      const response: ListAPIResponse<unknown> = new ListAPIResponse<unknown>();
      response.summary.numFound = brand.roles.length;
      response.records = brand.roles;

      // Phase 5 response contract: typed `sendResp` (not the deprecated
      // `apiRespond` envelope), preserving the declared 200 list shape.
      return this.sendResp(req, res, { data: response, headers: this.getNoCacheHeaders() });
    }

    public async createSystemRole(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const body: unknown = validated.body;
      const bodyRoleName: unknown =
        typeof body === 'object' && body !== null && 'roleName' in body ? body.roleName : undefined;
      const paramsRoleName: unknown = validated.params.roleName;
      const queryRoleName: unknown = validated.query.roleName;
      // AUTH-P5-008 path roleName propagation: the `:roleName` path param is
      // authoritative, with body/query fallbacks for legacy callers.
      const roleName =
        (typeof paramsRoleName === 'string' && paramsRoleName.length > 0 ? paramsRoleName : undefined) ??
        (typeof bodyRoleName === 'string' && bodyRoleName.length > 0 ? bodyRoleName : undefined) ??
        (typeof queryRoleName === 'string' && queryRoleName.length > 0 ? queryRoleName : undefined);
      sails.log.verbose('createSystemRole - roleName ' + roleName);
      if (_.isUndefined(roleName)) {
        const errorResponse = new APIErrorResponse(
          'Role name has to be passed in as url param or in the body { roleName: nameOfRole }'
        );
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
        });
      }
      try {
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        const actor = requireRequestAuthorizationContext(req);
        await RoleAdministrationService.createRole({
          actor,
          brandId: String(brand.id ?? ''),
          key: String(roleName),
          displayName: String(roleName),
          requestId: ensureAuthorizationRequestId(req),
        });
        const response: APIActionResponse = new APIActionResponse(
          roleName + ' create call success',
          roleName + ' create call success'
        );
        // Phase 5 response contract: typed `sendResp` (not the deprecated
        // `apiRespond` envelope), preserving the declared 200 action shape.
        return this.sendResp(req, res, { data: response, headers: this.getNoCacheHeaders() });
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async disableUser(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const userId = String(validated.params.id ?? '').trim();
        if (!userId) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'User id is required' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        if (String(req.user?.id ?? '') === String(userId)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'You cannot disable your own account' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const targetUser = await this.requireUserInBrand(userId, brand.id);
        if (!targetUser) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: 'Resource was not found.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const disableBody = (validated.body ?? {}) as Record<string, unknown>;
        // AUTH-P5-002: CAS is mandatory on the disable route.
        const disableExpectedVersion = parseMandatoryExpectedVersion(req);
        if (disableExpectedVersion === undefined) {
          return this.sendResp(req, res, {
            status: 422,
            displayErrors: [{ detail: 'An expectedVersion is required to modify user access state.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const disableResult = await UsersService.disableUserForBrand(
          userId,
          String(req.user?.username ?? 'system'),
          String(brand.id),
          {
            expectedVersion: disableExpectedVersion,
            actorContext: req.authorization,
            requestId: ensureAuthorizationRequestId(req),
            reason: typeof disableBody.reason === 'string' ? disableBody.reason : undefined,
          }
        );
        return this.sendResp(req, res, {
          data: {
            status: true,
            message: 'User disabled successfully',
            ...((disableResult as { readonly version?: number } | undefined)?.version === undefined
              ? {}
              : { version: (disableResult as { readonly version: number }).version }),
          },
          headers: this.getNoCacheHeaders(),
        });
      } catch (err) {
        if (sendAuthorizationResourceError(req, res, err)) return;
        sails.log.error(err);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (err as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async enableUser(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const userId = String(validated.params.id ?? '').trim();
        if (!userId) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'User id is required' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const targetUser = await this.requireUserInBrand(userId, brand.id);
        if (!targetUser) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: 'Resource was not found.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const enableBody = (validated.body ?? {}) as Record<string, unknown>;
        // AUTH-P5-002: CAS is mandatory on the enable route.
        const enableExpectedVersion = parseMandatoryExpectedVersion(req);
        if (enableExpectedVersion === undefined) {
          return this.sendResp(req, res, {
            status: 422,
            displayErrors: [{ detail: 'An expectedVersion is required to modify user access state.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const enableResult = await UsersService.enableUserForBrand(
          userId,
          String(req.user?.username ?? 'system'),
          String(brand.id),
          {
            expectedVersion: enableExpectedVersion,
            actorContext: req.authorization,
            requestId: ensureAuthorizationRequestId(req),
            reason: typeof enableBody.reason === 'string' ? enableBody.reason : undefined,
          }
        );
        return this.sendResp(req, res, {
          data: {
            status: true,
            message: 'User enabled successfully',
            ...((enableResult as { readonly version?: number } | undefined)?.version === undefined
              ? {}
              : { version: (enableResult as { readonly version: number }).version }),
          },
          headers: this.getNoCacheHeaders(),
        });
      } catch (err) {
        if (sendAuthorizationResourceError(req, res, err)) return;
        sails.log.error(err);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (err as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
