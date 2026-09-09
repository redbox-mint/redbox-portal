import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model';
import { of, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { UserAttributes } from '../waterline-models/User';
import {
  ensureAuthorizationRequestId,
  parseMandatoryExpectedVersion,
  sendAuthorizationAdministrationError,
  sendAuthorizationResourceError,
  sendAuthorizationTransactionUnavailable,
} from '../policies/authorization-response';

export namespace Controllers {
  /**
   * Admin Controller
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Admin extends controllers.Core.Controller {
    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'harvestRunsIndex',
      'rolesIndex',
      'usersIndex',
      'getBrandRoles',
      'getUsers',
      'updateUserRoles',
      'updateUserDetails',
      'addLocalUser',
      'generateUserKey',
      'revokeUserKey',
      'searchLinkCandidates',
      'getUserLinks',
      'getUserAudit',
      'linkAccounts',
      'disableUser',
      'enableUser',
    ];

    private sanitizeUserForResponse(user: UserAttributes | null): UserAttributes | null {
      if (user == null) {
        return null;
      }

      const sanitizedUser = { ...(user as UserAttributes & globalThis.Record<string, unknown>) };
      delete sanitizedUser['password'];
      delete sanitizedUser['token'];
      return sanitizedUser as UserAttributes;
    }

    /**
     * Opaque brand-scoped 404 used when a user target is absent or outside the
     * request brand. Intentionally emits only no-cache headers: Deprecation and
     * Link successor headers are withheld so the response does not oracle
     * cross-brand existence (the Link successor embeds the request brand path)
     * and so deprecation state cannot be probed across brands. The narrowed
     * legacy AJAX contract documents this exception and pins it in
     * `legacy-role-ajax-contracts.test.ts`.
     */
    private sendOpaqueUserNotFound(req: Sails.Req, res: Sails.Res) {
      return this.sendResp(req, res, {
        status: 404,
        displayErrors: [{ detail: 'Resource was not found.' }],
        headers: this.getNoCacheHeaders(),
      });
    }

    private async requireUserInBrand(req: Sails.Req, userId: string): Promise<UserAttributes | null> {
      const brand = BrandingService.getBrandFromReq(req);
      return await firstValueFrom(UsersService.getUserForBrand(userId, String(brand.id ?? '')));
    }

    private mergeBrandRoleIds(
      user: UserAttributes,
      brandId: string,
      brandRoleIds: Array<string | number>
    ): Array<string | number> {
      const roles: unknown = user.roles ?? [];
      if (!Array.isArray(roles)) return _.uniq([...brandRoleIds]);
      const foreignRoleIds: Array<string | number> = [];
      for (const role of roles) {
        if (typeof role !== 'object' || role === null || !('branding' in role)) continue;
        const branding: unknown = role.branding;
        let roleBrandId = '';
        if (typeof branding === 'string') roleBrandId = branding;
        else if (typeof branding === 'object' && branding !== null && 'id' in branding) {
          roleBrandId = String(branding.id ?? '');
        }
        if (roleBrandId === brandId) continue;
        if (typeof role === 'object' && role !== null && 'id' in role) {
          const id: unknown = role.id;
          if (typeof id === 'string' || typeof id === 'number') foreignRoleIds.push(id);
        }
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
        // The profile service deliberately preserves that legacy envelope,
        // so unwrap the successful rows before inspecting the post-write
        // version used by the role CAS.
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
     * **************************************************************************************************
     * *************************************** Override default methods ********************************
     * **************************************************************************************************
     */

    /**
     * **************************************************************************************************
     * *************************************** Add custom methods **************************************
     * **************************************************************************************************
     */

    public rolesIndex(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'admin/roles');
    }

    public harvestRunsIndex(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'admin/harvest-runs');
    }

    public usersIndex(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'admin/users');
    }

    public async getUsers(req: Sails.Req, res: Sails.Res) {
      const brand = BrandingService.getBrandFromReq(req);
      const brandId = _.get(brand, 'id');
      try {
        const users = await firstValueFrom(UsersService.getUsersForBrand(brand));
        const links =
          typeof UserLink !== 'undefined'
            ? await UserLink.find({ brandId: String(brandId), status: 'active' }).limit(1000)
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
          (acc: globalThis.Record<string, string>, user: globalThis.Record<string, unknown>) => {
            acc[String(user.id ?? '')] = String(user.username ?? '');
            return acc;
          },
          {} as globalThis.Record<string, string>
        );

        const enrichedUsers = await UsersService.enrichUsersWithEffectiveDisabledState(users);
        const includeDisabled = req.query?.includeDisabled === 'true';
        const responseUsers: globalThis.Record<string, unknown>[] = [];
        _.map(enrichedUsers, (user: globalThis.Record<string, unknown>) => {
          if (
            _.isEmpty(
              _.find(sails.config.auth.hiddenUsers, (hideUser: string) => {
                return hideUser == user.name;
              })
            )
          ) {
            if (!includeDisabled && user.effectiveLoginDisabled === true) {
              return;
            }
            user.accountLinkState = user.accountLinkState || 'active';
            user.linkedAccountCount = linkCountByPrimary[String(user.id ?? '')] || 0;
            user.effectivePrimaryUsername = _.isEmpty(user.linkedPrimaryUserId)
              ? user.username
              : primaryUsernamesById[String(user.linkedPrimaryUserId ?? '')] || user.username;
            user.token = _.isEmpty(user.token) ? null : 'user-has-token-but-is-suppressed';
            if (brandId !== undefined && brandId !== null) {
              const userRoles: unknown = user.roles;
              if (Array.isArray(userRoles)) {
                user.roles = _.filter(userRoles, (role: unknown) => {
                  if (typeof role !== 'object' || role === null || !('branding' in role)) return false;
                  const branding: unknown = role.branding;
                  if (typeof branding === 'string') return branding === brandId;
                  if (typeof branding === 'object' && branding !== null && 'id' in branding) {
                    return branding.id === brandId;
                  }
                  return false;
                });
              }
            }
            delete user.password;
            responseUsers.push(user);
          }
        });
        this.sendResp(req, res, { data: responseUsers, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sails.log.error('Failed to load users');
        sails.log.error(error);
        this.sendResp(req, res, {
          status: 500,
          data: { status: false, message: (error as Error).message },
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public getBrandRoles(req: Sails.Req, res: Sails.Res) {
      // basic roles page: view all users and their roles
      const pageData: globalThis.Record<string, unknown> = {};
      const brand: BrandingModel = BrandingService.getBrandFromReq(req);
      RolesService.getRolesWithBrand(brand)
        .pipe(
          flatMap(roles => {
            _.map(roles, role => {
              if (
                _.isEmpty(
                  _.find(sails.config.auth.hiddenRoles, (hideRole: string) => {
                    return hideRole == role.name;
                  })
                )
              ) {
                // not hidden, adding to view data...
                if (_.isEmpty(pageData.roles)) {
                  pageData.roles = [];
                }
                (pageData.roles as unknown[]).push(role);
              }
            });
            return of(pageData);
          })
        )
        .subscribe((pageData: globalThis.Record<string, unknown>) => {
          this.sendResp(req, res, {
            data: pageData.roles,
            headers: this.getLegacyRoleAjaxHeaders(req, 'roles'),
          });
        });
    }

    /**
     * The legacy AJAX role routes are compatibility adapters over the
     * authorization contract API and are deprecated for the documented window.
     */
    private getLegacyRoleAjaxHeaders(req: Sails.Req, successorAction: 'roles' | 'assignments'): Record<string, string> {
      const successorBase = `${BrandingService.getBrandAndPortalPath(req)}/api/authorization`;
      return {
        ...this.getNoCacheHeaders(),
        Deprecation: 'true',
        Link: `<${successorBase}/${successorAction}>; rel="successor-version"`,
      };
    }

    public async searchLinkCandidates(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const primaryUserId = String(req.param('primaryUserId') ?? '');
        if (primaryUserId && !(await this.requireUserInBrand(req, primaryUserId))) {
          return this.sendOpaqueUserNotFound(req, res);
        }
        const candidates = await firstValueFrom(
          UsersService.searchLinkCandidates(String(req.param('query') ?? ''), String(brand.id), primaryUserId)
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
        const brand = BrandingService.getBrandFromReq(req);
        const links = await firstValueFrom(
          UsersService.getLinkedAccountsForBrand(String(req.param('id') ?? ''), String(brand.id ?? ''))
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
      const userId = String(req.param('id') ?? '').trim();
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
        const user = await this.requireUserInBrand(req, userId);
        if (user == null) {
          return this.sendOpaqueUserNotFound(req, res);
        }

        const auditResponse = await UsersService.getUserAuditForBrand(userId, String(brand.id));
        return this.sendResp(req, res, {
          data: {
            user: this.sanitizeUserForResponse(user),
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
      const primaryUserId = String(req.body.primaryUserId ?? '').trim();
      const secondaryUserId = String(req.body.secondaryUserId ?? '').trim();

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
              reason: typeof req.body?.reason === 'string' ? String(req.body.reason) : undefined,
              // AUTH-LINK-PROOF-001: forward the pair-bound proof fields.
              primaryExpectedVersion:
                typeof req.body?.primaryExpectedVersion === 'number' &&
                Number.isSafeInteger(req.body.primaryExpectedVersion)
                  ? req.body.primaryExpectedVersion
                  : undefined,
              secondaryExpectedVersion:
                typeof req.body?.secondaryExpectedVersion === 'number' &&
                Number.isSafeInteger(req.body.secondaryExpectedVersion)
                  ? req.body.secondaryExpectedVersion
                  : undefined,
              linkConfirmationToken:
                typeof req.body?.linkConfirmationToken === 'string'
                  ? String(req.body.linkConfirmationToken)
                  : undefined,
              linkOperationId:
                typeof req.body?.linkOperationId === 'string' ? String(req.body.linkOperationId) : undefined,
            }
          )
        );
        return this.sendResp(req, res, {
          data: response,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error) {
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

    public async disableUser(req: Sails.Req, res: Sails.Res) {
      try {
        const userId = req.param('id');
        if (_.isEmpty(userId)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'User ID is required' }],
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
            reason: typeof req.body?.reason === 'string' ? String(req.body.reason) : undefined,
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
        const userId = req.param('id');
        if (_.isEmpty(userId)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'User ID is required' }],
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
            reason: typeof req.body?.reason === 'string' ? String(req.body.reason) : undefined,
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

    public async generateUserKey(req: Sails.Req, res: Sails.Res) {
      const userid = String(req.body.userid ?? '').trim();
      if (userid) {
        const target = await this.requireUserInBrand(req, userid);
        if (!target) return this.sendOpaqueUserNotFound(req, res);
        const keyExpectedVersion = parseMandatoryExpectedVersion(req);
        if (keyExpectedVersion === undefined) {
          return this.sendResp(req, res, {
            status: 422,
            displayErrors: [{ detail: 'An expectedVersion is required to rotate the user API token.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const brand = BrandingService.getBrandFromReq(req);
        const uuid = uuidv4();
        UsersService.setUserKeyForBrand(userid, uuid, String(brand.id ?? ''), {
          actorContext: req.authorization,
          expectedVersion: keyExpectedVersion,
          requestId: ensureAuthorizationRequestId(req),
        }).subscribe(
          (_user: unknown) => {
            this.sendResp(req, res, { data: { status: true, message: uuid }, headers: this.getNoCacheHeaders() });
          },
          (error: unknown) => {
            if (sendAuthorizationResourceError(req, res, error)) return;
            sails.log.error('Failed to set UUID:');
            sails.log.error(error);
            this.sendResp(req, res, {
              data: { status: false, message: (error as Error).message },
              headers: this.getNoCacheHeaders(),
            });
          }
        );
      } else {
        return this.sendResp(req, res, {
          data: { status: false, message: 'Please provide userid' },
          headers: this.getNoCacheHeaders(),
        });
      }
      return;
    }

    public async revokeUserKey(req: Sails.Req, res: Sails.Res) {
      const userid = String(req.body.userid ?? '').trim();
      if (userid) {
        const target = await this.requireUserInBrand(req, userid);
        if (!target) return this.sendOpaqueUserNotFound(req, res);
        const revokeExpectedVersion = parseMandatoryExpectedVersion(req);
        if (revokeExpectedVersion === undefined) {
          return this.sendResp(req, res, {
            status: 422,
            displayErrors: [{ detail: 'An expectedVersion is required to revoke the user API token.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const brand = BrandingService.getBrandFromReq(req);
        const uuid = '';
        UsersService.setUserKeyForBrand(userid, uuid, String(brand.id ?? ''), {
          actorContext: req.authorization,
          expectedVersion: revokeExpectedVersion,
          requestId: ensureAuthorizationRequestId(req),
        }).subscribe(
          (_user: unknown) => {
            this.sendResp(req, res, {
              data: { status: true, message: 'UUID revoked successfully' },
              headers: this.getNoCacheHeaders(),
            });
          },
          (error: unknown) => {
            if (sendAuthorizationResourceError(req, res, error)) return;
            sails.log.error('Failed to revoke UUID:');
            sails.log.error(error);
            this.sendResp(req, res, {
              data: { status: false, message: (error as Error).message },
              headers: this.getNoCacheHeaders(),
            });
          }
        );
      } else {
        return this.sendResp(req, res, {
          data: { status: false, message: 'Please provide userid' },
          headers: this.getNoCacheHeaders(),
        });
      }
      return;
    }

    public addLocalUser(req: Sails.Req, res: Sails.Res) {
      const username = req.body.username;
      const details = req.body.details;
      let name: string | undefined;
      let password: string | undefined;
      if (details.name) {
        name = details.name;
      }
      if (details.password) {
        password = details.password;
      }
      if (username && name && password) {
        // AUTH-COMPOSITE-001 legacy protocol: validate roles BEFORE any
        // write; compensate newly created rows on role-phase failure (never
        // destroy pre-existing rows); report primary + compensation errors.
        const legacyBrand: BrandingModel = BrandingService.getBrandFromReq(req);
        const requestedRoles: string[] = Array.isArray(details.roles) ? details.roles : [];
        if (requestedRoles.length > 0) {
          const preIds = RolesService.getRoleIds(legacyBrand.roles, requestedRoles);
          if (preIds.length !== requestedRoles.length) {
            this.sendResp(req, res, {
              data: { status: false, message: 'One or more requested roles are unknown in this brand.' },
              headers: this.getNoCacheHeaders(),
            });
            return;
          }
        }
        UsersService.addLocalUser(username, name, details.email, password, {
          actorContext: req.authorization,
          brandId: String(BrandingService.getBrandFromReq(req)?.id ?? ''),
          requestId: ensureAuthorizationRequestId(req),
        }).subscribe(
          (user: globalThis.Record<string, unknown>) => {
            if (details.roles) {
              const roles = details.roles;
              const brand: BrandingModel = BrandingService.getBrandFromReq(req);
              const roleIds = RolesService.getRoleIds(brand.roles, roles);
              if (roleIds.length !== (roles as unknown[]).length) {
                const createdId = String(user.id ?? '');
                void (async () => {
                  // AUTH-P5-007 centralized saga compensation: version-bound
                  // destroy of the row THIS request created (never a
                  // pre-existing row), awaited, with both outcomes reported.
                  const compensation = await UsersService.destroyNewlyCreatedUserRecord(
                    createdId,
                    ensureAuthorizationRequestId(req)
                  );
                  const compensationFailure =
                    compensation === 'compensated' ? undefined : 'Compensating rollback failed.';
                  this.sendResp(req, res, {
                    data: {
                      status: false,
                      message:
                        'One or more requested roles are unknown in this brand.' +
                        (compensationFailure !== undefined
                          ? ` Compensating rollback also failed: ${compensationFailure}`
                          : ''),
                    },
                    headers: this.getNoCacheHeaders(),
                  });
                })();
                return;
              }
              UsersService.updateUserRoles(user.id as string, roleIds, {
                brandId: String(brand.id),
                actorContext: req.authorization,
                requestId: ensureAuthorizationRequestId(req),
                // AUTH-P5-002: the row was created by THIS request, so its
                // just-observed version is the CAS base.
                expectedVersion: this.observedUserVersionForRoleCas(user) ?? 1,
              }).subscribe(
                (_user: unknown) => {
                  this.sendResp(req, res, {
                    data: { status: true, message: 'User created successfully' },
                    headers: this.getNoCacheHeaders(),
                  });
                },
                (error: unknown) => {
                  sails.log.error('Failed to update user roles:');
                  sails.log.error(error);
                  const createdId = String(user.id ?? '');
                  void (async () => {
                    // AUTH-P5-007 centralized saga compensation: version-bound
                    // destroy of the row THIS request created (never a
                    // pre-existing row), awaited, with both outcomes reported.
                    const compensation = await UsersService.destroyNewlyCreatedUserRecord(
                      createdId,
                      ensureAuthorizationRequestId(req)
                    );
                    const compensationFailure =
                      compensation === 'compensated' ? undefined : 'Compensating rollback failed.';
                    this.sendResp(req, res, {
                      data: {
                        status: false,
                        message:
                          (error as Error).message +
                          (compensationFailure !== undefined
                            ? ` Compensating rollback also failed: ${compensationFailure}`
                            : ''),
                      },
                      headers: this.getNoCacheHeaders(),
                    });
                  })();
                }
              );
            } else {
              this.sendResp(req, res, {
                data: { status: true, message: 'User created successfully' },
                headers: this.getNoCacheHeaders(),
              });
            }
          },
          (error: unknown) => {
            sails.log.error('Failed to create user:');
            sails.log.error(error);
            this.sendResp(req, res, {
              data: { status: false, message: (error as Error).message },
              headers: this.getNoCacheHeaders(),
            });
          }
        );
      } else {
        this.sendResp(req, res, {
          data: { status: false, message: 'Please provide minimum of username, name and password' },
          headers: this.getNoCacheHeaders(),
        });
      }
      return;
    }

    public async updateUserDetails(req: Sails.Req, res: Sails.Res) {
      const userid = req.body.userid;
      const details = req.body.details;
      let name: string | undefined;
      if (details.name) {
        name = details.name;
      }
      if (userid && name) {
        const target = await this.requireUserInBrand(req, String(userid));
        if (!target) return this.sendOpaqueUserNotFound(req, res);
        const profileExpectedVersion = parseMandatoryExpectedVersion(req);
        if (profileExpectedVersion === undefined) {
          return this.sendResp(req, res, {
            status: 422,
            displayErrors: [{ detail: 'An expectedVersion is required to modify user profile state.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        // AUTH-COMPOSITE-001 legacy protocol: validate roles BEFORE the
        // profile mutation; snapshot all prior fields; restore on role-phase
        // failure and report both errors.
        const legacyRequestedRoles: string[] = Array.isArray(details.roles) ? details.roles : [];
        let legacyMergedRoleIds: Array<string | number> | undefined;
        if (legacyRequestedRoles.length > 0) {
          const legacyRoleIds = RolesService.getRoleIds(brand.roles, legacyRequestedRoles);
          if (legacyRoleIds.length !== legacyRequestedRoles.length) {
            this.sendResp(req, res, {
              data: { status: false, message: 'One or more requested roles are unknown in this brand.' },
              headers: this.getNoCacheHeaders(),
            });
            return;
          }
          legacyMergedRoleIds = this.mergeBrandRoleIds(target, String(brand.id), legacyRoleIds);
        }
        // AUTH-P5-007: verbatim prior snapshot (empty/null preserved) for the
        // guarded exact-restore compensator — no lossy coercion, no direct
        // writes on the restore path.
        const verbatimLegacyField = (value: unknown): string | null => (typeof value === 'string' ? value : null);
        const legacyPrior = {
          name: verbatimLegacyField(target.name),
          email: verbatimLegacyField(target.email),
          passwordHash: verbatimLegacyField(target.password),
        };
        UsersService.updateUserDetailsForBrand(userid, name, details.email, details.password, String(brand.id ?? ''), {
          actorContext: req.authorization,
          expectedVersion: profileExpectedVersion,
          requestId: ensureAuthorizationRequestId(req),
        }).subscribe(
          (_user: unknown) => {
            if (details.roles) {
              const mergedRoleIds = legacyMergedRoleIds ?? [];
              // AUTH-P5-002: the roles phase pins the post-profile observed
              // version (the profile write advanced it). An unresolvable
              // version fails closed with partial state, never a blind write.
              const postProfileVersion = this.observedUserVersionForRoleCas(_user);
              if (postProfileVersion === undefined) {
                this.sendResp(req, res, {
                  data: {
                    status: false,
                    message:
                      'Partial state: profile is stored but roles were not applied. Updated user state is unreadable.',
                  },
                  headers: this.getNoCacheHeaders(),
                });
                return;
              }
              UsersService.updateUserRoles(userid, mergedRoleIds, {
                brandId: String(brand.id),
                actorContext: req.authorization,
                requestId: ensureAuthorizationRequestId(req),
                expectedVersion: postProfileVersion,
              }).subscribe(
                (_user: unknown) => {
                  this.sendResp(req, res, {
                    data: { status: true, message: 'User updated successfully' },
                    headers: this.getNoCacheHeaders(),
                  });
                },
                (error: unknown) => {
                  sails.log.error('Failed to update user roles:');
                  sails.log.error(error);
                  void (async () => {
                    let restoreFailure: string | undefined;
                    try {
                      const { firstValueFrom: rxFirstValueFrom } = await import('rxjs');
                      // AUTH-P5-007: exact restore via the guarded compensator
                      // (verbatim fields incl. empty/null, version-pinned CAS,
                      // audit). No direct `User.update` writes.
                      await rxFirstValueFrom(
                        UsersService.compensateUserDetailsForBrand(
                          userid,
                          {
                            name: legacyPrior.name,
                            email: legacyPrior.email,
                            passwordHash: legacyPrior.passwordHash,
                          },
                          String(brand.id ?? ''),
                          { actorContext: req.authorization, requestId: ensureAuthorizationRequestId(req) }
                        )
                      );
                    } catch (restoreError) {
                      restoreFailure = (restoreError as Error)?.message ?? 'Profile restore failed.';
                    }
                    this.sendResp(req, res, {
                      data: {
                        status: false,
                        message:
                          `Partial state: profile mutation was restored but roles were not applied. ${(error as Error).message}` +
                          (restoreFailure !== undefined ? ` Profile restore also failed: ${restoreFailure}` : ''),
                      },
                      headers: this.getNoCacheHeaders(),
                    });
                  })();
                }
              );
            } else {
              this.sendResp(req, res, {
                data: { status: true, message: 'Save OK.' },
                headers: this.getNoCacheHeaders(),
              });
            }
          },
          (error: unknown) => {
            sails.log.error('Failed to update user details:');
            sails.log.error(error);
            this.sendResp(req, res, {
              data: { status: false, message: (error as Error).message },
              headers: this.getNoCacheHeaders(),
            });
          }
        );
      } else {
        this.sendResp(req, res, {
          data: { status: false, message: 'Please provide minimum of userid and name' },
          headers: this.getNoCacheHeaders(),
        });
      }
      return;
    }

    /**
     * Updates a user's roles. Will be accepting the userid and the array of role names. Used role names instead of ids to prevent cross-brand poisoning.
     */
    public async updateUserRoles(req: Sails.Req, res: Sails.Res) {
      const newRoleNames = req.body.roles;
      const userid = req.body.userid;
      if (userid && newRoleNames) {
        // get the ids of the role names...
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        const target = await this.requireUserInBrand(req, String(userid));
        if (!target) return this.sendOpaqueUserNotFound(req, res);
        // AUTH-P5-002: role CAS is mandatory on the standalone roles route.
        const rolesExpectedVersion = parseMandatoryExpectedVersion(req);
        if (rolesExpectedVersion === undefined) {
          return this.sendResp(req, res, {
            status: 422,
            displayErrors: [{ detail: 'An expectedVersion is required to modify user role state.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const roleIds = RolesService.getRoleIds(brand.roles, newRoleNames);
        const mergedRoleIds = this.mergeBrandRoleIds(target, String(brand.id), roleIds);
        UsersService.updateUserRoles(userid, mergedRoleIds, {
          brandId: String(brand.id),
          actorContext: req.authorization,
          requestId: ensureAuthorizationRequestId(req),
          expectedVersion: rolesExpectedVersion,
        }).subscribe(
          (_user: unknown) => {
            this.sendResp(req, res, {
              data: { status: true, message: 'Save OK.' },
              headers: this.getLegacyRoleAjaxHeaders(req, 'assignments'),
            });
          },
          (error: unknown) => {
            sails.log.error('Failed to update user roles:');
            sails.log.error(error);
            this.sendResp(req, res, {
              data: { status: false, message: (error as Error).message },
              headers: this.getLegacyRoleAjaxHeaders(req, 'assignments'),
            });
          }
        );
      } else {
        this.sendResp(req, res, {
          data: { status: false, message: 'Please provide userid and/or roles names.' },
          headers: this.getLegacyRoleAjaxHeaders(req, 'assignments'),
        });
      }
      return;
    }

    /**
     * **************************************************************************************************
     * *************************************** Override magic methods **********************************
     * **************************************************************************************************
     */
  }
}
