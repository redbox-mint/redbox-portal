export function buildInvalidNewRecordError(message: string): Error {
  const err = new Error(message);
  (err as unknown as Record<string, unknown>).code = 'E_INVALID_NEW_RECORD';
  return err;
}

export function buildInvalidUpdateRecordError(message: string): Error {
  const err = new Error(message);
  (err as unknown as Record<string, unknown>).code = 'E_INVALID_VALUES_TO_SET';
  return err;
}
