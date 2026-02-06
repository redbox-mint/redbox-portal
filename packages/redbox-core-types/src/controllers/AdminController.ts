import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model';
import { of } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

declare var module: any;
declare var sails: any;
declare var _: any;
declare var BrandingService: any, RolesService: any, UsersService: any;

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
     * **************************************************************************************************
     * *************************************** Override default methods ********************************
     * **************************************************************************************************
     */


    /**
     * **************************************************************************************************
     * *************************************** Add custom methods **************************************
     * **************************************************************************************************
     */

    public rolesIndex(req, res) {
      return this.sendView(req, res, 'admin/roles');
    }

    public usersIndex(req, res) {
      return this.sendView(req, res, 'admin/users');
    }

    public supportAgreementIndex(req, res) {
      var brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      var currentYear = new Date().getFullYear();
      var selectedYear = parseInt(req.query.year) || currentYear;
      
      // Get support agreement information from the new structure
      // TODO: Remove the any cast once this is merged to develop and it's using the right core package version
      var supportInfo = (brand as any).supportAgreementInformation || {};
      var yearData = supportInfo[selectedYear] || { agreedSupportDays: 0, usedSupportDays: 0 };
      
      // If no data exists for the selected year but legacy data exists, use legacy for current year
      if (!supportInfo[selectedYear] && selectedYear === currentYear) {
        yearData = {
          agreedSupportDays: (brand as any).agreedSupportDays || 0,
          usedSupportDays: (brand as any).usedSupportDays || 0
        };
      }
      
      // Get all available years from support agreement information
      var availableYears = Object.keys(supportInfo).map(y => parseInt(y)).filter(y => !isNaN(y));
      if (availableYears.length === 0 || availableYears.indexOf(currentYear) === -1) {
        availableYears.push(currentYear);
      }
      availableYears.sort((a, b) => b - a); // Sort descending (most recent first)
      
      return this.sendView(req, res, 'admin/supportAgreement', {
        agreedSupportDays: yearData.agreedSupportDays,
        usedSupportDays: yearData.usedSupportDays,
        selectedYear: selectedYear,
        availableYears: availableYears,
        currentYear: currentYear
      });
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
          this.sendResp(req, res, { data: pageData.users, headers: this.getNoCacheHeaders() });
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
          this.sendResp(req, res, { data: pageData.roles, headers: this.getNoCacheHeaders() });
        });
    }

    public generateUserKey(req, res) {
      var userid = req.body.userid;
      if (userid) {
        var uuid = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe(user => {
          this.sendResp(req, res, { data: { status: true, message: uuid }, headers: this.getNoCacheHeaders() });
        }, error => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
        });
      }
      else {
        return this.sendResp(req, res, { data: { status: false, message: "Please provide userid" }, headers: this.getNoCacheHeaders() });
      }
    }

    public revokeUserKey(req, res) {
      var userid = req.body.userid;
      if (userid) {
        var uuid = '';
        UsersService.setUserKey(userid, uuid).subscribe(user => {
          this.sendResp(req, res, { data: { status: true, message: "UUID revoked successfully" }, headers: this.getNoCacheHeaders() });
        }, error => {
          sails.log.error("Failed to revoke UUID:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
        });
      }
      else {
        return this.sendResp(req, res, { data: { status: false, message: "Please provide userid" }, headers: this.getNoCacheHeaders() });
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
              this.sendResp(req, res, { data: { status: true, message: "User created successfully" }, headers: this.getNoCacheHeaders() });
            }, error => {
              sails.log.error("Failed to update user roles:");
              sails.log.error(error);
              this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
            });
          } else {
            this.sendResp(req, res, { data: { status: true, message: "User created successfully" }, headers: this.getNoCacheHeaders() });
          }
        }, error => {
          sails.log.error("Failed to create user:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        this.sendResp(req, res, { data: { status: false, message: "Please provide minimum of username, name and password" }, headers: this.getNoCacheHeaders() });
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
              this.sendResp(req, res, { data: { status: true, message: "User updated successfully" }, headers: this.getNoCacheHeaders() });
            }, error => {
              sails.log.error("Failed to update user roles:");
              sails.log.error(error);
              this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
            });
          } else {
            this.sendResp(req, res, { data: { status: true, message: "Save OK." }, headers: this.getNoCacheHeaders() });
          }
        }, error => {
          sails.log.error("Failed to update user details:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        this.sendResp(req, res, { data: { status: false, message: "Please provide minimum of userid and name" }, headers: this.getNoCacheHeaders() });
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
          this.sendResp(req, res, { data: { status: true, message: "Save OK." }, headers: this.getNoCacheHeaders() });
        }, error => {
          sails.log.error("Failed to update user roles:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        this.sendResp(req, res, { data: { status: false, message: "Please provide userid and/or roles names." }, headers: this.getNoCacheHeaders() });
      }
    }

    /**
     * **************************************************************************************************
     * *************************************** Override magic methods **********************************
     * **************************************************************************************************
     */
  }
}
