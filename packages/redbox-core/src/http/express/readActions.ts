import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { ApiRouteDefinition } from '../../api-routes/types';
import type { ValidatedApiRouteRequest } from '../../api-routes/validation';
import { executeReferenceRead, type ReferenceRequest, type ReferenceResult } from '../actions/reference';
import { requestContext } from './policies';
import { RequestChronicleHelper } from '../../utilities/RequestChronicle';
/** Transport adaptation only: all validation, domain work and JSON encoding is shared. */
export async function readAction(
  req: Request,
  res: Response,
  contract: Pick<ApiRouteDefinition, 'request'>,
  action: (request: ReferenceRequest, valid: ValidatedApiRouteRequest) => Promise<ReferenceResult>,
  failure?: (request: ReferenceRequest, error: unknown) => ReferenceResult
): Promise<void> {
  const request: ReferenceRequest = {
    method: req.method,
    params: req.params,
    query: req.query,
    headers: req.headers,
    body: req.body,
    session: req.session,
    get context() {
      return requestContext(req);
    },
    observe: facts => RequestChronicleHelper.existing(req)?.addInfo(facts),
    recordFailure: () => {
      const chronicle = RequestChronicleHelper.existing(req);
      chronicle?.addInfo({ httpFailure: 'request-failed' });
      if (chronicle && !chronicle.hasErrors) chronicle.addError(new Error('HTTP request failed'));
    },
  };
  const result = await executeReferenceRead(
    request,
    contract,
    valid => action(request, valid),
    failure ? error => failure(request, error) : undefined
  );
  res.set(result.headers).status(result.status);
  if (result.kind === 'redirect') {
    res.redirect(result.headers.Location);
    return;
  }
  if (result.kind === 'stream') {
    try {
      await pipeline(result.body as Readable, res);
    } catch {
      if (!res.destroyed) res.destroy();
    }
    return;
  }
  if (result.kind === 'empty') {
    res.end();
    return;
  }
  if (result.kind === 'text') {
    res.send(result.bytes);
    return;
  }
  res
    .type(result.headers['Content-Type'] ?? 'application/json; charset=utf-8')
    .send(result.json === undefined ? undefined : Buffer.from(result.json));
}
