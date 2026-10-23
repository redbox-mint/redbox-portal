/** Prisma owns field decoding; typed pipeline results can still carry a BSON identity. */
export function prismaModelRow<T>(row: Record<string, unknown> | null): T | null {
  if (!row) return null;
  const { _id, ...values } = row;
  return { ...values, id: String(_id) } as T;
}
