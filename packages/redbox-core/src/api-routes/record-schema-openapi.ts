import {
  RECORD_SCHEMA_CREATE_RESOLVER_ROUTE_TEMPLATE,
  RECORD_SCHEMA_ETAG_RESPONSE_HEADER,
  RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
  RECORD_SCHEMA_REVALIDATION_REQUEST_HEADER,
  RECORD_SCHEMA_UPDATE_RESOLVER_ROUTE_TEMPLATE,
} from './record-schema-response';
import { RECORD_SCHEMA_WRITE_PRECONDITION_HEADER } from './schemas/common';

export const RECORD_SCHEMA_RESOLVER_OPENAPI_EXTENSION = 'x-redbox-record-schema-resolver' as const;

/** Static resolver metadata only; caller-effective form schemas stay behind the resolver route. */
export function recordSchemaResolverOpenApiExtension(schemaKind: 'create' | 'update') {
  const routeTemplate =
    schemaKind === 'create'
      ? RECORD_SCHEMA_CREATE_RESOLVER_ROUTE_TEMPLATE
      : RECORD_SCHEMA_UPDATE_RESOLVER_ROUTE_TEMPLATE;
  const etag = {
    format: '"sha256:<64-lowercase-hex>"',
    responseHeader: RECORD_SCHEMA_ETAG_RESPONSE_HEADER,
    revalidationRequestHeader: RECORD_SCHEMA_REVALIDATION_REQUEST_HEADER,
    notModifiedStatus: 304,
    authorizationRequiredForRevalidation: true,
    ...(schemaKind === 'update'
      ? {
          recordWritePreconditionRequestHeader: RECORD_SCHEMA_WRITE_PRECONDITION_HEADER,
          recordWritePreconditionRequired: false,
          preconditionFailedStatus: 412,
          comparison: 'current-resolved-full-document' as const,
        }
      : {}),
  } as const;

  return {
    [RECORD_SCHEMA_RESOLVER_OPENAPI_EXTENSION]: {
      routeTemplate,
      schemaKind,
      operationParameter: { name: 'operation', in: 'query', required: false },
      mediaType: RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
      etag,
    },
  } as const;
}
