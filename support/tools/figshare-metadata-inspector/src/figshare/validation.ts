import { z } from 'zod';
import { FigshareResponseValidationError, extractList } from './FigshareClient';

export function parseResponseList<T>(
  response: unknown,
  endpoint: string,
  schema: z.ZodType<T>
): Array<T & { raw: Record<string, unknown> }> {
  const values = extractList<unknown>(response, endpoint);
  return values.map((value, index) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new FigshareResponseValidationError(endpoint, {
        index,
        issues: parsed.error.issues,
        receivedType: value == null ? String(value) : Array.isArray(value) ? 'array' : typeof value,
        receivedKeys: value != null && typeof value === 'object' ? Object.keys(value) : [],
      });
    }
    return {
      ...parsed.data,
      raw: value as Record<string, unknown>,
    };
  });
}
