import { APIErrorResponse, Controllers as controllers, CreateUserAPIResponse, ListAPIResponse, UserModel, UserAPITokenAPIResponse, APIActionResponse, BrandingModel } from '../../index';
import { v4 as uuidv4 } from 'uuid';


export module Controllers {
  /**
   * Responsible for all things related to user management
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class UserManagement extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: any = [
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

    public listUsers(req: any, res: any) {
      let that = this;
      var page = req.param('page');
      var pageSize = req.param('pageSize');
      var searchField = req.param('searchBy');
      var query = req.param('query');
      const queryObject: Record<string, unknown> = {};
      if (searchField != null && query != null) {
        queryObject[searchField] = query;
      }
      if (page == null) {
        page = 1;
      }

      if (pageSize == null) {
        pageSize = 10;
      }
      let skip = (page - 1) * pageSize;

      User.count({
        where: queryObject
      }).exec(function (err: any, count: number) {
        let response: ListAPIResponse<any> = new ListAPIResponse<any>();
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
          }).exec(function (err: any, users: UnsafeAny[]) {

            _.each(users, (user: any) => {
              delete user["token"];
              delete user["password"]
            });
            response.records = users;

            return that.apiRespond(req, res, response);
          });
        }
      });
    }

    public getUser(req: any, res: any) {
      let that = this;
      var searchField = req.param('searchBy');
      var query = req.param('query');
      const queryObject: Record<string, unknown> = {};
      queryObject[searchField] = query;
      User.findOne(queryObject).exec(function (err: any, user: UnsafeAny) {
        if (err != null) {
          sails.log.error(err)
          return that.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: err?.message ?? 'An error has occurred' }],
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

    public createUser(req: any, res: any) {
      let userReq: UserModel = req.body;

      UsersService.addLocalUser(userReq.username || '', userReq.name || '', userReq.email || '', userReq.password || '').subscribe((userResponse: UserModel) => {
        const response: UserModel = userResponse;
        if (userReq.roles) {
          const roles: string[] = (userReq.roles as any[]).map((role: any) => _.isString(role) ? role : role?.name).filter((roleName: any) => !_.isEmpty(roleName));
          let brand: BrandingModel = BrandingService.getBrand(req.session.branding);
          let roleIds = RolesService.getRoleIds(brand.roles, roles);
          UsersService.updateUserRoles(response.id, roleIds).subscribe((roleUser: UserModel) => {
            let user: UserModel = roleUser;
            sails.log.verbose(user);
            let userResponse = new CreateUserAPIResponse();
            userResponse.id = response.id;
            userResponse.username = response.username;
            userResponse.name = response.name;
            userResponse.email = response.email;
            userResponse.type = response.type;
            userResponse.lastLogin = response.lastLogin;
            return this.apiRespond(req, res, userResponse, 201);
          }, (error: any) => {
            sails.log.error("Failed to update user roles:");
            sails.log.error(error);
            //TODO: Find more appropriate status code
            const errorResponse = new APIErrorResponse(error.message);
            this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
              headers: this.getNoCacheHeaders()
            });
          });
          return;
        } else {
          let userResponse = new CreateUserAPIResponse();
          userResponse.id = response.id;
          userResponse.username = response.username;
          userResponse.name = response.name;
          userResponse.email = response.email;
          userResponse.type = response.type;
          userResponse.lastLogin = response.lastLogin;
          return this.apiRespond(req, res, userResponse, 201);
        }
      }, (error: any) => {
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: error?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders()
        });
      });

      return;
    }


    public updateUser(req: any, res: any) {
      let userReq: UserModel = req.body;

      UsersService.updateUserDetails(userReq.id || '', userReq.name || '', userReq.email || '', userReq.password || '').subscribe((userResponse: any[]) => {
        let response: any[] = userResponse;
        let user: any = null;
        sails.log.verbose(user)

        if (!_.isEmpty(response) && _.isArray(response)) {
          for (let userItem of response) {
            if (!_.isEmpty(response) && _.isArray(userItem)) {
              user = userItem[0];
              break;
            }
          }
        }

        if (userReq.roles) {
          const roles: string[] = (userReq.roles as any[]).map((role: any) => _.isString(role) ? role : role?.name).filter((roleName: any) => !_.isEmpty(roleName));
          let brand: BrandingModel = BrandingService.getBrand(req.session.branding);
          let roleIds = RolesService.getRoleIds(brand.roles, roles);
          UsersService.updateUserRoles(user.id, roleIds).subscribe((user: any) => {
            //TODO: Add roles to the response            
            let userResponse = new CreateUserAPIResponse();
            userResponse.id = user.id;
            userResponse.username = user.username;
            userResponse.name = user.name;
            userResponse.email = user.email;
            userResponse.type = user.type;
            userResponse.lastLogin = user.lastLogin;
            return this.apiRespond(req, res, userResponse, 201);
          }, (error: any) => {
            sails.log.error("Failed to update user roles:");
            sails.log.error(error);
            //TODO: Find more appropriate status code
            const errorResponse = new APIErrorResponse(error.message);
            this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
              headers: this.getNoCacheHeaders()
            });
          });
          return;
        } else {
          let userResponse: CreateUserAPIResponse = new CreateUserAPIResponse();
          userResponse.id = user.id;
          userResponse.username = user.username;
          userResponse.name = user.name;
          userResponse.email = user.email;
          userResponse.type = user.type;
          userResponse.lastLogin = user.lastLogin;

          return this.apiRespond(req, res, userResponse, 201)
        }
      }, (error: any) => {
        sails.log.error(error);
        if (error.message.indexOf('No such user with id:') != -1) {
          const errorResponse = new APIErrorResponse(error.message);
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders()
          });
        } else {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: error?.message ?? 'An error has occurred' }],
            headers: this.getNoCacheHeaders()
          });
        }
      });

      return;
    }

    public generateAPIToken(req: any, res: any) {
      let userid: string = req.param('id');

      if (userid) {
        let uuid: string = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe((userResponse: UserModel) => {
          let user: UserModel = userResponse;
          let response = new UserAPITokenAPIResponse();
          response.id = userid
          response.username = user.username
          response.token = uuid
          this.apiRespond(req, res, response)
        }, (error: any) => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          const errorResponse = new APIErrorResponse(error.message);
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


    public revokeAPIToken(req: any, res: any) {

      let userid = req.param('id');

      if (userid) {
        const uuid: string = '';
        UsersService.setUserKey(userid, uuid).subscribe((userResponse: UserModel) => {
          let user: UserModel = userResponse;
          let response = new UserAPITokenAPIResponse();
          response.id = userid
          response.username = user.username
          response.token = uuid
          this.apiRespond(req, res, response)
        }, (error: any) => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          const errorResponse = new APIErrorResponse(error.message);
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

    public listSystemRoles(req: any, res: any) {
      let brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      let response: ListAPIResponse<any> = new ListAPIResponse<any>();
      response.summary.numFound = brand.roles.length;
      response.records = brand.roles;

      return this.apiRespond(req, res, response);
    }

    public createSystemRole(req: any, res: any) {
      let roleName;
      if (_.isUndefined(req.body.roleName)) {
        roleName = req.param('roleName');
      } else {
        roleName = req.body.roleName;
      }
      sails.log.verbose('createSystemRole - roleName ' + roleName);
      if (!_.isUndefined(roleName)) {
        let brand: BrandingModel = BrandingService.getBrand(req.session.branding);
        RolesService.createRoleWithBrand(brand, roleName);
        let response: APIActionResponse = new APIActionResponse(roleName + ' create call success', roleName + ' create call success');
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
