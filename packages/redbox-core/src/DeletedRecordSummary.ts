/** Safe additive list fields; never infer an original actor from the latest lifecycle operation. */
export function deletedRecordSummary(
  doc: Record<string, unknown>,
  brandId: unknown,
  translate: (key: string) => string
): Record<string, unknown> {
  const snapshot = doc.deletedRecordMetadata as { metaMetadata?: { type?: unknown } } | undefined;
  const recordType = typeof snapshot?.metaMetadata?.type === 'string' ? snapshot.metaMetadata.type : '';
  const key = `${recordType}-title`;
  const label = recordType ? translate(key) : '';
  const actor = doc.deletedBy as { brandId?: unknown; id?: unknown; username?: unknown } | undefined;
  return {
    recordType,
    ...(label && label !== key ? { recordTypeLabel: label } : {}),
    deletedBy:
      actor && String(actor.brandId) === String(brandId)
        ? {
            ...(typeof actor.id === 'string' ? { id: actor.id } : {}),
            ...(typeof actor.username === 'string' ? { username: actor.username } : {}),
          }
        : null,
  };
}
