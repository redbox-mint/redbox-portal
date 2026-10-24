import { PersistenceError } from '../../persistence/errors';
import type { RequestHandler, Router } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as NamedQueries } from '../../queries/NamedQueries';
import { Services as Reports } from '../../queries/Reports';
import type { NamedQueryDefinition } from '../../config/namedQuery.config';
import type { ReportConfigDto } from '../../queries/Reports';
import { namedQueryApiRoutes } from '../../api-routes/groups/named-query';
import { reportsApiRoutes } from '../../api-routes/groups/reports';
import { validateApiRouteRequest } from '../../api-routes/validation';
import { BrandingModel } from '../../model/storage/BrandingModel';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, requestContext, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { sendApiData, sendApiErrors, validationApiVersion } from './responses';

const reportWrites = reportsApiRoutes.filter(route =>
  ['createConfig', 'updateConfig', 'deleteConfig'].includes(route.action)
);
export const queryWriteRoutes = [
  ...namedQueryApiRoutes.filter(route => route.method !== 'get'),
  ...reportWrites,
  ...reportWrites.map(route => ({
    ...route,
    path: route.path.replace('/api/', '/admin/'),
    controller: 'ReportController',
  })),
];
export interface QueryWriteHttpInput {
  readonly queries: Pick<NamedQueries.NamedQueryService, 'create' | 'update' | 'delete'>;
  readonly reports: Pick<Reports.Reports, 'createConfig' | 'updateConfig' | 'deleteConfig'>;
  audit(
    actor: { id: string; username: string },
    action: string,
    context: { brandId: string; name: string }
  ): Promise<unknown>;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly log: ILogger;
}
/** Metadata mutations reuse the SR-033 modules and retain their tenant-qualified repository keys. */
export function mountQueryWriteRoutes(router: Router, input: QueryWriteHttpInput): void {
  for (const route of queryWriteRoutes) {
    const browser = route.controller === 'ReportController';
    router[route.method](
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      browser ? input.csrf.protect : input.csrf.apiProtect,
      httpAction(async (req, res) => {
        const { actor, brand: snapshot } = requestContext(req);
        if (!actor) {
          sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
          return;
        }
        if (!actor.roles.some(role => role.brandId === snapshot.id && role.name === 'Admin')) {
          sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
          return;
        }
        const validated = validateApiRouteRequest(req, route);
        if (!validated.valid) {
          sendApiErrors(
            req,
            res,
            400,
            validated.issues.map(i => ({ title: i.path, detail: i.message })),
            validationApiVersion(req)
          );
          return;
        }
        const brand = Object.assign(new BrandingModel(), snapshot);
        const body = validated.body as Record<string, unknown> | undefined;
        const named = route.action.endsWith('Query');
        const name = (validated.params.name ?? body?.name) as string | undefined;
        if (
          typeof name !== 'string' ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(name) ||
          (named && name === 'collections') ||
          (named && body?.name !== undefined && body.name !== name)
        ) {
          sendApiErrors(req, res, 400, [{ detail: 'Invalid or reserved definition name' }]);
          return;
        }
        try {
          let result: unknown;
          if (named) {
            if (route.action === 'createQuery')
              await input.queries.create(brand, name, body as unknown as NamedQueryDefinition);
            else if (route.action === 'updateQuery')
              await input.queries.update(brand, name, body as unknown as NamedQueryDefinition);
            else await input.queries.delete(brand, name);
            result = { name };
          } else if (route.action === 'createConfig')
            result = await input.reports.createConfig(brand, body as unknown as ReportConfigDto);
          else if (route.action === 'updateConfig')
            result = await input.reports.updateConfig(brand, name, body as unknown as ReportConfigDto);
          else result = await input.reports.deleteConfig(brand, name);
          await input.audit(actor, route.action, { brandId: brand.id, name });
          const status = route.action.startsWith('create') ? 201 : 200;
          sendApiData(req, res, result, status);
        } catch (error) {
          input.log.error(error);
          const message = error instanceof Error ? error.message : '';
          const invalidTarget =
            named && error instanceof PersistenceError && error.code === 'named-query-compatibility';
          const status = invalidTarget
            ? 400
            : error instanceof Reports.ReportConfigServiceError
              ? error.status
              : named && message === `Named query '${name}' not found`
                ? 404
                : named && message === `Named query '${name}' already exists`
                  ? 409
                  : 500;
          sendApiErrors(req, res, status, [
            {
              detail: invalidTarget
                ? 'Unsupported named-query collection or expression.'
                : error instanceof Reports.ReportConfigServiceError || status !== 500
                  ? message
                  : 'Definition mutation failed.',
            },
          ]);
        }
      })
    );
  }
}
