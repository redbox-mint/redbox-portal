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

import { Observable, of, from, throwError, lastValueFrom, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap, map, last } from 'rxjs/operators';

import {
  isObservable
} from 'rxjs';

import {
  BrandingModel,
  RoleModel,
  SearchService,
  UserModel,
  Services as services
} from '@researchdatabox/redbox-core-types';

import {
  Sails,
  Model
} from "sails";

import * as crypto from 'crypto';




declare var sails: Sails;
declare var User, Role, UserAudit, Record: Model;
declare var BrandingService, RolesService, ConfigService, RecordsService;
declare var VocabService;
declare const Buffer;
declare var _;

export module Services {
  /**
   * Use services...
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Users extends services.Core.Service {
    
    protected _exportedMethods: any = [
      'bootstrap',
      'updateUserRoles',
      'updateUserDetails',
      'getUserWithId',
      'getUserWithUsername',
      'addLocalUser',
      'setUserKey',
      'hasRole',
      'findUsersWithName',
      'findUsersWithEmail',
      'findUsersWithQuery',
      'findAndAssignAccessToRecords',
      'getUsers',
      'addUserAuditEvent',
      'checkAuthorizedEmail',
    ];

    searchService: SearchService;


    protected async processDynamicImports(): Promise<void> {
      const passport  = await import('openid-client/passport')
      console.log(passport)
    }
    protected localAuthInit () {
      // users the default brand's configuration on startup
      // TODO: consider moving late initializing this if possible
      const defAuthConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
      var usernameField = defAuthConfig.local.usernameField,
        passwordField = defAuthConfig.local.passwordField;
      //
      // --------- Passport --------------
      //
      sails.config.passport = require('passport')
      var LocalStrategy = require('passport-local').Strategy;
      var bcrypt;
      try {
        bcrypt = require('bcrypt');
      } catch (err) {
        bcrypt = require('bcryptjs');
      }
      sails.config.passport.serializeUser(function (user, done) {
        done(null, user.id);
      });
      sails.config.passport.deserializeUser(function (id, done) {
        User.findOne({
          id: id
        }).populate('roles').exec(function (err, user) {
          done(err, user);
        });
      });

      let that = this;

      //
      //  Local Strategy
      //
      sails.config.passport.use(new LocalStrategy({
          usernameField: usernameField,
          passwordField: passwordField
        },
        function (username, password, done) {

          User.findOne({
            username: username
          }).populate('roles').exec(function (err, foundUser) {
            if (err) {
              return done(err);
            }
            if (!foundUser) {
              return done(null, false, {
                message: 'Incorrect username/password'
              });
            }

            bcrypt.compare(password, foundUser.password, function (err, res) {

              if (!res) {
                return done(null, false, {
                  message: 'Incorrect username/password'
                });
              }

              // foundUser.lastLogin = new Date();

              let configLocal = _.get(defAuthConfig, 'local');
              if(that.hasPreSaveTriggerConfigured(configLocal, 'onUpdate')) {
                that.triggerPreSaveTriggers(foundUser, configLocal).then((userAdditionalInfo) => {

                  let success = that.checkAllTriggersSuccessOrFailure(userAdditionalInfo);
                  if(success) {

                    User.update({
                      username: username
                      }).set(
                        {
                          lastLogin: new Date(),
                          additionalAttributes: _.get(userAdditionalInfo, 'additionalAttributes')
                        }).exec(function (err, user) {
                          if (err) {
                            sails.log.error("Error updating user:");
                            sails.log.error(err);
                            return;
                          }
                          if (_.isEmpty(user)) {
                            sails.log.error("No user found");
                            return;
                          }
                          sails.log.verbose("Done, returning updated user:");
                          sails.log.verbose(user);
                          return;
                      });

                      if(that.hasPostSaveTriggerConfigured(configLocal, 'onUpdate')){
                        that.triggerPostSaveTriggers(foundUser, configLocal);
                      }

                      if(that.hasPostSaveSyncTriggerConfigured(configLocal, 'onUpdate')){
                        that.triggerPostSaveSyncTriggers(foundUser, configLocal);
                      }
                      
                      return done(null, userAdditionalInfo, {
                        message: 'Logged In Successfully'
                      });

                  } else {

                    return done(null, false, {
                      message: 'All required conditions for login not met'
                    });
                  }

                });

              } else {

                User.update({
                  username: username
                  }).set({lastLogin: new Date()}).exec(function (err, user) {
                    if (err) {
                      sails.log.error("Error updating user:");
                      sails.log.error(err);
                      return;
                    }
                    if (_.isEmpty(user)) {
                      sails.log.error("No user found");
                      return;
                    }
            
                    sails.log.verbose("Done, returning updated user:");
                    sails.log.verbose(user);
                    return;
                });
                
                if(that.hasPostSaveTriggerConfigured(configLocal, 'onUpdate')){
                  that.triggerPostSaveTriggers(foundUser, configLocal);
                }

                if(that.hasPostSaveSyncTriggerConfigured(configLocal, 'onUpdate')){
                  that.triggerPostSaveSyncTriggers(foundUser, configLocal);
                }

                return done(null, foundUser, {
                  message: 'Logged In Successfully'
                });
              }

            });
          });
        }
      ));
    }

    private hasPreSaveTriggerConfigured(config: string, mode: string) {
      let hasPreTrigger = false;
      let preSaveHooks = _.get(config, `hooks.${mode}.pre`, null);
      if (_.isArray(preSaveHooks)) {
        for (let preSaveHook of preSaveHooks) {
          if(_.has(preSaveHook, 'function') && _.has(preSaveHook, 'options')) {
            hasPreTrigger = true;
          }
        }
      }
      return hasPreTrigger;
    }

    private hasPostSaveTriggerConfigured(config: string, mode: string) {
      let hasPreTrigger = false;
      let preSaveHooks = _.get(config, `hooks.${mode}.post`, null);
      if (_.isArray(preSaveHooks)) {
        for (let preSaveHook of preSaveHooks) {
          if(_.has(preSaveHook, 'function') && _.has(preSaveHook, 'options')) {
            hasPreTrigger = true;
          }
        }
      }
      return hasPreTrigger;
    }

    private hasPostSaveSyncTriggerConfigured(config: string, mode: string) {
      let hasPreTrigger = false;
      let preSaveHooks = _.get(config, `hooks.${mode}.postSync`, null);
      if (_.isArray(preSaveHooks)) {
        for (let preSaveHook of preSaveHooks) {
          if(_.has(preSaveHook, 'function') && _.has(preSaveHook, 'options')) {
            hasPreTrigger = true;
          }
        }
      }
      return hasPreTrigger;
    }

    private checkAllTriggersSuccessOrFailure(user: object) {
      let preTriggersSuccessOrFailure = true;
      let preSaveHooksSuccessOrFailure =_.get(user, 'additionalInfoFound');
      if (_.isArray(preSaveHooksSuccessOrFailure)) {
        for (let preSaveHook of preSaveHooksSuccessOrFailure) {
          let success = _.get(preSaveHook, 'isSuccess');
          if(!success) {
            preTriggersSuccessOrFailure = false;
          }
        }
      }
      return preTriggersSuccessOrFailure;
    }
    
    //Post login and pre update/create user
    private async triggerPreSaveTriggers(user: object, config: object, mode: string = 'onUpdate') {
      sails.log.verbose("Triggering pre save triggers for user login: ");
      sails.log.verbose(`hooks.${mode}.pre`);
      sails.log.verbose(JSON.stringify(config));
      let preSaveUpdateHooks = _.get(config, `hooks.${mode}.pre`, null);
      sails.log.debug(preSaveUpdateHooks);

      if (_.isArray(preSaveUpdateHooks)) {

        for (var i = 0; i < preSaveUpdateHooks.length; i++) {
          let preSaveUpdateHook = preSaveUpdateHooks[i];
          let preSaveUpdateHookFunctionString = _.get(preSaveUpdateHook, 'function', null);
          if (preSaveUpdateHookFunctionString != null) {
            try {
              let preSaveUpdateHookFunction = eval(preSaveUpdateHookFunctionString);
              let options = _.get(preSaveUpdateHook, 'options', {});
              let failureMode = _.get(preSaveUpdateHook, 'failureMode');
              if(_.isUndefined(failureMode) || (failureMode != 'continue' && failureMode != 'stop')) {
                failureMode = 'continue';
              }
              sails.log.verbose(`Triggering pre save triggers: ${preSaveUpdateHookFunctionString} failureMode ${failureMode}`);
              let hookResponse = preSaveUpdateHookFunction(user, options, failureMode);
              user = await this.resolveHookResponse(hookResponse);
              sails.log.debug(`${preSaveUpdateHookFunctionString} response now is:`);
              try {
                sails.log.verbose(JSON.stringify(user));
              } catch(error){
                sails.log.verbose(user);
              }
              sails.log.debug(`pre-save sync trigger ${preSaveUpdateHookFunctionString} completed for user: ${_.get(user,'username')}`);
            } catch (err) {
              sails.log.error(`pre-save sync trigger ${preSaveUpdateHookFunctionString} failed to complete`);
              sails.log.error(err)
              throw err;
            }

          }
        }
      }
      return user;
    }

    //Post login and post update/create user sync
    public async triggerPostSaveSyncTriggers(user: object, config: object, mode: string = 'onUpdate', response: any = {}) {
      sails.log.verbose("Triggering post save sync triggers ");
      sails.log.verbose(`hooks.${mode}.postSync`);
      sails.log.verbose(JSON.stringify(config));
      let postSaveSyncHooks = _.get(config, `hooks.${mode}.postSync`, null);
      if (_.isArray(postSaveSyncHooks)) {
        for (var i = 0; i < postSaveSyncHooks.length; i++) {
          let postSaveSyncHook = postSaveSyncHooks[i];
          sails.log.debug(postSaveSyncHooks);
          let postSaveSyncHooksFunctionString = _.get(postSaveSyncHook, "function", null);
          if (postSaveSyncHooksFunctionString != null) {
            let postSaveSyncHookFunction = eval(postSaveSyncHooksFunctionString);
            let options = _.get(postSaveSyncHook, "options", {});
            if (_.isFunction(postSaveSyncHookFunction)) {
              try {
                sails.log.debug(`Triggering post-save sync trigger: ${postSaveSyncHooksFunctionString}`)
                let hookResponse = postSaveSyncHookFunction(user, options, response);
                response = await this.resolveHookResponse(hookResponse);
                sails.log.debug(`${postSaveSyncHooksFunctionString} response now is:`);
                sails.log.verbose(JSON.stringify(response));
                sails.log.debug(`post-save sync trigger ${postSaveSyncHooksFunctionString} completed for user: ${_.get(user,'username')}`)
              } catch (err) {
                sails.log.error(`post-save async trigger ${postSaveSyncHooksFunctionString} failed to complete`)
                sails.log.error(err)
                throw err;
              }
            } else {
              sails.log.error(`Post save function: '${postSaveSyncHooksFunctionString}' did not resolve to a valid function, what I got:`);
              sails.log.error(postSaveSyncHookFunction);
            }
          }
        }
      }
      return response;
    }

    //Post login and post update/create user
    public triggerPostSaveTriggers(user: object, config: object, mode: string = 'onUpdate'): void {
      sails.log.verbose("Triggering post save triggers ");
      sails.log.verbose(`hooks.${mode}.post`);
      sails.log.verbose(JSON.stringify(config));
      let postSaveCreateHooks = _.get(config, `hooks.${mode}.post`, null);
      if (_.isArray(postSaveCreateHooks)) {
        _.each(postSaveCreateHooks, postSaveCreateHook => {
          sails.log.debug(postSaveCreateHook);
          let postSaveCreateHookFunctionString = _.get(postSaveCreateHook, "function", null);
          if (postSaveCreateHookFunctionString != null) {
            let postSaveCreateHookFunction = eval(postSaveCreateHookFunctionString);
            let options = _.get(postSaveCreateHook, "options", {});
            if (_.isFunction(postSaveCreateHookFunction)) {
              let hookResponse = postSaveCreateHookFunction(user, options);
              this.resolveHookResponse(hookResponse).then(result => {
                sails.log.debug(`post-save trigger ${postSaveCreateHookFunctionString} completed for user: ${_.get(user,'username')}`)
              }).catch(error => {
                sails.log.error(`post-save trigger ${postSaveCreateHookFunctionString} failed to complete`)
                sails.log.error(error)
              });
            } else {
              sails.log.error(`Post save function: '${postSaveCreateHookFunctionString}' did not resolve to a valid function, what I got:`);
              sails.log.error(postSaveCreateHookFunction);
            }
          }
        });
      }
    }

    private resolveHookResponse(hookResponse) {
      if (isObservable(hookResponse)) {
        return firstValueFrom(hookResponse);
      } else {
        return Promise.resolve(hookResponse);
      }
    }

    protected aafAuthInit = () => {
      // users the default brand's configuration on startup
      // TODO: consider moving late initializing this if possible
      const defAuthConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
      //
      // JWT/AAF Strategy
      //
      let that = this;
      sails.log.verbose(`AAF, checking if within active array: ${defAuthConfig.active}`);
      if (defAuthConfig.active != undefined && defAuthConfig.active.indexOf('aaf') != -1) {
        var JwtStrategy = require('passport-jwt').Strategy,
          ExtractJwt = require('passport-jwt').ExtractJwt;
        const aafOpts = defAuthConfig.aaf.opts;
        aafOpts.jwtFromRequest = ExtractJwt.fromBodyField('assertion');
        sails.config.passport.use('aaf-jwt', new JwtStrategy(aafOpts, function (req, jwt_payload, done) {
          const brandName:string = BrandingService.getBrandFromReq(req);

          const brand:BrandingModel = BrandingService.getBrand(brandName);
          
          const authConfig = ConfigService.getBrand(brand.name, 'auth');
          var aafAttributes = authConfig.aaf.attributesField;
          sails.log.verbose("Configured roles: ")
          sails.log.verbose(sails.config.auth.roles);
          sails.log.verbose("AAF default roles ")
          sails.log.verbose(ConfigService.getBrand(brand.name, 'auth').aaf.defaultRole)
          sails.log.verbose("Brand roles ")
          sails.log.verbose(brand.roles)
          sails.log.verbose("Brand")
          sails.log.verbose(brand)
          let defaultAuthRole = RolesService.getDefAuthenticatedRole(brand);
          let aafDefRoles = []
          if (defaultAuthRole != undefined) {
            aafDefRoles = _.map(RolesService.getNestedRoles(defaultAuthRole.name, brand.roles), 'id');
          }
          var aafUsernameField = authConfig.aaf.usernameField;
          const userName = Buffer.from(jwt_payload[aafUsernameField]).toString('base64');
          User.findOne({
            username: userName
          }, function (err, user) {
            sails.log.verbose("At AAF Strategy verify, payload:");
            sails.log.verbose(jwt_payload);
            sails.log.verbose("User:");
            sails.log.verbose(user);
            sails.log.verbose("Error:");
            sails.log.verbose(err);
            if (err) {
              return done(err, false);
            }
            if (user) {
              user.lastLogin = new Date();
              user.name = jwt_payload[aafAttributes].cn;
              user.email = jwt_payload[aafAttributes].mail.toLowerCase();
              user.displayname = jwt_payload[aafAttributes].displayname;
              user.cn = jwt_payload[aafAttributes].cn;
              user.edupersonscopedaffiliation = jwt_payload[aafAttributes].edupersonscopedaffiliation;
              user.edupersontargetedid = jwt_payload[aafAttributes].edupersontargetedid;
              user.edupersonprincipalname = jwt_payload[aafAttributes].edupersonprincipalname;
              user.givenname = jwt_payload[aafAttributes].givenname;
              user.surname = jwt_payload[aafAttributes].surname;

              let configAAF = _.get(defAuthConfig, 'aaf');
              if(that.hasPreSaveTriggerConfigured(configAAF, 'onUpdate')) {
                that.triggerPreSaveTriggers(user, configAAF).then((userAdditionalInfo) => {

                  let success = that.checkAllTriggersSuccessOrFailure(userAdditionalInfo);
                  if(success) {
                    
                    User.update({
                      username: _.get(userAdditionalInfo, 'username')
                      }).set(userAdditionalInfo).exec(function (err, user) {
                      if (err) {
                        sails.log.error("Error updating user:");
                        sails.log.error(err);
                        return done(err, false, {message: "Error updating file"});
                      }
                      if (_.isEmpty(user)) {
                        sails.log.error("No user found");
                        return done("No user found", false, {message: "No user found"});
                      }
              
                      if(that.hasPostSaveTriggerConfigured(configAAF, 'onUpdate')){
                        that.triggerPostSaveTriggers(user, configAAF);
                      }
        
                      if(that.hasPostSaveSyncTriggerConfigured(configAAF, 'onUpdate')){
                        that.triggerPostSaveSyncTriggers(user, configAAF);
                      }

                      sails.log.verbose("Done, returning updated user:");
                      sails.log.verbose(user);
                      return done(null, user[0],{
                        message: 'Logged In Successfully'
                      });
                    });

                  } else {
                    return done('All required conditions for login not met', false, {message: 'All required conditions for login not met'});
                  }

                });

              } else {

                User.update({
                  username: user.username
                  }).set(user).exec(function (err, user) {
                  if (err) {
                    sails.log.error("Error updating user:");
                    sails.log.error(err);
                    return done(err, false, {message: "Error updating file"});
                  }
                  if (_.isEmpty(user)) {
                    sails.log.error("No user found");
                    return done("No user found", false, {message: "No user found"});
                  }
          
                  if(that.hasPostSaveTriggerConfigured(configAAF, 'onUpdate')){
                    that.triggerPostSaveTriggers(user, configAAF);
                  }
    
                  if(that.hasPostSaveSyncTriggerConfigured(configAAF, 'onUpdate')){
                    that.triggerPostSaveSyncTriggers(user, configAAF);
                  }

                  sails.log.verbose("Done, returning updated user:");
                  sails.log.verbose(user);
                  return done(null, user[0],{
                    message: 'Logged In Successfully'
                  });
                });

              }

            } else {
              sails.log.verbose("At AAF Strategy verify, creating new user...");
              // first time login, create with default role
              let userToCreate:any = {
                username: userName,
                name: jwt_payload[aafAttributes].cn,
                email: jwt_payload[aafAttributes].mail.toLowerCase(),
                displayname: jwt_payload[aafAttributes].displayname,
                cn: jwt_payload[aafAttributes].cn,
                edupersonscopedaffiliation: jwt_payload[aafAttributes].edupersonscopedaffiliation,
                edupersontargetedid: jwt_payload[aafAttributes].edupersontargetedid,
                edupersonprincipalname: jwt_payload[aafAttributes].edupersonprincipalname,
                givenname: jwt_payload[aafAttributes].givenname,
                surname: jwt_payload[aafAttributes].surname,
                type: 'aaf',
                roles: aafDefRoles,
                lastLogin: new Date()
              };
              sails.log.verbose(userToCreate);

              const emailAuthorizedCheck = that.checkAuthorizedEmail(userToCreate.email, brandName, 'aaf');
              if (!emailAuthorizedCheck) {
                return done("authorized-email-denied", false);
              }

              let configAAF = _.get(defAuthConfig, 'aaf');
              if(that.hasPreSaveTriggerConfigured(configAAF, 'onCreate')) {
                that.triggerPreSaveTriggers(userToCreate, configAAF).then((userAdditionalInfo:any) => {
                  
                  let success = that.checkAllTriggersSuccessOrFailure(userAdditionalInfo);
                  if(success) {
                    userToCreate = userAdditionalInfo;
                    User.create(userToCreate).exec(function (err, newUser) {
                      if (err) {
                        sails.log.error("Error creating new user:");
                        sails.log.error(err);
                        return done(err, false);
                      }
      
                      if(that.hasPostSaveTriggerConfigured(configAAF, 'onCreate')){
                        that.triggerPostSaveTriggers(newUser, configAAF);
                      }
    
                      if(that.hasPostSaveSyncTriggerConfigured(configAAF, 'onCreate')){
                        that.triggerPostSaveSyncTriggers(newUser, configAAF);
                      }

                      sails.log.verbose("Done, returning new user:");
                      sails.log.verbose(newUser);
                      return done(null, newUser);
                    });
                  } else {
                    return done(`All required conditions for login not met ${userAdditionalInfo.email}`, false);
                  }
                });


              } else {

                User.create(userToCreate).exec(function (err, newUser) {
                  if (err) {
                    sails.log.error("Error creating new user:");
                    sails.log.error(err);
                    return done(err, false);
                  }
  
                  if(that.hasPostSaveTriggerConfigured(configAAF, 'onCreate')){
                    that.triggerPostSaveTriggers(newUser, configAAF);
                  }

                  if(that.hasPostSaveSyncTriggerConfigured(configAAF, 'onCreate')){
                    that.triggerPostSaveSyncTriggers(newUser, configAAF);
                  }

                  sails.log.verbose("Done, returning new user:");
                  sails.log.verbose(newUser);
                  return done(null, newUser);
                });
                
              }
            }

          });
        }));
      } else {
        sails.log.verbose(`AAF, not active.`);
      }
    }

    protected openIdConnectAuth = () => {
      sails.on('ready', async () => {
        const defAuthConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
        sails.log.verbose(`OIDC, checking if within active array: ${defAuthConfig.active}`);
        if (defAuthConfig.active != undefined && defAuthConfig.active.indexOf('oidc') != -1) {
          const that = this;
          sails.log.verbose(`OIDC is active, configuring....`);
          let oidcConfigArray = defAuthConfig.oidc;
          if (_.isObject(oidcConfigArray)) {
            let singleOidcConfig = oidcConfigArray;
            oidcConfigArray = [singleOidcConfig];
          }
          for (let oidcConfig of oidcConfigArray) {
            const oidcOpts = oidcConfig.opts;
            const openidClient = await import('openid-client');
            const openidPassport  = await import('openid-client/passport')
            let configured = false;
            let discoverAttemptsCtr = 0;
            while (!configured && discoverAttemptsCtr < oidcConfig.discoverAttemptsMax) {
              discoverAttemptsCtr++;
              try {
                let oidcConfiguration;
                if (_.isString(oidcOpts.issuer)) {
                  sails.log.verbose(`OIDC, using issuer URL for discovery: ${oidcOpts.issuer}`);
                  const issuerUrl = new URL(oidcOpts.issuer);
                  oidcConfiguration = await (openidClient as any).discovery(
                    issuerUrl, 
                    oidcOpts.client.client_id, 
                    oidcOpts.client.client_secret,
                    undefined,
                    {
                      execute: [(openidClient as any).allowInsecureRequests],
                    }
                  );
                } else {
                  sails.log.verbose(`OIDC, using issuer hardcoded configuration:`);
                  sails.log.verbose(JSON.stringify(oidcOpts.issuer));
                  // For hardcoded configuration, create Configuration directly
                  oidcConfiguration = new (openidClient as any).Configuration(oidcOpts.issuer, oidcOpts.client.client_id, oidcOpts.client.client_secret);
                }
                configured = true;
                sails.log.verbose(`OIDC, Got issuer config, after ${discoverAttemptsCtr} attempt(s).`);
                sails.log.verbose(oidcConfiguration);
                const scope = _.get(oidcOpts, 'params.scope', 'openid profile email');
                const redirectUri = _.get(oidcOpts.opts, 'client.redirect_uris[0]', '');

                // Create strategy options matching the example pattern
                let options: any = {
                    config: oidcConfiguration,
                    scope: scope,
                    callbackURL: redirectUri
                };

                // Create verify function matching the example pattern
                let verifyCallbackFn = (req: any, tokenSet: any, userinfo: any, done: any) => {
                  this.openIdConnectAuthVerifyCallback(oidcConfig, oidcConfiguration, req, tokenSet, userinfo, done);
                };

                let passportIdentifier = 'oidc';
                if (!_.isEmpty(oidcConfig.identifier)) {
                  passportIdentifier = `oidc-${oidcConfig.identifier}`
                }

                sails.config.passport.use(passportIdentifier, new (openidPassport as any).Strategy(
                  options,
                  verifyCallbackFn
                ));
                sails.log.info(`OIDC is active, client ${passportIdentifier} configured and ready.`);


              } catch (e) {
                sails.log.error(`Failed to discover, attempt# ${discoverAttemptsCtr}:`);
                sails.log.error(e);
                await this.sleep(oidcConfig.discoverFailureSleep);
              }
            }
          }
        }
      });
    }

    protected openIdConnectAuthVerifyCallback(oidcConfig, client, req, tokenSet, userinfo = undefined, done) {
      const that = this;
      const logoutFromAuthServer = _.get(oidcConfig,'logoutFromAuthServer', true);
      if(logoutFromAuthServer) {
        // Use client.buildEndSessionUrl() instead of issuer.end_session_endpoint
        req.session.logoutUrl = client.buildEndSessionUrl();
        const postLogoutUris = _.get(oidcConfig.opts, 'client.post_logout_redirect_uris');
        if (!_.isEmpty(postLogoutUris)) {
          req.session.logoutUrl = `${req.session.logoutUrl}&post_logout_redirect_uri=${postLogoutUris[0]}`;
        }
      } else {
        req.session.logoutUrl = sails.config.auth.postLogoutRedir
      }
      if(req.session.redirUrl != null) {
        //the session url changes after login so we lose this value if we don't put it on the queru string
        req.query.redirUrl = req.session.redirUrl;
      }
      
      sails.log.verbose(`OIDC login success, tokenset: `);
      sails.log.verbose(JSON.stringify(tokenSet));
      sails.log.verbose(`Claims:`);
      sails.log.verbose(JSON.stringify(tokenSet.claims()));
      if (!_.isUndefined(userinfo)) {
        sails.log.verbose(`Userinfo:`);
        sails.log.verbose(JSON.stringify(userinfo));
      } else {
        userinfo = tokenSet.claims();
      }
      if (oidcConfig.debugMode === true) {
        sails.log.info("OIDC debug mode is active, intentionally failing the login, and redirecting to failure page with all details of this login attempt.");
        const err = {
          userinfo: userinfo,
          claims: tokenSet.claims(),
          tokenSet: tokenSet
        };
        req.session.errorTextRaw = JSON.stringify(err, null, 2);
        return done(null, false);
      }
      const brandName = req.session.branding;
      var brand:BrandingModel = BrandingService.getBrand(brandName);
      var claimsMappings = oidcConfig.claimMappings;
      let userName = '';
      let tmpUserName = _.get(userinfo, claimsMappings['username']);
      let claimsMappingOptions = oidcConfig.claimMappingOptions;
      let usernameToLowercase = false;
      if(!_.isUndefined(claimsMappingOptions) && !_.isEmpty(claimsMappingOptions)) {
        usernameToLowercase = claimsMappingOptions['usernameToLowercase'] || false;
      }
      sails.log.verbose("usernameToLowercase "+usernameToLowercase);
      if(usernameToLowercase) {
        userName = tmpUserName.toLowerCase();
        sails.log.verbose("usernameToLowercase "+userName);
      } else {
        userName = tmpUserName;
        sails.log.verbose(userName);
      }
      var openIdConnectDefRoles = _.map(RolesService.getNestedRoles(RolesService.getDefAuthenticatedRole(brand).name, brand.roles), 'id');

      // This can occur when the claim mappings are incorrect or a login was cancelled
      if (_.isEmpty(userName)) {
        return done(null, null, {
          message: 'Rejected as username does not have a value'
        });
      }

      User.findOne({
        username: userName
      }, function (err, user) {
        sails.log.verbose("At OIDC Strategy verify, payload:");
        sails.log.verbose(userinfo);
        sails.log.verbose("User:");
        sails.log.verbose(user);
        sails.log.verbose("Error:");
        sails.log.verbose(err);
        if (err) {
          return done(err, false);
        }
        if (user) {
          sails.log.error("At OIDC Strategy verify, updating new user...");
          user.lastLogin = new Date();
          user.additionalAttributes = that.mapAdditionalAttributes(userinfo, claimsMappings['additionalAttributes']);
          user.name = _.get(userinfo, claimsMappings['name']);
          user.email = _.get(userinfo, claimsMappings['email']).toLowerCase();
          user.displayname = _.get(userinfo, claimsMappings['displayName']);
          user.cn = _.get(userinfo, claimsMappings['cn']);
          user.givenname = _.get(userinfo, claimsMappings['givenname']);
          user.surname = _.get(userinfo, claimsMappings['surname']);

          if(that.hasPreSaveTriggerConfigured(oidcConfig, 'onUpdate')) {
            that.triggerPreSaveTriggers(user, oidcConfig).then((userAdditionalInfo) => {

              let success = that.checkAllTriggersSuccessOrFailure(userAdditionalInfo);
              if(success) {
                User.update({
                  username: _.get(userAdditionalInfo, 'username')
                  }).set(userAdditionalInfo).exec(function (err, user) {
                  if (err) {
                    sails.log.error("Error updating user:");
                    sails.log.error(err);
                    return done(err, false);
                  }
                  if (_.isEmpty(user)) {
                    sails.log.error("No user found");
                    return done("No user found", false);
                  }

                  if(that.hasPostSaveTriggerConfigured(oidcConfig, 'onUpdate')){
                    that.triggerPostSaveTriggers(user, oidcConfig);
                  }
    
                  if(that.hasPostSaveSyncTriggerConfigured(oidcConfig, 'onUpdate')){
                    that.triggerPostSaveSyncTriggers(user, oidcConfig);
                  }
          
                  sails.log.verbose("Done, returning updated user:");
                  sails.log.verbose(user);
                  return done(null, user[0]);
                });
              } else {
                return done('All required conditions for login not met', false);
              }

            });

          } else {

            User.update({
              username: user.username
              }).set(user).exec(function (err, user) {
              if (err) {
                sails.log.error("Error updating user:");
                sails.log.error(err);
                return done(err, false);
              }
              if (_.isEmpty(user)) {
                sails.log.error("No user found");
                return done("No user found", false);
              }

              if(that.hasPostSaveTriggerConfigured(oidcConfig, 'onUpdate')){
                that.triggerPostSaveTriggers(user, oidcConfig);
              }

              if(that.hasPostSaveSyncTriggerConfigured(oidcConfig, 'onUpdate')){
                that.triggerPostSaveSyncTriggers(user, oidcConfig);
              }
      
              sails.log.verbose("Done, returning updated user:");
              sails.log.verbose(user);
              return done(null, user[0]);
            });

          }

        } else {
          sails.log.verbose("At OIDC Strategy verify, creating new user...");
          try {
            let additionalAttributes = that.mapAdditionalAttributes(userinfo, claimsMappings['additionalAttributes']);
            // first time login, create with default role
            var userToCreate = {
              username: userName,
              name: _.get(userinfo, claimsMappings['name']),
              email: _.get(userinfo, claimsMappings['email']).toLowerCase(),
              displayname: _.get(userinfo, claimsMappings['displayName']),
              cn: _.get(userinfo, claimsMappings['cn']),
              givenname: _.get(userinfo, claimsMappings['givenname']),
              surname: _.get(userinfo, claimsMappings['surname']),
              type: 'oidc',
              roles: openIdConnectDefRoles,
              additionalAttributes: additionalAttributes,
              lastLogin: new Date()
            };
          } catch (e) {
            sails.log.error(`Failed to create new user:`);
            sails.log.error(e);
            return done(e, false);
          }
          sails.log.verbose(`Creating user: `);
          sails.log.verbose(userToCreate);

          const emailAuthorizedCheck = that.checkAuthorizedEmail(userToCreate.email, brandName, 'oidc');
          if (!emailAuthorizedCheck) {
            return done("authorized-email-denied", false);
          }

          if(that.hasPreSaveTriggerConfigured(oidcConfig, 'onCreate')) {
            that.triggerPreSaveTriggers(userToCreate, oidcConfig).then((userAdditionalInfo) => {
              
              let success = that.checkAllTriggersSuccessOrFailure(userAdditionalInfo);
              if(success) {
                
                User.create(userAdditionalInfo).exec(function (err, newUser) {
                  if (err) {
                    sails.log.error("Error creating new user:");
                    sails.log.error(err);
                    return done(err, false);
                  }

                  if(that.hasPostSaveTriggerConfigured(oidcConfig, 'onCreate')){
                    that.triggerPostSaveTriggers(newUser, oidcConfig);
                  }

                  if(that.hasPostSaveSyncTriggerConfigured(oidcConfig, 'onCreate')){
                    that.triggerPostSaveSyncTriggers(newUser, oidcConfig);
                  }
      
                  sails.log.verbose("Done, returning new user:");
                  sails.log.verbose(newUser);
                  return done(null, newUser);
                });

              } else {
                return done('All required conditions for login not met', false);
              } 
            });

          } else {

            User.create(userToCreate).exec(function (err, newUser) {
              if (err) {
                sails.log.error("Error creating new user:");
                sails.log.error(err);
                return done(err, false);
              }

              if(that.hasPostSaveTriggerConfigured(oidcConfig, 'onCreate')){
                that.triggerPostSaveTriggers(newUser, oidcConfig);
              }

              if(that.hasPostSaveSyncTriggerConfigured(oidcConfig, 'onCreate')){
                that.triggerPostSaveSyncTriggers(newUser, oidcConfig);
              }
  
              sails.log.verbose("Done, returning new user:");
              sails.log.verbose(newUser);
              return done(null, newUser);
            });

          }
        }
      });
    }



    protected bearerTokenAuthInit = () => {
      var BearerStrategy = require('passport-http-bearer').Strategy;
      sails.config.passport.use('bearer', new BearerStrategy(
        function (token, done) {
          if (!_.isEmpty(token) && !_.isUndefined(token)) {
            const tokenHash = crypto.createHash('sha256').update(token).digest('base64');
            User.findOne({
              token: tokenHash
            }).populate('roles').exec(function (err, user) {
              if (err) {
                return done(err);
              }
              if (!user) {

                return done(null, false);
              }
              return done(null, user, {
                scope: 'all'
              });
            });
          } else {
            // empty token, deny
            return done(null, false);
          }
        }
      ));
    }

    protected initDefAdmin = (defRoles, defAdminRole) => {
      const authConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
      var usernameField = authConfig.local.usernameField,
        passwordField = authConfig.local.passwordField;
      var defaultUser = _.find(defAdminRole.users, (o) => {
        return o[usernameField] == authConfig.local.default.adminUser
      });

      if (defaultUser == null) {
        defaultUser = {
          type: 'local',
          name: 'Local Admin'
        };
        defaultUser[usernameField] = authConfig.local.default.adminUser;
        defaultUser[passwordField] = authConfig.local.default.adminPw;
        defaultUser["email"] = authConfig.local.default.email;
        if (authConfig.local.default.token) {
          defaultUser["token"] = crypto.createHash('sha256').update(authConfig.local.default.token).digest('base64');
        }
        sails.log.verbose("Default user missing, creating...");
        return super.getObservable(User.create(defaultUser))
          .pipe(flatMap(defUser => {
            // START Sails 1.0 upgrade
            const defRoleIds = _.map(defRoles, (o) => {
              return o.id;
            });
            let q = User.addToCollection((defUser as any).id, 'roles').members(defRoleIds);
            // END Sails 1.0 upgrade
            return super.getObservable(q, 'exec', 'simplecb')
              .pipe(flatMap(dUser => {
                return from(defRoles)
                  .pipe(map(roleObserved => {
                    let role: any = roleObserved;
                    // START Sails 1.0 upgrade
                    // role.users.add(defUser.id)
                    q = Role.addToCollection(role.id, 'users').members([(defUser as any).id]);
                    // END Sails 1.0 upgrade
                    return super.getObservable(q, 'exec', 'simplecb');
                  }));
              })
              ,last()
              ,flatMap(lastRole => {
                return of({
                  defUser: defUser,
                  defRoles: defRoles
                });
              }));
          }));
      } else {
        return of({
          defUser: defaultUser,
          defRoles: defRoles
        });
      }
    }

    protected mapAdditionalAttributes(profile, attributeMappings) {
      let additionalAttributes = {};
      for (let attributeMapping in attributeMappings) {
        additionalAttributes[attributeMapping] = _.get(profile, attributeMapping);
      }
      return additionalAttributes;
    }

    /**
     * Creates a user audit record
     *
     */
    public addUserAuditEvent = (user, action, additionalContext) => {
      // ignore audit events for users with no user, which had crashed the app when user has already logged out
      if (_.isEmpty(user)) {
        sails.log.verbose('No user to audit, ignoring: ' + action);
        return firstValueFrom(of(null));
      }
      let auditEvent = {};
      if (!_.isEmpty(user.password)) {
        delete user.password;
      }
      user.additionalAttributes = this.stringifyObject(user.additionalAttributes)
      auditEvent['user'] = user
      auditEvent['action'] = action;
      auditEvent['additionalContext'] = this.stringifyObject(additionalContext);
      sails.log.verbose('Adding user audit event');
      sails.log.verbose(auditEvent);
  return firstValueFrom(super.getObservable(UserAudit.create(auditEvent)));
    }

