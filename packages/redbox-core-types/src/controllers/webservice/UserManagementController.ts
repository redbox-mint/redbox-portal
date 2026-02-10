import { APIErrorResponse, Controllers as controllers, CreateUserAPIResponse, ListAPIResponse, UserModel, UserAPITokenAPIResponse, APIActionResponse, BrandingModel } from '../../index';
import { UserAttributes } from '../../waterline-models/User';
import { v4 as uuidv4 } from 'uuid';


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
      'listSystemRoles',
      'createSystemRole'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public listUsers(req: Sails.Req, res: Sails.Res) {
      const that = this;
      const pageParam = req.param('page');
      const pageSizeParam = req.param('pageSize');
      const searchField = req.param('searchBy');
      const query = req.param('query');
      const queryObject: Record<string, unknown> = {};
      if (searchField != null && query != null) {
        queryObject[searchField] = query;
      }
      const page: number = pageParam != null ? parseInt(pageParam, 10) : 1;
      const pageSize: number = pageSizeParam != null ? parseInt(pageSizeParam, 10) : 10;
      const skip = (page - 1) * pageSize;

      User.count({
        where: queryObject
      }).exec(function (err: unknown, count: number) {
        const response: ListAPIResponse<UserAttributes> = new ListAPIResponse<UserAttributes>();
        response.summary.numFound = count;
        response.summary.page = page;

        if (count == 0) {
          response["records"] = [];
          return res.json(response);
        } else {
          User.find({
            where: queryObject,
            limit: pageSize,
            skip: skip
          }).exec(function (err: unknown, users: Sails.QueryResult[]) {

            const userRecords = users as unknown as UserAttributes[];
            _.each(userRecords, (user: UserAttributes) => {
              delete user["token"];
              delete user["password"]
            });
            response.records = userRecords;

            return that.apiRespond(req, res, response);
          });
        }
      });
    }

    public getUser(req: Sails.Req, res: Sails.Res) {
      const that = this;
      const searchField = req.param('searchBy');
      const query = req.param('query');
      const queryObject: Record<string, unknown> = {};
      queryObject[searchField] = query;
      User.findOne(queryObject).exec(function (err: unknown, user: UserAttributes | null) {
        if (err != null) {
          sails.log.error(err)
          return that.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: (err as Error)?.message ?? 'An error has occurred' }],
            headers: that.getNoCacheHeaders()
          });
        }
        if (user != null) {
          delete user["token"];
          delete user["password"]
          return that.apiRespond(req, res, user);
        }

        const errorResponse = new APIErrorResponse("No user found with given criteria", `Searchby: ${searchField} and Query: ${query}`);
        return that.sendResp(req, res, {
          status: 404,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: that.getNoCacheHeaders()
        });
      });
    }

    public createUser(req: Sails.Req, res: Sails.Res) {
      const userReq: UserModel = req.body;

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
          const roles: string[] = (userReq.roles as unknown[]).map((role: unknown) => _.isString(role) ? role : (role as globalThis.Record<string, unknown>)?.name as string).filter((roleName: unknown) => !_.isEmpty(roleName));
          const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string) ?? BrandingService.getDefault();
          const roleIds = brand?.roles ? RolesService.getRoleIds(brand.roles, roles) : [];
          if (_.isEmpty(roleIds)) {
            sails.log.warn('UserManagementController.createUser - No role ids resolved, skipping role assignment.');
            return respondWithUser(response);
          }
          UsersService.updateUserRoles(response.id, roleIds).subscribe((roleUser: UserModel) => {
            const user: UserModel = roleUser;
            sails.log.verbose(user);
            return respondWithUser(response);
          }, (error: unknown) => {
            sails.log.error("Failed to update user roles:");
            sails.log.error(error);
            return respondWithUser(response);
          });
          return;
        }

        return respondWithUser(response);
      };

      UsersService.addLocalUser(userReq.username || '', userReq.name || '', userReq.email || '', userReq.password || '').subscribe((userResponse: UserModel) => {
        const response: UserModel = userResponse;
        return applyRolesIfRequested(response);
      }, (error: unknown) => {
        if ((error as Error)?.message?.includes('Username already exists')) {
          UsersService.getUserWithUsername(userReq.username || '').subscribe((existingUser: UserModel | null) => {
            if (existingUser) {
              return applyRolesIfRequested(existingUser);
            }
            sails.log.error(error);
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
              headers: this.getNoCacheHeaders()
            });
          }, (lookupError: unknown) => {
            sails.log.error(lookupError);
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
              headers: this.getNoCacheHeaders()
            });
          });
          return;
        }

        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders()
        });
      });

      return;
    }


    public updateUser(req: Sails.Req, res: Sails.Res) {
      const userReq: UserModel = req.body;

      UsersService.updateUserDetails(userReq.id || '', userReq.name || '', userReq.email || '', userReq.password || '').subscribe((userResponse: unknown[]) => {
        const response: unknown[] = userResponse;
        let user: unknown = null;
        sails.log.verbose(user)

        if (!_.isEmpty(response) && _.isArray(response)) {
          for (const userItem of response) {
            if (!_.isEmpty(response) && _.isArray(userItem)) {
              user = userItem[0];
              break;
            }
          }
        }

        if (userReq.roles) {
          const roles: string[] = (userReq.roles as unknown[]).map((role: unknown) => _.isString(role) ? role : (role as globalThis.Record<string, unknown>)?.name as string).filter((roleName: unknown) => !_.isEmpty(roleName));
          const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
          const roleIds = RolesService.getRoleIds(brand.roles, roles);
          UsersService.updateUserRoles((user as globalThis.Record<string, unknown>).id as string, roleIds).subscribe((user: unknown) => {
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
          }, (error: unknown) => {
            sails.log.error("Failed to update user roles:");
            sails.log.error(error);
            //TODO: Find more appropriate status code
            const errorResponse = new APIErrorResponse((error as Error).message);
            this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
              headers: this.getNoCacheHeaders()
            });
          });
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

          return this.apiRespond(req, res, userResponse, 201)
        }
      }, (error: unknown) => {
        sails.log.error(error);
        if ((error as Error).message.indexOf('No such user with id:') != -1) {
          const errorResponse = new APIErrorResponse((error as Error).message);
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders()
          });
        } else {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: (error as Error)?.message ?? 'An error has occurred' }],
            headers: this.getNoCacheHeaders()
          });
        }
      });

      return;
    }

    public generateAPIToken(req: Sails.Req, res: Sails.Res) {
      const userid: string = req.param('id');

      if (userid) {
        const uuid: string = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe((userResponse: UserModel) => {
          const user: UserModel = userResponse;
          const response = new UserAPITokenAPIResponse();
          response.id = userid
          response.username = (user as globalThis.Record<string, unknown>).username as string
          response.token = uuid
          this.apiRespond(req, res, response)
        }, (error: unknown) => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          const errorResponse = new APIErrorResponse((error as Error).message);
          this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders()
          });
        });
      } else {
        const errorResponse = new APIErrorResponse("unable to get user ID.");
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
      return;
    }


    public revokeAPIToken(req: Sails.Req, res: Sails.Res) {

      const userid = req.param('id');

      if (userid) {
        const uuid: string = '';
        UsersService.setUserKey(userid, uuid).subscribe((userResponse: UserModel) => {
          const user: UserModel = userResponse;
          const response = new UserAPITokenAPIResponse();
          response.id = userid
          response.username = (user as globalThis.Record<string, unknown>).username as string
          response.token = uuid
          this.apiRespond(req, res, response)
        }, (error: unknown) => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          const errorResponse = new APIErrorResponse((error as Error).message);
          this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders()
          });
        });
      } else {
        const errorResponse = new APIErrorResponse("unable to get user ID.");
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
      return;
    }

    public listSystemRoles(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      const response: ListAPIResponse<unknown> = new ListAPIResponse<unknown>();
      response.summary.numFound = brand.roles.length;
      response.records = brand.roles;

      return this.apiRespond(req, res, response);
    }

    public createSystemRole(req: Sails.Req, res: Sails.Res) {
      let roleName;
      if (_.isUndefined(req.body.roleName)) {
        roleName = req.param('roleName');
      } else {
        roleName = req.body.roleName;
      }
      sails.log.verbose('createSystemRole - roleName ' + roleName);
      if (!_.isUndefined(roleName)) {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        RolesService.createRoleWithBrand(brand, roleName);
        const response: APIActionResponse = new APIActionResponse(roleName + ' create call success', roleName + ' create call success');
        return this.apiRespond(req, res, response);
      } else {
        const errorResponse = new APIErrorResponse("Role name has to be passed in as url param or in the body { roleName: nameOfRole }");
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
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
