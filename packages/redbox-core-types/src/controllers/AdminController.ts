import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model';
import { of } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';


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
    protected override _exportedMethods: any = [
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

    public rolesIndex(req: any, res: any) {
      return this.sendView(req, res, 'admin/roles');
    }

    public usersIndex(req: any, res: any) {
      return this.sendView(req, res, 'admin/users');
    }

    public supportAgreementIndex(req: any, res: any) {
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

    public getUsers(req: any, res: any) {
      var pageData: any = {};
      const brand = BrandingService.getBrand(req.session.branding);
      const brandId = _.get(brand, 'id') || brand || req.session.branding;
      (UsersService.getUsersForBrand(brand as any) as any).pipe(flatMap((users: any[]) => {
        _.map(users, (user: any) => {
          if (_.isEmpty(_.find(sails.config.auth.hiddenUsers, (hideUser: string) => { return hideUser == user.name }))) {
            // not hidden, adding to view data...
            if (_.isEmpty(pageData.users)) {
              pageData.users = [];
            }
            // need to set a dummy token string, to indicate if this user has a token set, but actual token won't be returned
            user.token = _.isEmpty(user.token) ? null : "user-has-token-but-is-suppressed";
            user.roles = brandId ? _.filter(user.roles, (role: any) => role.branding === brandId || role.branding?.id === brandId) : user.roles;
            //TODO: Look for config around what other secrets should be hidden from being returned to the client
            delete user.password;
            pageData.users.push(user);
          }
        });
        return of(pageData);
      }))
        .subscribe((pageData: any) => {
          this.sendResp(req, res, { data: pageData.users, headers: this.getNoCacheHeaders() });
        });
    }

    public getBrandRoles(req: any, res: any) {
      // basic roles page: view all users and their roles
      var pageData: any = {};
      var brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      RolesService.getRolesWithBrand(brand).pipe(flatMap((roles: any[]) => {
        _.map(roles, (role: any) => {
          if (_.isEmpty(_.find(sails.config.auth.hiddenRoles, (hideRole: string) => { return hideRole == role.name }))) {
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

    public generateUserKey(req: any, res: any) {
      var userid = req.body.userid;
      if (userid) {
        var uuid = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe((user: any) => {
          this.sendResp(req, res, { data: { status: true, message: uuid }, headers: this.getNoCacheHeaders() });
        }, (error: any) => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
        });
      }
      else {
        return this.sendResp(req, res, { data: { status: false, message: "Please provide userid" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    public revokeUserKey(req: any, res: any) {
      var userid = req.body.userid;
      if (userid) {
        var uuid = '';
        UsersService.setUserKey(userid, uuid).subscribe((user: any) => {
          this.sendResp(req, res, { data: { status: true, message: "UUID revoked successfully" }, headers: this.getNoCacheHeaders() });
        }, (error: any) => {
          sails.log.error("Failed to revoke UUID:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
        });
      }
      else {
        return this.sendResp(req, res, { data: { status: false, message: "Please provide userid" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    public addLocalUser(req: any, res: any) {
      var username = req.body.username;
      var details = req.body.details;
      let name: string | undefined;
      let password: string | undefined;
      if (details.name) { name = details.name };
      if (details.password) { password = details.password };
      if (username && name && password) {
        UsersService.addLocalUser(username, name, details.email, password).subscribe((user: any) => {
          if (details.roles) {
            var roles = details.roles;
            var brand: BrandingModel = BrandingService.getBrand(req.session.branding);
            var roleIds = RolesService.getRoleIds(brand.roles, roles);
            UsersService.updateUserRoles(user.id, roleIds).subscribe((user: any) => {
              this.sendResp(req, res, { data: { status: true, message: "User created successfully" }, headers: this.getNoCacheHeaders() });
            }, (error: any) => {
              sails.log.error("Failed to update user roles:");
              sails.log.error(error);
              this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
            });
          } else {
            this.sendResp(req, res, { data: { status: true, message: "User created successfully" }, headers: this.getNoCacheHeaders() });
          }
        }, (error: any) => {
          sails.log.error("Failed to create user:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        this.sendResp(req, res, { data: { status: false, message: "Please provide minimum of username, name and password" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    public updateUserDetails(req: any, res: any) {
      var userid = req.body.userid;
      var details = req.body.details;
      let name: string | undefined;
      if (details.name) { name = details.name };
      if (userid && name) {
        UsersService.updateUserDetails(userid, name, details.email, details.password).subscribe((user: any) => {
          if (details.roles) {
            var roles = details.roles;
            var brand: BrandingModel = BrandingService.getBrand(req.session.branding);
            var roleIds = RolesService.getRoleIds(brand.roles, roles);
            UsersService.updateUserRoles(userid, roleIds).subscribe((user: any) => {
              this.sendResp(req, res, { data: { status: true, message: "User updated successfully" }, headers: this.getNoCacheHeaders() });
            }, (error: any) => {
              sails.log.error("Failed to update user roles:");
              sails.log.error(error);
              this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
            });
          } else {
            this.sendResp(req, res, { data: { status: true, message: "Save OK." }, headers: this.getNoCacheHeaders() });
          }
        }, (error: any) => {
          sails.log.error("Failed to update user details:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        this.sendResp(req, res, { data: { status: false, message: "Please provide minimum of userid and name" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    /**
    * Updates a user's roles. Will be accepting the userid and the array of role names. Used role names instead of ids to prevent cross-brand poisoning.
    */
    public updateUserRoles(req: any, res: any) {
      var newRoleNames = req.body.roles;
      var userid = req.body.userid;
      if (userid && newRoleNames) {
        // get the ids of the role names...
        var brand: BrandingModel = BrandingService.getBrand(req.session.branding);
        var roleIds = RolesService.getRoleIds(brand.roles, newRoleNames)
        UsersService.updateUserRoles(userid, roleIds).subscribe((user: any) => {
          this.sendResp(req, res, { data: { status: true, message: "Save OK." }, headers: this.getNoCacheHeaders() });
        }, (error: any) => {
          sails.log.error("Failed to update user roles:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: error.message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        this.sendResp(req, res, { data: { status: false, message: "Please provide userid and/or roles names." }, headers: this.getNoCacheHeaders() });
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
