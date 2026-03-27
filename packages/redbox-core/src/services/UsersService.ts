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

import { Observable, of, from, throwError, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap, map, last } from 'rxjs/operators';

import {
  isObservable
} from 'rxjs';

import { BrandingModel } from '../model/storage/BrandingModel';
import { AuthorizedDomainsEmails } from '../configmodels/AuthorizedDomainsEmails';
import { RoleModel } from '../model/storage/RoleModel';
import { SearchService } from '../SearchService';
import { UserModel } from '../model/storage/UserModel';
import { Services as services } from '../CoreService';

import * as crypto from 'crypto';


declare const Buffer: typeof globalThis.Buffer;

export namespace Services {
  type AnyRecord = Record<string, unknown>;
  type DoneCallback = (err: unknown, user?: unknown, info?: unknown) => void;
  type BcryptLike = {
    compare: (password: string, hash: string, cb: (err: unknown, res: boolean) => void) => void;
    hash: (password: string, saltRounds: number, cb: (err: unknown, hash: string) => void) => void;
    genSaltSync: (rounds: number) => string;
    hashSync: (password: string, salt: string) => string;
  };

  type PassportLike = {
    serializeUser: (fn: (user: AnyRecord, done: DoneCallback) => void) => void;
    deserializeUser: (fn: (id: string, done: DoneCallback) => void) => void;
    use: (name: string, strategy: unknown) => void;
    authenticate: (strategy: string, options?: unknown) => unknown;
  };

  interface AuthBrandConfig {
    active?: string[];
    local?: {
      usernameField?: string;
      passwordField?: string;
      default?: {
        adminUser?: string;
        adminPw?: string;
        email?: string;
        token?: string;
      };
    };
    aaf?: {
      defaultRole?: string;
      usernameField?: string;
      attributesField?: string;
      opts?: Record<string, unknown>;
    };
    oidc?: OidcAuthConfig | OidcAuthConfig[];
  }

  interface OidcAuthConfig {
    identifier?: string;
    opts: {
      issuer: unknown;
      client: unknown;
      params?: Record<string, unknown>;
    };
    discoverAttemptsMax: number;
    discoverFailureSleep?: number;
    userInfoSource?: string;
  }

  interface LinkedUserSummary {
    id: string;
    username: string;
    name: string;
    email: string;
    type: string;
    accountLinkState: string;
    linkedAt?: string | Date;
  }

  interface UserLinkResponse {
    primary: LinkedUserSummary;
    linkedAccounts: LinkedUserSummary[];
    impact?: {
      recordsRewritten: number;
      rolesMerged: number;
    };
  }

