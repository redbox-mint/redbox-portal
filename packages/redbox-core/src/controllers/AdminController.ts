import { adminUserListQuery } from '../api-routes/groups/admin-users';
import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { UserAttributes } from '../waterline-models/User';

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
        'getUserOptions',
        'updateRoleDescription',
        'removeRoleMember',
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
        'enableUser'
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
      const brand = BrandingService.getBrand(req.session.branding as string);
      const brandId = _.get(brand, 'id') || brand || req.session.branding;
      try {
        const parsed = adminUserListQuery.safeParse(req.query ?? {});
        if (!parsed.success) return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Invalid user list query' }], headers: this.getNoCacheHeaders() });
        const options = parsed.data;
        const signIn = options.signIn;
        if (signIn !== undefined && (typeof signIn !== 'string' || (signIn && !RolesService.getSignInMethods(brand).includes(signIn)))) {
          return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Invalid sign-in method' }], headers: this.getNoCacheHeaders() });
        }
        const users = await firstValueFrom(UsersService.getUsersForBrand(brand, signIn as string));
        const links = typeof UserLink !== 'undefined'
          ? await UserLink.find({ brandId: String(brandId), status: 'active' })
          : [];
        const linkCountByPrimary = _.countBy(links as globalThis.Record<string, unknown>[], (link: globalThis.Record<string, unknown>) => String(link.primaryUserId ?? ''));
        const primaryIds = _.uniq(_.map(links as globalThis.Record<string, unknown>[], (link: globalThis.Record<string, unknown>) => String(link.primaryUserId ?? '')));
        const primaryUsers = _.isEmpty(primaryIds) || typeof User === 'undefined' ? [] : await User.find({ id: primaryIds });
        const primaryUsernamesById = _.reduce(primaryUsers as globalThis.Record<string, unknown>[], (acc: globalThis.Record<string, string>, user: globalThis.Record<string, unknown>) => {
          acc[String(user.id ?? '')] = String(user.username ?? '');
          return acc;
        }, {} as globalThis.Record<string, string>);

        const enrichedUsers = await UsersService.enrichUsersWithEffectiveDisabledState(users);
        const includeDisabled = req.query?.includeDisabled === 'true';
        const responseUsers: globalThis.Record<string, unknown>[] = [];
        _.map(enrichedUsers, (user: globalThis.Record<string, unknown>) => {
          if (!sails.config.auth.hiddenUsers.some((hidden: string) => hidden === user.name || hidden === user.username)) {
            if (options.page === undefined && options.pageSize === undefined && !includeDisabled && user.effectiveLoginDisabled === true) {
              return;
            }
            user.accountLinkState = user.accountLinkState || 'active';
            user.linkedAccountCount = linkCountByPrimary[String(user.id ?? '')] || 0;
            user.effectivePrimaryUsername = _.isEmpty(user.linkedPrimaryUserId)
              ? user.username
              : (primaryUsernamesById[String(user.linkedPrimaryUserId ?? '')] || user.username);
            user.token = _.isEmpty(user.token) ? null : "user-has-token-but-is-suppressed";
            user.roles = brandId ? _.filter(user.roles as globalThis.Record<string, unknown>[], (role: globalThis.Record<string, unknown>) => role.branding === brandId || (role.branding as globalThis.Record<string, unknown>)?.id === brandId) : user.roles;
            delete user.password;
            responseUsers.push(user);
          }
        });
        if (options.page !== undefined || options.pageSize !== undefined) {
          const roleCounts: globalThis.Record<string, { active: number; disabled: number; removableActive: number }> = Object.create(null);
          for (const user of responseUsers) {
            for (const role of user.roles as Array<{ name: string }>) {
              const counts = roleCounts[role.name] ||= { active: 0, disabled: 0, removableActive: 0 };
              if (user.effectiveLoginDisabled) ++counts.disabled;
              else {
                ++counts.active;
                if (user.accountLinkState !== 'linked-alias') ++counts.removableActive;
              }
            }
          }
          const query = (options.query || '').toLowerCase();
          const hasRole = (user: globalThis.Record<string, unknown>, name: string) => (user.roles as Array<{ name: string }>).some(role => role.name === name);
          const filtered = responseUsers.filter(user =>
            (includeDisabled || !user.effectiveLoginDisabled) &&
            (!options.role || hasRole(user, options.role)) &&
            (!options.excludeRole || !hasRole(user, options.excludeRole)) &&
            (options.candidates !== 'true' || (!user.effectiveLoginDisabled && user.accountLinkState !== 'linked-alias')) &&
            (!query || [user.name, user.username, user.email].some(value => String(value || '').toLowerCase().includes(query)))
          );
          const field = options.sort || 'name';
          const direction = options.order === 'desc' ? -1 : 1;
          const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
          filtered.sort((a, b) => direction * (collator.compare(String(a[field] || ''), String(b[field] || '')) || String(a.id).localeCompare(String(b.id))));
          const pageSize = options.pageSize || 25;
          const page = Math.min(options.page || 1, Math.max(1, Math.ceil(filtered.length / pageSize)));
          const start = (page - 1) * pageSize;
          return this.sendResp(req, res, { data: { records: filtered.slice(start, start + pageSize), summary: { numFound: filtered.length, page, start }, roleCounts }, headers: this.getNoCacheHeaders() });
        }
        this.sendResp(req, res, { data: responseUsers, headers: this.getNoCacheHeaders() });
      } catch (error) {
        sails.log.error('Failed to load users');
        sails.log.error(error);
        this.sendResp(req, res, { status: 500, data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
      }
    }

    public async getBrandRoles(req: Sails.Req, res: Sails.Res) {
      const brand = BrandingService.getBrand(req.session.branding as string);
      const roles = await firstValueFrom(RolesService.getRolesWithBrand(brand));
      const visible = roles.filter(role => !sails.config.auth.hiddenRoles.includes(role.name));
      // No populated user objects (passwords/tokens) leave this endpoint.
      this.sendResp(req, res, { data: RolesService.adminRoleSummary(brand, visible), headers: this.getNoCacheHeaders() });
    }

    public getUserOptions(req: Sails.Req, res: Sails.Res) {
      const brand = BrandingService.getBrand(req.session.branding as string);
      return this.sendResp(req, res, { data: { signInMethods: RolesService.getSignInMethods(brand) }, headers: this.getNoCacheHeaders() });
    }

    private requireBrandAdmin(req: Sails.Req, res: Sails.Res, brand: BrandingModel): boolean {
      if (brand?.id && RolesService.getAdminFromBrand(brand) && UsersService.hasRole(req.user, RolesService.getAdminFromBrand(brand))) return true;
      this.sendResp(req, res, { status: 403, displayErrors: [{ detail: 'Brand Admin permission required' }], headers: this.getNoCacheHeaders() });
      return false;
    }

    public async updateRoleDescription(req: Sails.Req, res: Sails.Res) {
      const brand = BrandingService.getBrand(req.session.branding as string);
      if (!this.requireBrandAdmin(req, res, brand)) return;
      try {
        await RolesService.updateDescription(brand, String(req.param('id')), req.body.description);
        return this.sendResp(req, res, { data: { status: true, message: 'Save OK.' }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: (error as Error).message }], headers: this.getNoCacheHeaders() });
      }
    }

    public async removeRoleMember(req: Sails.Req, res: Sails.Res) {
      const brand = BrandingService.getBrand(req.session.branding as string);
      if (!this.requireBrandAdmin(req, res, brand)) return;
      try {
        const roles = await UsersService.removeRoleForBrand(brand, String(req.param('userId')), String(req.param('id')));
        return this.sendResp(req, res, { data: { status: true, roles: roles.map(role => ({ id: role.id, name: role.name })) }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: (error as Error).message }], headers: this.getNoCacheHeaders() });
      }
    }

    public async searchLinkCandidates(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders()
          });
        }
        const candidates = await firstValueFrom(UsersService.searchLinkCandidates(
          String(req.param('query') ?? ''),
          String(brand.id),
          String(req.param('primaryUserId') ?? '')
        ));
        return this.sendResp(req, res, {
          data: candidates,
          headers: this.getNoCacheHeaders()
        });
      } catch (error) {
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async getUserLinks(req: Sails.Req, res: Sails.Res) {
      try {
        const links = await firstValueFrom(UsersService.getLinkedAccounts(String(req.param('id') ?? '')));
        return this.sendResp(req, res, {
          data: links,
          headers: this.getNoCacheHeaders()
        });
      } catch (error) {
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async getUserAudit(req: Sails.Req, res: Sails.Res) {
      const userId = String(req.param('id') ?? '').trim();
      if (_.isEmpty(userId)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'User ID is required' }],
          headers: this.getNoCacheHeaders()
        });
      }

      try {
        const user = await firstValueFrom(UsersService.getUserWithId(userId));
        if (user == null) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: 'User not found' }],
            headers: this.getNoCacheHeaders()
          });
        }

        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders()
          });
        }

        const auditResponse = await UsersService.getUserAudit(userId);
        return this.sendResp(req, res, {
          data: {
            user: this.sanitizeUserForResponse(user),
            records: auditResponse.records,
            summary: auditResponse.summary
          },
          headers: this.getNoCacheHeaders()
        });
      } catch (error) {
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders()
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
          headers: this.getNoCacheHeaders()
        });
      }

      if (primaryUserId === secondaryUserId) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Cannot link a user account to itself' }],
          headers: this.getNoCacheHeaders()
        });
      }

      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders()
          });
        }

        const response = await firstValueFrom(UsersService.linkAccounts(
          primaryUserId,
          secondaryUserId,
          String(req.user?.username ?? 'system'),
          String(brand.id)
        ));
        return this.sendResp(req, res, {
          data: response,
          headers: this.getNoCacheHeaders()
        });
      } catch (error) {
        sails.log.error('Failed to link accounts:');
        sails.log.error(error);

        const errorMessage = (error as Error)?.message ?? 'An error has occurred';
        const normalizedMessage = errorMessage.toLowerCase();
        let statusCode = 500;

        if (normalizedMessage.includes('forbidden') || normalizedMessage.includes('unauthor')) {
          statusCode = 403;
        } else if (
          normalizedMessage.includes('required')
          || normalizedMessage.includes('invalid')
          || normalizedMessage.includes('must')
          || normalizedMessage.includes('cannot link a user account to itself')
        ) {
          statusCode = 400;
        }

        return this.sendResp(req, res, {
          status: statusCode,
          displayErrors: [{ detail: errorMessage }],
          headers: this.getNoCacheHeaders()
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
            headers: this.getNoCacheHeaders()
          });
        }
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders()
          });
        }
        if (String(req.user?.id ?? '') === String(userId)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'You cannot disable your own account' }],
            headers: this.getNoCacheHeaders()
          });
        }
        await UsersService.disableUser(userId, String(req.user?.username ?? 'system'), String(brand.id));
        return this.sendResp(req, res, { data: { status: true, message: 'User disabled successfully' }, headers: this.getNoCacheHeaders() });
      } catch (err) {
        sails.log.error(err);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (err as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders()
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
            headers: this.getNoCacheHeaders()
          });
        }
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders()
          });
        }
        await UsersService.enableUser(userId, String(req.user?.username ?? 'system'), String(brand.id));
        return this.sendResp(req, res, { data: { status: true, message: 'User enabled successfully' }, headers: this.getNoCacheHeaders() });
      } catch (err) {
        sails.log.error(err);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (err as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public generateUserKey(req: Sails.Req, res: Sails.Res) {
      const userid = req.body.userid;
      if (userid) {
        const uuid = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe((_user: unknown) => {
          this.sendResp(req, res, { data: { status: true, message: uuid }, headers: this.getNoCacheHeaders() });
        }, (error: unknown) => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
        });
      }
      else {
        return this.sendResp(req, res, { data: { status: false, message: "Please provide userid" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    public revokeUserKey(req: Sails.Req, res: Sails.Res) {
      const userid = req.body.userid;
      if (userid) {
        const uuid = '';
        UsersService.setUserKey(userid, uuid).subscribe((_user: unknown) => {
          this.sendResp(req, res, { data: { status: true, message: "UUID revoked successfully" }, headers: this.getNoCacheHeaders() });
        }, (error: unknown) => {
          sails.log.error("Failed to revoke UUID:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
        });
      }
      else {
        return this.sendResp(req, res, { data: { status: false, message: "Please provide userid" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    public addLocalUser(req: Sails.Req, res: Sails.Res) {
      const username = req.body.username;
      const details = req.body.details;
      let name: string | undefined;
      let password: string | undefined;
      if (details.name) { name = details.name };
      if (details.password) { password = details.password };
      if (username && name && password) {
        UsersService.addLocalUser(username, name, details.email, password).subscribe((user: globalThis.Record<string, unknown>) => {
          if (details.roles) {
            const roles = details.roles;
            const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
            const roleIds = RolesService.getRoleIds(brand.roles, roles);
            UsersService.updateUserRoles(user.id as string, roleIds).subscribe((_user: unknown) => {
              this.sendResp(req, res, { data: { status: true, message: "User created successfully" }, headers: this.getNoCacheHeaders() });
            }, (error: unknown) => {
              sails.log.error("Failed to update user roles:");
              sails.log.error(error);
              this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
            });
          } else {
            this.sendResp(req, res, { data: { status: true, message: "User created successfully" }, headers: this.getNoCacheHeaders() });
          }
        }, (error: unknown) => {
          sails.log.error("Failed to create user:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        this.sendResp(req, res, { data: { status: false, message: "Please provide minimum of username, name and password" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    public updateUserDetails(req: Sails.Req, res: Sails.Res) {
      const userid = req.body.userid;
      const details = req.body.details;
      let name: string | undefined;
      if (details.name) { name = details.name };
      if (userid && name) {
        UsersService.updateUserDetails(userid, name, details.email, details.password).subscribe((_user: unknown) => {
          if (details.roles) {
            const roles = details.roles;
            const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
            const roleIds = RolesService.getRoleIds(brand.roles, roles);
            UsersService.updateUserRoles(userid, roleIds).subscribe((_user: unknown) => {
              this.sendResp(req, res, { data: { status: true, message: "User updated successfully" }, headers: this.getNoCacheHeaders() });
            }, (error: unknown) => {
              sails.log.error("Failed to update user roles:");
              sails.log.error(error);
              this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
            });
          } else {
            this.sendResp(req, res, { data: { status: true, message: "Save OK." }, headers: this.getNoCacheHeaders() });
          }
        }, (error: unknown) => {
          sails.log.error("Failed to update user details:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        this.sendResp(req, res, { data: { status: false, message: "Please provide minimum of userid and name" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    /**
    * Updates a user's roles. Will be accepting the userid and the array of role names. Used role names instead of ids to prevent cross-brand poisoning.
    */
    public async updateUserRoles(req: Sails.Req, res: Sails.Res) {
      const brand = BrandingService.getBrand(req.session.branding as string);
      if (!this.requireBrandAdmin(req, res, brand)) return;
      try {
        await UsersService.updateUserRolesForBrand(brand, req.body.userid, req.body.roles);
        return this.sendResp(req, res, { data: { status: true, message: 'Save OK.' }, headers: this.getNoCacheHeaders() });
      } catch (error) {
        return this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
      }
    }

    /**
     * **************************************************************************************************
     * *************************************** Override magic methods **********************************
     * **************************************************************************************************
     */
  }
}