    stringifyObject(object: any): any {
      return JSON.stringify(object, function(key, value) {
        if (typeof value === 'function') {
          return 'function-property-not-exported'
        } else {
          return value;
        }
      })
    }

    /**
     * @return User: the newly created user
     *
     */
    public addLocalUser = (username, name, email, password): Observable<UserModel> => {
      const authConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
      var usernameField = authConfig.local.usernameField,
        passwordField = authConfig.local.passwordField;

      return this.getUserWithUsername(username).pipe(flatMap(user => {
        if (user) {
          return throwError(new Error(`Username already exists`));
        } else {
          return this.findUsersWithEmail(email, null, null).pipe(flatMap(emailCheck => {
            if (_.size(emailCheck) > 0) {
              return throwError(new Error(`Email already exists, it must be unique`));
            } else {
              var newUser = {
                type: 'local',
                name: name
              };
              if (!_.isEmpty(email)) {
                newUser["email"] = email;
              }
              newUser[usernameField] = username;
              newUser[passwordField] = password;
              return super.getObservable(User.create(newUser));
            }
          }));
        }
      }));

    }

    private getSearchService() {
      return sails.services[sails.config.search.serviceName];
    }

    /**
    @return Object {
          defUser: the default admin user
          defRoles: the default brand's roles
        }
    */
    public bootstrap = (defRoles) => {
      let that = this;
      const defAuthConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
      sails.log.verbose("Bootstrapping users....");

      var usernameField = defAuthConfig.local.usernameField,
        passwordField = defAuthConfig.local.passwordField;
      var defAdminRole = RolesService.getAdminFromRoles(defRoles);
      return of(defAdminRole)
        .pipe(flatMap(defAdminRole => {
          this.localAuthInit();
          this.aafAuthInit();
          this.openIdConnectAuth();
          this.bearerTokenAuthInit();
          return this.initDefAdmin(defRoles, defAdminRole);
        }));
    }

