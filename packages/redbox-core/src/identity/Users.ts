import _ from 'lodash';
import { Observable, of, from, throwError, firstValueFrom, defer } from 'rxjs';
import { mergeMap as flatMap, map } from 'rxjs/operators';
import * as crypto from 'node:crypto';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { AuthenticationAccounts, AuthBrandConfig } from '../authentication/Accounts';
import type { IdentityRepositories } from '../persistence/identity/IdentityRepositories';
import type { StorageRepositories } from '../persistence/storage/StorageRepositories';
import type { RecordsService } from '../RecordsService';
import { safeIdentityValue } from '../persistence/identity/safety';
import type { UserAttributes } from '../persistence/rows';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { RoleModel } from '../model/storage/RoleModel';
import type { UserModel } from '../model/storage/UserModel';
import { recordServiceChronicle } from '../utilities/serviceChronicle';
export class UserAccountLinkError extends Error {}

export interface UserAdministrationInput {
  readonly repository: IdentityRepositories;
  readonly accounts: AuthenticationAccounts;
  readonly log: ILogger;
  defaultBrand(): BrandingModel;
  readonly recordAccess?: {
    readonly storage: Pick<StorageRepositories, 'records'>;
    readonly records: Pick<RecordsService, 'mutateMetaInternal' | 'provideUserAccessAndRemovePendingAccess'>;
  };
  emitSecurityEvent?(
    actor: Record<string, unknown>,
    action: string,
    context: Record<string, unknown>
  ): Promise<unknown>;
}

export async function requireUserInBrand(
  userId: string,
  brandId: string,
  input: {
    getUserWithId(id: string): Observable<UserModel | null>;
    repository: Pick<IdentityRepositories, 'one'>;
  }
): Promise<UserAttributes | null> {
  const user = await firstValueFrom(input.getUserWithId(userId));
  if (!user) {
    return null;
  }
  const roles = (user.roles ?? []) as unknown as Array<Record<string, unknown>>;
  const hasBrandRole = _.some(roles, (role: Record<string, unknown>) => {
    const branding = role.branding as string | Record<string, unknown> | undefined;
    const roleBrandId = _.isObject(branding)
      ? String((branding as Record<string, unknown>).id ?? '')
      : String(branding ?? '');
    return roleBrandId === brandId;
  });
  if (hasBrandRole) {
    return user;
  }
  const isLinked = await input.repository.one('userlink', {
    brandId: brandId,
    status: 'active',
    or: [{ primaryUserId: userId }, { secondaryUserId: userId }],
  } as Record<string, unknown>);
  if (isLinked) {
    return user;
  }
  return null;
}

export function mergeBrandRoleIds(
  user: UserModel | UserAttributes,
  brandId: string,
  brandRoleIds: Array<string | number>
): Array<string | number> {
  const foreignRoleIds = ((user.roles ?? []) as unknown as Array<Record<string, unknown>>)
    .filter((role: Record<string, unknown>) => {
      const branding = role.branding as string | Record<string, unknown> | undefined;
      const roleBrandId = _.isObject(branding)
        ? String((branding as Record<string, unknown>).id ?? '')
        : String(branding ?? '');
      return roleBrandId !== brandId;
    })
    .map((role: Record<string, unknown>) => role.id as string | number)
    .filter((roleId: string | number | undefined) => roleId != null);
  return _.uniq([...foreignRoleIds, ...brandRoleIds]);
}

/** Global account changes require authority over every membership, not just one brand. */
export function hasForeignBrandRoles(user: UserModel | UserAttributes, brandId: string): boolean {
  return ((user.roles ?? []) as unknown[]).some(role => {
    if (!role || typeof role !== 'object') return true;
    const branding = Reflect.get(role, 'branding');
    const id = branding && typeof branding === 'object' ? Reflect.get(branding, 'id') : branding;
    return String(id ?? '') !== brandId;
  });
}

export namespace Services {
  type AnyRecord = Record<string, unknown>;
  type DoneCallback = (err: unknown, user?: unknown, info?: unknown) => void;
  type BcryptLike = {
    compare: (password: string, hash: string, cb: (err: unknown, res: boolean) => void) => void;
    hash: (password: string, saltRounds: number, cb: (err: unknown, hash: string) => void) => void;
    genSaltSync: (rounds: number) => string;
    hashSync: (password: string, salt: string) => string;
  };

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

  export class Users {
    public constructor(protected readonly input: UserAdministrationInput) {}
    protected updateChronicle(
      info: Record<string, unknown>,
      errors: unknown[] = [],
      level: 'debug' | 'info' | 'warn' = 'debug'
    ): void {
      recordServiceChronicle(this.input.log, info, errors, level);
    }
    protected getObservable<T>(q: () => Promise<unknown>, _method?: string, _type?: string): Observable<T> {
      let pending: Promise<T> | undefined;
      return defer(() => (pending ??= Promise.resolve().then(q) as Promise<T>));
    }
    private recordAccess(): NonNullable<UserAdministrationInput['recordAccess']> {
      if (!this.input.recordAccess)
        throw new Error('Account linking requires the owned record mutation provider (SR-035).');
      return this.input.recordAccess;
    }

    protected authenticationAccounts(): AuthenticationAccounts {
      return this.input.accounts;
    }

    protected getAuthConfig(brandName: string): AuthBrandConfig {
      return this.authenticationAccounts().getAuthConfig(brandName);
    }

