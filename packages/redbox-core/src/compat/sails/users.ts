import {
  installLocalAuthentication,
  installAafAuthentication,
  installOidcAuthentication,
  type IdentityProvidersInput,
} from '../../http/express/identityProviders';
import {
  sailsAuthenticationAccounts,
  sailsAuthenticationProviders,
  sailsHttpIdentity,
} from '../../compat/sails/authentication';
import { getStorageRepositories } from '../../persistence/storage/runtime';
import { getIdentityRepositories } from '../../persistence/runtime';
import { identityProfilePatch } from '../../persistence/identity/profile';
import { identityCallback } from '../../persistence/identity/IdentityRepositories';
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

import { of, from, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap, map, last } from 'rxjs/operators';

import { RoleModel } from '../../model/storage/RoleModel';
import { UserModel } from '../../model/storage/UserModel';
import { Services as Domain } from '../../identity/Users';

import * as crypto from 'crypto';

export namespace Services {
  type AnyRecord = Record<string, unknown>;
  type DoneCallback = (err: unknown, user?: unknown, info?: unknown) => void;

  type PassportLike = {
    serializeUser: (fn: (user: AnyRecord, done: DoneCallback) => void) => void;
    deserializeUser: (fn: (id: string, done: DoneCallback) => void) => void;
    use: (name: string, strategy: unknown) => void;
    authenticate: (strategy: string, options?: unknown) => unknown;
  };

  export class Users extends Domain.Users {
    public constructor() {
      super({
        get repository() {
          return getIdentityRepositories();
        },
        get accounts() {
          return sailsAuthenticationAccounts((...args) => instance.updateChronicle(...args));
        },
        get log() {
          return sails.log;
        },
        defaultBrand: () => BrandingService.getDefault(),
        get recordAccess() {
          return { storage: getStorageRepositories(), records: RecordsService };
        },
        emitSecurityEvent: (actor, action, context) =>
          typeof SecurityEventService === 'undefined'
            ? Promise.resolve()
            : SecurityEventService.emitFromUserAudit(actor, action, context),
      });
      const instance = this;
    }
    protected registerSailsHook(method: 'on' | 'after', events: string | string[], callback: () => unknown): void {
      if (typeof sails === 'undefined' || typeof sails[method] !== 'function') return;
      if (method === 'after') sails.after(events, callback);
      else for (const event of Array.isArray(events) ? events : [events]) sails.on(event, callback);
    }
    public exports(): Record<string, unknown> {
      return Object.fromEntries(
        this._exportedMethods.map(name => {
          const method: unknown = Reflect.get(this, name);
          if (typeof method !== 'function') throw new Error('Missing comparison user operation: ' + name);
          return [name, method.bind(this)];
        })
      );
    }

    protected _exportedMethods: string[] = [
      'bootstrap',
      'updateUserRoles',
      'updateUserDetails',
      'getUserWithId',
      'requireUserInBrand',
      'mergeBrandRoleIds',
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
      'enrichUsersWithLinkMetadata',
      'disableUser',
      'enableUser',
      'getUserAudit',
    ];

    private authenticationProviderInput(): IdentityProvidersInput {
      return sailsAuthenticationProviders(this.authenticationAccounts());
    }

    protected localAuthInit() {
      if (!sails.config.passport) sails.config.passport = new (require('passport').Passport)();
      const passport = sails.config.passport as PassportLike;
      passport.serializeUser((user, done) => done(null, user.id));
      passport.deserializeUser((id, done) => {
        void firstValueFrom(this.getUserWithId(id))
          .then(user => this.resolveLinkedUserCandidate(user))
          .then(user => done(null, user), done);
      });
      installLocalAuthentication(this.authenticationProviderInput());
    }

    protected aafAuthInit = () => {
      this.registerSailsHook('on', 'ready', () => {
        const accounts = this.authenticationAccounts();
        installAafAuthentication(this.authenticationProviderInput(), accounts.aafAuthVerifyCallback.bind(accounts));
      });
    };

    protected openIdConnectAuth = () => {
      this.registerSailsHook('on', 'ready', () => installOidcAuthentication(this.authenticationProviderInput()));
    };

    protected bearerTokenAuthInit = () => {
      const BearerStrategy = require('passport-http-bearer').Strategy;
      (sails.config.passport as PassportLike).use(
        'bearer',
        new BearerStrategy((token: string, done: DoneCallback) => {
          void sailsHttpIdentity()
            .bearerProfile(token)
            .then(user => done(null, user, { scope: 'all' }), done);
        })
      );
    };

