const issuedServiceCreateCapabilities = new WeakSet<object>();
const issuedServiceUpdateCapabilities = new WeakSet<object>();

export interface InternalRecordSchemaCreateAuthorizationCapability {
  readonly kind: 'record-schema-service-create';
}

export interface InternalRecordSchemaUpdateAuthorizationCapability {
  readonly kind: 'record-schema-service-update';
}

/** Issue an unforgeable capability after normal record-create ACL authorization succeeds. */
export function issueInternalRecordSchemaCreateAuthorizationCapability(): InternalRecordSchemaCreateAuthorizationCapability {
  const capability = Object.freeze({ kind: 'record-schema-service-create' as const });
  issuedServiceCreateCapabilities.add(capability);
  return capability;
}

/** Issue an unforgeable, process-local capability after the internal mutation boundary authorizes a service writer. */
export function issueInternalRecordSchemaUpdateAuthorizationCapability(): InternalRecordSchemaUpdateAuthorizationCapability {
  const capability = Object.freeze({ kind: 'record-schema-service-update' as const });
  issuedServiceUpdateCapabilities.add(capability);
  return capability;
}

/** Recognize only create capabilities issued by this module; request-shaped objects are never trusted. */
export function isInternalRecordSchemaCreateAuthorizationCapability(
  value: unknown
): value is InternalRecordSchemaCreateAuthorizationCapability {
  return value !== null && typeof value === 'object' && issuedServiceCreateCapabilities.has(value);
}

/** Recognize only capabilities issued by this module; structurally similar request data is never trusted. */
export function isInternalRecordSchemaUpdateAuthorizationCapability(
  value: unknown
): value is InternalRecordSchemaUpdateAuthorizationCapability {
  return value !== null && typeof value === 'object' && issuedServiceUpdateCapabilities.has(value);
}
