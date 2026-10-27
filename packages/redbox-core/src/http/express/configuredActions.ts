import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { sendApiData, sendApiErrors } from './responses';

export interface ConfiguredActionContext {
  readonly actor: { readonly id: string; readonly username: string };
  readonly brand: { readonly id: string; readonly name?: string };
  readonly portal: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly query: Readonly<Record<string, unknown>>;
}
/** Selected at composition time. Actions receive facts and return data, never HTTP objects. */
export interface ConfiguredAction {
  authorize(context: ConfiguredActionContext): Promise<boolean>;
  execute(context: ConfiguredActionContext): Promise<unknown>;
}
export const configuredActionRoutes = [
  {
    method: 'post' as const,
    path: '/:branding/:portal/action/:action',
    controller: 'ActionController',
    action: 'callService',
  },
];
export function mountConfiguredActionRoutes(
  router: Router,
  input: {
    readonly actions: Readonly<Record<string, ConfiguredAction>>;
    audit(actor: { id: string; username: string }, action: string, context: { brandId: string }): Promise<unknown>;
    readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect'>;
    readonly policies: Readonly<Record<string, RequestHandler>>;
    readonly policyConfiguration: PoliciesConfig;
    readonly log: ILogger;
  }
): void {
  const route = configuredActionRoutes[0]!;
  router.post(
    route.path,
    ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
    input.csrf.protect,
    httpAction(async (req, res) => {
      const { actor, brand, portal } = requestContext(req);
      if (!actor) {
        sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
        return;
      }
      if (!actor.roles.some(r => r.brandId === brand.id)) {
        sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
        return;
      }
      const name = String(req.params.action),
        action = Object.hasOwn(input.actions, name) ? input.actions[name] : undefined;
      if (!action) {
        sendApiErrors(req, res, 404, [{ detail: 'Action not found' }]);
        return;
      }
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        sendApiErrors(req, res, 400, [{ detail: 'Invalid action payload' }]);
        return;
      }
      const context = {
        actor: { id: actor.id, username: actor.username },
        brand,
        portal: portal ?? '',
        body: { ...req.body },
        query: { ...req.query },
      };
      try {
        if (!(await action.authorize(context))) {
          sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
          return;
        }
        const result = await action.execute(context);
        await input.audit(actor, 'action:' + name, { brandId: brand.id });
        sendApiData(req, res, result);
      } catch (_error) {
        input.log.error('Configured action failed');
        sendApiErrors(req, res, 500, [{ detail: 'Action failed. Review current state before retrying.' }]);
      }
    })
  );
}
