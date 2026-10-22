import { PersistenceError } from './errors';

/** Keep native payloads out of domain failures; callback-specific policies stay with their owner. */
export async function domainOperation<T>(
  operation: () => Promise<T>,
  code: string,
  message: string,
  duplicateMessage: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
      throw new PersistenceError('E_UNIQUE', duplicateMessage);
    throw new PersistenceError(code, message);
  }
}
