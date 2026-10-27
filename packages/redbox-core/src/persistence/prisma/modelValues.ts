import { ObjectId } from 'mongodb';

/** Bridge the existing validated physical codecs to Prisma's string ObjectId inputs. */
export function prismaModelValues(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([field, value]) => [field, value instanceof ObjectId ? value.toHexString() : value])
  );
}
