import {
  RECORD_SCHEMA_CREATE_RESOLVER_ROUTE_TEMPLATE,
  RECORD_SCHEMA_ETAG_RESPONSE_HEADER,
  RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
  RECORD_SCHEMA_REVALIDATION_REQUEST_HEADER,
  RECORD_SCHEMA_UPDATE_RESOLVER_ROUTE_TEMPLATE,
} from './record-schema-response';
import { RECORD_SCHEMA_WRITE_PRECONDITION_HEADER } from './schemas/common';

export const RECORD_SCHEMA_RESOLVER_OPENAPI_EXTENSION = 'x-redbox-record-schema-resolver' as const;

type RecordSchemaKind = 'create' | 'update';

interface RecordSchemaResolverEtagSemantics {
  readonly format: '"sha256:<64-lowercase-hex>"';
  readonly responseHeader: typeof RECORD_SCHEMA_ETAG_RESPONSE_HEADER;
  readonly revalidationRequestHeader: typeof RECORD_SCHEMA_REVALIDATION_REQUEST_HEADER;
  readonly notModifiedStatus: 304;
  readonly authorizationRequiredForRevalidation: true;
}

interface UpdateRecordSchemaResolverEtagSemantics extends RecordSchemaResolverEtagSemantics {
  readonly recordWritePreconditionRequestHeader: typeof RECORD_SCHEMA_WRITE_PRECONDITION_HEADER;
  readonly recordWritePreconditionRequired: false;
  readonly preconditionFailedStatus: 412;
  readonly comparison: 'current-resolved-full-document';
}

interface RecordSchemaResolverDescription {
  readonly routeTemplate:
    | typeof RECORD_SCHEMA_CREATE_RESOLVER_ROUTE_TEMPLATE
    | typeof RECORD_SCHEMA_UPDATE_RESOLVER_ROUTE_TEMPLATE;
  readonly schemaKind: RecordSchemaKind;
  readonly operationParameter: {
    readonly name: 'operation';
    readonly in: 'query';
    readonly required: false;
  };
  readonly mediaType: typeof RECORD_SCHEMA_RESPONSE_MEDIA_TYPE;
  readonly etag: RecordSchemaResolverEtagSemantics | UpdateRecordSchemaResolverEtagSemantics;
}

export interface RecordSchemaResolverOpenApiExtension {
  readonly [key: string]: unknown;
  readonly 'x-redbox-record-schema-resolver': RecordSchemaResolverDescription;
}

/** Static resolver metadata only; caller-effective form schemas stay behind the resolver route. */
export function recordSchemaResolverOpenApiExtension(
  schemaKind: RecordSchemaKind
): RecordSchemaResolverOpenApiExtension {
  const routeTemplate =
    schemaKind === 'create'
      ? RECORD_SCHEMA_CREATE_RESOLVER_ROUTE_TEMPLATE
      : RECORD_SCHEMA_UPDATE_RESOLVER_ROUTE_TEMPLATE;
  const etag: RecordSchemaResolverEtagSemantics | UpdateRecordSchemaResolverEtagSemantics = {
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
  };

  return {
    [RECORD_SCHEMA_RESOLVER_OPENAPI_EXTENSION]: {
      routeTemplate,
      schemaKind,
      operationParameter: { name: 'operation', in: 'query', required: false },
      mediaType: RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
      etag,
    },
  };
}
