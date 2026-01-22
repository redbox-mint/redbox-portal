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

import { v4 as uuidv4 } from 'uuid';
import {
  BrandingModel,
  Controllers as controllers,
  RequestDetails,
} from '../index';

declare var sails: any;
declare var _: any;
declare var BrandingService: any;
declare var UsersService: any;
declare var ConfigService: any;
declare var TranslationService: any;

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

        let url = req.url;

        if (!_.isEmpty(sails.config.http.rootContext)) {

          url = sails.config.appUrl + '/' + sails.config.http.rootContext + url;

        }
        req.session.redirUrl = url;

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
      } else if (req.query.redirUrl) {
        postLoginUrl = req.query.redirUrl;
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

      // If the redirect URL is empty then revert back to the default
      if (_.isEmpty(redirUrl)) {
        redirUrl = _.isEmpty(sails.config.auth.postLogoutRedir) ? `${BrandingService.getBrandAndPortalPath(req)}/home` : sails.config.auth.postLogoutRedir;
      }

      let user = req.session.user ? req.session.user : req.user;
      req.logout(function (err) {
        if (err) { res.send(500, 'Logout failed'); }
        UsersService.addUserAuditEvent(user, "logout", requestDetails).then(response => {
          sails.log.debug(`User logout audit event created: ${_.isEmpty(user) ? '' : user.id}`);
        }).catch(err => {
          sails.log.error(`User logout audit event failed`)
          sails.log.error(err)
        });
        // instead of destroying the session, as per M$ directions, we only unset the user, so branding, etc. is retained in the session
        _.unset(req.session, 'user');
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
          sails.log.debug(`User login audit event created for local login: ${_.isEmpty(user) ? '' : user.id}`)
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
      if (!_.isEmpty(req.param('id'))) {
        passportIdentifier = `oidc-${req.param('id')}`
      }
      let that = this;
      sails.config.passport.authenticate(passportIdentifier, function (err, user, info) {
        sails.log.verbose("At openIdConnectAuth Controller, verify...");
        sails.log.verbose("Error:");
        sails.log.verbose(err);
        sails.log.verbose("Info:");
        sails.log.verbose(info);
        sails.log.verbose("User:");
        sails.log.verbose(user);

        if (!_.isEmpty(err) || _.isUndefined(user) || _.isEmpty(user) || user == false) {
          sails.log.error(`OpenId Connect Login failed!`);
          // means the provider has authenticated the user, but has been rejected, redirect to catch-all
          if (!_.isEmpty(info) && !_.isString(info) && _.isObject(info)) {
            info = JSON.stringify(info);
          } else {
            if (_.isUndefined(info) || _.isEmpty(info)) {
              info = '';
            }
          }

          const branding = BrandingService.getBrandFromReq(req);
          const oidcConfig = _.get(ConfigService.getBrand(branding, 'auth'), 'oidc', {});
          let errorMessage = _.get(err, 'message', err?.toString() ?? '');

          // Handle specific OIDC errors that should return 403 instead of 500
          if (errorMessage === "authorized-email-denied") {
            req.session['data'] = {
              message: "error-auth",
              detailedMessage: "authorized-email-denied",
            }
            return res.forbidden(req.session['data'], '403');
          }

          // Handle OPError from openid-client (like invalid_grant, session not found, etc.)
          if (err && (err.name === 'OPError' || errorMessage.includes('invalid_grant') || errorMessage.includes('session not found'))) {
            req.session['data'] = {
              message: "error-auth",
              detailedMessage: "There was an issue with your user credentials, please try again.",
            }
            return res.forbidden(req.session['data']);
          }

          let errorMessageDecoded = that.decodeErrorMappings(oidcConfig, errorMessage);
          sails.log.verbose('After decodeErrorMappings - errorMessageDecoded: ' + JSON.stringify(errorMessageDecoded));
          if (!_.isEmpty(errorMessageDecoded)) {
            req.session['data'] = errorMessageDecoded;
            return res.serverError();
          }

          if (_.isEmpty(err)) {
            err = '';
          }

          // from https://sailsjs.com/documentation/reference/response-res/res-server-error
          // "The specified data will be excluded from the JSON response and view locals if the app is running in the "production" environment (i.e. process.env.NODE_ENV === 'production')."
          // so storing the data in session
          if (_.isEmpty(req.session.data)) {
            req.session['data'] = {
              "message": 'error-auth',
              "detailedMessage": `${err}${info}`
            };
          }

          const url = `${BrandingService.getFullPath(req)}/home`;
          return res.redirect(url);
        }
        let requestDetails = new RequestDetails(req);
        UsersService.addUserAuditEvent(user, "login", requestDetails).then(response => {
          sails.log.debug(`User login audit event created for OIDC login: ${_.isEmpty(user) ? '' : user.id}`)
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
      if (!_.isEmpty(req.param('id'))) {
        passportIdentifier = `oidc-${req.param('id')}`
      }
      sails.config.passport.authenticate(passportIdentifier)(req, res);
    }

    private decodeErrorMappings(options, errorMessage) {

      sails.log.verbose('decodeErrorMappings - errorMessage: ' + errorMessage);
      sails.log.verbose('decodeErrorMappings - options: ' + JSON.stringify(options));
      let errorMessageDecoded: any = 'oidc-default-unknown-error';
      let errorMappingList = _.get(options, 'errorMappings', []);

      let errorMessageDecodedAsObject = {};

      if (!_.isUndefined(errorMessage) && !_.isNull(errorMessage)) {

        sails.log.verbose('decodeErrorMappings - errorMappingList: ' + JSON.stringify(errorMappingList));
        for (let errorMappingDetails of errorMappingList) {

          let matchRegex = false;
          let matchString = false;
          let matchRegexWithGroups = _.get(errorMappingDetails, 'matchRegexWithGroups', false);
          let fieldLanguageCode = _.get(errorMappingDetails, 'altErrorRedboxCodeMessage');
          let fieldLanguageCode2 = _.get(errorMappingDetails, 'altErrorRedboxCodeDetails', '');
          let asObject = _.get(errorMappingDetails, 'altErrorAsObject', false);
          let regexPattern = _.get(errorMappingDetails, 'errorDescPattern');

          if (!_.isUndefined(regexPattern) && _.isRegExp(regexPattern)) {
            matchRegex = true;
            matchString = false;
          } else if (!_.isUndefined(regexPattern) && !_.isRegExp(regexPattern) && _.isString(regexPattern) && !_.isEmpty(regexPattern)) {
            matchRegex = false;
            matchString = true;
          } else {
            errorMessageDecoded = fieldLanguageCode;
            break;
          }

          if (matchRegex) {
            sails.log.verbose('decodeErrorMappings - regexPattern ' + regexPattern);
            if (this.validateRegex(errorMessage, regexPattern)) {
              if (asObject) {
                errorMessageDecodedAsObject = {
                  message: fieldLanguageCode,
                  detailedMessage: fieldLanguageCode2
                }
                break;
              } else if (matchRegexWithGroups && _.isRegExp(regexPattern)) {
                let matchRegexGroupsDecoded = this.validateRegexWithGroups(errorMessage, regexPattern);
                if (!_.isEmpty(matchRegexGroupsDecoded)) {
                  sails.log.verbose('decodeErrorMappings - interpolationObj ' + JSON.stringify(matchRegexGroupsDecoded));
                  sails.log.verbose('decodeErrorMappings - detailedMessage ' + fieldLanguageCode2);
                  errorMessageDecodedAsObject = {
                    message: fieldLanguageCode,
                    detailedMessage: fieldLanguageCode2,
                    interpolation: true,
                    interpolationObj: matchRegexGroupsDecoded
                  }
                  break;
                }
              } else {
                errorMessageDecoded = fieldLanguageCode;
                break;
              }
            }

          } else if (matchString) {
            let errorRefDesc = _.get(errorMappingDetails, 'errorDescPattern');
            if (errorMessage.includes(errorRefDesc)) {
              if (asObject) {
                errorMessageDecodedAsObject = {
                  message: fieldLanguageCode,
                  detailedMessage: fieldLanguageCode2
                }
              } else {
                errorMessageDecoded = fieldLanguageCode;
              }
              break;
            }
          }

        }
      }

      if (!_.isEmpty(errorMessageDecodedAsObject)) {
        return errorMessageDecodedAsObject;
      } else {
        return errorMessageDecoded;
      }
    }

    private validateRegex(errorMessage, regexPattern) {
      if (_.isRegExp(regexPattern)) {
        let re = new RegExp(regexPattern);
        sails.log.verbose('decodeErrorMappings errorMessage.toString() ' + errorMessage.toString());
        let reTestResult = re.test(errorMessage.toString());
        sails.log.verbose('decodeErrorMappings reTestResult ' + reTestResult);
        return reTestResult;
      } else {
        return false;
      }
    }

    private validateRegexWithGroups(errorMessage, regexPattern) {
      // let decodedGroups = _.clone(groups);
      let re = new RegExp(regexPattern);
      const matches = re.exec(errorMessage);

      let interpolationMap = {}
      let groups = _.get(matches, 'groups');
      if (!_.isUndefined(groups)) {
        interpolationMap = groups;
      }

      return interpolationMap;
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

          let errorMessage = _.get(err, 'message', err?.toString() ?? '');
          if (errorMessage === "authorized-email-denied") {
            req.session['data'] = {
              message: "error-auth",
              detailedMessage: "authorized-email-denied",
            }
            return res.forbidden();
          }

          // from https://sailsjs.com/documentation/reference/response-res/res-server-error
          // "The specified data will be excluded from the JSON response and view locals if the app is running in the "production" environment (i.e. process.env.NODE_ENV === 'production')."
          // so storing the data in session
          if (_.isEmpty(req.session.data)) {
            req.session['data'] = {
              "message": 'error-auth',
              "detailedMessage": `${err}${info}`
            };
          }
          return res.serverError();
        }

        let requestDetails = new RequestDetails(req);
        UsersService.addUserAuditEvent(user, "login", requestDetails).then(response => {
          sails.log.debug(`User login audit event created for AAF login: ${_.isEmpty(user) ? '' : user.id}`)
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
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
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
