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
declare var _;
declare var BrandingService, UsersService, ConfigService;
import * as uuidv4 from 'uuid/v4';

import { Controllers as controllers, RequestDetails} from '@researchdatabox/redbox-core-types';


export module Controllers {
  /**
   *  User-related features...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class User extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'login',
      'logout',
      'info',
      'openidConnectLogin',
      'aafLogin',
      'localLogin',
      'redirLogin',
      'redirPostLogin',
      'getPostLoginUrl',
      'respond',
      'update',
      'profile',
      'generateUserKey',
      'revokeUserKey',
      'find',
      'beginOidc'
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

    /**
     * Login Handler
     *
     * @param req
     * @param res
     */
    public login(req, res) {
      this.sendView(req, res, sails.config.auth.loginPath);
    }

    public profile(req, res) {
      this.sendView(req, res, "user/profile");
    }

    public redirLogin(req, res) {
      if (req.path.indexOf(sails.config.auth.loginPath) == -1) {
        req.session.redirUrl = req.url;
      }
      return res.redirect(`${BrandingService.getBrandAndPortalPath(req)}/${sails.config.auth.loginPath}`);
    }

    public redirPostLogin(req, res) {
      res.redirect(this.getPostLoginUrl(req, res));
    }

    protected getPostLoginUrl(req, res) {
      const branding = BrandingService.getBrandFromReq(req);
      let postLoginUrl = null;
      if (req.session.redirUrl) {
        postLoginUrl = req.session.redirUrl;
      } else {
        postLoginUrl = `${BrandingService.getBrandAndPortalPath(req)}/${ConfigService.getBrand(branding, 'auth').local.postLoginRedir}`;
      }
      sails.log.debug(`post login url: ${postLoginUrl}`);
      return postLoginUrl;
    }

    public logout(req, res) {
      let requestDetails = new RequestDetails(req);
      let redirUrl = sails.config.auth.postLogoutRedir;
      if (req.session.user && req.session.user.type == 'oidc') {
        redirUrl = req.session.logoutUrl;
      }
      let user = req.session.user ? req.session.user : req.user;

      req.logout();
      UsersService.addUserAuditEvent(user, "logout", requestDetails).then(response => {
        sails.log.debug(`User logout audit event created: ${user.id}`)
      }).catch(err => {
        sails.log.error(`User logout audit event failed`)
        sails.log.error(err)
      });
      req.session.destroy(err => {
        res.redirect(redirUrl);
      });
    }

    public info(req, res) {
      let user = req.user;
      delete user.token;
      return res.json({
        user: user
      });
    }

