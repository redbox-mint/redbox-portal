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
import type { NextFunction } from 'express';
import {
  BrandingModel,
  Controllers as controllers,
  RequestDetails,
} from '../index';

type AnyRecord = globalThis.Record<string, unknown>;

export namespace Controllers {
  /**
   *  User-related features...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class User extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
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
    public login(req: Sails.Req, res: Sails.Res) {
      this.sendView(req, res, sails.config.auth.loginPath);
    }

    public profile(req: Sails.Req, res: Sails.Res) {
      this.sendView(req, res, "user/profile");
    }

    public redirLogin(req: Sails.Req, res: Sails.Res) {
      if (req.path.indexOf(sails.config.auth.loginPath) == -1) {

        let url = req.url;

        if (!_.isEmpty(sails.config.http.rootContext)) {

          url = sails.config.appUrl + '/' + sails.config.http.rootContext + url;

        }
        req.session.redirUrl = url;

      }
      const redirLoginUrl = `${BrandingService.getBrandAndPortalPath(req)}/${sails.config.auth.loginPath}`;
      this.updateChronicle(req, {userRedirLoginUrl: redirLoginUrl});
      return res.redirect(redirLoginUrl);
    }

    public redirPostLogin(req: Sails.Req, res: Sails.Res) {
      res.redirect(this.getPostLoginUrl(req, res));
    }

    protected getPostLoginUrl(req: Sails.Req, _res: Sails.Res) {
      const branding = BrandingService.getBrandNameFromReq(req);
      let postLoginUrl = null;
      if (req.session.redirUrl) {
        postLoginUrl = req.session.redirUrl;
      } else if (req.query.redirUrl) {
        postLoginUrl = req.query.redirUrl;
      } else {
        const authConfig = ConfigService.getBrand(branding, 'auth');
        const postLoginRedir = _.get(authConfig, 'local.postLoginRedir', 'home');
        postLoginUrl = `${BrandingService.getBrandAndPortalPath(req)}/${postLoginRedir}`;
      }
      this.updateChronicle(req, {userPostLoginUrl: postLoginUrl});
      return postLoginUrl;
    }

    public logout(req: Sails.Req, res: Sails.Res) {
      const requestDetails = new RequestDetails(req);
      let redirUrl = sails.config.auth.postLogoutRedir;
      if (req.session.user && req.session.user.type == 'oidc') {
        redirUrl = req.session.logoutUrl as string;
      }

      // If the redirect URL is empty then revert back to the default
      if (_.isEmpty(redirUrl)) {
        redirUrl = _.isEmpty(sails.config.auth.postLogoutRedir) ? `${BrandingService.getBrandAndPortalPath(req)}/home` : sails.config.auth.postLogoutRedir;
      }

      const user = req.session.user ? req.session.user : req.user;
      this.updateChronicle(req, {userLogoutUser: user});
      const that = this;
      req.logout(function (err: unknown) {
        if (err) {
          that.updateChronicle(req, {userLogoutSuccess: false}, [err]);
          return res.status(500).send('Logout failed');
        }
        that.updateChronicle(req, {userLogoutSuccess: true});
        UsersService.addUserAuditEvent(user, "logout", requestDetails).then(_response => {
          that.updateChronicle(req, {userLogoutAuditEventCreateSuccess: true});
        }).catch(err => {
          that.updateChronicle(req, {userLogoutAuditEventCreateSuccess: false}, [err]);
        });
        // instead of destroying the session, as per M$ directions, we only unset the user, so branding, etc. is retained in the session
        _.unset(req.session, 'user');

        that.updateChronicle(req, {userPostLogoutUrl: redirUrl});
        return res.redirect(redirUrl);
      });
    }

    public info(req: Sails.Req, res: Sails.Res) {
      const user = req.user!;
      delete user.token;
      return res.json({
        user: user
      });
    }

    public update(req: Sails.Req, res: Sails.Res) {
      let userid;
      if (req.isAuthenticated()) {
        userid = req.user!.id as string;
      } else {
        return this.sendResp(req, res, {
          data: { status: false, message: "No current user session. Please login." },
          headers: this.getNoCacheHeaders(),
          chronicle: {userDetailsUpdateSuccess: false, userChangeRequestMissingSession: true},
        });
      }

      if (!userid) {
        return this.sendResp(req, res, {
          data: { status: false, message: "Error: unable to get user ID." },
          headers: this.getNoCacheHeaders(),
          chronicle: {userDetailsUpdateSuccess: false, userChangeRequestMissingUserId: true},
        });
      }

      const body = (req.body ?? {}) as AnyRecord;
      const details = body.details as AnyRecord | undefined;
      if (!details) {
        return this.sendResp(req, res, {
          data: { status: false, message: "Error: user details not specified" },
          headers: this.getNoCacheHeaders(),
          chronicle: {userDetailsUpdateSuccess: false, userChangeRequestMissingDetails: true},
        });
      }

      let name;
      if (details.name) {
        name = details.name as string
      }
      if (name) {
        UsersService.updateUserDetails(userid, name, details.email as string, details.password as string).subscribe(_user => {
          this.sendResp(req, res, {
            data: { status: true, message: "Profile updated successfully." },
            headers: this.getNoCacheHeaders(),
            chronicle: {userDetailsUpdateSuccess: true, userNameNew: name},
          });
        }, error => {
          this.sendResp(req, res, {
            data: {status: false, message: (error as Error).message},
            headers: this.getNoCacheHeaders(),
            errors: [error],
            chronicle: {userDetailsUpdateSuccess: false},
          });
        });
      } else {
        return this.sendResp(req, res, {
          data: { status: false, message: "Error: name must not be null" },
          headers: this.getNoCacheHeaders(),
          chronicle: {userDetailsUpdateSuccess: false, userChangeRequestMissingName: true},
        });
      }
      return;
    }

    public generateUserKey(req: Sails.Req, res: Sails.Res) {
      let userid;
      if (req.isAuthenticated()) {
        userid = req.user!.id as string;
      } else {
        this.sendResp(req, res, {
          data: { status: false, message: "No current user session. Please login." },
          headers: this.getNoCacheHeaders(),
          chronicle: {userKeyUpdateSuccess: false, userChangeRequestMissingSession: true},
        });
      }

      if (userid) {
        const uuid = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe(_user => {
          this.sendResp(req, res, {
            data: { status: true, message: uuid },
            headers: this.getNoCacheHeaders(),
            chronicle: {userKeyUpdateSuccess: true}
          });
        }, error => {
          this.sendResp(req, res, {
            data: { status: false, message: (error as Error).message },
            headers: this.getNoCacheHeaders(),
            errors: [error],
            chronicle: {userKeyUpdateSuccess: false},
          });
        });
      } else {
        return this.sendResp(req, res, {
          data: { status: false, message: "Error: unable to get user ID." },
          headers: this.getNoCacheHeaders(),
          chronicle: {userKeyUpdateSuccess: false, userChangeRequestMissingUserId: true},
        });
      }
      return;
    }

    public revokeUserKey(req: Sails.Req, res: Sails.Res) {
      let userid;
      if (req.isAuthenticated()) {
        userid = req.user!.id as string;
      } else {
        this.sendResp(req, res, {
          data: { status: false, message: "No current user session. Please login." },
          headers: this.getNoCacheHeaders(),
          chronicle: {userKeyRevokeSuccess: false, userChangeRequestMissingSession: true},
        });
      }

      if (userid) {
        const uuid = null;
        UsersService.setUserKey(userid, uuid).subscribe(_user => {
          this.sendResp(req, res, {
            data: { status: true, message: "UUID revoked successfully" },
            headers: this.getNoCacheHeaders(),
            chronicle: {userKeyRevokeSuccess: true},
          });
        }, error => {
          this.sendResp(req, res, {
            data: { status: false, message: (error as Error).message },
            headers: this.getNoCacheHeaders(),
            errors: [error],
            chronicle: {userKeyRevokeSuccess: false},
          });
        });
      } else {
        return this.sendResp(req, res, {
          data: { status: false, message: "Error: unable to get user ID." },
          headers: this.getNoCacheHeaders(),
          chronicle: {userKeyRevokeSuccess: false, userChangeRequestMissingUserId: true},
        });
      }
      return;
    }

    public localLogin(req: Sails.Req, res: Sails.Res) {
      const that = this;
      this.updateChronicle(req, {userLoginType: 'local'});
      const passport = sails.config.passport as unknown as { authenticate: (strategy: string, callback: (err: Error | null, user: AnyRecord | false, info: AnyRecord) => void) => (req: Sails.Req, res: Sails.Res) => void };
      passport.authenticate('local', function (err: Error | null, user: AnyRecord | false, info: AnyRecord) {
        that.updateChronicle(req, {userLoginUser: user, userLoginDetails: info});
        if ((err) || (!user)) {
          that.updateChronicle(req, {userLoginSuccess: false, userLoginMissingUser: !!user}, err ? [err] : []);
          return res.send({
            message: info.message,
            user: user
          });
        }
        const requestDetails = new RequestDetails(req);
        // We don't want to store the password!
        delete (requestDetails.body as Record<string, unknown>).password;
        UsersService.addUserAuditEvent(user, "login", requestDetails).then(_response => {
          that.updateChronicle(req, {userLoginAuditEventCreateSuccess: true});
        }).catch(err => {
          that.updateChronicle(req, {userLoginAuditEventCreateSuccess: false}, [err]);
        });
        const isAjax = req.headers && req.headers['x-source'] == 'jsclient';
        return req.logIn(user, function (err: unknown) {
          if (err) {
            that.updateChronicle(req, {userLoginSuccess: false}, [err]);
            return res.send(err);
          }
          // login success
          // redir if api header call is not found
          that.updateChronicle(req, {userLoginSuccess: true, userLoginIsAjax: isAjax});
          if (isAjax) {
            return that.sendResp(req, res, {
              data: {
                user: user,
                message: 'Login OK',
                url: (sails.getActions()['user/getpostloginurl'] as (req: Sails.Req, res: Sails.Res) => string)(req, res)
              },
              headers: that.getNoCacheHeaders()
            });
          }
          return (sails.getActions()['user/redirpostlogin'] as (req: Sails.Req, res: Sails.Res) => void)(req, res);
        });
      })(req, res);
    }


    public openidConnectLogin(req: Sails.Req, res: Sails.Res) {
      this.updateChronicle(req, {userLoginType: 'oidc'});
      let passportIdentifier = 'oidc'
      if (!_.isEmpty(req.param('id'))) {
        passportIdentifier = `oidc-${req.param('id')}`
      }
      this.updateChronicle(req, {userLoginIdentifier: passportIdentifier});
      const that = this;
      const passport = sails.config.passport as unknown as { authenticate: (strategy: string, callback: (err: Error | null, user: AnyRecord | false, info: AnyRecord | string) => void) => (req: Sails.Req, res: Sails.Res) => void };
      passport.authenticate(passportIdentifier, function (err: Error | null, user: AnyRecord | false, info: AnyRecord | string) {
        that.updateChronicle(req, {userLoginUser: user, userLoginDetails: info}, err ? [err] : []);

        if (!_.isEmpty(err) || _.isUndefined(user) || _.isEmpty(user) || user == false) {
          that.updateChronicle(req, {userLoginSuccess: false});
          // means the provider has authenticated the user, but has been rejected, redirect to catch-all
          if (!_.isEmpty(info) && !_.isString(info) && _.isObject(info)) {
            info = JSON.stringify(info);
          } else {
            if (_.isUndefined(info) || _.isEmpty(info)) {
              info = '';
            }
          }

          const branding = BrandingService.getBrandNameFromReq(req);
          const oidcConfig = _.get(ConfigService.getBrand(branding, 'auth'), 'oidc', {});
          const errorMessage = _.get(err, 'message', err?.toString() ?? '');

          // Handle specific OIDC errors that should return 403 instead of 500
          if (errorMessage === "authorized-email-denied") {
            req.session['data'] = {
              message: "error-auth",
              detailedMessage: "authorized-email-denied",
            }
            that.updateChronicle(req, {userLoginAuthorizedEmailDenied: true});
            return res.forbidden(req.session['data'], '403');
          }

          // Handle OPError from openid-client (like invalid_grant, session not found, etc.)
          if (err && (err.name === 'OPError' || errorMessage.includes('invalid_grant') || errorMessage.includes('session not found'))) {
            req.session['data'] = {
              message: "error-auth",
              detailedMessage: "There was an issue with your user credentials, please try again.",
            }
            that.updateChronicle(req, {userLoginCredentialsProblem: true});
            return res.forbidden(req.session['data']);
          }

          const errorMessageDecoded = that.decodeErrorMappings(oidcConfig, errorMessage);
          if (!_.isEmpty(errorMessageDecoded)) {
            req.session['data'] = errorMessageDecoded;
            that.updateChronicle(req, {userLoginErrorMessage: errorMessageDecoded});
            return res.serverError();
          }

          const errStr = _.isEmpty(err) ? '' : String(err);

          // from https://sailsjs.com/documentation/reference/response-res/res-server-error
          // "The specified data will be excluded from the JSON response and view locals if the app is running in the "production" environment (i.e. process.env.NODE_ENV === 'production')."
          // so storing the data in session
          if (_.isEmpty(req.session.data)) {
            req.session['data'] = {
              "message": 'error-auth',
              "detailedMessage": `${errStr}${info}`
            };
          }

          const url = `${BrandingService.getFullPath(req)}/home`;
          that.updateChronicle(req, {userPostLoginUrl: url});
          return res.redirect(url);
        }
        const requestDetails = new RequestDetails(req);
        UsersService.addUserAuditEvent(user, "login", requestDetails).then(_response => {
          that.updateChronicle(req, {userLoginAuditEventCreateSuccess: true});
        }).catch(err => {
          that.updateChronicle(req, {userLoginAuditEventCreateSuccess: false}, [err]);
        });

        req.logIn(user, function (err: unknown) {
          if (err) {
            that.updateChronicle(req, {userLoginSuccess: false}, [err]);
            return res.send(err);
          }
          that.updateChronicle(req, {userLoginSuccess: true});
          return (sails.getActions()['user/redirpostlogin'] as (req: Sails.Req, res: Sails.Res) => void)(req, res);
        });
      })(req, res);
    }

    public beginOidc(req: Sails.Req, res: Sails.Res, next: NextFunction) {
      this.updateChronicle(req, {userLoginType: 'oidc'});
      let passportIdentifier = 'oidc'
      if (!_.isEmpty(req.param('id'))) {
        passportIdentifier = `oidc-${req.param('id')}`
      }
      this.updateChronicle(req, {userLoginIdentifier: passportIdentifier});
      sails.config.passport.authenticate(passportIdentifier)(req, res, next);
    }

    private decodeErrorMappings(options: unknown, errorMessage: string) {
      // sails.log.verbose('decodeErrorMappings - errorMessage: ' + errorMessage);
      // sails.log.verbose('decodeErrorMappings - options: ' + JSON.stringify(options));
      let errorMessageDecoded: unknown = 'oidc-default-unknown-error';
      const errorMappingList = _.get(options, 'errorMappings', []);

      let errorMessageDecodedAsObject = {};

      if (!_.isUndefined(errorMessage) && !_.isNull(errorMessage)) {

        // sails.log.verbose('decodeErrorMappings - errorMappingList: ' + JSON.stringify(errorMappingList));
        for (const errorMappingDetails of errorMappingList) {

          let matchRegex = false;
          let matchString = false;
          const matchRegexWithGroups = _.get(errorMappingDetails, 'matchRegexWithGroups', false);
          const fieldLanguageCode = _.get(errorMappingDetails, 'altErrorRedboxCodeMessage');
          const fieldLanguageCode2 = _.get(errorMappingDetails, 'altErrorRedboxCodeDetails', '');
          const asObject = _.get(errorMappingDetails, 'altErrorAsObject', false);
          const regexPattern = _.get(errorMappingDetails, 'errorDescPattern');

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
            // sails.log.verbose('decodeErrorMappings - regexPattern ' + regexPattern);
            if (this.validateRegex(errorMessage, regexPattern)) {
              if (asObject) {
                errorMessageDecodedAsObject = {
                  message: fieldLanguageCode,
                  detailedMessage: fieldLanguageCode2
                }
                break;
              } else if (matchRegexWithGroups && _.isRegExp(regexPattern)) {
                const matchRegexGroupsDecoded = this.validateRegexWithGroups(errorMessage, regexPattern);
                if (!_.isEmpty(matchRegexGroupsDecoded)) {
                  // sails.log.verbose('decodeErrorMappings - interpolationObj ' + JSON.stringify(matchRegexGroupsDecoded));
                  // sails.log.verbose('decodeErrorMappings - detailedMessage ' + fieldLanguageCode2);
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
            const errorRefDesc = _.get(errorMappingDetails, 'errorDescPattern');
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

    private validateRegex(errorMessage: string, regexPattern: string | RegExp) {
      if (_.isRegExp(regexPattern)) {
        const re = new RegExp(regexPattern);
        // sails.log.verbose('decodeErrorMappings errorMessage.toString() ' + errorMessage.toString());
        const reTestResult = re.test(errorMessage.toString());
        // sails.log.verbose('decodeErrorMappings reTestResult ' + reTestResult);
        return reTestResult;
      } else {
        return false;
      }
    }

    private validateRegexWithGroups(errorMessage: string, regexPattern: string | RegExp) {
      // let decodedGroups = _.clone(groups);
      const re = new RegExp(regexPattern);
      const matches = re.exec(errorMessage);

      let interpolationMap = {}
      const groups = _.get(matches, 'groups');
      if (!_.isUndefined(groups)) {
        interpolationMap = groups;
      }

      return interpolationMap;
    }

    public aafLogin(req: Sails.Req, res: Sails.Res) {
      const that = this;
      this.updateChronicle(req, {userLoginType: 'aaf'});
      const passport = sails.config.passport as unknown as { authenticate: (strategy: string, callback: (err: Error | null, user: AnyRecord | false, info: AnyRecord | string) => void) => (req: Sails.Req, res: Sails.Res) => void };
      passport.authenticate('aaf-jwt', function (err: Error | null, user: AnyRecord | false, info: AnyRecord | string) {
        that.updateChronicle(req, {userLoginUser: user, userLoginDetails: info}, err ? [err] : []);
        if ((err) || (!user)) {
          that.updateChronicle(req, {userLoginSuccess: false});
          // means the provider has authenticated the user, but has been rejected, redirect to catch-all

          const errorMessage = _.get(err, 'message', err?.toString() ?? '');
          if (errorMessage === "authorized-email-denied") {
            req.session['data'] = {
              message: "error-auth",
              detailedMessage: "authorized-email-denied",
            }
            that.updateChronicle(req, {userLoginAuthorizedEmailDenied: true});
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

        const requestDetails = new RequestDetails(req);
        UsersService.addUserAuditEvent(user, "login", requestDetails).then(_response => {
          that.updateChronicle(req, {userLoginAuditEventCreateSuccess: true});
        }).catch(err => {
          that.updateChronicle(req, {userLoginAuditEventCreateSuccess: false}, [err]);
        });

        req.logIn(user, function (err: unknown) {
          if (err) {
            that.updateChronicle(req, {userLoginSuccess: false}, [err]);
            return res.send(err);
          }
          that.updateChronicle(req, {userLoginSuccess: true});
          return (sails.getActions()['user/redirpostlogin'] as (req: Sails.Req, res: Sails.Res) => void)(req, res);
        });
      })(req, res);
    }

    public find(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      const searchSource = req.query.source;
      const searchName = req.query.name as string;
      UsersService.findUsersWithName(searchName, brand.id, searchSource).subscribe(users => {
        const userArr = _.map(users, (user: unknown) => {
          const u = user as AnyRecord;
          return {
            name: u.name,
            id: u.id,
            username: u.username
          };
        });
        this.sendResp(req, res, {
          data: userArr,
          headers: this.getNoCacheHeaders(),
          chronicle: {userFindSource: searchSource, userFindName: searchName, userFindMatches: userArr},
        });
      }, error => {
        this.sendResp(req, res, {
          data: error,
          headers: this.getNoCacheHeaders(),
          errors: [error],
          chronicle: {userFindSource: searchSource, userFindName: searchName},
        });
      });
    }
    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
