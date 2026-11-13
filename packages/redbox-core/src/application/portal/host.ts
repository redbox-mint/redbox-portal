import { serveStaticAsset } from '../../http/fastify/assets';
import { sendPageError } from '../../http/fastify/pages';
import { httpReplySubmitted } from '../../http/fastify/errorBoundary';
import { requestContext } from '../../http/context';
import { applyPageHeaders } from '../../pages/headers';
import { requestPathname } from '../../http/fastify/router';
import { integrationDeclarations } from '../../http/integrationRoutes';
import { integrationGuard } from '../../http/fastify/integrations';
import { mutationGuard } from '../../http/fastify/mutations';
import { mutationDeclarations } from '../../http/mutationRoutes';
import { recordQueryReadDeclarations } from '../../http/readRoutes';
import { identityAdministrationDeclarations } from '../../http/identityRoutes';
import { identityAdministrationGuard } from '../../http/fastify/identityAdministration';
import { schemaReadPrelude } from '../../http/fastify/readActions';
import { referenceReadDeclarations } from '../../http/referenceRoutes';
import { coreRouteName } from '../../http/fastify/routes';
import type { RouteBinding } from '../../http/fastify/routes';
import type { Application } from '../Application';
import { portalHostSettings, portalHttpSettings, type PortalMetadataContext } from './httpPlan';
import type { PersistenceOwner } from '../../persistence/owner';
import { recordMetadataBodyPrelude } from '../../http/controllers/webservice/RecordController';
import { createControllerHost } from '../../http/fastify/composition';
import { createNativePolicies, type NativePolicyInput } from '../../http/fastify/policies';
import { createNativeCsrf } from '../../http/fastify/csrf';
import { prepareNativeSessions, type NativeSessionConfiguration } from '../../http/fastify/session';
import {
  prepareNativeAuthentication,
  installNativeAuthenticationRoutes,
  createNativeAuthenticationActions,
  type NativeAuthentication,
  type NativeAuthenticationRoutesInput,
} from '../../http/fastify/authentication';
import type { NativeIdentityProvidersInput } from '../../http/fastify/identityProviders';
import type { HttpIdentity } from '../../http/express/identity';
import type { FastifyPreparation } from '../../http/fastify/preparation';
import { ownerHttpLogger } from '../../http/fastify/logging';
import type {
  ProductionControllerHostOptions,
  ProductionPolicyInput,
  ProductionCsrfInput,
  ProductionAuthenticationRoutesInput,
} from './compositionInputs';

import { ExpressHost } from '../../http/express/ExpressHost';
import { createPortalApplication, type PortalApplicationOptions } from './application';
import { PortalHttp, type PortalHttpOptions } from './http';
import { prepareCompanionRoutes } from '../../http/integrations/companion/fastify';

/** One production runtime, listener and signal boundary. Construction performs no acquisition. */
export async function createPortalHost(options: PortalApplicationOptions & PortalHttpOptions) {
  let http: PortalHttp;
  const portal = await createPortalApplication({
    ...options,
    hostModules: [
      ...(options.hostModules ?? []),
      { name: 'portal-http', create: () => (http = new PortalHttp(portal, options)) },
    ],
  });
  const { config } = portal;
  const host = new ExpressHost(portal.application, {
    owner: portal.owner,
    ...portalHostSettings(config.server),
    prepare: (router, server) => http.prepare(router, server),
  });
  return { ...portal, host };
}

/** Native production portal assembly. The existing executable continues to use
 * createPortalHost until cutover. Require an explicit conversion scope: the API
 * declaration set alone is not the full API/browser/integration inventory. */
