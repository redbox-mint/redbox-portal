import type { FastifyRequest, FastifyReply } from 'fastify';
import { defineController } from '../controllers';
import { renderPageShell, type PageRenderingInput } from '../../pages/rendering';
import { prepareNativePage, sendPageResponse, pagePreparationFailure } from '../fastify/pages';
import { sendLoginRedirect } from '../fastify/responses';
import { pageRoutes } from '../express/pages';
import { coreRouteName } from '../fastify/routes';
import { requestContext } from '../context';
import { recordServiceChronicle } from '../../utilities/serviceChronicle';
import { requestPathname } from '../fastify/router';

export interface PageControllerInput {
  readonly rendering: PageRenderingInput;
  csrfToken(request: FastifyRequest): string;
}
export interface PageRootControllerInput {
  readonly rootContext: string;
  readonly landingPath: string;
}
/** Representative page shells; remaining browser families are selected in FM-030. */
export const representativePageRoutes = pageRoutes.filter(route =>
  ['/home', '/researcher/home'].some(suffix => route.path === '/:branding/:portal' + suffix)
);
export class PageController {
  constructor(protected readonly input: PageControllerInput) {}
  async render(request: FastifyRequest, reply: FastifyReply) {
    const binding = (request.routeOptions.config as { redboxRoute?: unknown }).redboxRoute as {
      route: { declaration: { name: string } };
    };
    const route = representativePageRoutes.find(
      route => coreRouteName(route.method, route.path) === binding.route.declaration.name
    );
    if (!route) throw new Error('Page declaration unavailable.');
    const { actor, brand } = requestContext(request);
    if (actor && !actor.roles.some(role => role.brandId === brand.id)) return reply.code(403).send();
    if (Object.values(request.query as Record<string, unknown>).some(value => typeof value !== 'string'))
      return reply.code(400).send();
    const facts = this.input.rendering;
    let page;
    try {
      page = await prepareNativePage(request, reply, facts, () => this.input.csrfToken(request));
    } catch (error) {
      return pagePreparationFailure(request, reply, error);
    }
    try {
      return sendPageResponse(
        request,
        reply,
        renderPageShell(page, route.view, route.title ? page.t(route.title) : '')
      );
    } catch (failure) {
      recordServiceChronicle(
        facts.log,
        {
          pageController: route.controller,
          pageAction: route.action,
          pageView: route.view,
          pageFailureCategory:
            failure instanceof SyntaxError ? 'syntax' : failure instanceof TypeError ? 'type' : 'backend-or-template',
        },
        [new Error('Page rendering failed')]
      );
      return sendPageResponse(request, reply, page.error(500));
    }
  }
}
export const pageController = defineController({
  name: 'RenderViewController',
  actions: ['render'],
  create: (input: PageControllerInput) => new PageController(input),
});
export class PageRootController {
  constructor(private readonly input: PageRootControllerInput) {
    if (
      !/^\/[A-Za-z0-9_/-]+$/.test(input.landingPath) ||
      input.landingPath.startsWith('//') ||
      input.landingPath.includes('..')
    )
      throw new TypeError('Page root requires a local deployment redirect.');
  }
  redirect(request: FastifyRequest, reply: FastifyReply) {
    // find-my-way can select '/' for '*'. Retained Express rejects that
    // non-path target before the landing redirect with its safe preparation 500.
    if (!requestPathname(request.raw.url ?? '/')?.startsWith('/'))
      return pagePreparationFailure(request, reply, new Error('Page root requires a pathname.'));
    reply.headers({ 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache', Expires: '0' });
    return sendLoginRedirect(request, reply, this.input.rootContext + this.input.landingPath);
  }
}
export const pageRootController = defineController({
  name: 'PageRootController',
  actions: ['redirect'],
  create: (input: PageRootControllerInput) => new PageRootController(input),
});