    protected initDefAdmin = (defRoles: AnyRecord[], defAdminRole: AnyRecord) => {
      const authConfig = this.getAuthConfig(BrandingService.getDefault().name);
      const usernameField = authConfig.local?.usernameField ?? 'username';
      const passwordField = authConfig.local?.passwordField ?? 'password';
      const defAdminUsers = (defAdminRole.users ?? []) as AnyRecord[];
      let defaultUser = _.find(defAdminUsers, (o: AnyRecord) => {
        return o[usernameField] == authConfig.local?.default?.adminUser;
      }) as AnyRecord | undefined;

      if (defaultUser == null) {
        defaultUser = {
          type: 'local',
          name: 'Local Admin',
        } as AnyRecord;
        defaultUser[usernameField] = authConfig.local?.default?.adminUser;
        defaultUser[passwordField] = authConfig.local?.default?.adminPw;
        defaultUser['email'] = authConfig.local?.default?.email;
        if (authConfig.local?.default?.token) {
          defaultUser['token'] = crypto.createHash('sha256').update(authConfig.local.default.token).digest('base64');
        }

        return this.getObservable<UserModel>(() => getIdentityRepositories().create('user', defaultUser!)).pipe(
          flatMap(defUser => {
            // START Sails 1.0 upgrade
            const defRoleIds = _.map(defRoles, (o: AnyRecord) => {
              return o.id;
            }) as Array<string | number>;
            const defUserId = (defUser as AnyRecord).id as string | number;
            let q = () => getIdentityRepositories().addMemberships('user', defUserId, defRoleIds);
            // END Sails 1.0 upgrade
            return this.getObservable<Record<string, unknown>>(q, 'exec', 'simplecb').pipe(
              flatMap(_dUser => {
                return from(defRoles).pipe(
                  map(roleObserved => {
                    const role: AnyRecord = roleObserved as AnyRecord;
                    // START Sails 1.0 upgrade
                    // role.users.add(defUser.id)
                    const roleId = role.id as string | number;
                    q = () => getIdentityRepositories().addMemberships('role', roleId, [defUserId]);
                    // END Sails 1.0 upgrade
                    return this.getObservable<Record<string, unknown>>(q, 'exec', 'simplecb');
                  })
                );
              }),
              last(),
              flatMap(_lastRole => {
                return of({
                  defUser: defUser,
                  defRoles: defRoles,
                });
              })
            );
          })
        );
      } else {
        return of({
          defUser: defaultUser,
          defRoles: defRoles,
        });
      }
    };

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
      const defAdminRole = RolesService.getAdminFromRoles(defRoles as RoleModel[]);
      return of(defAdminRole).pipe(
        flatMap(defAdminRole => {
          this.localAuthInit();
          this.aafAuthInit();
          this.openIdConnectAuth();
          this.bearerTokenAuthInit();
          return this.initDefAdmin(defRoles as AnyRecord[], defAdminRole as unknown as AnyRecord);
        })
      );
    };

    private updateUserAfterLogin(user: unknown, done: (err: unknown, user: unknown) => void) {
      const userObj = user as AnyRecord;
      identityCallback(
        getIdentityRepositories().update(
          'user',
          {
            username: userObj.username,
          },
          identityProfilePatch(userObj)
        ),
        (err: unknown, user: unknown) => {
          if (err) {
            this.updateChronicle({ usersOperation: 'updateUserAfterLogin', usersOutcome: 'failed' }, [err]);
            return done(err, false);
          }
          if (_.isEmpty(user)) {
            this.updateChronicle({ usersOperation: 'updateUserAfterLogin', usersOutcome: 'failed' });
            return done('No user found', false);
          }

          const updatedUsers = user as AnyRecord[];
          return done(null, updatedUsers[0]);
        }
      );
    }
  }
}

const instanceKey = Symbol.for('@researchdatabox/redbox-core/comparison/users');
export function sailsUsersExports(): Record<string, unknown> {
  // Loader generation may inspect the surface before the global application exists.
  const methods = Object.keys(new Services.Users().exports());
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, instanceKey) as Services.Users | undefined;
        if (!instance) {
          instance = new Services.Users();
          Object.defineProperty(sails, instanceKey, { value: instance });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing comparison operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
