import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model';
import { of, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { UserAttributes } from '../waterline-models/User';
import { sendAuthorizationResourceError } from '../policies/authorization-response';

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
      const foreignRoleIds = ((user.roles ?? []) as unknown as Array<Record<string, unknown>>)
        .filter(role => {
          const branding = role.branding as string | Record<string, unknown> | undefined;
          const roleBrandId = _.isObject(branding)
            ? String((branding as Record<string, unknown>).id ?? '')
            : String(branding ?? '');
          return roleBrandId !== brandId;
        })
        .map(role => role.id as string | number)
        .filter(roleId => roleId != null);
      return _.uniq([...foreignRoleIds, ...brandRoleIds]);
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
            user.roles = brandId
              ? _.filter(
                  user.roles as globalThis.Record<string, unknown>[],
                  (role: globalThis.Record<string, unknown>) =>
                    role.branding === brandId || (role.branding as globalThis.Record<string, unknown>)?.id === brandId
                )
              : user.roles;
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
          this.sendResp(req, res, { data: pageData.roles, headers: this.getNoCacheHeaders() });
        });
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
            String(brand.id)
          )
        );
        return this.sendResp(req, res, {
          data: response,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error) {
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
        await UsersService.disableUserForBrand(userId, String(req.user?.username ?? 'system'), String(brand.id));
        return this.sendResp(req, res, {
          data: { status: true, message: 'User disabled successfully' },
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
        await UsersService.enableUserForBrand(userId, String(req.user?.username ?? 'system'), String(brand.id));
        return this.sendResp(req, res, {
          data: { status: true, message: 'User enabled successfully' },
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
        const brand = BrandingService.getBrandFromReq(req);
        const uuid = uuidv4();
        UsersService.setUserKeyForBrand(userid, uuid, String(brand.id ?? '')).subscribe(
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
        const brand = BrandingService.getBrandFromReq(req);
        const uuid = '';
        UsersService.setUserKeyForBrand(userid, uuid, String(brand.id ?? '')).subscribe(
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
        UsersService.addLocalUser(username, name, details.email, password).subscribe(
          (user: globalThis.Record<string, unknown>) => {
            if (details.roles) {
              const roles = details.roles;
              const brand: BrandingModel = BrandingService.getBrandFromReq(req);
              const roleIds = RolesService.getRoleIds(brand.roles, roles);
              UsersService.updateUserRoles(user.id as string, roleIds).subscribe(
                (_user: unknown) => {
                  this.sendResp(req, res, {
                    data: { status: true, message: 'User created successfully' },
                    headers: this.getNoCacheHeaders(),
                  });
                },
                (error: unknown) => {
                  sails.log.error('Failed to update user roles:');
                  sails.log.error(error);
                  this.sendResp(req, res, {
                    data: { status: false, message: (error as Error).message },
                    headers: this.getNoCacheHeaders(),
                  });
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
        const brand: BrandingModel = BrandingService.getBrandFromReq(req);
        UsersService.updateUserDetailsForBrand(
          userid,
          name,
          details.email,
          details.password,
          String(brand.id ?? '')
        ).subscribe(
          (_user: unknown) => {
            if (details.roles) {
              const roles = details.roles;
              const roleIds = RolesService.getRoleIds(brand.roles, roles);
              const mergedRoleIds = this.mergeBrandRoleIds(target, String(brand.id), roleIds);
              UsersService.updateUserRoles(userid, mergedRoleIds).subscribe(
                (_user: unknown) => {
                  this.sendResp(req, res, {
                    data: { status: true, message: 'User updated successfully' },
                    headers: this.getNoCacheHeaders(),
                  });
                },
                (error: unknown) => {
                  sails.log.error('Failed to update user roles:');
                  sails.log.error(error);
                  this.sendResp(req, res, {
                    data: { status: false, message: (error as Error).message },
                    headers: this.getNoCacheHeaders(),
                  });
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
        const roleIds = RolesService.getRoleIds(brand.roles, newRoleNames);
        const mergedRoleIds = this.mergeBrandRoleIds(target, String(brand.id), roleIds);
        UsersService.updateUserRoles(userid, mergedRoleIds).subscribe(
          (_user: unknown) => {
            this.sendResp(req, res, { data: { status: true, message: 'Save OK.' }, headers: this.getNoCacheHeaders() });
          },
          (error: unknown) => {
            sails.log.error('Failed to update user roles:');
            sails.log.error(error);
            this.sendResp(req, res, {
              data: { status: false, message: (error as Error).message },
              headers: this.getNoCacheHeaders(),
            });
          }
        );
      } else {
        this.sendResp(req, res, {
          data: { status: false, message: 'Please provide userid and/or roles names.' },
          headers: this.getNoCacheHeaders(),
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
