const issuedServiceUpdateCapabilities = new WeakSet<object>();

export interface InternalRecordSchemaUpdateAuthorizationCapability {
  readonly kind: 'record-schema-service-update';
}

/** Issue an unforgeable, process-local capability after the internal mutation boundary authorizes a service writer. */
export function issueInternalRecordSchemaUpdateAuthorizationCapability(): InternalRecordSchemaUpdateAuthorizationCapability {
  const capability = Object.freeze({ kind: 'record-schema-service-update' as const });
  issuedServiceUpdateCapabilities.add(capability);
  return capability;
}

/** Recognize only capabilities issued by this module; structurally similar request data is never trusted. */
export function isInternalRecordSchemaUpdateAuthorizationCapability(
  value: unknown
): value is InternalRecordSchemaUpdateAuthorizationCapability {
  return value !== null && typeof value === 'object' && issuedServiceUpdateCapabilities.has(value);
}
