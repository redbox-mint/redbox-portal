import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import type { AuthBrandConfig } from '../../../src/authentication/Accounts';

/** Local protocol fixture, not a stub of openid-client or the account mapper.
 * Checks client authentication, redirect binding, one-use codes and S256 PKCE;
 * emits actual signed ID tokens and serves discovery/JWKS/userinfo over HTTP.
 */
export async function oidcFixture() {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'fm015-local-key';
  const codes = new Map<string, { challenge: string; redirect: string; subject: string; nonce?: string }>();
  const access = new Map<string, string>();
  const calls = { discovery: 0, authorization: 0, token: 0, userinfo: 0, pkce: 0, logout: 0 };
  let mode = 'good';
  let tokenWork: (() => Promise<void>) | undefined;
  let issuer = '';
  const profile = (subject: string) => ({
    sub: subject,
    preferred_username: subject.toUpperCase(),
    name: 'OIDC Fixture',
    email: subject === 'denied' ? 'denied@outside.invalid' : subject.toUpperCase() + '@EXAMPLE.INVALID',
    department: { name: 'Research' },
  });
  const metadata = (endpoints: Partial<import('openid-client').ServerMetadata> = {}) => ({
    issuer,
    authorization_endpoint: issuer + '/authorize',
    token_endpoint: issuer + '/token',
    userinfo_endpoint: issuer + '/userinfo',
    jwks_uri: issuer + '/jwks',
    end_session_endpoint: issuer + '/logout',
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
    ...endpoints,
  });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, issuer);
      const json = (body: unknown, status = 200) => {
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === '/.well-known/openid-configuration') {
        calls.discovery++;
        if (mode === 'discovery-error') return json({ error: 'discovery-failed' }, 500);
        return json(metadata());
      }
      if (url.pathname === '/jwks')
        return json({ keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }] });
      if (url.pathname === '/authorize') {
        calls.authorization++;
        assert.equal(url.searchParams.get('client_id'), 'redbox');
        assert.equal(url.searchParams.get('response_type'), 'code');
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        assert(url.searchParams.get('scope')?.includes('openid'));
        assert(url.searchParams.get('state'));
        const redirect = url.searchParams.get('redirect_uri')!;
        const callback = new URL(redirect);
        // Provider identifiers are response parameters, not part of redirect_uri
        // (openid-client strips response query parameters for token exchange).
        if (url.searchParams.has('portal_provider'))
          callback.searchParams.set('id', url.searchParams.get('portal_provider')!);
        callback.searchParams.set('state', url.searchParams.get('state')!);
        if (mode === 'access-denied') callback.searchParams.set('error', 'access_denied');
        else {
          const code = randomUUID();
          codes.set(code, {
            challenge: url.searchParams.get('code_challenge')!,
            redirect,
            subject: url.searchParams.get('login_hint') ?? 'allowed',
            nonce: url.searchParams.get('nonce') ?? undefined,
          });
          callback.searchParams.set('code', code);
        }
        res.writeHead(302, { location: callback.href });
        res.end();
        return;
      }
      if (url.pathname === '/token') {
        calls.token++;
        await tokenWork?.();
        let text = '';
        for await (const chunk of req) text += chunk;
        const params = new URLSearchParams(text);
        const basic = req.headers.authorization && Buffer.from(req.headers.authorization.slice(6), 'base64').toString();
        assert(
          basic === 'redbox:fixture-client-secret' ||
            (params.get('client_id') === 'redbox' && params.get('client_secret') === 'fixture-client-secret')
        );
        assert.equal(params.get('grant_type'), 'authorization_code');
        const code = params.get('code')!;
        const state = codes.get(code);
        codes.delete(code);
        if (
          !state ||
          params.get('redirect_uri') !== state.redirect ||
          createHash('sha256')
            .update(params.get('code_verifier') ?? '')
            .digest('base64url') !== state.challenge
        )
          return json({ error: 'invalid_grant' }, 400);
        calls.pkce++;
        if (mode === 'token-error')
          return json({ error: 'invalid_grant', error_description: 'private-provider-token-detail' }, 400);
        const now = Math.floor(Date.now() / 1000);
        const token = [
          Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })).toString('base64url'),
          Buffer.from(
            JSON.stringify({
              ...profile(state.subject),
              iss: mode === 'wrong-issuer' ? 'https://wrong.invalid' : issuer,
              aud: mode === 'wrong-audience' ? 'wrong-client' : 'redbox',
              iat: now,
              exp: mode === 'expired' ? now - 3600 : now + 300,
              ...(state.nonce ? { nonce: state.nonce } : {}),
            })
          ).toString('base64url'),
        ].join('.');
        const id = token + '.' + sign('RSA-SHA256', Buffer.from(token), keys.privateKey).toString('base64url');
        const accessToken = randomUUID();
        access.set(accessToken, state.subject);
        return json({ access_token: accessToken, token_type: 'Bearer', expires_in: 300, id_token: id });
      }
      if (url.pathname === '/userinfo') {
        calls.userinfo++;
        const subject = access.get(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
        if (mode === 'userinfo-error') return json({ error: 'private-userinfo-detail' }, 500);
        if (!subject) return json({ error: 'invalid_token' }, 401);
        return json({ ...profile(subject), sub: mode === 'wrong-subject' ? 'wrong-subject' : subject });
      }
      if (url.pathname === '/logout') {
        calls.logout++;
        res.writeHead(302, { location: url.searchParams.get('post_logout_redirect_uri') ?? '/' });
        res.end();
        return;
      }
      json({ error: 'not-found' }, 404);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  issuer = `http://127.0.0.1:${address.port}`;
  return {
    issuer,
    metadata,
    calls,
    setMode(value: string) {
      mode = value;
    },
    pauseToken(work: () => Promise<void>) {
      tokenWork = work;
    },
    config(port: number, subject = 'allowed', identifier?: string, claims = false): AuthBrandConfig {
      return {
        active: ['local', 'aaf', 'oidc'],
        aaf: { opts: { secretOrKey: 'fm015-synthetic-aaf-signature-secret', algorithms: ['HS256'] } },
        oidc: {
          identifier,
          userInfoSource: claims ? 'tokenset_claims' : 'userinfo',
          opts: {
            issuer,
            client: {
              client_id: 'redbox',
              client_secret: 'fixture-client-secret',
              redirect_uris: [`http://127.0.0.1:${port}/portal/user/login_oidc`],
              post_logout_redirect_uris: [`http://127.0.0.1:${port}/portal/default/rdmp/home`],
            },
            params: {
              scope: 'openid profile email',
              login_hint: subject,
              ...(identifier ? { portal_provider: identifier } : {}),
            },
          },
          claimMappings: {
            username: 'preferred_username',
            email: 'email',
            name: 'name',
            additionalAttributes: { 'department.name': 'department.name' },
          },
          claimMappingOptions: { usernameToLowercase: true },
        } as NonNullable<AuthBrandConfig['oidc']>,
      };
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    },
  };
}
