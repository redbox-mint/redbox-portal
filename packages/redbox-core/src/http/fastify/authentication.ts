import type { FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { requestAccepts } from './responses';
import { requestString } from '../requestValues';
import type { AuthenticatedActor, HttpIdentity } from '../express/identity';
import { AuthenticationRejected } from '../../authentication/Accounts';
import { RequestChronicleHelper } from '../../utilities/RequestChronicle';
import type { FastifyPreparation } from './preparation';
import { prepareNativeIdentityProviders, type NativeIdentityProvidersInput } from './identityProviders';

const noCache = { 'Cache-Control': 'no-cache, private', Pragma: 'no-cache', Expires: '0' };
declare module 'fastify' {
  interface Session {
    passport?: { user?: string };
    authenticationVersion?: number;
    user?: Record<string, unknown>;
    branding?: string;
    portal?: string;
    redirUrl?: string;
    logoutUrl?: string;
  }
}
type Data = Record<string, unknown>;
const data = (value: unknown): Data => (value && typeof value === 'object' ? (value as Data) : {});

/** Match passport-local's bracket lookup and body-before-query fallback. */
function credential(request: FastifyRequest, field: string): unknown {
  const lookup = (input: unknown) => {
    for (const part of field.replaceAll(']', '').split('[')) {
      if (!input || typeof input !== 'object') return undefined;
      const value: unknown = Reflect.get(input, part);
      if (value === undefined) return undefined;
      if (typeof value !== 'object') return value;
      input = value;
    }
    return undefined;
  };
  return lookup(request.body) || lookup(request.query);
}
function localRedirect(value: unknown, root: string, fallback: string) {
  return typeof value === 'string' && value.startsWith(root + '/') && !value.startsWith('//') && !/[\r\n\\]/.test(value)
    ? value
    : fallback;
}

/** Internal application binding, borrowing the native session boundary. FM-016
 * supplies context/policy/CSRF stages; no Express handler is used here.
 */
export async function prepareNativeAuthentication(
  app: FastifyPreparation,
  input: NativeIdentityProvidersInput & { readonly identity: HttpIdentity }
) {
  const providers = await prepareNativeIdentityProviders(input);
  const actors = new WeakMap<FastifyRequest, AuthenticatedActor>();
  app.addHook('preValidation', async request => {
    if (!request.session) return;
    if (
      (request.session.get('passport') || request.session.get('user')) &&
      request.session.get('authenticationVersion') !== 6
    )
      await request.session.regenerate();
    const passport = data(request.session.get('passport'));
    if (requestString(passport.user)) {
      const actor = await input.identity.session(passport.user as string);
      if (actor) actors.set(request, actor);
      else delete passport.user;
    }
  });
  return {
    providers,
    accounts: input.accounts,
    actor: (request: FastifyRequest) => actors.get(request),
    async authenticate(request: FastifyRequest): Promise<AuthenticatedActor | false> {
      const actor = actors.get(request);
      if (request.headers.authorization === undefined && actor) return actor;
      let token: unknown;
      if (request.headers.authorization) {
        const authorization = requestString(request.headers.authorization);
        if (!authorization) return false;
        const parts = authorization.split(' ');
        if (parts.length !== 2) return false;
        if (/^Bearer$/i.test(parts[0])) token = parts[1];
      }
      for (const value of [data(request.body).access_token, data(request.query).access_token]) {
        if (value) {
          if (token) return false;
          token = value;
        }
      }
      // Preserve Express's safe 500 for an unsupported credential shape without
      // handing request objects to the cryptographic/provider boundary.
      if (token && typeof token !== 'string') throw new TypeError('Invalid credential input');
      return token ? input.identity.bearer(token as string) : false;
    },
  };
}
export type NativeAuthentication = Awaited<ReturnType<typeof prepareNativeAuthentication>>;

export interface NativeAuthenticationRoutesInput {
  readonly identity: HttpIdentity;
  readonly rootContext?: string;
  readonly defaultBrand: string;
  readonly defaultPortal: string;
  validContext(brand: string, portal: string): boolean;
  brandId(name: string): string;
  postLoginPath(brand: string, portal: string): string;
  readonly postLogoutPath?: string;
  readonly logoutOrigins?: readonly string[];
  readonly credentialFields?: readonly [string, string];
  readonly sessionCookie?: { readonly name: string; readonly path?: string; readonly domain?: string };
  csrf(request: FastifyRequest, reply: FastifyReply): Promise<unknown>;
  audit(action: 'login' | 'logout', actor: AuthenticatedActor, request: FastifyRequest): Promise<void>;
  loginFailure(request: FastifyRequest): Promise<void>;
  renderAuthenticationFailure?(
    request: FastifyRequest,
    reply: FastifyReply,
    reason: 'authorized-email-denied' | 'authentication-rejected'
  ): Promise<void>;
}

/** Qualified provider routes only. They use the existing owned route/hooks and
 * Session methods: no new Fastify decoration, callbacks or registration APIs.
 */
export function installNativeAuthenticationRoutes(
  app: FastifyPreparation,
  authentication: NativeAuthentication,
  input: NativeAuthenticationRoutesInput
) {
  const root = input.rootContext ?? '';
  // Failure-event delivery is observation. Required account/session audit work
  // remains in the transactional login path below.
  const observeLoginFailure = async (request: FastifyRequest) => {
    try {
      await input.loginFailure(request);
    } catch {
      /* observation only */
    }
  };
  const context = (request: FastifyRequest) => {
    const params = data(request.params),
      body = data(request.body),
      query = data(request.query);
    const brand =
      params.branding ?? body.branding ?? query.branding ?? request.session.get('branding') ?? input.defaultBrand;
    const portal = params.portal ?? body.portal ?? query.portal ?? request.session.get('portal') ?? input.defaultPortal;
    return typeof brand === 'string' && typeof portal === 'string' && input.validContext(brand, portal)
      ? { brand, portal }
      : null;
  };
  const clear = (reply: FastifyReply) =>
    reply.header(
      'Set-Cookie',
      cookie.serialize(input.sessionCookie?.name ?? 'redbox.v6.sid', '', {
        path: input.sessionCookie?.path ?? '/',
        domain: input.sessionCookie?.domain,
        expires: new Date(1),
      })
    );
  const denied = async (
    request: FastifyRequest,
    reply: FastifyReply,
    local: boolean,
    reason: 'authorized-email-denied' | 'authentication-rejected' = 'authentication-rejected'
  ) => {
    await observeLoginFailure(request);
    if (local) return reply.headers(noCache).send({ message: 'Incorrect username/password', user: false });
    if (input.renderAuthenticationFailure && requestAccepts(request).types(['html', 'json']) === 'html') {
      await input.renderAuthenticationFailure(request, reply, reason);
      return reply;
    }
    return reply.headers(noCache).code(403).send({ message: 'Authentication rejected', user: false });
  };
  const login = (kind: 'local' | 'aaf' | 'oidc') => async (request: FastifyRequest, reply: FastifyReply) => {
    const chronicle = RequestChronicleHelper.existing(request);
    chronicle?.addInfo({ userLoginType: kind, userLoginSuccess: false });
    const brand = request.session.get('branding'),
      portal = request.session.get('portal');
    const selected =
      kind === 'oidc'
        ? typeof brand === 'string' && typeof portal === 'string' && input.validContext(brand, portal)
          ? { brand, portal }
          : null
        : context(request);
    if (!selected) return reply.code(400).send({ message: 'Invalid branding or portal' });
    Object.assign(data(request.params), { branding: selected.brand, portal: selected.portal });
    const fields = [input.credentialFields?.[0] || 'username', input.credentialFields?.[1] || 'password'];
    const username = kind === 'local' ? credential(request, fields[0]) : undefined;
    const password = kind === 'local' ? credential(request, fields[1]) : undefined;
    if (
      kind === 'local' &&
      [username, password].some(value => typeof value !== 'string' || !value || value.length > 4096)
    ) {
      await observeLoginFailure(request);
      return reply.code(400).send({ message: 'Invalid login parameters' });
    }
    let actor: AuthenticatedActor | false = false;
    let reason: 'authorized-email-denied' | 'authentication-rejected' = 'authentication-rejected';
    try {
      if (
        kind === 'oidc' &&
        request.method === 'GET' &&
        !['code', 'error', 'response'].some(key =>
          new URL(request.raw.url!, 'http://request.invalid').searchParams.has(key)
        )
      ) {
        const redirect = await authentication.providers.begin(request, data(request.query).id);
        await request.session.save();
        return reply.redirect(redirect);
      }
      const user =
        kind === 'local'
          ? await authentication.accounts.authenticateLocal(username as string, password as string)
          : kind === 'aaf'
            ? await authentication.providers.aaf(request, data(request.body).assertion as string)
            : await authentication.providers.callback(request, data(request.query).id);
      if (user && typeof user.id === 'string') actor = await input.identity.session(user.id);
    } catch (error) {
      if (error instanceof AuthenticationRejected && error.message === 'authorized-email-denied')
        reason = 'authorized-email-denied';
      if (
        !(error instanceof AuthenticationRejected) &&
        !(error instanceof Error && error.message === 'Account is disabled') &&
        !(error && typeof error === 'object' && requestString(Reflect.get(error, 'code'))?.startsWith('OAUTH_'))
      ) {
        await observeLoginFailure(request);
        throw error;
      }
    }
    if (actor && !actor.roles.some(role => role.brandId === input.brandId(selected.brand))) actor = false;
    if (!actor) return denied(request, reply, kind === 'local', reason);
    const profile = await input.identity.profile(actor.id);
    if (!profile) return reply.code(403).send();
    const logoutUrl = request.session.get('logoutUrl');
    const redirect = localRedirect(
      request.session.get('redirUrl') ?? data(request.query).redirUrl,
      root,
      input.postLoginPath(selected.brand, selected.portal)
    );
    try {
      await request.session.regenerate();
      request.session.set('passport', { user: actor.id });
      // Match Passport's save-before-continuation, then persist the application
      // version/context and audit before publishing the rotated credential.
      await request.session.save();
      request.session.set('authenticationVersion', 6);
      request.session.set('branding', selected.brand);
      request.session.set('portal', selected.portal);
      if (kind === 'oidc' && actor.type === 'oidc' && typeof logoutUrl === 'string') {
        const url = URL.parse(logoutUrl);
        if (url && input.logoutOrigins?.includes(url.origin)) request.session.set('logoutUrl', url.toString());
      }
      await request.session.save();
      await input.audit('login', actor, request);
    } catch (error) {
      await observeLoginFailure(request);
      await request.session.destroy();
      clear(reply);
      throw error;
    }
    chronicle?.addInfo({ userLoginSuccess: true });
    return kind === 'local' && request.headers['x-source'] === 'jsclient'
      ? reply.headers(noCache).send({ user: profile, message: 'Login OK', url: redirect })
      : reply.redirect(redirect);
  };
  app.post(root + '/user/login_local', { preHandler: input.csrf }, login('local'));
  app.post(root + '/user/login_aaf', async (request, reply) => {
    const assertion = data(request.body).assertion;
    if (typeof assertion !== 'string' || !assertion || assertion.length > 65536)
      return reply.code(400).send({ message: 'Invalid assertion' });
    return login('aaf')(request, reply);
  });
  app.route({ method: ['GET', 'HEAD'], url: root + '/user/login_oidc', handler: login('oidc') });
  app.route({ method: 'HEAD', url: root + '/user/begin_oidc', handler: (_request, reply) => reply.code(405).send() });
  app.get(root + '/user/begin_oidc', async (request, reply) => {
    const selected = context(request);
    if (!selected) return reply.code(400).send({ message: 'Invalid branding or portal' });
    request.session.set('branding', selected.brand);
    request.session.set('portal', selected.portal);
    if (typeof data(request.query).redirUrl === 'string')
      request.session.set(
        'redirUrl',
        localRedirect(data(request.query).redirUrl, root, input.postLoginPath(selected.brand, selected.portal))
      );
    const redirect = await authentication.providers.begin(request, data(request.query).id);
    await request.session.save();
    return reply.redirect(redirect);
  });
  const info = async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = await input.identity.session(authentication.actor(request)?.id ?? '');
    if (!actor) return reply.code(403).send({ message: 'error-please-login' });
    if (data(request.params).branding) {
      const selected = context(request);
      if (!selected || !actor.roles.some(role => role.brandId === input.brandId(selected.brand)))
        return reply.code(403).send();
    }
    RequestChronicleHelper.existing(request)?.addInfo({ userInfoSuccess: true, userUsername: actor.username });
    return reply.headers(noCache).send({ user: await input.identity.profile(actor.id) });
  };
  for (const path of ['/user/info', '/:branding/:portal/user/info'])
    app.route({ method: ['GET', 'HEAD'], url: root + path, handler: info });
  app.route({
    method: ['GET', 'HEAD'],
    url: root + '/:branding/:portal/user/logout',
    handler: (_request, reply) =>
      reply.header('Allow', 'POST').code(405).type('text/plain; charset=utf-8').send('Method Not Allowed'),
  });
  app.post(root + '/:branding/:portal/user/logout', { preHandler: input.csrf }, async (request, reply) => {
    const selected = context(request);
    if (!selected) return reply.code(400).send();
    const actor = await input.identity.session(authentication.actor(request)?.id ?? '');
    if (!actor || !actor.roles.some(role => role.brandId === input.brandId(selected.brand)))
      return reply.code(403).send();
    let redirect = input.postLogoutPath || root + '/' + selected.brand + '/' + selected.portal + '/home';
    const candidate = request.session.get('logoutUrl');
    if (actor.type === 'oidc' && typeof candidate === 'string') {
      const url = URL.parse(candidate);
      if (url && input.logoutOrigins?.includes(url.origin)) redirect = url.toString();
    }
    const passport = data(request.session.get('passport'));
    delete passport.user;
    await request.session.save();
    await request.session.regenerate();
    await request.session.destroy();
    await input.audit('logout', actor, request);
    clear(reply);
    return reply.headers(noCache).redirect(redirect);
  });
}
