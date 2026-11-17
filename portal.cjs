'use strict';
// The executable and integration harnesses share the complete production selection.
const path = require('node:path');
const dist = path.dirname(require.resolve('@researchdatabox/redbox-core'));
const core = name => require(path.join(dist, name));
const { createPortalFastifyApplication, createPortalFastifyHost } = require('@researchdatabox/redbox-core/portal');

async function createApplication(options) {
  const declarations = [
    ...new Set([
      ...core('http/referenceRoutes').referenceReadDeclarations,
      ...core('http/readRoutes').recordQueryReadDeclarations,
      ...core('http/datastreamRoutes').datastreamReadRoutes,
      ...core('http/uploadRoutes').uploadDeclarations,
      ...core('http/identityRoutes').identityAdministrationDeclarations,
      ...core('http/mutationRoutes').mutationDeclarations,
      ...core('http/integrationRoutes').integrationDeclarations,
      ...core('http/progressRoutes').progressOperationRoutes,
      core('api-routes/groups/records').getMetaRoute,
      // The already-qualified P2 multipart/progress pilots support browser upload.
      core('api-routes/groups/records').addDataStreamsRoute,
    ]),
  ];
  return createPortalFastifyApplication({ ...options, http: { declarations, pages: {}, progress: true } });
}

async function createHost(portal) {
  const { data, providers, config, owner } = portal;
  const ref = data.reference;
  const rootContext = config.server.rootContext;
  const { HttpIdentity } = require('@researchdatabox/redbox-core/authentication');
  const { getIdentityRepositories } = core('persistence/identity/runtime');
  const { getBrandingRepository } = core('persistence/branding/runtime');
  const { BrandingModel } = core('model/storage/BrandingModel');
  const { requestContext } = require('@researchdatabox/redbox-core/http');
  const { requestPathname } = core('http/fastify/router');
  const brandForRequest = request => {
    const name =
      typeof request.params.branding === 'string'
        ? request.params.branding
        : (request.session.branding ?? config.auth.defaultBrand);
    const brand = ref.branding.get().getBrand(name);
    if (!brand) throw new Error('Authentication brand is unavailable.');
    return brand;
  };
  const defaultAuth = () =>
    ref.appConfigs.get().getAppConfigurationForBrand(ref.branding.get().getDefault().name).auth ??
    config.brandingConfigurationDefaults.auth;
  let identity;
  return createPortalFastifyHost(portal, {
    authentication: () => ({
      identity: (identity ??= new HttpIdentity(getIdentityRepositories(owner))),
      accounts: data.accounts.get(),
      config: defaultAuth(),
      brand: brandForRequest,
    }),
    login: {
      get credentialFields() {
        return [defaultAuth().local?.usernameField ?? 'username', defaultAuth().local?.passwordField ?? 'password'];
      },
      validContext: (brand, selectedPortal) =>
        !!ref.branding.get().getBrand(brand) && portal.installation.portals.includes(selectedPortal),
      brandId: name => ref.branding.get().getBrand(name).id,
      postLoginPath: (brand, selectedPortal) =>
        rootContext +
        '/' +
        brand +
        '/' +
        selectedPortal +
        '/' +
        (
          ref.appConfigs.get().getAppConfigurationForBrand(brand).auth?.local?.postLoginRedir ??
          defaultAuth().local?.postLoginRedir ??
          'home'
        ).replace(/^\//, ''),
      audit: (action, actor, request) =>
        data.users.get().addUserAuditEvent({ ...actor }, action, { brandId: brandForRequest(request).id }),
      loginFailure: request => {
        const username = request.body?.[defaultAuth().local?.usernameField ?? 'username'];
        return providers.security.get().emitSecurityEvent({
          brandId: brandForRequest(request).id,
          portalId: String(
            request.params.portal ?? request.body?.portal ?? request.session.portal ?? config.auth.defaultPortal
          ),
          eventType: 'authentication.login.failure',
          category: 'authentication',
          source: 'Authentication',
          ...(typeof username === 'string' && username.length > 0 && username.length <= 4096
            ? { subject: { username } }
            : {}),
          requestContext: {
            method: request.method,
            path: (requestPathname(request.raw.url) ?? '/').slice(rootContext.length),
          },
        });
      },
    },
    policies: {
      // Resolve repositories lazily, after the owned application initializes.
      branding: { getBrand: (...args) => getBrandingRepository(owner).getBrand(...args) },
      pathRules: ref.pathRules,
      defaultUnauthenticatedRole: brand =>
        ref.roles.get().getDefUnathenticatedRole(Object.assign(new BrandingModel(), brand)),
      emitRequestFailure: (request, eventType, source) => {
        const context = requestContext(request);
        return providers.security.get().emitSecurityEvent({
          brandId: context.brand.id,
          portalId: context.portal,
          eventType,
          source,
          category: 'authorization',
          requestContext: {
            method: request.method,
            path: (requestPathname(request.raw.url) ?? '/').slice(rootContext.length),
          },
        });
      },
    },
  });
}

module.exports = { createApplication, createHost };
