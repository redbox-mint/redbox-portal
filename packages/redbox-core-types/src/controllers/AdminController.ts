import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model';
import { of } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';


export namespace Controllers {
  /**
   * Admin Controller
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Admin extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
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

    public rolesIndex(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'admin/roles');
    }

    public usersIndex(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'admin/users');
    }

    public supportAgreementIndex(req: Sails.Req, res: Sails.Res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding as string);
      const currentYear = new Date().getFullYear();
      const selectedYear = parseInt(req.query.year as string) || currentYear;
      
      // Get support agreement information from the new structure
      // TODO: Remove the any cast once this is merged to develop and it's using the right core package version
      const supportInfo = ((brand as unknown as globalThis.Record<string, unknown>).supportAgreementInformation || {}) as globalThis.Record<string, unknown>;
      let yearData: globalThis.Record<string, unknown> = (supportInfo[selectedYear] || { agreedSupportDays: 0, usedSupportDays: 0 }) as globalThis.Record<string, unknown>;
      
      // If no data exists for the selected year but legacy data exists, use legacy for current year
      if (!supportInfo[selectedYear] && selectedYear === currentYear) {
        yearData = {
          agreedSupportDays: (brand as unknown as globalThis.Record<string, unknown>).agreedSupportDays || 0,
          usedSupportDays: (brand as unknown as globalThis.Record<string, unknown>).usedSupportDays || 0
        };
      }
      
      // Get all available years from support agreement information
      const availableYears = Object.keys(supportInfo).map(y => parseInt(y)).filter(y => !isNaN(y));
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

    public getUsers(req: Sails.Req, res: Sails.Res) {
      const pageData: globalThis.Record<string, unknown> = {};
      const brand = BrandingService.getBrand(req.session.branding as string);
      const brandId = _.get(brand, 'id') || brand || req.session.branding;
      UsersService.getUsersForBrand(brand).pipe(flatMap((users: globalThis.Record<string, unknown>[]) => {
        _.map(users, (user: globalThis.Record<string, unknown>) => {
          if (_.isEmpty(_.find(sails.config.auth.hiddenUsers, (hideUser: string) => { return hideUser == user.name }))) {
            // not hidden, adding to view data...
            if (_.isEmpty(pageData.users)) {
              pageData.users = [];
            }
            // need to set a dummy token string, to indicate if this user has a token set, but actual token won't be returned
            user.token = _.isEmpty(user.token) ? null : "user-has-token-but-is-suppressed";
            user.roles = brandId ? _.filter(user.roles as globalThis.Record<string, unknown>[], (role: globalThis.Record<string, unknown>) => role.branding === brandId || (role.branding as globalThis.Record<string, unknown>)?.id === brandId) : user.roles;
            //TODO: Look for config around what other secrets should be hidden from being returned to the client
            delete user.password;
            (pageData.users as unknown[]).push(user);
          }
        });
        return of(pageData);
      }))
        .subscribe((pageData: globalThis.Record<string, unknown>) => {
          this.sendResp(req, res, { data: pageData.users, headers: this.getNoCacheHeaders() });
        });
    }

    public getBrandRoles(req: Sails.Req, res: Sails.Res) {
      // basic roles page: view all users and their roles
      const pageData: globalThis.Record<string, unknown> = {};
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      RolesService.getRolesWithBrand(brand).pipe(flatMap((roles) => {
        _.map(roles, (role) => {
          if (_.isEmpty(_.find(sails.config.auth.hiddenRoles, (hideRole: string) => { return hideRole == role.name }))) {
            // not hidden, adding to view data...
            if (_.isEmpty(pageData.roles)) {
              pageData.roles = [];
            }
            (pageData.roles as unknown[]).push(role);
          }
        });
        return of(pageData);
      }))
        .subscribe(pageData => {
          this.sendResp(req, res, { data: pageData.roles, headers: this.getNoCacheHeaders() });
        });
    }

    public generateUserKey(req: Sails.Req, res: Sails.Res) {
      const userid = req.body.userid;
      if (userid) {
        const uuid = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe((user: unknown) => {
          this.sendResp(req, res, { data: { status: true, message: uuid }, headers: this.getNoCacheHeaders() });
        }, (error: unknown) => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
        });
      }
      else {
        return this.sendResp(req, res, { data: { status: false, message: "Please provide userid" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    public revokeUserKey(req: Sails.Req, res: Sails.Res) {
      const userid = req.body.userid;
      if (userid) {
        const uuid = '';
        UsersService.setUserKey(userid, uuid).subscribe((user: unknown) => {
          this.sendResp(req, res, { data: { status: true, message: "UUID revoked successfully" }, headers: this.getNoCacheHeaders() });
        }, (error: unknown) => {
          sails.log.error("Failed to revoke UUID:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
        });
      }
      else {
        return this.sendResp(req, res, { data: { status: false, message: "Please provide userid" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    public addLocalUser(req: Sails.Req, res: Sails.Res) {
      const username = req.body.username;
      const details = req.body.details;
      let name: string | undefined;
      let password: string | undefined;
      if (details.name) { name = details.name };
      if (details.password) { password = details.password };
      if (username && name && password) {
        UsersService.addLocalUser(username, name, details.email, password).subscribe((user: globalThis.Record<string, unknown>) => {
          if (details.roles) {
            const roles = details.roles;
            const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
            const roleIds = RolesService.getRoleIds(brand.roles, roles);
            UsersService.updateUserRoles(user.id as string, roleIds).subscribe((user: unknown) => {
              this.sendResp(req, res, { data: { status: true, message: "User created successfully" }, headers: this.getNoCacheHeaders() });
            }, (error: unknown) => {
              sails.log.error("Failed to update user roles:");
              sails.log.error(error);
              this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
            });
          } else {
            this.sendResp(req, res, { data: { status: true, message: "User created successfully" }, headers: this.getNoCacheHeaders() });
          }
        }, (error: unknown) => {
          sails.log.error("Failed to create user:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        this.sendResp(req, res, { data: { status: false, message: "Please provide minimum of username, name and password" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    public updateUserDetails(req: Sails.Req, res: Sails.Res) {
      const userid = req.body.userid;
      const details = req.body.details;
      let name: string | undefined;
      if (details.name) { name = details.name };
      if (userid && name) {
        UsersService.updateUserDetails(userid, name, details.email, details.password).subscribe((user: unknown) => {
          if (details.roles) {
            const roles = details.roles;
            const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
            const roleIds = RolesService.getRoleIds(brand.roles, roles);
            UsersService.updateUserRoles(userid, roleIds).subscribe((user: unknown) => {
              this.sendResp(req, res, { data: { status: true, message: "User updated successfully" }, headers: this.getNoCacheHeaders() });
            }, (error: unknown) => {
              sails.log.error("Failed to update user roles:");
              sails.log.error(error);
              this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
            });
          } else {
            this.sendResp(req, res, { data: { status: true, message: "Save OK." }, headers: this.getNoCacheHeaders() });
          }
        }, (error: unknown) => {
          sails.log.error("Failed to update user details:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        this.sendResp(req, res, { data: { status: false, message: "Please provide minimum of userid and name" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    /**
    * Updates a user's roles. Will be accepting the userid and the array of role names. Used role names instead of ids to prevent cross-brand poisoning.
    */
    public updateUserRoles(req: Sails.Req, res: Sails.Res) {
      const newRoleNames = req.body.roles;
      const userid = req.body.userid;
      if (userid && newRoleNames) {
        // get the ids of the role names...
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        const roleIds = RolesService.getRoleIds(brand.roles, newRoleNames)
        UsersService.updateUserRoles(userid, roleIds).subscribe((user: unknown) => {
          this.sendResp(req, res, { data: { status: true, message: "Save OK." }, headers: this.getNoCacheHeaders() });
        }, (error: unknown) => {
          sails.log.error("Failed to update user roles:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
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