    private normalizeAccountLinkState(user: UserAttributes | null | undefined): void {
      return this.authenticationAccounts().normalizeAccountLinkState(user);
    }

    public requireUserInBrand(userId: string, brandId: string): Promise<UserAttributes | null> {
      return requireUserInBrand(userId, brandId, {
        getUserWithId: id => this.getUserWithId(id),
        repository: this.input.repository,
      });
    }
    public mergeBrandRoleIds(
      user: UserModel | UserAttributes,
      brandId: string,
      brandRoleIds: Array<string | number>
    ): Array<string | number> {
      return mergeBrandRoleIds(user, brandId, brandRoleIds);
    }

    private hasRoleInBrand(user: UserAttributes | null | undefined, brandId: string): boolean {
      if (user == null || _.isEmpty(brandId)) {
        return false;
      }
      return _.some((user.roles as AnyRecord[]) ?? [], (role: unknown) => {
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
      return _.filter((user.roles as AnyRecord[]) ?? [], (role: unknown) => {
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

    protected async resolveLinkedUserCandidate(user: unknown): Promise<AnyRecord | null> {
      return this.authenticationAccounts().resolveLinkedUserCandidate(user);
    }

    private rewriteLinkedAuthorization(
      current: AnyRecord,
      primaryUsername: string,
      secondaryUsername: string,
      secondaryEmail: string
    ): AnyRecord {
      const editPending = ((current.editPending ?? []) as string[]).map(email => String(email).toLowerCase());
      const viewPending = ((current.viewPending ?? []) as string[]).map(email => String(email).toLowerCase());
      const replaceUsername = (username: string) => (username === secondaryUsername ? primaryUsername : username);
      return {
        ...current,
        edit: _.uniq([
          ..._.uniq((current.edit ?? []) as string[]).map(replaceUsername),
          ...(editPending.includes(secondaryEmail) ? [primaryUsername] : []),
        ]),
        view: _.uniq([
          ..._.uniq((current.view ?? []) as string[]).map(replaceUsername),
          ...(viewPending.includes(secondaryEmail) ? [primaryUsername] : []),
        ]),
        editPending: editPending.filter(email => email !== secondaryEmail),
        viewPending: viewPending.filter(email => email !== secondaryEmail),
      };
    }

    private async rewriteLinkedRecordAuthorizations(
      primaryUser: AnyRecord,
      secondaryUser: AnyRecord,
      actor: string,
      brandId: string
    ): Promise<number> {
      const secondaryUsername = String(secondaryUser.username ?? '');
      const secondaryEmail = String(secondaryUser.email ?? '').toLowerCase();
      const primaryUsername = String(primaryUser.username ?? '');
      const records = await this.recordAccess().storage.records.find({
        'metaMetadata.brandId': brandId,
        $or: [
          { 'authorization.edit': secondaryUsername },
          { 'authorization.view': secondaryUsername },
          { 'authorization.editPending': secondaryEmail },
          { 'authorization.viewPending': secondaryEmail },
        ],
      });

      let rewrittenCount = 0;
      for (const record of records as unknown[]) {
        const recordObj = record as AnyRecord;
        const currentAuthorization = (recordObj.authorization ?? {}) as AnyRecord;
        if (
          !_.isEqual(
            this.rewriteLinkedAuthorization(currentAuthorization, primaryUsername, secondaryUsername, secondaryEmail),
            currentAuthorization
          )
        ) {
          const oid = String(recordObj.redboxOid ?? '');
          const response = await this.recordAccess().records.mutateMetaInternal({
            actor: { kind: 'service', id: 'UsersService.rewriteLinkedRecordAuthorizations' },
            authorization: { kind: 'service' },
            oid,
            user: { username: actor },
            triggerPreSaveTriggers: false,
            triggerPostSaveTriggers: false,
            mutate: snapshot => {
              const candidate = snapshot as unknown as AnyRecord;
              if (_.get(candidate, 'metaMetadata.brandId') !== brandId)
                throw new Error('Record brand changed during account linking');
              const current = (candidate.authorization ?? {}) as AnyRecord;
              candidate.authorization = this.rewriteLinkedAuthorization(
                current,
                primaryUsername,
                secondaryUsername,
                secondaryEmail
              );
              return candidate;
            },
            retry: { idempotent: true, recomputable: true, maxAttempts: 3 },
          });
          if (!response.wasPersisted()) {
            throw new Error(String(response.message ?? response.outcome));
          }
          if (response.outcome === 'saved-with-warnings') {
            this.input.log.warn(
              `User permission rewrite persisted with warnings for ${String(recordObj.redboxOid ?? '')}`,
              {
                requestId: response.requestId,
              }
            );
          }
          rewrittenCount++;
        }
      }

      return rewrittenCount;
    }

    private async resolveEffectiveDisabledState(user: UserAttributes): Promise<{
      effectiveLoginDisabled: boolean;
      disabledByPrimaryUserId?: string;
      disabledByPrimaryUsername?: string;
    }> {
      return this.authenticationAccounts().resolveEffectiveDisabledState(user);
    }

    private async assertAuthenticationAllowed(user: UserAttributes): Promise<void> {
      return this.authenticationAccounts().assertAuthenticationAllowed(user);
    }

    public async enrichUsersWithLinkMetadata(users: UserAttributes[], brandId?: string): Promise<UserAttributes[]> {
      const links = await this.input.repository.list(
        'userlink',
        _.isEmpty(brandId) ? { status: 'active' } : { brandId: brandId, status: 'active' }
      );
      const linkCountByPrimary = _.countBy(links as Record<string, unknown>[], (link: Record<string, unknown>) =>
        String(link.primaryUserId ?? '')
      );
      const primaryIds = _.uniq(
        _.map(links as Record<string, unknown>[], (link: Record<string, unknown>) => String(link.primaryUserId ?? ''))
      );
      const primaryUsers = _.isEmpty(primaryIds) ? [] : await this.input.repository.list('user', { id: primaryIds });
      const primaryUsernamesById = _.reduce(
        primaryUsers as Record<string, unknown>[],
        (acc, user) => {
          acc[String(user.id ?? '')] = String(user.username ?? '');
          return acc;
        },
        {} as Record<string, string>
      );

      return _.map(users, (user: UserAttributes) => {
        const enrichedUser = user as UserAttributes & Record<string, unknown>;
        enrichedUser.accountLinkState = enrichedUser.accountLinkState || 'active';
        enrichedUser.linkedAccountCount = linkCountByPrimary[String(enrichedUser.id ?? '')] || 0;
        enrichedUser.effectivePrimaryUsername = _.isEmpty(enrichedUser.linkedPrimaryUserId)
          ? enrichedUser.username
          : primaryUsernamesById[String(enrichedUser.linkedPrimaryUserId ?? '')] || enrichedUser.username;
        return enrichedUser;
      });
    }

    public async enrichUsersWithEffectiveDisabledState<T extends UserAttributes>(users: T[]): Promise<T[]> {
      const primaryIds = _.uniq(
        _.compact(_.map(users, (u: T) => (!_.isEmpty(u.linkedPrimaryUserId) ? String(u.linkedPrimaryUserId) : null)))
      );
      const primaryUsers = _.isEmpty(primaryIds) ? [] : await this.input.repository.list('user', { id: primaryIds });
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
      const user = await this.input.repository.one('user', { id: userId });
      if (user == null) {
        throw new Error('User not found');
      }
      if (String((user as unknown as AnyRecord).accountLinkState ?? 'active') === 'linked-alias') {
        throw new Error('Cannot disable a linked alias user. Disable the primary account instead.');
      }
      await this.input.repository.update('user', { id: userId }, { loginDisabled: true });
      await this.addUserAuditEvent({ username: actor }, 'disable-user', { userId, brandId });
    }

    public async enableUser(userId: string, actor: string, brandId: string): Promise<void> {
      const user = await this.input.repository.one('user', { id: userId });
      if (user == null) {
        throw new Error('User not found');
      }
      if (String((user as unknown as AnyRecord).accountLinkState ?? 'active') === 'linked-alias') {
        throw new Error('Cannot enable a linked alias user. Enable the primary account instead.');
      }
      await this.input.repository.update('user', { id: userId }, { loginDisabled: false });
      await this.addUserAuditEvent({ username: actor }, 'enable-user', { userId, brandId });
    }

    private toAuditActor(user: unknown): UserAuditActor {
      const userObj = _.isObject(user) ? (user as AnyRecord) : {};
      const actor: UserAuditActor = {
        username: String(userObj.username ?? ''),
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

      const stringified = this.stringifyObject(safeIdentityValue(additionalContext, true));
      return _.isString(stringified) ? stringified : null;
    }

    private shouldRedactAuditKey(key: string): boolean {
      const normalizedKey = _.toLower(key);
      return (
        normalizedKey === 'cookie' ||
        normalizedKey === 'authorization' ||
        normalizedKey.startsWith('x-forwarded-') ||
        normalizedKey.includes('password')
      );
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
        return _.reduce(
          value as Record<string, unknown>,
          (acc, nestedValue, nestedKey) => {
            acc[nestedKey] = this.shouldRedactAuditKey(nestedKey)
              ? '[REDACTED]'
              : this.redactAuditValue(nestedValue, nestedKey);
            return acc;
          },
          {} as Record<string, unknown>
        );
      }
      return value;
    }

    private sanitizeAuditDebugContext(
      action: string,
      parsedAdditionalContext: unknown,
      rawAdditionalContext: string | null,
      parseError: boolean
    ): {
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
          rawAdditionalContext: rawAdditionalContext == null ? null : '[REDACTED_UNPARSEABLE_AUDIT_CONTEXT]',
        };
      }

      return {
        parsedAdditionalContext: redactedParsed,
        rawAdditionalContext: redactedParsed == null ? null : JSON.stringify(redactedParsed),
      };
    }

    private parseUserAuditContext(action: string, additionalContext: unknown): ParsedUserAuditContext {
      const rawAdditionalContext = this.toAuditContextString(additionalContext);
      if (_.isNil(rawAdditionalContext)) {
        return {
          parsedAdditionalContext: null,
          rawAdditionalContext: null,
          parseError: false,
        };
      }

      try {
        const parsedAdditionalContext = JSON.parse(rawAdditionalContext);
        const sanitized = this.sanitizeAuditDebugContext(action, parsedAdditionalContext, rawAdditionalContext, false);
        return {
          parsedAdditionalContext: sanitized.parsedAdditionalContext,
          rawAdditionalContext: sanitized.rawAdditionalContext,
          parseError: false,
        };
      } catch (_error) {
        const sanitized = this.sanitizeAuditDebugContext(action, null, rawAdditionalContext, true);
        return {
          parsedAdditionalContext: sanitized.parsedAdditionalContext,
          rawAdditionalContext: sanitized.rawAdditionalContext,
          parseError: true,
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
      const rowUser = _.isObject(row.user) ? (row.user as AnyRecord) : {};
      const selectedUserId = String(selectedUser.id ?? '');
      const selectedUsername = _.toLower(String(selectedUser.username ?? ''));
      return (
        String(rowUser.id ?? '') === selectedUserId || _.toLower(String(rowUser.username ?? '')) === selectedUsername
      );
    }

    private matchesSelectedUserForAdminAudit(
      selectedUser: AnyRecord,
      action: string,
      parsedAdditionalContext: unknown
    ): boolean {
      if (!_.isPlainObject(parsedAdditionalContext)) {
        return false;
      }

      const context = parsedAdditionalContext as AnyRecord;
      const selectedUserId = String(selectedUser.id ?? '');
      if (_.includes(['disable-user', 'enable-user'], action)) {
        return String(context.userId ?? '') === selectedUserId;
      }
      if (action === 'link-accounts') {
        return (
          String(context.primaryUserId ?? '') === selectedUserId ||
          String(context.secondaryUserId ?? '') === selectedUserId
        );
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
        parseError: parsedContext.parseError,
      };
    }

    private async fetchDirectUserAuditRows(selectedUser: AnyRecord): Promise<UserAuditRow[]> {
      const directAuditActions = ['login', 'logout'];
      try {
        const rows = await this.input.repository.list('useraudit', {
          action: directAuditActions,
          or: [{ 'user.id': String(selectedUser.id ?? '') }, { 'user.username': String(selectedUser.username ?? '') }],
        });
        return rows as unknown as UserAuditRow[];
      } catch (error) {
        this.updateChronicle({ usersOperation: 'fetchDirectUserAuditRows', usersOutcome: 'failed' }, [error]);
        throw new Error(
          `Unable to fetch direct audit records for user ${String(selectedUser.id ?? '')} without an unbounded fallback query.`
        );
      }
    }

    public async getUserAudit(userId: string, brandId?: string): Promise<UserAuditResponse> {
      const selectedUser = await this.input.repository.one('user', { id: userId });
      if (selectedUser == null) {
        throw new Error('User not found');
      }
      const selectedUserRecord = selectedUser as unknown as AnyRecord;
      const selectedUserId = String(selectedUserRecord.id ?? '');
      const adminAuditContextFilters = [
        `"userId":${JSON.stringify(selectedUserId)}`,
        `"primaryUserId":${JSON.stringify(selectedUserId)}`,
        `"secondaryUserId":${JSON.stringify(selectedUserId)}`,
      ];

      const directRows = await this.fetchDirectUserAuditRows(selectedUserRecord);
      const adminRows = (await this.input.repository.list('useraudit', {
        action: ['disable-user', 'enable-user', 'link-accounts'],
        or: _.map(adminAuditContextFilters, (contextFilter: string) => ({
          additionalContext: { contains: contextFilter },
        })),
      })) as unknown as UserAuditRow[];

      const matchingDirectRows = _.filter(directRows, (row: UserAuditRow) =>
        this.matchesSelectedUserForDirectAudit(selectedUserRecord, row)
      );
      const matchingAdminRows = _.chain(adminRows)
        .map((row: UserAuditRow) => {
          const auditContext = this.parseUserAuditContext(String(row.action ?? ''), row.additionalContext);
          return {
            ...row,
            auditContext,
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

      const mergedRows = _.values(
        _.keyBy([...matchingDirectRows, ...matchingAdminRows], (row: UserAuditRow) => String(row.id ?? ''))
      );
      // Shared accounts do not grant one brand access to another brand's history.
      // Old or malformed rows without a trusted brand remain unavailable over HTTP.
      const scopedRows =
        brandId === undefined
          ? mergedRows
          : mergedRows.filter(row => {
              const context =
                row.auditContext ?? this.parseUserAuditContext(String(row.action ?? ''), row.additionalContext);
              return (
                _.isPlainObject(context.parsedAdditionalContext) &&
                (context.parsedAdditionalContext as AnyRecord).brandId === brandId
              );
            });
      const sortedRows = _.orderBy(scopedRows, (row: UserAuditRow) => this.timestampSortValue(row), 'desc');
      const maxRows = 100;
      const truncated = sortedRows.length > maxRows;
      const limitedRows = sortedRows.slice(0, maxRows);

      return {
        records: _.map(limitedRows, (row: UserAuditRow) => this.normalizeUserAuditRecord(selectedUserRecord, row)),
        summary: {
          returnedCount: limitedRows.length,
          truncated,
        },
      };
    }

    private hasPreSaveTriggerConfigured(config: unknown, mode: string) {
      return this.authenticationAccounts().hasPreSaveTriggerConfigured(config, mode);
    }

    private hasPostSaveTriggerConfigured(config: unknown, mode: string) {
      return this.authenticationAccounts().hasPostSaveTriggerConfigured(config, mode);
    }

    private hasPostSaveSyncTriggerConfigured(config: unknown, mode: string) {
      return this.authenticationAccounts().hasPostSaveSyncTriggerConfigured(config, mode);
    }

    private checkAllTriggersSuccessOrFailure(user: object) {
      return this.authenticationAccounts().checkAllTriggersSuccessOrFailure(user);
    }

    //Post login and pre update/create user
    private async triggerPreSaveTriggers(
      user: AnyRecord,
      config: AnyRecord,
      mode: string = 'onUpdate'
    ): Promise<AnyRecord> {
      return this.authenticationAccounts().triggerPreSaveTriggers(user, config, mode);
    }

    //Post login and post update/create user sync
    public async triggerPostSaveSyncTriggers(
      user: AnyRecord,
      config: AnyRecord,
      mode: string = 'onUpdate',
      response: unknown = {}
    ) {
      return this.authenticationAccounts().triggerPostSaveSyncTriggers(user, config, mode, response);
    }

    //Post login and post update/create user
    public triggerPostSaveTriggers(user: AnyRecord, config: AnyRecord, mode: string = 'onUpdate'): void {
      void this.authenticationAccounts().triggerPostSaveTriggers(user, config, mode);
    }

    private resolveHookResponse(hookResponse: unknown) {
      return this.authenticationAccounts().resolveHookResponse(hookResponse);
    }

    protected openIdConnectAuthVerifyCallback(
      oidcConfig: AnyRecord,
      issuer: AnyRecord,
      req: AnyRecord,
      tokenSet: AnyRecord,
      userinfo: AnyRecord | undefined = undefined,
      done: DoneCallback
    ) {
      return this.authenticationAccounts().openIdConnectAuthVerifyCallback(
        oidcConfig,
        issuer,
        req,
        tokenSet,
        userinfo,
        done
      );
    }

    protected mapAdditionalAttributes(profile: unknown, attributeMappings: Record<string, string>) {
      return this.authenticationAccounts().mapAdditionalAttributes(profile, attributeMappings);
    }

    /**
     * Creates a user audit record
     *
     */
    public addUserAuditEvent = (user: unknown, action: string, additionalContext: unknown) => {
      // ignore audit events for users with no user, which had crashed the app when user has already logged out
      if (_.isEmpty(user)) {
        this.updateChronicle({ usersAuditAction: action, usersAuditOutcome: 'no-user' });
        return firstValueFrom(of(null));
      }
      const auditEvent: Record<string, unknown> = {};
      const userObj: Record<string, unknown> =
        typeof user === 'object' && user !== null ? Object.fromEntries(Object.entries(user)) : {};
      const securityActor: Record<string, unknown> = {
        id: userObj.id,
        username: userObj.username,
        email: userObj.email,
        additionalAttributes: userObj.additionalAttributes,
      };
      if (!_.isEmpty(userObj.password)) {
        delete userObj.password;
        _.unset(user, 'password');
      }
      userObj.additionalAttributes = this.stringifyObject(safeIdentityValue(userObj.additionalAttributes));
      auditEvent['user'] = safeIdentityValue(userObj);
      auditEvent['action'] = action;
      auditEvent['additionalContext'] = this.stringifyObject(safeIdentityValue(additionalContext, true));
      this.updateChronicle({ usersAuditAction: action, usersAuditUserId: userObj.id, usersAuditOutcome: 'submitted' });
      return firstValueFrom(
        this.getObservable<Record<string, unknown>>(() => this.input.repository.create('useraudit', auditEvent))
      ).then(async result => {
        // Capture structured attributes before the legacy audit JSON serialization.
        // Class instances (RequestDetails) are valid context, but only selected fields leave the portal.
        try {
          if (this.input.emitSecurityEvent) {
            const context: Record<string, unknown> = {};
            for (const key of [
              'brandId',
              'portalId',
              'branding',
              'method',
              'path',
              'ip',
              'userAgent',
              'userId',
              'primaryUserId',
              'primaryUsername',
              'secondaryUserId',
              'secondaryUsername',
              'rolesMerged',
              'recordsRewritten',
            ]) {
              const value: unknown = _.get(additionalContext, key);
              if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
                context[key] = value;
            }
            await this.input.emitSecurityEvent(securityActor, action, context).catch(() => {
              this.input.log.error('Failed to emit user audit security event');
            });
          }
        } catch {
          this.input.log.error('Failed to emit user audit security event');
        }
        return result;
      });
    };

    stringifyObject(object: unknown): unknown {
      return JSON.stringify(object, function (key, value) {
        if (typeof value === 'function') {
          return 'function-property-not-exported';
        } else {
          return value;
        }
      });
    }

    /**
     * @return User: the newly created user
     *
     */
    public addLocalUser = (username: string, name: string, email: string, password: string): Observable<UserModel> => {
      const authConfig = this.getAuthConfig(this.input.defaultBrand().name);
      const usernameField = authConfig.local?.usernameField ?? 'username';
      const passwordField = authConfig.local?.passwordField ?? 'password';

      return this.getUserWithUsername(username).pipe(
        flatMap(user => {
          if (user) {
            return throwError(new Error(`Username already exists`));
          } else {
            return this.findUsersWithEmail(email, null, null).pipe(
              flatMap(emailCheck => {
                if (_.size(emailCheck) > 0) {
                  return throwError(new Error(`Email already exists, it must be unique`));
                } else {
                  const newUser: Record<string, unknown> = {
                    type: 'local',
                    name: name,
                  };
                  if (!_.isEmpty(email)) {
                    newUser['email'] = email;
                  }
                  newUser[usernameField] = username;
                  newUser[passwordField] = password;
                  return this.getObservable<UserModel>(() => this.input.repository.create('user', newUser));
                }
              })
            );
          }
        })
      );
    };

    public getUserWithUsername = (username: string): Observable<UserModel | null> => {
      return this.authenticationAccounts().getUserWithUsername(username);
    };

    public getUserWithId = (userid: string | number): Observable<UserModel | null> => {
      return this.authenticationAccounts().getUserWithId(userid);
    };

    /**
     * @return Collection of all users (local and AAF)
     */
    public getUsers = (): Observable<UserModel[]> => {
      return this.getObservable<UserModel[]>(() => this.input.repository.list('user', {}, { populate: ['roles'] }));
    };

    /**
     * Retrieve all users that hold at least one role for the supplied brand.
     * @param brand The brand or brand id to scope the search to.
     */
    public getUsersForBrand = (brand: BrandingModel | string): Observable<UserModel[]> => {
      const brandId = typeof brand === 'string' ? brand : _.get(brand, 'id');
      if (_.isEmpty(brandId)) {
        return of([]);
      }

      return this.getObservable<UserModel[]>(() =>
        this.input.repository.list('user', {}, { populate: ['roles'] })
      ).pipe(
        flatMap(async (users: UserModel[]) => {
          const activeLinks = await this.input.repository.list('userlink', {
            brandId: brandId,
            status: 'active',
          });
          const linkedSecondaryIds = new Set(
            _.map(activeLinks as AnyRecord[], (link: unknown) => String((link as AnyRecord).secondaryUserId ?? ''))
          );
          return _.filter(users, (user: UserModel) => {
            return this.hasRoleInBrand(user, String(brandId)) || linkedSecondaryIds.has(String(user.id ?? ''));
          });
        })
      );
    };

    public getEffectiveUser = (userOrId: unknown): Observable<UserModel | null> => {
      return this.authenticationAccounts().getEffectiveUser(userOrId);
    };

    public getLinkedAccounts = (primaryUserId: string | UserModel, brandId?: string): Observable<UserLinkResponse> => {
      return from(
        (async () => {
          const primaryUser = await firstValueFrom(this.getEffectiveUser(primaryUserId));
          if (_.isEmpty(primaryUser)) {
            throw new Error(`No such user with id:${primaryUserId}`);
          }

          const primaryUserObj = primaryUser as UserModel;
          const links = await this.input.repository.list('userlink', {
            primaryUserId: String(primaryUserObj.id ?? ''),
            ...(brandId ? { brandId } : {}),
            status: 'active',
          });
          const secondaryIds = _.map(links as AnyRecord[], (link: unknown) =>
            String((link as AnyRecord).secondaryUserId ?? '')
          );
          const secondaryUsers = _.isEmpty(secondaryIds)
            ? []
            : await this.input.repository.list('user', { id: secondaryIds }, { populate: ['roles'] });
          const secondaryUsersById = _.keyBy(secondaryUsers as UserModel[], (user: UserModel) => String(user.id ?? ''));
          const linkedAccounts = _.compact(
            _.map(links as AnyRecord[], (link: unknown) => {
              const linkObj = link as AnyRecord;
              const secondary = secondaryUsersById[String(linkObj.secondaryUserId ?? '')];
              if (_.isEmpty(secondary)) {
                return null;
              }
              this.normalizeAccountLinkState(secondary);
              return this.toLinkedUserSummary(secondary, linkObj.createdAt as string | Date | undefined);
            })
          );

          return {
            primary: this.toLinkedUserSummary(primaryUserObj),
            linkedAccounts: linkedAccounts,
          };
        })()
      );
    };

    public searchLinkCandidates = (
      query: string,
      brandId: string,
      excludeUserId?: string
    ): Observable<LinkedUserSummary[]> => {
      const queryText = _.trim(query);
      return from(
        (async () => {
          const userWhere: AnyRecord = {
            accountLinkState: 'active',
            loginDisabled: { '!=': true },
          };

          if (!_.isEmpty(excludeUserId)) {
            userWhere.id = { '!=': String(excludeUserId) };
          }

          if (!_.isEmpty(queryText)) {
            userWhere.or = [
              { username: { contains: queryText } },
              { name: { contains: queryText } },
              { email: { contains: queryText } },
            ];
          }

          const users = await this.input.repository.list('user', userWhere, { populate: ['roles'] });
          const enrichedUsers = await this.enrichUsersWithEffectiveDisabledState(users as UserAttributes[]);
          let primaryUserIdsWithLinkedAccounts = new Set<string>();
          if (!_.isEmpty(enrichedUsers)) {
            const candidateUserIds = _.map(enrichedUsers, (user: UserAttributes) => String(user.id ?? ''));
            const activeLinks = await this.input.repository.list('userlink', {
              status: 'active',
              primaryUserId: candidateUserIds,
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
        })()
      );
    };

    public linkAccounts = (
      primaryUserId: string,
      secondaryUserId: string,
      actor: string,
      brandId: string
    ): Observable<UserLinkResponse> => {
      return from(
        (async () => {
          this.recordAccess();
          if (_.isEmpty(primaryUserId) || _.isEmpty(secondaryUserId)) {
            throw new UserAccountLinkError('Both primary and secondary users are required');
          }

          const primaryEffective = await firstValueFrom(this.getEffectiveUser(primaryUserId));
          const secondaryUser = await firstValueFrom(this.getUserWithId(secondaryUserId));
          if (_.isEmpty(primaryEffective) || _.isEmpty(secondaryUser)) {
            throw new UserAccountLinkError('Both users must exist before linking');
          }

          const primaryUser = primaryEffective as UserModel;
          const secondaryUserObj = secondaryUser as UserModel;
          this.normalizeAccountLinkState(primaryUser);
          this.normalizeAccountLinkState(secondaryUserObj);

          const primaryDisabledState = await this.resolveEffectiveDisabledState(primaryUser);
          if (primaryDisabledState.effectiveLoginDisabled) {
            throw new UserAccountLinkError('Cannot link accounts: primary user is disabled');
          }

          if (String(primaryUser.id ?? '') === String(secondaryUserObj.id ?? '')) {
            throw new UserAccountLinkError('Cannot link a user to itself');
          }
          if (String(primaryUser.accountLinkState ?? 'active') === 'linked-alias') {
            throw new UserAccountLinkError('Primary user cannot be a linked alias');
          }
          if (
            !_.isEmpty(secondaryUserObj.linkedPrimaryUserId) &&
            String(secondaryUserObj.linkedPrimaryUserId) !== String(primaryUser.id ?? '')
          ) {
            throw new UserAccountLinkError('Secondary user is already linked to another primary account');
          }
          if (!this.hasRoleInBrand(primaryUser, brandId)) {
            throw new UserAccountLinkError('Primary user must already belong to the current brand');
          }

          if (hasForeignBrandRoles(primaryUser, brandId)) {
            throw new UserAccountLinkError('Primary user belongs to a different brand and cannot be linked here');
          }
          const secondaryBrandRoles = this.getRolesForBrand(secondaryUserObj, brandId);
          const secondaryForeignRoles = _.filter((secondaryUserObj.roles as unknown[]) ?? [], (role: unknown) => {
            const roleObj = role as AnyRecord;
            const branding = roleObj.branding as string | AnyRecord | undefined;
            const roleBrandId = _.isObject(branding)
              ? String((branding as AnyRecord).id ?? '')
              : String(branding ?? '');
            return roleBrandId !== brandId;
          });
          if (!_.isEmpty(secondaryForeignRoles)) {
            throw new UserAccountLinkError('Secondary user belongs to a different brand and cannot be linked here');
          }

          const existingLink = await this.input.repository.one('userlink', {
            secondaryUserId: String(secondaryUserObj.id ?? ''),
            status: 'active',
          });
          if (!_.isEmpty(existingLink)) {
            throw new UserAccountLinkError('Secondary user is already linked');
          }

          const secondaryOwnLinks = await this.input.repository.one('userlink', {
            primaryUserId: String(secondaryUserObj.id ?? ''),
            status: 'active',
          });
          if (!_.isEmpty(secondaryOwnLinks)) {
            throw new UserAccountLinkError('Secondary user already has linked accounts');
          }

          await this.input.repository.create('userlink', {
            primaryUserId: String(primaryUser.id ?? ''),
            primaryUsername: String(primaryUser.username ?? ''),
            secondaryUserId: String(secondaryUserObj.id ?? ''),
            secondaryUsername: String(secondaryUserObj.username ?? ''),
            brandId: brandId,
            status: 'active',
            createdBy: actor,
          });

          const primaryBrandRoleIds = new Set(
            _.map(this.getRolesForBrand(primaryUser, brandId), (role: unknown) => String((role as AnyRecord).id ?? ''))
          );
          const secondaryBrandRoleIds = _.map(secondaryBrandRoles, (role: unknown) =>
            String((role as AnyRecord).id ?? '')
          );
          const roleIdsToMerge = _.filter(secondaryBrandRoleIds, roleId => !primaryBrandRoleIds.has(roleId));
          if (!_.isEmpty(roleIdsToMerge)) {
            const addRoleQuery = () =>
              this.input.repository.addMemberships('user', String(primaryUser.id ?? ''), roleIdsToMerge);
            await firstValueFrom(this.getObservable(addRoleQuery, 'exec', 'simplecb'));
          }

          const retainedSecondaryRoleIds = _.map(
            _.filter((secondaryUserObj.roles as unknown[]) ?? [], (role: unknown) => {
              const roleObj = role as AnyRecord;
              const branding = roleObj.branding as string | AnyRecord | undefined;
              const roleBrandId = _.isObject(branding)
                ? String((branding as AnyRecord).id ?? '')
                : String(branding ?? '');
              return roleBrandId !== brandId;
            }),
            (role: unknown) => String((role as AnyRecord).id ?? '')
          );
          const replaceRoleQuery = () =>
            this.input.repository.replaceMemberships(
              'user',
              String(secondaryUserObj.id ?? ''),
              retainedSecondaryRoleIds
            );
          await firstValueFrom(this.getObservable(replaceRoleQuery, 'exec', 'simplecb'));

          await this.input.repository.update(
            'user',
            { id: String(secondaryUserObj.id ?? '') },
            {
              token: '',
              accountLinkState: 'linked-alias',
              linkedPrimaryUserId: String(primaryUser.id ?? ''),
            }
          );

          const recordsRewritten = await this.rewriteLinkedRecordAuthorizations(
            primaryUser,
            secondaryUserObj,
            actor,
            brandId
          );

          await this.addUserAuditEvent({ username: actor }, 'link-accounts', {
            primaryUserId: primaryUser.id,
            primaryUsername: primaryUser.username,
            secondaryUserId: secondaryUserObj.id,
            secondaryUsername: secondaryUserObj.username,
            brandId: brandId,
            rolesMerged: roleIdsToMerge.length,
            recordsRewritten: recordsRewritten,
          });

          const linkedAccounts = await firstValueFrom(this.getLinkedAccounts(primaryUser as UserModel, brandId));
          return {
            ...linkedAccounts,
            impact: {
              recordsRewritten: recordsRewritten,
              rolesMerged: roleIdsToMerge.length,
            },
          };
        })()
      );
    };

    public setUserKey = (userid: string | number, uuid: string | null): Observable<UserModel> => {
      const uuidHash = _.isEmpty(uuid)
        ? null
        : crypto
            .createHash('sha256')
            .update(uuid as string)
            .digest('base64');
      return this.getUserWithId(userid).pipe(
        flatMap(user => {
          if (user) {
            return from(
              this.input.repository.update(
                'user',
                {
                  id: userid,
                },
                {
                  token: uuidHash,
                }
              )
            ).pipe(
              map(updatedUsers => {
                if (!updatedUsers[0]) throw new Error('No such user with id:' + userid);
                return updatedUsers[0] as UserModel;
              })
            );
          } else {
            return throwError(new Error('No such user with id:' + userid));
          }
        })
      );
    };

    public updateUserDetails = (
      userid: string | number,
      name: string,
      email: string,
      password: string
    ): Observable<UserModel[]> => {
      const authConfig = this.getAuthConfig(this.input.defaultBrand().name);
      const passwordField = authConfig.local?.passwordField ?? 'password';
      return this.getUserWithId(userid).pipe(
        flatMap(user => {
          if (user) {
            const update: Record<string, unknown> = {
              name: name,
            };

            if (!_.isEmpty(email)) {
              update['email'] = email;
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
            const q = () =>
              this.input.repository.update(
                'user',
                {
                  id: userid,
                },
                update
              );
            return this.getObservable<UserModel[]>(q, 'exec', 'simplecb');
          } else {
            return throwError(new Error('No such user with id:' + userid));
          }
        })
      );
    };

    public updateUserRoles = (userid: string | number, newRoleIds: Array<string | number>): Observable<UserModel> => {
      return this.getUserWithId(userid).pipe(
        flatMap(user => {
          if (user) {
            if (_.isEmpty(newRoleIds) || newRoleIds.length == 0) {
              return throwError(new Error('Please assign at least one role'));
            }
            // START Sails 1.0 upgrade
            const q = () => this.input.repository.replaceMemberships('user', user.id, newRoleIds);
            // END Sails 1.0 upgrade
            return this.getObservable<void>(q).pipe(
              flatMap(() => this.getUserWithId(userid)),
              map(updated => {
                if (!updated) throw new Error('No such user with id:' + userid);
                return updated;
              })
            );
          } else {
            return throwError(new Error('No such user with id:' + userid));
          }
        })
      );
    };

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
          contains: name,
        },
      };
      // S2TEST-21
      return this.findUsersWithQuery(query, brandId, source);
    }

    // S2TEST-21
    public findUsersWithEmail(email: string, brandId: string | null, source: unknown = null) {
      const query = {
        email: {
          contains: email,
        },
      };
      return this.findUsersWithQuery(query, brandId, source);
    }

    // S2TEST-21
    public findUsersWithQuery(query: unknown, brandId: string | null, source: unknown = null): Observable<UserModel[]> {
      const queryObj = (query ?? {}) as AnyRecord;
      if (!_.isEmpty(source) && !_.isUndefined(source) && !_.isNull(source)) {
        queryObj['type'] = source;
      }
      return this.getObservable<UserModel[]>(() =>
        this.input.repository.list('user', queryObj, { populate: ['roles'] })
      ).pipe(
        flatMap(users => {
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
        })
      );
    }

    /**
     *
     * Find all records that the user is intended to have access to and assign actual access using their userId.
     * This is used as users or services may want to provide access for a user to a record but due to single sign-on solutions,
     * we're not able to reliably determine the username before they login to the system for the first time.
     *
     **/
    public async findAndAssignAccessToRecords(pendingValue: string, userid: string): Promise<number> {
      const effectiveUser = await firstValueFrom(this.getEffectiveUser(userid));
      const effectiveUsername = _.get(effectiveUser, 'username', userid) as string;
      const records = await this.recordAccess().storage.records.find({
        $or: [
          {
            'authorization.editPending': pendingValue,
          },
          {
            'authorization.viewPending': pendingValue,
          },
        ],
      });
      const recordsArr = records as unknown[];
      if (_.isEmpty(recordsArr)) {
        return 0;
      }

      let updated = 0;
      for (const record of recordsArr) {
        const recordObj = record as AnyRecord;
        const response = await this.recordAccess().records.provideUserAccessAndRemovePendingAccess(
          recordObj.redboxOid as string,
          effectiveUsername,
          pendingValue
        );
        if (!response.wasPersisted()) {
          throw new Error(`Pending record access mutation failed (request ${response.requestId}).`);
        }
        updated += 1;
      }
      return updated;
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
      return this.authenticationAccounts().checkAuthorizedEmail(email, branding, authType);
    }
  }
}
