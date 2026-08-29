import { defineApiRoute } from './define';
import { getRedboxRoleExtension } from './helpers';
import { ApiOpenApiMetadata, ApiRequestDefinition, HttpMethod } from './types';
import {
  coreApiActionAuthorization,
  createRouteId,
  normalizeRouteAuthorization,
  type RouteAuthorization,
} from '../authorization';

export interface ApiRouteMetadata extends ApiOpenApiMetadata {
  authorization?: RouteAuthorization;
}

export function apiRoute(
  method: HttpMethod,
  path: string,
  controller: string,
  action: string,
  request?: ApiRequestDefinition,
  metadata: ApiRouteMetadata = {}
) {
  const authorization = normalizeRouteAuthorization(
    metadata.authorization ??
      coreApiActionAuthorization(controller, action) ??
      (() => {
        throw new Error(
          `API route ${String(method).toUpperCase()} ${path} (${controller}#${action}) must declare authorization metadata.`
        );
      })()
  );
  const redboxRoleExtension = getRedboxRoleExtension(path);
  const authorizationExtensions = authorization.kind === 'scope' ? { 'x-redbox-scope': authorization.scope } : {};
  const extensions =
    redboxRoleExtension || metadata.extensions || authorization.kind === 'scope'
      ? {
          ...(metadata.extensions ?? {}),
          ...(redboxRoleExtension ?? {}),
          ...(redboxRoleExtension === undefined ? {} : { 'x-redbox-roles-deprecated': true }),
          ...authorizationExtensions,
        }
      : undefined;

  const routeIdentity = { method, path, controller, action };
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
    security: authorization.kind === 'scope' ? (metadata.security ?? [{ bearerAuth: [] }]) : [],
    extensions,
    authorization,
    routeId: createRouteId(routeIdentity),
    csrf: false,
  });
}
