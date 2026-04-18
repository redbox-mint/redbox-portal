import { defineApiRoute } from './define';
import { getRedboxRoleExtension } from './helpers';
import { ApiOpenApiMetadata, ApiRequestDefinition, HttpMethod } from './types';

export function apiRoute(
  method: HttpMethod,
  path: string,
  controller: string,
  action: string,
  request?: ApiRequestDefinition,
  metadata: ApiOpenApiMetadata = {}
) {
  const redboxRoleExtension = getRedboxRoleExtension(path);
  const extensions = redboxRoleExtension || metadata.extensions
    ? {
      ...(metadata.extensions ?? {}),
      ...(redboxRoleExtension ?? {}),
    }
    : undefined;

  return defineApiRoute({
    method,
    path,
    controller,
    action,
    request,
    tags: metadata.tags,
    summary: metadata.summary ?? `${controller}.${action}`,
    description: metadata.description,
    operationId: metadata.operationId,
    responses: metadata.responses,
    security: metadata.security ?? [{ bearerAuth: [] }],
    extensions,
    csrf: false,
  });
}