  /**
   * Use services...
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Users extends services.Core.Service {

    protected override _exportedMethods: string[] = [
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
      'getUsersForBrand',
      'getEffectiveUser',
      'getLinkedAccounts',
      'searchLinkCandidates',
      'linkAccounts',
      'addUserAuditEvent',
      'checkAuthorizedEmail',
      'enrichUsersWithEffectiveDisabledState',
      'disableUser',
      'enableUser',
    ];

    searchService!: SearchService;

    private getAuthConfig(brandName: string): AuthBrandConfig {
      return (ConfigService.getBrand(brandName, 'auth') as AuthBrandConfig) ?? {};
    }

    private normalizeAccountLinkState(user: AnyRecord | null | undefined): void {
      if (user != null && _.isEmpty(user.accountLinkState)) {
        user.accountLinkState = 'active';
      }
    }

    private hasRoleInBrand(user: AnyRecord | null | undefined, brandId: string): boolean {
      if (user == null || _.isEmpty(brandId)) {
        return false;
      }
      return _.some(user.roles as AnyRecord[] ?? [], (role: unknown) => {
        const roleObj = role as AnyRecord;
        const branding = roleObj.branding as string | AnyRecord | undefined;
        const roleBrandId = _.isObject(branding) ? String((branding as AnyRecord).id ?? '') : String(branding ?? '');
        return roleBrandId === brandId;
      });
    }

    private getRolesForBrand(user: AnyRecord | null | undefined, brandId: string): AnyRecord[] {
      if (user == null || _.isEmpty(brandId)) {
        return [];
      }
      return _.filter(user.roles as AnyRecord[] ?? [], (role: unknown) => {
        const roleObj = role as AnyRecord;
        const branding = roleObj.branding as string | AnyRecord | undefined;
        const roleBrandId = _.isObject(branding) ? String((branding as AnyRecord).id ?? '') : String(branding ?? '');
        return roleBrandId === brandId;
      }) as AnyRecord[];
    }

    private toLinkedUserSummary(user: AnyRecord, linkedAt?: string | Date): LinkedUserSummary {
      this.normalizeAccountLinkState(user);
      return {
        id: String(user.id ?? ''),
        username: String(user.username ?? ''),
        name: String(user.name ?? ''),
        email: String(user.email ?? ''),
        type: String(user.type ?? ''),
        accountLinkState: String(user.accountLinkState ?? 'active'),
        linkedAt,
      };
    }

    private async resolveLinkedUserCandidate(user: unknown): Promise<AnyRecord | null> {
      if (_.isEmpty(user)) {
        return null;
      }
      const resolved = await firstValueFrom(this.getEffectiveUser(user));
      return (resolved as AnyRecord | null) ?? (user as AnyRecord);
    }

    private async rewriteLinkedRecordAuthorizations(
      primaryUser: AnyRecord,
      secondaryUser: AnyRecord,
      actor: string,
      defaultBrandId: string
    ): Promise<number> {
      const secondaryUsername = String(secondaryUser.username ?? '');
      const secondaryEmail = String(secondaryUser.email ?? '').toLowerCase();
      const records = await Record.find({
        or: [
          { 'authorization.edit': secondaryUsername },
          { 'authorization.view': secondaryUsername },
          { 'authorization.editPending': secondaryEmail },
          { 'authorization.viewPending': secondaryEmail }
        ]
      }).meta({
        enableExperimentalDeepTargets: true
      });

      let rewrittenCount = 0;
      for (const record of records as unknown[]) {
        const recordObj = _.cloneDeep(record) as AnyRecord;
        const authorization = (recordObj.authorization ?? {}) as AnyRecord;
        authorization.edit = _.uniq((authorization.edit ?? []) as string[]);
        authorization.view = _.uniq((authorization.view ?? []) as string[]);
        authorization.editPending = ((authorization.editPending ?? []) as string[]).map(email => String(email).toLowerCase());
        authorization.viewPending = ((authorization.viewPending ?? []) as string[]).map(email => String(email).toLowerCase());
        recordObj.authorization = authorization;

        let changed = false;
        const nextEdit = _.map(authorization.edit as string[], username => username === secondaryUsername ? String(primaryUser.username ?? '') : username);
        const nextView = _.map(authorization.view as string[], username => username === secondaryUsername ? String(primaryUser.username ?? '') : username);
        if (!_.isEqual(nextEdit, authorization.edit)) {
          authorization.edit = _.uniq(nextEdit);
          changed = true;
        }
        if (!_.isEqual(nextView, authorization.view)) {
          authorization.view = _.uniq(nextView);
          changed = true;
        }

        if (_.includes(authorization.editPending as string[], secondaryEmail)) {
          authorization.editPending = _.without(authorization.editPending as string[], secondaryEmail);
          authorization.edit = _.uniq([...(authorization.edit as string[]), String(primaryUser.username ?? '')]);
          RecordsService.provideUserAccessAndRemovePendingAccess(String(recordObj.redboxOid ?? ''), primaryUser.username, secondaryEmail);
          changed = true;
        }
        if (_.includes(authorization.viewPending as string[], secondaryEmail)) {
          authorization.viewPending = _.without(authorization.viewPending as string[], secondaryEmail);
          authorization.view = _.uniq([...(authorization.view as string[]), String(primaryUser.username ?? '')]);
          RecordsService.provideUserAccessAndRemovePendingAccess(String(recordObj.redboxOid ?? ''), primaryUser.username, secondaryEmail);
          changed = true;
        }

        if (changed) {
          const metaMetadata = (recordObj.metaMetadata ?? {}) as AnyRecord;
          const brandId = String(metaMetadata.brandId ?? defaultBrandId ?? '');
          const brand = !_.isEmpty(brandId) ? BrandingService.getBrandById(brandId) : BrandingService.getDefault();
          await RecordsService.updateMeta(brand, String(recordObj.redboxOid ?? ''), recordObj, { username: actor }, false, false);
          rewrittenCount++;
        }
      }

      return rewrittenCount;
    }

    private async resolveEffectiveDisabledState(user: AnyRecord): Promise<{ effectiveLoginDisabled: boolean; disabledByPrimaryUserId?: string; disabledByPrimaryUsername?: string }> {
      if (user.loginDisabled === true) {
        return { effectiveLoginDisabled: true };
      }
      if (!_.isEmpty(user.linkedPrimaryUserId)) {
        const primaryUser = await firstValueFrom(this.getUserWithId(String(user.linkedPrimaryUserId)));
        if (primaryUser != null && (primaryUser as AnyRecord).loginDisabled === true) {
          return {
            effectiveLoginDisabled: true,
            disabledByPrimaryUserId: String((primaryUser as AnyRecord).id ?? ''),
            disabledByPrimaryUsername: String((primaryUser as AnyRecord).username ?? '')
          };
        }
      }
      return { effectiveLoginDisabled: false };
    }

    private async assertAuthenticationAllowed(user: AnyRecord): Promise<void> {
      const state = await this.resolveEffectiveDisabledState(user);
      if (state.effectiveLoginDisabled) {
        throw new Error('Account is disabled');
      }
    }

    public async enrichUsersWithEffectiveDisabledState(users: AnyRecord[]): Promise<AnyRecord[]> {
      const primaryIds = _.uniq(
        _.compact(_.map(users, (u: AnyRecord) => !_.isEmpty(u.linkedPrimaryUserId) ? String(u.linkedPrimaryUserId) : null))
      );
      const primaryUsers = _.isEmpty(primaryIds) ? [] : await User.find({ id: primaryIds });
      const primaryUsersById = _.keyBy(primaryUsers as AnyRecord[], (u: AnyRecord) => String(u.id ?? ''));

      return _.map(users, (user: AnyRecord) => {
        if (user.loginDisabled === true) {
          user.effectiveLoginDisabled = true;
        } else if (!_.isEmpty(user.linkedPrimaryUserId)) {
          const primary = primaryUsersById[String(user.linkedPrimaryUserId)];
          if (primary != null && primary.loginDisabled === true) {
            user.effectiveLoginDisabled = true;
            user.disabledByPrimaryUserId = String(primary.id ?? '');
            user.disabledByPrimaryUsername = String(primary.username ?? '');
          } else {
            user.effectiveLoginDisabled = false;
          }
        } else {
          user.effectiveLoginDisabled = false;
        }
        return user;
      });
    }

    public async disableUser(userId: string, actor: string, brandId: string): Promise<void> {
      await User.update({ id: userId }).set({ loginDisabled: true });
      await this.addUserAuditEvent({ username: actor }, 'disable-user', { userId, brandId });
    }

    public async enableUser(userId: string, actor: string, brandId: string): Promise<void> {
      await User.update({ id: userId }).set({ loginDisabled: false });
      await this.addUserAuditEvent({ username: actor }, 'enable-user', { userId, brandId });
    }

    protected localAuthInit() {
      // users the default brand's configuration on startup
      // TODO: consider moving late initializing this if possible
      const defAuthConfig = this.getAuthConfig(BrandingService.getDefault().name);
      const usernameField = defAuthConfig.local?.usernameField ?? 'username';
      const passwordField = defAuthConfig.local?.passwordField ?? 'password';
      //
      // --------- Passport --------------
      //
      sails.config.passport = require('passport')
      const LocalStrategy = require('passport-local').Strategy;
      let bcrypt: BcryptLike;
      try {
        bcrypt = require('bcrypt') as BcryptLike;
      } catch (_err) {
        bcrypt = require('bcryptjs') as BcryptLike;
      }
      const passport = sails.config.passport as PassportLike;
      const that = this;
      passport.serializeUser(function (user: AnyRecord, done: DoneCallback) {
        done(null, user.id);
      });
      passport.deserializeUser(function (id: string, done: DoneCallback) {
        User.findOne({
          id: id
        }).populate('roles').exec(function (err: unknown, user: unknown) {
          if (err != null || _.isEmpty(user)) {
            done(err, user as AnyRecord);
            return;
          }
          that.resolveLinkedUserCandidate(user)
            .then((resolvedUser) => done(null, resolvedUser as AnyRecord))
            .catch((resolveErr: unknown) => done(resolveErr));
        });
      });

      //
      //  Local Strategy
      //
      passport.use('local', new LocalStrategy({
        usernameField: usernameField,
        passwordField: passwordField
      },
        function (username: string, password: string, done: DoneCallback) {

          User.findOne({
            username: username
          }).populate('roles').exec(function (err: unknown, foundUser: unknown) {
            if (err) {
              return done(err);
            }
            if (!foundUser) {
              return done(null, false, {
                message: 'Incorrect username/password'
              });
            }

            const foundUserObj = foundUser as AnyRecord;
            const passwordHash = String(foundUserObj.password ?? '');
            bcrypt.compare(password, passwordHash, function (err: unknown, res: boolean) {

              if (!res) {
                return done(null, false, {
                  message: 'Incorrect username/password'
                });
              }

              // Gate disabled users
              that.assertAuthenticationAllowed(foundUserObj).then(() => {

              // foundUser.lastLogin = new Date();

              const configLocal = _.get(defAuthConfig, 'local', {});
              if (that.hasPreSaveTriggerConfigured(configLocal, 'onUpdate')) {
                that.triggerPreSaveTriggers(foundUserObj, configLocal).then((userAdditionalInfo: AnyRecord) => {

                  const success = that.checkAllTriggersSuccessOrFailure(userAdditionalInfo);
                  if (success) {

                    User.update({
                      username: username
                    }).set(
                      {
                        lastLogin: new Date(),
                        additionalAttributes: _.get(userAdditionalInfo, 'additionalAttributes')
                      }).exec(function (err: unknown, user: unknown) {
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

                    if (that.hasPostSaveTriggerConfigured(configLocal, 'onUpdate')) {
                      that.triggerPostSaveTriggers(foundUserObj, configLocal);
                    }

                    if (that.hasPostSaveSyncTriggerConfigured(configLocal, 'onUpdate')) {
                      that.triggerPostSaveSyncTriggers(foundUserObj, configLocal);
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
                }).set({ lastLogin: new Date() }).exec(function (err: unknown, user: unknown) {
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

                if (that.hasPostSaveTriggerConfigured(configLocal, 'onUpdate')) {
                  that.triggerPostSaveTriggers(foundUserObj, configLocal);
                }

                if (that.hasPostSaveSyncTriggerConfigured(configLocal, 'onUpdate')) {
                  that.triggerPostSaveSyncTriggers(foundUserObj, configLocal);
                }

                return done(null, foundUserObj, {
                  message: 'Logged In Successfully'
                });
              }

              }).catch(() => {
                return done(null, false, { message: 'Account is disabled' });
              }); // end assertAuthenticationAllowed gate

            });
          });
        }
      ));
    }

    private hasPreSaveTriggerConfigured(config: unknown, mode: string) {
      let hasPreTrigger = false;
      const preSaveHooks = _.get(config, `hooks.${mode}.pre`, null) as unknown[] | null;
      if (Array.isArray(preSaveHooks)) {
        for (const preSaveHook of preSaveHooks) {
          if (_.has(preSaveHook, 'function') && _.has(preSaveHook, 'options')) {
            hasPreTrigger = true;
          }
        }
      }
      return hasPreTrigger;
    }

    private hasPostSaveTriggerConfigured(config: unknown, mode: string) {
      let hasPreTrigger = false;
      const preSaveHooks = _.get(config, `hooks.${mode}.post`, null) as unknown[] | null;
      if (Array.isArray(preSaveHooks)) {
        for (const preSaveHook of preSaveHooks) {
          if (_.has(preSaveHook, 'function') && _.has(preSaveHook, 'options')) {
            hasPreTrigger = true;
          }
        }
      }
      return hasPreTrigger;
    }

    private hasPostSaveSyncTriggerConfigured(config: unknown, mode: string) {
      let hasPreTrigger = false;
      const preSaveHooks = _.get(config, `hooks.${mode}.postSync`, null) as unknown[] | null;
      if (Array.isArray(preSaveHooks)) {
        for (const preSaveHook of preSaveHooks) {
          if (_.has(preSaveHook, 'function') && _.has(preSaveHook, 'options')) {
            hasPreTrigger = true;
          }
        }
      }
      return hasPreTrigger;
    }

    private checkAllTriggersSuccessOrFailure(user: object) {
      let preTriggersSuccessOrFailure = true;
      const preSaveHooksSuccessOrFailure = _.get(user as unknown, 'additionalInfoFound') as unknown[] | undefined;
      if (_.isArray(preSaveHooksSuccessOrFailure)) {
        for (const preSaveHook of preSaveHooksSuccessOrFailure) {
          const success = _.get(preSaveHook, 'isSuccess');
          if (!success) {
            preTriggersSuccessOrFailure = false;
          }
        }
      }
      return preTriggersSuccessOrFailure;
    }

    //Post login and pre update/create user
    private async triggerPreSaveTriggers(user: AnyRecord, config: AnyRecord, mode: string = 'onUpdate'): Promise<AnyRecord> {
      sails.log.verbose("Triggering pre save triggers for user login: ");
      sails.log.verbose(`hooks.${mode}.pre`);
      sails.log.verbose(JSON.stringify(config));
      const preSaveUpdateHooks = _.get(config, `hooks.${mode}.pre`, null) as unknown[] | null;
      sails.log.debug(preSaveUpdateHooks);

      if (_.isArray(preSaveUpdateHooks)) {

        for (let i = 0; i < preSaveUpdateHooks.length; i++) {
          const preSaveUpdateHook = preSaveUpdateHooks[i];
          const preSaveUpdateHookFunctionString = _.get(preSaveUpdateHook, 'function', null);
          if (preSaveUpdateHookFunctionString != null) {
            try {
              const preSaveUpdateHookFunction = eval(preSaveUpdateHookFunctionString);
              const options = _.get(preSaveUpdateHook, 'options', {});
              let failureMode = String(_.get(preSaveUpdateHook, 'failureMode', ''));
              if (_.isUndefined(failureMode) || (failureMode != 'continue' && failureMode != 'stop')) {
                failureMode = 'continue';
              }
              sails.log.verbose(`Triggering pre save triggers: ${preSaveUpdateHookFunctionString} failureMode ${failureMode}`);
              const hookResponse = preSaveUpdateHookFunction(user, options, failureMode);
              user = await this.resolveHookResponse(hookResponse) as AnyRecord;
              sails.log.debug(`${preSaveUpdateHookFunctionString} response now is:`);
              try {
                sails.log.verbose(JSON.stringify(user));
              } catch (_error) {
                sails.log.verbose(user);
              }
              sails.log.debug(`pre-save sync trigger ${preSaveUpdateHookFunctionString} completed for user: ${_.get(user, 'username')}`);
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
    public async triggerPostSaveSyncTriggers(user: AnyRecord, config: AnyRecord, mode: string = 'onUpdate', response: unknown = {}) {
      sails.log.verbose("Triggering post save sync triggers ");
      sails.log.verbose(`hooks.${mode}.postSync`);
      sails.log.verbose(JSON.stringify(config));
      const postSaveSyncHooks = _.get(config, `hooks.${mode}.postSync`, null) as unknown[] | null;
      if (_.isArray(postSaveSyncHooks)) {
        for (let i = 0; i < postSaveSyncHooks.length; i++) {
          const postSaveSyncHook = postSaveSyncHooks[i];
          sails.log.debug(postSaveSyncHooks);
          const postSaveSyncHooksFunctionString = _.get(postSaveSyncHook, "function", null);
          if (postSaveSyncHooksFunctionString != null) {
            const postSaveSyncHookFunction = eval(postSaveSyncHooksFunctionString);
            const options = _.get(postSaveSyncHook, "options", {});
            if (_.isFunction(postSaveSyncHookFunction)) {
              try {
                sails.log.debug(`Triggering post-save sync trigger: ${postSaveSyncHooksFunctionString}`)
                const hookResponse = postSaveSyncHookFunction(user, options, response);
                response = await this.resolveHookResponse(hookResponse);
                sails.log.debug(`${postSaveSyncHooksFunctionString} response now is:`);
                sails.log.verbose(JSON.stringify(response));
                sails.log.debug(`post-save sync trigger ${postSaveSyncHooksFunctionString} completed for user: ${_.get(user, 'username')}`)
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
    public triggerPostSaveTriggers(user: AnyRecord, config: AnyRecord, mode: string = 'onUpdate'): void {
      sails.log.verbose("Triggering post save triggers ");
      sails.log.verbose(`hooks.${mode}.post`);
      sails.log.verbose(JSON.stringify(config));
      const postSaveCreateHooks = _.get(config, `hooks.${mode}.post`, null);
      if (_.isArray(postSaveCreateHooks)) {
        _.each(postSaveCreateHooks, (postSaveCreateHook: unknown) => {
          sails.log.debug(postSaveCreateHook);
          const postSaveCreateHookFunctionString = _.get(postSaveCreateHook, "function", null);
          if (postSaveCreateHookFunctionString != null) {
            const postSaveCreateHookFunction = eval(postSaveCreateHookFunctionString);
            const options = _.get(postSaveCreateHook, "options", {});
            if (_.isFunction(postSaveCreateHookFunction)) {
              const hookResponse = postSaveCreateHookFunction(user, options);
              this.resolveHookResponse(hookResponse).then(_result => {
                sails.log.debug(`post-save trigger ${postSaveCreateHookFunctionString} completed for user: ${_.get(user, 'username')}`)
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

    private resolveHookResponse(hookResponse: unknown) {
      if (isObservable(hookResponse)) {
        return firstValueFrom(hookResponse);
      } else {
        return Promise.resolve(hookResponse);
      }
    }

    protected aafAuthInit = () => {
      // users the default brand's configuration on startup
      // TODO: consider moving late initializing this if possible
      const defAuthConfig = this.getAuthConfig(BrandingService.getDefault().name);
      //
      // JWT/AAF Strategy
      //
      const that = this;
      sails.log.verbose(`AAF, checking if within active array: ${defAuthConfig.active}`);
      if (defAuthConfig.active != undefined && defAuthConfig.active.indexOf('aaf') != -1) {
        const JwtStrategy = require('passport-jwt').Strategy,
          ExtractJwt = require('passport-jwt').ExtractJwt;
        const aafOpts = (defAuthConfig.aaf?.opts ?? {}) as Record<string, unknown>;
        aafOpts.jwtFromRequest = ExtractJwt.fromBodyField('assertion');
        (sails.config.passport as PassportLike).use('aaf-jwt', new JwtStrategy(aafOpts, function (req: Sails.Req, jwt_payload: AnyRecord, done: DoneCallback) {
          const brandName: string = BrandingService.getBrandNameFromReq(req);

          const brand: BrandingModel = BrandingService.getBrand(brandName);

          const authConfig = that.getAuthConfig(brand.name);
          const aafAttributes = authConfig.aaf?.attributesField ?? 'attributes';
          sails.log.verbose("Configured roles: ")
          sails.log.verbose(sails.config.auth.roles);
          sails.log.verbose("AAF default roles ")
          sails.log.verbose(authConfig.aaf?.defaultRole)
          sails.log.verbose("Brand roles ")
          sails.log.verbose(brand.roles)
          sails.log.verbose("Brand")
          sails.log.verbose(brand)
          const defaultAuthRole = RolesService.getDefAuthenticatedRole(brand);
          let aafDefRoles = []
          if (defaultAuthRole != undefined) {
            aafDefRoles = _.map(RolesService.getNestedRoles(defaultAuthRole.name, brand.roles), 'id');
          }
          const aafUsernameField = authConfig.aaf?.usernameField ?? 'username';
          const userName = Buffer.from(String(jwt_payload[aafUsernameField] ?? '')).toString('base64');
          User.findOne({
            username: userName
          }, function (err: unknown, user: unknown) {
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
              const userObj = user as AnyRecord;
              // Gate disabled users
              that.assertAuthenticationAllowed(userObj).then(() => {
              const attrs = (jwt_payload[aafAttributes] ?? {}) as AnyRecord;
              userObj.lastLogin = new Date();
              userObj.name = attrs.cn;
              userObj.email = String(attrs.mail ?? '').toLowerCase();
              userObj.displayname = attrs.displayname;
              userObj.cn = attrs.cn;
              userObj.edupersonscopedaffiliation = attrs.edupersonscopedaffiliation;
              userObj.edupersontargetedid = attrs.edupersontargetedid;
              userObj.edupersonprincipalname = attrs.edupersonprincipalname;
              userObj.givenname = attrs.givenname;
              userObj.surname = attrs.surname;

              const configAAF = _.get(defAuthConfig, 'aaf', {});
              if (that.hasPreSaveTriggerConfigured(configAAF, 'onUpdate')) {
                that.triggerPreSaveTriggers(userObj, configAAF).then((userAdditionalInfo: AnyRecord) => {

                  const success = that.checkAllTriggersSuccessOrFailure(userAdditionalInfo);
                  if (success) {

                    User.update({
                      username: _.get(userAdditionalInfo, 'username')
                    }).set(userAdditionalInfo).exec(function (err: unknown, user: unknown) {
                      if (err) {
                        sails.log.error("Error updating user:");
                        sails.log.error(err);
                        return done(err, false, { message: "Error updating user" });
                      }
                      if (_.isEmpty(user)) {
                        sails.log.error("No user found");
                        return done("No user found", false, { message: "No user found" });
                      }

                      if (that.hasPostSaveTriggerConfigured(configAAF, 'onUpdate')) {
                        that.triggerPostSaveTriggers(user as unknown as AnyRecord, configAAF);
                      }

                      if (that.hasPostSaveSyncTriggerConfigured(configAAF, 'onUpdate')) {
                        that.triggerPostSaveSyncTriggers(user as unknown as AnyRecord, configAAF);
                      }

                      sails.log.verbose("Done, returning updated user:");
                      sails.log.verbose(user);
                      const updatedUsers = user as AnyRecord[];
                      that.resolveLinkedUserCandidate(updatedUsers[0])
                        .then((resolvedUser) => done(null, resolvedUser as AnyRecord, {
                          message: 'Logged In Successfully'
                        }))
                        .catch((resolveErr: unknown) => done(resolveErr, false));
                      return;
                    });

                  } else {
                    return done('All required conditions for login not met', false, { message: 'All required conditions for login not met' });
                  }

                });

              } else {

                User.update({
                  username: userObj.username
                }).set(userObj).exec(function (err: unknown, user: unknown) {
                  if (err) {
                    sails.log.error("Error updating user:");
                    sails.log.error(err);
                    return done(err, false, { message: "Error updating user" });
                  }
                  if (_.isEmpty(user)) {
                    sails.log.error("No user found");
                    return done("No user found", false, { message: "No user found" });
                  }

                  if (that.hasPostSaveTriggerConfigured(configAAF, 'onUpdate')) {
                    that.triggerPostSaveTriggers(user as unknown as AnyRecord, configAAF);
                  }

                  if (that.hasPostSaveSyncTriggerConfigured(configAAF, 'onUpdate')) {
                    that.triggerPostSaveSyncTriggers(user as unknown as AnyRecord, configAAF);
                  }

                  sails.log.verbose("Done, returning updated user:");
                  sails.log.verbose(user);
                  const updatedUsers = user as AnyRecord[];
                  that.resolveLinkedUserCandidate(updatedUsers[0])
                    .then((resolvedUser) => done(null, resolvedUser as AnyRecord, {
                      message: 'Logged In Successfully'
                    }))
                    .catch((resolveErr: unknown) => done(resolveErr, false));
                  return;
                });

              }

              }).catch(() => done(null, false, { message: 'Account is disabled' })); // end AAF disabled gate
            } else {
              sails.log.verbose("At AAF Strategy verify, creating new user...");
              // first time login, create with default role
              const attrs = (jwt_payload[aafAttributes] ?? {}) as AnyRecord;
              let userToCreate: AnyRecord = {
                username: userName,
                name: attrs.cn,
                email: String(attrs.mail ?? '').toLowerCase(),
                displayname: attrs.displayname,
                cn: attrs.cn,
                edupersonscopedaffiliation: attrs.edupersonscopedaffiliation,
                edupersontargetedid: attrs.edupersontargetedid,
                edupersonprincipalname: attrs.edupersonprincipalname,
                givenname: attrs.givenname,
                surname: attrs.surname,
                type: 'aaf',
                roles: aafDefRoles,
                lastLogin: new Date()
              };
              sails.log.verbose(userToCreate);

              const emailAuthorizedCheck = that.checkAuthorizedEmail(String(userToCreate.email ?? ''), brandName, 'aaf');
              if (!emailAuthorizedCheck) {
                return done("authorized-email-denied", false);
              }

              const configAAF = _.get(defAuthConfig, 'aaf', {});
              if (that.hasPreSaveTriggerConfigured(configAAF, 'onCreate')) {
                that.triggerPreSaveTriggers(userToCreate, configAAF).then((userAdditionalInfo: AnyRecord) => {

                  const success = that.checkAllTriggersSuccessOrFailure(userAdditionalInfo);
                  if (success) {
                    userToCreate = userAdditionalInfo;
                    User.create(userToCreate).exec(function (err: unknown, newUser: unknown) {
                      if (err) {
                        sails.log.error("Error creating new user:");
                        sails.log.error(err);
                        return done(err, false);
                      }

                      if (that.hasPostSaveTriggerConfigured(configAAF, 'onCreate')) {
                        that.triggerPostSaveTriggers(newUser as AnyRecord, configAAF);
                      }

                      if (that.hasPostSaveSyncTriggerConfigured(configAAF, 'onCreate')) {
                        that.triggerPostSaveSyncTriggers(newUser as AnyRecord, configAAF);
                      }

                      sails.log.verbose("Done, returning new user:");
                      sails.log.verbose(newUser);
                      that.resolveLinkedUserCandidate(newUser)
                        .then((resolvedUser) => done(null, resolvedUser as AnyRecord))
                        .catch((resolveErr: unknown) => done(resolveErr, false));
                      return;
                    });
                  } else {
                    return done(`All required conditions for login not met ${userAdditionalInfo.email}`, false);
                  }
                });


              } else {

                User.create(userToCreate).exec(function (err: unknown, newUser: unknown) {
                  if (err) {
                    sails.log.error("Error creating new user:");
                    sails.log.error(err);
                    return done(err, false);
                  }

                  if (that.hasPostSaveTriggerConfigured(configAAF, 'onCreate')) {
                    that.triggerPostSaveTriggers(newUser as AnyRecord, configAAF);
                  }

                  if (that.hasPostSaveSyncTriggerConfigured(configAAF, 'onCreate')) {
                    that.triggerPostSaveSyncTriggers(newUser as AnyRecord, configAAF);
                  }

                  sails.log.verbose("Done, returning new user:");
                  sails.log.verbose(newUser);
                  that.resolveLinkedUserCandidate(newUser)
                    .then((resolvedUser) => done(null, resolvedUser as AnyRecord))
                    .catch((resolveErr: unknown) => done(resolveErr, false));
                  return;
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
      this.registerSailsHook('on', 'ready', async () => {
        const defAuthConfig = this.getAuthConfig(BrandingService.getDefault().name);
        sails.log.verbose(`OIDC, checking if within active array: ${defAuthConfig.active}`);
        if (defAuthConfig.active != undefined && defAuthConfig.active.indexOf('oidc') != -1) {
          const that = this;
          sails.log.verbose(`OIDC is active, configuring....`);
          let oidcConfigArray: OidcAuthConfig[] = [];
          if (Array.isArray(defAuthConfig.oidc)) {
            oidcConfigArray = defAuthConfig.oidc;
          } else if (_.isObject(defAuthConfig.oidc) && !_.isEmpty(defAuthConfig.oidc)) {
            oidcConfigArray = [defAuthConfig.oidc as OidcAuthConfig];
          }
          for (const oidcConfig of oidcConfigArray) {
            const oidcOpts = oidcConfig.opts;
            const {
              Issuer,
              Strategy
            } = require('openid-client');
            let configured = false;
            let discoverAttemptsCtr = 0;
            while (!configured && discoverAttemptsCtr < oidcConfig.discoverAttemptsMax) {
              discoverAttemptsCtr++;
              try {
                let issuer;
                if (_.isString(oidcOpts.issuer)) {
                  sails.log.verbose(`OIDC, using issuer URL for discovery: ${oidcOpts.issuer}`);
                  issuer = await Issuer.discover(oidcOpts.issuer);
                } else {
                  sails.log.verbose(`OIDC, using issuer hardcoded configuration:`);
                  sails.log.verbose(JSON.stringify(oidcOpts.issuer));
                  issuer = new Issuer(oidcOpts.issuer);
                }
                configured = true;
                sails.log.verbose(`OIDC, Got issuer config, after ${discoverAttemptsCtr} attempt(s).`);
                sails.log.verbose(issuer);
                const oidcClient = new issuer.Client(oidcOpts.client);
                let verifyCallbackFn = (req: AnyRecord, tokenSet: AnyRecord, userinfo: AnyRecord, done: DoneCallback) => {
                  that.openIdConnectAuthVerifyCallback(oidcConfig as unknown as AnyRecord, issuer as AnyRecord, req, tokenSet, userinfo, done);
                };
                if (oidcConfig.userInfoSource == 'tokenset_claims') {
                  verifyCallbackFn = (req: AnyRecord, tokenSet: AnyRecord, _userinfo: AnyRecord, done: DoneCallback) => {
                    that.openIdConnectAuthVerifyCallback(oidcConfig as unknown as AnyRecord, issuer as AnyRecord, req, tokenSet, undefined, done);
                  };
                }
                let passportIdentifier = 'oidc';
                if (!_.isEmpty(oidcConfig.identifier)) {
                  passportIdentifier = `oidc-${oidcConfig.identifier}`
                }

                (sails.config.passport as PassportLike).use(passportIdentifier, new Strategy({
                  client: oidcClient,
                  passReqToCallback: true,
                  params: oidcOpts.params
                }, verifyCallbackFn));
                sails.log.info(`OIDC is active, client ${passportIdentifier} configured and ready.`);


              } catch (e) {
                sails.log.error(`Failed to discover, attempt# ${discoverAttemptsCtr}:`);
                sails.log.error(e);
                await this.sleep(oidcConfig.discoverFailureSleep ?? 1000);
              }
            }
          }
        }
      });
    }

    protected openIdConnectAuthVerifyCallback(
      oidcConfig: AnyRecord,
      issuer: AnyRecord,
      req: AnyRecord,
      tokenSet: AnyRecord,
      userinfo: AnyRecord | undefined = undefined,
      done: DoneCallback
    ) {
      const that = this;
      const session = (req.session ?? {}) as AnyRecord;
      const query = (req.query ?? {}) as AnyRecord;
      const logoutFromAuthServer = _.get(oidcConfig, 'logoutFromAuthServer', true);
      if (logoutFromAuthServer) {
        session.logoutUrl = issuer.end_session_endpoint;
        const postLogoutUris = (_.get(oidcConfig.opts, 'client.post_logout_redirect_uris', []) ?? []) as string[];
        if (!_.isEmpty(postLogoutUris)) {
          session.logoutUrl = `${session.logoutUrl}?post_logout_redirect_uri=${postLogoutUris[0]}`;
        }
      } else {
        session.logoutUrl = sails.config.auth.postLogoutRedir
      }
      req.session = session;
      if (session.redirUrl != null) {
        //the session url changes after login so we lose this value if we don't put it on the queru string
        query.redirUrl = session.redirUrl;
        req.query = query;
      }

      sails.log.verbose(`OIDC login success, tokenset: `);
      sails.log.verbose(JSON.stringify(tokenSet));
      sails.log.verbose(`Claims:`);
      const tokenClaims = typeof tokenSet.claims === 'function' ? tokenSet.claims() : {};
      sails.log.verbose(JSON.stringify(tokenClaims));
      if (!_.isUndefined(userinfo)) {
        sails.log.verbose(`Userinfo:`);
        sails.log.verbose(JSON.stringify(userinfo));
      } else {
        userinfo = tokenClaims as AnyRecord;
      }
      if (oidcConfig.debugMode === true) {
        sails.log.info("OIDC debug mode is active, intentionally failing the login, and redirecting to failure page with all details of this login attempt.");
        const err = {
          userinfo: userinfo,
          claims: tokenClaims,
          tokenSet: tokenSet
        };
        session.errorTextRaw = JSON.stringify(err, null, 2);
        return done(null, false);
      }
      const brandName = (session.branding as string | undefined) ?? BrandingService.getDefault().name;
      const brand: BrandingModel = BrandingService.getBrand(brandName);
      const claimsMappings = (oidcConfig.claimMappings ?? {}) as AnyRecord;
      let userName = '';
      const tmpUserName = String(_.get(userinfo, claimsMappings['username'] as string, ''));
      const claimsMappingOptions = (oidcConfig.claimMappingOptions ?? {}) as Record<string, unknown>;
      let usernameToLowercase = false;
      if (!_.isUndefined(claimsMappingOptions) && !_.isEmpty(claimsMappingOptions)) {
        usernameToLowercase = !!claimsMappingOptions['usernameToLowercase'];
      }
      sails.log.verbose("usernameToLowercase " + usernameToLowercase);
      if (usernameToLowercase) {
        userName = tmpUserName.toLowerCase();
        sails.log.verbose("usernameToLowercase " + userName);
      } else {
        userName = tmpUserName;
        sails.log.verbose(userName);
      }
      const defAuthRole = RolesService.getDefAuthenticatedRole(brand);
      const defAuthRoleName = defAuthRole?.name ?? 'Researcher';
      const openIdConnectDefRoles = _.map(RolesService.getNestedRoles(defAuthRoleName, brand.roles), 'id');

      // This can occur when the claim mappings are incorrect or a login was cancelled
      if (_.isEmpty(userName)) {
        return done(null, null, {
          message: 'Rejected as username does not have a value'
        });
      }

      User.findOne({
        username: userName
      }, function (err: unknown, user: unknown) {
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
          const userObj = user as AnyRecord;
          // Gate disabled users
          that.assertAuthenticationAllowed(userObj).then(() => {
          sails.log.error("At OIDC Strategy verify, updating new user...");
          userObj.lastLogin = new Date();
          const additionalAttributesMapping = claimsMappings['additionalAttributes'];
          userObj.additionalAttributes = that.mapAdditionalAttributes(
            userinfo,
            (typeof additionalAttributesMapping === 'object' && additionalAttributesMapping != null
              ? additionalAttributesMapping
              : {}) as Record<string, string>
          );
          userObj.name = _.get(userinfo, claimsMappings['name'] as string ?? '');
          userObj.email = String(_.get(userinfo, claimsMappings['email'] as string ?? '', '')).toLowerCase();
          userObj.displayname = _.get(userinfo, claimsMappings['displayName'] as string ?? '');
          userObj.cn = _.get(userinfo, claimsMappings['cn'] as string ?? '');
          userObj.givenname = _.get(userinfo, claimsMappings['givenname'] as string ?? '');
          userObj.surname = _.get(userinfo, claimsMappings['surname'] as string ?? '');

          if (that.hasPreSaveTriggerConfigured(oidcConfig, 'onUpdate')) {
            that.triggerPreSaveTriggers(userObj, oidcConfig as AnyRecord).then((userAdditionalInfo: AnyRecord) => {

              const success = that.checkAllTriggersSuccessOrFailure(userAdditionalInfo);
              if (success) {
                User.update({
                  username: _.get(userAdditionalInfo, 'username')
                }).set(userAdditionalInfo).exec(function (err: unknown, user: unknown) {
                  if (err) {
                    sails.log.error("Error updating user:");
                    sails.log.error(err);
                    return done(err, false);
                  }
                  if (_.isEmpty(user)) {
                    sails.log.error("No user found");
                    return done("No user found", false);
                  }

                  if (that.hasPostSaveTriggerConfigured(oidcConfig, 'onUpdate')) {
                    that.triggerPostSaveTriggers(user as unknown as AnyRecord, oidcConfig as AnyRecord);
                  }

                  if (that.hasPostSaveSyncTriggerConfigured(oidcConfig, 'onUpdate')) {
                    that.triggerPostSaveSyncTriggers(user as unknown as AnyRecord, oidcConfig as AnyRecord);
                  }

                  sails.log.verbose("Done, returning updated user:");
                  sails.log.verbose(user);
                  const updatedUsers = user as AnyRecord[];
                  that.resolveLinkedUserCandidate(updatedUsers[0])
                    .then((resolvedUser) => done(null, resolvedUser as AnyRecord))
                    .catch((resolveErr: unknown) => done(resolveErr, false));
                  return;
                });
              } else {
                return done('All required conditions for login not met', false);
              }

            });

          } else {

            User.update({
              username: userObj.username
            }).set(userObj).exec(function (err: unknown, user: unknown) {
              if (err) {
                sails.log.error("Error updating user:");
                sails.log.error(err);
                return done(err, false);
              }
              if (_.isEmpty(user)) {
                sails.log.error("No user found");
                return done("No user found", false);
              }

              if (that.hasPostSaveTriggerConfigured(oidcConfig, 'onUpdate')) {
                that.triggerPostSaveTriggers(user as unknown as AnyRecord, oidcConfig as AnyRecord);
              }

              if (that.hasPostSaveSyncTriggerConfigured(oidcConfig, 'onUpdate')) {
                that.triggerPostSaveSyncTriggers(user as unknown as AnyRecord, oidcConfig as AnyRecord);
              }

              sails.log.verbose("Done, returning updated user:");
              sails.log.verbose(user);
              const updatedUsers = user as AnyRecord[];
              that.resolveLinkedUserCandidate(updatedUsers[0])
                .then((resolvedUser) => done(null, resolvedUser as AnyRecord))
                .catch((resolveErr: unknown) => done(resolveErr, false));
              return;
            });

          }

          }).catch(() => done(null, false, { message: 'Account is disabled' })); // end OIDC disabled gate
        } else {
          sails.log.verbose("At OIDC Strategy verify, creating new user...");
          let userToCreate: AnyRecord;
          try {
            const additionalAttributesMapping = claimsMappings['additionalAttributes'];
            const additionalAttributes = that.mapAdditionalAttributes(
              userinfo,
              (typeof additionalAttributesMapping === 'object' && additionalAttributesMapping != null
                ? additionalAttributesMapping
                : {}) as Record<string, string>
            );
            // first time login, create with default role
            userToCreate = {
              username: userName,
              name: _.get(userinfo, claimsMappings['name'] as string ?? ''),
              email: String(_.get(userinfo, claimsMappings['email'] as string ?? '', '')).toLowerCase(),
              displayname: _.get(userinfo, claimsMappings['displayName'] as string ?? ''),
              cn: _.get(userinfo, claimsMappings['cn'] as string ?? ''),
              givenname: _.get(userinfo, claimsMappings['givenname'] as string ?? ''),
              surname: _.get(userinfo, claimsMappings['surname'] as string ?? ''),
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

          const emailAuthorizedCheck = that.checkAuthorizedEmail(String(userToCreate.email ?? ''), brandName, 'oidc');
          if (!emailAuthorizedCheck) {
            return done("authorized-email-denied", false);
          }

          if (that.hasPreSaveTriggerConfigured(oidcConfig, 'onCreate')) {
            that.triggerPreSaveTriggers(userToCreate, oidcConfig as AnyRecord).then((userAdditionalInfo: AnyRecord) => {

              const success = that.checkAllTriggersSuccessOrFailure(userAdditionalInfo);
              if (success) {

                User.create(userAdditionalInfo).exec(function (err: unknown, newUser: unknown) {
                  if (err) {
                    sails.log.error("Error creating new user:");
                    sails.log.error(err);
                    return done(err, false);
                  }

                  if (that.hasPostSaveTriggerConfigured(oidcConfig, 'onCreate')) {
                    that.triggerPostSaveTriggers(newUser as AnyRecord, oidcConfig as AnyRecord);
                  }

                  if (that.hasPostSaveSyncTriggerConfigured(oidcConfig, 'onCreate')) {
                    that.triggerPostSaveSyncTriggers(newUser as AnyRecord, oidcConfig as AnyRecord);
                  }

                  sails.log.verbose("Done, returning new user:");
                  sails.log.verbose(newUser);
                  that.resolveLinkedUserCandidate(newUser)
                    .then((resolvedUser) => done(null, resolvedUser as AnyRecord))
                    .catch((resolveErr: unknown) => done(resolveErr, false));
                  return;
                });

              } else {
                return done('All required conditions for login not met', false);
              }
            });

          } else {

            User.create(userToCreate).exec(function (err: unknown, newUser: unknown) {
              if (err) {
                sails.log.error("Error creating new user:");
                sails.log.error(err);
                return done(err, false);
              }

              if (that.hasPostSaveTriggerConfigured(oidcConfig, 'onCreate')) {
                that.triggerPostSaveTriggers(newUser as AnyRecord, oidcConfig as AnyRecord);
              }

              if (that.hasPostSaveSyncTriggerConfigured(oidcConfig, 'onCreate')) {
                that.triggerPostSaveSyncTriggers(newUser as AnyRecord, oidcConfig as AnyRecord);
              }

              sails.log.verbose("Done, returning new user:");
              sails.log.verbose(newUser);
              that.resolveLinkedUserCandidate(newUser)
                .then((resolvedUser) => done(null, resolvedUser as AnyRecord))
                .catch((resolveErr: unknown) => done(resolveErr, false));
              return;
            });

          }
        }
      });
    }



    protected bearerTokenAuthInit = () => {
      const BearerStrategy = require('passport-http-bearer').Strategy;
      const that = this;
      (sails.config.passport as PassportLike).use('bearer', new BearerStrategy(
        function (token: string, done: DoneCallback) {
          if (!_.isEmpty(token) && !_.isUndefined(token)) {
            const tokenHash = crypto.createHash('sha256').update(token).digest('base64');
            User.findOne({
              token: tokenHash
            }).populate('roles').exec(function (err: unknown, user: unknown) {
              if (err) {
                return done(err);
              }
              if (!user) {

                return done(null, false);
              }
              // Gate disabled users
              that.assertAuthenticationAllowed(user as AnyRecord).then(() => {
                that.resolveLinkedUserCandidate(user)
                  .then((resolvedUser) => done(null, resolvedUser as AnyRecord, {
                    scope: 'all'
                  }))
                  .catch((resolveErr: unknown) => done(resolveErr));
              }).catch(() => done(null, false));
              return;
            });
          } else {
            // empty token, deny
            return done(null, false);
          }
        }
      ));
    }

    protected initDefAdmin = (defRoles: AnyRecord[], defAdminRole: AnyRecord) => {
      const authConfig = this.getAuthConfig(BrandingService.getDefault().name);
      const usernameField = authConfig.local?.usernameField ?? 'username';
      const passwordField = authConfig.local?.passwordField ?? 'password';
      const defAdminUsers = (defAdminRole.users ?? []) as AnyRecord[];
      let defaultUser = _.find(defAdminUsers, (o: AnyRecord) => {
        return o[usernameField] == authConfig.local?.default?.adminUser
      }) as AnyRecord | undefined;

      if (defaultUser == null) {
        defaultUser = {
          type: 'local',
          name: 'Local Admin'
        } as AnyRecord;
        defaultUser[usernameField] = authConfig.local?.default?.adminUser;
        defaultUser[passwordField] = authConfig.local?.default?.adminPw;
        defaultUser["email"] = authConfig.local?.default?.email;
        if (authConfig.local?.default?.token) {
          defaultUser["token"] = crypto.createHash('sha256').update(authConfig.local.default.token).digest('base64');
        }
        sails.log.verbose("Default user missing, creating...");
        return super.getObservable<UserModel>(User.create(defaultUser))
          .pipe(flatMap(defUser => {
            // START Sails 1.0 upgrade
            const defRoleIds = _.map(defRoles, (o: AnyRecord) => {
              return o.id;
            }) as Array<string | number>;
            const defUserId = (defUser as AnyRecord).id as string | number;
            let q = User.addToCollection(defUserId, 'roles').members(defRoleIds);
            // END Sails 1.0 upgrade
            return super.getObservable<Record<string, unknown>>(q, 'exec', 'simplecb')
              .pipe(flatMap(_dUser => {
                return from(defRoles)
                  .pipe(map(roleObserved => {
                    const role: AnyRecord = roleObserved as AnyRecord;
                    // START Sails 1.0 upgrade
                    // role.users.add(defUser.id)
                    const roleId = role.id as string | number;
                    q = Role.addToCollection(roleId, 'users').members([defUserId]);
                    // END Sails 1.0 upgrade
                    return super.getObservable<Record<string, unknown>>(q, 'exec', 'simplecb');
                  }));
              })
                , last()
                , flatMap(_lastRole => {
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

    protected mapAdditionalAttributes(profile: unknown, attributeMappings: Record<string, string>) {
      const additionalAttributes: Record<string, unknown> = {};
      for (const attributeMapping in attributeMappings) {
        additionalAttributes[attributeMapping] = _.get(profile, attributeMapping);
      }
      return additionalAttributes;
    }

    /**
     * Creates a user audit record
     *
     */
    public addUserAuditEvent = (user: unknown, action: string, additionalContext: unknown) => {
      // ignore audit events for users with no user, which had crashed the app when user has already logged out
      if (_.isEmpty(user)) {
        sails.log.verbose('No user to audit, ignoring: ' + action);
        return firstValueFrom(of(null));
      }
      const auditEvent: Record<string, unknown> = {};
      const userObj = user as AnyRecord;
      if (!_.isEmpty(userObj.password)) {
        delete userObj.password;
      }
      userObj.additionalAttributes = this.stringifyObject(userObj.additionalAttributes);
      auditEvent['user'] = userObj;
      auditEvent['action'] = action;
      auditEvent['additionalContext'] = this.stringifyObject(additionalContext);
      sails.log.verbose('Adding user audit event');
      sails.log.verbose(auditEvent);
      return firstValueFrom(super.getObservable<Record<string, unknown>>(UserAudit.create(auditEvent)));
    }

