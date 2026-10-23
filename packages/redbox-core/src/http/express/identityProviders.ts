import { AuthenticationRejected } from '../../authentication/Accounts';
import { trackHttpRequestWork } from '../../middleware/requestLifetime';
import type { createHttpAuthentication } from './authentication';
import type { Request } from 'express';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt, type StrategyOptionsWithRequest } from 'passport-jwt';
import type { AuthenticationAccounts, AuthBrandConfig, AnyRecord } from '../../authentication/Accounts';
import type { BrandingModel } from '../../model/storage/BrandingModel';

export interface IdentityProvidersInput {
  readonly passport: Pick<ReturnType<typeof createHttpAuthentication>['passport'], 'use'>;
  readonly accounts: AuthenticationAccounts;
  readonly config: AuthBrandConfig;
  brand(req: Request): BrandingModel;
}

export function installLocalAuthentication(input: IdentityProvidersInput): void {
  input.passport.use(
    'local',
    new LocalStrategy(
      {
        usernameField: input.config.local?.usernameField ?? 'username',
        passwordField: input.config.local?.passwordField ?? 'password',
      },
      (username, password, done) => {
        void input.accounts.authenticateLocal(username, password).then(
          user =>
            done(null, user || false, { message: user ? 'Logged In Successfully' : 'Incorrect username/password' }),
          error => {
            if (
              error instanceof AuthenticationRejected ||
              (error instanceof Error && error.message === 'Account is disabled')
            )
              done(null, false, { message: 'Authentication rejected' });
            else done(error, false, { message: 'Authentication failed' });
          }
        );
      }
    )
  );
}

export function installAafAuthentication(
  input: IdentityProvidersInput,
  verify?: AuthenticationAccounts['aafAuthVerifyCallback']
): void {
  if (!input.config.active?.includes('aaf')) return;
  const options = input.config.aaf?.opts ?? {};
  const strategyOptions = {
    issuer: 'https://rapid.aaf.edu.au',
    ...options,
    passReqToCallback: true,
    jwtFromRequest: ExtractJwt.fromBodyField('assertion'),
    jsonWebTokenOptions: {
      issuer: 'https://rapid.aaf.edu.au',
      ignoreNotBefore: true,
      clockTolerance: 120,
      ...(options.jsonWebTokenOptions as object | undefined),
    },
  } as StrategyOptionsWithRequest;
  input.passport.use(
    'aaf-jwt',
    new JwtStrategy(strategyOptions, (req: Request, payload: AnyRecord, done) => {
      const brand = input.brand(req);
      if (verify) verify(brand, payload, done);
      else
        void input.accounts.authenticateAaf(brand, payload).then(
          user => done(null, user || false),
          error => done(error, false)
        );
    })
  );
}

/** Native imports and discovery settle before public admission. No Sails ready callback. */
export async function installOidcAuthentication(input: IdentityProvidersInput): Promise<void> {
  if (!input.config.active?.includes('oidc')) return;
  const client = await import('openid-client');
  const { Strategy } = await import('openid-client/passport');
  const configured = input.config.oidc;
  const providers = Array.isArray(configured) ? configured : configured ? [configured] : [];
  if (!providers.length) throw new Error('OIDC is active without provider configuration');
  for (const provider of providers) {
    const metadata = (provider.opts.client ?? {}) as Partial<import('openid-client').ClientMetadata> & {
      client_id?: string;
      redirect_uris?: string[];
    };
    const clientId = String(metadata.client_id ?? '');
    if (!clientId) throw new Error('OIDC client_id is required');
    const issuer = provider.opts.issuer;
    let configuration: import('openid-client').Configuration | undefined;
    const attempts = Math.max(1, provider.discoverAttemptsMax ?? 1);
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        if (typeof issuer === 'string')
          configuration = await client.discovery(
            new URL(issuer.replace(/\/+$/, '')),
            clientId,
            metadata,
            undefined,
            issuer.startsWith('http://') ? { execute: [client.allowInsecureRequests] } : undefined
          );
        else {
          if (!issuer || typeof issuer !== 'object' || typeof Reflect.get(issuer, 'issuer') !== 'string')
            throw new Error('Invalid OIDC issuer');
          configuration = new client.Configuration(
            issuer as import('openid-client').ServerMetadata,
            clientId,
            metadata
          );
          if (String(Reflect.get(issuer, 'issuer')).startsWith('http://')) client.allowInsecureRequests(configuration);
        }
        break;
      } catch {
        if (attempt + 1 === attempts) throw new Error('OIDC discovery failed');
        await new Promise(resolve => setTimeout(resolve, provider.discoverFailureSleep ?? 1000));
      }
    }
    if (!configuration) throw new Error('OIDC discovery did not produce a configuration');
    const oidc = configuration;
    const params = provider.opts.params ?? {};
    const strategy = new Strategy(
      {
        config: oidc,
        passReqToCallback: true,
        callbackURL: metadata.redirect_uris?.[0],
        scope: typeof params.scope === 'string' ? params.scope : undefined,
      },
      async (req, tokens, done) => {
        try {
          const claims = tokens.claims();
          const info =
            provider.userInfoSource !== 'tokenset_claims' && tokens.access_token && claims?.sub
              ? await client.fetchUserInfo(oidc, tokens.access_token, claims.sub)
              : undefined;
          const user = await input.accounts.authenticateOidc(
            provider as unknown as AnyRecord,
            oidc.serverMetadata() as unknown as AnyRecord,
            { session: req.session as unknown as AnyRecord },
            tokens as unknown as AnyRecord,
            info as AnyRecord | undefined
          );
          done(null, user || false);
        } catch (error) {
          done(error, false);
        }
      }
    );
    const defaults = strategy.authorizationRequestParams.bind(strategy);
    strategy.authorizationRequestParams = (req, options) => {
      const result = new URLSearchParams(defaults(req, options) ?? {});
      for (const [key, value] of Object.entries(params))
        if (key !== 'scope' && value != null)
          result.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      result.set('state', client.randomState());
      return result;
    };
    const authenticate = strategy.authenticate;
    strategy.authenticate = function (req, options) {
      // Passport's public terminal callbacks expose completion even after a client abort.
      const completion = Promise.withResolvers<void>();
      trackHttpRequestWork(req, completion.promise);
      for (const name of ['success', 'fail', 'redirect', 'pass', 'error']) {
        const terminal: unknown = Reflect.get(this, name);
        if (typeof terminal !== 'function') continue;
        Reflect.set(this, name, (...args: unknown[]) => {
          try {
            return Reflect.apply(terminal, this, args);
          } finally {
            completion.resolve();
          }
        });
      }
      try {
        authenticate.call(this, req, options);
      } catch (error) {
        completion.resolve();
        throw error;
      }
    };
    input.passport.use(provider.identifier ? 'oidc-' + provider.identifier : 'oidc', strategy);
  }
}
