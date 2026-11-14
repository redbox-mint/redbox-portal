import { apiBrandingUploadController, brandingAppUploadController } from '../../http/controllers/UploadControllers';
import type { BrandingUploadInput } from '../../http/actions/brandingUploads';
import { brandingAssetController } from '../../http/controllers/AssetControllers';
import { combineBrowserInput } from './pageHttpPlan';
import * as browserControllers from '../../http/controllers/BrowserControllers';
import type { BrowserPageBinding } from '../../http/controllers/BrowserControllers';
import { integrationDeclarations } from '../../http/integrationRoutes';
import { prepareReferenceRequest } from '../../http/actions/requestPreparation';
import { readRequest, applyPreparedReadRequest, readAction } from '../../http/fastify/readActions';
import type { RouteBinding } from '../../http/fastify/routes';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PortalApplicationContext } from './application';
import { bindControllerFactory } from '../../http/controllers';
import * as c from '../../http/controllers/IntegrationControllers';
import { combineHttpInputs, portalReadHttpInputs } from './readHttpPlan';
import { portalIdentityHttpInputs } from './identityHttpPlan';
import type { BrandingDeliveryCache } from '../../http/brandingDeliveryCache';
/** Resolve concrete inputs offline; borrow initialized owners on each request. */
export function portalIntegrationHttpInputs(portal: PortalApplicationContext) {
  const { data, providers, log } = portal,
    ref = data.reference;
  const audit = (
    actor: { id: string; username: string },
    action: string,
    context: { brandId: string; vocabularyId?: string }
  ) => data.users.get().addUserAuditEvent({ ...actor }, action, context);
  return {
    vocabulary: {
      get vocabulary() {
        return ref.vocabulary.get();
      },
      audit,
      log,
    },
    rva: {
      get rva() {
        return data.rva.get();
      },
      get vocabulary() {
        return ref.vocabulary.get();
      },
      audit,
      log,
    },
    branding: {
      get branding() {
        return ref.branding.get();
      },
      audit,
      log,
    },
    figshare: {
      get vocabulary() {
        return providers.figshareVocabulary.get();
      },
      audit,
      log,
    },
    operations: {
      get records() {
        return data.records.get();
      },
      get search() {
        return data.search.get();
      },
      get email() {
        return providers.email.get();
      },
      audit,
      log,
    },
    lookups: {
      get vocabulary() {
        return ref.vocabulary.get();
      },
      get lookups() {
        return data.lookups.get();
      },
      get users() {
        return data.users.get();
      },
      log,
    },
  };
}
export function portalIntegrationControllers(
  portal: PortalApplicationContext,
  selected: ReadonlySet<string>,
  cache: BrandingDeliveryCache,
  browser?: BrowserPageBinding,
  delivery?: { readonly delivery: import('../../pages/brandingDelivery').BrandingDelivery },
  uploads?: BrandingUploadInput
) {
  const input = portalIntegrationHttpInputs(portal),
    combine = combineHttpInputs;
  const vocabulary = combine(input.vocabulary, input.rva);
  const bindings = [
    bindControllerFactory(c.apiVocabularyController, vocabulary),
    browser
      ? bindControllerFactory(browserControllers.vocabularyBrowserController, combineBrowserInput(vocabulary, browser))
      : bindControllerFactory(c.vocabularyController, vocabulary),
    uploads
      ? bindControllerFactory(apiBrandingUploadController, combine(input.branding, { uploads }))
      : bindControllerFactory(c.apiBrandingController, input.branding),
    uploads
      ? bindControllerFactory(brandingAppUploadController, combine(input.branding, { uploads }))
      : bindControllerFactory(c.brandingAppController, input.branding),
    delivery
      ? bindControllerFactory(brandingAssetController, combine(input.branding, delivery))
      : bindControllerFactory(c.brandingController, input.branding),
    bindControllerFactory(c.apiFigshareCrosswalkController, input.figshare),
    bindControllerFactory(c.apiFigshareVocabularyController, input.figshare),
    bindControllerFactory(c.apiSearchController, combine(portalReadHttpInputs(portal).queries, input.operations)),
    bindControllerFactory(c.emailController, input.operations),
    bindControllerFactory(c.formVocabularyController, input.lookups),
    browser
      ? bindControllerFactory(
          browserControllers.userBrowserController,
          combineBrowserInput(
            combine(portalIdentityHttpInputs(portal, () => cache.invalidate()).users, input.lookups),
            browser
          )
        )
      : bindControllerFactory(
          c.userController,
          combine(portalIdentityHttpInputs(portal, () => cache.invalidate()).users, input.lookups)
        ),
  ].filter(binding => selected.has(binding.factory.name));
  const preparations = new Map(
    integrationDeclarations.flatMap(route =>
      'preparation' in route && route.preparation
        ? [[route.controller + '\0' + route.action, route.preparation] as const]
        : []
    )
  );
  const preparationFor = (binding: RouteBinding) => {
    const { controller, action } = binding.route.declaration;
    return preparations.get(controller + '\0' + action);
  };
  return {
    hasPreparation: (binding: RouteBinding) => preparationFor(binding) !== undefined,
    controllers: bindings.map(binding => binding.factory),
    bindings,
    async prepareRequest(binding: RouteBinding, request: FastifyRequest, reply: FastifyReply) {
      const preparation = preparationFor(binding);
      if (!preparation) return;
      const facts = readRequest(request);
      try {
        applyPreparedReadRequest(request, await prepareReferenceRequest(input.branding, facts, preparation.request));
      } catch (error) {
        return readAction(
          request,
          reply,
          async () => {
            throw error;
          },
          facts => preparation.failure(input.branding, facts, error),
          true
        );
      }
    },
  };
}