    public update(req, res) {
      var userid;
      if (req.isAuthenticated()) {
        userid = req.user.id;
      } else {
        this.ajaxFail(req, res, "No current user session. Please login.");
      }

      if (!userid) {
        this.ajaxFail(req, res, "Error: unable to get user ID.");
      }

      var details = req.body.details;
      if (!details) {
        this.ajaxFail(req, res, "Error: user details not specified");
      }

      var name;
      if (details.name) {
        name = details.name
      };
      if (name) {
        UsersService.updateUserDetails(userid, name, details.email, details.password).subscribe(user => {
          this.ajaxOk(req, res, "Profile updated successfully.");
        }, error => {
          sails.log.error("Failed to update user profile:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
      } else {
        this.ajaxFail(req, res, "Error: name must not be null");
      }
    }

    public generateUserKey(req, res) {
      var userid;
      if (req.isAuthenticated()) {
        userid = req.user.id;
      } else {
        this.ajaxFail(req, res, "No current user session. Please login.");
      }

      if (userid) {
        var uuid = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe(user => {
          this.ajaxOk(req, res, uuid)
        }, error => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
      } else {
        return this.ajaxFail(req, res, "Error: unable to get user ID.");
      }
    }

    public revokeUserKey(req, res) {
      var userid;
      if (req.isAuthenticated()) {
        userid = req.user.id;
      } else {
        this.ajaxFail(req, res, "No current user session. Please login.");
      }

      if (userid) {
        var uuid = null;
        UsersService.setUserKey(userid, uuid).subscribe(user => {
          this.ajaxOk(req, res, "UUID revoked successfully")
        }, error => {
          sails.log.error("Failed to revoke UUID:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
      } else {
        return this.ajaxFail(req, res, "Error: unable to get user ID.");
      }
    }

    public localLogin(req, res) {
      sails.config.passport.authenticate('local', function (err, user, info) {
        if ((err) || (!user)) {
          return res.send({
            message: info.message,
            user: user
          });
        }
        let requestDetails = new RequestDetails(req);
        // We don't want to store the password!
        delete requestDetails.body.password;
        UsersService.addUserAuditEvent(user, "login", requestDetails).then(response => {
          sails.log.debug(`User login audit event created for local login: ${user.id}`)
        }).catch(err => {
          sails.log.error(`User login audit event created for local login failed`)
          sails.log.error(err)
        });
        req.logIn(user, function (err) {
          if (err) res.send(err);
          // login success
          // redir if api header call is not found
          return sails.getActions()['user/respond'](req, res, (req, res) => {
            return res.json({
              user: user,
              message: 'Login OK',
              url: sails.getActions()['user/getpostloginurl'](req, res)
            });
          }, (req, res) => {
            return sails.getActions()['user/redirpostlogin'](req, res);
          });
        });
      })(req, res);
    }


    public openidConnectLogin(req, res) {
      let passportIdentifier = 'oidc'
      if(!_.isEmpty(req.param('id'))) {
        passportIdentifier= `oidc-${req.param('id')}`
      }

      sails.config.passport.authenticate(passportIdentifier, function (err, user, info) {
        sails.log.verbose("At openIdConnectAuth Controller, verify...");
        sails.log.verbose("Error:");
        sails.log.verbose(err);
        sails.log.verbose("Info:");
        sails.log.verbose(info);
        sails.log.verbose("User:");
        sails.log.verbose(user);



        if (!_.isEmpty(err) || _.isUndefined(user) || _.isEmpty(user) || user == false) {
          sails.log.error(`OpenId Connect Login failed!`)
          // means the provider has authenticated the user, but has been rejected, redirect to catch-all
          if (!_.isEmpty(info) && !_.isString(info) && _.isObject(info)) {
            info = JSON.stringify(info);
          } else {
            if (_.isUndefined(info) || _.isEmpty(info)) {
              info = '';
            }
          }
          if (_.isEmpty(err)) {
            err = '';
          }
          return res.serverError({ 
            "message": 'error-auth',
            "detailedMessager": `${err}${info}`
          }); 
        }       
        let requestDetails = new RequestDetails(req);
        UsersService.addUserAuditEvent(user, "login", requestDetails).then(response => {
          sails.log.debug(`User login audit event created for OIDC login: ${user.id}`)
        }).catch(err => {
          sails.log.error(`User login audit event created for OIDC login failed`)
          sails.log.error(err)
        });

        req.logIn(user, function (err) {
          if (err) res.send(err);
          sails.log.debug("OpenId Connect Login OK, redirecting...");
          return sails.getActions()['user/redirpostlogin'](req, res);
        });
      })(req, res);
    }

    public beginOidc(req, res) {
      sails.log.verbose(`At OIDC begin flow, redirecting...`);
      let passportIdentifier = 'oidc'
      if(!_.isEmpty(req.param('id'))) {
        passportIdentifier= `oidc-${req.param('id')}`
      }
      sails.config.passport.authenticate(passportIdentifier)(req, res);
    }


    public aafLogin(req, res) {
      sails.config.passport.authenticate('aaf-jwt', function (err, user, info) {
        sails.log.verbose("At AAF Controller, verify...");
        sails.log.verbose("Error:");
        sails.log.verbose(err);
        sails.log.verbose("Info:");
        sails.log.verbose(info);
        sails.log.verbose("User:");
        sails.log.verbose(user);
        if ((err) || (!user)) {
          sails.log.error(err)
            // means the provider has authenticated the user, but has been rejected, redirect to catch-all
            return res.serverError({ 
              "message": 'error-auth',
              "detailedMessager": `${err}${info}`
            });
        }

        let requestDetails = new RequestDetails(req);
        UsersService.addUserAuditEvent(user, "login", requestDetails).then(response => {
          sails.log.debug(`User login audit event created for AAF login: ${user.id}`)
        }).catch(err => {
          sails.log.error(`User login audit event created for AAF login failed`)
          sails.log.error(err)
        });

        req.logIn(user, function (err) {
          if (err) res.send(err);
          sails.log.debug("AAF Login OK, redirecting...");
          return sails.getActions()['user/redirpostlogin'](req, res);
        });
      })(req, res);
    }

    public find(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const searchSource = req.query.source;
      const searchName = req.query.name;
      UsersService.findUsersWithName(searchName, brand.id, searchSource).subscribe(users => {
        const userArr = _.map(users, user => {
          return {
            name: user.name,
            id: user.id,
            username: user.username
          };
        });
        this.ajaxOk(req, res, null, userArr, true);
      }, error => {
        this.ajaxFail(req, res, null, error, true);
      });
    }
    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.User().exports();