    stringifyObject(object: unknown): unknown {
      return JSON.stringify(object, function (key, value) {
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
    public addLocalUser = (username: string, name: string, email: string, password: string): Observable<UserModel> => {
      const authConfig = this.getAuthConfig(BrandingService.getDefault().name);
      const usernameField = authConfig.local?.usernameField ?? 'username';
      const passwordField = authConfig.local?.passwordField ?? 'password';

      return this.getUserWithUsername(username).pipe(flatMap(user => {
        if (user) {
          return throwError(new Error(`Username already exists`));
        } else {
          return this.findUsersWithEmail(email, null, null).pipe(flatMap(emailCheck => {
            if (_.size(emailCheck) > 0) {
              return throwError(new Error(`Email already exists, it must be unique`));
            } else {
              const newUser: Record<string, unknown> = {
                type: 'local',
                name: name
              };
              if (!_.isEmpty(email)) {
                newUser["email"] = email;
              }
              newUser[usernameField] = username;
              newUser[passwordField] = password;
              return super.getObservable<UserModel>(User.create(newUser));
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
    public bootstrap = (defRoles: unknown) => {
      sails.log.verbose("Bootstrapping users....");
      const defAdminRole = RolesService.getAdminFromRoles(defRoles as RoleModel[]);
      return of(defAdminRole)
        .pipe(flatMap(defAdminRole => {
          this.localAuthInit();
          this.aafAuthInit();
          this.openIdConnectAuth();
          this.bearerTokenAuthInit();
          return this.initDefAdmin(defRoles as AnyRecord[], defAdminRole as unknown as AnyRecord);
        }));
    }

    public getUserWithUsername = (username: string): Observable<UserModel | null> => {
      return this.getObservable<UserModel | null>(User.findOne({
        username: username
      }).populate('roles'));
    }

    public getUserWithId = (userid: string | number): Observable<UserModel | null> => {
      return this.getObservable<UserModel | null>(User.findOne({
        id: userid
      }).populate('roles'));
    }

    /**
     * @return Collection of all users (local and AAF)
     */
    public getUsers = (): Observable<UserModel[]> => {
      return super.getObservable<UserModel[]>(User.find({}).populate('roles'));
    }

    /**
     * Retrieve all users that hold at least one role for the supplied brand.
     * @param brand The brand or brand id to scope the search to.
     */
    public getUsersForBrand = (brand: BrandingModel | string): Observable<UserModel[]> => {
      const brandId = typeof brand === 'string' ? brand : _.get(brand, 'id');
      if (_.isEmpty(brandId)) {
        return of([]);
      }

      return super.getObservable<UserModel[]>(User.find({}).populate('roles'))
        .pipe(flatMap(async (users: UserModel[]) => {
          const activeLinks = typeof UserLink !== 'undefined'
            ? await UserLink.find({ brandId: brandId, status: 'active' })
            : [];
          const linkedSecondaryIds = new Set(_.map(activeLinks as AnyRecord[], (link: unknown) => String((link as AnyRecord).secondaryUserId ?? '')));
          return _.filter(users, (user: unknown) => {
            const userObj = user as AnyRecord;
            return this.hasRoleInBrand(userObj, String(brandId)) || linkedSecondaryIds.has(String(userObj.id ?? ''));
          });
        }));
    }

    public getEffectiveUser = (userOrId: unknown): Observable<UserModel | null> => {
      if (_.isEmpty(userOrId)) {
        return of(null);
      }

      if (_.isString(userOrId) || _.isNumber(userOrId)) {
        return this.getUserWithId(String(userOrId)).pipe(flatMap(user => {
          if (user != null) {
            return this.getEffectiveUser(user);
          }
          return this.getUserWithUsername(String(userOrId)).pipe(flatMap(userByUsername => {
            if (userByUsername != null) {
              return this.getEffectiveUser(userByUsername);
            }
            return of(null);
          }));
        }));
      }

      const userObj = userOrId as AnyRecord;
      this.normalizeAccountLinkState(userObj);
      if (_.isEmpty(userObj.linkedPrimaryUserId)) {
        return of(userObj as UserModel);
      }

      return this.getUserWithId(String(userObj.linkedPrimaryUserId)).pipe(map(primaryUser => {
        if (primaryUser == null) {
          return userObj as UserModel;
        }
        return primaryUser;
      }));
    }

    public getLinkedAccounts = (primaryUserId: string | UserModel): Observable<UserLinkResponse> => {
      return from((async () => {
        const primaryUser = await firstValueFrom(this.getEffectiveUser(primaryUserId));
        if (_.isEmpty(primaryUser)) {
          throw new Error(`No such user with id:${primaryUserId}`);
        }

        const primaryUserObj = primaryUser as AnyRecord;
        const links = typeof UserLink !== 'undefined'
          ? await UserLink.find({ primaryUserId: String(primaryUserObj.id ?? ''), status: 'active' })
          : [];
        const secondaryIds = _.map(links as AnyRecord[], (link: unknown) => String((link as AnyRecord).secondaryUserId ?? ''));
        const secondaryUsers = _.isEmpty(secondaryIds)
          ? []
          : await User.find({ id: secondaryIds }).populate('roles');
        const secondaryUsersById = _.keyBy(secondaryUsers as AnyRecord[], user => String(user.id ?? ''));
        const linkedAccounts = _.compact(_.map(links as AnyRecord[], (link: unknown) => {
          const linkObj = link as AnyRecord;
          const secondary = secondaryUsersById[String(linkObj.secondaryUserId ?? '')];
          if (_.isEmpty(secondary)) {
            return null;
          }
          this.normalizeAccountLinkState(secondary);
          return this.toLinkedUserSummary(secondary, linkObj.createdAt as string | Date | undefined);
        }));

        return {
          primary: this.toLinkedUserSummary(primaryUserObj),
          linkedAccounts: linkedAccounts
        };
      })());
    }

    public searchLinkCandidates = (query: string, brandId: string, excludeUserId?: string): Observable<LinkedUserSummary[]> => {
      const queryText = _.trim(query).toLowerCase();
      return from((async () => {
        const users = await User.find({}).populate('roles');
        const activeLinks = typeof UserLink !== 'undefined'
          ? await UserLink.find({ status: 'active' })
          : [];
        const primaryUserIdsWithLinkedAccounts = new Set(
          _.map(activeLinks as AnyRecord[], (link: unknown) => String((link as AnyRecord).primaryUserId ?? ''))
        );
        const enrichedUsers = await this.enrichUsersWithEffectiveDisabledState(users as AnyRecord[]);
        return _.chain(enrichedUsers)
          .map(user => {
            this.normalizeAccountLinkState(user);
            return user;
          })
          .filter(user => {
            if (user.effectiveLoginDisabled === true) {
              return false;
            }
            if (String(user.id ?? '') === String(excludeUserId ?? '')) {
              return false;
            }
            if (String(user.accountLinkState ?? 'active') !== 'active') {
              return false;
            }
            if (primaryUserIdsWithLinkedAccounts.has(String(user.id ?? ''))) {
              return false;
            }
            const hasBrandRole = this.hasRoleInBrand(user, brandId);
            const hasNoRoles = _.isEmpty(user.roles);
            if (!hasBrandRole && !hasNoRoles) {
              return false;
            }
            if (_.isEmpty(queryText)) {
              return true;
            }
            const haystack = [
              String(user.username ?? ''),
              String(user.name ?? ''),
              String(user.email ?? '')
            ].join(' ').toLowerCase();
            return haystack.includes(queryText);
          })
          .map(user => this.toLinkedUserSummary(user))
          .sortBy(['name', 'username'])
          .value();
      })());
    }

    public linkAccounts = (primaryUserId: string, secondaryUserId: string, actor: string, brandId: string): Observable<UserLinkResponse> => {
      return from((async () => {
        if (_.isEmpty(primaryUserId) || _.isEmpty(secondaryUserId)) {
          throw new Error('Both primary and secondary users are required');
        }

        const primaryEffective = await firstValueFrom(this.getEffectiveUser(primaryUserId));
        const secondaryUser = await firstValueFrom(this.getUserWithId(secondaryUserId));
        if (_.isEmpty(primaryEffective) || _.isEmpty(secondaryUser)) {
          throw new Error('Both users must exist before linking');
        }

        const primaryUser = primaryEffective as AnyRecord;
        const secondaryUserObj = secondaryUser as AnyRecord;
        this.normalizeAccountLinkState(primaryUser);
        this.normalizeAccountLinkState(secondaryUserObj);

        const primaryDisabledState = await this.resolveEffectiveDisabledState(primaryUser);
        if (primaryDisabledState.effectiveLoginDisabled) {
          throw new Error('Cannot link accounts: primary user is disabled');
        }
        const secondaryDisabledState = await this.resolveEffectiveDisabledState(secondaryUserObj);
        if (secondaryDisabledState.effectiveLoginDisabled) {
          throw new Error('Cannot link accounts: secondary user is disabled');
        }

        if (String(primaryUser.id ?? '') === String(secondaryUserObj.id ?? '')) {
          throw new Error('Cannot link a user to itself');
        }
        if (String(primaryUser.accountLinkState ?? 'active') === 'linked-alias') {
          throw new Error('Primary user cannot be a linked alias');
        }
        if (!_.isEmpty(secondaryUserObj.linkedPrimaryUserId) && String(secondaryUserObj.linkedPrimaryUserId) !== String(primaryUser.id ?? '')) {
          throw new Error('Secondary user is already linked to another primary account');
        }
        if (!this.hasRoleInBrand(primaryUser, brandId)) {
          throw new Error('Primary user must already belong to the current brand');
        }

        const secondaryBrandRoles = this.getRolesForBrand(secondaryUserObj, brandId);
        const secondaryForeignRoles = _.filter(secondaryUserObj.roles as AnyRecord[] ?? [], (role: unknown) => {
          const roleObj = role as AnyRecord;
          const branding = roleObj.branding as string | AnyRecord | undefined;
          const roleBrandId = _.isObject(branding) ? String((branding as AnyRecord).id ?? '') : String(branding ?? '');
          return roleBrandId !== brandId;
        });
        if (!_.isEmpty(secondaryForeignRoles)) {
          throw new Error('Secondary user belongs to a different brand and cannot be linked here');
        }

        const existingLink = typeof UserLink !== 'undefined'
          ? await UserLink.findOne({ secondaryUserId: String(secondaryUserObj.id ?? ''), status: 'active' })
          : null;
        if (!_.isEmpty(existingLink)) {
          throw new Error('Secondary user is already linked');
        }

        const secondaryOwnLinks = typeof UserLink !== 'undefined'
          ? await UserLink.findOne({ primaryUserId: String(secondaryUserObj.id ?? ''), status: 'active' })
          : null;
        if (!_.isEmpty(secondaryOwnLinks)) {
          throw new Error('Secondary user already has linked accounts');
        }

        if (typeof UserLink !== 'undefined') {
          await UserLink.create({
            primaryUserId: String(primaryUser.id ?? ''),
            primaryUsername: String(primaryUser.username ?? ''),
            secondaryUserId: String(secondaryUserObj.id ?? ''),
            secondaryUsername: String(secondaryUserObj.username ?? ''),
            brandId: brandId,
            status: 'active',
            createdBy: actor
          });
        }

        const primaryBrandRoleIds = new Set(_.map(this.getRolesForBrand(primaryUser, brandId), (role: unknown) => String((role as AnyRecord).id ?? '')));
        const secondaryBrandRoleIds = _.map(secondaryBrandRoles, (role: unknown) => String((role as AnyRecord).id ?? ''));
        const roleIdsToMerge = _.filter(secondaryBrandRoleIds, roleId => !primaryBrandRoleIds.has(roleId));
        if (!_.isEmpty(roleIdsToMerge)) {
          const addRoleQuery = User.addToCollection(String(primaryUser.id ?? ''), 'roles').members(roleIdsToMerge);
          await firstValueFrom(this.getObservable(addRoleQuery, 'exec', 'simplecb'));
        }

        const retainedSecondaryRoleIds = _.map(_.filter(secondaryUserObj.roles as AnyRecord[] ?? [], (role: unknown) => {
          const roleObj = role as AnyRecord;
          const branding = roleObj.branding as string | AnyRecord | undefined;
          const roleBrandId = _.isObject(branding) ? String((branding as AnyRecord).id ?? '') : String(branding ?? '');
          return roleBrandId !== brandId;
        }), (role: unknown) => String((role as AnyRecord).id ?? ''));
        const replaceRoleQuery = User.replaceCollection(String(secondaryUserObj.id ?? ''), 'roles').members(retainedSecondaryRoleIds);
        await firstValueFrom(this.getObservable(replaceRoleQuery, 'exec', 'simplecb'));

        await User.update({ id: String(secondaryUserObj.id ?? '') }).set({
          token: '',
          accountLinkState: 'linked-alias',
          linkedPrimaryUserId: String(primaryUser.id ?? '')
        });

        const recordsRewritten = await this.rewriteLinkedRecordAuthorizations(primaryUser, secondaryUserObj, actor, brandId);

        await this.addUserAuditEvent({ username: actor }, 'link-accounts', {
          primaryUserId: primaryUser.id,
          primaryUsername: primaryUser.username,
          secondaryUserId: secondaryUserObj.id,
          secondaryUsername: secondaryUserObj.username,
          brandId: brandId,
          rolesMerged: roleIdsToMerge.length,
          recordsRewritten: recordsRewritten
        });

        const linkedAccounts = await firstValueFrom(this.getLinkedAccounts(primaryUser as UserModel));
        return {
          ...linkedAccounts,
          impact: {
            recordsRewritten: recordsRewritten,
            rolesMerged: roleIdsToMerge.length
          }
        };
      })());
    }

    public setUserKey = (userid: string | number, uuid: string | null): Observable<UserModel> => {
      const uuidHash = _.isEmpty(uuid) ? null : crypto.createHash('sha256').update(uuid as string).digest('base64');
      return this.getUserWithId(userid).pipe(flatMap(user => {
        if (user) {
          const q = User.update({
            id: userid
          }, {
            token: uuidHash
          });
          return this.getObservable<UserModel[]>(q, 'exec', 'simplecb')
            .pipe(map((updatedUsers: UserModel[]) => updatedUsers[0] ?? user));
        } else {
          return throwError(new Error('No such user with id:' + userid));
        }
      }));
    }

    public updateUserDetails = (userid: string | number, name: string, email: string, password: string): Observable<UserModel[]> => {
      const authConfig = this.getAuthConfig(BrandingService.getDefault().name);
      const passwordField = authConfig.local?.passwordField ?? 'password';
      return this.getUserWithId(userid).pipe(flatMap(user => {
        if (user) {
          const update: Record<string, unknown> = {
            name: name
          };

          if (!_.isEmpty(email)) {
            update["email"] = email;
          }

          if (!_.isEmpty(password)) {
            let bcrypt: BcryptLike;
            try {
              bcrypt = require('bcrypt') as BcryptLike;
            } catch (_err) {
              bcrypt = require('bcryptjs') as BcryptLike;
            }
            const salt = bcrypt.genSaltSync(10);
            update[passwordField] = bcrypt.hashSync(password, salt);
          }
          const q = User.update({
            id: userid
          }, update);
          return this.getObservable<UserModel[]>(q, 'exec', 'simplecb');
        } else {
          return throwError(new Error('No such user with id:' + userid));
        }
      }));
    }

    public updateUserRoles = (userid: string | number, newRoleIds: Array<string | number>): Observable<UserModel> => {
      return this.getUserWithId(userid).pipe(flatMap(user => {
        if (user) {
          if (_.isEmpty(newRoleIds) || newRoleIds.length == 0) {
            return throwError(new Error('Please assign at least one role'));
          }
          // START Sails 1.0 upgrade
          const q = User.replaceCollection(user.id, 'roles').members(newRoleIds);
          // END Sails 1.0 upgrade
          return this.getObservable<UserModel>(q, 'exec', 'simplecb');
        } else {
          return throwError(new Error('No such user with id:' + userid));
        }
      }));
    }

    private updateUserAfterLogin(user: unknown, done: (err: unknown, user: unknown) => void) {
      const userObj = user as AnyRecord;
      User.update({
        username: userObj.username
      }).set(userObj).exec(function (err: unknown, user: unknown) {
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
        const updatedUsers = user as AnyRecord[];
        return done(null, updatedUsers[0]);
      });
    }

    public hasRole(user: unknown, targetRole: unknown): RoleModel {
      const userObj = user as AnyRecord;
      const targetRoleObj = targetRole as AnyRecord;
      return _.find(userObj.roles as AnyRecord[], (role: unknown) => {
        return (role as AnyRecord).id == targetRoleObj.id;
      }) as unknown as RoleModel;
    }

    public findUsersWithName(name: string, brandId: string, source: unknown = null) {
      const query = {
        name: {
          'contains': name
        }
      };
      // S2TEST-21
      return this.findUsersWithQuery(query, brandId, source);
    }
    // S2TEST-21
    public findUsersWithEmail(email: string, brandId: string | null, source: unknown = null) {
      const query = {
        email: {
          'contains': email
        }
      };
      return this.findUsersWithQuery(query, brandId, source);
    }
    // S2TEST-21
    public findUsersWithQuery(query: unknown, brandId: string | null, source: unknown = null): Observable<UserModel[]> {
      const queryObj = (query ?? {}) as AnyRecord;
      if (!_.isEmpty(source) && !_.isUndefined(source) && !_.isNull(source)) {
        queryObj['type'] = source;
      }
      return this.getObservable<UserModel[]>(User.find(queryObj).populate('roles'))
        .pipe(flatMap(users => {
          if (brandId) {
            _.remove(users, (user: unknown) => {
              const userObj = user as AnyRecord;
              const isInBrand = _.find(userObj.roles as AnyRecord[], (role: unknown) => {
                return (role as AnyRecord).branding == brandId;
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
    public findAndAssignAccessToRecords(pendingValue: string, userid: string): void {
      this.getEffectiveUser(userid).subscribe((effectiveUser: UserModel | null) => {
        const effectiveUsername = _.get(effectiveUser, 'username', userid) as string;
        Record.find({
          'or': [{
            'authorization.editPending': pendingValue
          }, {
            'authorization.viewPending': pendingValue
          }]
        }).meta({
          enableExperimentalDeepTargets: true
        }).then((records) => {
          const recordsArr = records as unknown[];
          if (_.isEmpty(recordsArr)) {
            sails.log.verbose(`UsersService::findAndAssignAccessToRecords() -> No pending records: ${pendingValue}`);
            return;
          }
          sails.log.verbose(`UsersService::findAndAssignAccessToRecords() -> Found ${recordsArr.length} records to assign permissions`);
          for (const record of recordsArr) {
            const recordObj = record as AnyRecord;
            RecordsService.provideUserAccessAndRemovePendingAccess(recordObj.redboxOid as string, effectiveUsername, pendingValue);
          }
        }).catch((error: unknown) => {
          sails.log.warn(`Failed to assign access for user: ${pendingValue}`);
          sails.log.warn(error);
        });
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
      const authorizedDomainsEmails = _.get(brandingAwareData, 'authorizedDomainsEmails', {}) as AuthorizedDomainsEmails;

      if (authorizedDomainsEmails.enabled?.toString() !== 'true') {
        sails.log.warn("Authorized email configuration is disabled.");
        return true;
      }

      const domains = [];
      const emails = [];
      if (authType === 'aaf') {
        domains.push(...(authorizedDomainsEmails.domainsAaf || []));
        emails.push(...(authorizedDomainsEmails.emailsAaf || []));
      } else if (authType === 'oidc') {
        domains.push(...(authorizedDomainsEmails.domainsOidc || []));
        emails.push(...(authorizedDomainsEmails.emailsOidc || []));
      } else {
        sails.log.error(`Authorized domains and emails config problem: any auth type '${authType}'`);
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

declare global {
  let UsersService: Services.Users;
}
