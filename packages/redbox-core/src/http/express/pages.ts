import { browserPage, pageOperation } from '../../pages/browser';
import { preparePageRendering, type PageRenderingInput } from '../../pages/rendering';
import type { Router, RequestHandler, Request, Response } from 'express';
import type { Forms } from '../../forms/Forms';
import type { RecordTypes } from '../../recordTypes';
import type { Services as Dashboards } from '../../dashboards/DashboardTypes';
import type { Services as Reports } from '../../queries/Reports';
import type { RecordModel } from '../../model/storage/RecordModel';
import type { createHttpCsrf } from './csrf';
import type { PoliciesConfig } from '../../config/policies.config';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';

import { pageRoutes } from '../pageRoutes';
export { pageRoutes } from '../pageRoutes';
export interface PagesHttpInput extends PageRenderingInput {
  csrf: Pick<ReturnType<typeof createHttpCsrf>, 'generateToken' | 'protect'>;
  policies: Readonly<Record<string, RequestHandler>>;
  policyConfiguration: PoliciesConfig;
  forms: Pick<Forms, 'getFormByStartingWorkflowStep' | 'getFormByName'>;
  recordTypes: Pick<RecordTypes, 'get'>;
  dashboards: Pick<Dashboards.DashboardTypes, 'getDashboardView' | 'getRecordTypeDashboardConfig'>;
  reports: Pick<Reports.Reports, 'findAllReportsForBrand'>;
  loadRecord(oid: string): Promise<RecordModel | null>;
  /** Current create permission, resolved from the selected form/workflow operation. */
  canCreate(context: ReturnType<typeof requestContext>, recordType: string): Promise<boolean>;
  configModel(key: string): Promise<{ title: string } | undefined>;
}

export const pageRootRoute = { method: 'all' as const, path: '/' };
export function mountPageRoot(router: Router, rootContext: string, target: string): void {
  if (!/^\/[A-Za-z0-9_/-]+$/.test(target) || target.startsWith('//') || target.includes('..'))
    throw new TypeError('Page root requires a local deployment redirect.');
  router.all(pageRootRoute.path, (_req, res) =>
    res
      .set({ 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache', Expires: '0' })
      .redirect(rootContext + target)
  );
}

export function mountPageRoutes(router: Router, input: PagesHttpInput): void {
  const bindings = pageRoutes.map(route => {
    const mandatory = [
      'nocache',
      'brandingandportal',
      'browseractor',
      ...(route.access === 'public' ? [] : ['browserauthenticated', 'brandactor']),
      'checkauth',
    ];
    return {
      route,
      policies: bindHttpPolicies(
        [...new Set([...mandatory, ...resolveEffectivePolicies(route, input.policyConfiguration)])],
        input.policies
      ),
    };
  });
  for (const { route, policies } of bindings) {
    const { operation, mode } = pageOperation(route);
    router[route.method](
      route.path,
      ...policies,
      (req, res, next) =>
        ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : input.csrf.protect(req, res, next),
      httpAction(async (req, res) => {
        const result = await browserPage(
          {
            context: requestContext(req),
            params: req.params,
            query: req.query,
            body: req.body,
            session: req.session as unknown as Record<string, unknown>,
            url: req.url,
            originalUrl: req.originalUrl,
            path: req.path,
            csrfToken: () => input.csrf.generateToken(req),
            acceptsHtml: () => req.accepts(['html', 'json']) === 'html',
          },
          input,
          route,
          operation,
          headers => res.set(headers),
          mode
        );
        if (result.status === 302) res.redirect(result.headers.Location);
        else {
          res.status(result.status).set(result.headers);
          if (result.body === undefined) res.end();
          else res.send(result.body);
        }
      })
    );
  }
}

/** Express transport boundary for the shared page renderer. */
export async function preparePage(req: Request, res: Response, input: PagesHttpInput) {
  const page = await preparePageRendering(
    {
      context: requestContext(req),
      params: req.params,
      query: req.query,
      body: req.body,
      session: req.session as unknown as Record<string, unknown>,
      url: req.url,
      originalUrl: req.originalUrl,
      path: req.path,
      csrfToken: () => input.csrf.generateToken(req),
      acceptsHtml: () => req.accepts(['html', 'json']) === 'html',
    },
    input,
    headers => res.set(headers)
  );
  return {
    ...page,
    error(status: 403 | 404 | 500, data?: { message: string; detailedMessage: string }): void {
      if (res.headersSent || res.writableEnded) {
        res.destroy();
        return;
      }
      const result = page.error(status, data);
      res.status(result.status).set(result.headers);
      if (result.body === undefined) res.json();
      else res.type(result.headers['Content-Type'].split(';')[0]).send(result.body);
    },
  };
}

/** Mount after dynamic and static delivery so only unmatched branded pages reach it. */
export function mountPageNotFound(router: Router, input: PagesHttpInput): void {
  router.all(
    '/:branding/:portal{/*pageNotFound}',
    // Leave OPTIONS to Express's accumulated method response before page policies
    // or rendering can turn an otherwise matched API path into a 404/redirect.
    (req, _res, next) => next(req.method === 'OPTIONS' ? 'route' : undefined),
    ...bindHttpPolicies(['nocache', 'brandingandportal', 'browseractor', 'checkauth'], input.policies),
    (req, res, next) => (['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : input.csrf.protect(req, res, next)),
    httpAction(async (req, res) => {
      const { brand, actor } = requestContext(req);
      if (actor && !actor.roles.some(role => role.brandId === brand.id)) {
        res.status(403).end();
        return;
      }
      if (Object.values(req.query).some(value => typeof value !== 'string')) {
        res.status(400).end();
        return;
      }
      (await preparePage(req, res, input)).error(404);
    })
  );
}

/** Authentication callbacks use the same branded, CSP-protected error artifacts as pages. */
export async function sendPageAuthenticationFailure(
  req: Request,
  res: Response,
  input: PagesHttpInput,
  reason: 'authorized-email-denied' | 'authentication-rejected'
): Promise<void> {
  (await preparePage(req, res, input)).error(403, {
    message: 'error-auth',
    detailedMessage:
      reason === 'authorized-email-denied'
        ? reason
        : 'There was an issue with your user credentials, please try again.',
  });
}
