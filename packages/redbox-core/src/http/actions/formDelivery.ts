import {
  deliverForm,
  FormDeliveryError,
  type FormDeliveryInput as DomainFormDeliveryInput,
} from '../../forms/FormDelivery';
import type { ContextVariables } from '../../forms/ContextVariables';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { UserModel } from '../../model/storage/UserModel';
import { requestString } from '../requestValues';
import { apiNoCacheHeaders, safeApiVersion } from '../apiResponses';
import { referenceErrors, jsonResult, type ReferenceRequest, type ReferenceResult } from './reference';
export interface FormDeliveryInput {
  readonly delivery: DomainFormDeliveryInput;
  readonly contextVariables: Pick<ContextVariables, 'evaluateContextVariables'>;
}
export async function getForm(input: FormDeliveryInput, req: ReferenceRequest): Promise<ReferenceResult> {
  const { actor, brand } = req.context;
  for (const value of [req.query.edit, req.query.formName, req.query.targetStep, req.query.oid]) {
    if (value !== undefined && typeof value !== 'string') {
      return referenceErrors(req, 400, [{ detail: 'Invalid form parameter' }]);
    }
  }
  const user = actor
    ? Object.assign(new UserModel(), actor, { roles: actor.roles.map(role => ({ ...role })) })
    : undefined;
  try {
    const result = await deliverForm(input.delivery, {
      brand: Object.assign(new BrandingModel(), brand),
      user,
      recordType: requestString(req.params.name) ?? '',
      oid: requestString(req.params.oid ?? req.query.oid)?.trim() ?? null,
      edit: req.query.edit === 'true',
      formName: req.query.formName as string | undefined,
      targetStep: req.query.targetStep as string | undefined,
      contextVariables: record =>
        input.contextVariables.evaluateContextVariables(
          {
            user,
            session: req.session,
            headers: req.headers,
            param: name =>
              req.params[name] ?? (req.body as Record<string, unknown> | undefined)?.[name] ?? req.query[name],
            get: name => req.headers?.[name.toLowerCase() === 'referrer' ? 'referer' : name.toLowerCase()],
          },
          record
        ),
    });
    return jsonResult(
      safeApiVersion(req) === '2.0'
        ? { data: result.data, meta: result.meta, ...(result.prehydrate ? { prehydrate: result.prehydrate } : {}) }
        : result.data,
      200,
      { ...apiNoCacheHeaders, ...result.headers }
    );
  } catch (error) {
    if (!(error instanceof FormDeliveryError)) throw error;
    if (error.code && safeApiVersion(req) === '2.0')
      return jsonResult({ errors: [{ code: error.code }], meta: {} }, error.status, apiNoCacheHeaders);
    return referenceErrors(req, error.status, [{ detail: error.message }]);
  }
}