    public getUserWithUsername = (username) => {
      return this.getObservable(User.findOne({
        username: username
      }).populate('roles'));
    }

    public getUserWithId = (userid) => {
      return this.getObservable(User.findOne({
        id: userid
      }).populate('roles'));
    }

    /**
     * @return Collection of all users (local and AAF)
     */
    public getUsers = (): Observable < any > => {
      return super.getObservable(User.find({}).populate('roles'));
    }

    public setUserKey = (userid, uuid) => {
      const uuidHash = _.isEmpty(uuid) ? uuid : crypto.createHash('sha256').update(uuid).digest('base64');
      return this.getUserWithId(userid).pipe(flatMap(user => {
        if (user) {
          const q = User.update({
            id: userid
          }, {
            token: uuidHash
          });
          return this.getObservable(q, 'exec', 'simplecb');
        } else {
          return throwError(new Error('No such user with id:' + userid));
        }
      }));
    }

    public updateUserDetails = (userid, name, email, password): Observable<UserModel[]> => {
      const authConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
      var passwordField = authConfig.local.passwordField;
      return this.getUserWithId(userid).pipe(flatMap(user => {
        if (user) {
          const update = {
            name: name
          };

          if (!_.isEmpty(email)) {
            update["email"] = email;
          }

          if (!_.isEmpty(password)) {
            var bcrypt;
            try {
              bcrypt = require('bcrypt');
            } catch (err) {
              bcrypt = require('bcryptjs');
            }
            var salt = salt = bcrypt.genSaltSync(10);
            update[passwordField] = bcrypt.hashSync(password, salt);
          }
          const q = User.update({
            id: userid
          }, update);
          return this.getObservable(q, 'exec', 'simplecb');
        } else {
          return throwError(new Error('No such user with id:' + userid));
        }
      }));
    }

