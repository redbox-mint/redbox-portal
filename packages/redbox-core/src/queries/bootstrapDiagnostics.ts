// Bootstrap definitions and native error messages can contain credentials or record data.
// Keep only known diagnostic categories and codes in the operational log.
const ioCodes = new Set(['ENOENT', 'EACCES', 'EPERM', 'EIO', 'ENOTDIR', 'EISDIR']);
const persistenceCodes = new Set(['P2002', 'P2025', 'ECONNREFUSED', 'ETIMEDOUT', '11000']);

export function bootstrapFailureDetails(error: unknown): { category: string; code?: string } {
  if (error instanceof SyntaxError) return { category: 'invalid-json' };
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (ioCodes.has(code)) return { category: 'io', code };
  if (persistenceCodes.has(code)) return { category: 'persistence', code };
  if (error instanceof TypeError) return { category: 'invalid-definition' };
  return { category: 'unexpected' };
}
