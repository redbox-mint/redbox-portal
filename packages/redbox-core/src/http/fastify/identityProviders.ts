import jwt, { type Secret, type VerifyOptions } from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';
import type { AuthenticationAccounts, AuthBrandConfig, AnyRecord, OidcAuthConfig } from '../../authentication/Accounts';
import type { BrandingModel } from '../../model/storage/BrandingModel';
import { trackHttpRequestWork } from '../../middleware/requestLifetime';

export interface NativeIdentityProvidersInput {
  readonly accounts: AuthenticationAccounts;
  readonly config: AuthBrandConfig;
  brand(request: FastifyRequest): BrandingModel;
}
interface AafOptions extends VerifyOptions {
  secretOrKey?: Secret;
  secretOrKeyProvider?(
    request: FastifyRequest,
    token: string,
    done: (error: unknown, key?: Secret) => void
  ): void | Promise<void>;
  jsonWebTokenOptions?: VerifyOptions;
}

/** Application-local configurations. No Passport request facade, middleware or global registry. */
export async function prepareNativeIdentityProviders(input: NativeIdentityProvidersInput) {
  const aaf = input.config.active?.includes('aaf') ? ((input.config.aaf?.opts as AafOptions) ?? {}) : undefined;
  if (aaf && ((!aaf.secretOrKey && !aaf.secretOrKeyProvider) || (aaf.secretOrKey && aaf.secretOrKeyProvider)))
    throw new TypeError('AAF requires exactly one signing key or key provider');
  const oidc = new Map<
    string,
    {
      client: typeof import('openid-client');
      configuration: import('openid-client').Configuration;
      provider: OidcAuthConfig;
      callback?: string;
      sessionKey: string;
    }
  >();
  if (input.config.active?.includes('oidc')) {
    const client = await import('openid-client');
    const configured = input.config.oidc;
    const providers = Array.isArray(configured) ? configured : configured ? [configured] : [];
    if (!providers.length) throw new Error('OIDC is active without provider configuration');
    for (const provider of providers) {
      const metadata = provider.opts.client as Partial<import('openid-client').ClientMetadata> & {
        client_id?: string;
        redirect_uris?: string[];
      };
      const clientId = String(metadata?.client_id ?? '');
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
            if (String(Reflect.get(issuer, 'issuer')).startsWith('http://'))
              client.allowInsecureRequests(configuration);
          }
          break;
        } catch {
          if (attempt + 1 === attempts) throw new Error('OIDC discovery failed');
          await new Promise(resolve => setTimeout(resolve, provider.discoverFailureSleep ?? 1000));
        }
      }
      if (!configuration) throw new Error('OIDC discovery did not produce a configuration');
      oidc.set(provider.identifier ?? '', {
        client,
        configuration,
        provider,
        callback: metadata.redirect_uris?.[0],
        sessionKey: new URL(configuration.serverMetadata().issuer).host,
      });
    }
  }
  const selected = (id: unknown) => {
    if (id !== undefined && (typeof id !== 'string' || id.length > 4096 || /[\r\n]/.test(id) || id.includes('\u0000')))
      throw new URIError('Invalid OIDC identifier');
    const provider = oidc.get(id || '');
    if (!provider) throw new Error('Unknown OIDC provider');
    return provider;
  };
  return {
    async aaf(request: FastifyRequest, assertion: string) {
      if (!aaf) throw new Error('AAF is not configured');
      let key = aaf.secretOrKey;
      if (aaf.secretOrKeyProvider) {
        key = await new Promise<Secret | undefined>((resolve, reject) => {
          const work = aaf.secretOrKeyProvider!(request, assertion, (error, value) =>
            resolve(error ? undefined : value)
          );
          if (work) {
            trackHttpRequestWork(request, work);
            void work.catch(reject);
          }
        });
        if (!key) return null;
      }
      let payload: string | jwt.JwtPayload;
      try {
        payload = jwt.verify(assertion, key!, {
          ignoreNotBefore: true,
          clockTolerance: 120,
          ...aaf.jsonWebTokenOptions,
          audience: aaf.audience,
          issuer: aaf.issuer ?? 'https://rapid.aaf.edu.au',
          algorithms: aaf.algorithms,
          ignoreExpiration: !!aaf.ignoreExpiration,
        });
      } catch {
        return null;
      }
      return input.accounts.authenticateAaf(input.brand(request), payload as AnyRecord);
    },
    async begin(request: FastifyRequest, id: unknown) {
      const { client, configuration, provider, callback, sessionKey } = selected(id);
      const initial = new URLSearchParams();
      for (const [key, value] of Object.entries(provider.opts.params ?? {}))
        if (key !== 'scope' && value != null)
          initial.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      initial.set('state', client.randomState());
      const redirect = client.buildAuthorizationUrl(configuration, initial);
      const params = redirect.searchParams;
      if (params.get('response_type')?.includes('id_token')) {
        params.set('nonce', client.randomNonce());
        if (!params.has('response_mode')) params.set('response_mode', 'form_post');
      }
      const verifier = client.randomPKCECodeVerifier();
      params.set('code_challenge', await client.calculatePKCECodeChallenge(verifier));
      params.set('code_challenge_method', 'S256');
      if (!configuration.serverMetadata().supportsPKCE() && !params.has('nonce'))
        params.set('state', client.randomState());
      if (callback && !params.has('redirect_uri')) params.set('redirect_uri', callback);
      const scope = provider.opts.params?.scope;
      if (typeof scope === 'string' && scope && !params.has('scope')) params.set('scope', scope);
      Reflect.set(request.session, sessionKey, {
        code_verifier: verifier,
        state: params.get('state'),
        ...(params.has('nonce') ? { nonce: params.get('nonce') } : {}),
        ...(params.has('max_age') ? { max_age: parseInt(params.get('max_age')!, 10) } : {}),
      });
      return redirect.href;
    },
    async callback(request: FastifyRequest, id: unknown) {
      const { client, configuration, provider, callback, sessionKey } = selected(id);
      const state = Reflect.get(request.session, sessionKey) as
        | { code_verifier?: string; state?: string; nonce?: string; max_age?: number }
        | undefined;
      Reflect.deleteProperty(request.session, sessionKey);
      if (!state?.code_verifier) return null;
      // The configured callback owns the origin; only incoming query parameters
      // cross this boundary. Host/forwarding headers cannot select an IdP callback.
      const incoming = new URL(request.raw.url!, 'http://request.invalid');
      const current = callback ? new URL(callback) : new URL(request.url, `${request.protocol}://${request.host}`);
      if (!callback) current.search = '';
      for (const [key, value] of incoming.searchParams) current.searchParams.append(key, value);
      let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
      try {
        tokens = await client.authorizationCodeGrant(configuration, current, {
          pkceCodeVerifier: state.code_verifier,
          expectedState: state.state,
          expectedNonce: state.nonce,
          maxAge: state.max_age,
        });
      } catch (error) {
        if (error instanceof client.AuthorizationResponseError && error.error === 'access_denied') return null;
        throw error;
      }
      const claims = tokens.claims();
      const info =
        provider.userInfoSource !== 'tokenset_claims' && tokens.access_token && claims?.sub
          ? await client.fetchUserInfo(configuration, tokens.access_token, claims.sub)
          : undefined;
      return input.accounts.authenticateOidc(
        provider as unknown as AnyRecord,
        configuration.serverMetadata() as unknown as AnyRecord,
        { session: request.session as unknown as AnyRecord },
        tokens as unknown as AnyRecord,
        info as AnyRecord | undefined
      );
    },
  };
}
