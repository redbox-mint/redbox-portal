const auditFields = {
  recordaudit: { id: { type: 'string' }, redboxOid: { type: 'string' }, occurredAt: { type: 'string' }, user: { type: 'json' }, record: { type: 'json' }, dateCreated: { type: 'string' }, action: { type: 'string' }, executionSummary: { type: 'json' }, concurrency: { type: 'json' }, createdAt: { type: 'string' }, updatedAt: { type: 'string' } },
  integrationaudit: { id: { type: 'string' }, redboxOid: { type: 'string' }, brandId: { type: 'string' }, integrationName: { type: 'string' }, integrationAction: { type: 'string' }, triggeredBy: { type: 'string' }, status: { type: 'string' }, message: { type: 'string' }, errorDetail: { type: 'string' }, httpStatusCode: { type: 'number' }, traceId: { type: 'string' }, spanId: { type: 'string' }, parentSpanId: { type: 'string' }, startedAt: { type: 'string' }, completedAt: { type: 'string' }, durationMs: { type: 'number' }, requestSummary: { type: 'json' }, responseSummary: { type: 'json' }, dateCreated: { type: 'string' }, createdAt: { type: 'string' }, updatedAt: { type: 'string' } }
};
/** Declared scalar types used by audit write normalization. */
export function storageAuditFields(collection: 'recordaudit' | 'integrationaudit'): Readonly<Record<string, { readonly type: string }>> {
  return auditFields[collection];
}
