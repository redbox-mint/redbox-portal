import { recordMetadataActorPrelude } from './recordMetadata';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import { referenceData, referenceErrors, type ReferenceRequest, type ReferenceResult } from './reference';

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
export interface ConfiguredActionInput {
  readonly actions: Readonly<Record<string, ConfiguredAction>>;
  audit(actor: { id: string; username: string }, action: string, context: { brandId: string }): Promise<unknown>;
  readonly log: ILogger;
}
export function configuredActionFailure(
  input: Pick<ConfiguredActionInput, 'log'>,
  req: ReferenceRequest
): ReferenceResult {
  input.log.error('Configured action failed');
  return referenceErrors(req, 500, [{ detail: 'Action failed. Review current state before retrying.' }]);
}
export async function callService(input: ConfiguredActionInput, req: ReferenceRequest): Promise<ReferenceResult> {
  const { actor, brand, portal } = req.context;
  const refusal = recordMetadataActorPrelude(req);
  if (refusal) return refusal;
  const name = String(req.params.action),
    action = Object.hasOwn(input.actions, name) ? input.actions[name] : undefined;
  if (!action) {
    return referenceErrors(req, 404, [{ detail: 'Action not found' }]);
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return referenceErrors(req, 400, [{ detail: 'Invalid action payload' }]);
  }
  const context = {
    actor: { id: actor!.id, username: actor!.username },
    brand,
    portal: portal ?? '',
    body: { ...req.body },
    query: { ...req.query },
  };
  if (!(await action.authorize(context))) {
    return referenceErrors(req, 403, [{ detail: 'Access Denied' }]);
  }
  const result = await action.execute(context);
  await input.audit(actor!, 'action:' + name, { brandId: brand.id });
  return { ...referenceData(req, result), status: 200 };
}