export async function createPortalFastifyHost(
  portal: PortalMetadataContext & {
    readonly installation: import('./installation').ResolvedPortalInstallation;
    readonly application: Application;
    readonly owner: PersistenceOwner;
    readonly data: { readonly users: import('./application').PortalApplicationContext['data']['users'] };
    readonly config: {
      readonly companion: import('../../config/companionDefaults').CompanionConfig;
      readonly server: import('../../configuration/deployment').DeploymentConfiguration['server'];
      readonly redboxSession: NativeSessionConfiguration;
      readonly auth: Pick<
        import('../../config/auth.config').AuthBootstrapConfig,
        'defaultBrand' | 'defaultPortal' | 'loginPath' | 'postLogoutRedir' | 'logoutOrigins'
      >;
    };
  },
  input: {
    authentication(): NativeIdentityProvidersInput & { readonly identity: HttpIdentity };
    readonly login: Omit<
      NativeAuthenticationRoutesInput,
      | 'identity'
      | 'csrf'
      | 'rootContext'
      | 'defaultBrand'
      | 'defaultPortal'
      | 'postLogoutPath'
      | 'logoutOrigins'
      | 'sessionCookie'
    >;
    readonly policies: Omit<NativePolicyInput, 'authenticate' | 'rootContext' | 'portals' | 'loginPath'>;
    /** Owned domain preparation; no listener exists at this point. */
    prepare?(): Promise<void>;
  }
) {
  const { application, owner } = portal;
  const rootContext = portal.config.server.rootContext;
  const resolved = portal.installation;
  const settings = portalHttpSettings(portal.config, { portals: resolved.portals });
  let authentication: NativeAuthentication | undefined;
  const policies = createNativePolicies({
    ...input.policies,
    rootContext,
    portals: settings.portals,
    loginPath: settings.loginPath,
    authenticate: request => {
      if (!authentication) throw new Error('Authentication has not been prepared');
      return authentication.authenticate(request);
    },
  } satisfies ProductionPolicyInput);
  const csrf = createNativeCsrf({
    origins: settings.origins,
    authenticateBearer: token => input.authentication().identity.bearer(token),
  } satisfies ProductionCsrfInput);
  if (resolved.pages) resolved.pages.csrfToken = csrf.generateToken;
  const trustProxy = settings.host.trustProxy;
  const host = await createControllerHost(application, {
    owner,
    hostname: settings.host.hostname,
    port: settings.host.port,
    stopDeadlineMs: settings.host.stopDeadlineMs,
    trustProxy: typeof trustProxy === 'number' ? (_address, hop) => hop < trustProxy : trustProxy,
    logger: ownerHttpLogger(owner),
    routeRegistry: resolved.registry,
    controllers: resolved.controllerRegistrations,
    bindings: resolved.bindings,
    moduleNames: resolved.moduleNames,
    composition: resolved,
    ownership: resolved.ownership,
    rawUploadRoutes: resolved.httpOwners.uploads,
    rawUploadInput: resolved.httpOwners.uploads.length ? () => resolved.raw!.uploadInput() : undefined,
    prepareIntegrations: async server => {
      await resolved.raw?.prepare(server, () => application.status().ready);
    },
    routes: resolved.routeRegistrations,
    hooks: resolved.hookRegistrations,
    fallbacks: resolved.fallbackRegistrations,
    fallbackReservedPrefixes: resolved.fallbackReservedPrefixes,
    namespaceConfiguration: resolved.namespaceConfiguration,
    routing: resolved.routing,
    actionPreparation: resolved.actionPreparation,
    staticAsset: resolved.pages
      ? (request, reply, beforeSend) =>
          serveStaticAsset(
            request,
            reply,
            resolved.pages!.artifacts,
            rootContext,
            {
              publicUrl: portal.config.server.publicUrl,
              sessionMaxAgeMs: portal.config.redboxSession.cookie?.maxAge,
              noCache: resolved.pages!.noCache,
            },
            beforeSend
          )
      : undefined,
    pageNotFound: resolved.pages
      ? async (request, reply) => {
          const raw = requestPathname(request.raw.url ?? '/');
          if (raw === undefined || !['GET', 'HEAD'].includes(request.method)) return;
          if (
            rootContext &&
            (raw.slice(0, rootContext.length).toLowerCase() !== rootContext.toLowerCase() ||
              raw[rootContext.length] !== '/')
          )
            return;
          const relative = raw.slice(rootContext.length);
          const assetNamespace = /^\/(?:[^/]+\/[^/]+\/)?(?:js|styles|images|fonts|angular|icons)(?:\/|$)/.test(
            relative
          );
          if (resolved.registry.protects(raw) && !assetNamespace) return;
          // Retained final page policies validate the two decoded tenant segments
          // even on a static miss. The tail never selects a filesystem artifact.
          const match = /^\/([^/]+)\/([^/]+)(?:\/.*)?$/.exec(relative);
          if (!match) return;
          try {
            request.params = { branding: decodeURIComponent(match[1]), portal: decodeURIComponent(match[2]) };
          } catch {
            return reply.code(400).send();
          }
          for (const name of ['nocache', 'brandingandportal', 'browseractor', 'checkauth']) {
            await policies[name]!(request, reply);
            if (httpReplySubmitted(reply)) return;
          }
          const { actor, brand } = requestContext(request);
          if (actor && !actor.roles.some(role => role.brandId === brand.id)) return reply.code(403).send();
          if (Object.values(request.query as Record<string, unknown>).some(value => typeof value !== 'string'))
            return reply.code(400).send();
          return sendPageError(request, reply, resolved.pages!.rendering, () => csrf.generateToken(request), 404);
        }
      : undefined,
    guards: async (binding, request, reply) => {
      if (resolved.httpOwners.integrations.includes(binding.route)) return integrationGuard(binding, request, reply);
      if (resolved.httpOwners.identities.includes(binding.route))
        return identityAdministrationGuard(binding, request, reply);
      if (resolved.httpOwners.mutations.includes(binding.route)) return mutationGuard(binding, request, reply);
      if (resolved.httpOwners.schemaReads.includes(binding.route)) return schemaReadPrelude(request, reply);
      if (resolved.httpOwners.metadataUpdates.includes(binding.route)) return recordMetadataBodyPrelude(request, reply);
    },
    security: {
      policies,
      csrf,
      observers: { observe: undefined, log: undefined },
      // Selected policies resolve brand/actor; raw owners prepare their context separately.
      resolveContext: resolved.pages
        ? async (binding, request) => {
            if (
              binding.route.declaration.controller === 'DynamicAssetController' &&
              binding.route.declaration.path === '/dynamic/:asset'
            )
              Object.assign(request.params as object, {
                branding: request.session.branding ?? portal.config.auth.defaultBrand,
                portal: request.session.portal ?? portal.config.auth.defaultPortal,
              });
          }
        : undefined,
      parsers: {
        parserExclusions: [],
        flatFormPrefixes: resolved.raw?.companion ? [rootContext + portal.config.companion.route] : [],
      },
      prepare: async (app: FastifyPreparation) => {
        if (resolved.pages)
          app.addHook('onRequest', async (request, reply) => {
            const raw = requestPathname(request.raw.url ?? '/');
            if (raw === undefined) return;
            if (
              rootContext &&
              (raw.slice(0, rootContext.length).toLowerCase() !== rootContext.toLowerCase() ||
                (raw.length > rootContext.length && raw[rootContext.length] !== '/'))
            )
              return;
            const relative = raw.slice(rootContext.length) || '/';
            applyPageHeaders(
              { path: relative },
              {
                set: (name: string | Record<string, string>, value?: string) =>
                  typeof name === 'string' ? reply.header(name, value!) : reply.headers(name),
                removeHeader: name => reply.removeHeader(name),
              },
              {
                publicUrl: portal.config.server.publicUrl,
                sessionMaxAgeMs: portal.config.redboxSession.cookie?.maxAge,
                noCache: resolved.pages!.noCache,
              }
            );
          });
        if (resolved.pages)
          app.addHook('onSend', async (request, reply, payload) => {
            if (
              payload === undefined &&
              request.method !== 'HEAD' &&
              reply.statusCode >= 400 &&
              (!request.session ||
                (!request.session.isPersisted() &&
                  !request.session.isModified() &&
                  !settings.session.saveUninitialized))
            ) {
              reply.removeHeader('Transfer-Encoding').header('Content-Length', '0');
            }
            return payload;
          });
        // Preserve the configured HTTPS header for the FM-023 routes, including
        // policy/parser denials. Full page/asset header conversion stays scoped
        // to its later task. Route identities come from executable declarations.
        const referenceNames = new Set(
          [
            ...referenceReadDeclarations,
            ...recordQueryReadDeclarations,
            ...identityAdministrationDeclarations,
            ...mutationDeclarations,
            ...integrationDeclarations,
          ].map(route => coreRouteName(route.method, route.path))
        );
        const selectedReferenceNames = new Set(
          resolved.routePlan.routes
            .filter(route => referenceNames.has(route.declaration.name))
            .map(route => route.declaration.name)
        );
        if (selectedReferenceNames.size) {
          const referenceRequest = (request: import('fastify').FastifyRequest) => {
            const binding = (request.routeOptions.config as { redboxRoute?: RouteBinding }).redboxRoute;
            return !!binding && selectedReferenceNames.has(binding.route.declaration.name);
          };
          if (new URL(portal.config.server.publicUrl).protocol === 'https:')
            app.addHook('onRequest', async (request, reply) => {
              if (referenceRequest(request)) reply.header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
            });
          app.addHook('onSend', async (request, reply, payload) => {
            const binding = (request.routeOptions.config as { redboxRoute?: RouteBinding }).redboxRoute;
            // Express's empty end is chunked while express-session awaits a
            // save/touch. A fresh untouched session instead ends with length 0.
            const sessionEnd =
              binding &&
              [...identityAdministrationDeclarations, ...mutationDeclarations, ...integrationDeclarations].some(
                route => coreRouteName(route.method, route.path) === binding.route.declaration.name
              ) &&
              request.session &&
              (request.session.isPersisted() || request.session.isModified() || settings.session.saveUninitialized);
            // Match production Express only for this conversion scope. The owned
            // empty stream still reaches send hooks as an absent entity, and a
            // replacement payload retains Fastify's ordinary length handling.
            if (
              referenceRequest(request) &&
              !sessionEnd &&
              request.method !== 'HEAD' &&
              reply.statusCode >= 400 &&
              payload === undefined
            ) {
              reply.removeHeader('Transfer-Encoding');
              reply.header('Content-Length', '0');
            }
            return payload;
          });
        }
        await input.prepare?.();
        const sessions = await prepareNativeSessions(app, owner, settings.session);
        resolved.raw?.bindAuthentication(async credential => {
          const identity = input.authentication().identity;
          if (credential.authorization !== undefined) {
            const match = /^Bearer (.+)$/i.exec(credential.authorization);
            return match ? identity.bearer(match[1]!) : false;
          }
          if (!credential.sessionId) return false;
          const saved = await sessions.readAccepted(credential.sessionId);
          if (
            !saved ||
            !Object.hasOwn(saved, 'authenticationVersion') ||
            Reflect.get(saved, 'authenticationVersion') !== 6
          )
            return false;
          const passport = Object.hasOwn(saved, 'passport') ? Reflect.get(saved, 'passport') : undefined;
          const id =
            passport && typeof passport === 'object' && Object.hasOwn(passport, 'user')
              ? Reflect.get(passport, 'user')
              : undefined;
          return typeof id === 'string' ? identity.session(id) : false;
        });
        authentication = await prepareNativeAuthentication(app, input.authentication());
        app.get(rootContext + '/csrfToken', csrf.token);
        const authenticationInput = {
          identity: input.authentication().identity,
          validContext: input.login.validContext,
          brandId: input.login.brandId,
          postLoginPath: input.login.postLoginPath,
          credentialFields: input.login.credentialFields,
          audit: input.login.audit,
          loginFailure: input.login.loginFailure,
          renderAuthenticationFailure:
            input.login.renderAuthenticationFailure ??
            (resolved.pages
              ? async (request, reply, reason) => {
                  const params = request.params as Record<string, unknown>;
                  request.params = {
                    ...params,
                    branding: params.branding ?? request.session.branding ?? portal.config.auth.defaultBrand,
                    portal: params.portal ?? request.session.portal ?? portal.config.auth.defaultPortal,
                  };
                  await policies.brandingandportal!(request, reply);
                  if (httpReplySubmitted(reply)) return;
                  await policies.browseractor!(request, reply);
                  return sendPageError(
                    request,
                    reply,
                    resolved.pages!.rendering,
                    () => csrf.generateToken(request),
                    403,
                    {
                      message: 'error-auth',
                      detailedMessage:
                        reason === 'authorized-email-denied'
                          ? reason
                          : 'There was an issue with your user credentials, please try again.',
                    }
                  );
                }
              : undefined),
          ...settings.login,
          sessionCookie: {
            name: portal.config.redboxSession.name ?? 'redbox.sid',
            ...portal.config.redboxSession.cookie,
          },
          csrf: csrf.protect,
        } satisfies ProductionAuthenticationRoutesInput;
        if (resolved.pages)
          resolved.pages.authentication = createNativeAuthenticationActions(authentication, authenticationInput);
        else installNativeAuthenticationRoutes(app, authentication, authenticationInput);
        if (resolved.raw?.companion)
          prepareCompanionRoutes(app, {
            uploads: resolved.raw.companion,
            rootContext,
            path: portal.config.companion.route,
            appUrl: portal.config.server.publicUrl,
            trustProxy: typeof trustProxy === 'number' ? (_address, hop) => hop < trustProxy : trustProxy,
            defaultBrand: portal.config.auth.defaultBrand,
            defaultPortal: portal.config.auth.defaultPortal,
            policies,
            policyConfiguration: resolved.policyConfiguration,
            csrf,
            audit: (actor, action, context) => portal.data.users.get().addUserAuditEvent(actor, action, context),
          });
      },
    },
  } satisfies ProductionControllerHostOptions);
  return {
    host,
    resolved,
    policyConfiguration: resolved.policyConfiguration,
    scope: resolved.scope,
  };
}
