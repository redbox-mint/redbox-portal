import type { RequestHandler, Router } from 'express';
import type { Services as Schemas } from '../../recordSchema/RecordSchema';
import type { PoliciesConfig } from '../../config/policies.config';
import { recordSchemaApiRoutes } from '../../api-routes/groups/record-schemas';
import { validateApiRouteRequest } from '../../api-routes/validation';
import {
  buildRecordSchemaInvalidRequestProblem,
  RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_VARY,
  recordSchemaImmutableUrl,
} from '../../api-routes/record-schema-response';
import {
  schemaProblem,
  createSchemaFailure,
  updateSchemaFailure,
  immutableSchemaFailure,
  schemaResponseHeaders,
} from '../../api-routes/schemaDelivery';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { UserModel } from '../../model/storage/UserModel';
import { bindHttpPolicies, requestContext, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
export const recordSchemaReadRoutes = recordSchemaApiRoutes;
export interface RecordSchemaReadHttpInput {
  readonly schemas: Pick<Schemas.RecordSchema, 'resolveCreate' | 'resolveUpdate' | 'resolveImmutable'>;
  readonly rootContext?: string;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountRecordSchemaReadRoutes(router: Router, input: RecordSchemaReadHttpInput): void {
  for (const route of recordSchemaReadRoutes)
    router.get(
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      httpAction(async (req, res) => {
        const problem = (body: ReturnType<typeof schemaProblem>) =>
          res
            .set({ 'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL, Vary: RECORD_SCHEMA_RESPONSE_VARY })
            .type(RECORD_SCHEMA_PROBLEM_MEDIA_TYPE)
            .status(body.status)
            .json(body);
        const instance = (input.rootContext ?? '') + req.path;
        const validated = validateApiRouteRequest(req, route);
        if (!validated.valid) {
          problem(buildRecordSchemaInvalidRequestProblem(instance));
          return;
        }
        const { brand: snapshot, actor, portal } = requestContext(req);
        if (!actor) {
          problem(schemaProblem('authentication-required', instance));
          return;
        }
        const brand = Object.assign(new BrandingModel(), snapshot);
        const user = Object.assign(new UserModel(), actor, {
          roles: actor.roles.map(role => ({
            id: role.id,
            name: role.name ?? '',
            users: [],
            branding: Object.assign(new BrandingModel(), { id: role.brandId }),
          })),
        });
        const base = { brand: brand.id, branding: brand.name, portal, caller: { brand, user } };
        try {
          if (route.action === 'immutable') {
            const result = await input.schemas.resolveImmutable({
              ...base,
              digest: String(validated.params.digest),
              ifNoneMatch: req.get('If-None-Match'),
            });
            if (result.kind !== 'resolved' && result.kind !== 'not-modified') {
              problem(immutableSchemaFailure(instance, result));
              return;
            }
            const etag = `"sha256:${result.artifact.digest}"` as const;
            res.set(schemaResponseHeaders(etag));
            if (result.kind === 'not-modified') res.status(304).end();
            else res.type(RECORD_SCHEMA_RESPONSE_MEDIA_TYPE).json(result.artifact.document);
          } else {
            const operation = typeof validated.query.operation === 'string' ? validated.query.operation : undefined;
            const result =
              route.action === 'create'
                ? await input.schemas.resolveCreate({
                    ...base,
                    recordType: String(validated.params.recordType),
                    operation,
                  })
                : await input.schemas.resolveUpdate({ ...base, oid: String(validated.params.oid), operation });
            if (result.kind !== 'resolved' && result.kind !== 'partial') {
              const body =
                route.action === 'create'
                  ? createSchemaFailure(
                      instance,
                      result as Exclude<
                        Awaited<ReturnType<Schemas.RecordSchema['resolveCreate']>>,
                        { kind: 'resolved' | 'partial' }
                      >
                    )
                  : updateSchemaFailure(instance, result);
              problem(body);
              return;
            }
            const canonical = recordSchemaImmutableUrl(brand.name, portal, result.digest, input.rootContext);
            res.set(schemaResponseHeaders(result.metadata.etag, canonical));
            if (req.get('If-None-Match')?.trim() === result.metadata.etag) res.status(304).end();
            else res.type(RECORD_SCHEMA_RESPONSE_MEDIA_TYPE).json(result.document);
          }
        } catch {
          problem(schemaProblem('unavailable', instance));
        }
      })
    );
}
