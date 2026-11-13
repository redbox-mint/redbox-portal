import type { FastifyRequest, FastifyReply } from 'fastify';
import { defineController } from '../controllers';
import { browserPage, shellPage, type BrowserPageInput, type BrowserPageOperation } from '../../pages/browser';
import type { RouteBinding } from '../fastify/routes';
import { nativePageRequest, sendPageResponse, pagePreparationFailure } from '../fastify/pages';
import { sendLoginRedirect } from '../fastify/responses';
import { pageRoutes } from '../pageRoutes';
import { coreRouteName } from '../fastify/routes';
import { requestPathname } from '../fastify/router';

export interface PageControllerInput {
  readonly rendering: BrowserPageInput;
  csrfToken(request: FastifyRequest): string;
}
export interface PageRootControllerInput {
  readonly rootContext: string;
  readonly landingPath: string;
}
/** Live request facts enter the shared guarded browser operation after hooks. */
export async function runNativePage(
  request: FastifyRequest,
  reply: FastifyReply,
  input: PageControllerInput,
  operation: BrowserPageOperation = shellPage,
  mode: 'shell' | 'edit' | 'dashboard' | 'legacy' = 'shell'
) {
  const binding = (request.routeOptions.config as { redboxRoute?: RouteBinding }).redboxRoute;
  const route = pageRoutes.find(route => coreRouteName(route.method, route.path) === binding?.route.declaration.name);
  if (!route) throw new Error('Page declaration unavailable.');
  let result;
  try {
    result = await browserPage(
      nativePageRequest(request, input.rendering, () => input.csrfToken(request)),
      input.rendering,
      route,
      operation,
      headers => reply.headers(headers),
      mode
    );
  } catch (error) {
    return pagePreparationFailure(request, reply, error);
  }
  if (result.status === 302) {
    reply.headers(result.headers);
    return sendLoginRedirect(request, reply, result.headers.Location);
  }
  if (result.body === undefined && !Object.keys(result.headers).length) return reply.code(result.status).send();
  return sendPageResponse(request, reply, result);
}
export class PageController {
  constructor(protected readonly input: PageControllerInput) {}
  render(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.input);
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
