import path from 'node:path';
import { applyPageHeaders, isImmutableAssetPath, type PageHeaderInput } from './pageHeaders';
import type { Router, RequestHandler, Response } from 'express';
import type { TemplateCompileInput } from '@researchdatabox/sails-ng-common';
import { buildKeyString } from '@researchdatabox/sails-ng-common';
import { PageArtifacts } from '../../pages/Artifacts';
import { Services as Templates } from '../../pages/Templates';
import { clientConfiguration, type ClientConfigurationInput } from '../../pages/clientConfiguration';
import { BrandingDelivery, type BrandingDeliveryInput } from './brandingDelivery';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction, singleHttpResult } from './middleware';
import type { PagesHttpInput } from './pages';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { hasEditAccess, hasViewAccess } from '../../records/access';
import type { Forms } from '../../forms/Forms';
import type { Services as Dashboards } from '../../dashboards/DashboardTypes';
import type { Services as Reports } from '../../queries/Reports';

export const brandingDeliveryRoutes = [
  ['/styles/theme.css', 'renderCss'],
  ['/preview/:token.css', 'renderPreviewCss'],
  ['/images/logo', 'renderImage'],
  ['/images/favicon', 'renderFavicon'],
  ['/api-docs.apib', 'renderApiB'],
  ['/api-docs.json', 'renderSwaggerJSON'],
  ['/api-docs.yaml', 'renderSwaggerYAML'],
  ['/admin/api-docs/openapi.json', 'renderSwaggerJSON'],
].map(([path, action]) => ({
  method: action === 'renderImage' || action === 'renderFavicon' ? ('all' as const) : ('get' as const),
  path: '/:branding/:portal' + path,
  controller: 'BrandingController',
  action,
}));
export const fontDeliveryRoute = {
  method: 'get' as const,
  path: '/fonts/branding/:branding/:sha256.woff2',
  controller: 'BrandingController',
  action: 'renderFont',
};
export const dynamicAssetRoutes = [
  ['/dynamic/:asset', 'get'],
  ['/:branding/:portal/dynamic/:asset', 'get'],
  ['/:branding/:portal/dynamicAsset/formCompiledItems/:recordType{/:oid}', 'getFormCompiledItems'],
  ['/:branding/:portal/dynamicAsset/adminReportTemplates/:reportName', 'getAdminReportTemplates'],
  [
    '/:branding/:portal/dynamicAsset/recordDashboardTemplates/:recordType/:workflowStage',
    'getRecordDashboardTemplates',
  ],
  ['/:branding/:portal/dynamicAsset/dashboardViewTemplates/:dashboardView/:stepName', 'getDashboardViewTemplates'],
].map(([path, action]) => ({ method: 'get' as const, path, action, controller: 'DynamicAssetController' }));

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
      await sendPageArtifact(res, file);
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
        switch (route.action) {
          case 'renderCss':
            await delivery.renderCss(req, res);
            break;
          case 'renderPreviewCss':
            await delivery.renderPreviewCss(req, res);
            break;
          case 'renderImage':
            await delivery.renderImage(req, res);
            break;
          case 'renderFavicon':
            await delivery.renderFavicon(req, res);
            break;
          case 'renderApiB':
            delivery.renderApiB(req, res);
            break;
          case 'renderSwaggerJSON':
            delivery.renderSwaggerJSON(req, res);
            break;
          case 'renderSwaggerYAML':
            delivery.renderSwaggerYAML(req, res);
            break;
        }
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
    await sendPageArtifact(res, file);
  });
  // Register after owned dynamic routes. Static files never shadow auth or API handlers.
  router.use(serve);
}

export interface DynamicPageAssetsInput extends Pick<
  PagesHttpInput,
  'policies' | 'policyConfiguration' | 'loadRecord' | 'canCreate'
> {
  artifacts: PageArtifacts;
  config: ClientConfigurationInput & { reusableFormDefinitions?: Parameters<Forms['extractRawTemplates']>[4] };
  defaultBrand: string;
  defaultPortal: string;
  forms: Pick<Forms, 'getFormByStartingWorkflowStep' | 'getForm' | 'extractRawTemplates'>;
  dashboards: Pick<Dashboards.DashboardTypes, 'extractDashboardTemplates' | 'extractDashboardViewTemplates'>;
  reports: Pick<Reports.Reports, 'extractReportTemplates'>;
  templates: Templates.Template;
}
export function mountDynamicPageAssets(router: Router, input: DynamicPageAssetsInput): void {
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
        const context = requestContext(req),
          { brand, portal, actor } = context;
        req.session.branding = brand.name;
        req.session.portal = portal;
        if (route.action === 'get') {
          if (req.params.asset !== 'apiClientConfig' && req.params.asset !== 'apiClientConfig.json') {
            res.status(404).end();
            return;
          }
          res.json(
            clientConfiguration(input.config, brand.name!, portal, String(Reflect.get(req.session, 'langCode') ?? 'en'))
          );
          return;
        }
        const modelBrand = Object.assign(new BrandingModel(), brand);
        if (Object.values(req.query).some(value => typeof value !== 'string')) {
          res.status(400).end();
          return;
        }
        const p = (name: string) => String(req.params[name] ?? req.query[name] ?? '');
        let entries: TemplateCompileInput[] = [];
        if (route.action === 'getFormCompiledItems') {
          const oid = p('oid'),
            edit = p('edit') === 'true';
          const record = oid ? await input.loadRecord(oid) : null;
          const roles = actor!.roles.map(role => ({ ...role, branding: { id: role.brandId } }));
          if (oid && (!record || record.metaMetadata.brandId !== brand.id)) {
            res.status(404).end();
            return;
          }
          if (
            record
              ? !(edit ? hasEditAccess : hasViewAccess)(modelBrand, { ...actor, roles }, roles, record)
              : !(await input.canCreate(context, p('recordType')))
          ) {
            res.status(403).end();
            return;
          }
          const form = record
            ? await input.forms.getForm(modelBrand, '', edit, '', record)
            : await singleHttpResult(input.forms.getFormByStartingWorkflowStep(modelBrand, p('recordType'), edit));
          if (!form?.configuration) {
            res.status(404).end();
            return;
          }
          entries = await input.forms.extractRawTemplates(
            form.configuration,
            edit ? 'edit' : 'view',
            roles.map(role => role.name).filter((name): name is string => !!name),
            record?.metadata ?? null,
            input.config.reusableFormDefinitions
          );
        } else if (route.action === 'getAdminReportTemplates') {
          entries = await input.reports.extractReportTemplates(modelBrand, p('reportName'));
        } else {
          try {
            entries =
              route.action === 'getRecordDashboardTemplates'
                ? await input.dashboards.extractDashboardTemplates(
                    modelBrand,
                    p('recordType'),
                    p('workflowStage'),
                    p('settingsFingerprint') || undefined
                  )
                : await input.dashboards.extractDashboardViewTemplates(
                    modelBrand,
                    p('dashboardView'),
                    p('stepName'),
                    p('settingsFingerprint') || undefined
                  );
          } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 409 || status === 503) {
              res.status(status).send((error as Error).message);
              return;
            }
            throw error;
          }
        }
        const file = input.artifacts.view('dynamicScriptAsset', brand.name!, portal);
        if (!file) throw new Error('Required script artifact missing.');
        res.type('text/javascript').send(
          input.artifacts.render(file, {
            entries: input.templates
              .buildClientMapping(entries)
              .map(entry => ({ key: buildKeyString(entry.key), value: entry.value })),
          })
        );
      })
    );
  }
}
