import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  brandingUploadActorPrelude,
  validateBrandingUpload,
  rejectBrandingUpload,
  executeBrandingUpload,
  type BrandingUploadInput,
} from '../actions/brandingUploads';
import { requestContext } from '../context';
import { nativeJsonOutput } from './jsonOutput';
import { resolvedRequestContract } from './validation';
import { stageMultipart, validatedMultipart, finishMultipart } from './rawMultipart';
import { httpReplySubmitted } from './errorBoundary';
import type { ControllerInstances } from './registration';
const facts = (request: FastifyRequest) => ({
  params: request.params as Record<string, unknown>,
  query: request.query as Record<string, unknown>,
  headers: request.headers,
  body: request.body,
  context: () => requestContext(request),
});
export function createBrandingUploadBoundary(input: () => BrandingUploadInput) {
  return {
    async prelude(request: FastifyRequest, reply: FastifyReply) {
      const ports = input(),
        req = facts(request),
        res = nativeJsonOutput(reply);
      if (!brandingUploadActorPrelude(req, res)) return;
      try {
        const route = (request.routeOptions.config as { redboxRoute?: { route: { declaration: { action: string } } } })
          .redboxRoute!.route.declaration;
        await stageMultipart(request, ports.multipart, received =>
          validateBrandingUpload(ports, req, { action: route.action, ...resolvedRequestContract(request) }, received)
        );
      } catch (error) {
        rejectBrandingUpload(ports, req, res, error);
      }
    },
    async finish(request: FastifyRequest, reply: FastifyReply) {
      try {
        await finishMultipart(request);
      } catch (error) {
        if (!httpReplySubmitted(reply)) rejectBrandingUpload(input(), facts(request), nativeJsonOutput(reply), error);
      }
    },
    wrap(action: ReturnType<ControllerInstances['action']>): ReturnType<ControllerInstances['action']> {
      return async (request, reply) => {
        try {
          return await action(request, reply);
        } finally {
          await this.finish(request, reply);
        }
      };
    },
    async onSend(request: FastifyRequest, reply: FastifyReply, payload: unknown) {
      try {
        await finishMultipart(request);
      } catch (error) {
        rejectBrandingUpload(
          input(),
          facts(request),
          nativeJsonOutput(reply, bytes => {
            payload = bytes;
          }),
          error
        );
      }
      return payload;
    },
  };
}
export async function brandingUploadAction(
  input: BrandingUploadInput,
  action: string,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const upload = validatedMultipart(request);
  return executeBrandingUpload(
    input,
    facts(request),
    nativeJsonOutput(reply),
    { action, ...resolvedRequestContract(request) },
    async consume => {
      try {
        return await consume(upload.received);
      } finally {
        await upload.close();
      }
    }
  );
}
