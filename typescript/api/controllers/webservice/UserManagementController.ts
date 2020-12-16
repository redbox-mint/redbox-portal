// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

//<reference path='./../../typings/loader.d.ts'/>
declare var module;
declare var sails;

declare var BrandingService;
declare var RolesService;
declare var DashboardService;
declare var UsersService;
declare var User;
declare var _;
/**
 * Package that contains all Controllers.
 */
import controller = require('../../core/CoreController.js');
import {
  ListAPIResponse
} from '../../core/model/ListAPIResponse';
import {
  APIErrorResponse
} from '../../core/model/APIErrorResponse';
import {
  UserAPITokenAPIResponse
} from '../../core/model/api/UserAPITokenAPIResponse';
import {
  CreateUserAPIResponse
} from '../../core/model/api/CreateUserAPIResponse';
import * as uuidv4 from 'uuid/v4';

export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class UserManagement extends controller.Controllers.Core.Controller {

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
      'deleteUser'
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
      }).exec(function (err, count) {
        let response: ListAPIResponse < any > = new ListAPIResponse < any > ();
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
          }).exec(function (err, users) {

            _.each(users, user => {
              delete user["token"];
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
      User.findOne(queryObject).exec(function (err, user) {
        if (err != null) {
          sails.log.error(err)
          return that.apiFail(req, res, 500)
        }
        if (user != null) {
          delete user["token"];
          return that.apiRespond(req, res, user);
        }

        return that.apiFail(req, res, 404, new APIErrorResponse("No user found with given criteria", `Searchby: ${searchField} and Query: ${query}`))
      });
    }

    public createUser(req, res) {
      let userReq: User = req.body;

      UsersService.addLocalUser(userReq.username, userReq.name, userReq.email, userReq.password).subscribe(response => {

        if (userReq.roles) {
          let roles = userReq.roles;
          let brand = BrandingService.getBrand(req.session.branding);
          let roleIds = RolesService.getRoleIds(brand.roles, roles);
          UsersService.updateUserRoles(response.id, roleIds).subscribe(user => {
            sails.log.error(user)
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
            this.apiFail(req, res, 500, new APIErrorResponse(error.message));
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
        return this.apiFail(req, res, 500)
      });

    }


    public updateUser(req, res) {
      let userReq: User = req.body;

      UsersService.updateUserDetails(userReq.id, userReq.name, userReq.email, userReq.password).subscribe(response => {
        
        let user = response;
        sails.log.error(user)
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
          let brand = BrandingService.getBrand(req.session.branding);
          let roleIds = RolesService.getRoleIds(brand.roles, roles);
          UsersService.updateUserRoles(response.id, roleIds).subscribe(user => {
            //TODO: Add roles to the response            
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
            this.apiFail(req, res, 500, new APIErrorResponse(error.message));
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
          return this.apiFail(req, res, 404, new APIErrorResponse(error.message))
        } else {
          return this.apiFail(req, res, 500)
        }
      });

    }

    public generateAPIToken(req, res) {
      let userid = req.param('id');

      if (userid) {
        var uuid = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe(user => {
          let response = new UserAPITokenAPIResponse();
          response.id = userid
          response.username = user.username
          response.token = uuid
          this.apiRespond(req, res, response)
        }, error => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          this.apiFail(req, res, 500, new APIErrorResponse(error.message));
        });
      } else {
        return this.apiFail(req, res, 400, new APIErrorResponse("unable to get user ID."));
      }
    }


    public revokeAPIToken(req, res) {

      let userid = req.param('id');

      if (userid) {
        var uuid = null;
        UsersService.setUserKey(userid, uuid).subscribe(user => {
          let response = new UserAPITokenAPIResponse();
          response.id = userid
          response.username = user.username
          response.token = uuid
          this.apiRespond(req, res, response)
        }, error => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          this.apiFail(req, res, 500, new APIErrorResponse(error.message));
        });
      } else {
        return this.apiFail(req, res, 400, new APIErrorResponse("unable to get user ID."));
      }
    }

    public listSystemRoles(req, res) {
      let brand = BrandingService.getBrand(req.session.branding);
      return this.apiRespond(req,res,brand.roles);
    }


    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.UserManagement().exports();