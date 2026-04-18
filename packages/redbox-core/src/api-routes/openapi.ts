import 'zod-to-openapi';

import { OpenAPIGenerator } from 'zod-to-openapi';
import { ZodTypeAny } from 'zod';

import { apiErrorResponseSchema, responseField } from './schemas/common';
import { ApiResponseDefinition, ApiRouteDefinition } from './types';
import {
  ensureUniqueApiRoutes,
  getFileConstraintDescription,
  getFileConstraintOpenApiExtension,
  getObjectSchemaShape,
  isOptionalSchema,
  isZodObjectSchema,
  isRecord,
} from './helpers';

type OpenApiObjectSchema = Record<string, unknown> & {
  properties?: Record<string, unknown>;
  required?: string[];
};

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, unknown>>;
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http'; scheme: 'bearer'; bearerFormat?: string };
    };
    schemas?: Record<string, unknown>;
  };
}

export interface OpenApiBuildOptions {
  branding?: string;
  portal?: string;
}

function getWildcardPathParameterNames(path: string): Set<string> {
  const wildcardPathParameterNames = new Set<string>();
  const wildcardPathParameterPattern = /:([A-Za-z0-9_]+)\*/g;
  let match: RegExpExecArray | null;

  while ((match = wildcardPathParameterPattern.exec(path)) !== null) {
    wildcardPathParameterNames.add(match[1]);
  }

  return wildcardPathParameterNames;
}

function toOpenApiPath(path: string): string {
  return path
    .replace(/:([A-Za-z0-9_]+)\*/g, '{$1}')
    .replace(/:([A-Za-z0-9_]+)\?/g, '{$1}')
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function specializeOpenApiPath(path: string, options: OpenApiBuildOptions): string {
  const branding = options.branding?.trim();
  const portal = options.portal?.trim();
  if (!branding && !portal) {
    return path;
  }

  const genericPrefix = '/{branding}/{portal}';
  if (!path.startsWith(genericPrefix)) {
    return path;
  }

  const specializedPrefix = `/${branding || '{branding}'}/${portal || '{portal}'}`;
  return `${specializedPrefix}${path.slice(genericPrefix.length)}`;
}

function specializeParameters(parameters: Record<string, unknown>[] | undefined, options: OpenApiBuildOptions) {
  if (!parameters) {
    return parameters;
  }

  const pathParamsToRemove = new Set<string>();
  if (options.branding?.trim()) {
    pathParamsToRemove.add('branding');
  }
  if (options.portal?.trim()) {
    pathParamsToRemove.add('portal');
  }

  const nextParameters = parameters.filter(parameter => {
    if (typeof parameter !== 'object' || parameter === null) {
      return true;
    }
    const candidate = parameter as { in?: string; name?: unknown };
    return !(candidate.in === 'path' && pathParamsToRemove.has(String(candidate.name ?? '')));
  });

  return nextParameters.length ? nextParameters : undefined;
}

function specializeOperation(operation: Record<string, unknown>, options: OpenApiBuildOptions): Record<string, unknown> {
  if (!options.branding && !options.portal) {
    return operation;
  }

  const specializedParameters = specializeParameters(operation.parameters as Record<string, unknown>[] | undefined, options);
  return {
    ...operation,
    ...(specializedParameters ? { parameters: specializedParameters } : {}),
  };
}

function specializeOpenApiDocument(document: OpenApiDocument, options: OpenApiBuildOptions): OpenApiDocument {
  if (!options.branding && !options.portal) {
    return document;
  }

  const paths = Object.fromEntries(
    Object.entries(document.paths).map(([path, operations]) => [
      specializeOpenApiPath(path, options),
      Object.fromEntries(
        Object.entries(operations).map(([method, operation]) => [method, specializeOperation(operation as Record<string, unknown>, options)])
      ),
    ])
  );

  return {
    ...document,
    paths,
  };
}

function sanitizeOpenApiValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeOpenApiValue(item)) as T;
  }

  if (!isRecord(value)) {
    return value;
  }

  const sanitizedEntries = Object.entries(value).flatMap(([key, entry]) => {
    const sanitizedEntry = sanitizeOpenApiValue(entry);
    if (key === 'required' && Array.isArray(sanitizedEntry) && sanitizedEntry.length === 0) {
      return [];
    }
    if (sanitizedEntry === undefined) {
      return [];
    }
    return [[key, sanitizedEntry]] as Array<[string, unknown]>;
  });

  return Object.fromEntries(sanitizedEntries) as T;
}

function createSchemaConverter() {
  const generator = new OpenAPIGenerator([]);
  return {
    toOpenApiSchema(schema: ZodTypeAny): Record<string, unknown> {
      return sanitizeOpenApiValue(
        (
          generator as unknown as { generateSingle: (schema: ZodTypeAny) => Record<string, unknown> }
        ).generateSingle(schema)
      );
    },
    getComponentSchemas(): Record<string, unknown> | undefined {
      const refs = (generator as unknown as { refs?: Record<string, unknown> }).refs ?? {};
      return Object.keys(refs).length ? sanitizeOpenApiValue(refs) : undefined;
    },
  };
}

