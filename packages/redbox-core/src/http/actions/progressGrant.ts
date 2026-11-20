import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { ProgressSockets } from '../integrations/progressSockets';
import { actionApiData, actionApiErrors, type ActionRequest, type JsonOutput } from './jsonOutput';
export interface ProgressGrantInput {
  readonly sockets: Pick<ProgressSockets, 'issue'>;
  readonly log: Pick<ILogger, 'error'>;
}
export async function executeProgressGrant(
  input: ProgressGrantInput,
  req: ActionRequest,
  res: JsonOutput
): Promise<void> {
  try {
    const { actor, brand } = req.context();
    if (!actor) {
      actionApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
      return;
    }
    if (!actor.roles.some(r => r.brandId === brand.id)) {
      actionApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
      return;
    }
    actionApiData(req, res, {
      token: input.sockets.issue(
        {
          sessionId: req.sessionId,
          ...(typeof req.headers.authorization === 'string' && req.headers.authorization
            ? { authorization: req.headers.authorization }
            : {}),
        },
        brand,
        actor
      ),
    });
  } catch {
    input.log.error('Progress operation failed');
    actionApiErrors(req, res, 500, [{ detail: 'Progress operation failed. Review current state before retrying.' }]);
  }
}
