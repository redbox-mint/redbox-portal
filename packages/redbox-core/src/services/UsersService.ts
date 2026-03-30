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
import { UserAttributes } from '../waterline-models/User';
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

  interface UserAuditActor {
    username: string;
    name?: string;
    email?: string;
  }

  interface UserAuditRecord {
    id: string;
    timestamp: string | null;
    action: string;
    actor: UserAuditActor;
    details: string;
    parsedAdditionalContext: unknown;
    rawAdditionalContext: string | null;
    parseError: boolean;
  }

  interface UserAuditSummary {
    returnedCount: number;
    truncated: boolean;
  }

  interface ParsedUserAuditContext {
    parsedAdditionalContext: unknown;
    rawAdditionalContext: string | null;
    parseError: boolean;
  }

  interface UserAuditResponse {
    records: UserAuditRecord[];
    summary: UserAuditSummary;
  }

  interface UserAuditRow extends AnyRecord {
    id?: string;
    action?: string;
    createdAt?: string | Date;
    updatedAt?: string | Date;
    user?: AnyRecord;
    additionalContext?: unknown;
    auditContext?: ParsedUserAuditContext;
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
      'getUserAudit',
    ];

    searchService!: SearchService;

    private getAuthConfig(brandName: string): AuthBrandConfig {
      return (ConfigService.getBrand(brandName, 'auth') as AuthBrandConfig) ?? {};
    }

    private normalizeAccountLinkState(user: UserAttributes | null | undefined): void {
      if (user != null && _.isEmpty(user.accountLinkState)) {
        user.accountLinkState = 'active';
      }
    }

    private hasRoleInBrand(user: UserAttributes | null | undefined, brandId: string): boolean {
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

    private getRolesForBrand(user: UserAttributes | null | undefined, brandId: string): AnyRecord[] {
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

    private toLinkedUserSummary(user: UserAttributes, linkedAt?: string | Date): LinkedUserSummary {
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

    private async resolveEffectiveDisabledState(user: UserAttributes): Promise<{ effectiveLoginDisabled: boolean; disabledByPrimaryUserId?: string; disabledByPrimaryUsername?: string }> {
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

    private async assertAuthenticationAllowed(user: UserAttributes): Promise<void> {
      const state = await this.resolveEffectiveDisabledState(user);
      if (state.effectiveLoginDisabled) {
        throw new Error('Account is disabled');
      }
    }

    public async enrichUsersWithEffectiveDisabledState<T extends UserAttributes>(users: T[]): Promise<T[]> {
      const primaryIds = _.uniq(
        _.compact(_.map(users, (u: T) => !_.isEmpty(u.linkedPrimaryUserId) ? String(u.linkedPrimaryUserId) : null))
      );
      const primaryUsers = _.isEmpty(primaryIds) ? [] : await User.find({ id: primaryIds });
      const primaryUsersById = _.keyBy(primaryUsers as AnyRecord[], (u: AnyRecord) => String(u.id ?? ''));

      return _.map(users, (user: T) => {
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
      const user = await User.findOne({ id: userId });
      if (user == null) {
        throw new Error('User not found');
      }
      if (String((user as unknown as AnyRecord).accountLinkState ?? 'active') === 'linked-alias') {
        throw new Error('Cannot disable a linked alias user. Disable the primary account instead.');
      }
      await User.update({ id: userId }).set({ loginDisabled: true });
      await this.addUserAuditEvent({ username: actor }, 'disable-user', { userId, brandId });
    }

    public async enableUser(userId: string, actor: string, brandId: string): Promise<void> {
      const user = await User.findOne({ id: userId });
      if (user == null) {
        throw new Error('User not found');
      }
      if (String((user as unknown as AnyRecord).accountLinkState ?? 'active') === 'linked-alias') {
        throw new Error('Cannot enable a linked alias user. Enable the primary account instead.');
      }
      await User.update({ id: userId }).set({ loginDisabled: false });
      await this.addUserAuditEvent({ username: actor }, 'enable-user', { userId, brandId });
    }

    private toAuditActor(user: unknown): UserAuditActor {
      const userObj = _.isObject(user) ? user as AnyRecord : {};
      const actor: UserAuditActor = {
        username: String(userObj.username ?? '')
      };

      if (!_.isEmpty(userObj.name)) {
        actor.name = String(userObj.name);
      }
      if (!_.isEmpty(userObj.email)) {
        actor.email = String(userObj.email);
      }

      return actor;
    }

    private toAuditContextString(additionalContext: unknown): string | null {
      if (_.isNil(additionalContext)) {
        return null;
      }
      if (_.isString(additionalContext)) {
        return additionalContext;
      }

      const stringified = this.stringifyObject(additionalContext);
      return _.isString(stringified) ? stringified : null;
    }

    private shouldRedactAuditKey(key: string): boolean {
      const normalizedKey = _.toLower(key);
      return normalizedKey === 'cookie'
        || normalizedKey === 'authorization'
        || normalizedKey.startsWith('x-forwarded-')
        || normalizedKey.includes('password');
    }

    private redactHeaderPairs(value: unknown[]): unknown[] {
      const redactedPairs = [...value];
      for (let index = 0; index < redactedPairs.length - 1; index += 2) {
        const headerName = redactedPairs[index];
        if (_.isString(headerName) && this.shouldRedactAuditKey(headerName)) {
          redactedPairs[index + 1] = '[REDACTED]';
        }
      }
      return redactedPairs;
    }

    private redactAuditValue(value: unknown, contextKey?: string): unknown {
      if (_.isArray(value)) {
        if (_.toLower(contextKey ?? '') === 'rawheaders') {
          return this.redactHeaderPairs(value);
        }
        return _.map(value, (item: unknown) => this.redactAuditValue(item));
      }
      if (_.isPlainObject(value)) {
        if (_.toLower(contextKey ?? '') === 'cookies') {
          return _.mapValues(value as Record<string, unknown>, () => '[REDACTED]');
        }
        return _.reduce(value as Record<string, unknown>, (acc, nestedValue, nestedKey) => {
          acc[nestedKey] = this.shouldRedactAuditKey(nestedKey) ? '[REDACTED]' : this.redactAuditValue(nestedValue, nestedKey);
          return acc;
        }, {} as Record<string, unknown>);
      }
      return value;
    }

    private sanitizeAuditDebugContext(action: string, parsedAdditionalContext: unknown, rawAdditionalContext: string | null, parseError: boolean): {
      parsedAdditionalContext: unknown;
      rawAdditionalContext: string | null;
    } {
      if (!_.includes(['login', 'logout'], action)) {
        return { parsedAdditionalContext, rawAdditionalContext };
      }

      const redactedParsed = this.redactAuditValue(parsedAdditionalContext);
      if (parseError) {
        return {
          parsedAdditionalContext: null,
          rawAdditionalContext: rawAdditionalContext == null ? null : '[REDACTED_UNPARSEABLE_AUDIT_CONTEXT]'
        };
      }

      return {
        parsedAdditionalContext: redactedParsed,
        rawAdditionalContext: redactedParsed == null ? null : JSON.stringify(redactedParsed)
      };
    }

    private parseUserAuditContext(action: string, additionalContext: unknown): ParsedUserAuditContext {
      const rawAdditionalContext = this.toAuditContextString(additionalContext);
      if (_.isNil(rawAdditionalContext)) {
        return {
          parsedAdditionalContext: null,
          rawAdditionalContext: null,
          parseError: false
        };
      }

      try {
        const parsedAdditionalContext = JSON.parse(rawAdditionalContext);
        const sanitized = this.sanitizeAuditDebugContext(action, parsedAdditionalContext, rawAdditionalContext, false);
        return {
          parsedAdditionalContext: sanitized.parsedAdditionalContext,
          rawAdditionalContext: sanitized.rawAdditionalContext,
          parseError: false
        };
      } catch (_error) {
        const sanitized = this.sanitizeAuditDebugContext(action, null, rawAdditionalContext, true);
        return {
          parsedAdditionalContext: sanitized.parsedAdditionalContext,
          rawAdditionalContext: sanitized.rawAdditionalContext,
          parseError: true
        };
      }
    }

    private normalizeAuditTimestamp(value: unknown): string | null {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (_.isString(value)) {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }
      return null;
    }

    private timestampSortValue(row: UserAuditRow): number {
      const timestamp = this.normalizeAuditTimestamp(row.createdAt) ?? this.normalizeAuditTimestamp(row.updatedAt);
      if (timestamp == null) {
        return 0;
      }
      return new Date(timestamp).getTime();
    }

    private matchesSelectedUserForDirectAudit(selectedUser: AnyRecord, row: UserAuditRow): boolean {
      const rowUser = _.isObject(row.user) ? row.user as AnyRecord : {};
      const selectedUserId = String(selectedUser.id ?? '');
      const selectedUsername = _.toLower(String(selectedUser.username ?? ''));
      return String(rowUser.id ?? '') === selectedUserId || _.toLower(String(rowUser.username ?? '')) === selectedUsername;
    }

    private matchesSelectedUserForAdminAudit(selectedUser: AnyRecord, action: string, parsedAdditionalContext: unknown): boolean {
      if (!_.isPlainObject(parsedAdditionalContext)) {
        return false;
      }

      const context = parsedAdditionalContext as AnyRecord;
      const selectedUserId = String(selectedUser.id ?? '');
      if (_.includes(['disable-user', 'enable-user'], action)) {
        return String(context.userId ?? '') === selectedUserId;
      }
      if (action === 'link-accounts') {
        return String(context.primaryUserId ?? '') === selectedUserId || String(context.secondaryUserId ?? '') === selectedUserId;
      }
      return false;
    }

    private getUserAuditDetails(selectedUser: AnyRecord, action: string, parsedAdditionalContext: unknown): string {
      switch (action) {
        case 'login':
          return 'User logged in';
        case 'logout':
          return 'User logged out';
        case 'disable-user':
          return 'Admin disabled this account';
        case 'enable-user':
          return 'Admin enabled this account';
        case 'link-accounts': {
          if (!_.isPlainObject(parsedAdditionalContext)) {
            return 'Account linking event';
          }
          const context = parsedAdditionalContext as AnyRecord;
          if (String(context.primaryUserId ?? '') === String(selectedUser.id ?? '')) {
            return 'This account was chosen as the primary account during account linking';
          }
          if (String(context.secondaryUserId ?? '') === String(selectedUser.id ?? '')) {
            return 'This account was linked as a secondary alias to another account';
          }
          return 'Account linking event';
        }
        default:
          return String(action ?? '');
      }
    }

    private normalizeUserAuditRecord(selectedUser: AnyRecord, row: UserAuditRow): UserAuditRecord {
      const action = String(row.action ?? '');
      const parsedContext = row.auditContext ?? this.parseUserAuditContext(action, row.additionalContext);
      return {
        id: String(row.id ?? ''),
        timestamp: this.normalizeAuditTimestamp(row.createdAt) ?? this.normalizeAuditTimestamp(row.updatedAt),
        action,
        actor: this.toAuditActor(row.user),
        details: this.getUserAuditDetails(selectedUser, action, parsedContext.parsedAdditionalContext),
        parsedAdditionalContext: parsedContext.parsedAdditionalContext,
        rawAdditionalContext: parsedContext.rawAdditionalContext,
        parseError: parsedContext.parseError
      };
    }

    private async fetchDirectUserAuditRows(selectedUser: AnyRecord): Promise<UserAuditRow[]> {
      const directAuditActions = ['login', 'logout'];
      try {
        const rows = await UserAudit.find({
          action: directAuditActions,
          or: [
            { 'user.id': String(selectedUser.id ?? '') },
            { 'user.username': String(selectedUser.username ?? '') }
          ]
        }).meta({
          enableExperimentalDeepTargets: true
        });
        return rows as unknown as UserAuditRow[];
      } catch (error) {
        sails.log.error('Failed to query direct user audit rows with deep targets enabled.');
        sails.log.error(error);
        throw new Error(`Unable to fetch direct audit records for user ${String(selectedUser.id ?? '')} without an unbounded fallback query.`);
      }
    }

    public async getUserAudit(userId: string): Promise<UserAuditResponse> {
      const selectedUser = await User.findOne({ id: userId });
      if (selectedUser == null) {
        throw new Error('User not found');
      }
      const selectedUserRecord = selectedUser as unknown as AnyRecord;
      const selectedUserId = String(selectedUserRecord.id ?? '');
      const adminAuditContextFilters = [
        `\"userId\":${JSON.stringify(selectedUserId)}`,
        `\"primaryUserId\":${JSON.stringify(selectedUserId)}`,
        `\"secondaryUserId\":${JSON.stringify(selectedUserId)}`
      ];

      const directRows = await this.fetchDirectUserAuditRows(selectedUserRecord);
      const adminRows = await UserAudit.find({
        action: ['disable-user', 'enable-user', 'link-accounts'],
        or: _.map(adminAuditContextFilters, (contextFilter: string) => ({
          additionalContext: { contains: contextFilter }
        }))
      }) as unknown as UserAuditRow[];

      const matchingDirectRows = _.filter(directRows, (row: UserAuditRow) => this.matchesSelectedUserForDirectAudit(selectedUserRecord, row));
      const matchingAdminRows = _.chain(adminRows)
        .map((row: UserAuditRow) => {
          const auditContext = this.parseUserAuditContext(String(row.action ?? ''), row.additionalContext);
          return {
            ...row,
            auditContext
          } as UserAuditRow;
        })
        .filter((row: UserAuditRow) => {
          return this.matchesSelectedUserForAdminAudit(
            selectedUserRecord,
            String(row.action ?? ''),
            row.auditContext?.parsedAdditionalContext
          );
        })
        .value();

      const mergedRows = _.values(_.keyBy([...matchingDirectRows, ...matchingAdminRows], (row: UserAuditRow) => String(row.id ?? '')));
      const sortedRows = _.orderBy(mergedRows, (row: UserAuditRow) => this.timestampSortValue(row), 'desc');
      const maxRows = 100;
      const truncated = sortedRows.length > maxRows;
      const limitedRows = sortedRows.slice(0, maxRows);

      return {
        records: _.map(limitedRows, (row: UserAuditRow) => this.normalizeUserAuditRecord(selectedUserRecord, row)),
        summary: {
          returnedCount: limitedRows.length,
          truncated
        }
      };
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

            const foundUserObj = foundUser as UserAttributes & AnyRecord;
            const passwordHash = String(foundUserObj.password ?? '');
            bcrypt.compare(password, passwordHash, function (err: unknown, res: boolean) {

              if (!res) {
                return done(null, false, {
                  message: 'Incorrect username/password'
                });
              }

              // Gate disabled users
              that.assertAuthenticationAllowed(foundUserObj as UserAttributes).then(() => {

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

              }).catch((err: unknown) => {
                if (err instanceof Error && err.message === 'Account is disabled') {
                  return done(null, false, { message: 'Account is disabled' });
                }
                return done(err);
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
              const userObj = user as UserAttributes & AnyRecord;
              // Gate disabled users
              that.assertAuthenticationAllowed(userObj).then(() => {
                const attrs = (jwt_payload[aafAttributes] ?? {}) as AnyRecord;
                userObj.lastLogin = new Date();
                userObj.name = String(attrs.cn ?? '');
                userObj.email = String(attrs.mail ?? '').toLowerCase();
                userObj.displayname = _.isNil(attrs.displayname) ? undefined : String(attrs.displayname);
                userObj.cn = _.isNil(attrs.cn) ? undefined : String(attrs.cn);
                userObj.edupersonscopedaffiliation = _.isNil(attrs.edupersonscopedaffiliation) ? undefined : String(attrs.edupersonscopedaffiliation);
                userObj.edupersontargetedid = _.isNil(attrs.edupersontargetedid) ? undefined : String(attrs.edupersontargetedid);
                userObj.edupersonprincipalname = _.isNil(attrs.edupersonprincipalname) ? undefined : String(attrs.edupersonprincipalname);
                userObj.givenname = _.isNil(attrs.givenname) ? undefined : String(attrs.givenname);
                userObj.surname = _.isNil(attrs.surname) ? undefined : String(attrs.surname);

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

              }).catch((err: unknown) => {
                if (err instanceof Error && err.message === 'Account is disabled') {
                  return done(null, false, { message: 'Account is disabled' });
                }
                return done(err);
              }); // end AAF disabled gate
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
          const userObj = user as UserAttributes & AnyRecord;
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
            userObj.name = String(_.get(userinfo, claimsMappings['name'] as string ?? '', ''));
            userObj.email = String(_.get(userinfo, claimsMappings['email'] as string ?? '', '')).toLowerCase();
            const displayName = _.get(userinfo, claimsMappings['displayName'] as string ?? '');
            const commonName = _.get(userinfo, claimsMappings['cn'] as string ?? '');
            const givenName = _.get(userinfo, claimsMappings['givenname'] as string ?? '');
            const surname = _.get(userinfo, claimsMappings['surname'] as string ?? '');
            userObj.displayname = _.isNil(displayName) ? undefined : String(displayName);
            userObj.cn = _.isNil(commonName) ? undefined : String(commonName);
            userObj.givenname = _.isNil(givenName) ? undefined : String(givenName);
            userObj.surname = _.isNil(surname) ? undefined : String(surname);

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

          }).catch((err: unknown) => {
            if (err instanceof Error && err.message === 'Account is disabled') {
              return done(null, false, { message: 'Account is disabled' });
            }
            return done(err);
          }); // end OIDC disabled gate
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
              that.assertAuthenticationAllowed(user as UserAttributes).then(() => {
                that.resolveLinkedUserCandidate(user)
                  .then((resolvedUser) => done(null, resolvedUser as AnyRecord, {
                    scope: 'all'
                  }))
                  .catch((resolveErr: unknown) => done(resolveErr));
              }).catch((err: unknown) => {
                if (err instanceof Error && err.message === 'Account is disabled') {
                  return done(null, false);
                }
                return done(err);
              });
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
          return _.filter(users, (user: UserModel) => {
            return this.hasRoleInBrand(user, String(brandId)) || linkedSecondaryIds.has(String(user.id ?? ''));
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

      const userObj = userOrId as UserModel;
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

        const primaryUserObj = primaryUser as UserModel;
        const links = typeof UserLink !== 'undefined'
          ? await UserLink.find({ primaryUserId: String(primaryUserObj.id ?? ''), status: 'active' })
          : [];
        const secondaryIds = _.map(links as AnyRecord[], (link: unknown) => String((link as AnyRecord).secondaryUserId ?? ''));
        const secondaryUsers = _.isEmpty(secondaryIds)
          ? []
          : await User.find({ id: secondaryIds }).populate('roles');
        const secondaryUsersById = _.keyBy(secondaryUsers as UserModel[], (user: UserModel) => String(user.id ?? ''));
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
      const queryText = _.trim(query);
      return from((async () => {
        const userWhere: AnyRecord = {
          accountLinkState: 'active',
          loginDisabled: { '!=': true }
        };

        if (!_.isEmpty(excludeUserId)) {
          userWhere.id = { '!=': String(excludeUserId) };
        }

        if (!_.isEmpty(queryText)) {
          userWhere.or = [
            { username: { contains: queryText } },
            { name: { contains: queryText } },
            { email: { contains: queryText } }
          ];
        }

        const users = await User.find(userWhere).populate('roles');
        const enrichedUsers = await this.enrichUsersWithEffectiveDisabledState(users as UserAttributes[]);
        let primaryUserIdsWithLinkedAccounts = new Set<string>();
        if (typeof UserLink !== 'undefined' && !_.isEmpty(enrichedUsers)) {
          const candidateUserIds = _.map(enrichedUsers, (user: UserAttributes) => String(user.id ?? ''));
          const activeLinks = await UserLink.find({
            status: 'active',
            primaryUserId: candidateUserIds
          });
          primaryUserIdsWithLinkedAccounts = new Set(
            _.map(activeLinks as AnyRecord[], (link: unknown) => String((link as AnyRecord).primaryUserId ?? ''))
          );
        }

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
            return true;
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

        const primaryUser = primaryEffective as UserModel;
        const secondaryUserObj = secondaryUser as UserModel;
        this.normalizeAccountLinkState(primaryUser);
        this.normalizeAccountLinkState(secondaryUserObj);

        const primaryDisabledState = await this.resolveEffectiveDisabledState(primaryUser);
        if (primaryDisabledState.effectiveLoginDisabled) {
          throw new Error('Cannot link accounts: primary user is disabled');
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
        const secondaryForeignRoles = _.filter(secondaryUserObj.roles as unknown[] ?? [], (role: unknown) => {
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

        const retainedSecondaryRoleIds = _.map(_.filter(secondaryUserObj.roles as unknown[] ?? [], (role: unknown) => {
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
