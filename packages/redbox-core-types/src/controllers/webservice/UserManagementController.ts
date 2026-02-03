import { APIErrorResponse, Controllers as controllers, CreateUserAPIResponse, ListAPIResponse, UserModel, UserAPITokenAPIResponse, APIActionResponse, BrandingModel } from '../../index';
import { v4 as uuidv4 } from 'uuid';

declare var sails: any;
declare var BrandingService: any;
declare var RolesService: any;
declare var UsersService: any;
declare var User: any;
declare var _: any;

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
    protected _exportedMethods: any = [
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

    public listUsers(req, res) {
      let that = this;
      var page = req.param('page');
      var pageSize = req.param('pageSize');
      var searchField = req.param('searchBy');
      var query = req.param('query');
      var queryObject = {};
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
      }).exec(function (err, count: number) {
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
          }).exec(function (err, users: UserModel[]) {

            _.each(users, user => {
              delete user["token"];
              delete user["password"]
            });
            response.records = users;

            return that.apiRespond(req, res, response);
          });
        }
      });
    }

    public getUser(req, res) {
      let that = this;
      var searchField = req.param('searchBy');
      var query = req.param('query');
      var queryObject = {};
      queryObject[searchField] = query;
      User.findOne(queryObject).exec(function (err, user: UserModel) {
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

    public createUser(req, res) {
      let userReq: UserModel = req.body;

      UsersService.addLocalUser(userReq.username, userReq.name, userReq.email, userReq.password).subscribe(userResponse => {
        const response: UserModel = userResponse;
        if (userReq.roles) {
          let roles = userReq.roles;
          let brand: BrandingModel = BrandingService.getBrand(req.session.branding);
          let roleIds = RolesService.getRoleIds(brand.roles, roles);
          UsersService.updateUserRoles(response.id, roleIds).subscribe(roleUser => {
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
          }, error => {
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
      }, error => {
        sails.log.error(error);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: error?.message ?? 'An error has occurred' }],
          headers: this.getNoCacheHeaders()
        });
      });

    }


    public updateUser(req, res) {
      let userReq: UserModel = req.body;

      UsersService.updateUserDetails(userReq.id, userReq.name, userReq.email, userReq.password).subscribe(userResponse => {
        let response: UserModel[] = userResponse;
        let user = null;
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
          let roles = userReq.roles;
          let brand: BrandingModel = BrandingService.getBrand(req.session.branding);
          let roleIds = RolesService.getRoleIds(brand.roles, roles);
          UsersService.updateUserRoles(user.id, roleIds).subscribe(user => {
            //TODO: Add roles to the response            
            let userResponse = new CreateUserAPIResponse();
            userResponse.id = user.id;
            userResponse.username = user.username;
            userResponse.name = user.name;
            userResponse.email = user.email;
            userResponse.type = user.type;
            userResponse.lastLogin = user.lastLogin;
            return this.apiRespond(req, res, userResponse, 201);
          }, error => {
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
      }, error => {
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

    }

    public generateAPIToken(req, res) {
      let userid: string = req.param('id');

      if (userid) {
        let uuid: string = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe(userResponse => {
          let user: UserModel = userResponse;
          let response = new UserAPITokenAPIResponse();
          response.id = userid
          response.username = user.username
          response.token = uuid
          this.apiRespond(req, res, response)
        }, error => {
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
    }


    public revokeAPIToken(req, res) {

      let userid = req.param('id');

      if (userid) {
        var uuid = null;
        UsersService.setUserKey(userid, uuid).subscribe(userResponse => {
          let user: UserModel = userResponse;
          let response = new UserAPITokenAPIResponse();
          response.id = userid
          response.username = user.username
          response.token = uuid
          this.apiRespond(req, res, response)
        }, error => {
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
    }

    public listSystemRoles(req, res) {
      let brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      let response: ListAPIResponse<any> = new ListAPIResponse<any>();
      response.summary.numFound = brand.roles.length;
      response.records = brand.roles;

      return this.apiRespond(req, res, response);
    }

    public createSystemRole(req, res) {
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
