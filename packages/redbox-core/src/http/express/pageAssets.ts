import { deliverDynamicAsset, type DynamicPageAssetsInput } from '../../pages/dynamicAssets';
export type { DynamicPageAssetsInput } from '../../pages/dynamicAssets';
import path from 'node:path';
import { applyPageHeaders, isImmutableAssetPath, type PageHeaderInput } from './pageHeaders';
import type { Router, RequestHandler, Response } from 'express';
import { PageArtifacts } from '../../pages/Artifacts';
import { BrandingDelivery, type BrandingDeliveryInput } from './brandingDelivery';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import type { PagesHttpInput } from './pages';

import { brandingDeliveryRoutes, fontDeliveryRoute, dynamicAssetRoutes } from '../assetRoutes';
export { brandingDeliveryRoutes, fontDeliveryRoute, dynamicAssetRoutes } from '../assetRoutes';

/** Complete the callback before releasing the request's persistence lease. */
export function sendPageArtifact(res: Response, file: string): Promise<void> {
  return new Promise((resolve, reject) =>
    res.sendFile(path.basename(file), { root: path.dirname(file), dotfiles: 'deny' }, error =>
      error ? reject(error) : resolve()
    )
  );
}

export function mountBrandingDeliveryRoutes(
  router: Router,
  input: {
    delivery: Omit<BrandingDeliveryInput, 'sendAsset'>;
    csrf: PagesHttpInput['csrf'];
    artifacts: PageArtifacts;
    policies: PagesHttpInput['policies'];
    policyConfiguration: PagesHttpInput['policyConfiguration'];
  }
): BrandingDelivery {
  const delivery = new BrandingDelivery({
    ...input.delivery,
    sendAsset: async (res, name) => {
      const file = input.artifacts.find(input.artifacts.assets, name);
      if (!file) {
        res.status(404).end();
        return;
      }
      await sendPageArtifact(res as Response, file);
    },
  });
  for (const route of brandingDeliveryRoutes) {
    const chain = bindHttpPolicies(
      [
        ...new Set([
          'brandingandportal',
          'browseractor',
          'checkauth',
          ...resolveEffectivePolicies(route, input.policyConfiguration),
        ]),
      ],
      input.policies
    );
    router[route.method](
      route.path,
      ...chain,
      (req, res, next) =>
        ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : input.csrf.protect(req, res, next),
      httpAction(async (req, res) => {
        await delivery[route.action](req, res);
      })
    );
  }
  router.get(
    fontDeliveryRoute.path,
    httpAction(async (req, res) => {
      await delivery.renderFont(req, res);
    })
  );
  return delivery;
}

export function mountStaticPageArtifacts(
  router: Router,
  artifacts: PageArtifacts,
  headers: PageHeaderInput = {}
): void {
  const serve: RequestHandler = httpAction(async (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      next();
      return;
    }
    let name: string;
    try {
      name = decodeURIComponent(req.path).replace(/^\//, '');
    } catch {
      res.status(400).end();
      return;
    }
    const [brand, portal, ...rest] = name.split('/');
    const candidates =
      rest.length && /^[A-Za-z0-9_-]+$/.test(brand) && /^[A-Za-z0-9_-]+$/.test(portal)
        ? [name, `default/${portal}/${rest.join('/')}`, `default/default/${rest.join('/')}`]
        : [name];
    const file = candidates.map(candidate => artifacts.find(artifacts.assets, candidate)).find(Boolean);
    if (!file) {
      next();
      return;
    }
    if (isImmutableAssetPath(req.path)) {
      // A public immutable artifact must never replay session cookies from an
      // upstream middleware or a deferred express-session response save.
      res.removeHeader('Set-Cookie');
      const setHeader = res.setHeader;
      res.setHeader = function (name, value) {
        return name.toLowerCase() === 'set-cookie' ? this : setHeader.call(this, name, value);
      };
    }
    applyPageHeaders(req, res, headers, true);
    res.set('X-Content-Type-Options', 'nosniff');
    await sendPageArtifact(res as Response, file);
  });
  // Register after owned dynamic routes. Static files never shadow auth or API handlers.
  router.use(serve);
}

export function mountDynamicPageAssets(
  router: Router,
  input: DynamicPageAssetsInput & Pick<PagesHttpInput, 'policies' | 'policyConfiguration'>
): void {
  for (const route of dynamicAssetRoutes) {
    const chain = bindHttpPolicies(
      [
        ...new Set([
          'nocache',
          'brandingandportal',
          'browseractor',
          ...(route.action === 'get' ? [] : ['browserauthenticated', 'brandactor']),
          'checkauth',
          ...resolveEffectivePolicies(route, input.policyConfiguration),
        ]),
      ],
      input.policies
    );
    router.get(
      route.path,
      (req, _res, next) => {
        if (!req.params.branding)
          Object.assign(req.params, {
            branding: req.session.branding ?? input.defaultBrand,
            portal: req.session.portal ?? input.defaultPortal,
          });
        next();
      },
      ...chain,
      httpAction(async (req, res) => {
        await deliverDynamicAsset(
          {
            context: requestContext(req),
            params: req.params,
            query: req.query,
            session: req.session as unknown as Record<string, unknown>,
          },
          res,
          input,
          route.action
        );
      })
    );
  }
}