function buildParameters(
  route: ApiRouteDefinition,
  toOpenApiSchema: (schema: ZodTypeAny) => Record<string, unknown>
): Record<string, unknown>[] {
  const params: Record<string, unknown>[] = [];
  const wildcardPathParameterNames = getWildcardPathParameterNames(route.path);
  const getObjectSchema = (schema: ZodTypeAny): ZodTypeAny | undefined => {
    if (isZodObjectSchema(schema)) {
      return schema;
    }
    if (isOptionalSchema(schema)) {
      const innerSchema = (schema as unknown as { unwrap: () => ZodTypeAny }).unwrap();
      if (isZodObjectSchema(innerSchema)) {
        return innerSchema;
      }
    }
    return undefined;
  };
  const addParameters = (location: 'path' | 'query' | 'header', schema?: ZodTypeAny) => {
    const properties = getObjectSchemaShape(schema);
    if (!properties) {
      return;
    }
    for (const [name, field] of Object.entries(properties)) {
      const parameter: Record<string, unknown> = {
        name,
        in: location,
        required: location === 'path' || !isOptionalSchema(field),
        schema: toOpenApiSchema(field),
        description: (field as { _def?: { openapi?: { description?: string } } })._def?.openapi?.description,
      };
      if (location === 'path' && wildcardPathParameterNames.has(name)) {
        if (!parameter.description) {
          parameter.description = 'Wildcard path tail; may include slash-delimited segments.';
        }
      }
      if (location === 'query' && getObjectSchema(field)) {
        parameter.style = 'deepObject';
        parameter.explode = true;
      }
      params.push(parameter);
    }
  };
  addParameters('path', route.request?.params);
  addParameters('query', route.request?.query);
  addParameters('header', route.request?.headers);
  return params;
}

function buildResponses(
  route: ApiRouteDefinition,
  toOpenApiSchema: (schema: ZodTypeAny) => Record<string, unknown>
): Record<string, unknown> {
  const responses: Record<string, unknown> = {};
  const routeResponses = route.responses ?? { 200: { description: 'Success' } };
  const defaultResponses: Record<number, ApiResponseDefinition> = {
    400: responseField(apiErrorResponseSchema, 'Bad request'),
    500: responseField(apiErrorResponseSchema, 'Internal server error'),
  };
  const responseDefinitions: Record<string, ApiResponseDefinition> = {
    ...defaultResponses,
    ...routeResponses,
  };
  for (const [status, response] of Object.entries(responseDefinitions)) {
    const content: Record<string, unknown> = {};
    for (const [contentType, bodyContent] of Object.entries(response.content ?? {})) {
      const contentEntry: Record<string, unknown> = {};
      if (bodyContent.schema) {
        contentEntry.schema = toOpenApiSchema(bodyContent.schema);
      }
      if (bodyContent.description) {
        contentEntry.description = bodyContent.description;
      }
      content[contentType] = contentEntry;
    }
    responses[status] = {
      description: response.description,
      ...(Object.keys(content).length ? { content } : {}),
      ...(response.headers
        ? {
          headers: Object.fromEntries(
            Object.entries(response.headers).map(([name, schema]) => [name, { schema: toOpenApiSchema(schema) }])
          ),
        }
        : {}),
    };
  }
  return responses;
}

function buildRequestBody(
  route: ApiRouteDefinition,
  toOpenApiSchema: (schema: ZodTypeAny) => Record<string, unknown>
): Record<string, unknown> | undefined {
  const body = route.request?.body;
  if (!body) {
    return undefined;
  }
  const content: Record<string, unknown> = {};
  for (const [contentType, bodyContent] of Object.entries(body.content)) {
    const contentEntry: Record<string, unknown> = {};
    if (bodyContent.schema) {
      contentEntry.schema = toOpenApiSchema(bodyContent.schema);
    }
    if (bodyContent.description) {
      contentEntry.description = bodyContent.description;
    }
    if (bodyContent.encoding) {
      contentEntry.encoding = bodyContent.encoding;
    }
    if (route.request?.files && contentType === 'multipart/form-data') {
      const objectSchema = (
        bodyContent.schema && isZodObjectSchema(bodyContent.schema)
          ? { ...toOpenApiSchema(bodyContent.schema) }
          : { type: 'object', properties: {} }
      ) as OpenApiObjectSchema;
      const properties = objectSchema.properties ?? {};
      const required = new Set<string>(objectSchema.required ?? []);
      for (const [name, constraint] of Object.entries(route.request.files)) {
        properties[name] = {
          type: 'string',
          format: 'binary',
          description: getFileConstraintDescription(name, constraint),
          ...getFileConstraintOpenApiExtension(constraint),
        };
        if (constraint.required) {
          required.add(name);
        }
      }
      objectSchema.properties = properties;
      if (required.size > 0) {
        objectSchema.required = [...required];
      }
      contentEntry.schema = objectSchema;
    }
    content[contentType] = contentEntry;
  }
  return {
    required: body.required ?? false,
    content,
  };
}

export function buildOpenApiDocument(
  routes: readonly ApiRouteDefinition[],
  info: OpenApiDocument['info'],
  options: OpenApiBuildOptions = {}
): OpenApiDocument {
  const { toOpenApiSchema, getComponentSchemas } = createSchemaConverter();
  const paths = ensureUniqueApiRoutes(routes, 'OpenAPI document').reduce(
    (acc, route) => {
      const path = toOpenApiPath(route.path);
      if (!acc[path]) {
        acc[path] = {};
      }
      acc[path][route.method] = {
        tags: route.tags ? [...route.tags] : undefined,
        summary: route.summary,
        description: route.description,
        operationId: route.operationId,
        security: route.security
          ? route.security.map(entry => ({ ...entry }))
          : [{ bearerAuth: [] }],
        parameters: buildParameters(route, toOpenApiSchema),
        requestBody: buildRequestBody(route, toOpenApiSchema),
        responses: buildResponses(route, toOpenApiSchema),
        ...(route.extensions ?? {}),
      };
      return acc;
    },
    {} as Record<string, Record<string, unknown>>
  );

  const componentSchemas = getComponentSchemas();

  return sanitizeOpenApiValue(specializeOpenApiDocument({
    openapi: '3.0.3',
    info,
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      ...(componentSchemas ? { schemas: componentSchemas } : {}),
    },
  }, options));
}