    public updateUserRoles = (userid, newRoleIds): Observable<UserModel> => {
      return this.getUserWithId(userid).pipe(flatMap(user => {
        if (user) {
          if (_.isEmpty(newRoleIds) || newRoleIds.length == 0) {
            return throwError(new Error('Please assign at least one role'));
          }
          // START Sails 1.0 upgrade
          const q = User.replaceCollection((user as any).id, 'roles').members(newRoleIds);
          // END Sails 1.0 upgrade
          return this.getObservable(q, 'exec', 'simplecb');
        } else {
          return throwError(new Error('No such user with id:' + userid));
        }
      }));
    }

    private updateUserAfterLogin(user,done){
      User.update({
        username: user.username
        }).set(user).exec(function (err, user) {
        if (err) {
          sails.log.error("Error updating user:");
          sails.log.error(err);
          return done(err, false);
        }
        if (_.isEmpty(user)) {
          sails.log.error("No user found");
          return done("No user found", false);
        }

        sails.log.verbose("Done, returning updated user:");
        sails.log.verbose(user);
        return done(null, user[0]);
      });
    }

    public hasRole(user, targetRole): RoleModel {
      return _.find(user.roles, (role) => {
        return role.id == targetRole.id;
      });
    }

    public findUsersWithName(name: string, brandId: string, source: any = null) {
      const query = {
        name: {
          'contains': name
        }
      };
      // S2TEST-21
      return this.findUsersWithQuery(query, brandId, source);
    }
    // S2TEST-21
    public findUsersWithEmail(email: string, brandId: string, source: any) {
      const query = {
        email: {
          'contains': email
        }
      };
      return this.findUsersWithQuery(query, brandId, source);
    }
    // S2TEST-21
    public findUsersWithQuery(query: any, brandId: string, source: any = null): Observable<UserModel[]> {
      if (!_.isEmpty(source) && !_.isUndefined(source) && !_.isNull(source)) {
        query['type'] = source;
      }
      return this.getObservable(User.find(query).populate('roles'))
        .pipe(flatMap(users => {
          if (brandId) {
            _.remove(users, (user) => {
              const isInBrand = _.find(user.roles, (role) => {
                return role.branding == brandId;
              });
              return !isInBrand;
            });
          }
          return of(users);
        }));
    }

