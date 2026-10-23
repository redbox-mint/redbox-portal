import type { Request, RequestHandler, Router } from 'express';
import type { RecordTypes } from '../../recordTypes';
import type { RecordTypeModel } from '../../model/storage/RecordTypeModel';
import { ListAPIResponse } from '../../model/ListAPIResponse';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { recordTypeApiRoutes } from '../../api-routes/groups/recordtypes';
import { validateApiRouteRequest } from '../../api-routes/validation';
import { recordSchemaCreateResolverUrl } from '../../api-routes/record-schema-response';
import { isRecordSchemaEnabled } from '../../config/recordSchema.config';
import type { PoliciesConfig } from '../../config/policies.config';
import { bindHttpPolicies, requestContext, resolveEffectivePolicies } from './policies';
import { httpAction, singleHttpResult } from './middleware';
import { apiNoCacheHeaders, sendApiData, sendApiErrors, validationApiVersion } from './responses';

export interface RecordTypeHttpInput {
  readonly recordTypes: Pick<RecordTypes, 'get' | 'getAll'>;
  readonly policyConfiguration: PoliciesConfig;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  /** Already resolved contracts for just this group; unsupported dispatch targets fail offline. */
  readonly routes?: readonly ApiRouteDefinition[];
  readonly recordSchema?: unknown;
  readonly rootContext?: string;
}

/** Partial host: these two contracts only. Other API/browser groups remain unmounted. */
export function mountRecordTypeRoutes(router: Router, input: RecordTypeHttpInput): void {
  const routes = input.routes ?? recordTypeApiRoutes;
  if (
    routes.length !== recordTypeApiRoutes.length ||
    recordTypeApiRoutes.some(
      expected =>
        routes.filter(
          route =>
            route.method === expected.method &&
            route.path === expected.path &&
            route.controller === expected.controller &&
            route.action === expected.action
        ).length !== 1
    )
  )
    throw new Error('Record-type HTTP composition requires both supported contracts and dispatch targets.');
  // Resolve every binding before mutating the router.
  const bindings = routes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  const discoverable = (req: Request, recordType: RecordTypeModel, fallbackName = '') => {
    if (!isRecordSchemaEnabled(input.recordSchema)) return recordType;
    const { brand, portal } = requestContext(req);
    if (typeof brand.name !== 'string') throw new TypeError('Resolved brand must have a public name.');
    const storedName: unknown = Reflect.get(recordType, 'name');
    const name = typeof storedName === 'string' && storedName.trim() ? storedName.trim() : fallbackName.trim();
    return {
      ...recordType,
      recordSchemaCreateResolver: recordSchemaCreateResolverUrl(brand.name, portal, name, input.rootContext),
    };
  };
  for (const { route, policies } of bindings)
    router.get(
      route.path,
      ...policies,
      httpAction(async (req, res) => {
        const validated = validateApiRouteRequest(req, route);
        if (!validated.valid) {
          sendApiErrors(
            req,
            res,
            400,
            validated.issues.map(issue => ({ title: issue.path, detail: issue.message })),
            validationApiVersion(req)
          );
          return;
        }
        const { brand } = requestContext(req);
        if (route.action === 'getRecordType') {
          const name = validated.query.name;
          if (typeof name !== 'string') throw new TypeError('Record-type contract must supply a validated name.');
          const recordType = await singleHttpResult(input.recordTypes.get(brand, name));
          if (!recordType) {
            // Retain the legacy missing-definition status/envelope without dereferencing null.
            res
              .set(apiNoCacheHeaders)
              .status(500)
              .json({ errors: [{ detail: 'Check server logs.' }], meta: {} });
            return;
          }
          sendApiData(req, res, discoverable(req, recordType, name));
        } else {
          const recordTypes = await singleHttpResult(input.recordTypes.getAll(brand));
          const result = new ListAPIResponse<ReturnType<typeof discoverable>>();
          result.summary.numFound = recordTypes.length;
          result.records = recordTypes.map(recordType => discoverable(req, recordType));
          sendApiData(req, res, result);
        }
      })
    );
}
