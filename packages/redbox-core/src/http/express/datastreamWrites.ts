import type { Router, RequestHandler } from 'express';
import type { PoliciesConfig } from '../../config/policies.config';
import { addDataStreamsRoute } from '../../api-routes/groups/records';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction } from './middleware';
import { StreamingMultipart } from './multipart';
import { executeDatastreamUpload, type DatastreamUploadInput } from '../actions/datastreamUpload';
export const datastreamWriteRoutes = [addDataStreamsRoute];
export interface DatastreamWritesHttpInput extends DatastreamUploadInput {
  readonly multipart: StreamingMultipart;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
}
export function mountDatastreamWriteRoutes(router: Router, input: DatastreamWritesHttpInput): void {
  const route = addDataStreamsRoute;
  router.post(
    route.path,
    ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
    input.csrf.apiProtect,
    httpAction(async (req, res) =>
      executeDatastreamUpload(
        input,
        { params: req.params, query: req.query, headers: req.headers, context: () => requestContext(req) },
        res,
        route,
        consume => input.multipart.receive(req, consume)
      )
    )
  );
}
