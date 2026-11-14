'use strict';

// Acceptance-only bootstrap for the tested image, before FM-042 switches the
// executable. All dispatch, policies and lifecycle belong to production core.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const pino = require('pino');
const root = path.resolve(__dirname, '../..');
const dist = path.dirname(require.resolve('@researchdatabox/redbox-core'));
const core = name => require(path.join(dist, name));
const { createPortalFastifyApplication, createPortalFastifyHost } = require('@researchdatabox/redbox-core/portal');
const { discoverInstalledExtensions, loadExtensionModule } = core('extensions/loading');

// The bundled hooks have only non-HTTP contributions. Their API2 conversion is
// FM-038. Adapt their declaration envelopes in this disposable container only;
// preserve every config/form/module/migration and original package export.
async function prepareDataOnlyExtensions() {
  const installed = await discoverInstalledExtensions(root, { includeDevDependencies: true });
  const adapted = [];
  for (const extension of installed.extensions) {
    const original = await loadExtensionModule(extension);
    const declaration = await original.registerRedboxExtension();
    for (const key of ['handlers', 'routes', 'middleware', 'integrations', 'controllers', 'hooks', 'fallbacks']) {
      assert.equal(declaration[key], undefined, `${extension.name}: HTTP contributions require real API2 conversion`);
    }
    assert.equal(declaration.apiVersion, 1);
    const originalEntry = require.resolve(extension.specifier);
    const wrapper = path.join(extension.root, 'playwright-api2.mjs');
    const entryUrl = JSON.stringify(pathToFileURL(originalEntry).href);
    await fs.writeFile(
      wrapper,
      `import * as original from ${entryUrl};\nexport * from ${entryUrl};\n` +
        'export function registerRedboxExtension() { return {...original.registerRedboxExtension(), apiVersion: 2}; }\n'
    );
    const manifestPath = path.join(extension.root, 'package.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    assert(manifest.exports && manifest.redbox.extension === './extension');
    manifest.exports['./extension'] = './playwright-api2.mjs';
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    adapted.push({ name: extension.name, originalEntry, fields: Object.keys(declaration) });
  }
  await fs.writeFile(
    path.join(root, '.tmp/playwright/logs/fastify-extension-fixtures.json'),
    JSON.stringify(adapted, null, 2)
  );
}

async function main() {
  assert.equal(process.env.NODE_ENV, 'integrationtest');
  assert.equal(process.env.RBPORTAL_PLAYWRIGHT_MODE, 'image');
  await prepareDataOnlyExtensions();
  const logger = pino({ level: 'info' }, pino.destination({ dest: 1, sync: true }));
  const log = Object.fromEntries(
    ['info', 'warn', 'error', 'fatal', 'debug', 'trace'].map(level => [level, (...args) => logger[level](...args)])
  );
  Object.assign(log, { verbose: log.debug, silly: log.trace, crit: log.fatal, log: log.info, blank() {}, silent() {} });
  const { REDBOX_APPLICATION_CONFIG, REDBOX_ENVIRONMENT_CONFIG, REDBOX_LOCAL_CONFIG, ...env } = process.env;
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
  let portal, host;
  try {
    portal = await createPortalFastifyApplication({
      appPath: root,
      log,
      env,
      argv: [],
      environment: 'integrationtest',
      includeDevDependencies: true,
      localesDirectory: path.join(root, 'language-defaults'),
      files: {
        application: REDBOX_APPLICATION_CONFIG,
        environment: REDBOX_ENVIRONMENT_CONFIG,
        local: REDBOX_LOCAL_CONFIG,
      },
      http: { declarations, pages: {}, progress: true, portals: ['rdmp'] },
    });
    const { data, providers, config, owner } = portal;
    const ref = data.reference;
    const rootContext = config.server.rootContext;
    const { HttpIdentity } = core('http/express/identity');
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
    const plan = await createPortalFastifyHost(portal, {
      prepare: undefined,
      authentication: () => ({
        identity: (identity ??= new HttpIdentity(getIdentityRepositories(owner))),
        accounts: data.accounts.get(),
        config: defaultAuth(),
        brand: brandForRequest,
      }),
      login: {
        credentialFields: [
          config.brandingConfigurationDefaults.auth.local?.usernameField ?? 'username',
          config.brandingConfigurationDefaults.auth.local?.passwordField ?? 'password',
        ],
        validContext: (brand, selectedPortal) => !!ref.branding.get().getBrand(brand) && selectedPortal === 'rdmp',
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
    host = plan.host;
    host.installSignalHandlers({
      onStopped: () => process.exit(0),
      onError: () => {
        log.error('Fastify acceptance shutdown failed; resources remain owned.');
        process.exitCode = 1;
      },
    });
    await host.initialize();
    await host.activate();
    await fs.writeFile(
      path.join(root, '.tmp/playwright/logs/fastify-registrations.json'),
      JSON.stringify(plan.resolved.registry.snapshot(), null, 2)
    );
    log.info({ address: host.address(), publicUrl: config.server.publicUrl }, 'Fastify acceptance host ready.');
  } catch (error) {
    log.error(
      { name: error?.name, message: error?.message, stack: error?.stack },
      'Fastify acceptance startup failed.'
    );
    await (host?.stop() ?? portal?.application.stop());
    throw error;
  }
}
main().catch(() => process.exit(1));
