import { defineApiRoute } from './define';
import { type AuthRuleLike, getRedboxRoleExtension } from './helpers';
import { ApiOpenApiMetadata, ApiRequestDefinition, HttpMethod } from './types';

export function apiRoute(
  method: HttpMethod,
  path: string,
  controller: string,
  action: string,
  request?: ApiRequestDefinition,
  metadata: ApiOpenApiMetadata = {},
  authRules?: readonly AuthRuleLike[]
) {
  const redboxRoleExtension = getRedboxRoleExtension(path, authRules);
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
    includeDefaultResponses: metadata.includeDefaultResponses,
    security: metadata.security ?? [{ bearerAuth: [] }],
    extensions,
    csrf: false,
  });
}
