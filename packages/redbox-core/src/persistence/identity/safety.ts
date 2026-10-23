import { PersistenceError } from '../errors';

const secret = /password|token|secret|salt|cookie|authorization|^x-forwarded-/i;
/** Remove sensitive keys recursively, including JSON-string legacy audit contexts. */
export function safeIdentityValue(value: unknown, context: boolean | string = false): unknown {
  if (Array.isArray(value)) {
    if (typeof context === 'string' && context.toLowerCase() === 'rawheaders') {
      const pairs: unknown[] = [];
      for (let index = 0; index < value.length - 1; index += 2)
        if (typeof value[index] === 'string' && !secret.test(value[index]))
          pairs.push(value[index], safeIdentityValue(value[index + 1]));
      return pairs;
    }
    return value.map(item => safeIdentityValue(item, context));
  }
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, item]) =>
            !secret.test(key) && item !== undefined && typeof item !== 'function' && typeof item !== 'symbol'
        )
        .map(([key, item]) => [key, safeIdentityValue(item, /context|attributes|headers/i.test(key) ? key : false)])
    );
  if (context && typeof value === 'string' && /^\s*[[{]/.test(value)) {
    try {
      return JSON.stringify(safeIdentityValue(JSON.parse(value)));
    } catch {
      return '[REDACTED_UNPARSEABLE_CONTEXT]';
    }
  }
  return value;
}
export async function identityOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Never forward native duplicate errors, query arguments, callback errors or credential values.
    if (
      error instanceof PersistenceError &&
      ['identity-field', 'identity-query', 'identity-value', 'scalar-validation', 'E_TOO_MANY'].includes(error.code)
    )
      throw new PersistenceError(
        error.code,
        error.code === 'identity-field'
          ? 'Declare institution identity fields in the Prisma contract before writing them. Review the stored data and migrate institution extensions before startup;.'
          : 'Identity persistence rejected the operation.'
      );
    throw new PersistenceError(
      'identity-operation',
      'Identity persistence operation failed. Earlier steps may have applied.'
    );
  }
}

export function safeIdentityRow<T>(row: T, entity: string): T {
  if (entity !== 'user' || !row || typeof row !== 'object') return safeIdentityValue(row) as T;
  return safeIdentityValue({ ...row, hasApiKey: Boolean(Reflect.get(row, 'token')) }) as T;
}
