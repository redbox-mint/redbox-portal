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
      'render',
      'listUsers',
      'getUser',
      'createUser'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public render(req, res) {
      return this.sendView(req, res, 'dashboard');
    }


    public listUsers(req, res) {
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
            return this.apiRespond(req, res, response);
          });
        }
      });
    }

    public getUser(req, res) {
      var searchField = req.param('searchBy');
      var query = req.param('query');
      var queryObject = {};
      queryObject[searchField] = query;
      User.findOne(queryObject).exec(function (err, user) {
        if (err != null) {
          return res.serverError(err);
        }
        if (user != null) {
          delete user["token"];
          return this.apiRespond(req, res, user);
        }

        return this.apiFail(req,res,404, new APIErrorResponse("No user found with given criteria", `Searchby: ${searchField} and Query: ${query}`))
      });
    }

    public createUser(req, res) {
      let userReq:User = req.body;
      
      UsersService.addLocalUser(userReq.username, userReq.name, userReq.email, userReq.password).subscribe(response => {
        let userResponse: CreateUserAPIResponse = new CreateUserAPIResponse();
        userResponse.username = response.username;
        userResponse.name = response.name;
        userResponse.email = response.email;
        userResponse.type = response.type;
        userResponse.lastLogin = response.lastLogin;
        return this.apiRespond(req,res,userResponse,201)
      }).error(error => {
        sails.log.error(error);
        return this.apiFail(req,res,500, new APIErrorResponse())
      });

    }



    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.UserManagement().exports();