import { recordQueryReadDeclarations } from '../../http/readRoutes';
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
    guards: async (binding, request, reply) => {
      if (resolved.httpOwners.schemaReads.includes(binding.route)) return schemaReadPrelude(request, reply);
      if (resolved.httpOwners.metadataUpdates.includes(binding.route)) return recordMetadataBodyPrelude(request, reply);
    },
    security: {
      policies,
      csrf,
      observers: { observe: undefined, log: undefined },
      // Selected policies resolve brand/actor; this pilot has no raw mounts.
      resolveContext: undefined,
      parsers: {
        parserExclusions: [],
        flatFormPrefixes: resolved.raw?.companion ? [rootContext + portal.config.companion.route] : [],
      },
      prepare: async (app: FastifyPreparation) => {
        // Preserve the configured HTTPS header for the FM-023 routes, including
        // policy/parser denials. Full page/asset header conversion stays scoped
        // to its later task. Route identities come from executable declarations.
        const referenceNames = new Set(
          [...referenceReadDeclarations, ...recordQueryReadDeclarations].map(route =>
            coreRouteName(route.method, route.path)
          )
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
            // Match production Express only for this conversion scope. The owned
            // empty stream still reaches send hooks as an absent entity, and a
            // replacement payload retains Fastify's ordinary length handling.
            if (
              referenceRequest(request) &&
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
        installNativeAuthenticationRoutes(app, authentication, {
          identity: input.authentication().identity,
          validContext: input.login.validContext,
          brandId: input.login.brandId,
          postLoginPath: input.login.postLoginPath,
          credentialFields: input.login.credentialFields,
          audit: input.login.audit,
          loginFailure: input.login.loginFailure,
          renderAuthenticationFailure: input.login.renderAuthenticationFailure,
          ...settings.login,
          sessionCookie: {
            name: portal.config.redboxSession.name ?? 'redbox.sid',
            ...portal.config.redboxSession.cookie,
          },
          csrf: csrf.protect,
        } satisfies ProductionAuthenticationRoutesInput);
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
