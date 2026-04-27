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

const INVALID_AAF_LOGIN_REQUEST_RESPONSE = { message: 'invalid-aaf-login-request' };
const GENERIC_AAF_AUTH_ERROR_MESSAGE = 'There was an issue with your user credentials, please try again.';

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
        req.session.redirUrl = this.resolveSafeRedirectUrl(req, url, this.getConfiguredPostLoginUrl(req));

      }
      return res.redirect(`${BrandingService.getBrandAndPortalPath(req)}/${sails.config.auth.loginPath}`);
    }

    public redirPostLogin(req: Sails.Req, res: Sails.Res) {
      res.redirect(this.getPostLoginUrl(req, res));
    }

    protected getPostLoginUrl(req: Sails.Req, _res: Sails.Res) {
      const postLoginUrl = this.tryResolveSafeRedirectUrl(req, req.session.redirUrl)
        ?? this.tryResolveSafeRedirectUrl(req, req.query.redirUrl)
        ?? this.getConfiguredPostLoginUrl(req);
      sails.log.debug(`post login url: ${postLoginUrl}`);
      return postLoginUrl;
    }

    private getConfiguredPostLoginUrl(req: Sails.Req): string {
      const branding = BrandingService.getBrandNameFromReq(req);
      const authConfig = ConfigService.getBrand(branding, 'auth');
      const postLoginRedir = _.trimStart(String(_.get(authConfig, 'local.postLoginRedir', 'home') || 'home'), '/');
      return `${BrandingService.getBrandAndPortalPath(req)}/${postLoginRedir}`;
    }

    private getDefaultHomeUrl(req: Sails.Req): string {
      return `${BrandingService.getBrandAndPortalPath(req)}/home`;
    }

    private getApplicationOrigin(): string | null {
      const appUrl = String(sails.config.appUrl ?? '').trim();
      if (_.isEmpty(appUrl)) {
        return null;
      }

      try {
        return new URL(appUrl).origin;
      } catch (_error) {
        return null;
      }
    }

    private toAbsoluteAppUrl(path: string): string {
      const applicationOrigin = this.getApplicationOrigin();
      if (applicationOrigin == null || applicationOrigin.length === 0) {
        return path;
      }

      try {
        return new URL(path, applicationOrigin).toString();
      } catch (_error) {
        return path;
      }
    }

    private hasUnsafeRedirectCharacters(redirectCandidate: string): boolean {
      return /[\u0000-\u001F\u007F]/.test(redirectCandidate)
        || /%(?:0[0-9A-F]|1[0-9A-F]|7F)/i.test(redirectCandidate)
        || redirectCandidate.includes('\\')
        || /%5C/i.test(redirectCandidate);
    }

    private tryResolveSafeRedirectUrl(req: Sails.Req, candidate: unknown): string | null {
      if (!_.isString(candidate)) {
        return null;
      }

      const redirectCandidate = candidate.trim();
      if (_.isEmpty(redirectCandidate) || this.hasUnsafeRedirectCharacters(redirectCandidate)) {
        return null;
      }
      if (redirectCandidate.startsWith('//')) {
        return null;
      }
      if (redirectCandidate.startsWith('/')) {
        return redirectCandidate;
      }

      const applicationOrigin = this.getApplicationOrigin();
      if (_.isEmpty(applicationOrigin)) {
        return null;
      }

      try {
        const parsedUrl = new URL(redirectCandidate);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return null;
        }
        if (parsedUrl.origin !== applicationOrigin) {
          return null;
        }
        return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
      } catch (_error) {
        return null;
      }
    }

    protected resolveSafeRedirectUrl(req: Sails.Req, candidate: unknown, fallback: string): string {
      return this.tryResolveSafeRedirectUrl(req, candidate)
        ?? this.tryResolveSafeRedirectUrl(req, fallback)
        ?? this.getDefaultHomeUrl(req);
    }

    private getTrustedOidcLogoutOrigins(req: Sails.Req): string[] {
      const branding = BrandingService.getBrandNameFromReq(req);
      const authConfig = ConfigService.getBrand(branding, 'auth') as AnyRecord;
      const oidcConfig = _.get(authConfig, 'oidc');
      const oidcConfigs = Array.isArray(oidcConfig) ? oidcConfig : [oidcConfig];

      return _.compact(_.map(oidcConfigs, currentOidcConfig => {
        const issuer = _.get(currentOidcConfig, 'opts.issuer');
        const issuerValue = _.isString(issuer)
          ? issuer
          : (_.get(issuer, 'issuer') ?? _.get(issuer, 'end_session_endpoint'));
        if (!_.isString(issuerValue) || _.isEmpty(issuerValue.trim())) {
          return null;
        }

        try {
          return new URL(issuerValue).origin;
        } catch (_error) {
          return null;
        }
      }));
    }

    private tryResolveTrustedOidcLogoutUrl(req: Sails.Req, candidate: unknown): string | null {
      if (!_.isString(candidate)) {
        return null;
      }

      const redirectCandidate = candidate.trim();
      if (_.isEmpty(redirectCandidate) || this.hasUnsafeRedirectCharacters(redirectCandidate)) {
        return null;
      }

      try {
        const parsedUrl = new URL(redirectCandidate);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return null;
        }
        if (!this.getTrustedOidcLogoutOrigins(req).includes(parsedUrl.origin)) {
          return null;
        }

        const postLogoutRedirectUri = parsedUrl.searchParams.get('post_logout_redirect_uri');
        if (postLogoutRedirectUri != null) {
          const safePostLogoutRedirectUrl = this.tryResolveSafeRedirectUrl(req, postLogoutRedirectUri);
          if (safePostLogoutRedirectUrl == null) {
            return null;
          }
          parsedUrl.searchParams.set('post_logout_redirect_uri', this.toAbsoluteAppUrl(safePostLogoutRedirectUrl));
        }

        return parsedUrl.toString();
      } catch (_error) {
        return null;
      }
    }

    private resolveSafeLogoutRedirectUrl(req: Sails.Req, candidate: unknown, fallback: string): string {
      const safeFallback = this.resolveSafeRedirectUrl(req, fallback, this.getDefaultHomeUrl(req));
      return this.tryResolveTrustedOidcLogoutUrl(req, candidate)
        ?? this.resolveSafeRedirectUrl(req, candidate, safeFallback);
    }

    private getErrorMessage(error: unknown) {
      if (_.isString(error)) {
        return error;
      }

      if (error instanceof Error) {
        return error.message;
      }

      if (_.isObject(error)) {
        const message = _.get(error, 'message');
        return _.isString(message) ? message : '';
      }

      return '';
    }

    private hasValidAafAssertion(req: Sails.Req) {
      const assertion = _.get(req, 'body.assertion');
      return _.isString(assertion) && !_.isEmpty(assertion.trim());
    }

    private isMalformedAafLoginError(err: unknown, info: unknown) {
      const errors = [err, info];
      const errorMessages = _.map(errors, error => this.getErrorMessage(error).toLowerCase());

      return _.some(errors, error => {
        const errorName = _.isObject(error) ? String(_.get(error, 'name', '')) : '';
        return ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(errorName);
      }) || _.some(errorMessages, message => {
        return message.includes('no auth token')
          || message.includes('jwt malformed')
          || message.includes('invalid token')
          || message.includes('invalid signature')
          || message.includes('jwt issuer invalid')
          || message.includes('jwt audience invalid')
          || message.includes('jwt subject invalid')
          || message.includes('jwt id invalid')
          || message.includes('jwt not active')
          || message.includes('jwt expired');
      });
    }

    private setSessionAuthError(req: Sails.Req, detailedMessage: string) {
      if (_.isEmpty(req.session.data)) {
        req.session['data'] = {
          message: 'error-auth',
          detailedMessage,
        };
      }
    }

    public logout(req: Sails.Req, res: Sails.Res) {
      const requestDetails = new RequestDetails(req);
      const redirUrlFallback = this.resolveSafeRedirectUrl(req, sails.config.auth.postLogoutRedir, this.getDefaultHomeUrl(req));
      let redirUrl = redirUrlFallback;
      if (req.session.user && req.session.user.type == 'oidc') {
        redirUrl = this.resolveSafeLogoutRedirectUrl(req, req.session.logoutUrl, redirUrlFallback);
      }

      const user = req.session.user ? req.session.user : req.user;
      req.logout(function (err: unknown) {
        if (err) { return res.status(500).send('Logout failed'); }
        UsersService.addUserAuditEvent(user, "logout", requestDetails).then(_response => {
          sails.log.debug(`User logout audit event created: ${_.isEmpty(user) ? '' : user.id}`);
        }).catch(err => {
          sails.log.error(`User logout audit event failed`)
          sails.log.error(err)
        });
        // instead of destroying the session, as per M$ directions, we only unset the user, so branding, etc. is retained in the session
        _.unset(req.session, 'user');
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
        return this.sendResp(req, res, { data: { status: false, message: "No current user session. Please login." }, headers: this.getNoCacheHeaders() });
      }

      if (!userid) {
        return this.sendResp(req, res, { data: { status: false, message: "Error: unable to get user ID." }, headers: this.getNoCacheHeaders() });
      }

      const body = (req.body ?? {}) as AnyRecord;
      const details = body.details as AnyRecord | undefined;
      if (!details) {
        return this.sendResp(req, res, { data: { status: false, message: "Error: user details not specified" }, headers: this.getNoCacheHeaders() });
      }

      let name;
      if (details.name) {
        name = details.name as string
      };
      if (name) {
        UsersService.updateUserDetails(userid, name, details.email as string, details.password as string).subscribe(_user => {
          this.sendResp(req, res, { data: { status: true, message: "Profile updated successfully." }, headers: this.getNoCacheHeaders() });
        }, error => {
          sails.log.error("Failed to update user profile:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        return this.sendResp(req, res, { data: { status: false, message: "Error: name must not be null" }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    public generateUserKey(req: Sails.Req, res: Sails.Res) {
      let userid;
      if (req.isAuthenticated()) {
        userid = req.user!.id as string;
      } else {
        this.sendResp(req, res, { data: { status: false, message: "No current user session. Please login." }, headers: this.getNoCacheHeaders() });
      }

      if (userid) {
        const uuid = uuidv4();
        UsersService.setUserKey(userid, uuid).subscribe(_user => {
          this.sendResp(req, res, { data: { status: true, message: uuid }, headers: this.getNoCacheHeaders() });
        }, error => {
          sails.log.error("Failed to set UUID:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        return this.sendResp(req, res, { data: { status: false, message: "Error: unable to get user ID." }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    public revokeUserKey(req: Sails.Req, res: Sails.Res) {
      let userid;
      if (req.isAuthenticated()) {
        userid = req.user!.id as string;
      } else {
        this.sendResp(req, res, { data: { status: false, message: "No current user session. Please login." }, headers: this.getNoCacheHeaders() });
      }

      if (userid) {
        const uuid = null;
        UsersService.setUserKey(userid, uuid).subscribe(_user => {
          this.sendResp(req, res, { data: { status: true, message: "UUID revoked successfully" }, headers: this.getNoCacheHeaders() });
        }, error => {
          sails.log.error("Failed to revoke UUID:");
          sails.log.error(error);
          this.sendResp(req, res, { data: { status: false, message: (error as Error).message }, headers: this.getNoCacheHeaders() });
        });
      } else {
        return this.sendResp(req, res, { data: { status: false, message: "Error: unable to get user ID." }, headers: this.getNoCacheHeaders() });
      }
      return;
    }

    public localLogin(req: Sails.Req, res: Sails.Res) {
      const that = this;
      const passport = sails.config.passport as unknown as { authenticate: (strategy: string, callback: (err: Error | null, user: AnyRecord | false, info: AnyRecord) => void) => (req: Sails.Req, res: Sails.Res) => void };
      passport.authenticate('local', function (err: Error | null, user: AnyRecord | false, info: AnyRecord) {
        if ((err) || (!user)) {
          return res.send({
            message: info.message,
            user: user
          });
        }
        const requestDetails = new RequestDetails(req);
        // We don't want to store the password!
        delete (requestDetails.body as Record<string, unknown>).password;
        UsersService.addUserAuditEvent(user, "login", requestDetails).then(_response => {
          sails.log.debug(`User login audit event created for local login: ${_.isEmpty(user) ? '' : user.id}`)
        }).catch(err => {
          sails.log.error(`User login audit event created for local login failed`)
          sails.log.error(err)
        });
        const isAjax = req.headers && req.headers['x-source'] == 'jsclient';
        return req.logIn(user, function (err: unknown) {
          if (err) res.send(err);
          // login success
          // redir if api header call is not found
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
      let passportIdentifier = 'oidc'
      if (!_.isEmpty(req.param('id'))) {
        passportIdentifier = `oidc-${req.param('id')}`
      }
      const that = this;
      const passport = sails.config.passport as unknown as { authenticate: (strategy: string, callback: (err: Error | null, user: AnyRecord | false, info: AnyRecord | string) => void) => (req: Sails.Req, res: Sails.Res) => void };
      passport.authenticate(passportIdentifier, function (err: Error | null, user: AnyRecord | false, info: AnyRecord | string) {
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

          const branding = BrandingService.getBrandNameFromReq(req);
          const oidcConfig = _.get(ConfigService.getBrand(branding, 'auth'), 'oidc', {});
          const errorMessage = _.get(err, 'message', err?.toString() ?? '');

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

          const errorMessageDecoded = that.decodeErrorMappings(oidcConfig, errorMessage);
          sails.log.verbose('After decodeErrorMappings - errorMessageDecoded: ' + JSON.stringify(errorMessageDecoded));
          if (!_.isEmpty(errorMessageDecoded)) {
            req.session['data'] = errorMessageDecoded;
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
          return res.redirect(url);
        }
        const requestDetails = new RequestDetails(req);
        UsersService.addUserAuditEvent(user, "login", requestDetails).then(_response => {
          sails.log.debug(`User login audit event created for OIDC login: ${_.isEmpty(user) ? '' : (user as AnyRecord).id}`)
        }).catch(err => {
          sails.log.error(`User login audit event created for OIDC login failed`)
          sails.log.error(err)
        });

        req.logIn(user, function (err: unknown) {
          if (err) res.send(err);
          sails.log.debug("OpenId Connect Login OK, redirecting...");
          return (sails.getActions()['user/redirpostlogin'] as (req: Sails.Req, res: Sails.Res) => void)(req, res);
        });
      })(req, res);
    }

    public beginOidc(req: Sails.Req, res: Sails.Res, next: NextFunction) {
      sails.log.verbose(`At OIDC begin flow, redirecting...`);
      let passportIdentifier = 'oidc'
      if (!_.isEmpty(req.param('id'))) {
        passportIdentifier = `oidc-${req.param('id')}`
      }
      sails.config.passport.authenticate(passportIdentifier)(req, res, next);
    }

    private decodeErrorMappings(options: unknown, errorMessage: string) {

      sails.log.verbose('decodeErrorMappings - errorMessage: ' + errorMessage);
      sails.log.verbose('decodeErrorMappings - options: ' + JSON.stringify(options));
      let errorMessageDecoded: unknown = 'oidc-default-unknown-error';
      const errorMappingList = _.get(options, 'errorMappings', []);

      let errorMessageDecodedAsObject = {};

      if (!_.isUndefined(errorMessage) && !_.isNull(errorMessage)) {

        sails.log.verbose('decodeErrorMappings - errorMappingList: ' + JSON.stringify(errorMappingList));
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
            sails.log.verbose('decodeErrorMappings - regexPattern ' + regexPattern);
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
        sails.log.verbose('decodeErrorMappings errorMessage.toString() ' + errorMessage.toString());
        const reTestResult = re.test(errorMessage.toString());
        sails.log.verbose('decodeErrorMappings reTestResult ' + reTestResult);
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
      if (!this.hasValidAafAssertion(req)) {
        return res.badRequest(INVALID_AAF_LOGIN_REQUEST_RESPONSE);
      }

      const passport = sails.config.passport as unknown as { authenticate: (strategy: string, callback: (err: Error | string | null, user: AnyRecord | false, info: AnyRecord | string | Error | undefined) => void) => (req: Sails.Req, res: Sails.Res) => void };

      try {
        passport.authenticate('aaf-jwt', (err: Error | string | null, user: AnyRecord | false, info: AnyRecord | string | Error | undefined) => {
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

            const errorMessage = this.getErrorMessage(err);
            if (errorMessage === "authorized-email-denied") {
              req.session['data'] = {
                message: "error-auth",
                detailedMessage: "authorized-email-denied",
              }
              return res.forbidden();
            }

            if (this.isMalformedAafLoginError(err, info)) {
              return res.badRequest(INVALID_AAF_LOGIN_REQUEST_RESPONSE);
            }

            // from https://sailsjs.com/documentation/reference/response-res/res-server-error
            // "The specified data will be excluded from the JSON response and view locals if the app is running in the "production" environment (i.e. process.env.NODE_ENV === 'production')."
            // so storing the data in session
            this.setSessionAuthError(req, GENERIC_AAF_AUTH_ERROR_MESSAGE);
            return res.serverError();
          }

          const requestDetails = new RequestDetails(req);
          UsersService.addUserAuditEvent(user, "login", requestDetails).then(_response => {
            sails.log.debug(`User login audit event created for AAF login: ${_.isEmpty(user) ? '' : (user as AnyRecord).id}`)
          }).catch(err => {
            sails.log.error(`User login audit event created for AAF login failed`)
            sails.log.error(err)
          });

          req.logIn(user, function (err: unknown) {
            if (err) res.send(err);
            sails.log.debug("AAF Login OK, redirecting...");
            return (sails.getActions()['user/redirpostlogin'] as (req: Sails.Req, res: Sails.Res) => void)(req, res);
          });
        })(req, res);
      } catch (err) {
        sails.log.error(err);
        if (this.isMalformedAafLoginError(err, undefined)) {
          return res.badRequest(INVALID_AAF_LOGIN_REQUEST_RESPONSE);
        }

        this.setSessionAuthError(req, GENERIC_AAF_AUTH_ERROR_MESSAGE);
        return res.serverError();
      }
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
        this.sendResp(req, res, { data: userArr, headers: this.getNoCacheHeaders() });
      }, error => {
        this.sendResp(req, res, { data: error, headers: this.getNoCacheHeaders() });
      });
    }
    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
