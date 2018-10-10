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
import { Observable } from 'rxjs/Rx';
import * as uuidv4 from 'uuid/v4';
declare var BrandingService, RolesService, UsersService;

import controller = require('../core/CoreController.js');

export module Controllers {
  /**
   * Admin Controller
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Admin extends controller.Controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
        'rolesIndex',
        'usersIndex',
        'getBrandRoles',
        'getUsers',
        'updateUserRoles',
        'updateUserDetails',
        'addLocalUser',
        'generateUserKey',
        'revokeUserKey'
    ];

    /**
     **************************************************************************************************
     **************************************** Override default methods ********************************
     **************************************************************************************************
     */


    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public rolesIndex(req, res) {
      return this.sendView(req, res, 'admin/roles');
    }

    public usersIndex(req, res) {
      return this.sendView(req, res, 'admin/users');
    }

    public getUsers(req, res) {
      var pageData = {};
      var users = UsersService.getUsers().flatMap(users => {
        _.map(users, (user) => {
          if (_.isEmpty(_.find(sails.config.auth.hiddenUsers, (hideUser) => { return hideUser == user.name }))) {
            // not hidden, adding to view data...
            if (_.isEmpty(pageData.users)) {
              pageData.users = [];
            }
            pageData.users.push(user);
          }
        });
        return Observable.of(pageData);
      })
      .subscribe(pageData => {
        this.ajaxOk(req, res, null, pageData.users);
      });
    }

    public getBrandRoles(req, res) {
      // basic roles page: view all users and their roles
      var pageData = {};
      var brand = BrandingService.getBrand(req.session.branding);
      var roles = RolesService.getRolesWithBrand(brand).flatMap(roles => {
        _.map(roles, (role) => {
          if (_.isEmpty(_.find(sails.config.auth.hiddenRoles, (hideRole) => { return hideRole == role.name }))) {
            // not hidden, adding to view data...
            if (_.isEmpty(pageData.roles)) {
              pageData.roles = [];
            }
            pageData.roles.push(role);
          }
        });
        return Observable.of(pageData);
      })
      .subscribe(pageData => {
        this.ajaxOk(req, res, null, pageData.roles);
      });
    }

    public generateUserKey(req, res) {
      var userid = req.body.userid;
      if (userid) {
        var uuid = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe(user => {
          this.ajaxOk(req, res, uuid)
        }, error => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
      }
      else {
        return this.ajaxFail(req, res, "Please provide userid");
      }
    }

    public revokeUserKey(req, res) {
      var userid = req.body.userid;
      if (userid) {
        var uuid = '';
        UsersService.setUserKey(userid, uuid).subscribe(user => {
          this.ajaxOk(req, res, "UUID revoked successfully")
        }, error => {
          sails.log.error("Failed to revoke UUID:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
      }
      else {
        return this.ajaxFail(req, res, "Please provide userid");
      }
    }

    public addLocalUser(req, res) {
      var username = req.body.username;
      var details = req.body.details;
      if (details.name) { var name = details.name };
      if (details.password) { var password = details.password };
      if (username && name && password) {
        UsersService.addLocalUser(username, name, details.email, password).subscribe(user => {
          if (details.roles) {
            var roles = details.roles;
            var brand = BrandingService.getBrand(req.session.branding);
            var roleIds = RolesService.getRoleIds(brand.roles, roles);
            UsersService.updateUserRoles(user.id, roleIds).subscribe(user => {
              this.ajaxOk(req, res, "User created successfully");
            }, error => {
              sails.log.error("Failed to update user roles:");
              sails.log.error(error);
              this.ajaxFail(req, res, error.message);
            });
          } else {
            this.ajaxOk(req, res, "User created successfully");
          }
        }, error => {
          sails.log.error("Failed to create user:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
      } else {
        this.ajaxFail(req, res, "Please provide minimum of username, name and password");
      }
    }

    public updateUserDetails(req, res) {
      var userid = req.body.userid;
      var details = req.body.details;
      if (details.name) { var name = details.name };
      if (userid && name) {
        UsersService.updateUserDetails(userid, name, details.email, details.password).subscribe(user => {
          if (details.roles) {
            var roles = details.roles;
            var brand = BrandingService.getBrand(req.session.branding);
            var roleIds = RolesService.getRoleIds(brand.roles, roles);
            UsersService.updateUserRoles(userid, roleIds).subscribe(user => {
              this.ajaxOk(req, res, "User updated successfully");
            }, error => {
              sails.log.error("Failed to update user roles:");
              sails.log.error(error);
              this.ajaxFail(req, res, error.message);
            });
          } else {
            this.ajaxOk(req, res, "Save OK.");
          }
        }, error => {
          sails.log.error("Failed to update user details:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
      } else {
        this.ajaxFail(req, res, "Please provide minimum of userid and name");
      }
    }

    /**
    * Updates a user's roles. Will be accepting the userid and the array of role names. Used role names instead of ids to prevent cross-brand poisoning.
    */
    public updateUserRoles(req, res) {
      var newRoleNames = req.body.roles;
      var userid = req.body.userid;
      if (userid && newRoleNames) {
        // get the ids of the role names...
        var brand = BrandingService.getBrand(req.session.branding);
        var roleIds = RolesService.getRoleIds(brand.roles, newRoleNames)
        UsersService.updateUserRoles(userid, roleIds).subscribe(user => {
          this.ajaxOk(req, res, "Save OK.");
        }, error => {
          sails.log.error("Failed to update user roles:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
      } else {
        this.ajaxFail(req, res, "Please provide userid and/or roles names.");
      }
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Admin().exports();
