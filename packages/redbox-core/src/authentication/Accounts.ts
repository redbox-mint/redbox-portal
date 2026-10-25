import _ from 'lodash';
import { Observable, of, firstValueFrom, isObservable, defer } from 'rxjs';
import { mergeMap as flatMap, map } from 'rxjs/operators';
import { type IdentityRepositories } from '../persistence/identity/IdentityRepositories';
import { identityProfilePatch } from '../persistence/identity/profile';
import type { UserAttributes } from '../persistence/rows';
import type { UserModel } from '../model/storage/UserModel';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { RoleModel } from '../model/storage/RoleModel';
import type { AuthorizedDomainsEmails } from '../configmodels/AuthorizedDomainsEmails';
import type { ILogger } from '@researchdatabox/sails-ng-common';
export type AnyRecord = Record<string, unknown>;
type DoneCallback = (err: unknown, user?: unknown, info?: unknown) => void;
const DEFAULT_AAF_ATTRIBUTES_FIELD = 'https://aaf.edu.au/attributes';
const DEFAULT_AAF_USERNAME_FIELD = 'sub';
export interface AuthBrandConfig {
  active?: string[];
  local?: {
    hooks?: AnyRecord;
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

export interface OidcAuthConfig {
  identifier?: string;
  opts: {
    issuer: unknown;
    client: unknown;
    params?: Record<string, unknown>;
  };
  discoverAttemptsMax?: number;
  discoverFailureSleep?: number;
  userInfoSource?: string;
}

export interface AuthenticationAccountsInput {
  readonly repository: Pick<
    IdentityRepositories,
    'one' | 'create' | 'update' | 'replaceMemberships' | 'verifyPassword'
  >;
  readonly log: ILogger;
  readonly postLogoutRedirect?: string;
  defaultBrand(): BrandingModel;
  getBrand(name: string): BrandingModel;
  authConfig(name: string): AuthBrandConfig;
  defaultAuthenticatedRole(brand: BrandingModel): RoleModel | undefined;
  nestedRoles(name: string, roles: RoleModel[]): RoleModel[];
  authorizedEmails(brand: string): Partial<AuthorizedDomainsEmails>;
  resolveHook(name: string): (...args: unknown[]) => unknown;
  event(info: Record<string, unknown>, errors?: unknown[], level?: 'debug' | 'info' | 'warn'): void;
}
export class AuthenticationRejected extends Error {}
function oidcUsername(config: AnyRecord, info: AnyRecord): string {
  const mapping = String(_.get(config, 'claimMappings.username', ''));
  const username = String(_.get(info, mapping, ''));
  return _.get(config, 'claimMappingOptions.usernameToLowercase') === true ? username.toLowerCase() : username;
}
function authenticationCallbackError(error: unknown): unknown {
  return error instanceof AuthenticationRejected ? error.message : error;
}
/** Local credentials share one implementation between the pilot and full login flow. */
export async function localCredentialUser(
  repository: Pick<IdentityRepositories, 'one' | 'verifyPassword'>,
  username: string,
  password: string
) {
  const user = await repository.one('user', { username }, { populate: ['roles'] });
  return user?.type === 'local' && (await repository.verifyPassword(String(user.id), password)) ? user : null;
}
export class AuthenticationAccounts {
  public constructor(private readonly input: AuthenticationAccountsInput) {}
  protected updateChronicle(
    info: Record<string, unknown>,
    errors: unknown[] = [],
    level: 'debug' | 'info' | 'warn' = 'debug'
  ): void {
    this.input.event(info, errors, level);
  }
  public getAuthConfig(brandName: string): AuthBrandConfig {
    return this.input.authConfig(brandName) ?? {};
  }
  public normalizeAccountLinkState(user: UserAttributes | null | undefined): void {
    if (user != null && _.isEmpty(user.accountLinkState)) {
      user.accountLinkState = 'active';
    }
  }
  public async resolveLinkedUserCandidate(user: unknown): Promise<AnyRecord | null> {
    if (_.isEmpty(user)) {
      return null;
    }
    const resolved = await firstValueFrom(this.getEffectiveUser(user));
    return (resolved as AnyRecord | null) ?? (user as AnyRecord);
  }
  public async resolveEffectiveDisabledState(user: UserAttributes): Promise<{
    effectiveLoginDisabled: boolean;
    disabledByPrimaryUserId?: string;
    disabledByPrimaryUsername?: string;
  }> {
    if (user.loginDisabled === true) {
      return { effectiveLoginDisabled: true };
    }
    if (!_.isEmpty(user.linkedPrimaryUserId)) {
      const primaryUser = await firstValueFrom(this.getUserWithId(String(user.linkedPrimaryUserId)));
      if (primaryUser != null && (primaryUser as AnyRecord).loginDisabled === true) {
        return {
          effectiveLoginDisabled: true,
          disabledByPrimaryUserId: String((primaryUser as AnyRecord).id ?? ''),
          disabledByPrimaryUsername: String((primaryUser as AnyRecord).username ?? ''),
        };
      }
    }
    return { effectiveLoginDisabled: false };
  }
  public async assertAuthenticationAllowed(user: UserAttributes): Promise<void> {
    const state = await this.resolveEffectiveDisabledState(user);
    if (state.effectiveLoginDisabled) {
      throw new Error('Account is disabled');
    }
  }
  public hasPreSaveTriggerConfigured(config: unknown, mode: string) {
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
  public hasPostSaveTriggerConfigured(config: unknown, mode: string) {
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
  public hasPostSaveSyncTriggerConfigured(config: unknown, mode: string) {
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
  public checkAllTriggersSuccessOrFailure(user: object) {
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
  public async triggerPreSaveTriggers(
    user: AnyRecord,
    config: AnyRecord,
    mode: string = 'onUpdate'
  ): Promise<AnyRecord> {
    const preSaveUpdateHooks = _.get(config, `hooks.${mode}.pre`, null) as unknown[] | null;
    this.updateChronicle({ usersPreSaveMode: mode, usersPreSaveHookCount: preSaveUpdateHooks?.length ?? 0 });

    if (_.isArray(preSaveUpdateHooks)) {
      for (let i = 0; i < preSaveUpdateHooks.length; i++) {
        const preSaveUpdateHook = preSaveUpdateHooks[i];
        const preSaveUpdateHookFunctionString = _.get(preSaveUpdateHook, 'function', null);
        if (preSaveUpdateHookFunctionString != null) {
          try {
            const preSaveUpdateHookFunction = this.input.resolveHook(String(preSaveUpdateHookFunctionString));
            const options = _.get(preSaveUpdateHook, 'options', {});
            let failureMode = String(_.get(preSaveUpdateHook, 'failureMode', ''));
            if (_.isUndefined(failureMode) || (failureMode != 'continue' && failureMode != 'stop')) {
              failureMode = 'continue';
            }

            const hookResponse = preSaveUpdateHookFunction(user, options, failureMode);
            user = (await this.resolveHookResponse(hookResponse)) as AnyRecord;
            this.updateChronicle({ usersPreSaveHookIndex: i, usersPreSaveOutcome: 'success' });
          } catch (err) {
            this.updateChronicle({ usersOperation: 'triggerPreSaveTriggers', usersOutcome: 'failed' }, [err]);
            throw err;
          }
        }
      }
    }
    return user;
  }
  public async triggerPostSaveSyncTriggers(
    user: AnyRecord,
    config: AnyRecord,
    mode: string = 'onUpdate',
    response: unknown = {}
  ) {
    const postSaveSyncHooks = _.get(config, `hooks.${mode}.postSync`, null) as unknown[] | null;
    this.updateChronicle({ usersPostSaveSyncMode: mode, usersPostSaveSyncHookCount: postSaveSyncHooks?.length ?? 0 });
    if (_.isArray(postSaveSyncHooks)) {
      for (let i = 0; i < postSaveSyncHooks.length; i++) {
        const postSaveSyncHook = postSaveSyncHooks[i];

        const postSaveSyncHooksFunctionString = _.get(postSaveSyncHook, 'function', null);
        if (postSaveSyncHooksFunctionString != null) {
          const postSaveSyncHookFunction = this.input.resolveHook(String(postSaveSyncHooksFunctionString));
          const options = _.get(postSaveSyncHook, 'options', {});
          if (_.isFunction(postSaveSyncHookFunction)) {
            try {
              const hookResponse = postSaveSyncHookFunction(user, options, response);
              response = await this.resolveHookResponse(hookResponse);
              this.updateChronicle({ usersPostSaveSyncHookIndex: i, usersPostSaveSyncOutcome: 'success' });
            } catch (err) {
              this.updateChronicle({ usersOperation: 'triggerPostSaveSyncTriggers', usersOutcome: 'failed' }, [err]);
              throw err;
            }
          } else {
            this.updateChronicle({ usersPostSaveSyncOutcome: 'invalid-hook' }, [
              new Error('Invalid user post-save sync hook.'),
            ]);
          }
        }
      }
    }
    return response;
  }
  public async triggerPostSaveTriggers(user: AnyRecord, config: AnyRecord, mode = 'onUpdate'): Promise<void> {
    const hooks: unknown = _.get(config, `hooks.${mode}.post`, []);
    if (!Array.isArray(hooks)) return;
    await Promise.all(
      hooks.map(async hook => {
        const name: unknown = _.get(hook, 'function');
        if (name == null) return;
        try {
          const operation = this.input.resolveHook(String(name));
          await this.resolveHookResponse(operation(user, _.get(hook, 'options', {})));
          this.updateChronicle({ usersPostSaveOutcome: 'success' });
        } catch (error) {
          this.updateChronicle({ usersOperation: 'triggerPostSaveTriggers', usersOutcome: 'failed' }, [error]);
        }
      })
    );
  }
  public resolveHookResponse(hookResponse: unknown) {
    if (isObservable(hookResponse)) {
      return firstValueFrom(hookResponse);
    } else {
      return Promise.resolve(hookResponse);
    }
  }
  /** Await login profile writes and all configured hooks before issuing a session. */
  public async authenticateLocal(username: string, password: string): Promise<AnyRecord | null> {
    const user = await localCredentialUser(this.input.repository, username, password);
    if (!user) return null;
    await this.assertAuthenticationAllowed(user);
    const authenticatedId = user.id;
    const authenticatedUsername = user.username;
    const original = structuredClone(user) as unknown as AnyRecord;
    const config = this.getAuthConfig(this.input.defaultBrand().name).local ?? {};
    let candidate = user as unknown as AnyRecord;
    if (this.hasPreSaveTriggerConfigured(config, 'onUpdate')) {
      candidate = await this.triggerPreSaveTriggers(candidate, config as AnyRecord);
      if (!this.checkAllTriggersSuccessOrFailure(candidate))
        throw new AuthenticationRejected('All required conditions for login not met');
    }
    if (candidate.id !== authenticatedId || candidate.username !== authenticatedUsername)
      throw new AuthenticationRejected('Authentication hook changed the account identity');
    await this.input.repository.update(
      'user',
      { id: authenticatedId },
      {
        ...identityProfilePatch(candidate, original),
        lastLogin: new Date(),
      }
    );
    await this.triggerPostSaveTriggers(candidate, config as AnyRecord);
    await this.triggerPostSaveSyncTriggers(candidate, config as AnyRecord);
    return this.resolveLinkedUserCandidate(candidate);
  }

  private async saveExternalProfile(
    brand: BrandingModel,
    profile: AnyRecord,
    config: AnyRecord
  ): Promise<AnyRecord | null> {
    const authenticatedUsername = profile.username;
    const existing = await this.input.repository.one('user', { username: authenticatedUsername });
    const mode = existing ? 'onUpdate' : 'onCreate';
    if (existing) await this.assertAuthenticationAllowed(existing);
    else if (!this.checkAuthorizedEmail(String(profile.email ?? ''), brand.name, String(profile.type)))
      throw new AuthenticationRejected('authorized-email-denied');
    const original = existing ? structuredClone(existing) : undefined;
    let candidate = existing ? { ...existing, ...profile, type: existing.type, roles: existing.roles } : profile;
    if (this.hasPreSaveTriggerConfigured(config, mode)) {
      candidate = await this.triggerPreSaveTriggers(candidate, config, mode);
      if (!this.checkAllTriggersSuccessOrFailure(candidate))
        throw new AuthenticationRejected('All required conditions for login not met');
    }
    // Hooks can enrich profiles but cannot change the authenticated account identity.
    if (candidate.username !== authenticatedUsername || (existing && candidate.id !== existing.id))
      throw new AuthenticationRejected('Authentication hook changed the account identity');
    let saved: AnyRecord;
    let postSubject: AnyRecord;
    if (existing) {
      const rows = await this.input.repository.update(
        'user',
        { id: existing.id },
        identityProfilePatch(candidate, original)
      );
      if (!rows[0]) throw new AuthenticationRejected('No user found');
      saved = rows[0] as unknown as AnyRecord;
      postSubject = rows as unknown as AnyRecord;
    } else {
      saved = (await this.input.repository.create('user', candidate)) as unknown as AnyRecord;
      postSubject = saved;
    }
    await this.triggerPostSaveTriggers(postSubject, config, mode);
    await this.triggerPostSaveSyncTriggers(postSubject, config, mode);
    return this.resolveLinkedUserCandidate(saved);
  }

  public async authenticateOidc(
    config: AnyRecord,
    issuer: AnyRecord,
    context: { session: AnyRecord; query?: AnyRecord },
    tokens: AnyRecord,
    userinfo?: AnyRecord
  ): Promise<AnyRecord | null> {
    const { session } = context;
    if (config.debugMode === true) throw new AuthenticationRejected('oidc-debug-mode');
    if (_.get(config, 'logoutFromAuthServer', true)) {
      const endpoint = issuer.end_session_endpoint;
      const redirect = _.get(config, 'opts.client.post_logout_redirect_uris[0]');
      if (typeof endpoint === 'string') {
        const url = new URL(endpoint);
        const clientId = _.get(config, 'opts.client.client_id');
        if (typeof clientId === 'string') url.searchParams.set('client_id', clientId);
        if (typeof redirect === 'string') url.searchParams.set('post_logout_redirect_uri', redirect);
        session.logoutUrl = url.toString();
      }
    } else session.logoutUrl = this.input.postLogoutRedirect;
    const claims = typeof tokens.claims === 'function' ? (tokens.claims() as AnyRecord) : {};
    const info = userinfo ?? claims;
    const mappings = (config.claimMappings ?? {}) as AnyRecord;
    const username = oidcUsername(config, info);
    if (!username) throw new AuthenticationRejected('Rejected as username does not have a value');
    const brand = this.input.getBrand(String(session.branding ?? this.input.defaultBrand().name));
    const role = this.input.defaultAuthenticatedRole(brand);
    const profile: AnyRecord = {
      username,
      type: 'oidc',
      lastLogin: new Date(),
      roles: this.input.nestedRoles(role?.name ?? 'Researcher', brand.roles).map(item => item.id),
      additionalAttributes: this.mapAdditionalAttributes(
        info,
        (mappings.additionalAttributes ?? {}) as Record<string, string>
      ),
    };
    for (const [field, mapping] of Object.entries({
      name: 'name',
      email: 'email',
      displayname: 'displayName',
      cn: 'cn',
      givenname: 'givenname',
      surname: 'surname',
    })) {
      const value: unknown = _.get(info, String(mappings[mapping] ?? ''));
      profile[field] = value == null ? undefined : String(value);
    }
    profile.email = String(profile.email ?? '').toLowerCase();
    return this.saveExternalProfile(brand, profile, config);
  }

  public async authenticateAaf(brand: BrandingModel, payload: AnyRecord): Promise<AnyRecord | null> {
    const auth = this.getAuthConfig(brand.name);
    const config = (auth.aaf ?? {}) as AnyRecord;
    const username = String(payload[String(config.usernameField ?? DEFAULT_AAF_USERNAME_FIELD)] ?? '');
    if (!username) throw new AuthenticationRejected('Missing AAF username');
    const attributes = payload[String(config.attributesField ?? DEFAULT_AAF_ATTRIBUTES_FIELD)];
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes))
      throw new AuthenticationRejected('Invalid AAF attributes');
    const attrs = attributes as AnyRecord;
    const profile: AnyRecord = {
      username: Buffer.from(username).toString('base64'),
      type: 'aaf',
      lastLogin: new Date(),
      email: String(attrs.mail ?? '').toLowerCase(),
    };
    for (const field of [
      'displayname',
      'cn',
      'edupersonscopedaffiliation',
      'edupersontargetedid',
      'edupersonprincipalname',
      'givenname',
      'surname',
    ])
      if (attrs[field] != null) profile[field] = String(attrs[field]);
    profile.name =
      profile.cn ??
      profile.displayname ??
      ([profile.givenname, profile.surname].filter(Boolean).join(' ') || profile.username);
    const role = this.input.defaultAuthenticatedRole(brand);
    profile.roles = role ? this.input.nestedRoles(role.name, brand.roles).map(item => item.id) : [];
    return this.saveExternalProfile(brand, profile, config);
  }

  public openIdConnectAuthVerifyCallback(
    config: AnyRecord,
    issuer: AnyRecord,
    request: AnyRecord,
    tokens: AnyRecord,
    userinfo: AnyRecord | undefined,
    done: DoneCallback
  ): void {
    this.updateChronicle({ usersAuthProvider: 'oidc', usersAuthOutcome: 'processing' });
    const claims = typeof tokens.claims === 'function' ? (tokens.claims() as AnyRecord) : {};
    const info = userinfo ?? claims;
    if (!oidcUsername(config, info)) {
      this.updateChronicle({ usersAuthOutcome: 'missing-username' }, [new Error('OIDC username claim is missing.')]);
      done(null, null, { message: 'Rejected as username does not have a value' });
      return;
    }
    const session = (request.session ??= {}) as AnyRecord;
    void this.authenticateOidc(config, issuer, { session }, tokens, info).then(
      user => {
        this.updateChronicle({
          usersOperation: 'openIdConnectAuthVerifyCallback',
          usersAuthOutcome: user ? 'success' : 'rejected',
          usersAuthUserId: user?.id,
        });
        done(null, user, undefined);
      },
      error => {
        // The controller captures callback errors once; only identifiers/outcomes belong here.
        this.updateChronicle({ usersOperation: 'openIdConnectAuthVerifyCallback', usersAuthOutcome: 'failure' });
        done(authenticationCallbackError(error), false, undefined);
      }
    );
  }
  public aafAuthVerifyCallback(brand: BrandingModel, payload: AnyRecord, done: DoneCallback): void {
    void this.authenticateAaf(brand, payload).then(
      user => done(null, user || false),
      error => {
        const failure = authenticationCallbackError(error);
        done(failure, false, failure === 'No user found' ? { message: 'No user found' } : undefined);
      }
    );
  }

  public mapAdditionalAttributes(profile: unknown, attributeMappings: Record<string, string>) {
    const additionalAttributes: Record<string, unknown> = {};
    for (const attributeMapping in attributeMappings) {
      const value: unknown = _.get(profile, attributeMapping);
      if (value !== undefined) additionalAttributes[attributeMapping] = value;
    }
    return additionalAttributes;
  }
  public getUserWithUsername(username: string): Observable<UserModel | null> {
    return defer(
      async () =>
        (await this.input.repository.one(
          'user',
          { username: username },
          { populate: ['roles'] }
        )) as unknown as UserModel | null
    );
  }
  public getUserWithId(userid: string | number): Observable<UserModel | null> {
    return defer(
      async () =>
        (await this.input.repository.one(
          'user',
          { id: userid },
          { populate: ['roles'] }
        )) as unknown as UserModel | null
    );
  }
  public getEffectiveUser(userOrId: unknown): Observable<UserModel | null> {
    if (_.isEmpty(userOrId)) {
      return of(null);
    }

    if (_.isString(userOrId) || _.isNumber(userOrId)) {
      if (!/^[a-f\d]{24}$/i.test(String(userOrId)))
        return this.getUserWithUsername(String(userOrId)).pipe(
          flatMap(user => (user ? this.getEffectiveUser(user) : of(null)))
        );
      return this.getUserWithId(String(userOrId)).pipe(
        flatMap(user => {
          if (user != null) {
            return this.getEffectiveUser(user);
          }
          return this.getUserWithUsername(String(userOrId)).pipe(
            flatMap(userByUsername => {
              if (userByUsername != null) {
                return this.getEffectiveUser(userByUsername);
              }
              return of(null);
            })
          );
        })
      );
    }

    const userObj = userOrId as UserModel;
    this.normalizeAccountLinkState(userObj);
    if (_.isEmpty(userObj.linkedPrimaryUserId)) {
      return of(userObj as UserModel);
    }

    return this.getUserWithId(String(userObj.linkedPrimaryUserId)).pipe(
      map(primaryUser => {
        if (primaryUser == null) {
          return userObj as UserModel;
        }
        return primaryUser;
      })
    );
  }
  public checkAuthorizedEmail(email: string, branding: string, authType: string): boolean {
    // Must pass email.
    if (!email) {
      this.updateChronicle({ usersEmailAccessOutcome: 'missing-email' }, [], 'warn');
      return false;
    }

    // Assess email address.
    const emailParts = email.includes('@') ? email.split('@') : [];
    if (emailParts.length !== 2) {
      this.updateChronicle({ usersEmailAccessOutcome: 'invalid-address' }, [], 'warn');
      return false;
    }

    // Get the configuration data.
    const brandingAwareData = { authorizedDomainsEmails: this.input.authorizedEmails(branding) };
    const authorizedDomainsEmails = _.get(
      brandingAwareData,
      'authorizedDomainsEmails',
      {}
    ) as Partial<AuthorizedDomainsEmails>;

    if (authorizedDomainsEmails.enabled?.toString() !== 'true') {
      this.updateChronicle({ usersEmailAccessOutcome: 'disabled' }, [], 'warn');
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
      this.updateChronicle({ usersEmailAccessOutcome: 'unsupported-provider' }, [], 'warn');
      return false;
    }

    // Check configuration.
    if (domains.length === 0 && emails.length === 0) {
      this.updateChronicle({ usersEmailAccessOutcome: 'unrestricted' });
      return true;
    }

    // Assess domains and exceptions.
    const emailDomain = emailParts[1];
    const isAllowedDomain = domains.indexOf(emailDomain) !== -1;
    if (isAllowedDomain) {
      this.updateChronicle({ usersEmailAccessOutcome: 'allowed-domain' });
      return true;
    }

    const isAllowedException = emails.indexOf(email) !== -1;
    if (isAllowedException) {
      this.updateChronicle({ usersEmailAccessOutcome: 'allowed-exception' });
      return true;
    }

    // Checks did not pass, so email is not allowed.
    this.updateChronicle({ usersEmailAccessOutcome: 'denied', usersAuthProvider: authType }, [], 'warn');
    return false;
  }
}
