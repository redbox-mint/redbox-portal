const issuedServiceCapabilities = new WeakSet<object>();

export interface InternalRecordSchemaAuthorizationCapability {
  readonly kind: 'record-schema-service';
}

/** Issue an unforgeable capability after the normal record-write boundary authorizes the operation. */
export function issueInternalRecordSchemaAuthorizationCapability(): InternalRecordSchemaAuthorizationCapability {
  const capability = Object.freeze({ kind: 'record-schema-service' as const });
  issuedServiceCapabilities.add(capability);
  return capability;
}

/** Recognize only capabilities issued by this module; request-shaped objects are never trusted. */
export function isInternalRecordSchemaAuthorizationCapability(
  value: unknown
): value is InternalRecordSchemaAuthorizationCapability {
  return value !== null && typeof value === 'object' && issuedServiceCapabilities.has(value);
}
