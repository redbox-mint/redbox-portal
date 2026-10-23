import type { Router, RequestHandler } from 'express';
import { deliverForm, FormDeliveryError, type FormDeliveryInput } from '../../forms/FormDelivery';
import type { ContextVariables } from '../../forms/ContextVariables';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { UserModel } from '../../model/storage/UserModel';
import type { PoliciesConfig } from '../../config/policies.config';
import { bindHttpPolicies, requestContext, resolveEffectivePolicies } from './policies';
import { httpAction } from './middleware';
import { apiNoCacheHeaders, apiVersion, sendApiErrors } from './responses';
export const formDeliveryRoutes = ['/record/form/:name', '/record/form/:name/:oid'].map(path => ({
  method: 'get' as const,
  path: '/:branding/:portal' + path,
  controller: 'RecordController',
  action: 'getForm',
}));
export interface FormDeliveryHttpInput {
  readonly delivery: FormDeliveryInput;
  readonly contextVariables: Pick<ContextVariables, 'evaluateContextVariables'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountFormDeliveryRoutes(router: Router, input: FormDeliveryHttpInput): void {
  for (const route of formDeliveryRoutes) {
    const policies = bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies);
    router.get(
      route.path,
      ...policies,
      httpAction(async (req, res) => {
        const { actor, brand } = requestContext(req);
        for (const value of [req.query.edit, req.query.formName, req.query.targetStep]) {
          if (value !== undefined && typeof value !== 'string') {
            sendApiErrors(req, res, 400, [{ detail: 'Invalid form parameter' }]);
            return;
          }
        }
        const user = actor
          ? Object.assign(new UserModel(), actor, { roles: actor.roles.map(role => ({ ...role })) })
          : undefined;
        try {
          const result = await deliverForm(input.delivery, {
            brand: Object.assign(new BrandingModel(), brand),
            user,
            recordType: String(req.params.name),
            oid: typeof req.params.oid === 'string' ? req.params.oid.trim() : null,
            edit: req.query.edit === 'true',
            formName: req.query.formName as string | undefined,
            targetStep: req.query.targetStep as string | undefined,
            contextVariables: record =>
              input.contextVariables.evaluateContextVariables(
                {
                  user,
                  session: req.session,
                  headers: req.headers,
                  param: name => req.params[name] ?? req.body?.[name] ?? req.query[name],
                  get: name => req.get(name),
                },
                record
              ),
          });
          res
            .set(apiNoCacheHeaders)
            .set(result.headers ?? {})
            .json(
              apiVersion(req) === '2.0'
                ? {
                    data: result.data,
                    meta: result.meta,
                    ...(result.prehydrate ? { prehydrate: result.prehydrate } : {}),
                  }
                : result.data
            );
        } catch (error) {
          if (!(error instanceof FormDeliveryError)) throw error;
          if (error.code && apiVersion(req) === '2.0')
            res
              .set(apiNoCacheHeaders)
              .status(error.status)
              .json({ errors: [{ code: error.code }], meta: {} });
          else sendApiErrors(req, res, error.status, [{ detail: error.message }]);
        }
      })
    );
  }
}