    /**
     *
     * Find all records that the user is intended to have access to and assign actual access using their userId.
     * This is used as users or services may want to provide access for a user to a record but due to single sign-on solutions,
     * we're not able to reliably determine the username before they login to the system for the first time.
     *
     **/
    public findAndAssignAccessToRecords(pendingValue, userid):void {
      
      Record.find({
        'or': [{
          'authorization.editPending': pendingValue
        }, {
          'authorization.viewPending': pendingValue
        }]
      }).meta({
        enableExperimentalDeepTargets:true
      }).then(records => {
      
        if (_.isEmpty(records)) {
          sails.log.verbose(`UsersService::findAndAssignAccessToRecords() -> No pending records: ${pendingValue}`);
          return;
        }
        sails.log.verbose(`UsersService::findAndAssignAccessToRecords() -> Found ${records.length} records to assign permissions`);
        for (let record of records) {
          RecordsService.provideUserAccessAndRemovePendingAccess(record.redboxOid, userid, pendingValue);
        }
      }).catch((error: any) => {
        sails.log.warn(`Failed to assign access for user: ${pendingValue}`);
        sails.log.warn(error);
      });
    }

    /**
     * Check whether an email is authorized.
     * @param email The email to check.
     * @param branding The branding name.
     * @param authType The auth type ('aaf' or 'oidc').
     * @returns True if email is authorized or authorization check is disabled, otherwise false if email is not allowed.
     * @private
     */
    public checkAuthorizedEmail(email: string, branding: string, authType: string): boolean {
      // Must pass email.
      if (!email) {
        sails.log.error("No email address provided.");
        return false;
      }

      // Assess email address.
      const emailParts = email.includes('@') ? email.split('@') : [];
      if (emailParts.length !== 2) {
        sails.log.error(`Unexpected email format: ${email}.`);
        return false;
      }

      // Get the configuration data.
      const brandingAwareData = sails.config.brandingAware(branding);
      const authorizedDomainsEmails = _.get(brandingAwareData, 'authorizedDomainsEmails', {});

      if (authorizedDomainsEmails.enabled?.toString() !== 'true') {
        sails.log.warn("Authorized email configuration is disabled.");
        return true;
      }

      let domains = [];
      let emails = [];
      if (authType === 'aaf') {
        domains.push(...(authorizedDomainsEmails.domainsAaf || []));
        emails.push(...(authorizedDomainsEmails.emailsAaf || []));
      } else if (authType === 'oidc') {
        domains.push(...(authorizedDomainsEmails.domainsOidc || []));
        emails.push(...(authorizedDomainsEmails.emailsOidc || []));
      } else {
        sails.log.error(`Authorized domains and emails config problem: unknown auth type '${authType}'`);
        return false;
      }

      // Check configuration.
      if (domains.length === 0) {
        sails.log.verbose(`No authorized email domains configured for ${authType}.`);
      }
      if (emails.length === 0) {
        sails.log.verbose(`No authorized email exceptions configured for ${authType}.`);
      }
      if (domains.length === 0 && emails.length === 0) {
        return true;
      }

      // Assess domains and exceptions.
      const emailDomain = emailParts[1];
      const isAllowedDomain = domains.indexOf(emailDomain) !== -1;
      if (isAllowedDomain) {
        sails.log.verbose(`Authorized email domain: ${emailDomain}`);
        return true;
      }

      const isAllowedException = emails.indexOf(email) !== -1;
      if (isAllowedException) {
        sails.log.verbose(`Authorized email exception: ${email}`);
        return true;
      }

      // Checks did not pass, so email is not allowed.
      sails.log.error(`Email is not authorized to login using ${authType}: ${email}.`);
      return false;
    }
  }
}

module.exports = new Services.Users().exports();
