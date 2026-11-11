import type { Request, Response } from 'express';
import type { ApiRouteDefinition } from '../../api-routes/types';
import type { ValidatedApiRouteRequest } from '../../api-routes/validation';
import { RequestChronicleHelper } from '../../utilities/RequestChronicle';
import { requestContext } from './policies';
import { executeReferenceRead, type ReferenceRequest, type ReferenceResult } from '../actions/reference';

export async function referenceRead(
  req: Request,
  res: Response,
  contract: Pick<ApiRouteDefinition, 'request'>,
  action: (facts: ReferenceRequest, valid: ValidatedApiRouteRequest) => Promise<ReferenceResult>,
  failure?: (facts: ReferenceRequest, error: unknown) => ReferenceResult
): Promise<void> {
  const facts: ReferenceRequest = {
    params: req.params,
    query: req.query,
    headers: req.headers,
    body: req.body,
    session: req.session,
    context: requestContext(req),
    observe: data => RequestChronicleHelper.existing(req)?.addInfo(data),
    recordFailure: () => {
      const chronicle = RequestChronicleHelper.existing(req);
      chronicle?.addInfo({ httpFailure: 'request-failed' });
      if (chronicle && !chronicle.hasErrors) chronicle.addError(new Error('HTTP request failed'));
    },
  };
  const result = await executeReferenceRead(
    facts,
    contract,
    valid => action(facts, valid),
    failure ? error => failure(facts, error) : undefined
  );
  res
    .set(result.headers)
    .status(result.status)
    .type('application/json; charset=utf-8')
    .send(result.json === undefined ? undefined : Buffer.from(result.json));
}
