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
      'getUserAudit',
      'listSystemRoles',
      'createSystemRole',
      'disableUser',
      'enableUser',
    ];

    private async enrichUsersWithLinkMetadata(users: UserAttributes[], brandId?: string): Promise<UserAttributes[]> {
      const links =
        typeof UserLink !== 'undefined'
          ? await UserLink.find(_.isEmpty(brandId) ? { status: 'active' } : { brandId: brandId, status: 'active' })
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
        _.isEmpty(primaryIds) || typeof User === 'undefined' ? [] : await User.find({ id: primaryIds });
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
      const sanitizedUser = { ...(user as UserAttributes & globalThis.Record<string, unknown>) };
      delete sanitizedUser['password'];
      delete sanitizedUser['token'];
      return sanitizedUser as UserAttributes;
    }

    private async getFilteredUserRecords(
      queryObject: Record<string, unknown>,
      brandId: string | undefined,
      includeDisabled: boolean
    ): Promise<UserAttributes[]> {
      const dbQuery = includeDisabled ? queryObject : { ...queryObject, loginDisabled: { '!=': true } };

      const users = await User.find({ where: dbQuery });
      let userRecords = await this.enrichUsersWithLinkMetadata(users as UserAttributes[], brandId);
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

    public bootstrap() { }

    public async listUsers(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { query } = validated;
      const searchField = query.searchBy as string | undefined;
      const searchQuery = query.query as string | undefined;
      const queryObject: Record<string, unknown> = {};
      if (searchField != null && searchQuery != null) {
        queryObject[searchField] = searchQuery;
      }
      const page: number = query.page != null ? parseInt(String(query.page), 10) : 1;
      const pageSize: number = query.pageSize != null ? parseInt(String(query.pageSize), 10) : 10;
      const skip = (page - 1) * pageSize;
      const response: ListAPIResponse<UserAttributes> = new ListAPIResponse<UserAttributes>();

      try {
        const includeDisabled = query.includeDisabled === 'true';
        const brandId = _.get(BrandingService.getBrand(req.session.branding as string), 'id');
        const userRecords = await this.getFilteredUserRecords(queryObject, brandId, includeDisabled);
        const count = userRecords.length;
        response.summary.numFound = count;
        response.summary.page = page;
        if (count === 0) {
          response.records = [];
          return this.apiRespond(req, res, response);
        }

        const pagedRecords = userRecords.slice(skip, skip + pageSize);
        _.each(pagedRecords, (user: UserAttributes) => {
          delete user['token'];
          delete user['password'];
        });
        response.records = pagedRecords;
        return this.apiRespond(req, res, response);
      } catch (err) {
        sails.log.error(err);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (err as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public getUser(req: Sails.Req, res: Sails.Res) {
      const that = this;
      const validated = getValidatedApiRequest(req);
      const { query } = validated;
      const searchField = query.searchBy as string;
      const searchQuery = query.query as string;
      const queryObject: Record<string, unknown> = {};
      queryObject[searchField] = searchQuery;
      User.findOne(queryObject).exec(function (err: unknown, user: UserAttributes | null) {
        if (err != null) {
          sails.log.error(err);
          return that.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: (err as Error)?.message ?? 'An error has occurred' }],
            headers: that.getNoCacheHeaders(),
          });
        }
        if (user != null) {
          delete user['token'];
          delete user['password'];
          return that.apiRespond(req, res, user);
        }

        const errorResponse = new APIErrorResponse(
          'No user found with given criteria',
          `Searchby: ${searchField} and Query: ${searchQuery}`
        );
        return that.sendResp(req, res, {
          status: 404,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: that.getNoCacheHeaders(),
        });
      });
    }

    public createUser(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const userReq: UserModel = validated.body as UserModel;

      const respondWithUser = (response: UserModel) => {
        const userResponse = new CreateUserAPIResponse();
        userResponse.id = response.id;
        userResponse.username = response.username;
        userResponse.name = response.name;
        userResponse.email = response.email;
        userResponse.type = response.type;
        userResponse.lastLogin = response.lastLogin;
        return this.apiRespond(req, res, userResponse, 201);
      };

      const applyRolesIfRequested = (response: UserModel) => {
        if (userReq.roles) {
          const roles: string[] = (userReq.roles as unknown[])
            .map((role: unknown) =>
              _.isString(role) ? role : ((role as globalThis.Record<string, unknown>)?.name as string)
            )
            .filter((roleName: unknown) => !_.isEmpty(roleName));
          const brand: BrandingModel =
            BrandingService.getBrand(req.session.branding as string) ?? BrandingService.getDefault();
          const roleIds = brand?.roles ? RolesService.getRoleIds(brand.roles, roles) : [];
          if (_.isEmpty(roleIds)) {
            sails.log.warn('UserManagementController.createUser - No role ids resolved, skipping role assignment.');
            return respondWithUser(response);
          }
          UsersService.updateUserRoles(response.id, roleIds).subscribe(
            (roleUser: UserModel) => {
              const user: UserModel = roleUser;
              sails.log.verbose(user);
              return respondWithUser(response);
            },
            (error: unknown) => {
              sails.log.error('Failed to update user roles:');
              sails.log.error(error);
              return respondWithUser(response);
            }
          );
          return;
        }

        return respondWithUser(response);
      };

      UsersService.addLocalUser(
        userReq.username || '',
        userReq.name || '',
        userReq.email || '',
        userReq.password || ''
      ).subscribe(
        (userResponse: UserModel) => {
          const response: UserModel = userResponse;
          return applyRolesIfRequested(response);
        },
        (error: unknown) => {
          if ((error as Error)?.message?.includes('Username already exists')) {
            UsersService.getUserWithUsername(userReq.username || '').subscribe(
              (existingUser: UserModel | null) => {
                if (existingUser) {
                  return applyRolesIfRequested(existingUser);
                }
                sails.log.error(error);
                return this.sendResp(req, res, {
                  status: 500,
                  displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
                  headers: this.getNoCacheHeaders(),
                });
              },
              (lookupError: unknown) => {
                sails.log.error(lookupError);
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
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
            headers: this.getNoCacheHeaders(),
          });
        }
      );

      return;
    }

    public updateUser(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const userReq: UserModel = validated.body as UserModel;

      UsersService.updateUserDetails(
        userReq.id || '',
        userReq.name || '',
        userReq.email || '',
        userReq.password || ''
      ).subscribe(
        (userResponse: unknown[]) => {
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
            const roles: string[] = (userReq.roles as unknown[])
              .map((role: unknown) =>
                _.isString(role) ? role : ((role as globalThis.Record<string, unknown>)?.name as string)
              )
              .filter((roleName: unknown) => !_.isEmpty(roleName));
            const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
            const roleIds = RolesService.getRoleIds(brand.roles, roles);
            UsersService.updateUserRoles((user as globalThis.Record<string, unknown>).id as string, roleIds).subscribe(
              (user: unknown) => {
                //TODO: Add roles to the response
                const u = user as globalThis.Record<string, unknown>;
                const userResponse = new CreateUserAPIResponse();
                userResponse.id = u.id as string;
                userResponse.username = u.username as string;
                userResponse.name = u.name as string;
                userResponse.email = u.email as string;
                userResponse.type = u.type as string;
                userResponse.lastLogin = u.lastLogin as Date | null;
                return this.apiRespond(req, res, userResponse, 201);
              },
              (error: unknown) => {
                sails.log.error('Failed to update user roles:');
                sails.log.error(error);
                //TODO: Find more appropriate status code
                const errorResponse = new APIErrorResponse((error as Error).message);
                this.sendResp(req, res, {
                  status: 500,
                  displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
                  headers: this.getNoCacheHeaders(),
                });
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

            return this.apiRespond(req, res, userResponse, 201);
          }
        },
        (error: unknown) => {
          sails.log.error(error);
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

    public generateAPIToken(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const userid = validated.query.id as string;

      if (userid) {
        const uuid: string = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe(
          (userResponse: UserModel) => {
            const user: UserModel = userResponse;
            const response = new UserAPITokenAPIResponse();
            response.id = userid;
            response.username = (user as globalThis.Record<string, unknown>).username as string;
            response.token = uuid;
            this.apiRespond(req, res, response);
          },
          (error: unknown) => {
            sails.log.error('Failed to set UUID:');
            sails.log.error(error);
            const errorResponse = new APIErrorResponse((error as Error).message);
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

    public revokeAPIToken(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const userid = validated.query.id as string;

      if (userid) {
        const uuid: string = '';
        UsersService.setUserKey(userid, uuid).subscribe(
          (userResponse: UserModel) => {
            const user: UserModel = userResponse;
            const response = new UserAPITokenAPIResponse();
            response.id = userid;
            response.username = (user as globalThis.Record<string, unknown>).username as string;
            response.token = uuid;
            this.apiRespond(req, res, response);
          },
          (error: unknown) => {
            sails.log.error('Failed to set UUID:');
            sails.log.error(error);
            const errorResponse = new APIErrorResponse((error as Error).message);
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
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const candidates = await firstValueFrom(
          UsersService.searchLinkCandidates(
            String(query.query ?? ''),
            String(brand.id),
            String(query.primaryUserId ?? '')
          )
        );
        return this.sendResp(req, res, {
          data: candidates,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error) {
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
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const links = await firstValueFrom(UsersService.getLinkedAccounts(String(params.id ?? '')));
        return this.sendResp(req, res, {
          data: links,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error) {
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
        const user = await firstValueFrom(UsersService.getUserWithId(userId));
        if (user == null) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: 'User not found' }],
            headers: this.getNoCacheHeaders(),
          });
        }

        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }

        const auditResponse = await UsersService.getUserAudit(userId);
        return this.sendResp(req, res, {
          data: {
            user: this.sanitizeUserForResponse(user as UserAttributes),
            records: auditResponse.records,
            summary: auditResponse.summary,
          },
          headers: this.getNoCacheHeaders(),
        });
      } catch (error) {
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
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
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

    public listSystemRoles(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      const response: ListAPIResponse<unknown> = new ListAPIResponse<unknown>();
      response.summary.numFound = brand.roles.length;
      response.records = brand.roles;

      return this.apiRespond(req, res, response);
    }

    public createSystemRole(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const body = validated.body as Record<string, unknown>;
      const roleName = (body.roleName as string | undefined) ?? (validated.query.roleName as string | undefined);
      sails.log.verbose('createSystemRole - roleName ' + roleName);
      if (!_.isUndefined(roleName)) {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        RolesService.createRoleWithBrand(brand, roleName);
        const response: APIActionResponse = new APIActionResponse(
          roleName + ' create call success',
          roleName + ' create call success'
        );
        return this.apiRespond(req, res, response);
      } else {
        const errorResponse = new APIErrorResponse(
          'Role name has to be passed in as url param or in the body { roleName: nameOfRole }'
        );
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
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
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
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
        await UsersService.disableUser(userId, String(req.user?.username ?? 'system'), String(brand.id));
        return this.apiRespond(req, res, { status: true, message: 'User disabled successfully' });
      } catch (err) {
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
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        if (!brand || !brand.id) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Branding context is missing or invalid' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        await UsersService.enableUser(userId, String(req.user?.username ?? 'system'), String(brand.id));
        return this.apiRespond(req, res, { status: true, message: 'User enabled successfully' });
      } catch (err) {
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
