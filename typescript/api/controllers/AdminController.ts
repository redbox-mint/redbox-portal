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


declare var module;
declare var sails;
declare var _;
import { of } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';

import { v4 as uuidv4 } from 'uuid';
declare var BrandingService, RolesService, UsersService, SupportAgreementService;

import { Controllers as controllers, BrandingModel } from '@researchdatabox/redbox-core-types';
import { firstValueFrom } from 'rxjs';

export module Controllers {
  /**
   * Admin Controller
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Admin extends controllers.Core.Controller {

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
        'revokeUserKey',
        'supportAgreementIndex'
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

    public async supportAgreementIndex(req, res) {
      try {
        const brandName = req.session.branding;
        const brand: BrandingModel = BrandingService.getBrand(brandName);
        const currentYear = new Date().getFullYear();
        const selectedYear = parseInt(req.query.year) || currentYear;

        // Fetch available years
        let availableYears: number[] = await firstValueFrom(SupportAgreementService.getAvailableYears(brand.id));
        if (!availableYears || availableYears.length === 0) {
          availableYears = [currentYear];
        } else if (!availableYears.includes(currentYear)) {
          // Ensure current year is always an option if not present
          availableYears.push(currentYear);
          availableYears.sort((a: number, b: number) => b - a);
        }

        // Fetch agreement for the selected year
        let agreement = await firstValueFrom(SupportAgreementService.getByBrandAndYear(brand.id, selectedYear));

        // If no agreement exists for the selected year, provide defaults
        if (!agreement) {
          agreement = {
            year: selectedYear,
            agreedSupportDays: 0,
            usedSupportDays: 0,
            releaseNotes: [],
            timesheetSummary: []
          };
        }

        return this.sendView(req, res, 'admin/supportAgreement', {
          selectedYear: selectedYear,
          availableYears: availableYears,
          agreement: agreement
        });
      } catch (error) {
        sails.log.error('AdminController.supportAgreementIndex error:', error);
        return this.sendView(req, res, '500', { error: error });
      }
    }

    public getUsers(req, res) {
      var pageData: any = {};
      const brand = BrandingService.getBrand(req.session.branding);
      const brandId = _.get(brand, 'id') || brand || req.session.branding;
      var users = UsersService.getUsersForBrand(brand).pipe(flatMap(users => {
        _.map(users, (user) => {
          if (_.isEmpty(_.find(sails.config.auth.hiddenUsers, (hideUser) => { return hideUser == user.name }))) {
            // not hidden, adding to view data...
            if (_.isEmpty(pageData.users)) {
              pageData.users = [];
            }
            // need to set a dummy token string, to indicate if this user has a token set, but actual token won't be returned
            user.token = _.isEmpty(user.token) ? null : "user-has-token-but-is-suppressed";
            user.roles = brandId ? _.filter(user.roles, (role) => role.branding === brandId) : user.roles;
            //TODO: Look for config around what other secrets should be hidden from being returned to the client
            delete user.password;
            pageData.users.push(user);
          }
        });
        return of(pageData);
      }))
        .subscribe(pageData => {
          this.ajaxOk(req, res, null, pageData.users);
        });
    }

    public getBrandRoles(req, res) {
      // basic roles page: view all users and their roles
      var pageData: any = {};
      var brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      var roles = RolesService.getRolesWithBrand(brand).pipe(flatMap(roles => {
        _.map(roles, (role) => {
          if (_.isEmpty(_.find(sails.config.auth.hiddenRoles, (hideRole) => { return hideRole == role.name }))) {
            // not hidden, adding to view data...
            if (_.isEmpty(pageData.roles)) {
              pageData.roles = [];
            }
            pageData.roles.push(role);
          }
        });
        return of(pageData);
      }))
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
            var brand: BrandingModel = BrandingService.getBrand(req.session.branding);
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
            var brand: BrandingModel = BrandingService.getBrand(req.session.branding);
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
        var brand: BrandingModel = BrandingService.getBrand(req.session.branding);
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
